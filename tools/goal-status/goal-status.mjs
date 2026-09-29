#!/usr/bin/env node
//
//  goal-status — GOAL ごとの成立状態の導出（報告であって、ゲートではない）
//
//  目標状態: 「AI に聞かずに、各 GOAL が今成り立っているかが分かる」（ADR-0038）。
//    分母は人が決める: status が active の GOAL（backlog からの昇格と active 化は人間ゲート）。
//    分子は機械が決める: 終端リストの実行結果と、trace-check の違反。
//    UC.md の phase: は orchestrator の申告なので判定に使わない（表示と、申告と観測の食い違いの検出にだけ使う）。
//  出力は導出物。どこにも保存しない（コミットもしない）。観測した時刻とコミットを必ず添える。
//
//  状態（閉じた語彙）:
//    true        条件（active な REQ）があり、配下を名指しする違反が無く、終端リストが実行されて全部通った
//    false       配下（GOAL / UC / REQ）を名指しする trace-check の違反がある（baseline 済みも数える。
//                baseline は「止めない」ための台帳であって、成り立っている証拠ではない）
//    unobserved  どちらとも言えない。理由（閉じた語彙）:
//                  no-conditions  active な REQ が無い（観測する条件がまだ決まっていない）
//                  gate-red       終端リストが赤（どの GOAL のテストが落ちたかまでは分からない）
//                  not-executed   テストが走っていない（commands.test 未宣言 / --no-run）
//
//  使い方:
//    node goal-status.mjs [--root .] [--config traceconfig.json] [--docs docs] [--json] [--no-run] [--timeout 600]
//      --json      人が読む表の代わりに JSON を 1 個出力（一覧画面などの集約側が読む）
//      --no-run    host の実行（contract-run / typecheck / lint / test / system）を走らせない。
//                  違反による false は出るが、true は出ない（not-executed）
//  環境変数 GOAL_STATUS_TOOLS_DIR は同梱ツールの探索先（<self dir>/..）を差し替える（テスト用）。
//
//  終了コード: 0 = 報告を出した（状態の良し悪しに依らない） / 2 = 使い方・設定エラー
//

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runSuite } from "../gate-hook/suite.mjs";

const USAGE = "usage: goal-status.mjs [--root .] [--config traceconfig.json] [--docs docs] [--json] [--no-run] [--timeout 600]";
const SCHEMA = 1; //  JSON の形を壊す変更で上げる（集約側はこれを見て読み方を決める）
const DONE_PHASE = "完了";
const MAX_LISTED = 5; //  表に出す違反の上限（UC ごと）。全件は --json

//  ---- 引数 ----------------------------------------------------------------

function parseArgs(argv) {
	const opts = { root: ".", config: null, docs: "docs", json: false, noRun: false, timeout: 600 };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--root") opts.root = argv[++i];
		else if (a === "--config") opts.config = argv[++i];
		else if (a === "--docs") opts.docs = argv[++i];
		else if (a === "--json") opts.json = true;
		else if (a === "--no-run") opts.noRun = true;
		else if (a === "--timeout") opts.timeout = Number(argv[++i]);
		else usage(`不明な引数 ${a}`);
	}
	if (!Number.isInteger(opts.timeout) || opts.timeout < 1) usage("--timeout は 1 以上の整数（秒）");
	return opts;
}

function usage(why) {
	console.error(`goal-status: ${why}\n${USAGE}`);
	process.exit(2);
}

//  ---- 観測した木の状態（git） ------------------------------------------------

//  観測がどのコミットのものか、作業ツリーに未コミットの変更が何件あるか。git で無ければすべて null。
//  検査がファイルを作ることがあるので、終端リストを走らせる前に読む
function gitInfo(root) {
	const git = (...args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
	const out = (r) => (r.error || r.status !== 0 ? null : r.stdout.trim());
	if (out(git("rev-parse", "--is-inside-work-tree")) !== "true") return { commit: null, branch: null, dirty: null };
	const status = out(git("status", "--porcelain=v1", "--untracked-files=all", "--", "."));
	return {
		commit: out(git("rev-parse", "HEAD")),
		branch: out(git("rev-parse", "--abbrev-ref", "HEAD")),
		dirty: status === null ? null : status.split("\n").filter(Boolean).length,
	};
}

//  ---- 保留台帳（機械判定できない指摘） -----------------------------------------

//  DEFERRED.md の行を { id, target } で読む。行の文法の検査は spec-lint の仕事で、ここは数えるだけ
function deferredRows(root, cfg, docs) {
	const file = join(root, cfg.docs?.verification_deferred || join(docs, "verification", "DEFERRED.md"));
	if (!existsSync(file)) return [];
	const rows = [];
	for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
		const cells = line.split("|").map((c) => c.trim());
		if (/^DEF-\d+$/.test(cells[1] || "")) rows.push({ id: cells[1], target: cells[4] || "" });
	}
	return rows;
}

//  ---- 導出 ----------------------------------------------------------------

//  終端リストの結果から「true と言ってよいか」を決める。言えないなら理由を返す（言えるなら null）
function blockerOf(steps) {
	const failed = steps.filter((s) => s.state === "fail" || s.state === "timeout").map((s) => s.name);
	if (failed.length) return { reason: "gate-red", detail: failed };
	const test = steps.find((s) => s.step === "test");
	if (test.state !== "pass") return { reason: "not-executed", detail: [test.why] };
	return null;
}

function derive(trace, steps, deferred) {
	const blocker = blockerOf(steps);
	const goalOf = {}; //  id -> GOAL id（GOAL 自身 / UC / REQ）
	const ucOf = {}; //  id -> UC id（UC 自身 / REQ）
	for (const g of trace.goals) goalOf[g.id] = g.id;
	for (const u of trace.ucs) (goalOf[u.id] = u.goal), (ucOf[u.id] = u.id);
	for (const q of trace.reqs) (goalOf[q.id] = q.goal), (ucOf[q.id] = q.uc);

	//  違反を木へ配る。1 件が複数の GOAL を名指しすることがある（採番衝突・配置のずれ）。どこも名指ししなければ unattributed
	const byGoal = {}; //  GOAL id -> [violation]
	const byUc = {}; //  UC id -> [violation]
	const unattributed = [];
	for (const v of trace.violations) {
		const goals = new Set(v.ids.map((i) => goalOf[i]).filter(Boolean));
		const ucs = new Set(v.ids.map((i) => ucOf[i]).filter(Boolean));
		if (goals.size === 0) unattributed.push(v);
		for (const g of goals) (byGoal[g] ||= []).push(v);
		for (const u of ucs) (byUc[u] ||= []).push(v);
	}

	const stateOf = (conditions, violations, pending) => {
		if (conditions === 0) return { state: "unobserved", reason: "no-conditions", detail: [] };
		if (violations.length) return { state: "false", reason: "violation", detail: [] };
		if (pending.length) return { state: "unobserved", reason: "no-conditions", detail: pending };
		if (blocker) return { state: "unobserved", ...blocker };
		return { state: "true", reason: null, detail: [] };
	};

	const goals = trace.goals
		.filter((g) => g.status === "active")
		.map((g) => {
			const mine = trace.ucs.filter((u) => u.goal === g.id);
			const ucs = mine
				.filter((u) => u.status === "active")
				.map((u) => {
					const conditions = trace.reqs.filter((q) => q.uc === u.id && q.status === "active").length;
					const violations = byUc[u.id] || [];
					const s = stateOf(conditions, violations, []);
					//  申告（phase: 完了）と観測の食い違い。終端リストが赤・未実行のときは観測が無いので数えない
					const disagrees = u.phase === DONE_PHASE && (s.state === "false" || s.reason === "no-conditions");
					return { id: u.id, title: u.title, phase: u.phase, ...s, conditions, phase_disagrees: disagrees, violations };
				});
			const conditions = ucs.reduce((n, u) => n + u.conditions, 0);
			const all = byGoal[g.id] || [];
			const pending = ucs.filter((u) => u.conditions === 0).map((u) => u.id);
			//  ucs に出るのは active な UC だけ。GOAL 自身や draft / withdrawn の UC を名指しする違反はここに持つ
			const listed = new Set(ucs.map((u) => u.id));
			return {
				id: g.id,
				dir: g.dir,
				statement: g.statement,
				...stateOf(conditions, all, pending),
				conditions,
				drafts: mine.filter((u) => u.status === "draft").length,
				deferred: deferred.filter((d) => d.target.startsWith(`${g.dir}/`)).length,
				violations: all.filter((v) => !v.ids.some((i) => listed.has(ucOf[i]))),
				ucs,
			};
		});

	const count = (s) => goals.filter((g) => g.state === s).length;
	return {
		summary: {
			goals: goals.length,
			true: count("true"),
			false: count("false"),
			unobserved: count("unobserved"),
			deferred: deferred.length,
			phase_disagreements: goals.reduce((n, g) => n + g.ucs.filter((u) => u.phase_disagrees).length, 0),
		},
		goals,
		unattributed,
	};
}

//  ---- 表示（人が読む表。未達だけを詳しく出す） ----------------------------------

const LABEL = { true: "真    ", false: "偽    ", unobserved: "未観測" };
const REASON = { "no-conditions": "条件が未定義", "gate-red": "終端リストが赤", "not-executed": "テストが走っていない" };
const clip = (text, n) => (text.length > n ? text.slice(0, n) + "…" : text);
const why = (x) => (x.state === "unobserved" ? `（${REASON[x.reason]}${x.detail.length ? `: ${x.detail.join(", ")}` : ""}）` : "");

function render(r) {
	const dirty = r.dirty ? `未コミット ${r.dirty} 件` : "";
	const where = r.commit ? `@ ${r.commit.slice(0, 7)}（${[r.branch, dirty].filter(Boolean).join("、")}）` : r.dirty === null ? "（git 管理外）" : `（コミットなし${dirty ? `、${dirty}` : ""}）`;
	const listed = (violations, pad) => {
		const lines = violations.slice(0, MAX_LISTED).map((v) => `${pad}${v.message}${v.baselined ? "（baseline 済み）" : ""}`);
		if (violations.length > MAX_LISTED) lines.push(`${pad}… ほか ${violations.length - MAX_LISTED} 件（--json で全件）`);
		return lines;
	};
	const s = r.summary;
	const out = [
		`goal-status: ${r.project} ${where}  観測 ${r.observed_at}`,
		`終端リスト: ${r.gate.ok ? (r.gate.executed ? "緑" : "緑（テスト未実行）") : `赤（${r.gate.failed.join(", ")}）`}  ` + r.gate.steps.map((x) => `${x.step}:${x.state}`).join(" "),
		`成立 ${s.true} / ${s.goals}（偽 ${s.false}、未観測 ${s.unobserved}）  保留 ${s.deferred} 件  申告との食い違い ${s.phase_disagreements} 件`,
		"",
	];
	for (const g of r.goals) {
		out.push(`  ${LABEL[g.state]}  ${g.id}  ${clip(g.statement, 48)}${why(g)}`);
		if (g.state === "true") continue;
		out.push(...listed(g.violations, "            "));
		for (const u of g.ucs) {
			//  終端リストが原因の未観測は GOAL の行に出ている。UC は「偽」と「条件が未定義」だけを出す
			if (u.state === "true" || (u.state === "unobserved" && u.reason !== "no-conditions")) continue;
			out.push(`            ${u.id} [${u.phase || "phase なし"}] ${LABEL[u.state].trim()}${why(u)}  条件 ${u.conditions} / 違反 ${u.violations.length}${u.phase_disagrees ? "  ← 申告は完了" : ""}`);
			out.push(...listed(u.violations, "              "));
		}
		if (g.ucs.length === 0) out.push(`            active な UC が無い${g.drafts ? `（draft ${g.drafts} 件）` : ""}`);
	}
	if (r.unattributed.length) out.push("", `  どの GOAL にも帰属しない違反 ${r.unattributed.length} 件:`, ...listed(r.unattributed, "    "));
	return out.join("\n");
}

//  ---- 本体 ----------------------------------------------------------------

function main() {
	const opts = parseArgs(process.argv.slice(2));
	const root = resolve(opts.root);
	const configPath = opts.config ? resolve(root, opts.config) : join(root, "traceconfig.json");
	if (!existsSync(configPath)) {
		console.error(`goal-status: 設定が無い: ${configPath}（GOAL の木は trace-check が読む。traceconfig.json を host 直下に置く）`);
		return 2;
	}
	const cfg = JSON.parse(readFileSync(configPath, "utf8"));
	const observedAt = new Date().toISOString();
	const git = gitInfo(root);

	const toolsDir = process.env.GOAL_STATUS_TOOLS_DIR || join(dirname(fileURLToPath(import.meta.url)), "..");
	const { steps } = runSuite(root, { docs: opts.docs, timeout: opts.timeout }, toolsDir, configPath, { traceArgs: "--json", commands: !opts.noRun });

	const traceStep = steps.find((s) => s.step === "trace-check");
	let trace;
	try {
		trace = JSON.parse(traceStep.stdout);
	} catch {
		console.error(`goal-status: trace-check の出力を読めない（exit ${traceStep.code ?? "?"}）\n${traceStep.output.trim().split(/\r?\n/).slice(-5).join("\n")}`);
		return 2;
	}

	const failed = steps.filter((s) => s.state === "fail" || s.state === "timeout").map((s) => s.name);
	const report = {
		schema: SCHEMA,
		project: basename(root),
		observed_at: observedAt,
		...git,
		gate: {
			ok: failed.length === 0,
			executed: steps.find((s) => s.step === "test").state === "pass",
			failed,
			steps: steps.map((s) => ({ step: s.step, state: s.state, ...(s.why ? { why: s.why } : {}), ...(s.ms === undefined ? {} : { ms: s.ms }) })),
		},
		...derive(trace, steps, deferredRows(root, cfg, opts.docs)),
	};
	console.log(opts.json ? JSON.stringify(report) : render(report));
	return 0;
}

//  process.exit() は使わない（stdout がパイプのとき、大きな JSON が書き切られる前に終わってしまう）
process.exitCode = main();
