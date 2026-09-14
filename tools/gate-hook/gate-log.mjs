#!/usr/bin/env node
//  gate-log — gate-hook / stop-gate 共用の却下ログ（JSONL）と集計
//
//  2 つのフック（PreToolUse の実装着手ゲート、Stop の終端ゲート）は判定のたびに
//  1 行の JSON を追記する。目的は「ゲートが実際に何かを止めているか」を事実で
//  測ること。一定期間ブロック 0 件のゲートは降格候補だが、降格の判断はこのデータ
//  を見た人間が行う（ツールは候補を示すだけ）。
//
//  記録の形（キー順は固定）:
//    ts        ISO 時刻
//    hook      "gate-hook" | "stop-gate"
//    event     "PreToolUse" | "Stop"
//    session   Claude Code の session_id（無ければ null）
//    decision  "block" | "pass" | "skip" | "release"
//    reason    判定理由の語彙（各フックが定める）
//    target    書き込み対象の相対パス（gate-hook のみ。他は null）
//    uc        検査した UC id の配列（gate-hook のみ。他は null）
//    round     終端ゲートのラウンド番号（stop-gate のみ。他は null）
//    failures  失敗した検査名の配列（stop-gate のブロック時のみ。他は null）
//    ms        判定にかかった時間（ミリ秒）
//
//  ログの失敗はゲートを止めない（追記に失敗しても例外を握りつぶす）。
//
//  直接実行すると集計モードになる:
//    node gate-log.mjs --summary [--log .harness-gate/log.jsonl] [--since 14]

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RECORD_KEYS = ["ts", "hook", "event", "session", "decision", "reason", "target", "uc", "round", "failures", "ms"];

//  既定のログ置き場: <root>/.harness-gate/log.jsonl（stop-gate の state.json も同じ場所）
export function defaultLogPath(root) {
	return join(root, ".harness-gate", "log.jsonl");
}

//  1 行追記。キー順を固定し、欠けたキーは null で埋める。失敗は握りつぶす（ログ都合でゲートを止めない）
export function appendLog(path, record) {
	try {
		const ordered = {};
		for (const k of RECORD_KEYS) ordered[k] = record[k] === undefined ? null : record[k];
		mkdirSync(dirname(path), { recursive: true });
		appendFileSync(path, JSON.stringify(ordered) + "\n");
	} catch {
		//  ログ失敗は無視
	}
}

//  ---- 集計（--summary） ----------------------------------------------------

function parseArgs(argv) {
	const opts = { summary: false, log: null, since: 14 };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--summary") opts.summary = true;
		else if (a === "--log") opts.log = argv[++i];
		else if (a === "--since") opts.since = Number(argv[++i]);
		else {
			console.error(`gate-log: 不明な引数 ${a}`);
			process.exit(2);
		}
	}
	return opts;
}

function readRecords(path, sinceDays) {
	const cutoff = Date.now() - sinceDays * 24 * 60 * 60 * 1000;
	const out = [];
	for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
		if (!line.trim()) continue;
		let r;
		try {
			r = JSON.parse(line);
		} catch {
			continue; //  壊れた行は読み飛ばす
		}
		const t = Date.parse(r.ts);
		if (Number.isNaN(t) || t < cutoff) continue;
		out.push(r);
	}
	return out;
}

const count = (rs, pred) => rs.filter(pred).length;

function reasonBreakdown(blocks) {
	const m = new Map();
	for (const b of blocks) m.set(b.reason ?? "(なし)", (m.get(b.reason ?? "(なし)") || 0) + 1);
	return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([r, n]) => `    ${r}: ${n}`);
}

function summarize(records, sinceDays) {
	const lines = [`gate-log: 直近 ${sinceDays} 日（${records.length} 件）`];

	//  gate-hook: 母数はゲート判定に達した書き込みだけ（docs や対象外は記録されない）
	const gh = records.filter((r) => r.hook === "gate-hook");
	const ghBlocks = gh.filter((r) => r.decision === "block");
	const lastBlock = ghBlocks.length ? ghBlocks[ghBlocks.length - 1].ts : "なし";
	lines.push(`gate-hook: gated ${gh.length} / block ${ghBlocks.length} / last block: ${lastBlock}`);
	if (ghBlocks.length === 0) lines.push("  降格候補（期間内のブロック 0 件。降格の判断は人間が行う）");
	else lines.push(...reasonBreakdown(ghBlocks));

	//  stop-gate: runs は全記録（block / pass / skip / release）
	const sg = records.filter((r) => r.hook === "stop-gate");
	const sgBlocks = sg.filter((r) => r.decision === "block");
	lines.push(
		`stop-gate: runs ${sg.length} / block ${sgBlocks.length} / release ${count(sg, (r) => r.decision === "release")} / skip ${count(sg, (r) => r.decision === "skip")}`,
	);
	if (sgBlocks.length === 0) lines.push("  降格候補（期間内のブロック 0 件。降格の判断は人間が行う）");
	else lines.push(...reasonBreakdown(sgBlocks));

	return lines.join("\n");
}

function main() {
	const opts = parseArgs(process.argv.slice(2));
	if (!opts.summary) {
		console.error("usage: gate-log.mjs --summary [--log <path>] [--since <days>]");
		return 2;
	}
	if (!Number.isFinite(opts.since) || opts.since <= 0) {
		console.error("gate-log: --since は正の日数");
		return 2;
	}
	const path = resolve(opts.log ?? defaultLogPath(process.env.CLAUDE_PROJECT_DIR || process.cwd()));
	if (!existsSync(path)) {
		console.log(`gate-log: ログが無い: ${path}（まだ判定が記録されていない）`);
		return 0;
	}
	console.log(summarize(readRecords(path, opts.since), opts.since));
	return 0;
}

//  直接実行時だけ集計モード（import された場合は何もしない）
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
