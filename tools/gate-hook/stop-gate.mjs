#!/usr/bin/env node
//  stop-gate — 終端ゲートの機械強制（Claude Code の Stop フック）
//
//  gate-hook（PreToolUse）が「書く前」を止めるのに対し、本フックは「終わる前」を止める。
//  AI がターンを終えようとした瞬間に host の検証一式を走らせ、通らなければ exit 2 で
//  終了をブロックし、失敗した検査の末尾ログを stderr で AI に差し戻す。
//
//  検査の並び、level（lint / fast / full）、monorepo の unit ごとの実行は suite.mjs が正本（CI・手元から呼ぶ verify.mjs と同じ）。
//  コマンドは設定（harness.config.json）に宣言されたものしか実行しない。推測・発明はしない。
//
//  Stop フックの入出力（Claude Code の契約）:
//    stdin  JSON: session_id / cwd / hook_event_name:"Stop" / stop_hook_active / stop_reason
//    exit 0 = 終了を許可（stdout は文脈として表示。JSON の systemMessage は利用者に表示される）
//    exit 2 = 終了をブロック（stderr が「続ける理由」として AI に渡る）
//    その他 = 非ブロッキングエラー
//
//  収束制御（無限ループ防止）:
//    - 変更検出: git の HEAD + status + diff、未追跡ファイルの中身、harness.config.json、使う harness ツールの
//      ハッシュが最終合格時と同じなら再検査しない（skip）。
//    - ラウンド上限: stop_hook_active（既にフックで継続中）かつ rounds >= --max-rounds なら
//      ブロックせず人間へ手渡す（release。systemMessage で利用者に表示）。前のラウンドから進んでいない場合（直前に落ちた検査が今回もすべて落ちている、
//      または落ちる検査の組が前のものへ戻った）も同様（--max-rounds を 3 以上にしたとき、上限を待たずに渡す）。
//    状態は <ログと同じディレクトリ>/state.json に持つ（既定 .harness-gate/state.json。gate-hook が agent の書き込みを止める）。
//
//  fail-open / fail-closed の境界:
//    - 検査そのものの不通過 → ブロック（exit 2）。ゲートの存在意義。
//    - stdin が読めない → 許可（exit 0）。フックの入口の不具合でセッションを壊さない。
//    - stdin を読めた後のフック自身の例外 → ブロック（exit 2）。判定できないまま通すとゲートが無いのと同じ。
//      ただし stop_hook_active でラウンド上限に達していれば、ラウンド上限と同じく解放する（無限ループを避ける）。
//
//  使い方（settings.local.json の Stop フックとして。README.md を参照）:
//    node tools/gate-hook/stop-gate.mjs [--level lint|fast|full] [--unit <名前>]... [--docs docs] [--config harness.config.json]
//         [--log .harness-gate/log.jsonl] [--max-rounds 2] [--timeout 300] [--tail 15] [--force]
//  環境変数 STOP_GATE_TOOLS_DIR は同梱ツールの探索先（<self dir>/..）を差し替える（テスト用）。

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { appendLog, defaultLogPath } from "./gate-log.mjs";
import { CONFIG_FILE } from "../_shared/config.mjs";
import { LEVELS, TOOL_SCRIPTS, readConfig, runSuite, tailLines, unitsOf } from "./suite.mjs";

const USAGE =
	"usage: stop-gate.mjs [--level lint|fast|full] [--unit <名前>]... [--docs docs] [--config harness.config.json] [--log <path>] [--max-rounds 2] [--timeout 300] [--tail 15] [--force]";


//  ---- 引数 ----------------------------------------------------------------

function parseArgs(argv) {
	const opts = { docs: "docs", config: CONFIG_FILE, log: null, maxRounds: 2, timeout: 300, tail: 15, force: false, level: "full", only: [] };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--docs") opts.docs = argv[++i];
		else if (a === "--config") opts.config = argv[++i];
		else if (a === "--log") opts.log = argv[++i];
		else if (a === "--max-rounds") opts.maxRounds = Number(argv[++i]);
		else if (a === "--timeout") opts.timeout = Number(argv[++i]);
		else if (a === "--tail") opts.tail = Number(argv[++i]);
		else if (a === "--force") opts.force = true;
		else if (a === "--level") opts.level = argv[++i];
		else if (a === "--ignore-legacy-layout") opts.ignoreLegacyLayout = true;
		else if (a === "--unit") opts.only.push(argv[++i]);
		else {
			console.error(`stop-gate: 不明な引数 ${a}\n${USAGE}`);
			process.exit(2);
		}
	}
	if (!LEVELS.includes(opts.level) || opts.only.some((u) => typeof u !== "string" || !u)) {
		console.error(`stop-gate: --level は ${LEVELS.join(" / ")}、--unit は unit の名前\n${USAGE}`);
		process.exit(2);
	}
	for (const k of ["maxRounds", "timeout", "tail"])
		if (!Number.isInteger(opts[k]) || opts[k] < 0) {
			console.error(`stop-gate: --${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())} は 0 以上の整数\n${USAGE}`);
			process.exit(2);
		}
	return opts;
}

//  ---- 状態 / ログ -----------------------------------------------------------

const emptySession = (id) => ({ id: id ?? null, rounds: 0, last_failures: [], history: [] });

function loadState(path) {
	try {
		const s = JSON.parse(readFileSync(path, "utf8"));
		return { last_pass: s.last_pass ?? null, session: { ...emptySession(null), ...(s.session ?? {}) } };
	} catch {
		return { last_pass: null, session: emptySession(null) };
	}
}

function saveState(path, state) {
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
}

function makeLogger(logPath, session, startedAt) {
	return (decision, reason, extra = {}) =>
		appendLog(logPath, {
			ts: new Date().toISOString(),
			hook: "stop-gate",
			event: "Stop",
			session,
			decision,
			reason,
			target: null,
			uc: null,
			round: extra.round ?? null,
			failures: extra.failures ?? null,
			ms: Date.now() - startedAt,
		});
}

//  ラウンド上限で人間へ手渡す。stdout は JSON だけにする（Claude Code が systemMessage を利用者に表示する）
function release(why, s, log, opts) {
	const failures = s.last_failures.join(", ") || "なし";
	const message = `[stop-gate] 終端ゲートが通らないまま解放した（${s.rounds} ラウンド連続で不通過、上限 ${opts.maxRounds}。${why === "non-decreasing" ? "前のラウンドから進んでいない。" : ""}残りは人間の裁定へ）。失敗: ${failures}`;
	process.stdout.write(JSON.stringify({ systemMessage: message }) + "\n");
	log("release", why, { round: s.rounds, failures: s.last_failures });
}

//  ---- 変更検出（git） -------------------------------------------------------


function hashFile(h, label, path) {
	h.update("\0" + label + "\0");
	try {
		h.update(readFileSync(path));
	} catch {
		h.update("<なし>");
	}
}

//  使う harness ツール（検査器が変われば同じツリーでも結果が変わる）
function toolFiles(toolsDir) {
	const files = TOOL_SCRIPTS.map((p) => join(toolsDir, p));
	const shared = join(toolsDir, "_shared");
	if (existsSync(shared))
		for (const n of readdirSync(shared).sort()) if (n.endsWith(".mjs")) files.push(join(shared, n));
	return files;
}

//  HEAD + 作業ツリーの状態 + 差分 + 未追跡ファイルの中身 + 設定 + harness ツールをハッシュ。
//  git が使えない / 失敗 → null（常に検査する）。
//  ゲート自身の状態ディレクトリ（untracked で現れる）は除外しないと、初回合格で指紋が変わってしまう。
function fingerprint(root, stateDir, configFiles, toolsDir, scope) {
	const git = (args, encoding = "utf8") => spawnSync("git", ["-C", root, ...args], { encoding, maxBuffer: 256 * 1024 * 1024 });
	const rel = relative(root, stateDir).split(sep).join("/");
	const excludeSelf = rel && !rel.startsWith("..") ? [`:(exclude)${rel}`] : [];

	const head = git(["rev-parse", "HEAD"]);
	const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ".", ...excludeSelf]);
	const diff = git(["diff", "HEAD", "--no-color", "--", ".", ...excludeSelf]);
	const untracked = git(["ls-files", "-o", "--exclude-standard", "-z", "--", ".", ...excludeSelf]);
	for (const r of [head, status, diff, untracked]) if (r.error || r.status !== 0) return null;

	//  どこまで検査したか（level と unit の絞り込み）が違えば、同じツリーでも別の合格として扱う
	const h = createHash("sha256").update(scope).update("\0").update(head.stdout).update("\0").update(status.stdout).update("\0").update(diff.stdout);
	//  未追跡ファイルは名前しか status に出ない。中身が変わっても指紋が変わるように中身を入れる
	for (const p of untracked.stdout.split("\0").filter(Boolean).sort()) hashFile(h, `untracked:${p}`, join(root, p));
	//  harness.config.json は ignore されていても、リポジトリの外（--config）でも検査の範囲を決める
	for (const p of configFiles) hashFile(h, `config:${p}`, p);
	for (const p of toolFiles(toolsDir)) hashFile(h, `tool:${relative(toolsDir, p)}`, p);
	return h.digest("hex");
}

//  ---- 本体 ----------------------------------------------------------------

async function main() {
	const startedAt = Date.now();
	const opts = parseArgs(process.argv.slice(2));

	//  1. stdin（読めなければ fail-open）
	let payload;
	try {
		payload = JSON.parse(readFileSync(0, "utf8"));
		if (!payload || typeof payload !== "object") throw new Error("not an object");
	} catch {
		const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
		const logPath = opts.log ? resolve(root, opts.log) : defaultLogPath(root);
		makeLogger(logPath, null, startedAt)("skip", "internal-error");
		return 0;
	}

	//  3. root / ログ / 状態ファイル（2 の判定より先に置き場を決める）
	const root = process.env.CLAUDE_PROJECT_DIR || payload.cwd || process.cwd();
	const logPath = opts.log ? resolve(root, opts.log) : defaultLogPath(root);
	const stateDir = dirname(logPath);
	const statePath = join(stateDir, "state.json");
	const session = payload.session_id ?? null;
	const log = makeLogger(logPath, session, startedAt);

	//  2. Stop 以外（SubagentStop 等）は対象外
	if (payload.hook_event_name !== "Stop") {
		log("skip", "wrong-event");
		return 0;
	}

	try {
		const state = loadState(statePath);
		const toolsDir = process.env.STOP_GATE_TOOLS_DIR || join(dirname(fileURLToPath(import.meta.url)), "..");
		const configPath = resolve(root, opts.config);
		const loaded = readConfig(configPath);
		const units = unitsOf(loaded.cfg);
		const configFiles = [configPath, ...(units ? Object.values(units).filter((d) => typeof d === "string").map((d) => resolve(root, d, CONFIG_FILE)) : [])];

		//  4. 変更検出: 最終合格と同じツリー・設定・検査器なら再検査しない
		const fp = fingerprint(root, stateDir, configFiles, toolsDir, JSON.stringify([opts.level, [...new Set(opts.only)].sort(), !!opts.ignoreLegacyLayout, opts.docs]));
		if (!opts.force && fp && state.last_pass?.fingerprint === fp) {
			console.log(`[stop-gate] 変更なし（最終合格 ${state.last_pass.ts}）`);
			log("skip", "no-changes");
			return 0;
		}

		//  5. ラウンド制御（セッションが変わればリセット）
		if (state.session.id !== session) state.session = emptySession(session);
		const s = state.session;
		if (payload.stop_hook_active === true) {
			const h = s.history;
			//  前へ進んでいなければ、同じことを繰り返しても通らない。上限を待たずに人間へ渡す。進んでいないのは次の 2 つ。
			//    - 直前のラウンドで落ちた検査が、今回もすべて落ちている（同じか、落ちる検査が増えた）
			//    - 落ちる検査の組が、前に出たものへ戻った（直しては壊す往復）
			//  件数では比べない（型検査を直して次の lint で落ちた、という前進も、件数は 1 件のまま変わらないため）
			const names = (r) => new Set(r.map((n) => n.replace(/^timeout:/, "")));
			const key = (r) => [...names(r)].sort().join("\0");
			const stuck = (prev, now) => [...names(prev)].every((n) => names(now).has(n));
			const nonDecreasing = h.length >= 2 && (stuck(h.at(-2), h.at(-1)) || h.slice(0, -1).some((r) => key(r) === key(h.at(-1))));
			const cap = s.rounds >= opts.maxRounds;
			if (cap || nonDecreasing) {
				release(cap ? "round-cap" : "non-decreasing", s, log, opts);
				state.session = emptySession(session); //  次のターンはまた round 1 から
				saveState(statePath, state);
				return 0;
			}
		}

		//  6. 検査
		const { failures, skipped, notes, ran } = await runSuite(root, opts, toolsDir, configPath, loaded);

		//  7. 全部通過
		if (failures.length === 0) {
			state.last_pass = { fingerprint: fp, ts: new Date().toISOString() };
			state.session = emptySession(session);
			saveState(statePath, state);
			for (const n of notes) console.log(n);
			console.log(`[stop-gate] 終端ゲート通過（${ran} 検査、skip: ${skipped.join(", ") || "なし"}）`);
			log("pass", "ok");
			return 0;
		}

		//  8. 不通過 → ブロック
		const names = failures.map((f) => f.name);
		s.rounds++;
		s.last_failures = names;
		s.history.push(names);
		saveState(statePath, state);
		for (const n of notes) console.log(n);

		const out = [`[stop-gate] 終端ゲート不通過（round ${s.rounds}/${opts.maxRounds}）: 失敗 = ${names.join(", ")}`];
		for (const f of failures) {
			const how = f.config ? "設定" : f.timedOut ? `timeout ${opts.timeout}s` : `exit ${f.code ?? `signal ${f.signal}`}`;
			out.push(`  ${f.name}: ${how}`);
			for (const l of tailLines(f.output, opts.tail)) out.push(`    ${l}`);
		}
		out.push(
			"直せる失敗は直し、修正範囲を再検証してから終了すること。人間ゲート待ちや後続の担当の成果物でしか直せない失敗は、未達として報告して終える。" +
				"設定（harness.config.json）を緩めて（none にする、範囲を狭める）通さない。機械判定できない指摘は docs/verification/DEFERRED.md に記録し、機械判定できるものは保留にしない。",
		);
		process.stderr.write(out.join("\n") + "\n");
		log("block", names[0], { round: s.rounds, failures: names });
		return 2;
	} catch (e) {
		//  stdin を読めた後のフック自身の不具合 → fail-closed。ただし継続中でラウンド上限に達していれば解放する
		return internalError(e, payload, opts, statePath, session, log);
	}
}

function internalError(e, payload, opts, statePath, session, log) {
	const reason = `${e?.message ?? e}`;
	try {
		const state = loadState(statePath);
		if (state.session.id !== session) state.session = emptySession(session);
		const s = state.session;
		if (payload.stop_hook_active === true && s.rounds >= opts.maxRounds) {
			release("round-cap", s, log, opts);
			state.session = emptySession(session);
			saveState(statePath, state);
			return 0;
		}
		s.rounds++;
		s.last_failures = ["internal-error"];
		s.history.push(["internal-error"]);
		saveState(statePath, state);
		process.stderr.write(
			`[stop-gate] 内部エラーのため終端ゲートを判定できない（round ${s.rounds}/${opts.maxRounds}）: ${reason}\n` +
				"stop-gate を動かせる状態（.harness-gate/ の権限、git、node）を直せるなら直す。直せなければ未達として報告して終える。\n",
		);
		log("block", "internal-error", { round: s.rounds, failures: ["internal-error"] });
		return 2;
	} catch (e2) {
		//  状態も保存できない（ラウンドを数えられない）。継続中なら解放しないと止まらなくなる
		if (payload.stop_hook_active === true) {
			process.stdout.write(
				JSON.stringify({ systemMessage: `[stop-gate] 終端ゲートが通らないまま解放した（内部エラーで判定できず、状態も保存できない）。失敗: internal-error（${reason}）` }) + "\n",
			);
			log("release", "internal-error", { failures: ["internal-error"] });
			return 0;
		}
		process.stderr.write(`[stop-gate] 内部エラーのため終端ゲートを判定できない: ${reason}（状態の保存にも失敗: ${e2?.message ?? e2}）\n`);
		log("block", "internal-error", { failures: ["internal-error"] });
		return 2;
	}
}

process.exit(await main());
