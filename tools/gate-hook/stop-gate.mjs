#!/usr/bin/env node
//  stop-gate — 終端ゲートの機械強制（Claude Code の Stop フック）
//
//  gate-hook（PreToolUse）が「書く前」を止めるのに対し、本フックは「終わる前」を止める。
//  AI がターンを終えようとした瞬間に host の検証一式を走らせ、通らなければ exit 2 で
//  終了をブロックし、失敗した検査の末尾ログを stderr で AI に差し戻す。
//
//  検査の並びと実行は suite.mjs が持つ（spec-lint → trace-check → contract-run → typecheck → lint → test → system。
//  goal-status も同じ並びを使う）。コマンドは traceconfig.json に宣言されたものしか走らせない。推測・発明はしない。
//
//  Stop フックの入出力（Claude Code の契約）:
//    stdin  JSON: session_id / cwd / hook_event_name:"Stop" / stop_hook_active / stop_reason
//    exit 0 = 終了を許可（stdout は文脈として表示）
//    exit 2 = 終了をブロック（stderr が「続ける理由」として AI に渡る）
//    その他 = 非ブロッキングエラー
//
//  収束制御（無限ループ防止）:
//    - 変更検出: git の HEAD + status + diff のハッシュが最終合格時と同じなら再検査しない（skip）。
//    - ラウンド上限: stop_hook_active（既にフックで継続中）かつ rounds >= --max-rounds なら
//      ブロックせず人間へ手渡す（release）。失敗集合が 2 回連続で縮まない場合も同様。
//    状態は <ログと同じディレクトリ>/state.json に持つ（既定 .harness-gate/state.json）。
//
//  fail-open / fail-closed の境界:
//    - 検査そのものの不通過 → ブロック（exit 2）。ゲートの存在意義。
//    - stdin が読めない・フック自身の例外 → 許可（exit 0）。フックの不具合でセッションを壊さない。
//
//  使い方（settings.local.json の Stop フックとして。README.md を参照）:
//    node tools/gate-hook/stop-gate.mjs [--docs docs] [--config traceconfig.json]
//         [--log .harness-gate/log.jsonl] [--max-rounds 2] [--timeout 300] [--tail 15] [--force]
//  環境変数 STOP_GATE_TOOLS_DIR は同梱ツールの探索先（<self dir>/..）を差し替える（テスト用）。

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { appendLog, defaultLogPath } from "./gate-log.mjs";
import { runSuite, tailLines } from "./suite.mjs";

const USAGE =
	"usage: stop-gate.mjs [--docs docs] [--config traceconfig.json] [--log <path>] [--max-rounds 2] [--timeout 300] [--tail 15] [--force]";

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

//  ---- 変更検出（git） -------------------------------------------------------

//  HEAD + 作業ツリーの状態 + 差分をハッシュ。git が使えない / 失敗 → null（常に検査する）。
//  ゲート自身の状態ディレクトリ（untracked で現れる）は除外しないと、初回合格で指紋が変わってしまう。
function fingerprint(root, stateDir) {
	const git = (args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
	const rel = relative(root, stateDir).split(sep).join("/");
	const excludeSelf = rel && !rel.startsWith("..") ? [`:(exclude)${rel}`] : [];

	const head = git(["rev-parse", "HEAD"]);
	const status = git(["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ".", ...excludeSelf]);
	const diff = git(["diff", "HEAD", "--no-color", "--", ".", ...excludeSelf]);
	for (const r of [head, status, diff]) if (r.error || r.status !== 0) return null;

	return createHash("sha256").update(head.stdout).update("\0").update(status.stdout).update("\0").update(diff.stdout).digest("hex");
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

		//  4. 変更検出: 最終合格と同じツリーなら再検査しない
		const fp = fingerprint(root, stateDir);
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
				const why = cap ? "round-cap" : "non-decreasing";
				console.log(
					`[stop-gate] 非収束: ${s.rounds} ラウンド連続で終端ゲート不通過。残りは人間の裁定へ（失敗: ${s.last_failures.join(", ") || "なし"}）`,
				);
				log("release", why, { round: s.rounds, failures: s.last_failures });
				state.session = emptySession(session); //  次のターンはまた round 1 から
				saveState(statePath, state);
				return 0;
			}
		}

		//  6. 検査
		const toolsDir = process.env.STOP_GATE_TOOLS_DIR || join(dirname(fileURLToPath(import.meta.url)), "..");
		const configPath = resolve(root, opts.config);
		const { failures, skipped, ran } = runSuite(root, opts, toolsDir, configPath, { onSkip: (_step, why) => console.log(`[stop-gate] skip: ${why}`) });

		//  7. 全部通過
		if (failures.length === 0) {
			state.last_pass = { fingerprint: fp, ts: new Date().toISOString() };
			state.session = emptySession(session);
			saveState(statePath, state);
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

		const out = [`[stop-gate] 終端ゲート不通過（round ${s.rounds}/${opts.maxRounds}）: 失敗 = ${names.join(", ")}`];
		for (const f of failures) {
			const how = f.timedOut ? `timeout ${opts.timeout}s` : `exit ${f.code ?? `signal ${f.signal}`}`;
			out.push(`  ${f.name}: ${how}`);
			for (const l of tailLines(f.output, opts.tail)) out.push(`    ${l}`);
		}
		out.push(
			"失敗した検査だけを直し、修正範囲を再検証してから終了すること。機械判定できない指摘は docs/verification/DEFERRED.md に記録し、機械判定できるものは保留にしない。",
		);
		process.stderr.write(out.join("\n") + "\n");
		log("block", names[0], { round: s.rounds, failures: names });
		return 2;
	} catch (e) {
		//  フック自身の不具合 → fail-open
		process.stderr.write(`[stop-gate] 内部エラーのため終端ゲートを判定できません（許可）: ${e?.message ?? e}\n`);
		log("skip", "internal-error");
		return 0;
	}
}

process.exit(main());
