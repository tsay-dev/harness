//  trace-check の回帰検証（C15: シナリオテストの存在、C16–C18: docs 同士の参照先の実在）。一時ディレクトリに最小の docs / e2e を組む。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, "..", "trace-check.mjs");
const TEMPLATE = join(HERE, "..", "..", "..", "templates", "develop", "traceconfig.json");

function run(root, ...args) {
	return spawnSync("node", [TOOL, "--root", root, ...args], { encoding: "utf8" });
}

function makeRoot({ system = true } = {}) {
	const root = mkdtempSync(join(tmpdir(), "harness trace-check "));
	const cfg = JSON.parse(readFileSync(TEMPLATE, "utf8"));
	delete cfg._comment;
	delete cfg.contract;
	delete cfg.schema;
	delete cfg.source;
	delete cfg.layering;
	if (!system) delete cfg.tests.system;
	writeFileSync(join(root, "traceconfig.json"), JSON.stringify(cfg, null, 2) + "\n");

	const w = (rel, text) => {
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), text);
	};
	w("docs/02-actors.md", "---\nid: ACTORS\nstatus: living\n---\n\n# アクター\n\n| ID | アクター | 種別 | 説明 |\n| --- | --- | --- | --- |\n| ACT-01 | 利用者 | 人間 / 認証済 | 案件を登録する |\n| ACT-02 | 夜間バッチ | システム | 集計する |\n");
	w("docs/goals/GOAL-01-register/GOAL.md", "---\nid: GOAL-01\nstatus: active\nactor: ACT-01\n---\n\n# GOAL-01\n");
	const uc = (id, actor, status = "active") => `---\nid: ${id}\ntitle: t\nactor: ${actor}\ngoal: GOAL-01\nstatus: ${status}\nphase: 実装\n---\n\n# ${id}\n`;
	w("docs/goals/GOAL-01-register/UC-001-register/UC.md", uc("UC-001", "ACT-01"));
	w("docs/goals/GOAL-01-register/UC-002-aggregate/UC.md", uc("UC-002", "ACT-02"));
	w("docs/goals/GOAL-01-register/UC-003-browse/UC.md", uc("UC-003", "ACT-01"));
	w("docs/goals/GOAL-01-register/UC-004-old/UC.md", uc("UC-004", "ACT-01", "withdrawn"));
	w("e2e/register.spec.ts", "// @scenario UC-001\ntest('UC-001 案件を登録できる', async () => {});\n// @scenario UC-999\ntest('UC-999 存在しない', async () => {});\n");
	return root;
}

test("C15: 人間アクターの active UC にシナリオテストを要求し、システムアクターと withdrawn は要求しない。未定義 UC への @scenario は違反", (t) => {
	const root = makeRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root, "--only", "C15", "--strict");
	assert.equal(r.status, 1, r.stdout + r.stderr);
	assert.match(r.stdout, /\[C15\] UC-003 \(active、アクター ACT-01\) にシナリオテストが存在しない/);
	assert.match(r.stdout, /\[C15\] register\.spec\.ts:3: 未定義の UC-999 を @scenario している/);
	assert.doesNotMatch(r.stdout, /\[C15\] UC-001 /);
	assert.doesNotMatch(r.stdout, /\[C15\] UC-002 /);
	assert.doesNotMatch(r.stdout, /\[C15\] UC-004 /);
});

test("C15: tests.system が無ければ判定しない", (t) => {
	const root = makeRoot({ system: false });
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root, "--only", "C15", "--strict");
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.doesNotMatch(r.stdout, /\[C15\]/);
});

test("レポート: 各 UC の行にシナリオテストの所在を出す", (t) => {
	const root = makeRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root, "--strict");
	assert.match(r.stdout, /UC-001 \(UC-001-register\/\)  \[実装\]  scenario:register\.spec\.ts:1/);
	assert.match(r.stdout, /UC-003 \(UC-003-browse\/\)  \[実装\]  scenario:-/);
	assert.match(r.stdout, /シナリオテスト: 2/);
});

//  C16–C18 用: BR / REQ / vision を持つ docs。draft と withdrawn、HTML コメント、プレースホルダーは判定の外に置く
function makeRefRoot({ vision = true } = {}) {
	const root = mkdtempSync(join(tmpdir(), "harness trace-check refs "));
	const cfg = JSON.parse(readFileSync(TEMPLATE, "utf8"));
	for (const k of ["_comment", "contract", "schema", "source", "layering"]) delete cfg[k];
	delete cfg.tests.system;
	if (!vision) delete cfg.docs.vision;
	writeFileSync(join(root, "traceconfig.json"), JSON.stringify(cfg, null, 2) + "\n");

	const w = (rel, text) => {
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), text);
	};
	const fm = (fields) => `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\n`;
	const g = "docs/goals/GOAL-01-register";
	w("docs/00-vision.md", `${fm({ id: "VISION", status: "frozen" })}# Vision\n\n## 成功の定義\n\n| 指標 | 現状 | 目標 |\n| --- | --- | --- |\n| KPI-01 登録率 | 10% | 30% |\n`);
	w("docs/02-actors.md", `${fm({ id: "ACTORS", status: "living" })}| ID | アクター | 種別 | 説明 |\n| --- | --- | --- | --- |\n| ACT-01 | 利用者 | 人間 | 登録する |\n`);
	w("docs/rules/BR-001.md", `${fm({ id: "BR-001", title: "t", enforced_at: "domain 層", status: "active" })}# BR-001\n`);
	w(`${g}/GOAL.md`, `${fm({ id: "GOAL-01", actor: "ACT-09", origin: "KPI-01, KPI-02", status: "active" })}# GOAL-01\n`);
	w("docs/goals/GOAL-02-draft/GOAL.md", `${fm({ id: "GOAL-02", actor: "ACT-07", origin: "KPI-07", status: "draft" })}# GOAL-02\n`);
	const uc = (id, actor, status, body) => `${fm({ id, title: "t", actor, goal: "GOAL-01", status, phase: "定義" })}# ${id}\n\n${body}`;
	w(`${g}/UC-001-register/UC.md`, uc("UC-001", "ACT-08", "active",
		"- 適用される業務規則: BR-001, BR-009\n\n<!-- 例: BR-007 や REQ-007 はコメントなので数えない -->\n\n| 状態 \\ イベント | 登録 | 取消 |\n| --- | --- | --- |\n| 未登録 | REQ-001 | REQ-002 |\n| 登録済 | REQ-003 | REQ-000 |\n"));
	w(`${g}/UC-002-browse/UC.md`, uc("UC-002", "ACT-01", "active", "| 状態 \\ イベント | 閲覧 |\n| --- | --- |\n| 登録済 | REQ-003 |\n"));
	w(`${g}/UC-003-draft/UC.md`, uc("UC-003", "ACT-06", "draft", "- BR-006\n\n| 状態 \\ イベント | 閲覧 |\n| --- | --- |\n| 登録済 | REQ-006 |\n"));
	const req = (id, uc, status, br) => `${fm({ id, pattern: "Ubiquitous", uc, ...(br ? { br } : {}), status })}# ${id}\n\n> 1 文\n`;
	w(`${g}/UC-001-register/REQ-001.md`, req("REQ-001", "UC-001", "active", "BR-008"));
	w(`${g}/UC-001-register/REQ-004.md`, req("REQ-004", "UC-001", "draft", "BR-005"));
	w(`${g}/UC-001-register/REQ-005.md`, req("REQ-005", "UC-001", "withdrawn"));
	w(`${g}/UC-002-browse/REQ-003.md`, req("REQ-003", "UC-002", "active", "BR-001"));
	return root;
}

test("C16: active な UC / REQ が参照する未定義の BR を検出し、draft・コメント・プレースホルダーは数えない", (t) => {
	const root = makeRefRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root, "--only", "C16", "--strict");
	assert.equal(r.status, 1, r.stdout + r.stderr);
	assert.match(r.stdout, /\[C16\] UC-001 が未定義の BR-009 を参照している/);
	assert.match(r.stdout, /\[C16\] REQ-001 が未定義の BR-008 を参照している/);
	for (const id of ["BR-001", "BR-005", "BR-006", "BR-007"]) assert.doesNotMatch(r.stdout, new RegExp(`\\[C16\\].*${id}`));
});

test("C17: active な UC の表と REQ の 1 対 1 対応（未定義・他 UC の REQ・表に無い REQ）を検出し、withdrawn と draft UC は数えない", (t) => {
	const root = makeRefRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root, "--only", "C17", "--strict");
	assert.equal(r.status, 1, r.stdout + r.stderr);
	assert.match(r.stdout, /\[C17\] UC-001 の表が未定義の REQ-002 を指している/);
	assert.match(r.stdout, /\[C17\] UC-001 の表が UC-002 の REQ-003 を指している/);
	assert.match(r.stdout, /\[C17\] REQ-004 が UC-001 の表のどのセルからも導出されていない/);
	for (const id of ["REQ-000", "REQ-001", "REQ-005", "REQ-006", "REQ-007"]) assert.doesNotMatch(r.stdout, new RegExp(`\\[C17\\].*${id}`));
	assert.doesNotMatch(r.stdout, /\[C17\] UC-002/);
});

test("C18: active な GOAL / UC の actor と GOAL の origin が表に無ければ違反、draft は数えない", (t) => {
	const root = makeRefRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root, "--only", "C18", "--strict");
	assert.equal(r.status, 1, r.stdout + r.stderr);
	assert.match(r.stdout, /\[C18\] GOAL-01 の actor ACT-09 が docs\/02-actors\.md に無い/);
	assert.match(r.stdout, /\[C18\] GOAL-01 の origin KPI-02 が docs\/00-vision\.md に無い/);
	assert.match(r.stdout, /\[C18\] UC-001 の actor ACT-08 が docs\/02-actors\.md に無い/);
	for (const id of ["KPI-01", "ACT-01", "ACT-06", "ACT-07", "KPI-07"]) assert.doesNotMatch(r.stdout, new RegExp(`\\[C18\\].*${id}`));
});

test("C18: docs.vision が未宣言なら origin を判定しない", (t) => {
	const root = makeRefRoot({ vision: false });
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root, "--only", "C18", "--strict");
	assert.doesNotMatch(r.stdout, /origin/);
	assert.match(r.stdout, /\[C18\] GOAL-01 の actor ACT-09/);
});

//  C19 用: 実現単位を置く場所（source.unit_dirs）と、その外の技術部品（infra）
function makeSourceRoot({ placement = "before", configure = () => {} } = {}) {
	const root = mkdtempSync(join(tmpdir(), "harness trace-check source "));
	const cfg = JSON.parse(readFileSync(TEMPLATE, "utf8"));
	for (const k of ["_comment", "contract", "schema", "layering"]) delete cfg[k];
	delete cfg.tests.system;
	cfg.source.implements_placement = placement;
	configure(cfg);
	writeFileSync(join(root, "traceconfig.json"), JSON.stringify(cfg, null, 2) + "\n");
	const w = (rel, text) => {
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), text);
	};
	w(
		"src/usecase/register.ts",
		placement === "before"
			? "/** @implements REQ-001 */\nexport function register() {}\n\nexport class Unlinked {}\n\nfunction helper() {}\n"
			: "export function register() {\n\t// @implements REQ-001\n}\n\nexport class Unlinked {}\n",
	);
	//  REQ を持たない技術部品は unit_dirs の外に置き、注釈も印も持たない
	w("src/infra/date.ts", "export const formatDate = () => {};\n");
	return root;
}

for (const placement of ["before", "after"])
	test(`C19: source.unit_dirs の実現単位に @implements が無ければ違反、unit_dirs の外は見ない（implements_placement: ${placement}）`, (t) => {
		const root = makeSourceRoot({ placement });
		t.after(() => rmSync(root, { recursive: true, force: true }));
		const r = run(root, "--only", "C19", "--strict");
		assert.equal(r.status, 1, r.stdout + r.stderr);
		assert.match(r.stdout, /\[C19\] register\.ts:\d+ "Unlinked": @implements の無い実現単位/);
		assert.doesNotMatch(r.stdout, /\[C19\].*"(register|formatDate|helper)"/);
	});

test("C19: レポートに実現単位の内訳を出し、unit_dirs が無ければ判定しない", (t) => {
	const root = makeSourceRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	assert.match(run(root, "--strict").stdout, /実現単位: 2（@implements なし 1）/);
	const off = makeSourceRoot({ configure: (cfg) => delete cfg.source.unit_dirs });
	t.after(() => rmSync(off, { recursive: true, force: true }));
	const r = run(off, "--only", "C19", "--strict");
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.doesNotMatch(r.stdout, /\[C19\]/);
});

test("設定エラー: unit_dirs に unit_pattern が無い、または廃止した exempt_pattern が残っている", (t) => {
	const cases = [
		[(cfg) => delete cfg.source.unit_pattern, /source\.unit_dirs を宣言したら source\.unit_pattern/],
		[(cfg) => (cfg.source.exempt_pattern = "//\\s*仕様外:"), /source\.exempt_pattern は廃止/],
		[(cfg) => (cfg.tests.exempt_pattern = "//\\s*仕様外:"), /tests\.exempt_pattern は廃止/],
	];
	for (const [configure, message] of cases) {
		const root = makeSourceRoot({ configure });
		t.after(() => rmSync(root, { recursive: true, force: true }));
		const r = run(root, "--strict");
		assert.equal(r.status, 2, r.stdout + r.stderr);
		assert.match(r.stderr, message);
	}
});

//  C20 用: テストで検証する NFR、measured_by で計測する NFR、どちらも無い NFR
function makeNfrRoot() {
	const root = mkdtempSync(join(tmpdir(), "harness trace-check nfr "));
	const cfg = JSON.parse(readFileSync(TEMPLATE, "utf8"));
	for (const k of ["_comment", "contract", "schema", "source", "layering"]) delete cfg[k];
	writeFileSync(join(root, "traceconfig.json"), JSON.stringify(cfg, null, 2) + "\n");
	const w = (rel, text) => {
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), text);
	};
	const nfr = (id, status, measuredBy) => `---\nid: ${id}\ncategory: performance\n${measuredBy ? `measured_by: ${measuredBy}\n` : ""}status: ${status}\n---\n\n# ${id}\n\n> p95 が 300ms 以下\n`;
	w("docs/nfr/NFR-001.md", nfr("NFR-001", "active"));
	w("docs/nfr/NFR-002.md", nfr("NFR-002", "active", "perf/load.js"));
	w("docs/nfr/NFR-003.md", nfr("NFR-003", "active"));
	w("docs/nfr/NFR-004.md", nfr("NFR-004", "active", "perf/missing.js"));
	w("docs/nfr/NFR-005.md", nfr("NFR-005", "draft"));
	w("perf/load.js", "// 負荷試験\n");
	w("tests/perf.test.ts", "// @covers NFR-001\ntest('一覧の応答', () => {});\n");
	w("e2e/perf.spec.ts", "// @covers NFR-009\ntest('存在しない NFR', () => {});\n");
	return root;
}

test("C20: active な NFR にテストか measured_by を求め、measured_by の不在と未定義 NFR への @covers も検出する", (t) => {
	const root = makeNfrRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root, "--strict");
	assert.match(r.stdout, /\[C20\] NFR-003 \(active\) を検証するテストも measured_by も無い/);
	assert.match(r.stdout, /\[C20\] NFR-004 の measured_by perf\/missing\.js が無い/);
	assert.match(r.stdout, /\[C20\] perf\.spec\.ts:1: 未定義の NFR-009 を @covers している/);
	assert.doesNotMatch(r.stdout, /\[C20\].*NFR-00[125]/);
	assert.match(r.stdout, /OK NFR-002  \[active\]  measured_by:perf\/load\.js/);
	//  NFR だけを @covers するテストは C11 の「@covers の無いテスト」にならない
	assert.doesNotMatch(r.stdout, /\[C11\].*一覧の応答/);
});
