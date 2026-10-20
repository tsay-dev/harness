#!/usr/bin/env node
//  stop-gate — 終端ゲートの機械強制（Claude Code の Stop フック）
//
//  gate-hook（PreToolUse）が「書く前」を止めるのに対し、本フックは「終わる前」を止める。
//  AI がターンを終えようとした瞬間に host の検証一式を走らせ、通らなければ exit 2 で
//  終了をブロックし、失敗した検査の末尾ログを stderr で AI に差し戻す。
//
//  検査の順序（1–3 は全部走らせて失敗を集める。4 は最初の失敗で止める）:
//    1. spec-lint validate            docs SSOT のフォーマット / ライフサイクル
//    2. trace-check                   トレーサビリティ（traceconfig.json が無ければ失敗。省略できない / ADR-0056）
//    3. contract-run                  契約例の実行検査（実行する実例があるのにアダプタが無ければ contract-run 自身が失敗にする）
//    4. commands.typecheck → lint → test（traceconfig.json の commands ブロックから）
//    5. commands.system                シナリオテスト（system suite）全件。4 が全部通ったあとに 1 回（ADR-0035）
//  commands の typecheck / lint / test / system は、文字列のコマンドか { "none": "<理由>" } の宣言が必須で、
//  欠落は失敗の 1 項目（黙った skip を作らない）。none は理由を表示して skip。tests を宣言しているなら test は none にできない。
//  コマンドは traceconfig.json に宣言されたものしか走らせない。推測・発明はしない。
//
//  monorepo（traceconfig.json の git.units = { 単位名: ディレクトリ }）:
//    ルートでは 1–3 を実行せず、unit ごとに <dir>/traceconfig.json と <dir>/docs で実行する。
//    docs も traceconfig も持たない unit は「docs なし」と表示するだけ。docs を持つのに traceconfig が無い unit は失敗。
//    commands はルートの traceconfig.json のものを使う。
//
//  Stop フックの入出力（Claude Code の契約）:
//    stdin  JSON: session_id / cwd / hook_event_name:"Stop" / stop_hook_active / stop_reason
//    exit 0 = 終了を許可（stdout は文脈として表示。JSON の systemMessage は利用者に表示される）
//    exit 2 = 終了をブロック（stderr が「続ける理由」として AI に渡る）
//    その他 = 非ブロッキングエラー
//
//  収束制御（無限ループ防止）:
//    - 変更検出: git の HEAD + status + diff、未追跡ファイルの中身、traceconfig.json、使う harness ツールの
//      ハッシュが最終合格時と同じなら再検査しない（skip）。
//    - ラウンド上限: stop_hook_active（既にフックで継続中）かつ rounds >= --max-rounds なら
//      ブロックせず人間へ手渡す（release。systemMessage で利用者に表示）。失敗集合が 2 回連続で縮まらない場合も同様。
//    状態は <ログと同じディレクトリ>/state.json に持つ（既定 .harness-gate/state.json。gate-hook が agent の書き込みを止める）。
//
//  fail-open / fail-closed の境界:
//    - 検査そのものの不通過 → ブロック（exit 2）。ゲートの存在意義。
//    - stdin が読めない → 許可（exit 0）。フックの入口の不具合でセッションを壊さない。
//    - stdin を読めた後のフック自身の例外 → ブロック（exit 2）。判定できないまま通すとゲートが無いのと同じ。
//      ただし stop_hook_active でラウンド上限に達していれば、ラウンド上限と同じく解放する（無限ループを避ける）。
//
//  使い方（settings.local.json の Stop フックとして。README.md を参照）:
//    node tools/gate-hook/stop-gate.mjs [--docs docs] [--config traceconfig.json]
//         [--log .harness-gate/log.jsonl] [--max-rounds 2] [--timeout 300] [--tail 15] [--force]
//  環境変数 STOP_GATE_TOOLS_DIR は同梱ツールの探索先（<self dir>/..）を差し替える（テスト用）。

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { appendLog, defaultLogPath } from "./gate-log.mjs";

const USAGE =
	"usage: stop-gate.mjs [--docs docs] [--config traceconfig.json] [--log <path>] [--max-rounds 2] [--timeout 300] [--tail 15] [--force]";

const COMMAND_KEYS = ["typecheck", "lint", "test", "system"];

//  ---- 引数 ----------------------------------------------------------------

function parseArgs(argv) {
	const opts = { docs: "docs", config: "traceconfig.json", log: null, maxRounds: 2, timeout: 300, tail: 15, force: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--docs") opts.docs = argv[++i];
		else if (a === "--config") opts.config = argv[++i];
		else if (a === "--log") opts.log = argv[++i];
		else if (a === "--max-rounds") opts.maxRounds = Number(argv[++i]);
		else if (a === "--timeout") opts.timeout = Number(argv[++i]);
		else if (a === "--tail") opts.tail = Number(argv[++i]);
		else if (a === "--force") opts.force = true;
		else {
			console.error(`stop-gate: 不明な引数 ${a}\n${USAGE}`);
			process.exit(2);
		}
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
	const message = `[stop-gate] 終端ゲートが通らないまま解放した（${s.rounds} ラウンド連続で不通過、上限 ${opts.maxRounds}。${why === "non-decreasing" ? "失敗が減らない。" : ""}残りは人間の裁定へ）。失敗: ${failures}`;
	process.stdout.write(JSON.stringify({ systemMessage: message }) + "\n");
	log("release", why, { round: s.rounds, failures: s.last_failures });
}

//  ---- traceconfig.json --------------------------------------------------------

//  読めなければ { error }。無ければ { missing: true }
function readConfig(path) {
	if (!existsSync(path)) return { missing: true };
	try {
		const cfg = JSON.parse(readFileSync(path, "utf8"));
		if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) return { error: `${path}: 最上位が JSON のオブジェクトでない` };
		return { cfg };
	} catch (e) {
		return { error: `${path}: JSON として読めない（${e.message}）` };
	}
}

//  git.units（{ 単位名: ディレクトリ }）。無ければ null
function unitsOf(cfg) {
	const u = cfg?.git?.units;
	return u && typeof u === "object" && !Array.isArray(u) && Object.keys(u).length > 0 ? u : null;
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
	const files = ["spec-lint/spec-lint.mjs", "trace-check/trace-check.mjs", "contract-run/contract-run.mjs"].map((p) => join(toolsDir, p));
	const shared = join(toolsDir, "_shared");
	if (existsSync(shared))
		for (const n of readdirSync(shared).sort()) if (n.endsWith(".mjs")) files.push(join(shared, n));
	return files;
}

//  HEAD + 作業ツリーの状態 + 差分 + 未追跡ファイルの中身 + 設定 + harness ツールをハッシュ。
//  git が使えない / 失敗 → null（常に検査する）。
//  ゲート自身の状態ディレクトリ（untracked で現れる）は除外しないと、初回合格で指紋が変わってしまう。
function fingerprint(root, stateDir, configFiles, toolsDir) {
	const git = (args, encoding = "utf8") => spawnSync("git", ["-C", root, ...args], { encoding, maxBuffer: 256 * 1024 * 1024 });
	const rel = relative(root, stateDir).split(sep).join("/");
	const excludeSelf = rel && !rel.startsWith("..") ? [`:(exclude)${rel}`] : [];

	const head = git(["rev-parse", "HEAD"]);
	const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ".", ...excludeSelf]);
	const diff = git(["diff", "HEAD", "--no-color", "--", ".", ...excludeSelf]);
	const untracked = git(["ls-files", "-o", "--exclude-standard", "-z", "--", ".", ...excludeSelf]);
	for (const r of [head, status, diff, untracked]) if (r.error || r.status !== 0) return null;

	const h = createHash("sha256").update(head.stdout).update("\0").update(status.stdout).update("\0").update(diff.stdout);
	//  未追跡ファイルは名前しか status に出ない。中身が変わっても指紋が変わるように中身を入れる
	for (const p of untracked.stdout.split("\0").filter(Boolean).sort()) hashFile(h, `untracked:${p}`, join(root, p));
	//  traceconfig.json は ignore されていても、リポジトリの外（--config）でも検査の範囲を決める
	for (const p of configFiles) hashFile(h, `config:${p}`, p);
	for (const p of toolFiles(toolsDir)) hashFile(h, `tool:${relative(toolsDir, p)}`, p);
	return h.digest("hex");
}

//  ---- 検査の実行 ------------------------------------------------------------

//  1 ステップ実行。戻り: { name, ok, code, signal, timedOut, output }
function runStep(name, cmd, root, timeoutSec) {
	const r = spawnSync(cmd, { cwd: root, shell: true, timeout: timeoutSec * 1000, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
	const timedOut = r.error?.code === "ETIMEDOUT" || !!r.signal;
	const output = (r.stdout ?? "") + (r.stderr ?? "") + (r.error && !timedOut ? `\n${r.error.message}` : "");
	return { name: timedOut ? `timeout:${name}` : name, ok: !timedOut && r.status === 0, code: r.status, signal: r.signal, timedOut, output };
}

//  実行せずに失敗にする項目（設定の誤り・欠落）
const configFailure = (name, output) => ({ name, ok: false, code: null, signal: null, timedOut: false, config: true, output });

const tailLines = (text, n) => {
	const lines = text.replace(/\s+$/, "").split(/\r?\n/);
	return lines.slice(Math.max(0, lines.length - n));
};

const isNone = (v) => v && typeof v === "object" && !Array.isArray(v) && "none" in v;

//  tests が none でなく宣言されているか
const declaresTests = (cfg) => cfg && cfg.tests !== undefined && !isNone(cfg.tests);

//  commands の宣言を検査する。戻り: { k: { cmd } | { none: 理由 } | { error } }
function readCommands(cfg, testsDeclared) {
	const commands = cfg.commands;
	const out = {};
	for (const k of COMMAND_KEYS) {
		const v = commands && typeof commands === "object" && !Array.isArray(commands) ? commands[k] : undefined;
		if (v === undefined) out[k] = { error: `commands.${k} が宣言されていない（無いなら none に理由を書く: "${k}": { "none": "<理由>" }）` };
		else if (typeof v === "string" && v.trim()) out[k] = { cmd: v };
		else if (isNone(v)) {
			if (typeof v.none !== "string" || !v.none.trim()) out[k] = { error: `commands.${k} の none に理由が無い（{ "none": "<理由>" }）` };
			else if (k === "test" && testsDeclared)
				out[k] = { error: `commands.test は none にできない（traceconfig.json が tests を宣言している。テストがあるなら実行するコマンドを書く）` };
			else out[k] = { none: v.none };
		} else out[k] = { error: `commands.${k} は文字列のコマンドか { "none": "<理由>" }（実際: ${JSON.stringify(v)}）` };
	}
	return out;
}

function runSuite(root, opts, toolsDir, configPath, loaded) {
	const q = (p) => `"${p.replace(/"/g, '\\"')}"`;
	const failures = [];
	const skipped = [];
	//  stdout への表示は判定が終わってから出す（解放時の stdout は systemMessage の JSON だけにするため）
	const notes = [];
	let ran = 0;
	const run = (name, cmd) => {
		ran++;
		const r = runStep(name, cmd, root, opts.timeout);
		if (!r.ok) failures.push(r);
		return r.ok;
	};
	const fail = (name, output) => {
		ran++;
		failures.push(configFailure(name, output));
	};
	const skip = (name, why) => {
		skipped.push(name);
		notes.push(`[stop-gate] skip: ${why}`);
	};
	const tool = (name) => q(join(toolsDir, name, `${name}.mjs`));

	//  1–3 を 1 組の docs / traceconfig に対して走らせる（失敗を集める）
	const checkDocs = (label, unitRoot, docsDir, cfgPath) => {
		run(`spec-lint${label}`, `node ${tool("spec-lint")} validate --docs ${q(docsDir)}`);
		run(`trace-check${label}`, `node ${tool("trace-check")} --root ${q(unitRoot)} --config ${q(cfgPath)}`);
		run(`contract-run${label}`, `node ${tool("contract-run")} --root ${q(unitRoot)} --config ${q(cfgPath)} --docs ${q(docsDir)}`);
	};

	const { cfg } = loaded;
	const units = unitsOf(cfg);
	if (loaded.missing) {
		//  traceconfig.json が無いことは「検査しない理由」ではなく失敗（紐づきの検査は黙って省かない / ADR-0056）
		run("spec-lint", `node ${tool("spec-lint")} validate --docs ${q(opts.docs)}`);
		fail(
			"trace-check",
			"traceconfig.json が無い。紐づきの検査は省略できない（ADR-0056）。templates/develop/traceconfig.json から置き、対象が無い範囲は { \"none\": \"<理由>\" } と宣言する",
		);
		return { failures, skipped, notes, ran };
	}
	if (loaded.error) {
		run("spec-lint", `node ${tool("spec-lint")} validate --docs ${q(opts.docs)}`);
		fail("traceconfig", `${loaded.error}。traceconfig.json を直す（検査の範囲とコマンドを読めないので、紐づきの検査と commands を実行できない）`);
		return { failures, skipped, notes, ran };
	}

	let testsDeclared = declaresTests(cfg);
	if (units) {
		//  monorepo: 紐づきの宣言は unit 側が持つ。ルートでは 1–3 を実行しない
		for (const [name, dir] of Object.entries(units)) {
			if (typeof dir !== "string" || !dir.trim()) {
				fail(`traceconfig:${name}`, `git.units.${name} の値がディレクトリの文字列でない（実際: ${JSON.stringify(dir)}）`);
				continue;
			}
			const unitRoot = resolve(root, dir);
			const unitDocs = join(unitRoot, "docs");
			const unitCfg = join(unitRoot, "traceconfig.json");
			const hasDocs = existsSync(unitDocs);
			if (!existsSync(unitCfg)) {
				if (hasDocs)
					fail(
						`trace-check:${name}`,
						`unit ${name}（${dir}）は docs を持つのに ${dir}/traceconfig.json が無い。紐づきの検査は省略できない（ADR-0056）。templates/develop/traceconfig.json から置く`,
					);
				else notes.push(`[stop-gate] unit ${name}（${dir}）: docs なし`);
				continue;
			}
			const u = readConfig(unitCfg);
			if (u.cfg && declaresTests(u.cfg)) testsDeclared = true;
			checkDocs(`:${name}`, unitRoot, unitDocs, unitCfg);
		}
	} else checkDocs("", root, resolve(root, opts.docs), configPath);

	//  4–5: commands の宣言（欠落・型の誤りは失敗）と実行。実行は最初の失敗で止める（型が通らないのに test を回しても意味がない。
	//  system はブラウザ / シミュレータを起動する最も重い検査なので最後に置き、default suite が赤なら走らせない）
	const commands = readCommands(cfg, testsDeclared);
	for (const k of COMMAND_KEYS) if (commands[k].error) fail(`commands.${k}`, commands[k].error);
	for (const k of COMMAND_KEYS) {
		const c = commands[k];
		if (c.error) break; //  順序に意味がある（test の前提が欠けたまま後続を走らせない）
		if (c.none !== undefined) {
			skip(k, `commands.${k} = none（${c.none}）`);
			continue;
		}
		if (!run(k, c.cmd)) break;
	}
	return { failures, skipped, notes, ran };
}

//  ---- 本体 ----------------------------------------------------------------

function main() {
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
		const configFiles = [configPath, ...(units ? Object.values(units).filter((d) => typeof d === "string").map((d) => resolve(root, d, "traceconfig.json")) : [])];

		//  4. 変更検出: 最終合格と同じツリー・設定・検査器なら再検査しない
		const fp = fingerprint(root, stateDir, configFiles, toolsDir);
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
			const nonDecreasing = h.length >= 3 && h.at(-1).length >= h.at(-2).length && h.at(-2).length >= h.at(-3).length;
			const cap = s.rounds >= opts.maxRounds;
			if (cap || nonDecreasing) {
				release(cap ? "round-cap" : "non-decreasing", s, log, opts);
				state.session = emptySession(session); //  次のターンはまた round 1 から
				saveState(statePath, state);
				return 0;
			}
		}

		//  6. 検査
		const { failures, skipped, notes, ran } = runSuite(root, opts, toolsDir, configPath, loaded);

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
				"traceconfig.json を緩めて（none にする、範囲を狭める）通さない。機械判定できない指摘は docs/verification/DEFERRED.md に記録し、機械判定できるものは保留にしない。",
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

process.exit(main());
