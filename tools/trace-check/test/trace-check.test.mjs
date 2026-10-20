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

//  検査の対象外にする範囲は、キーを消さずに理由付きの none で宣言する（ADR-0056）
const NONE = { none: "このテストでは扱わない" };

function run(root, ...args) {
	return spawnSync("node", [TOOL, "--root", root, ...args], { encoding: "utf8" });
}

function makeRoot({ system = true } = {}) {
	const root = mkdtempSync(join(tmpdir(), "harness trace-check "));
	const cfg = JSON.parse(readFileSync(TEMPLATE, "utf8"));
	delete cfg._comment;
	delete cfg.layering;
	for (const k of ["contract", "schema", "source"]) cfg[k] = NONE;
	if (!system) cfg.tests.system = NONE;
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
	const r = run(root, "--only", "C15");
	assert.equal(r.status, 1, r.stdout + r.stderr);
	assert.match(r.stdout, /\[C15\] UC-003 \(active、アクター ACT-01\) のシナリオテストが存在しない/);
	assert.match(r.stdout, /\[C15\] e2e\/register\.spec\.ts:3: 未定義の UC-999 を @scenario している/);
	assert.doesNotMatch(r.stdout, /\[C15\] UC-001 /);
	assert.doesNotMatch(r.stdout, /\[C15\] UC-002 /);
	assert.doesNotMatch(r.stdout, /\[C15\] UC-004 /);
});

test("C15: tests.system が none なら判定しない", (t) => {
	const root = makeRoot({ system: false });
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root, "--only", "C15");
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.doesNotMatch(r.stdout, /\[C15\]/);
});

test("レポート: 各 UC の行にシナリオテストの所在を出す", (t) => {
	const root = makeRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root);
	assert.match(r.stdout, /UC-001 \(UC-001-register\/\)  \[実装\]  scenario:e2e\/register\.spec\.ts:1/);
	assert.match(r.stdout, /UC-003 \(UC-003-browse\/\)  \[実装\]  scenario:-/);
	assert.match(r.stdout, /シナリオテスト: 2（保留 0）/);
});

//  C16–C18 用: BR / REQ / vision を持つ docs。draft と withdrawn、HTML コメント、プレースホルダーは判定の外に置く
function makeRefRoot({ vision = true } = {}) {
	const root = mkdtempSync(join(tmpdir(), "harness trace-check refs "));
	const cfg = JSON.parse(readFileSync(TEMPLATE, "utf8"));
	for (const k of ["_comment", "layering"]) delete cfg[k];
	for (const k of ["contract", "schema", "source"]) cfg[k] = NONE;
	cfg.tests.system = NONE;
	if (!vision) cfg.docs.vision = NONE;
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
		"- 適用される業務規則: BR-001, BR-009\n\n## 主シナリオ\n\n1. REQ-008 は表の節の外なので数えない\n\n## 状態 × イベント表\n\n<!-- 例: BR-007 や REQ-007 はコメントなので数えない -->\n\n| 状態 \\ イベント | 登録 | 取消 |\n| --- | --- | --- |\n| 未登録 | REQ-001 | REQ-002 |\n| 登録済 | REQ-003 | REQ-000 |\n"));
	w(`${g}/UC-002-browse/UC.md`, uc("UC-002", "ACT-01", "active", "## 状態 × イベント表\n\n| 状態 \\ イベント | 閲覧 |\n| --- | --- |\n| 登録済 | REQ-003 |\n"));
	w(`${g}/UC-003-draft/UC.md`, uc("UC-003", "ACT-06", "draft", "- BR-006\n\n## 状態 × イベント表\n\n| 状態 \\ イベント | 閲覧 |\n| --- | --- |\n| 登録済 | REQ-006 |\n"));
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
	const r = run(root, "--only", "C16");
	assert.equal(r.status, 1, r.stdout + r.stderr);
	assert.match(r.stdout, /\[C16\] UC-001 が未定義の BR-009 を参照している/);
	assert.match(r.stdout, /\[C16\] REQ-001 が未定義の BR-008 を参照している/);
	for (const id of ["BR-001", "BR-005", "BR-006", "BR-007"]) assert.doesNotMatch(r.stdout, new RegExp(`\\[C16\\].*${id}`));
});

test("C17: active な UC の表と REQ の 1 対 1 対応（未定義・他 UC の REQ・表に無い REQ）を検出し、withdrawn と draft UC は数えない", (t) => {
	const root = makeRefRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root, "--only", "C17");
	assert.equal(r.status, 1, r.stdout + r.stderr);
	assert.match(r.stdout, /\[C17\] UC-001 の表が未定義の REQ-002 を指している/);
	assert.match(r.stdout, /\[C17\] UC-001 の表が UC-002 の REQ-003 を指している/);
	assert.match(r.stdout, /\[C17\] REQ-004 が UC-001 の表のどのセルからも導出されていない/);
	for (const id of ["REQ-000", "REQ-001", "REQ-005", "REQ-006", "REQ-007", "REQ-008"]) assert.doesNotMatch(r.stdout, new RegExp(`\\[C17\\].*${id}`));
	assert.doesNotMatch(r.stdout, /\[C17\] UC-002/);
});

test("C18: active な GOAL / UC の actor と GOAL の origin が表に無ければ違反、draft は数えない", (t) => {
	const root = makeRefRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root, "--only", "C18");
	assert.equal(r.status, 1, r.stdout + r.stderr);
	assert.match(r.stdout, /\[C18\] GOAL-01 の actor ACT-09 が docs\/02-actors\.md に無い/);
	assert.match(r.stdout, /\[C18\] GOAL-01 の origin KPI-02 が docs\/00-vision\.md に無い/);
	assert.match(r.stdout, /\[C18\] UC-001 の actor ACT-08 が docs\/02-actors\.md に無い/);
	for (const id of ["KPI-01", "ACT-01", "ACT-06", "ACT-07", "KPI-07"]) assert.doesNotMatch(r.stdout, new RegExp(`\\[C18\\].*${id}`));
});

test("C18: docs.vision が none なら origin を判定しない", (t) => {
	const root = makeRefRoot({ vision: false });
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root, "--only", "C18");
	assert.doesNotMatch(r.stdout, /origin/);
	assert.match(r.stdout, /\[C18\] GOAL-01 の actor ACT-09/);
});

//  C19 用: 実現単位を置く場所（source.unit_dirs）と、その外の技術部品（infra）
function makeSourceRoot({ placement = "before", configure = () => {} } = {}) {
	const root = mkdtempSync(join(tmpdir(), "harness trace-check source "));
	const cfg = JSON.parse(readFileSync(TEMPLATE, "utf8"));
	for (const k of ["_comment", "layering"]) delete cfg[k];
	for (const k of ["contract", "schema"]) cfg[k] = NONE;
	cfg.tests.system = NONE;
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
		const r = run(root, "--only", "C19");
		assert.equal(r.status, 1, r.stdout + r.stderr);
		assert.match(r.stdout, /\[C19\] src\/usecase\/register\.ts:\d+ "Unlinked": @implements の無い実現単位/);
		assert.doesNotMatch(r.stdout, /\[C19\].*"(register|formatDate|helper)"/);
	});

test("C19: レポートに実現単位の内訳を出し、unit_dirs が none なら判定せず理由を出す", (t) => {
	const root = makeSourceRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	assert.match(run(root).stdout, /実現単位: 2（@implements なし 1）/);
	const off = makeSourceRoot({ configure: (cfg) => (cfg.source.unit_dirs = { none: "実現単位はまだ移行していない" }) });
	t.after(() => rmSync(off, { recursive: true, force: true }));
	const r = run(off, "--only", "C19");
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.doesNotMatch(r.stdout, /\[C19\]/);
	assert.match(run(off).stdout, /source\.unit_dirs: 実現単位はまだ移行していない/);
});

test("設定エラー: 宣言の省略、none にできないキー、理由の無い none、廃止した exempt_pattern（ADR-0055 / ADR-0056）", (t) => {
	const cases = [
		[(cfg) => delete cfg.source.unit_pattern, /source\.unit_pattern が宣言されていない/],
		[(cfg) => (cfg.source.unit_pattern = NONE), /source\.unit_pattern は none にできない/],
		[(cfg) => delete cfg.schema, /schema が宣言されていない/],
		[(cfg) => delete cfg.docs.glossary, /docs\.glossary が宣言されていない/],
		[(cfg) => (cfg.contract = { none: "" }), /contract: none は理由の文字列だけを持つ/],
		[(cfg) => (cfg.source.exempt_pattern = "//\\s*仕様外:"), /source\.exempt_pattern は廃止/],
		[(cfg) => (cfg.tests.exempt_pattern = "//\\s*仕様外:"), /tests\.exempt_pattern は廃止/],
	];
	for (const [configure, message] of cases) {
		const root = makeSourceRoot({ configure });
		t.after(() => rmSync(root, { recursive: true, force: true }));
		const r = run(root);
		assert.equal(r.status, 2, r.stdout + r.stderr);
		assert.match(r.stderr, message);
	}
});

//  C20 用: テストで検証する NFR、measured_by で計測する NFR、どちらも無い NFR
function makeNfrRoot() {
	const root = mkdtempSync(join(tmpdir(), "harness trace-check nfr "));
	const cfg = JSON.parse(readFileSync(TEMPLATE, "utf8"));
	for (const k of ["_comment", "layering"]) delete cfg[k];
	for (const k of ["contract", "schema", "source"]) cfg[k] = NONE;
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
	w("perf/load.js", "// 負荷試験（NFR-002）\n");
	//  measured_by は docs の外のファイルで、中にその NFR の ID が現れること
	w("docs/nfr/NFR-006.md", nfr("NFR-006", "active", "perf/other.js"));
	w("docs/nfr/NFR-007.md", nfr("NFR-007", "active", "docs/rules/perf.md"));
	w("docs/nfr/NFR-008.md", nfr("NFR-008", "active", "https://example.com/dashboard"));
	w("perf/other.js", "// 別の計測\n");
	w("docs/rules/perf.md", "NFR-007 の計測\n");
	//  GLOBAL.md（検証しない範囲の置き場）は NFR の ID を含んでも計測の所在にならない
	w("docs/nfr/NFR-010.md", nfr("NFR-010", "active", "docs/verification/GLOBAL.md"));
	w("docs/verification/GLOBAL.md", "# 検証しない範囲\n\n- NFR-010 は計測しない\n");
	//  docs の下でも、宣言した文書でない runbook は計測の所在になる
	w("docs/nfr/NFR-011.md", nfr("NFR-011", "active", "docs/runbooks/NFR-011.md"));
	w("docs/runbooks/NFR-011.md", "# NFR-011 の計測\n\n計測先: 監視ダッシュボードの p95\n");
	w("tests/perf.test.ts", "// @covers NFR-001\ntest('一覧の応答', () => {});\n");
	w("e2e/perf.spec.ts", "// @covers NFR-009\ntest('存在しない NFR', () => {});\n");
	return root;
}

test("C20: active な NFR にテストか measured_by を求め、measured_by の不在と未定義 NFR への @covers も検出する", (t) => {
	const root = makeNfrRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root);
	assert.match(r.stdout, /\[C20\] NFR-003 \(active\) を検証するテストも measured_by も無い/);
	assert.match(r.stdout, /\[C20\] NFR-004 の measured_by perf\/missing\.js が無い/);
	assert.match(r.stdout, /\[C20\] e2e\/perf\.spec\.ts:1: 未定義の NFR-009 を @covers している/);
	assert.match(r.stdout, /\[C20\] NFR-006 の measured_by perf\/other\.js の中に NFR-006 が現れない/);
	assert.match(r.stdout, /\[C20\] NFR-007 の measured_by docs\/rules\/perf\.md は docs\.rules_dir の文書で、計測の所在にならない/);
	assert.match(r.stdout, /\[C20\] NFR-010 の measured_by docs\/verification\/GLOBAL\.md は docs\.verification_global の文書で、計測の所在にならない/);
	assert.match(r.stdout, /\[C20\] NFR-008 の measured_by https:\/\/example\.com\/dashboard はリポジトリ内のファイルにする/);
	assert.doesNotMatch(r.stdout, /\[C20\].*NFR-00[125]/);
	assert.match(r.stdout, /OK NFR-011  \[active\]  measured_by:docs\/runbooks\/NFR-011\.md/);
	assert.match(r.stdout, /OK NFR-002  \[active\]  measured_by:perf\/load\.js/);
	//  NFR だけを @covers するテストは C11 の「@covers の無いテスト」にならない
	assert.doesNotMatch(r.stdout, /\[C11\].*一覧の応答/);
});

test("baseline は持たない: baseline_file キーと廃止したフラグは使い方エラー、台帳ファイルは読まずに警告（ADR-0056）", (t) => {
	const root = makeRefRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	writeFileSync(join(root, ".trace-baseline.json"), JSON.stringify(["[C16] UC-001 が未定義の BR-009 を参照している"]));
	const r = run(root);
	assert.equal(r.status, 1, r.stdout + r.stderr);
	assert.match(r.stdout, /\[C16\] UC-001 が未定義の BR-009/);
	assert.match(r.stdout, /\.trace-baseline\.json: baseline は廃止した/);
	for (const flag of ["--strict", "--update-baseline"]) {
		const u = run(root, flag);
		assert.equal(u.status, 2, u.stdout + u.stderr);
		assert.match(u.stderr, new RegExp(`${flag} は廃止した`));
	}
	const cfgPath = join(root, "traceconfig.json");
	writeFileSync(cfgPath, JSON.stringify({ ...JSON.parse(readFileSync(cfgPath, "utf8")), baseline_file: ".trace-baseline.json" }));
	const b = run(root);
	assert.equal(b.status, 2, b.stdout + b.stderr);
	assert.match(b.stderr, /baseline_file は廃止した/);
});

//  紐づきに例外を作らない（ADR-0056）用: 全宣言を持つ利用プロジェクト。各所を 1 つずつ崩してある
function makeFullRoot() {
	const root = mkdtempSync(join(tmpdir(), "harness trace-check full "));
	const cfg = JSON.parse(readFileSync(TEMPLATE, "utf8"));
	for (const k of ["_comment", "layering"]) delete cfg[k];
	cfg.source.unit_dirs = ["src/usecase"];
	writeFileSync(join(root, "traceconfig.json"), JSON.stringify(cfg, null, 2) + "\n");
	const w = (rel, text) => {
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), text);
	};
	const fm = (fields) => `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\n`;
	const g = "docs/goals/GOAL-01-project";
	w("docs/00-vision.md", `${fm({ id: "VISION", status: "frozen" })}| 指標 | 現状 | 目標 |\n| --- | --- | --- |\n| KPI-01 登録数 | 0 | 10 |\n`);
	w("docs/02-actors.md", `${fm({ id: "ACTORS", status: "living" })}| ID | アクター | 種別 | 説明 |\n| --- | --- | --- | --- |\n| ACT-01 | 利用者 | 人間 | 登録する |\n`);
	w(
		"docs/01-glossary.md",
		`${fm({ id: "GLOSSARY", status: "living" })}| 用語 | 定義 | コード識別子 | 禁止同義語 |\n| --- | --- | --- | --- |\n| 案件 | 登録する単位 | \`Project\` | 仕事 |\n| 掲載中 | 公開状態 | \`ProjectStatus.OPEN\` | — |\n| 請求書 | 未着手の機能の語 | \`Invoice\` | — |\n| <語> | <定義> | \`<ClassName / EnumCase>\` | <別名> |\n`,
	);
	w("docs/_shared/components.yaml", "authSchemes: {}\nerrorCodes:\n  INVALID_INPUT: 入力が不正\n  FORBIDDEN: 権限が無い\n  UNUSED_CODE: どこでも使わない\n");
	const br = (id, status) => `${fm({ id, title: "t", enforced_at: "domain 層", status })}# ${id}\n`;
	w("docs/rules/BR-001.md", br("BR-001", "active"));
	w("docs/rules/BR-002.md", br("BR-002", "active"));
	w("docs/rules/BR-003.md", br("BR-003", "withdrawn"));
	w("docs/nfr/NFR-001.md", `${fm({ id: "NFR-001", category: "performance", status: "withdrawn" })}# NFR-001\n`);
	w(`${g}/GOAL.md`, `${fm({ id: "GOAL-01", actor: "ACT-01", origin: "KPI-01", status: "active" })}# GOAL-01\n`);
	const uc = (id, status, body) => `${fm({ id, title: "t", actor: "ACT-01", goal: "GOAL-01", status, phase: "実装" })}# ${id}\n\n${body}`;
	w(`${g}/UC-001-register/UC.md`, uc("UC-001", "active", "利用者が案件を登録し、掲載中にする。\n\n- BR-002, BR-003\n\n## 状態 × イベント表\n\n| 状態 \\ イベント | 登録 | 取消 |\n| --- | --- | --- |\n| 未登録 | REQ-001 | REQ-002 |\n"));
	w(`${g}/UC-002-old/UC.md`, uc("UC-002", "withdrawn", ""));
	const req = (id, status, extra = {}) => `${fm({ id, pattern: "Ubiquitous", uc: "UC-001", ...extra, status })}# ${id}\n\n> 1 文\n\n## 検証方針\n\n- **分割クラス**:\n  - \`#ok\` — 正常\n`;
	w(`${g}/UC-001-register/REQ-001.md`, req("REQ-001", "active", { br: "BR-001" }));
	w(`${g}/UC-001-register/REQ-002.md`, req("REQ-002", "withdrawn"));
	const contract = (uc, ops) =>
		`x-uc: ${uc}\nx-status: fixed\noperations:\n` +
		ops.map((op) => `  ${op}:\n    transport: http\n    direction: inbound\n    owned: true\n    errors:\n      - code: INVALID_INPUT\n        when: 不正\n      - code: FORBIDDEN\n        when: 権限なし\n`).join("");
	w(`${g}/UC-001-register/contract.yaml`, contract("UC-001", ["createProject", "listProjects"]));
	w(`${g}/UC-002-old/contract.yaml`, contract("UC-002", ["oldOp"]));
	w(
		"src/usecase/project.ts",
		"/** @implements REQ-001 */\nexport class Project {}\n\nexport enum ProjectStatus { DRAFT }\n\n// @implements REQ-002\nexport function legacy() {}\n",
	);
	w(
		"src/infra/routes.ts",
		'// @operation UC-001#createProject\napp.post("/projects", h);\napp.get("/projects", h);\n// @operation UC-001#deleteProject\napp.delete("/projects/:id", h);\n// @operation UC-002#oldOp\napp.put("/old", h);\n',
	);
	w("src/domain/errors.ts", "export const e = { code = 'INVALID_INPUT' };\n");
	w(
		"tests/project.test.ts",
		'// @covers REQ-001#ok\ntest("ok", () => {});\n// @covers REQ-002#ok\ntest("old", () => {});\n// @covers NFR-001\ntest("perf", () => {});\n// @covers REQ-001#ok\n\ntest("separated", () => {});\n',
	);
	w("e2e/flow.spec.ts", '// @scenario UC-001\ntest("flow", () => {});\ntest("bare", () => {});\n// @scenario UC-002\ntest("old flow", () => {});\n');
	w("prisma/schema.prisma", "model Project {\n  id Int @id\n  /// @implements BR-001\n  code String @unique\n  name String @unique\n}\n");
	return root;
}

test("撤回済みの仕様を指す注釈・参照は違反（C3 / C5 / C15 / C16 / C17 / C20）", (t) => {
	const root = makeFullRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const out = run(root, "--only", "C3,C5,C15,C16,C17,C20").stdout;
	assert.match(out, /\[C3\] テストが撤回済みの REQ-002 を @covers している/);
	assert.match(out, /\[C5\] コードが撤回済みの REQ-002 を参照/);
	assert.match(out, /\[C15\] e2e\/flow\.spec\.ts:4: 撤回済みの UC-002 を @scenario している/);
	assert.match(out, /\[C16\] UC-001 が撤回済みの BR-003 を参照している/);
	assert.match(out, /\[C17\] UC-001 の表が撤回済みの REQ-002 を指している/);
	assert.match(out, /\[C20\] tests\/project\.test\.ts:5: 撤回済みの NFR-001 を @covers している/);
});

test("注釈の窓は単位の直上に連続する行だけ。空行を挟んだ注釈は帰属せず、@scenario の無いシナリオテストも違反（C11 / C15）", (t) => {
	const root = makeFullRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const out = run(root, "--only", "C11,C15").stdout;
	assert.match(out, /\[C11\] tests\/project\.test\.ts:9 "separated": @covers の無いテスト/);
	assert.match(out, /\[C11\] tests\/project\.test\.ts:7 "@covers REQ-001#ok": どのテストにも属さない @covers/);
	assert.match(out, /\[C15\] e2e\/flow\.spec\.ts:3 "bare": @scenario の無いシナリオテスト/);
	assert.doesNotMatch(out, /"(ok|old|perf|flow|old flow)":/);
});

test("C21: 入口と契約の操作の双方向（@operation の無い入口、契約に無い操作、撤回済み UC の操作、@operation の無い fixed 操作）", (t) => {
	const root = makeFullRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const out = run(root, "--only", "C21").stdout;
	assert.match(out, /\[C21\] src\/infra\/routes\.ts:3 "\/projects": @operation の無い境界の入口/);
	assert.match(out, /\[C21\] src\/infra\/routes\.ts:4: 契約に無い操作 UC-001#deleteProject を @operation している/);
	assert.match(out, /\[C21\] src\/infra\/routes\.ts:6: 撤回済みの UC の操作 UC-002#oldOp を @operation している/);
	assert.match(out, /\[C21\] UC-001#listProjects（fixed、owned かつ inbound）を @operation する入口が無い/);
	assert.doesNotMatch(out, /createProject/);
	assert.doesNotMatch(out, /\[C21\] UC-002#oldOp（fixed）/);
});

test("C22–C25: REQ から辿れない BR、注釈の無い制約、使われない共有エラーコード、承認済みの仕様が使う用語のうちソースに無い識別子", (t) => {
	const root = makeFullRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const out = run(root, "--only", "C22,C23,C24,C25").stdout;
	assert.match(out, /\[C22\] BR-002 \(active\) を br: に持つ active な REQ が無い/);
	assert.doesNotMatch(out, /\[C22\] BR-00[13]/);
	assert.match(out, /\[C23\] prisma\/schema\.prisma:5 "name": @implements の無い制約/);
	assert.doesNotMatch(out, /\[C23\].*"code"/);
	assert.match(out, /\[C24\] 共有語彙のエラーコード UNUSED_CODE がどの契約の errors でも使われていない/);
	assert.doesNotMatch(out, /\[C24\].*(INVALID_INPUT|FORBIDDEN)/);
	assert.match(out, /\[C25\] 用語集の「掲載中」のコード識別子 OPEN がソースに無い/);
	assert.doesNotMatch(out, /\[C25\].*(Project |ProjectStatus|ClassName)/);
	//  承認済みの仕様がまだ使っていない用語（未着手の機能）は、コードが無くても違反にしない
	assert.doesNotMatch(out, /\[C25\].*Invoice/);
});

test("C26: 宣言した共有語彙・用語集のファイルが無ければ違反、contract.exclude_codes は廃止", (t) => {
	const root = makeFullRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	rmSync(join(root, "docs/_shared/components.yaml"));
	rmSync(join(root, "docs/01-glossary.md"));
	//  active な UC があるので、宣言した固定パスの不在は C26（作るか none にする）
	const out = run(root, "--only", "C26").stdout;
	assert.match(out, /\[C26\] docs\.shared の docs\/_shared\/components\.yaml が無い（active な UC がある）。作る/);
	assert.match(out, /\[C26\] docs\.glossary の docs\/01-glossary\.md が無い（active な UC がある）。作る/);
	const cfgPath = join(root, "traceconfig.json");
	const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
	cfg.contract.exclude_codes = ["INTERNAL"];
	writeFileSync(cfgPath, JSON.stringify(cfg));
	const r = run(root);
	assert.equal(r.status, 2, r.stdout + r.stderr);
	assert.match(r.stderr, /contract\.exclude_codes は廃止した/);
});
