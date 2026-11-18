//  guard（PreToolUse）の回帰検証。ディスク上の fixture は持たず、一時ディレクトリに木を組む。
import { test } from "node:test";
import { renderOverview } from "../../_shared/overview.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "..", "guard.mjs");

function runHook(root, payload, args) {
	return spawnSync("node", [HOOK, ...args], {
		input: typeof payload === "string" ? payload : JSON.stringify(payload),
		encoding: "utf8",
		env: { ...process.env, CLAUDE_PROJECT_DIR: root },
	});
}

const readLog = (root) => {
	const p = join(root, ".harness-gate", "log.jsonl");
	if (!existsSync(p)) return [];
	return readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
};

function makeRoot(t) {
	const root = mkdtempSync(join(tmpdir(), "harness guard "));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	return root;
}

const put = (root, rel, text) => {
	mkdirSync(dirname(join(root, rel)), { recursive: true });
	writeFileSync(join(root, rel), text);
};

const doc = (status, extra = "") => `---\nid: X\nstatus: ${status}\n${extra}---\n\n# 本文\n`;

//  ask の応答を読む（stdout の JSON）
//  概要（00-overview.md。ADR-0076）
const overview = ({ status = "living", actors = [], goals = [], policies = {} } = {}) => renderOverview({ status, problem: "課題", outOfScope: "なし", actors, goals, policies });
const goal = (id, status) => ({ id, sentence: "達成した状態", actor: "ACT-01", origin: "KPI-01", status, note: "" });
const askOf = (r) => {
	assert.equal(r.status, 0, r.stderr);
	const out = JSON.parse(r.stdout);
	assert.equal(out.hookSpecificOutput.hookEventName, "PreToolUse");
	assert.equal(out.hookSpecificOutput.permissionDecision, "ask");
	return out.hookSpecificOutput.permissionDecisionReason;
};

test("guard: 実装コードへの書き込みは判定を記録し、docs への書き込みは記録しない", (t) => {
	const root = makeRoot(t);
	mkdirSync(join(root, "docs"), { recursive: true }); //  docs/goals は無い → no-goals でブロック

	//  (1) src/x.js → ブロック + block/no-goals が 1 行
	const r1 = runHook(root, { tool_input: { file_path: "src/x.js" }, cwd: root, session_id: "s1" }, ["--code", "src/**"]);
	assert.equal(r1.status, 2, r1.stderr);
	assert.match(r1.stderr, /\[guard\]/);
	const log1 = readLog(root);
	assert.equal(log1.length, 1);
	assert.equal(log1[0].decision, "block");
	assert.equal(log1[0].reason, "no-goals");
	assert.equal(log1[0].session, "s1");
	assert.equal(log1[0].target, "src/x.js");
	assert.equal(log1[0].hook, "guard");
	assert.equal(log1[0].event, "PreToolUse");
	assert.deepEqual(Object.keys(log1[0]), ["ts", "hook", "event", "session", "decision", "reason", "target", "uc", "round", "failures", "ms"]);

	//  (2) docs/x.md（status なし）→ 許可、ログは増えない（母数＝ゲートされた書き込み）
	const r2 = runHook(root, { tool_input: { file_path: "docs/x.md", content: "# メモ\n" }, cwd: root, session_id: "s1" }, ["--code", "src/**"]);
	assert.equal(r2.status, 0, r2.stderr);
	assert.equal(r2.stdout, "");
	assert.equal(readLog(root).length, 1);

	//  (3) プロバイダー出力は許可・非記録
	const r3 = runHook(root, { tool_input: { file_path: ".claude/agents/x.md", content: "x" }, cwd: root }, ["--code", "**"]);
	assert.equal(r3.status, 0, r3.stderr);
	assert.equal(r3.stdout, "");
	assert.equal(readLog(root).length, 1);
});

test("guard: .harness-gate/ への書き込みは止める（書くのはフック自身だけ）", (t) => {
	const root = makeRoot(t);
	for (const target of [".harness-gate/log.jsonl", ".harness-gate/state.json", ".Harness-Gate/state.json"]) {
		const r = runHook(root, { tool_input: { file_path: target, content: "{}" }, cwd: root }, ["--code", "src/**"]);
		assert.equal(r.status, 2, `${target}: ${r.stdout}`);
		assert.match(r.stderr, /\.harness-gate\/ はゲートのログと状態の置き場/);
	}
	const log = readLog(root);
	assert.equal(log.length, 3);
	assert.ok(log.every((l) => l.decision === "block" && l.reason === "harness-gate"));
});

test("guard: --code 未指定は exit 1 で misconfig を記録する", (t) => {
	const root = makeRoot(t);
	const r = runHook(root, { tool_input: { file_path: "src/x.js" }, cwd: root, session_id: "s2" }, []);
	assert.equal(r.status, 1);
	const log = readLog(root);
	assert.equal(log.length, 1);
	assert.equal(log[0].reason, "misconfig");
	assert.equal(log[0].session, "s2");
});

test("guard: --log でログの置き場を変えられる", (t) => {
	const root = makeRoot(t);
	const r = runHook(root, { tool_input: { file_path: "src/x.js" }, cwd: root }, ["--code", "src/**", "--log", "out/gate.jsonl"]);
	assert.equal(r.status, 2);
	assert.ok(existsSync(join(root, "out", "gate.jsonl")));
	assert.equal(readLog(root).length, 0);
});

test("guard: 壊れた stdin は fail-open（入口の不具合でセッションを壊さない）", (t) => {
	const root = makeRoot(t);
	const r = runHook(root, "{not json", ["--code", "**"]);
	assert.equal(r.status, 0, r.stderr);
	assert.equal(readLog(root).length, 0);
});

test("guard: 検査の範囲・検査器・hook の設定・workflow は止めずに人間の承認を求め、理由を分けて記録する（ADR-0057）", (t) => {
	const root = makeRoot(t);
	const cases = [
		["harness.config.json", "config", /検査の範囲/],
		["apps/a/harness.config.json", "config", /apps\/a\/harness\.config\.json/],
		["packages/ui/Harness.Config.JSON", "config", /人間の承認/],
		[".harness/tools/lint-refs/lint-refs.mjs", "harness", /検査器/],
		[".Harness/README.md", "harness", /検査器/],
		[".claude/settings.json", "hook-settings", /hook の設定/],
		[".claude/settings.local.json", "hook-settings", /hook の設定/],
		[".github/workflows/verify.yml", "workflow", /workflow/],
		[".GitHub/Workflows/ci.yml", "workflow", /workflow/],
	];
	for (const [target, reason, re] of cases) {
		//  --code に一致しても、docs 配下でも ask が先に立つ
		const r = runHook(root, { tool_input: { file_path: target, content: "{}" }, cwd: root, session_id: "s1" }, ["--code", "**"]);
		assert.match(askOf(r), re, target);
		const l = readLog(root).at(-1);
		assert.equal(l.decision, "ask", target);
		assert.equal(l.reason, reason, target);
		assert.equal(l.target, target);
	}
	//  .claude/ のそれ以外（生成物）と、別名の settings は ask しない
	for (const target of [".claude/settings.jsonc", ".claude/agents/x.md"]) {
		const r = runHook(root, { tool_input: { file_path: target, content: "{}" }, cwd: root }, ["--code", "src/**"]);
		assert.equal(r.status, 0, r.stderr);
		assert.equal(r.stdout, "", target);
	}
	assert.equal(readLog(root).length, cases.length);
});

test("guard: docs の status の降格は常に ask（status-down）し、何が何から何に変わるかを示す", (t) => {
	const root = makeRoot(t);
	const uc = "docs/goals/GOAL-01-x/UC-001-y/UC.md";
	const req = "docs/goals/GOAL-01-x/UC-001-y/REQ-001.md";
	const contract = "docs/goals/GOAL-01-x/UC-001-y/contract.yaml";
	put(root, uc, doc("active", "phase: 実装\n"));
	put(root, req, doc("active"));
	put(root, contract, `openapi: 3.1.0\nx-uc: UC-001\nx-status: "fixed"\n`);
	put(root, "docs/00-overview.md", doc("living"));
	put(root, "docs/01-glossary.md", doc("frozen"));

	const edit = (file_path, old_string, new_string, extra = {}) =>
		runHook(root, { tool_name: "Edit", tool_input: { file_path, old_string, new_string, ...extra }, cwd: root, session_id: "s1" }, ["--code", "src/**"]);

	//  UC: active → draft
	assert.match(askOf(edit(uc, "status: active", "status: draft")), new RegExp(`${uc} の status を active → draft に変える`));
	//  REQ: active → withdrawn（Write で全体を書き換え）
	const w = runHook(root, { tool_name: "Write", tool_input: { file_path: req, content: doc("withdrawn") }, cwd: root }, ["--code", "src/**"]);
	assert.match(askOf(w), /REQ-001\.md の status を active → withdrawn/);
	//  契約: fixed → draft（引用符付きの x-status）
	assert.match(askOf(edit(contract, 'x-status: "fixed"', "x-status: draft")), /contract\.yaml の x-status を fixed → draft/);
	//  単一文書: living → draft、frozen → withdrawn
	assert.match(askOf(edit("docs/00-overview.md", "status: living", "status: draft")), /living → draft/);
	assert.match(askOf(edit("docs/01-glossary.md", "status: frozen", "status: withdrawn")), /frozen → withdrawn/);
	//  status 行を消すのも降格
	assert.match(askOf(edit(req, "status: active\n", "")), /active → （なし）/);
	//  MultiEdit: edits を順に当てる（途中で draft にして最後に戻すなら変化なし）
	const me = (edits) => runHook(root, { tool_name: "MultiEdit", tool_input: { file_path: uc, edits }, cwd: root }, ["--code", "src/**"]);
	assert.match(askOf(me([{ old_string: "phase: 実装", new_string: "phase: 契約" }, { old_string: "status: active", new_string: "status: draft" }])), /active → draft/);
	const same = me([{ old_string: "status: active", new_string: "status: draft" }, { old_string: "status: draft", new_string: "status: active" }]);
	assert.equal(same.status, 0, same.stderr);
	assert.equal(same.stdout, "");

	const asks = readLog(root).filter((l) => l.decision === "ask");
	assert.equal(asks.length, 7);
	assert.ok(asks.every((l) => l.reason === "status-down"));
});

test("guard: UC の active と契約の fixed への昇格は ask（status-up-gate）。新規作成でも同じ", (t) => {
	const root = makeRoot(t);
	const dir = "docs/goals/GOAL-01-x/UC-001-y";
	put(root, `${dir}/UC.md`, doc("draft"));
	put(root, `${dir}/contract.yaml`, `x-uc: UC-001\nx-status: draft # 凍結前\n`);

	const run = (tool_input) => runHook(root, { tool_input, cwd: root }, ["--code", "src/**"]);
	assert.match(askOf(run({ file_path: `${dir}/UC.md`, old_string: "status: draft", new_string: "status: active" })), /UC\.md の status を draft → active[\s\S]*人間ゲート/);
	assert.match(askOf(run({ file_path: `${dir}/contract.yaml`, old_string: "x-status: draft", new_string: "x-status: fixed" })), /x-status を draft → fixed/);
	//  新規作成で active / fixed を書く
	assert.match(askOf(run({ file_path: "docs/goals/GOAL-01-x/UC-002-z/UC.md", content: doc("active") })), /status を （新規） → active/);
	assert.match(askOf(run({ file_path: "docs/goals/GOAL-01-x/UC-002-z/contract.yaml", content: "x-status: 'fixed'\n" })), /（新規） → fixed/);

	const log = readLog(root);
	assert.equal(log.length, 4);
	assert.ok(log.every((l) => l.decision === "ask" && l.reason === "status-up-gate"));
});

test("guard: それ以外の昇格と新規作成は ask せず許可し、pass / status-up と記録する。status が変わらなければ記録しない", (t) => {
	const root = makeRoot(t);
	const dir = "docs/goals/GOAL-01-x/UC-001-y";
	put(root, `${dir}/REQ-001.md`, doc("draft"));
	put(root, "docs/goals/GOAL-01-x/GOAL.md", doc("draft"));
	put(root, "docs/00-overview.md", doc("draft"));
	put(root, `${dir}/UC.md`, doc("draft"));

	const run = (tool_input) => runHook(root, { tool_input, cwd: root, session_id: "s9" }, ["--code", "src/**"]);
	const passes = [
		run({ file_path: `${dir}/REQ-001.md`, old_string: "status: draft", new_string: "status: active" }), //  REQ draft → active
		run({ file_path: "docs/goals/GOAL-01-x/GOAL.md", old_string: "draft", new_string: "active", replace_all: true }), //  GOAL
		run({ file_path: "docs/00-overview.md", old_string: "status: draft", new_string: "status: living" }), //  単一文書 draft → living
		run({ file_path: `${dir}/REQ-002.md`, content: doc("draft") }), //  新規作成（draft）
		run({ file_path: "docs/rules/BR-001.md", content: doc("active") }), //  新規作成（BR を active で）
	];
	for (const r of passes) {
		assert.equal(r.status, 0, r.stderr);
		assert.equal(r.stdout, "");
	}
	//  status が変わらない書き込み・status を持たない新規ファイル・UC の draft のままの編集は記録しない
	for (const r of [
		run({ file_path: `${dir}/REQ-001.md`, old_string: "# 本文", new_string: "# 本文（改）" }),
		run({ file_path: "docs/notes.md", content: "# メモ\n" }),
		run({ file_path: `${dir}/UC.md`, old_string: "id: X", new_string: "id: UC-001" }),
		run({ file_path: `${dir}/REQ-001.md`, old_string: "存在しない", new_string: "x" }), //  Edit 自体が失敗する
	]) {
		assert.equal(r.status, 0, r.stderr);
		assert.equal(r.stdout, "");
	}
	const log = readLog(root);
	assert.equal(log.length, passes.length);
	assert.ok(log.every((l) => l.decision === "pass" && l.reason === "status-up" && l.session === "s9"));
	assert.deepEqual(
		log.map((l) => l.target),
		[`${dir}/REQ-001.md`, "docs/goals/GOAL-01-x/GOAL.md", "docs/00-overview.md", `${dir}/REQ-002.md`, "docs/rules/BR-001.md"],
	);
});

test("guard: 実装コードの判定中の例外は fail-closed（exit 2）", (t) => {
	const root = makeRoot(t);
	//  UC.md がディレクトリ → 読めずに例外
	mkdirSync(join(root, "docs", "goals", "GOAL-01-x", "UC-001-y", "UC.md"), { recursive: true });
	const r = runHook(root, { tool_input: { file_path: "src/x.js" }, cwd: root, session_id: "s1" }, ["--code", "src/**"]);
	assert.equal(r.status, 2, r.stdout);
	assert.match(r.stderr, /実装着手ゲートを判定できない/);
	const l = readLog(root).at(-1);
	assert.equal(l.decision, "block");
	assert.equal(l.reason, "internal-error");
	assert.equal(l.target, "src/x.js");

	//  --code に一致しない書き込みは同じ木でも影響を受けない
	const ok = runHook(root, { tool_input: { file_path: "README.md" }, cwd: root }, ["--code", "src/**"]);
	assert.equal(ok.status, 0, ok.stderr);
});

test("guard: 条件がそろえば実装コードへの書き込みを許可し、pass / ok と記録する", (t) => {
	const root = makeRoot(t);
	const dir = "docs/goals/GOAL-01-x/UC-001-y";
	put(root, `${dir}/UC.md`, doc("active", "phase: 実装\n").replace("id: X", "id: UC-001"));
	put(root, `${dir}/REQ-001.md`, doc("active"));
	put(root, `${dir}/contract.yaml`, "x-status: fixed\n");
	const r = runHook(root, { tool_input: { file_path: "src/x.js" }, cwd: root }, ["--code", "src/**"]);
	assert.equal(r.status, 0, r.stderr);
	const l = readLog(root).at(-1);
	assert.equal(l.decision, "pass");
	assert.equal(l.reason, "ok");
	assert.deepEqual(l.uc, ["UC-001"]);

	//  契約が draft → contract-not-fixed
	put(root, `${dir}/contract.yaml`, "x-status: draft\n");
	const b = runHook(root, { tool_input: { file_path: "src/x.js" }, cwd: root }, ["--code", "src/**"]);
	assert.equal(b.status, 2);
	assert.equal(readLog(root).at(-1).reason, "contract-not-fixed");
});

test("guard: x-status は共有のパーサーで読む（`x-status : fixed` も昇格として ask）。引用符付きの status への変更は降格", (t) => {
	const root = makeRoot(t);
	const dir = "docs/goals/GOAL-01-x/UC-001-y";
	put(root, `${dir}/contract.yaml`, "x-uc: UC-001\nx-status: draft\n");
	put(root, `${dir}/REQ-001.md`, doc("active"));
	const run = (tool_input) => runHook(root, { tool_input, cwd: root }, ["--code", "src/**"]);
	assert.match(askOf(run({ file_path: `${dir}/contract.yaml`, old_string: "x-status: draft", new_string: "x-status : fixed" })), /draft → fixed/);
	assert.match(askOf(run({ file_path: `${dir}/REQ-001.md`, old_string: "status: active", new_string: 'status: "active"' })), /active → "active"/);
});

test("guard: パスは大文字小文字を無視して比べる（Docs/ の status の降格、Src/ の実装コード）", (t) => {
	const root = makeRoot(t);
	put(root, "docs/goals/GOAL-01-x/UC-001-y/REQ-001.md", doc("active"));
	const run = (tool_input) => runHook(root, { tool_input, cwd: root }, ["--code", "src/**"]);
	//  大文字小文字を区別するファイルシステムでは別のファイルになるが、docs への書き込みとして status を判定し記録する
	assert.equal(run({ file_path: "Docs/goals/GOAL-01-x/UC-001-y/REQ-001.md", content: doc("draft") }).status, 0);
	assert.deepEqual(readLog(root).map((l) => [l.reason, l.target]), [["status-up", "Docs/goals/GOAL-01-x/UC-001-y/REQ-001.md"]]);
	const code = run({ file_path: "Src/app.ts", content: "x" });
	assert.equal(code.status, 2, code.stdout + code.stderr);
});

test("guard: 人間のアクターの削除・システムへの変更と、他プロバイダーやユーザーの hook 設定は ask", (t) => {
	const root = makeRoot(t);
	const table = (kind) => overview({ actors: [["ACT-01", "利用者", kind, "登録する"]] });
	put(root, "docs/00-overview.md", table("人間"));
	const run = (tool_input) => runHook(root, { tool_input, cwd: root }, ["--code", "src/**"]);
	assert.match(askOf(run({ file_path: "docs/00-overview.md", old_string: "| 人間 |", new_string: "| システム |" })), /人間のアクター（ACT-01）/);
	assert.equal(run({ file_path: "docs/00-overview.md", old_string: "登録する", new_string: "案件を登録する" }).stdout, "");
	assert.match(askOf(run({ file_path: ".codex/config.toml", content: "x" })), /hook/);
	assert.match(askOf(run({ file_path: ".claude/settings.team.json", content: "{}" })), /hook/);
	const home = join(makeRoot(t), ".claude", "settings.json");
	assert.match(askOf(run({ file_path: home, content: "{}" })), /hook の設定/);
	assert.deepEqual(readLog(root).map((l) => l.reason), ["actor-kind", "hook-settings", "hook-settings", "hook-settings"]);
});

test("guard: 保留の一覧（DEFERRED.md）を新しく作る・frozen_at を変える・行を足す書き込みは ask（deferred）。行を消すだけなら止めない", (t) => {
	const root = makeRoot(t);
	const file = "docs/verification/DEFERRED.md";
	const row = (id) => `| ${id} | 2026-01-01 | reviewer | docs/x.md | 指摘 | 理由 | 未定 |`;
	const body = (frozen, ids) => `---\nid: VERIFICATION_DEFERRED\nstatus: living\nfrozen_at: ${frozen}\n---\n\n## 保留中の指摘\n\n| ID | 起票日 | 出所 | 対象 | 指摘 | 理由 | 昇格先 |\n| --- | --- | --- | --- | --- | --- | --- |\n${ids.map(row).join("\n")}\n`;
	const run = (tool_input) => runHook(root, { tool_input, cwd: root }, ["--code", "src/**"]);
	//  新しく作る
	assert.match(askOf(run({ file_path: file, content: body("2026-01-01", []) })), /新しく作る。保留の一覧は凍結済み/);
	put(root, file, body("2026-01-01", ["DEF-001", "DEF-002"]));
	//  frozen_at を変える・消す
	assert.match(askOf(run({ file_path: file, old_string: "frozen_at: 2026-01-01", new_string: "frozen_at: 2026-06-01" })), /frozen_at を 2026-01-01 → 2026-06-01 に変える/);
	assert.match(askOf(run({ file_path: file, old_string: "frozen_at: 2026-01-01\n", new_string: "" })), /frozen_at を 2026-01-01 → （なし） に変える/);
	//  行を足す（起票日を凍結した日より前に偽っても、足すこと自体を承認に回す）。同じ ID の行を増やしても同じ
	assert.match(askOf(run({ file_path: file, content: body("2026-01-01", ["DEF-001", "DEF-002", "DEF-003"]) })), /行を足す（DEF-003）/);
	assert.match(askOf(run({ file_path: file, content: body("2026-01-01", ["DEF-001", "DEF-002", "DEF-002"]) })), /行を足す/);
	//  1 行消して別の ID を 1 行足す（行の数は同じ）
	assert.match(askOf(run({ file_path: file, content: body("2026-01-01", ["DEF-001", "DEF-009"]) })), /行を足す（DEF-009）/);
	//  コメントの中の例の行を消して、実際の行を足す
	put(root, file, body("2026-01-01", ["DEF-001"]) + `\n<!--\n${row("DEF-002")}\n-->\n`);
	assert.match(askOf(run({ file_path: file, content: body("2026-01-01", ["DEF-001", "DEF-002"]) })), /行を足す（DEF-002）/);
	put(root, file, body("2026-01-01", ["DEF-001", "DEF-002"]));
	//  monorepo の unit 配下の一覧（--docs の外）でも同じ。パスの大文字小文字も区別しない
	const unitFile = "apps/a/docs/verification/DEFERRED.md";
	assert.match(askOf(run({ file_path: unitFile, content: body("2026-01-01", []) })), /新しく作る/);
	put(root, unitFile, body("2026-01-01", ["DEF-001"]));
	assert.match(askOf(run({ file_path: "apps/a/docs/Verification/deferred.md", edits: [{ old_string: "frozen_at: 2026-01-01", new_string: "frozen_at: 2026-06-01" }] })), /保留の一覧は凍結済み/);
	assert.match(askOf(run({ file_path: unitFile, edits: [{ old_string: "frozen_at: 2026-01-01", new_string: "frozen_at: 2026-06-01" }] })), /frozen_at を/);
	assert.equal(run({ file_path: unitFile, content: body("2026-01-01", []) }).stdout, "");
	//  書き込み後の内容が分からない
	assert.match(askOf(run({ file_path: file, old_string: "この文は無い", new_string: "x" })), /判定できない/);
	//  行を消す・文言を直すだけなら止めない
	assert.equal(run({ file_path: file, content: body("2026-01-01", ["DEF-002"]) }).stdout, "");
	assert.equal(run({ file_path: file, old_string: "| 指摘 | 理由 | 未定 |\n| DEF-002", new_string: "| 指摘を直した | 理由 | 未定 |\n| DEF-002" }).stdout, "");
	assert.deepEqual(readLog(root).map((l) => l.reason), Array(11).fill("deferred"));
});

test("guard: active な UC の actor を変える書き込みは ask（actor-kind）。draft の UC は ask しない", (t) => {
	const root = makeRoot(t);
	const dir = "docs/goals/GOAL-01-x/UC-001-y";
	put(root, `${dir}/UC.md`, doc("active", "actor: ACT-01\n"));
	put(root, "docs/goals/GOAL-01-x/UC-002-z/UC.md", doc("draft", "actor: ACT-01\n"));
	const run = (tool_input) => runHook(root, { tool_input, cwd: root }, ["--code", "src/**"]);
	assert.match(askOf(run({ file_path: `${dir}/UC.md`, old_string: "actor: ACT-01", new_string: "actor: ACT-02" })), /actor ACT-01 → ACT-02/);
	assert.equal(run({ file_path: "docs/goals/GOAL-01-x/UC-002-z/UC.md", old_string: "actor: ACT-01", new_string: "actor: ACT-02" }).stdout, "");
});

test("guard: REQ は UC.md の「要件」の節から読む。draft の REQ があれば実装を止め、REQ の降格は承認を求める（ADR-0067）", (t) => {
	const root = mkdtempSync(join(tmpdir(), "harness guard reqs "));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const dir = "docs/goals/GOAL-01-x/UC-001-y";
	const ucDoc = (reqs) =>
		`---\nid: UC-001\nstatus: active\nphase: 実装\n---\n\n# UC-001\n\n## 要件\n\n${reqs.map(([id, st]) => `### ${id}\n\n- pattern: Ubiquitous\n- status: ${st}\n\n> 1 文\n`).join("\n")}`;
	const write = (rel, text) => {
		mkdirSync(join(root, rel, ".."), { recursive: true });
		writeFileSync(join(root, rel), text);
	};
	write(`${dir}/UC.md`, ucDoc([["REQ-001", "active"], ["REQ-002", "draft"]]));
	write(`${dir}/contract.yaml`, "x-uc: UC-001\nx-status: fixed\n");
	const hook = (input) =>
		spawnSync("node", [HOOK, "--code", "src/**"], {
			input: JSON.stringify({ tool_name: "Write", tool_input: input, cwd: root, session_id: "s" }),
			encoding: "utf8",
			env: { ...process.env, CLAUDE_PROJECT_DIR: root },
		});
	//  draft の REQ がある間は、実装コードを書けない
	const blocked = hook({ file_path: "src/a.ts", content: "x" });
	assert.equal(blocked.status, 2, blocked.stdout);
	assert.match(blocked.stderr, /draft の REQ がある（REQ-002）/);
	//  すべて active なら書ける
	write(`${dir}/UC.md`, ucDoc([["REQ-001", "active"], ["REQ-002", "active"]]));
	assert.equal(hook({ file_path: "src/a.ts", content: "x" }).status, 0);
	//  REQ の status を下げる書き込みと、active な REQ の小節を消す書き込みは、人間の承認を求める
	const ask = (r) => (r.stdout ? JSON.parse(r.stdout).hookSpecificOutput : null);
	const down = hook({ file_path: `${dir}/UC.md`, content: ucDoc([["REQ-001", "active"], ["REQ-002", "withdrawn"]]) });
	assert.equal(ask(down)?.permissionDecision, "ask", down.stdout + down.stderr);
	assert.match(ask(down).permissionDecisionReason, /REQ-002 の status/);
	const removed = hook({ file_path: `${dir}/UC.md`, content: ucDoc([["REQ-001", "active"]]) });
	assert.equal(ask(removed)?.permissionDecision, "ask");
	//  ひな形どおりに、status の後ろに案内のコメントがあっても、同じ値に読む（読み方がツールごとに割れない）
	const commented = (reqs) => ucDoc(reqs).replace(/- status: (\w+)/g, "- status: $1          # draft | active | withdrawn（active = 人間承認済み）");
	write(`${dir}/UC.md`, commented([["REQ-001", "active"], ["REQ-002", "draft"]]));
	const blocked2 = hook({ file_path: "src/a.ts", content: "x" });
	assert.equal(blocked2.status, 2, blocked2.stdout);
	assert.match(blocked2.stderr, /draft の REQ がある（REQ-002）/);
	write(`${dir}/UC.md`, commented([["REQ-001", "active"], ["REQ-002", "active"]]));
	const down2 = hook({ file_path: `${dir}/UC.md`, content: commented([["REQ-001", "active"], ["REQ-002", "draft"]]) });
	assert.equal(ask(down2)?.permissionDecision, "ask", down2.stdout + down2.stderr);
	//  コメントを足すだけの書き込みは、降格ではない
	const addComment = hook({ file_path: `${dir}/UC.md`, content: commented([["REQ-001", "active"], ["REQ-002", "active"]]).replace("人間承認済み）", "人間承認済み）。補足") });
	assert.equal(ask(addComment), null);
	write(`${dir}/UC.md`, ucDoc([["REQ-001", "active"], ["REQ-002", "active"]]));
	//  REQ の昇格と、active での追加は、止めずに記録する（status-up）
	write(`${dir}/UC.md`, ucDoc([["REQ-001", "active"], ["REQ-002", "draft"]]));
	const up = hook({ file_path: `${dir}/UC.md`, content: ucDoc([["REQ-001", "active"], ["REQ-002", "active"]]) });
	assert.equal(up.status, 0);
	assert.equal(ask(up), null);
	const logged = readFileSync(join(root, ".harness-gate", "log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).at(-1);
	assert.deepEqual([logged.decision, logged.reason], ["pass", "status-up"]);
	write(`${dir}/UC.md`, ucDoc([["REQ-001", "active"], ["REQ-002", "active"]]));
	//  語彙の外の status と、節の外に書いた REQ があるときも、実装を止める
	for (const bad of ["Draft", '"draft"', "draft#x"]) {
		write(`${dir}/UC.md`, ucDoc([["REQ-001", "active"], ["REQ-002", bad]]));
		assert.equal(hook({ file_path: "src/a.ts", content: "x" }).status, 2, bad);
	}
	write(`${dir}/UC.md`, ucDoc([["REQ-001", "active"]]).replace("## 要件", "## 概要\n\n### REQ-002\n\n- status: draft\n\n> y\n\n## 要件"));
	const outside = hook({ file_path: "src/a.ts", content: "x" });
	assert.equal(outside.status, 2, outside.stdout);
	assert.match(outside.stderr, /「要件」の節の書き方の誤り 1 件/);
	//  撤回済みの REQ は、実装を止めない
	write(`${dir}/UC.md`, ucDoc([["REQ-001", "active"], ["REQ-002", "withdrawn"]]));
	assert.equal(hook({ file_path: "src/a.ts", content: "x" }).status, 0);
	write(`${dir}/UC.md`, ucDoc([["REQ-001", "active"], ["REQ-002", "active"]]));
	//  status が変わらない書き込みは、そのまま通す
	const same = hook({ file_path: `${dir}/UC.md`, content: ucDoc([["REQ-001", "active"], ["REQ-002", "active"]]).replace("> 1 文", "> 1 文（直し）") });
	assert.equal(same.status, 0);
	assert.equal(ask(same), null);
});

//  ---- 概要の GOAL の表と全体の方針（ADR-0076） ----

test("guard: 概要の GOAL の行の削除と active からの降格は ask、planned から active への昇格は記録して通す", (t) => {
	const root = makeRoot(t);
	const base = overview({ goals: [goal("GOAL-01", "active"), goal("GOAL-02", "planned"), goal("GOAL-03", "draft")] });
	put(root, "docs/00-overview.md", base);
	const run = (tool_input) => runHook(root, { tool_input, cwd: root }, ["--code", "src/**"]);
	//  Write で丸ごと書き直し、active の行を消す
	assert.match(askOf(run({ file_path: "docs/00-overview.md", content: overview({ goals: [goal("GOAL-02", "planned"), goal("GOAL-03", "draft")] }) })), /GOAL-01 の行/);
	//  planned の行を消すのも、status によらず ask
	assert.match(askOf(run({ file_path: "docs/00-overview.md", content: overview({ goals: [goal("GOAL-01", "active"), goal("GOAL-03", "draft")] }) })), /GOAL-02 の行/);
	//  active → draft
	assert.match(askOf(run({ file_path: "docs/00-overview.md", content: overview({ goals: [goal("GOAL-01", "draft"), goal("GOAL-02", "planned"), goal("GOAL-03", "draft")] }) })), /GOAL-01 の status を active → draft/);
	//  同じ ID の行が 2 つになり、片方だけ active のままでも、active でなくなった行があれば降格（読み方は重複の行を落とす）
	const dup = overview({ goals: [goal("GOAL-01", "draft"), goal("GOAL-01", "active"), goal("GOAL-02", "planned"), goal("GOAL-03", "draft")] });
	assert.match(askOf(run({ file_path: "docs/00-overview.md", content: dup })), /GOAL-01 の status/);
	//  planned → active は記録して通す
	const up = run({ file_path: "docs/00-overview.md", content: overview({ goals: [goal("GOAL-01", "active"), goal("GOAL-02", "active"), goal("GOAL-03", "draft")] }) });
	assert.equal(up.stdout, "", up.stderr);
	assert.deepEqual(readLog(root).filter((l) => l.decision === "pass").map((l) => l.reason), ["status-up"]);
	//  planned ↔ draft の行き来と行の追加（active でない）は何もしない
	assert.equal(run({ file_path: "docs/00-overview.md", content: overview({ goals: [goal("GOAL-01", "active"), goal("GOAL-02", "draft"), goal("GOAL-03", "planned"), goal("GOAL-04", "planned")] }) }).stdout, "");
});

test("guard: 全体の方針の本文を変える書き込みは、概要が draft でも living でも ask", (t) => {
	for (const status of ["draft", "living"]) {
		const root = makeRoot(t);
		put(root, "docs/00-overview.md", overview({ status }));
		const run = (tool_input) => runHook(root, { tool_input, cwd: root }, ["--code", "src/**"]);
		const filled = overview({ status, policies: { 同時に届いた要求: "先に届いた要求を通し、後の要求には競合を返す。" } });
		//  未記入 → 記入
		assert.match(askOf(run({ file_path: "docs/00-overview.md", content: filled })), /全体の方針の「同時に届いた要求」/);
		put(root, "docs/00-overview.md", filled);
		//  記入 → 別の文
		assert.match(askOf(run({ file_path: "docs/00-overview.md", old_string: "競合を返す。", new_string: "再試行を促す。" })), /全体の方針/);
		//  記入 → 未記入
		assert.match(askOf(run({ file_path: "docs/00-overview.md", content: overview({ status }) })), /全体の方針/);
		//  方針以外の本文の書き換えは通す
		assert.equal(run({ file_path: "docs/00-overview.md", old_string: "課題", new_string: "利用者の課題" }).stdout, "");
	}
});
