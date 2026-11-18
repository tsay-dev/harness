//  lint refs の回帰検証（ADR-0056 / ADR-0070 の合意事項）: コメントの中だけの注釈、保留のテスト、義務表（C26）、
//  規則を確かめるテスト（@covers BR-nnn。C3 / C11 / C13 / C22）、廃止したキーと検査、設定エラー。紐づきの揃った最小のプロジェクトを、1 か所ずつ崩す。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { foldReqFiles } from "../../_shared/test/fold-reqs.mjs";
import { toolOf, fm, U, project, br, UC_WITH_BR } from "../../_shared/test/refs-linked-fixture.mjs";

const run = (root, ...args) => {
	foldReqFiles(root); //  入力の REQ-nnn.md を UC.md の「要件」の節に畳む（ADR-0067）
	return spawnSync("node", [toolOf("lint-refs"), "--root", root, ...args], { encoding: "utf8" });
};

test("紐づきの揃った最小のプロジェクトは違反 0 件（テンプレートの harness.config.json のまま）", (t) => {
	const r = run(project(t));
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /違反なし/);
});

test("注釈はコメントの中だけを数える: 文字列リテラルの中の @covers は紐づかず、行末コメントは数える（C1 / C11）", (t) => {
	const str = project(t, { files: { "tests/x.test.ts": 'const s = "@covers REQ-001#ok";\ntest("ok", () => {});\n' } });
	const out = run(str, "--only", "C1,C11").stdout;
	assert.match(out, /\[C1\] REQ-001 を被覆するテストが存在しない/);
	assert.match(out, /\[C11\] tests\/x\.test\.ts:2 "ok": @covers の無いテスト/);
	const tail = project(t, { files: { "tests/x.test.ts": 'test("ok", () => {}); // @covers REQ-001#ok\n' } });
	assert.equal(run(tail, "--only", "C1,C10,C11").status, 0);
	//  実装のコードの注釈は読まない（ADR-0070）。書いてあっても、無くても、結果は変わらない
	const impl = project(t, { files: { "src/usecase/x.ts": "/** @implements REQ-999 */\nexport function createX() {}\n// @operation UC-999#nothing\n" } });
	const r = run(impl);
	assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("既定の comment_pattern では # / @ で始まる行の注釈を数えず案内する。上書きすれば数える", (t) => {
	const files = { "tests/x.test.ts": '@Tag("@covers REQ-001#ok")\ntest("ok", () => {});\n' };
	const out = run(project(t, { files }), "--only", "C11").stdout;
	assert.match(out, /\[C11\] tests\/x\.test\.ts:2 "ok": @covers の無いテスト.*# \/ @ で始まる行の注釈を数えない/);
	const decorated = { "tests/x.test.ts": '@Tag() // @covers REQ-001#ok\ntest("ok", () => {});\n' };
	assert.doesNotMatch(run(project(t, { files: decorated }), "--only", "C11").stdout, /\[C11\]/);
	const py = {
		"tests/x.test.ts": null,
		"tests/test_x.py": "# @covers REQ-001#ok\ndef test_ok():\n    pass\n",
	};
	const pyRoot = project(t, {
		files: py,
		configure: (cfg) => {
			cfg.tests.extensions = [".py"];
			cfg.tests.test_pattern = "^def\\s+(test_\\w+)";
			cfg.tests.comment_pattern = "^\\s*#";
		},
	});
	assert.doesNotMatch(run(pyRoot, "--only", "C1,C10,C11").stdout, /\[C1[01]?\]/);
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

test("C1: テストを求めるのは active な REQ だけ。draft の REQ は、実装が先にあっても求めない", (t) => {
	const files = {
		[`${U}/REQ-002.md`]: `${fm({ id: "REQ-002", pattern: "Ubiquitous", uc: "UC-001", status: "draft" })}# REQ-002\n\n## 検証方針\n\n- \`#ok\`\n`,
		[`${U}/UC.md`]: `${fm({ id: "UC-001", title: "t", actor: "ACT-01", goal: "GOAL-01", status: "active", phase: "実装" })}# UC-001\n\n## 状態 × イベント表\n\n| 状態 \\ イベント | 登録 | 取消 |\n| --- | --- | --- |\n| 未登録 | REQ-001 | REQ-002 |\n`,
	};
	const root = project(t, { files });
	assert.doesNotMatch(run(root, "--only", "C1").stdout, /\[C1\]/);
	assert.match(run(root, "--as-active", "--only", "C1").stdout, /\[C1\] REQ-002 を被覆するテストが存在しない（未検証の要件）/);
});

test("C26: 義務がある範囲の none、一致 0 件、active な UC があるときの固定パスの不在", (t) => {
	const none = run(project(t, { configure: (cfg) => (cfg.tests.system = { none: "シナリオは後で" }) }), "--only", "C26").stdout;
	assert.match(none, /\[C26\] tests\.system は none にできない（人間がアクターの active な UC がある）/);
	const zero = run(project(t, { configure: (cfg) => (cfg.tests.dirs = ["spec"]), files: { "spec/.gitkeep": "" } }), "--only", "C26").stdout;
	assert.match(zero, /\[C26\] tests\.dirs に tests\.test_pattern に一致するテストが 1 件も無い（active な REQ がある/);
	const src = run(project(t, { configure: (cfg) => (cfg.source = { none: "コードはまだ無い" }) }), "--only", "C26").stdout;
	assert.match(src, /\[C26\] source は none にできない（active な REQ がある）/);
	//  要件とソースがあるのに、実行の記録（coverage）を none・省略にすると、実装との対応の検査が 0 になる
	const cov = run(project(t, { configure: (cfg) => (cfg.coverage = { none: "記録はまだ取っていない" }) }), "--only", "C26").stdout;
	assert.match(cov, /\[C26\] coverage は none にできない（active な REQ があり、source を宣言している）。テストのコマンドが書き出す実行の記録を \{ "report": "<lcov のファイル>", "not_run": \[\] \} で宣言する.*（none の理由: 記録はまだ取っていない）/);
	const omitted = run(project(t, { configure: (cfg) => delete cfg.coverage }), "--only", "C26").stdout;
	assert.match(omitted, /\[C26\] coverage は省略できない（active な REQ があり、source を宣言している）/);
	//  記録のファイルを指していない宣言（{}、null、文字列、report の無いオブジェクト）も、義務がある間は通さない
	for (const [bad, shown] of [[{}, "{}"], [null, "null"], ["coverage/lcov.info", '"coverage/lcov.info"'], [{ not_run: [] }, '{"not_run":[]}'], [{ report: " " }, '{"report":" "}']]) {
		const out = run(project(t, { configure: (cfg) => (cfg.coverage = bad) }), "--only", "C26").stdout;
		assert.ok(out.includes(`[C26] coverage が、実行の記録のファイル（report）を指していない（実際: ${shown}）（active な REQ があり、source を宣言している）`), out);
	}
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
		//  active な REQ が無い間は、coverage も none のままで通る（ひな形の既定）
		configure: (cfg) => ((cfg.tests.pending_pattern = { none: "まだテストが無い" }), (cfg.coverage = { none: "まだ宣言していない" })),
	});
	const r = run(draft, "--only", "C26");
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /未作成[^\n]*\n {2}- docs\.rules_dir: docs\/rules/);
});
const REQ_WITH_BR = `${fm({ id: "REQ-001", pattern: "Ubiquitous", uc: "UC-001", br: "BR-001", status: "active" })}# REQ-001\n\n> 1 文\n\n## 検証方針\n\n- **分割クラス**:\n  - \`#ok\` — 正常\n`;
const DB_TEST = '// @covers REQ-001#ok\ntest("ok", () => {});\n// @covers BR-001\ntest("同じ名前の行を DB に直接入れると断られる", () => {});\n';

test("C13: DB で守る active な規則には、保留でないテストの @covers BR-nnn が要る（br: に持つ REQ があっても足りない）", (t) => {
	const docs = { "docs/rules/BR-001.md": br("BR-001", "database（一意制約）"), [`${U}/UC.md`]: UC_WITH_BR, [`${U}/REQ-001.md`]: REQ_WITH_BR };
	const none = run(project(t, { files: docs }), "--only", "C13,C22").stdout;
	assert.match(none, /\[C13\] BR-001 は enforced_at に database を含むが、@covers BR-001 のテストが存在しない（規則に反する行を DB に直接入れて断られることを確かめるテスト/);
	assert.doesNotMatch(none, /\[C22\]/);
	const ok = run(project(t, { files: { ...docs, "tests/x.test.ts": DB_TEST } }));
	assert.equal(ok.status, 0, ok.stdout + ok.stderr);
	assert.match(ok.stdout, /OK BR-001 {2}\[active\] {2}tests\/x\.test\.ts:3, br:REQ-001/);
	const pending = { ...docs, "tests/x.test.ts": '// @covers REQ-001#ok\ntest("ok", () => {});\n// @covers BR-001\ntest.skip("断られる", () => {});\n' };
	assert.match(run(project(t, { files: pending }), "--only", "C13").stdout, /\[C13\] BR-001 は enforced_at に database を含むが、@covers BR-001 のテストは保留のテスト/);
	//  DB で守らない規則には求めない。enforced_at の書き方は、英字（語として）のほか、日本語と全角も DB と読む
	for (const at of ["domain 層", "usecase（adb は使わない）", "dbms の外"]) {
		const other = { ...docs, "docs/rules/BR-001.md": br("BR-001", at) };
		assert.doesNotMatch(run(project(t, { files: other }), "--only", "C13").stdout, /\[C13\]/, at);
	}
	for (const at of ["DB", "Database 層", "データベースの一意制約", "ＤＢ（一意制約）", "DBの制約"]) {
		const db = { ...docs, "docs/rules/BR-001.md": br("BR-001", at) };
		assert.match(run(project(t, { files: db }), "--only", "C13").stdout, /\[C13\] BR-001 /, at);
	}
	//  tests を none にしては通せない（義務表）
	const noTests = run(project(t, { files: docs, configure: (cfg) => (cfg.tests = { none: "テストは後で" }) }), "--only", "C26").stdout;
	assert.match(noTests, /\[C26\] tests は none にできない/);
});

test("C22: active な規則は、br: に持つ active な REQ か、保留でないテストの @covers BR-nnn のどちらかで通る", (t) => {
	const docs = { "docs/rules/BR-001.md": br("BR-001", "domain 層"), [`${U}/UC.md`]: UC_WITH_BR };
	assert.match(run(project(t, { files: docs }), "--only", "C22").stdout, /\[C22\] BR-001 \(active\) を br: に持つ active な REQ も、@covers BR-001 のテストも無い/);
	assert.doesNotMatch(run(project(t, { files: { ...docs, [`${U}/REQ-001.md`]: REQ_WITH_BR } }), "--only", "C22").stdout, /\[C22\]/);
	const byTest = run(project(t, { files: { ...docs, "tests/x.test.ts": DB_TEST } }));
	assert.equal(byTest.status, 0, byTest.stdout + byTest.stderr);
	const pending = { ...docs, "tests/x.test.ts": '// @covers REQ-001#ok\ntest("ok", () => {});\n// @covers BR-001\ntest.skip("規則", () => {});\n' };
	assert.match(run(project(t, { files: pending }), "--only", "C22").stdout, /\[C22\] BR-001 \(active\) を br: に持つ active な REQ が無く、@covers BR-001 のテストは保留のテスト/);
});

test("C3 / C11: @covers BR-nnn は実在し撤回されていない規則を指す。@covers BR だけのテストは注釈のあるテストで、シナリオテストの @covers BR は数えない", (t) => {
	const docs = { "docs/rules/BR-001.md": br("BR-001", "domain 層"), "docs/rules/BR-002.md": br("BR-002", "domain 層", "withdrawn"), [`${U}/UC.md`]: UC_WITH_BR };
	const tests = '// @covers REQ-001#ok\ntest("ok", () => {});\n// @covers BR-001\ntest("規則", () => {});\n// @covers BR-002\ntest("撤回済み", () => {});\n// @covers BR-009\ntest("未定義", () => {});\n\n// @covers BR-001\nconst helper = 1;\n';
	const out = run(project(t, { files: { ...docs, "tests/x.test.ts": tests } }), "--only", "C3,C11").stdout;
	assert.match(out, /\[C3\] テストが撤回済みの BR-002 を @covers している（tests\/x\.test\.ts:5）/);
	assert.match(out, /\[C3\] テストが未定義の BR-009 を @covers している（tests\/x\.test\.ts:7）/);
	assert.match(out, /\[C11\] tests\/x\.test\.ts:10 "@covers BR-001": どのテストにも属さない @covers/);
	assert.doesNotMatch(out, /@covers の無いテスト/);
	const sys = { ...docs, "e2e/x.spec.ts": '// @scenario UC-001\n// @covers BR-001\ntest("flow", () => {});\n' };
	const s = run(project(t, { files: sys }), "--only", "C11,C22").stdout;
	assert.match(s, /\[C11\] e2e\/x\.spec\.ts:2: シナリオテストの @covers BR-001 は数えない/);
	assert.match(s, /\[C22\] BR-001/);
});

test("廃止したキーと検査（ADR-0070）: 設定に残っていれば案内を付けて設定エラー、--only の欠番は使い方エラー", (t) => {
	const cases = [
		[(cfg) => (cfg.implements_pattern = "@implements\\s+(REQ-\\d{3})"), /implements_pattern は廃止した（ADR-0070）。実装とスキーマの @implements は読まない。紐づきはテストの @covers に書く。キーを削除する/],
		[(cfg) => (cfg.operation_pattern = "@operation\\s+(UC-\\d{3})#(\\w+)"), /operation_pattern は廃止した（ADR-0070）。入口の @operation は読まない/],
		[(cfg) => (cfg.source.unit_dirs = ["src/usecase/**"]), /source\.unit_dirs は廃止した（ADR-0070）。実現単位と技術部品の置き場の分類はやめた/],
		[(cfg) => (cfg.source.support_dirs = { none: "無い" }), /source\.support_dirs は廃止した/],
		[(cfg) => (cfg.source.unit_pattern = "^export (\\w+)"), /source\.unit_pattern は廃止した/],
		[(cfg) => (cfg.source.implements_placement = "before"), /source\.implements_placement は廃止した/],
		[(cfg) => (cfg.source.entry_pattern = "\\.get\\((.*)"), /source\.entry_pattern は廃止した（ADR-0070）。入口の @operation は読まない。入口は commands\.list_entries の一覧と契約の突き合わせ（lint entries）で確かめる/],
		[(cfg) => (cfg.source.entry_exclude = ["src/health.ts"]), /source\.entry_exclude は廃止した/],
		[(cfg) => (cfg.source.entry_file_pattern = "use server"), /source\.entry_file_pattern は廃止した/],
		[(cfg) => (cfg.schema.constraint_pattern = "(@unique)"), /schema\.constraint_pattern は廃止した（ADR-0070）。.*@covers BR-nnn を書く/],
		[(cfg) => (cfg.schema.implements_placement = "before"), /schema\.implements_placement は廃止した/],
		[(cfg) => (cfg.entries = { outside_contract: [] }), /entries は廃止した（ADR-0070）。契約の外の入口は置けない/],
	];
	for (const [configure, message] of cases) {
		const r = run(project(t, { configure }));
		assert.equal(r.status, 2, r.stdout + r.stderr);
		assert.match(r.stderr, message);
	}
	const root = project(t);
	for (const id of ["C5", "C14", "C19", "C21", "C23", "C27"]) {
		const r = run(root, "--only", id);
		assert.equal(r.status, 2, r.stdout + r.stderr);
		assert.match(r.stderr, new RegExp(`--only の ${id} は廃止した検査`));
	}
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

test("設定エラー: 正規表現のコンパイル（u フラグ）、型の誤り、source.dirs と pending_pattern の欠落、monorepo のルート", (t) => {
	const cases = [
		[(cfg) => (cfg.br_pattern = "(\\w+"), /br_pattern の正規表現をコンパイルできない/],
		[(cfg) => (cfg.br_pattern = "@covers BR-\\d{3}"), /br_pattern には捕捉グループ/],
		[(cfg) => (cfg.tests.test_pattern = "\\\"(x)"), /tests\.test_pattern の正規表現をコンパイルできない/],
		[(cfg) => (cfg.docs.shared = { path: "x" }), /docs\.shared はパスの文字列にする/],
		[(cfg) => delete cfg.source.dirs, /source\.dirs が宣言されていない/],
		[(cfg) => delete cfg.tests.system.pending_pattern, /tests\.system\.pending_pattern が宣言されていない/],
		[(cfg) => delete cfg.tests.dirs, /tests\.dirs が宣言されていない/],
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

test("テンプレートの既定の印: test_pattern は each / skip / fixme / xit を拾う", (t) => {
	const files = {
		"tests/x.test.ts":
			'// @covers REQ-001#ok\ntest("ok", () => {});\n// @covers REQ-001#ok\nit.each([[1], [2]])("each %s", () => {});\n// @covers REQ-001#ok\nxit("x", () => {});\ntest.fixme("fixme", () => {});\n',
	};
	const out = run(project(t, { files }), "--only", "C11").stdout;
	assert.match(out, /\[C11\] tests\/x\.test\.ts:7 "fixme": @covers の無いテスト/);
	assert.doesNotMatch(out, /"(ok|each %s|x)"/);
});

//  ---- 独立レビューで見つかったすり抜けと誤検知の回帰 ----

test("すり抜け: ドットで始まるディレクトリのテスト、文字列の中の // の後の注釈（C11 / C1）", (t) => {
	const dot = run(project(t, { files: { "tests/.hidden/y.test.ts": 'test("注釈なし", () => {});\n' } }), "--only", "C11").stdout;
	assert.match(dot, /\[C11\] tests\/\.hidden\/y\.test\.ts:1 "注釈なし": @covers の無いテスト/);
	const url = { "tests/x.test.ts": 'test("ok", () => fetch("https://api.example.com/x?note=@covers REQ-001#ok"));\n' };
	assert.match(run(project(t, { files: url }), "--only", "C1").stdout, /\[C1\] REQ-001 を被覆するテストが存在しない/);
});

test("テンプレートの既定の印: Playwright / Vitest の保留、複数行の each", (t) => {
	const pending = {
		"tests/x.test.ts": 'describe.skipIf(true)("x", () => {\n// @covers REQ-001#ok\nit("ok", () => {});\n});\n',
		"e2e/x.spec.ts": 'test.describe.skip("登録", () => {\n// @scenario UC-001\ntest("flow", () => {});\n});\n',
	};
	const p = run(project(t, { files: pending }), "--only", "C1,C15").stdout;
	assert.match(p, /\[C1\] REQ-001 を被覆するテストは保留のテスト/);
	assert.match(p, /\[C15\] UC-001 .*のシナリオテストは保留のテスト/);
	const opt = run(project(t, { files: { "tests/x.test.ts": '// @covers REQ-001#ok\nit("ok", { skip: true }, () => {});\n' } }), "--only", "C1").stdout;
	assert.match(opt, /\[C1\] REQ-001 を被覆するテストは保留のテスト/);
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

test("すり抜け: 入れ子の _ ディレクトリの文書、コード識別子の列の無い用語集", (t) => {
	const files = {
		[`${U}/_drafts/REQ-002.md`]: `${fm({ id: "REQ-002", uc: "UC-001", status: "active" })}# x\n`,
		"docs/01-glossary.md": `${fm({ id: "GLOSSARY", status: "living" })}| 用語 | 定義 | 識別子 |\n| --- | --- | --- |\n| 案件 | 単位 | \`createX\` |\n`,
	};
	const out = run(project(t, { files }), "--only", "C9,C26").stdout;
	assert.match(out, /\[C9\] docs\/goals\/GOAL-01-x\/UC-001-x\/_drafts\/REQ-002\.md: id \(REQ-002\) を持つが/);
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

test("テンプレートの既定の印: テストのデータの skip: true は保留でない、折り返した test( と test.for は単位", (t) => {
	const data = { "tests/x.test.ts": 'const defaults = { skip: true, limit: 10 };\n// @covers REQ-001#ok\ntest("ok", () => {});\n' };
	assert.equal(run(project(t, { files: data }), "--only", "C1,C10").status, 0);
	const wrapped = { "tests/x.test.ts": '// @covers REQ-001#ok\ntest(\n  "ok",\n  { tag: ["@a"] },\n  async () => {},\n);\ntest(\n  "bare",\n  async () => {},\n);\n// @covers REQ-001#ok\ntest.for([1, 2])("for %i", () => {});\n' };
	const w = run(project(t, { files: wrapped }), "--only", "C11").stdout;
	assert.match(w, /\[C11\] tests\/x\.test\.ts:7 "bare": @covers の無いテスト/);
	assert.doesNotMatch(w, /どのテストにも属さない/);
});

test("設定エラー（exit 2）: docs.actors / vision がディレクトリ", (t) => {
	const r = run(project(t, { configure: (cfg) => (cfg.docs.vision = "docs/adr") }));
	assert.equal(r.status, 2, r.stdout + r.stderr);
	assert.match(r.stderr, /docs\.vision はファイルにする/);
});

//  ---- 最終の再検証で見つかった退行の回帰（改行した呼び出しの頭をつなげてから印を当てる） ----

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

test("設定エラー（exit 2）: docs.actors がディレクトリでもクラッシュしない", (t) => {
	const r = run(project(t, { configure: (cfg) => (cfg.docs.actors = "docs/rules") }));
	assert.equal(r.status, 2, r.stdout + r.stderr);
	assert.match(r.stderr, /docs\.actors はファイルにする/);
});
