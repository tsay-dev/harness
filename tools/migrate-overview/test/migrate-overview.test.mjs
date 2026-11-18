//  migrate overview（00-vision.md・02-actors.md・goals-backlog.md・GOAL.md を 00-overview.md へ移す）と、概要の読み方のテスト
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COL, OVERVIEW_TEMPLATE, overviewFormat, readOverview, renderOverview } from "../../_shared/overview.mjs";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..", "migrate-overview.mjs");
const TEMP = [];
after(() => TEMP.forEach((d) => rmSync(d, { recursive: true, force: true })));

function project(files) {
	const d = mkdtempSync(join(tmpdir(), "migrate-overview-"));
	TEMP.push(d);
	for (const [f, body] of Object.entries(files)) {
		mkdirSync(dirname(join(d, f)), { recursive: true });
		writeFileSync(join(d, f), body);
	}
	return d;
}
const run = (d, args = []) => spawnSync(process.execPath, [TOOL, "--root", d, ...args], { encoding: "utf8", input: "" });

const VISION = `---\nid: VISION\nstatus: frozen\n---\n\n# Vision\n\n## 解決する課題\n\n<!-- 誰のどの課題か。測定された現状値があるなら必ず示す（R-104: 測定できないことを主張してはならない）。 -->\n\n利用者は登録の状況を自分で確かめられない。\n\n## 対象ユーザー\n\n- 利用者: 登録する人。\n\n## 成功の定義\n\n| 指標 | 現状 | 目標 |\n| --- | --- | --- |\n| KPI-01 月間の登録数 | \`未計測\` | 100 |\n| KPI-02 継続率（a\\|b） | 1 | 2 |\n\nKPI-02 は候補。\n\n## やらないこと（Out of Scope）\n\n- 決済。\n\n## 背景\n\n昔の経緯。\n\n> この文書が持つ唯一の情報: 存在理由と削除判断の根拠。\n> 機能一覧・画面・技術選定はここに書かない。\n\n<!-- 本文は日本語で書く。 -->\n`;
const ACTORS = (status = "living") =>
	`---\nid: ACTORS\nstatus: ${status}\n---\n\n# アクター\n\n## アクター一覧（この表は閉じている）\n\n| ID | アクター | 種別 | 説明 |\n| --- | --- | --- | --- |\n| ACT-01 | 利用者 | 人間 / 認証済 | 登録する |\n| ACT-02 | 夜間バッチ | システム / スケジューラー | 集計する |\n\n宛先のメンバーは表に含めない。\n\nゴールの定義は \`docs/goals/<GOAL-nn-slug>/GOAL.md\`（1 ゴール 1 ディレクトリ / R-1006）。\n未着手ゴールは \`docs/goals-backlog.md\`（R-1008）。\n`;
const GOAL = (id, status, body = `> ${id} の目指す状態。`) => `---\nid: ${id}\nactor: ACT-01\norigin: KPI-01\nstatus: ${status}\n---\n\n# ${id}\n\n${body}\n`;
const BACKLOG = `---\nid: GOALS_BACKLOG\nstatus: living\n---\n\n# ゴール・バックログ（未着手）\n\n実現を開始したら \`docs/goals/<GOAL-nn-slug>/\` を切り、GOAL.md へ昇格させる（R-1008）。\n\n### GOAL-05\n- **actor**: ACT-01\n- **由来**: KPI-02\n- **status**: planned\n\n> 未着手の目指す状態を\n> 2 行で書いたもの。\n`;
const base = () => ({
	"docs/00-vision.md": VISION,
	"docs/02-actors.md": ACTORS(),
	"docs/goals-backlog.md": BACKLOG,
	"docs/goals/GOAL-01-a/GOAL.md": GOAL("GOAL-01", "active          # draft | active | withdrawn（active = 人間承認済み。2026-10-15 承認）"),
	"docs/goals/GOAL-01-a/UC-001-b/UC.md": "---\nid: UC-001\n---\n",
	"docs/goals/GOAL-02-b/GOAL.md": GOAL("GOAL-02", "withdrawn", "撤回: 別のゴールに作り直した（ADR-0005）。\n\n> GOAL-02 の目指す状態。"),
	"docs/notes.md": "古い 02-actors.md を参照している。\n",
});

test("--write なしでは、移せることを表示するだけで何も書き換えない。設定の変更の案を出す", () => {
	const d = project({ ...base(), "harness.config.json": JSON.stringify({ docs: { goals_dir: "docs/goals", vision: "docs/00-vision.md", actors: "docs/02-actors.md", goals_backlog: "docs/goals-backlog.md" } }) });
	const r = run(d);
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /移せる: docs\/00-overview\.md を作り、5 件の文書を消す/);
	assert.match(r.stdout, /概要の status は living（vision: frozen、アクター表: living）/);
	assert.match(r.stdout, /ref {2}docs\/notes\.md:1/);
	assert.match(r.stdout, /cfg {2}docs に "overview": "docs\/00-overview\.md" を足す/);
	assert.match(r.stdout, /"vision"・"actors"・"goals_backlog" を消す/);
	assert.ok(!existsSync(join(d, "docs/00-overview.md")));
	assert.ok(existsSync(join(d, "docs/goals/GOAL-01-a/GOAL.md")));
});

test("--write で概要を書き、古い文書を消す。読み戻すと元の行と同じで、撤回の理由と status の後ろの文は備考に入る", () => {
	const d = project(base());
	const r = run(d, ["--write"]);
	assert.equal(r.status, 0, r.stdout + r.stderr);
	for (const f of ["docs/00-vision.md", "docs/02-actors.md", "docs/goals-backlog.md", "docs/goals/GOAL-01-a/GOAL.md", "docs/goals/GOAL-02-b/GOAL.md"]) assert.ok(!existsSync(join(d, f)), f);
	const text = readFileSync(join(d, "docs/00-overview.md"), "utf8");
	const ov = readOverview(text);
	assert.deepEqual(ov.problems, []);
	assert.equal(ov.status, "living");
	assert.deepEqual(ov.kpis.map((k) => Object.values(k.cells)), [["KPI-01", "月間の登録数", "`未計測`", "100"], ["KPI-02", "継続率（a|b）", "1", "2"]]);
	assert.deepEqual(ov.actors.map((a) => [a.id, a.kind]), [["ACT-01", "人間 / 認証済"], ["ACT-02", "システム / スケジューラー"]]);
	assert.deepEqual(
		ov.goals.map((g) => [g.id, g.status, g.sentence, g.note]),
		[
			["GOAL-01", "active", "GOAL-01 の目指す状態。", "2026-10-15 承認"],
			["GOAL-02", "withdrawn", "GOAL-02 の目指す状態。", "撤回: 別のゴールに作り直した（ADR-0005）。"],
			["GOAL-05", "planned", "未着手の目指す状態を 2 行で書いたもの。", ""],
		],
	);
	//  対象ユーザーはアクターの表の前、表の後の文は残し、ひな形の案内は落とす。知らない節は末尾に
	assert.match(text, /## アクター（この表は閉じている）\n\n- 利用者: 登録する人。\n\n\| ID \|/);
	assert.match(text, /宛先のメンバーは表に含めない。/);
	assert.doesNotMatch(text, /ゴールの定義は|この文書が持つ唯一の情報|誰のどの課題か/);
	assert.match(text, /KPI-02 は候補。/);
	assert.match(text, /## 背景\n\n昔の経緯。/);
	assert.ok(existsSync(join(d, "docs/goals/GOAL-01-a/UC-001-b/UC.md")));
});

test("移せないものが 1 つでもあれば、--write でも何も書かない（案内でない HTML コメント、2 段落の GOAL 文、定形の外の行）", () => {
	const cases = {
		"docs/goals/GOAL-01-a/GOAL.md": GOAL("GOAL-01", "draft", "> 状態。\n\n<!-- 人が決めること: アクターを足すか -->"),
		"docs/goals/GOAL-02-b/GOAL.md": GOAL("GOAL-02", "active", "> 1 つ目。\n\n> 2 つ目。"),
		"docs/goals-backlog.md": BACKLOG.replace("> 未着手の", "補足の段落。\n\n> 未着手の"),
	};
	for (const [file, text] of Object.entries(cases)) {
		const d = project({ ...base(), [file]: text });
		const r = run(d, ["--write"]);
		assert.equal(r.status, 1, `${file}: ${r.stdout}`);
		assert.match(r.stdout, /どのファイルも書き換えていない/);
		assert.ok(!existsSync(join(d, "docs/00-overview.md")));
		assert.ok(existsSync(join(d, "docs/00-vision.md")));
	}
});

test("vision とアクター表の status が食い違えば、降格させずに失敗する", () => {
	const d = project({ ...base(), "docs/02-actors.md": ACTORS("draft") });
	const r = run(d, ["--write"]);
	assert.equal(r.status, 1, r.stdout);
	assert.match(r.stdout, /vision の status（frozen）とアクター表の status（draft）が食い違う/);
});

test("バックログの ID のフォルダがあれば矛盾として失敗する。古いキーのパスがあれば、そのパスを読む", () => {
	const clash = project({ ...base(), "docs/goals/GOAL-05-c/UC-009-x/UC.md": "---\nid: UC-009\n---\n" });
	assert.match(run(clash).stdout, /GOAL-05 は未着手なのに、同じ ID のフォルダがある/);
	const files = base();
	files["docs/product/vision.md"] = files["docs/00-vision.md"];
	delete files["docs/00-vision.md"];
	const d = project({ ...files, "harness.config.json": JSON.stringify({ docs: { goals_dir: "docs/goals", vision: "docs/product/vision.md", actors: "docs/02-actors.md" } }) });
	const r = run(d, ["--write"]);
	assert.equal(r.status, 0, r.stdout);
	assert.ok(!existsSync(join(d, "docs/product/vision.md")));
	assert.equal(readOverview(readFileSync(join(d, "docs/00-overview.md"), "utf8")).kpis.length, 2);
});

test("移す文書が無い unit では何もせず、vision とアクター表の none から設定の案を出す", () => {
	const none = { none: "静的な頁だけを持つ" };
	const lp = project({ "docs/goals/.gitkeep": "", "harness.config.json": JSON.stringify({ docs: { goals_dir: "docs/goals", vision: none, actors: "docs/02-actors.md" } }) });
	const r = run(lp);
	assert.equal(r.status, 0);
	assert.match(r.stdout, /移す文書が無い/);
	assert.match(r.stdout, /"overview" は人が決める（推奨: \{ "none": "静的な頁だけを持つ" \}/);
	const infra = project({ "docs/goals/.gitkeep": "", "harness.config.json": JSON.stringify({ docs: { goals_dir: "docs/goals", vision: none, actors: none } }) });
	assert.match(run(infra).stdout, /"overview": \{ "none": "静的な頁だけを持つ" \} を足す/);
});

//  ---- 概要の読み方（tools/_shared/overview.mjs） ----

test("読み方: ひな形の列の見出しは、検査が意味を読む列の名前と同じ。ひな形を読んでも問題は出ない", () => {
	const fmt = overviewFormat();
	assert.deepEqual(fmt.columns.goals.optional, [COL.domain]);
	for (const c of [COL.id, COL.sentence, COL.actor, COL.kpi, COL.status, COL.note]) assert.ok(fmt.columns.goals.required.includes(c), c);
	assert.ok(fmt.columns.actors.required.includes(COL.kind));
	assert.deepEqual(fmt.policies, ["同時に届いた要求", "外部の情報の遅れ", "外部が応答しない"]);
	assert.deepEqual(readOverview(readFileSync(OVERVIEW_TEMPLATE, "utf8")).problems, []);
});

test("読み方: 列の見出しの誤り、ID の形の誤り、同じ ID の行、列の数の食い違い（| のエスケープ漏れ）を問題にする。任意の列（ドメイン）は読める", () => {
	const ok = renderOverview({ status: "draft", goals: [{ id: "GOAL-01", sentence: "a", actor: "ACT-01", origin: "KPI-01", status: "draft", note: "", domain: "会員" }] });
	const ov = readOverview(ok);
	assert.deepEqual(ov.problems, []);
	assert.equal(ov.goals[0].domain, "会員");
	const bad = ok
		.replace("| ID | 目指す状態 |", "| ID | 目標の状態 |")
		.replace("| GOAL-01 | a |", "| GOAL-01 | a |")
		.replace(/(\| KPI \| status)/, "$1");
	assert.match(readOverview(bad).problems.map((p) => p.msg).join("\n"), /列の見出しがひな形と違う.*無い列: 目指す状態.*知らない列: 目標の状態/);
	const rows = renderOverview({
		goals: [
			{ id: "GOAL-01", sentence: "a", actor: "", origin: "", status: "draft", note: "" },
			{ id: "GOAL-01", sentence: "b", actor: "", origin: "", status: "draft", note: "" },
			{ id: "G-2", sentence: "c", actor: "", origin: "", status: "draft", note: "" },
		],
	}).replace("| b |", "| b | x |");
	const msgs = readOverview(rows.replace("| GOAL-01 | b | x |", "| GOAL-01 | b |")).problems.map((p) => p.msg).join("\n");
	assert.match(msgs, /GOAL-01 の行が 2 つある/);
	assert.match(msgs, /ID は GOAL-nn の形にする（実際: "G-2"）/);
	assert.match(readOverview(rows).problems.map((p) => p.msg).join("\n"), /列の数（7）が見出し（6）と違う/);
});
