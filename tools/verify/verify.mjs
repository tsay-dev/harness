#!/usr/bin/env node
//  verify — 完了の判定（harness verify）
//
//  プロジェクトの検証一式（検査の並び。正本は tools/_shared/suite.mjs）を実行する。動かし方は 2 つあり、検査の並びは同じ。
//  フックで通ったものが CI で落ちる（またはその逆の）食い違いを作らないために、並びを 1 か所に置く。
//    - 1 回の実行（CI・手元）: 標準入力もラウンドの記録も使わずに、並びを 1 回実行して結果を表示する
//    - Stop フック（--hook）: AI がターンを終えようとした瞬間に実行し、通らなければ exit 2 で終了をブロックして、
//      失敗した検査の末尾ログを stderr で AI に差し戻す（guard が「書く前」を止めるのに対し、こちらは「終わる前」を止める）
//  コマンドは設定（harness.config.json）に宣言されたものしか実行しない。推測・発明はしない。
//
//  使い方（1 回の実行）:
//    harness verify [--level lint|fast|full] [--unit <名前>]... [--root <プロジェクトのルート>]
//                   [--docs docs] [--config harness.config.json] [--timeout 300] [--tail 15]
//      --level    どこまで実行するか（既定 full）。
//                   lint = 読むだけの検査（設定の形・仕様の書式・紐づき）。利用プロジェクトのコマンドは実行しない
//                   fast = lint + 契約の実例の実行 + commands.typecheck / lint / test / extra
//                   full = fast + commands.system（シナリオテスト）
//      --unit     monorepo で、検査する unit の名前（複数可。省略すると全 unit）
//      --timeout  検査 1 つあたりの秒数
//      --tail     失敗した検査の出力のうち、表示する末尾の行数
//      --verbose  実行した検査の出力を、通ったものも含めて全部表示する（警告や違反の一覧を CI のログに残す）
//      --timeout 0 は制限なし。--config の相対パスは、実行したディレクトリから探す
//      --ignore-legacy-layout  旧レイアウト（docs/specs/）が残っていても検査を続ける（lint spec へ渡す。移行中だけ）
//    終了コード: 0 = すべて通過 / 1 = 失敗がある / 2 = 使い方の誤り
//
//  使い方（Stop フック。settings.local.json の Stop フックとして。tools/guard/README.md を参照）:
//    harness verify --hook [--level lint|fast|full] [--unit <名前>]... [--docs docs] [--config harness.config.json]
//         [--log .harness-gate/log.jsonl] [--max-rounds 2] [--timeout 300] [--tail 15] [--force]
//
//  Stop フックの入出力（Claude Code の契約）:
//    stdin  JSON: session_id / cwd / hook_event_name:"Stop" / stop_hook_active / stop_reason
//    exit 0 = 終了を許可（stdout は文脈として表示。JSON の systemMessage は利用者に表示される）
//    exit 2 = 終了をブロック（stderr が「続ける理由」として AI に渡る）
//    その他 = 非ブロッキングエラー
//
//  Stop フックの収束制御（無限ループ防止）:
//    - 変更検出: git の HEAD + status + diff、未追跡ファイルの中身、harness.config.json、検査の並びが使うコマンドのファイルと
//      共有の処理のハッシュが最終合格時と同じなら再検査しない（skip）。
//    - ラウンド上限: stop_hook_active（既にフックで継続中）かつ rounds >= --max-rounds なら
//      ブロックせず人間へ手渡す（release。systemMessage で利用者に表示）。前のラウンドから進んでいない場合（直前に落ちた検査が今回もすべて落ちている、
//      または落ちる検査の組が前のものへ戻った）も同様（--max-rounds を 3 以上にしたとき、上限を待たずに渡す）。
//    状態は <ログと同じディレクトリ>/state.json に持つ（既定 .harness-gate/state.json。guard が agent の書き込みを止める）。
//
//  Stop フックの fail-open / fail-closed の境界:
//    - 検査そのものの不通過 → ブロック（exit 2）。ゲートの存在意義。
//    - stdin が読めない → 許可（exit 0）。フックの入口の不具合でセッションを壊さない。
//    - stdin を読めた後のフック自身の例外 → ブロック（exit 2）。判定できないまま通すとゲートが無いのと同じ。
//      ただし stop_hook_active でラウンド上限に達していれば、ラウンド上限と同じく解放する（無限ループを避ける）。
//
//  環境変数 HARNESS_TOOLS_DIR は同梱ツールの探索先（<このファイルの場所>/..）を差し替える（テスト用。入口 bin/harness.mjs と同じ）。

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { appendLog, defaultLogPath } from "../_shared/gate-log.mjs";
import { CONFIG_FILE } from "../_shared/config.mjs";
import { LEVELS, readConfig, runSuite, suiteCommandFiles, tailLines, unitsOf } from "../_shared/suite.mjs";

const USAGE =
	"usage: harness verify [--level lint|fast|full] [--unit <名前>]... [--root .] [--docs docs] [--config harness.config.json] [--timeout 300] [--tail 15] [--verbose] [--ignore-legacy-layout]\n" +
	"       harness verify --hook [Stop フックとして動かすときの引数...]";
const HOOK_USAGE =
	"usage: harness verify --hook [--level lint|fast|full] [--unit <名前>]... [--docs docs] [--config harness.config.json] [--log <path>] [--max-rounds 2] [--timeout 300] [--tail 15] [--force]";

//  同梱ツールの置き場（このファイルの 2 つ上）。HARNESS_TOOLS_DIR で差し替える（テスト用）
const toolsDirOf = () => (process.env.HARNESS_TOOLS_DIR ? resolve(process.env.HARNESS_TOOLS_DIR) : join(dirname(fileURLToPath(import.meta.url)), ".."));

//  失敗した検査の一覧（1 件ずつ、止まり方と出力の末尾）。1 回の実行でも、Stop フックでも同じ形で出す
function failureLines(failures, opts) {
	const out = [];
	for (const f of failures) {
		const how = f.config ? "設定" : f.timedOut ? `timeout ${opts.timeout}s` : `exit ${f.code ?? `signal ${f.signal}`}`;
		out.push(`  ${f.name}: ${how}`);
		for (const l of tailLines(f.output, opts.tail)) out.push(`    ${l}`);
	}
	return out;
}

//  ==== 1 回の実行（CI・手元） ====================================================

function usage(msg) {
	console.error(`verify: ${msg}\n${USAGE}`);
	process.exit(2);
}

function parseArgs(argv) {
	const opts = { root: ".", docs: "docs", config: null, level: "full", only: [], timeout: 300, tail: 15 };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const value = () => {
			if (argv[i + 1] === undefined) usage(`${a} に値が無い`);
			return argv[++i];
		};
		if (a === "--root") opts.root = value();
		else if (a === "--docs") opts.docs = value();
		else if (a === "--config") opts.config = value();
		else if (a === "--level") opts.level = value();
		else if (a === "--unit") opts.only.push(value());
		else if (a === "--timeout") opts.timeout = Number(value());
		else if (a === "--tail") opts.tail = Number(value());
		else if (a === "--ignore-legacy-layout") opts.ignoreLegacyLayout = true;
		else if (a === "--verbose") opts.verbose = true;
		else usage(`不明な引数 ${a}`);
	}
	if (!LEVELS.includes(opts.level)) usage(`--level は ${LEVELS.join(" / ")}`);
	for (const k of ["timeout", "tail"]) if (!Number.isInteger(opts[k]) || opts[k] < 0) usage(`--${k} は 0 以上の整数`);
	return opts;
}

async function runOnce(argv) {
	const opts = parseArgs(argv);
	const root = resolve(opts.root);
	const configPath = opts.config ? resolve(opts.config) : join(root, CONFIG_FILE);
	const toolsDir = toolsDirOf();

	const { failures, skipped, notes, ran, outputs } = await runSuite(root, opts, toolsDir, configPath, readConfig(configPath));
	if (opts.verbose)
		for (const o of outputs) {
			console.log(`\n== ${o.name}（${o.ok ? "通過" : "失敗"}）`);
			if (o.output.trim()) console.log(o.output.replace(/\s+$/, ""));
		}
	for (const n of notes) console.log(n);
	const scope = `level ${opts.level}${opts.only.length ? `、unit: ${opts.only.join(", ")}` : ""}`;
	if (failures.length === 0) {
		console.log(`[verify] すべて通過（${scope}。${ran} 検査、skip: ${skipped.join(", ") || "なし"}）`);
		return 0;
	}
	const out = [`[verify] 失敗 ${failures.length} 件（${scope}。${ran} 検査）: ${failures.map((f) => f.name).join(", ")}`];
	out.push(...failureLines(failures, opts));
	console.error(out.join("\n"));
	return 1;
}

//  ==== Stop フック（--hook） =====================================================

//  ---- 引数 ----------------------------------------------------------------

function parseHookArgs(argv) {
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
			console.error(`verify: 不明な引数 ${a}\n${HOOK_USAGE}`);
			process.exit(2);
		}
	}
	if (!LEVELS.includes(opts.level) || opts.only.some((u) => typeof u !== "string" || !u)) {
		console.error(`verify: --level は ${LEVELS.join(" / ")}、--unit は unit の名前\n${HOOK_USAGE}`);
		process.exit(2);
	}
	for (const k of ["maxRounds", "timeout", "tail"])
		if (!Number.isInteger(opts[k]) || opts[k] < 0) {
			console.error(`verify: --${k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())} は 0 以上の整数\n${HOOK_USAGE}`);
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
			hook: "verify",
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
	const message = `[verify] 終端ゲートが通らないまま解放した（${s.rounds} ラウンド連続で不通過、上限 ${opts.maxRounds}。${why === "non-decreasing" ? "前のラウンドから進んでいない。" : ""}残りは人間の裁定へ）。失敗: ${failures}`;
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

//  検査の並びが使うコマンドのファイルと、共有の処理（検査器が変われば同じツリーでも結果が変わる）
function toolFiles(toolsDir) {
	const files = suiteCommandFiles(toolsDir);
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

async function runHook(argv) {
	const startedAt = Date.now();
	const opts = parseHookArgs(argv);

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
		const toolsDir = toolsDirOf();
		const configPath = resolve(root, opts.config);
		const loaded = readConfig(configPath);
		const units = unitsOf(loaded.cfg);
		const configFiles = [configPath, ...(units ? Object.values(units).filter((d) => typeof d === "string").map((d) => resolve(root, d, CONFIG_FILE)) : [])];

		//  4. 変更検出: 最終合格と同じツリー・設定・検査器なら再検査しない
		const fp = fingerprint(root, stateDir, configFiles, toolsDir, JSON.stringify([opts.level, [...new Set(opts.only)].sort(), !!opts.ignoreLegacyLayout, opts.docs]));
		if (!opts.force && fp && state.last_pass?.fingerprint === fp) {
			console.log(`[verify] 変更なし（最終合格 ${state.last_pass.ts}）`);
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
			console.log(`[verify] 終端ゲート通過（${ran} 検査、skip: ${skipped.join(", ") || "なし"}）`);
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

		const out = [`[verify] 終端ゲート不通過（round ${s.rounds}/${opts.maxRounds}）: 失敗 = ${names.join(", ")}`];
		out.push(...failureLines(failures, opts));
		out.push(
			"直せる失敗は直し、修正範囲を再検証してから終了すること。人間ゲート待ちや後続の担当の成果物でしか直せない失敗は、未達として報告して終える。" +
				"設定（harness.config.json）を緩めて（none にする、範囲を狭める）通さない。機械で判定できない点は、保留にせず、人間に聞いて決める。",
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
			`[verify] 内部エラーのため終端ゲートを判定できない（round ${s.rounds}/${opts.maxRounds}）: ${reason}\n` +
				"verify --hook を動かせる状態（.harness-gate/ の権限、git、node）を直せるなら直す。直せなければ未達として報告して終える。\n",
		);
		log("block", "internal-error", { round: s.rounds, failures: ["internal-error"] });
		return 2;
	} catch (e2) {
		//  状態も保存できない（ラウンドを数えられない）。継続中なら解放しないと止まらなくなる
		if (payload.stop_hook_active === true) {
			process.stdout.write(
				JSON.stringify({ systemMessage: `[verify] 終端ゲートが通らないまま解放した（内部エラーで判定できず、状態も保存できない）。失敗: internal-error（${reason}）` }) + "\n",
			);
			log("release", "internal-error", { failures: ["internal-error"] });
			return 0;
		}
		process.stderr.write(`[verify] 内部エラーのため終端ゲートを判定できない: ${reason}（状態の保存にも失敗: ${e2?.message ?? e2}）\n`);
		log("block", "internal-error", { failures: ["internal-error"] });
		return 2;
	}
}

//  ==== 入口 ======================================================================

const argv = process.argv.slice(2);
if (argv.includes("--hook")) process.exit(await runHook(argv.filter((a) => a !== "--hook")));
else process.exitCode = await runOnce(argv);
