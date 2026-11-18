//  lint entry のテスト。設定の entry の形の誤りを 1 つずつ作り、その検査項目で落ちることを確かめる
import { test } from "node:test";
import assert from "node:assert/strict";
import { base, project, run, change, entries } from "../../_shared/test/entry-fixture.mjs";

test("entry: テストの入口が本番の組み立てを呼んでいれば通る", () => {
	const r = run(project(), "entry");
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /OK: テストの入口 tests\/app\.ts#createTestApp は、本番の組み立て src\/compose\.ts#assemble を呼んでいる/);
});

test("entry / coverage: 未宣言と none は通るが、確かめていないことを表示する", () => {
	const a = run(project({ cfg: { source: base().source } }), "entry");
	assert.equal(a.status, 0);
	assert.match(a.stdout, /entry が未宣言: .*確かめていない/);
	const b = run(project({ cfg: change((c) => (c.entry = { none: "組み立てが 1 つしか無い" })) }), "entry");
	assert.equal(b.status, 0);
	assert.match(b.stdout, /entry = none（組み立てが 1 つしか無い）/);
	const c = run(project({ cfg: { source: base().source } }), "coverage");
	assert.equal(c.status, 0);
	assert.match(c.stdout, /coverage が未宣言: .*確かめていない/);
	const e = run(project({ cfg: change((x) => (x.coverage = { none: "まだ導入していない" })) }), "coverage");
	assert.equal(e.status, 0);
	assert.match(e.stdout, /coverage = none（まだ導入していない）/);
});

const BAD_ENTRY = [
	["X1", "形が「ファイル#名前」でない", { cfg: change((c) => (c.entry.compose = "src/compose.ts")) }, /「<ファイル>#<名前>」の形で書く/],
	["X1", "ファイルが無い", { cfg: change((c) => (c.entry.compose = "src/none.ts#assemble")) }, /entry\.compose のファイルが無い: src\/none\.ts/],
	["X1", "外のファイル", { cfg: change((c) => (c.entry.compose = "../x.ts#assemble")) }, /entry\.compose のファイルが無い/],
	["X1", "名前がファイルの中に無い", { cfg: change((c) => (c.entry.compose = "src/compose.ts#build")) }, /名前「build」が src\/compose\.ts の中に無い/],
	["X1", "名前の一部が一致するだけ", { cfg: change((c) => (c.entry.compose = "src/compose.ts#assem")) }, /名前「assem」が/],
	["X1", "名前が識別子 1 つでない", { cfg: change((c) => (c.entry.compose = "src/compose.ts#App.assemble")) }, /名前は識別子 1 つ/],
	["X1", "test_entry が無い", { cfg: change((c) => delete c.entry.test_entry) }, /entry\.test_entry が無い/],
	["X1", "知らないキー", { cfg: change((c) => (c.entry.extra = "x")) }, /entry に知らないキー「extra」/],
	["X1", "entry が文字列", { cfg: change((c) => (c.entry = "x")) }, /entry は \{ "compose", "test_entry" \}/],
	["X2", "テストの入口が本番の組み立てを呼んでいない", { files: { "tests/app.ts": "export function createTestApp() { return mount(); }\n" } }, /本番の組み立ての名前「assemble」が無い。テストの入口のファイルから、本番の組み立てを名前で直接呼ぶ/],
	["X2", "テストの入口に、似た別の名前しか無い", { files: { "tests/app.ts": "export function createTestApp() { return assembleFake(); }\n" } }, /本番の組み立ての名前「assemble」が無い/],
	["X2", "同じファイルを指す", { cfg: change((c) => (c.entry.test_entry = "src/compose.ts#assemble")) }, /同じファイルを指している/],
];
for (const [id, name, opts, re] of BAD_ENTRY) {
	test(`entry ${id}: ${name} は違反`, () => {
		const r = run(project(opts), "entry");
		assert.equal(r.status, 1, r.stdout + r.stderr);
		assert.match(r.stdout, re);
		assert.match(r.stdout, new RegExp(`err  ${id}  `));
	});
}

test("entry: 名前は、より長い識別子の一部としては数えない（前後どちらも）", () => {
	for (const body of ["return xassemble();", "return assemblex();", "return _assemble();", "return assemble$();"]) {
		const r = run(project({ files: { "tests/app.ts": `export function createTestApp() { ${body} }\n` } }), "entry");
		assert.equal(r.status, 1, body);
		assert.match(r.stdout, /err  X2  /);
	}
});

test("entry: 日本語などの識別子も名前に書ける", () => {
	const d = project({ cfg: change((c) => (c.entry.compose = "src/compose.ts#組み立て")), files: { "src/compose.ts": "export function 組み立て() {}\n", "tests/app.ts": "export function createTestApp() { return 組み立て(); }\n" } });
	assert.equal(run(d, "entry").status, 0);
});

test("設定が無い・読めない・使い方の誤りは 2 で終わる", () => {
	assert.equal(run(project({ cfg: null }), "entry").status, 2);
	assert.equal(run(project({ cfg: "{" }), "coverage").status, 2);
	const d = project();
	assert.equal(run(d, "entry", ["all"]).status, 2);
	assert.equal(run(d, "entries", ["entries"]).status, 2);
	assert.equal(run(d, "entry", ["--since", "1"]).status, 2);
	assert.equal(run(d, "coverage", ["--since", "x"]).status, 2);
	assert.equal(run(d, "coverage", ["--bogus"]).status, 2);
	assert.equal(run(d, "coverage", ["--from", "x"]).status, 2);
	assert.equal(run(project({ cfg: { docs: { goals_dir: "docs/goals" }, commands: { list_entries: "node list.mjs" } }, lcov: null }), "entries", ["--from", "no-such-file"]).status, 2);
});
