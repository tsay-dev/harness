//  trace-check の回帰検証（ADR-0056 の合意事項）: コメントの中だけの注釈、保留のテスト、義務表（C26）、分類（C27）、
//  C1 の起点、入口のパスの照合、設定エラー。テンプレートの traceconfig.json で、紐づきの揃った最小のプロジェクトを組み、1 か所ずつ崩す。
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

const fm = (fields) => `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\n`;
const G = "docs/goals/GOAL-01-x";
const U = `${G}/UC-001-x`;

//  紐づきの揃った最小のプロジェクト（違反 0 件）。files で上書き・追加（null は削除）し、configure で traceconfig を変える
function project(t, { files = {}, configure = () => {} } = {}) {
	const root = mkdtempSync(join(tmpdir(), "harness trace-check links "));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const cfg = JSON.parse(readFileSync(TEMPLATE, "utf8"));
	delete cfg.layering;
	configure(cfg);
	const base = {
		"traceconfig.json": JSON.stringify(cfg, null, 2),
		"docs/00-vision.md": `${fm({ id: "VISION", status: "frozen" })}| 指標 | 現状 | 目標 |\n| --- | --- | --- |\n| KPI-01 登録数 | 0 | 10 |\n`,
		"docs/01-glossary.md": `${fm({ id: "GLOSSARY", status: "living" })}| 用語 | 定義 | コード識別子 | 禁止同義語 |\n| --- | --- | --- | --- |\n| 案件 | 登録する単位 | \`createX\` | 仕事 |\n`,
		"docs/02-actors.md": `${fm({ id: "ACTORS", status: "living" })}| ID | アクター | 種別 | 説明 |\n| --- | --- | --- | --- |\n| ACT-01 | 利用者 | 人間 / 認証済 | 登録する |\n| ACT-02 | 夜間バッチ | システム / スケジューラー | 集計する |\n`,
		"docs/_shared/components.yaml": "authSchemes: {}\nerrorCodes: {}\nschemas: {}\n",
		"docs/rules/.gitkeep": "",
		"docs/nfr/.gitkeep": "",
		"docs/adr/.gitkeep": "",
		[`${G}/GOAL.md`]: `${fm({ id: "GOAL-01", actor: "ACT-01", origin: "KPI-01", status: "active" })}# GOAL-01\n`,
		[`${U}/UC.md`]: `${fm({ id: "UC-001", title: "t", actor: "ACT-01", goal: "GOAL-01", status: "active", phase: "実装" })}# UC-001\n\n## 主シナリオ\n\n1. 利用者が案件を登録する\n\n## 状態 × イベント表\n\n| 状態 \\ イベント | 登録 |\n| --- | --- |\n| 未登録 | REQ-001 |\n`,
		[`${U}/REQ-001.md`]: `${fm({ id: "REQ-001", pattern: "Ubiquitous", uc: "UC-001", status: "active" })}# REQ-001\n\n> 1 文\n\n## 検証方針\n\n- **分割クラス**:\n  - \`#ok\` — 正常\n`,
		[`${U}/contract.yaml`]:
			"x-uc: UC-001\nx-status: fixed\noperations:\n  createX:\n    transport: http\n    direction: inbound\n    owned: true\n    auth: none\n    summary: 登録\n    wire:\n      method: POST\n      path: /x/{id}\n      success: 200\n    errors: []\n",
		"src/usecase/x.ts": "/** @implements REQ-001 */\nexport function createX() {}\n",
		"src/infra/routes.ts": '// @operation UC-001#createX\napp.post("/x/:id", h);\n',
		"src/domain/errors.ts": "export {};\n",
		"tests/x.test.ts": '// @covers REQ-001#ok\ntest("ok", () => {});\n',
		"e2e/x.spec.ts": '// @scenario UC-001\ntest("flow", () => {});\n',
		"prisma/schema.prisma": "model X {\n  id Int @id\n}\n",
	};
	for (const [rel, text] of Object.entries({ ...base, ...files })) {
		if (text === null) continue;
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), text);
	}
	return root;
}

const run = (root, ...args) => spawnSync("node", [TOOL, "--root", root, ...args], { encoding: "utf8" });

test("紐づきの揃った最小のプロジェクトは違反 0 件（テンプレートの traceconfig.json のまま）", (t) => {
	const r = run(project(t));
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /違反なし/);
});

test("注釈はコメントの中だけを数える: 文字列リテラルの中の @implements は紐づかず、行末コメントは数える（C14 / C19）", (t) => {
	const root = project(t, { files: { "src/usecase/x.ts": 'const s = "@implements REQ-001";\nexport function createX() {} // @implements REQ-001\nexport function other() {}\n' } });
	const out = run(root, "--only", "C14,C19").stdout;
	assert.match(out, /\[C19\] src\/usecase\/x\.ts:3 "other": @implements の無い実現単位/);
	assert.doesNotMatch(out, /"createX"/);
	const str = project(t, { files: { "src/usecase/x.ts": '/** 説明 */\nexport function createX() { return "@implements REQ-001"; }\n' } });
	const o2 = run(str, "--only", "C14,C19").stdout;
	assert.match(o2, /\[C14\] REQ-001 を @implements する実装が存在しない/);
	assert.match(o2, /\[C19\] src\/usecase\/x\.ts:2 "createX"/);
});

test("既定の comment_pattern では # / @ で始まる行の注釈を数えず案内する。上書きすれば数える", (t) => {
	const files = { "src/usecase/x.ts": '@Injectable("@implements REQ-001")\nexport class CreateX {}\n' };
	const out = run(project(t, { files }), "--only", "C19").stdout;
	assert.match(out, /\[C19\] src\/usecase\/x\.ts:2 "CreateX".*# \/ @ で始まる行の注釈を数えない/);
	const decorated = { "src/usecase/x.ts": "@Injectable() // @implements REQ-001\nexport class CreateX {}\n" };
	assert.doesNotMatch(run(project(t, { files: decorated }), "--only", "C19").stdout, /\[C19\]/);
	const py = {
		"src/usecase/x.ts": null,
		"src/usecase/x.py": "# @implements REQ-001\ndef create_x():\n    pass\n",
	};
	const pyRoot = project(t, {
		files: py,
		configure: (cfg) => {
			cfg.source.extensions = [".py"];
			cfg.source.unit_pattern = "^def\\s+(\\w+)";
			cfg.source.comment_pattern = "^\\s*#";
		},
	});
	assert.doesNotMatch(run(pyRoot, "--only", "C14,C19").stdout, /\[C1[49]\]/);
});

test("C11: 1 つのテストの窓に REQ の @covers が 2 つ以上あれば違反", (t) => {
	const files = { "tests/x.test.ts": '// @covers REQ-001#ok\n// @covers REQ-001#ok\ntest("ok", () => {});\n' };
	assert.match(run(project(t, { files }), "--only", "C11").stdout, /\[C11\] tests\/x\.test\.ts:3 "ok": 1 つのテストに REQ の @covers が 2 個ある/);
});

test("保留: skip のテストは被覆に数えず、テスト単位の外の保留はファイル全体を保留にして直し方を出す（C1 / C10 / C15）", (t) => {
	const unit = run(project(t, { files: { "tests/x.test.ts": '// @covers REQ-001#ok\ntest.skip("ok", () => {});\n' } }), "--only", "C1,C10,C11").stdout;
	assert.match(unit, /\[C1\] REQ-001 を被覆するテストは保留のテスト（pending_pattern に一致: tests\/x\.test\.ts:2）しか無い。skip を外す/);
	assert.match(unit, /\[C10\] REQ-001#ok を被覆するテストは保留のテスト/);
	assert.doesNotMatch(unit, /\[C11\]/);
	const file = run(project(t, { files: { "tests/x.test.ts": 'describe.skip("x", () => {\n// @covers REQ-001#ok\ntest("ok", () => {});\n});\n' } }), "--only", "C1").stdout;
	assert.match(file, /テスト単位の外の保留（tests\/x\.test\.ts:1）でファイル全体が保留になっているのでファイルを分ける/);
	const sys = run(project(t, { files: { "e2e/x.spec.ts": '// @scenario UC-001\ntest.fixme("flow", () => {});\n' } }), "--only", "C15").stdout;
	assert.match(sys, /\[C15\] UC-001 \(active、アクター ACT-01\) のシナリオテストは保留のテスト/);
});

test("C1 の起点: draft に戻した REQ も、ソースから @implements されている限りテストを求める", (t) => {
	const files = {
		[`${U}/REQ-002.md`]: `${fm({ id: "REQ-002", pattern: "Ubiquitous", uc: "UC-001", status: "draft" })}# REQ-002\n\n## 検証方針\n\n- \`#ok\`\n`,
		[`${U}/UC.md`]: `${fm({ id: "UC-001", title: "t", actor: "ACT-01", goal: "GOAL-01", status: "active", phase: "実装" })}# UC-001\n\n## 状態 × イベント表\n\n| 状態 \\ イベント | 登録 | 取消 |\n| --- | --- | --- |\n| 未登録 | REQ-001 | REQ-002 |\n`,
		"src/usecase/y.ts": "/** @implements REQ-002 */\nexport function cancelX() {}\n",
	};
	assert.match(run(project(t, { files }), "--only", "C1").stdout, /\[C1\] REQ-002 \(draft\) はソースから @implements されているが、被覆するテストが存在しない/);
});

test("C26: 義務がある範囲の none、一致 0 件、active な UC があるときの固定パスの不在", (t) => {
	const none = run(project(t, { configure: (cfg) => (cfg.tests.system = { none: "シナリオは後で" }) }), "--only", "C26").stdout;
	assert.match(none, /\[C26\] tests\.system は none にできない（人間がアクターの active な UC がある）/);
	const zero = run(project(t, { configure: (cfg) => (cfg.source.unit_dirs = ["src/app/**"]), files: { "src/usecase/x.ts": null, "src/app/x.ts": "// @implements REQ-001\nconst createX = 1;\n" } }), "--only", "C26").stdout;
	assert.match(zero, /\[C26\] source\.unit_dirs に source\.unit_pattern に一致する単位が 1 件も無い（active な REQ がある/);
	const missing = run(project(t, { files: { "docs/rules/.gitkeep": null } }), "--only", "C26").stdout;
	assert.match(missing, /\[C26\] docs\.rules_dir の docs\/rules が無い（active な UC がある）。作る（ディレクトリなら \.gitkeep を置く）\n/);
	//  active な UC が無い間は「未作成」と出すだけ（新規プロジェクトの最初のターン）
	const draft = project(t, {
		files: {
			"docs/rules/.gitkeep": null,
			[`${U}/UC.md`]: `${fm({ id: "UC-001", title: "t", actor: "ACT-01", goal: "GOAL-01", status: "draft", phase: "定義" })}# UC-001\n`,
			[`${U}/REQ-001.md`]: null,
			"src/usecase/x.ts": "export {};\n",
			"tests/x.test.ts": "",
			"e2e/x.spec.ts": "",
			[`${U}/contract.yaml`]: "x-uc: UC-001\nx-status: draft\noperations: {}\n",
			"src/infra/routes.ts": "",
		},
		configure: (cfg) => (cfg.tests.pending_pattern = { none: "まだテストが無い" }),
	});
	const r = run(draft, "--only", "C26");
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /未作成[^\n]*\n {2}- docs\.rules_dir: docs\/rules/);
});

test("C27: source.dirs のファイルは unit_dirs か support_dirs に入る。unit_dirs の走査対象外の拡張子も違反、両方に入れば設定エラー", (t) => {
	const files = { "src/web/page.ts": "export {};\n", "src/web/style.css": "", "src/usecase/notes.md": "メモ\n" };
	const out = run(project(t, { files }), "--only", "C27").stdout;
	assert.match(out, /\[C27\] src\/web\/ の 2 件（page\.ts, style\.css）が source\.unit_dirs にも source\.support_dirs にも入らない/);
	assert.match(out, /\[C27\] src\/usecase\/ の 1 件（notes\.md）は source\.unit_dirs にあるが拡張子が source\.extensions に無い/);
	assert.doesNotMatch(out, /x\.test\.ts/);
	const both = run(project(t, { configure: (cfg) => cfg.source.support_dirs.push("src/**") }));
	assert.equal(both.status, 2, both.stdout + both.stderr);
	assert.match(both.stderr, /source\.unit_dirs と source\.support_dirs の両方に入るファイルがある: src\/usecase\/x\.ts/);
	const excluded = run(project(t, { configure: (cfg) => (cfg.source.support_dirs = ["src/**", "!src/usecase/**"]) }), "--only", "C27");
	assert.equal(excluded.status, 0, excluded.stdout + excluded.stderr);
});

test("C21: 入口のパスと wire.path の照合、どこにも属さない @operation、entry_exclude と entry_file_pattern", (t) => {
	const files = {
		"src/infra/routes.ts": '// @operation UC-001#createX\napp.post("/y/:id", h);\n\n// @operation UC-001#createX\nconst unrelated = 1;\napp.get("/health", h);\n',
	};
	const out = run(project(t, { files }), "--only", "C21").stdout;
	assert.match(out, /\[C21\] src\/infra\/routes\.ts:2 "\/y\/:id": @operation UC-001#createX の wire\.path（\/x\/\{id\}）と入口のパスが合わない/);
	assert.match(out, /\[C21\] src\/infra\/routes\.ts:4 "@operation UC-001#createX": 入口にも単位にも属さない @operation/);
	assert.match(out, /\[C21\] src\/infra\/routes\.ts:6 "\/health": @operation の無い境界の入口/);
	//  技術的な入口はファイル単位で範囲から外す（行単位の除外は無い）。params.get("id") は入口ではない
	const split = {
		"src/infra/routes.ts": '// @operation UC-001#createX\nrouter.post("/:id", h);\nconst v = params.get("id");\n',
		"src/infra/health.ts": 'app.get("/health", h);\n',
	};
	assert.doesNotMatch(run(project(t, { files: split, configure: (cfg) => (cfg.source.entry_exclude = ["src/infra/health.ts"]) }), "--only", "C21").stdout, /\[C21\]/);
	const marked = run(project(t, { files: split, configure: (cfg) => (cfg.source.entry_file_pattern = "^// @operation") }), "--only", "C21").stdout;
	assert.doesNotMatch(marked, /\[C21\]/);
});

test("C15: 人間でないと数えるのは種別が「システム」で始まるアクターだけ", (t) => {
	const files = {
		"docs/02-actors.md": `${fm({ id: "ACTORS", status: "living" })}| ID | アクター | 種別 | 説明 |\n| --- | --- | --- | --- |\n| ACT-01 | 取引先 | 外部組織 | 発注する |\n| ACT-02 | 夜間バッチ | システム / スケジューラー | 集計する |\n`,
		"e2e/x.spec.ts": "",
	};
	assert.match(run(project(t, { files }), "--only", "C15").stdout, /\[C15\] UC-001 \(active、アクター ACT-01\) のシナリオテストが存在しない/);
});

test("C16 / C17: active な文書が draft の BR を参照すれば違反、active な UC に REQ が 1 件も無ければ違反", (t) => {
	const files = {
		"docs/rules/BR-001.md": `${fm({ id: "BR-001", title: "t", enforced_at: "domain 層", status: "draft" })}# BR-001\n`,
		[`${U}/REQ-001.md`]: `${fm({ id: "REQ-001", pattern: "Ubiquitous", uc: "UC-001", br: "BR-001", status: "active" })}# REQ-001\n\n## 検証方針\n\n- \`#ok\`\n`,
	};
	assert.match(run(project(t, { files }), "--only", "C16").stdout, /\[C16\] REQ-001 \(active\) が draft の BR-001 を参照している/);
	const empty = { [`${U}/REQ-001.md`]: null, [`${U}/UC.md`]: `${fm({ id: "UC-001", title: "t", actor: "ACT-01", goal: "GOAL-01", status: "active", phase: "定義" })}# UC-001\n` };
	assert.match(run(project(t, { files: empty }), "--only", "C17").stdout, /\[C17\] UC-001 \(active\) に REQ が 1 件も無い/);
});

test("C9: _shared 以外の _ ディレクトリと、id を持つ配置外の md は検査の対象にならないので違反", (t) => {
	const files = { "docs/goals/_draft/GOAL.md": `${fm({ id: "GOAL-02", status: "draft" })}# x\n`, [`${U}/REQ-002-extra.md`]: `${fm({ id: "REQ-002", uc: "UC-001", status: "active" })}# x\n` };
	const out = run(project(t, { files }), "--only", "C9").stdout;
	assert.match(out, /\[C9\] docs\/goals\/_draft: _shared 以外の _ ディレクトリ/);
	assert.match(out, /\[C9\] docs\/goals\/GOAL-01-x\/UC-001-x\/REQ-002-extra\.md: id \(REQ-002\) を持つが/);
});

test("--as-active は draft を active とみなし、--only の未知の項目と空は使い方エラー", (t) => {
	const files = { [`${U}/REQ-002.md`]: `${fm({ id: "REQ-002", pattern: "Ubiquitous", uc: "UC-001", status: "draft" })}# REQ-002\n` };
	const root = project(t, { files });
	assert.doesNotMatch(run(root, "--only", "C2").stdout, /REQ-002/);
	assert.match(run(root, "--as-active", "--only", "C2").stdout, /\[C2\] REQ-002 のファイルに「## 検証方針」セクションがない/);
	for (const only of ["C99", ","]) {
		const r = run(root, "--only", only);
		assert.equal(r.status, 2, r.stdout + r.stderr);
	}
	assert.match(run(root, "--only", "C1").stdout, /部分検査（--only C1）/);
});

test("設定エラー: 正規表現のコンパイル（u フラグ）、型の誤り、support_dirs と pending_pattern の欠落、monorepo のルート", (t) => {
	const cases = [
		[(cfg) => (cfg.source.unit_pattern = "(\\w+"), /source\.unit_pattern の正規表現をコンパイルできない/],
		[(cfg) => (cfg.tests.test_pattern = "\\\"(x)"), /tests\.test_pattern の正規表現をコンパイルできない/],
		[(cfg) => (cfg.docs.shared = { path: "x" }), /docs\.shared はパスの文字列にする/],
		[(cfg) => delete cfg.source.support_dirs, /source\.support_dirs が宣言されていない/],
		[(cfg) => delete cfg.tests.system.pending_pattern, /tests\.system\.pending_pattern が宣言されていない/],
		[(cfg) => delete cfg.tests.dirs, /tests\.dirs が宣言されていない/],
		[(cfg) => (cfg.source.entry_pattern = "\\.get\\("), /source\.entry_pattern には捕捉グループ/],
		[(cfg) => (cfg.source.entry_files = ["src"]), /source\.entry_files は廃止した/],
		[
			(cfg) => {
				delete cfg.source;
				cfg.git.units = { a: "apps/a" };
			},
			/unit ごとに --root <unit のディレクトリ> で実行する/,
		],
	];
	for (const [configure, message] of cases) {
		const r = run(project(t, { configure }));
		assert.equal(r.status, 2, r.stdout + r.stderr);
		assert.match(r.stderr, message);
	}
});

test("テンプレートの既定の印: test_pattern は each / skip / fixme / xit を拾い、unit_pattern は関数値の const だけ、entry_pattern は / のパスだけ", (t) => {
	const files = {
		"tests/x.test.ts":
			'// @covers REQ-001#ok\ntest("ok", () => {});\n// @covers REQ-001#ok\nit.each([[1], [2]])("each %s", () => {});\n// @covers REQ-001#ok\nxit("x", () => {});\ntest.fixme("fixme", () => {});\n',
		"src/usecase/x.ts":
			"/** @implements REQ-001 */\nexport function createX() {}\nexport const LIMIT = 10;\nexport const handler = async (req: Req) => {};\nexport const wrapped = withAuth(() => {});\n",
	};
	const out = run(project(t, { files }), "--only", "C11,C19").stdout;
	assert.match(out, /\[C11\] tests\/x\.test\.ts:7 "fixme": @covers の無いテスト/);
	assert.doesNotMatch(out, /"(ok|each %s|x)"/);
	assert.match(out, /\[C19\] src\/usecase\/x\.ts:4 "handler"/);
	assert.doesNotMatch(out, /"LIMIT"/);
});

//  ---- 独立レビューで見つかったすり抜けと誤検知の回帰 ----

test("すり抜け: ドットで始まるディレクトリの単位、UC だけの @implements、文字列の中の // の後の注釈（C19 / C14）", (t) => {
	const dot = run(project(t, { files: { "src/usecase/.impl/y.ts": "export function deleteEverything() {}\n" } }), "--only", "C19").stdout;
	assert.match(dot, /\[C19\] src\/usecase\/\.impl\/y\.ts:1 "deleteEverything"/);
	const uc = run(project(t, { files: { "src/usecase/y.ts": "/** @implements UC-001 */\nexport function cancelX() {}\n" } }), "--only", "C19").stdout;
	assert.match(uc, /\[C19\] src\/usecase\/y\.ts:2 "cancelX": @implements が UC だけで REQ \/ BR を指していない/);
	const url = { "src/usecase/x.ts": 'export function createX() { return fetch("https://api.example.com/x?note=@implements REQ-001"); }\n' };
	assert.match(run(project(t, { files: url }), "--only", "C14").stdout, /\[C14\] REQ-001 を @implements する実装が存在しない/);
});

test("すり抜け: inbound の操作は入口の窓だけが実装を指し、入口に outbound や http 以外の操作名を借りられない（C21）", (t) => {
	const contract =
		"x-uc: UC-001\nx-status: fixed\noperations:\n  createX:\n    transport: http\n    direction: inbound\n    owned: true\n    auth: none\n    summary: 登録\n    wire:\n      method: POST\n      path: /x/{id}\n      success: 200\n    errors: []\n" +
		"  deleteX:\n    transport: http\n    direction: inbound\n    owned: true\n    auth: none\n    summary: 削除\n    wire:\n      method: DELETE\n      path: /x/{id}\n      success: 200\n    errors: []\n" +
		"  sendMail:\n    transport: sdk\n    direction: outbound\n    owned: false\n    auth: none\n    summary: 通知\n    errors: []\n";
	const files = {
		[`${U}/contract.yaml`]: contract,
		"src/shared/util.ts": "// @operation UC-001#deleteX\nexport const noop = () => {};\n",
		"src/infra/routes.ts": '// @operation UC-001#createX\napp.post("/x/:id", h);\n// @operation UC-001#sendMail\napp.delete("/admin/all", h);\n',
	};
	const out = run(project(t, { files }), "--only", "C21").stdout;
	assert.match(out, /\[C21\] UC-001#deleteX（fixed、owned かつ inbound）を @operation する入口が無い/);
	assert.match(out, /\[C21\] src\/infra\/routes\.ts:4 "\/admin\/all": 入口の @operation UC-001#sendMail は direction: inbound の操作ではない/);
});

test("テンプレートの既定の印: Playwright / Vitest の保留、export の書き方、折り返したルート、複数行の each、パラメーターの書き方", (t) => {
	const pending = {
		"tests/x.test.ts": 'describe.skipIf(true)("x", () => {\n// @covers REQ-001#ok\nit("ok", () => {});\n});\n',
		"e2e/x.spec.ts": 'test.describe.skip("登録", () => {\n// @scenario UC-001\ntest("flow", () => {});\n});\n',
	};
	const p = run(project(t, { files: pending }), "--only", "C1,C15").stdout;
	assert.match(p, /\[C1\] REQ-001 を被覆するテストは保留のテスト/);
	assert.match(p, /\[C15\] UC-001 .*のシナリオテストは保留のテスト/);
	const opt = run(project(t, { files: { "tests/x.test.ts": '// @covers REQ-001#ok\nit("ok", { skip: true }, () => {});\n' } }), "--only", "C1").stdout;
	assert.match(opt, /\[C1\] REQ-001 を被覆するテストは保留のテスト/);
	const units = {
		"src/usecase/y.ts":
			"export default async function (input: I) {}\nexport const updateX = withTx(async () => {});\nexport const listX = async <T,>(q: T) => [];\nexport let patchX = async () => {};\nasync function deleteX() {}\nexport { deleteX };\nfunction helper() {}\nexport const LIMIT = 10;\n",
	};
	const u = run(project(t, { files: units }), "--only", "C19").stdout;
	for (const name of ["line 1", "updateX", "listX", "patchX", "deleteX"]) assert.match(u, new RegExp(`\\[C19\\] src/usecase/y\\.ts:\\d+ "${name}"`));
	assert.doesNotMatch(u, /"(helper|LIMIT)"/);
	const routes = { "src/infra/routes.ts": '// @operation UC-001#createX\napp.post("/x/:id{[0-9]+}", h);\napp.delete(\n  "/x/:id",\n  zValidator("param", s),\n  async (c) => c.json({}),\n);\n' };
	const r = run(project(t, { files: routes }), "--only", "C21").stdout;
	assert.match(r, /\[C21\] src\/infra\/routes\.ts:3 "\/x\/:id": @operation の無い境界の入口/);
	assert.doesNotMatch(r, /wire\.path/);
	const each = { "tests/x.test.ts": '// @covers REQ-001#ok\nit.each([\n  [1, 2],\n])("each %s", () => {});\n' };
	assert.equal(run(project(t, { files: each }), "--only", "C1,C10,C11,C26").status, 0);
});

test("誤検知を出さない: src 直下のファイル、Prisma のコメントの @unique、空白の無い表の見出し", (t) => {
	const files = {
		"src/index.ts": "export default app;\n",
		"src/env.d.ts": "declare const X: string;\n",
		"prisma/schema.prisma": "model X {\n  id Int @id\n  name String // not @unique\n}\n",
		[`${U}/UC.md`]: `${fm({ id: "UC-001", title: "t", actor: "ACT-01", goal: "GOAL-01", status: "active", phase: "実装" })}# UC-001\n\n## 状態×イベント表\n\n| 状態 \\ イベント | 登録 |\n| --- | --- |\n| 未登録 | REQ-001 |\n`,
	};
	const r = run(project(t, { files }));
	assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("すり抜け: 入れ子の _ ディレクトリの文書、テスト名の本番コード、コード識別子の列の無い用語集", (t) => {
	const files = {
		[`${U}/_drafts/REQ-002.md`]: `${fm({ id: "REQ-002", uc: "UC-001", status: "active" })}# x\n`,
		"src/usecase/refund.spec.ts": "export function refund() {}\n",
		"docs/01-glossary.md": `${fm({ id: "GLOSSARY", status: "living" })}| 用語 | 定義 | 識別子 |\n| --- | --- | --- |\n| 案件 | 単位 | \`createX\` |\n`,
	};
	const out = run(project(t, { files }), "--only", "C9,C26,C27").stdout;
	assert.match(out, /\[C9\] docs\/goals\/GOAL-01-x\/UC-001-x\/_drafts\/REQ-002\.md: id \(REQ-002\) を持つが/);
	assert.match(out, /\[C27\] src\/usecase\/ の 1 件（refund\.spec\.ts）は source\.unit_dirs の中で source\.dirs の除外に入るが tests\.dirs/);
	assert.match(out, /\[C26\] docs\.glossary（docs\/01-glossary\.md）に「コード識別子」の列を持つ表が無い/);
});

test("設定エラー（exit 2）: error_source がディレクトリ、layering の型、壊れたシンボリックリンクは飛ばす", (t) => {
	const dir = run(project(t, { configure: (cfg) => (cfg.contract.error_source = "src/domain") }));
	assert.equal(dir.status, 2, dir.stdout + dir.stderr);
	assert.match(dir.stderr, /contract\.error_source はファイルにする/);
	const lay = run(project(t, { configure: (cfg) => (cfg.layering = { root: "src" }) }));
	assert.equal(lay.status, 2, lay.stdout + lay.stderr);
	assert.match(lay.stderr, /layering は/);
	const root = project(t);
	spawnSync("ln", ["-s", join(root, "gone.ts"), join(root, "src/usecase/gone.ts")]);
	assert.equal(run(root).status, 0);
});

//  ---- 再検証で見つかった誤検知とすり抜けの回帰 ----

test("入口の印: 改行した Promise.all( / cache.get( は入口でない。app.on のパスは入口。外部クライアントは entry_exclude で外す", (t) => {
	const files = {
		"src/infra/cache.ts": "export async function load() {\n\treturn cache.get(\n\t\tkey,\n\t);\n}\n",
		"src/usecase/x.ts": "/** @implements REQ-001 */\nexport async function createX() {\n\tawait Promise.all(\n\t\tusers.map((u) => u),\n\t);\n}\n",
		"src/infra/routes.ts": '// @operation UC-001#createX\napp.on("POST", "/x/:id", h);\n',
	};
	const r = run(project(t, { files }), "--only", "C21");
	assert.equal(r.status, 0, r.stdout + r.stderr);
	//  外部 API のクライアント（ky / axios のインスタンス）は入口の印に一致するので、ファイル単位で入口の範囲から外す
	const client = {
		"src/infra/stripe.ts": '// @operation UC-001#charge\nexport async function charge() {\n\treturn api.post("/v1/charges", body);\n}\n',
		[`${U}/contract.yaml`]:
			"x-uc: UC-001\nx-status: fixed\noperations:\n  createX:\n    transport: http\n    direction: inbound\n    owned: true\n    auth: none\n    summary: 登録\n    wire:\n      method: POST\n      path: /x/{id}\n      success: 200\n    errors: []\n  charge:\n    transport: http\n    direction: outbound\n    owned: false\n    auth: none\n    summary: 課金\n    wire:\n      method: POST\n      path: /v1/charges\n      success: 200\n    errors: []\n",
	};
	assert.match(run(project(t, { files: client }), "--only", "C21").stdout, /\[C21\] src\/infra\/stripe\.ts:3 "\/v1\/charges": @operation の無い境界の入口/);
	const excluded = run(project(t, { files: client, configure: (cfg) => (cfg.source.entry_exclude = ["src/infra/stripe.ts"]) }), "--only", "C21");
	assert.equal(excluded.status, 0, excluded.stdout + excluded.stderr);
});

test("自己検査: support_dirs に同居する技術部品のテストは C27 にならず、unit_dirs の *.spec.ts の本番コードだけを違反にする", (t) => {
	const files = { "src/shared/date.ts": "export const fmt = () => 1;\n", "src/shared/date.test.ts": 'test("fmt", () => {});\n' };
	const r = run(project(t, { files }), "--only", "C11,C27");
	assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("テンプレートの既定の印: テストのデータの skip: true は保留でない、折り返した test( と test.for は単位、設定値の const は単位でない", (t) => {
	const data = { "tests/x.test.ts": 'const defaults = { skip: true, limit: 10 };\n// @covers REQ-001#ok\ntest("ok", () => {});\n' };
	assert.equal(run(project(t, { files: data }), "--only", "C1,C10").status, 0);
	const wrapped = { "tests/x.test.ts": '// @covers REQ-001#ok\ntest(\n  "ok",\n  { tag: ["@a"] },\n  async () => {},\n);\ntest(\n  "bare",\n  async () => {},\n);\n// @covers REQ-001#ok\ntest.for([1, 2])("for %i", () => {});\n' };
	const w = run(project(t, { files: wrapped }), "--only", "C11").stdout;
	assert.match(w, /\[C11\] tests\/x\.test\.ts:7 "bare": @covers の無いテスト/);
	assert.doesNotMatch(w, /どのテストにも属さない/);
	const units = {
		"src/usecase/y.ts": 'export const TIMEOUT_MS = Number(process.env.T);\nexport const logger = createLogger("usecase");\nexport { type Input as CreateInput };\nexport default defineUseCase(async () => {});\nexport {\n  createX,\n};\n',
	};
	const u = run(project(t, { files: units }), "--only", "C19").stdout;
	assert.doesNotMatch(u, /"(TIMEOUT_MS|logger|type Input as CreateInput)"/);
	assert.match(u, /\[C19\] src\/usecase\/y\.ts:4 "line 4"/);
	assert.match(u, /\[C19\] src\/usecase\/y\.ts:5 "line 5"/);
});

test("設定エラー（exit 2）: docs.actors / vision がディレクトリ", (t) => {
	const r = run(project(t, { configure: (cfg) => (cfg.docs.vision = "docs/adr") }));
	assert.equal(r.status, 2, r.stdout + r.stderr);
	assert.match(r.stderr, /docs\.vision はファイルにする/);
});

//  ---- 最終の再検証で見つかった退行の回帰（改行した呼び出しの頭をつなげてから印を当てる） ----

test("改行したルートは受け手の名前によらず入口で、パスも照合する。Express の route() と app.on の配列も入口", (t) => {
	const files = {
		"src/infra/routes.ts":
			'const users = new Hono();\n// @operation UC-001#createX\nusers.post("/x/:id", h);\nusers.delete(\n  "/admin/reset-everything",\n  zValidator("param", s),\n  async (c) => c.json({}),\n);\nrouter.route("/r").get(h);\napp.on(["PUT", "DELETE"], "/o", h);\n',
	};
	const out = run(project(t, { files }), "--only", "C21").stdout;
	assert.match(out, /\[C21\] src\/infra\/routes\.ts:4 "\/admin\/reset-everything": @operation の無い境界の入口/);
	assert.match(out, /\[C21\] src\/infra\/routes\.ts:9 "\/r": @operation の無い境界の入口/);
	assert.match(out, /\[C21\] src\/infra\/routes\.ts:10 "\/o": @operation の無い境界の入口/);
});

test("改行したテストの { skip: true } と { todo: true } は保留、本体の期待値の skip: true は保留でない。after の窓は改行した頭の次の行", (t) => {
	const wrapped = { "tests/x.test.ts": '// @covers REQ-001#ok\nit(\n  "登録できる（長い題名）",\n  { skip: true, timeout: 10_000 },\n  async () => {},\n);\n' };
	assert.match(run(project(t, { files: wrapped }), "--only", "C1").stdout, /\[C1\] REQ-001 を被覆するテストは保留のテスト/);
	const todo = { "tests/x.test.ts": '// @covers REQ-001#ok\nit("ok", { todo: true }, () => {});\n' };
	assert.match(run(project(t, { files: todo }), "--only", "C1").stdout, /保留のテスト/);
	const body = { "tests/x.test.ts": '// @covers REQ-001#ok\nit("ok", () => expect(f({ skip: true })).toBe(1));\n' };
	assert.equal(run(project(t, { files: body }), "--only", "C1").status, 0);
	const after = {
		"tests/x.test.ts": 'it(\n  "ok",\n  { timeout: 1 },\n  async () => {\n    // @covers REQ-001#ok\n    expect(1).toBe(1);\n  },\n);\n',
	};
	const r = run(project(t, { files: after, configure: (cfg) => (cfg.tests.covers_placement = "after") }), "--only", "C1,C10,C11");
	assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("テンプレートの unit_pattern: 関数式の const と type 混じりの export は単位、export {} は単位でない", (t) => {
	const files = { "src/usecase/y.ts": "export const deleteX = function () {};\nexport const purgeX = async function () {};\nexport { type Input, purgeAll };\nexport {};\n" };
	const out = run(project(t, { files }), "--only", "C19").stdout;
	for (const name of ["deleteX", "purgeX", "type Input, purgeAll"]) assert.match(out, new RegExp(`"${name}"`));
	assert.doesNotMatch(out, /y\.ts:4/);
});

test("設定エラー（exit 2）: docs.actors がディレクトリでもクラッシュしない", (t) => {
	const r = run(project(t, { configure: (cfg) => (cfg.docs.actors = "docs/rules") }));
	assert.equal(r.status, 2, r.stdout + r.stderr);
	assert.match(r.stderr, /docs\.actors はファイルにする/);
});
