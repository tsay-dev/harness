//  config-lint のテスト。形の誤りを 1 つずつ入れ、その検査項目で落ちることを確かめる
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, "..", "config-lint.mjs");
const TEMPLATE = join(HERE, "..", "..", "..", "templates", "develop", "harness.config.json");
const TEMP = [];
after(() => TEMP.forEach((d) => rmSync(d, { recursive: true, force: true })));

//  形の正しい最小の設定。change で書き換える
const base = () => ({
	commands: { typecheck: "tsc", lint: "eslint .", test: "vitest run", system: { none: "まだ無い" } },
	rules: { layers: { source: "eslint.config.mjs", check: "lint" } },
	conventions: [{ rule: "機能をまたぐ判断は relationships に置く", unchecked_because: "依存の向きでは表せない" }],
	exceptions: [{ what: "tests/support/a.ts だけが DB の偽物を直接操作してよい", approved: "2026-10-15" }],
});

function project(cfg, files = { "eslint.config.mjs": "" }) {
	const d = mkdtempSync(join(tmpdir(), "config-lint-"));
	TEMP.push(d);
	if (cfg !== null) writeFileSync(join(d, "harness.config.json"), typeof cfg === "string" ? cfg : JSON.stringify(cfg));
	for (const [f, body] of Object.entries(files)) {
		mkdirSync(dirname(join(d, f)), { recursive: true });
		writeFileSync(join(d, f), body);
	}
	return d;
}
const run = (d, args = []) => spawnSync(process.execPath, [TOOL, "--root", d, ...args], { encoding: "utf8", input: "" });
const change = (f) => {
	const c = base();
	f(c);
	return c;
};

test("形の正しい設定は通り、機械で確かめていない決めごとを件数と一覧で表示する", () => {
	const r = run(project(base()));
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /正本を指す決めごと（rules）: 1 件/);
	assert.match(r.stdout, /人間が認めた例外（exceptions）: 1 件/);
	assert.match(r.stdout, /機械で確かめていない決めごと（conventions）: 1 件/);
	assert.match(r.stdout, /- 機能をまたぐ判断は relationships に置く（確かめていない理由: 依存の向きでは表せない）/);
});

test("省略したキーは「未宣言」、空は「0 件」と表示して区別する", () => {
	const a = run(project({}));
	assert.equal(a.status, 0);
	assert.match(a.stdout, /conventions）: 未宣言/);
	const b = run(project({ rules: {}, conventions: [], exceptions: [] }));
	assert.equal(b.status, 0);
	assert.match(b.stdout, /rules）: 0 件/);
	assert.match(b.stdout, /conventions）: 0 件/);
});

test("ひな形そのものと、ひな形のすべてのキーを持つ設定は K1 を通る", () => {
	const template = JSON.parse(readFileSync(TEMPLATE, "utf8"));
	for (const k of ["rules", "conventions", "exceptions"]) assert.ok(k in template, `ひな形に ${k} が無い`);
	const r = run(project(Object.fromEntries(Object.keys(template).map((k) => [k, k === "conventions" || k === "exceptions" ? [] : {}]))));
	assert.doesNotMatch(r.stdout, /K1/);
});

const BAD = [
	["K1", "最上位のキーの打ち間違い", (c) => ((c.command = c.commands), delete c.commands, delete c.rules), /最上位のキー「command」は、ひな形に無い/],
	["K2", "rules が配列", (c) => (c.rules = []), /rules はオブジェクトで書く/],
	["K2", "source のファイルが無い", (c) => (c.rules.layers.source = "無い.mjs"), /source のファイルが無い: 無い\.mjs/],
	["K2", "source がディレクトリ", (c) => (c.rules.layers.source = "."), /source のファイルが無い/],
	["K2", "source が無い", (c) => delete c.rules.layers.source, /rules\.layers\.source が無い/],
	["K2", "check が commands に無い", (c) => (c.rules.layers.check = "format"), /「format」が commands に宣言されていない/],
	["K2", "check が none の宣言を指す", (c) => (c.rules.layers.check = "system"), /commands\.system は none（まだ無い）.*conventions に書く/],
	["K2", "check が無い", (c) => delete c.rules.layers.check, /rules\.layers\.check が無い/],
	["K2", "rules の項目に知らないキー", (c) => (c.rules.layers.note = "x"), /rules\.layers に知らないキー「note」/],
	["K3", "conventions がオブジェクト", (c) => (c.conventions = {}), /conventions は配列で書く/],
	["K3", "rule が無い", (c) => delete c.conventions[0].rule, /conventions\[0\]\.rule は 1 行の文で書く/],
	["K3", "rule が複数行", (c) => (c.conventions[0].rule = "a\nb"), /conventions\[0\]\.rule は 1 行の文で書く/],
	["K3", "理由が空", (c) => (c.conventions[0].unchecked_because = " "), /unchecked_because は 1 行の文で書く/],
	["K3", "同じ rule を 2 回", (c) => c.conventions.push({ ...c.conventions[0] }), /conventions\[1\]\.rule が重複している/],
	["K3", "conventions の項目に知らないキー", (c) => (c.conventions[0].owner = "x"), /conventions\[0\] に知らないキー「owner」/],
	["K4", "exceptions がオブジェクト", (c) => (c.exceptions = {}), /exceptions は配列で書く/],
	["K4", "what が無い", (c) => delete c.exceptions[0].what, /exceptions\[0\]\.what は 1 行の文で書く/],
	["K4", "approved の書式が違う", (c) => (c.exceptions[0].approved = "2026/10/15"), /approved は実在する日付を YYYY-MM-DD で書く/],
	["K4", "approved が実在しない日付", (c) => (c.exceptions[0].approved = "2026-02-30"), /approved は実在する日付/],
	["K4", "approved が無い", (c) => delete c.exceptions[0].approved, /approved は実在する日付/],
];
for (const [id, name, f, re] of BAD) {
	test(`${id}: ${name} は違反`, () => {
		const r = run(project(change(f)));
		assert.equal(r.status, 1, r.stdout + r.stderr);
		assert.match(r.stdout, re);
		assert.match(r.stdout, new RegExp(`err  ${id}  `));
		assert.match(r.stdout, /違反 1 件/);
	});
}

test("設定が無い・JSON として読めない・最上位がオブジェクトでない、は 2 で終わる", () => {
	assert.equal(run(project(null)).status, 2);
	assert.match(run(project(null)).stderr, /設定が無い/);
	assert.equal(run(project("{")).status, 2);
	assert.equal(run(project("[]")).status, 2);
});

test("古い名前のファイルだけがあるときは、改名の案内を出す", () => {
	const r = run(project(null, { "traceconfig.json": "{}" }));
	assert.equal(r.status, 2);
	assert.match(r.stderr, /harness\.config\.json に改名した/);
});

test("monorepo では unit の設定も検査し、source は unit のディレクトリから探す", () => {
	const unit = change(() => {});
	const d = project({ git: { units: { api: "apps/api", web: "apps/web", bad: 1 } } }, { "apps/api/harness.config.json": JSON.stringify(unit), "apps/api/eslint.config.mjs": "" });
	const ok = run(d);
	assert.equal(ok.status, 0, ok.stdout + ok.stderr);
	assert.match(ok.stdout, /unit api（apps\/api\/harness\.config\.json）/);
	assert.doesNotMatch(ok.stdout, /unit web/); //  設定を持たない unit は検査の対象にしない
	rmSync(join(d, "apps/api/eslint.config.mjs"));
	const ng = run(d);
	assert.equal(ng.status, 1);
	assert.match(ng.stdout, /K2  rules\.layers\.source のファイルが無い/);
});

test("知らない引数は 2 で終わる", () => {
	assert.equal(run(project(base()), ["--fix"]).status, 2);
});
