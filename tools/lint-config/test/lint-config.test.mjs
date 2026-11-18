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
	["K2", "source が絶対パス", (c) => (c.rules.layers.source = "/etc/hostname"), /設定ファイルがあるディレクトリの中のファイルを相対パスで書く/],
	["K2", "source が外を指す", (c) => (c.rules.layers.source = "../x.mjs"), /設定ファイルがあるディレクトリの中のファイルを相対パスで書く/],
	["K2", "check が説明の欄を指す", (c) => ((c.commands._comment = "説明"), (c.rules.layers.check = "_comment")), /「_comment」は、決めごとを確かめるコマンドではない/],
	["K2", "check が契約の実例のプロセスを指す", (c) => ((c.commands.contract_adapter = "node a.mjs"), (c.rules.layers.check = "contract_adapter")), /決めごとを確かめるコマンドではない/],
	["K2", "check の先がコマンドの文字列でない", (c) => (c.commands.lint = 1), /commands\.lint がコマンドの文字列でない/],
	["K3", "rule に制御文字", (c) => (c.conventions[0].rule = "a\u001b[31mb"), /conventions\[0\]\.rule は 1 行の文で書く/],
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
	["K4", "approved が先の日付", (c) => (c.exceptions[0].approved = "2999-01-01"), /approved が先の日付になっている/],
	["K4", "exceptions の項目に知らないキー", (c) => (c.exceptions[0].by = "x"), /exceptions\[0\] に知らないキー「by」/],
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

test("ひな形に値を置けない任意のキー（comment_pattern）は K1 を通る", () => {
	const r = run(project({ comment_pattern: "^\\s*#" }));
	assert.equal(r.status, 0, r.stdout);
});

test("各ツールが設定の最上位から読むキーは、すべて K1 を通る", () => {
	const tools = join(HERE, "..", "..");
	const read = new Set();
	for (const f of ["trace-check/trace-check.mjs", "contract-run/contract-run.mjs", "gate-hook/stop-gate.mjs", "gate-hook/gate-hook.mjs"]) {
		const src = readFileSync(join(tools, f), "utf8");
		for (const m of src.matchAll(/\bcfg\??\.([a-z][a-z_]*)/g)) read.add(m[1]);
		//  trace-check の宣言の検査は need("キー" または "キー.子") の形でも読む
		for (const m of src.matchAll(/\bneed\("([a-z][a-z_]*)/g)) read.add(m[1]);
	}
	assert.ok(read.has("comment_pattern"), "need(...) の形で読むキーを拾えていない");
	assert.ok(read.has("docs") && read.has("commands") && read.size >= 10, [...read].join(" "));
	const r = run(project(Object.fromEntries([...read].map((k) => [k, {}]))));
	assert.notEqual(r.status, 2, r.stderr);
	assert.doesNotMatch(r.stdout, /K1/, r.stdout);
});

test("--config で別の場所を指しても、source は設定ファイルがあるディレクトリから探す", () => {
	const d = project(null, { "x/c.json": JSON.stringify(base()), "x/eslint.config.mjs": "" });
	const r = spawnSync(process.execPath, [TOOL, "--config", "x/c.json"], { encoding: "utf8", input: "", cwd: d });
	assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("unit に古い名前のファイルだけが残っていれば、飛ばさずに案内を出して失敗する", () => {
	const r = run(project({ git: { units: { api: "apps/api" } } }, { "apps/api/traceconfig.json": "{}" }));
	assert.equal(r.status, 2, r.stdout);
	assert.match(r.stderr, /unit api（apps\/api）に harness\.config\.json が無い.*改名した/);
});

test("K5: 外やルート自身を指す unit は、黙って飛ばさずに違反にする", () => {
	for (const dir of ["../outside", "/abs/path", ".", ""]) {
		const r = run(project({ git: { units: { api: dir } } }));
		assert.equal(r.status, 1, `${JSON.stringify(dir)}: ${r.stdout}`);
		assert.match(r.stdout, /err  K5  git\.units\.api/);
	}
});

test("「..」で始まるだけの名前は、中のファイル・中の unit として扱う", () => {
	const d = project(change((c) => ((c.rules.layers.source = "..conf/eslint.mjs"), (c.git = { units: { api: "..apps" } }))), { "..conf/eslint.mjs": "", "..apps/harness.config.json": "{}" });
	const r = run(d);
	assert.equal(r.status, 0, r.stdout);
	assert.match(r.stdout, /unit api（\.\.apps\/harness\.config\.json）/);
});

test("形の検査を通らなかった文は、一覧にそのまま出さない", () => {
	const r = run(project(change((c) => (c.conventions[0].rule = "a\u001b[31mRED"))));
	assert.equal(r.status, 1);
	assert.ok(!r.stdout.includes("\u001b"), "制御文字が出力に出ている");
});

test("--root と --config を同時に指定すると 2 で終わる", () => {
	const d = project(base());
	assert.equal(run(d, ["--config", join(d, "harness.config.json")]).status, 2);
});

test("知らない引数は 2 で終わる", () => {
	assert.equal(run(project(base()), ["--fix"]).status, 2);
});

test("K6: 廃止したキー（実装の注釈を読むためのキー。ADR-0070）が残っていれば、代わりにすることを添えて違反にする", () => {
	const cfg = change((c) => {
		c.implements_pattern = "@implements\\s+(REQ-\\d{3})";
		c.operation_pattern = "@operation\\s+(UC-\\d{3})#(\\w+)";
		c.source = { dirs: ["src"], extensions: [".ts"], unit_dirs: ["src/usecase/**"], support_dirs: { none: "無い" }, unit_pattern: "x", implements_placement: "before", entry_pattern: "x", entry_exclude: [], entry_file_pattern: "x" };
		c.schema = { files: ["db/schema.sql"], constraint_pattern: "x", implements_placement: "after" };
		c.entries = { outside_contract: [] };
	});
	const r = run(project(cfg));
	assert.equal(r.status, 1, r.stdout + r.stderr);
	for (const k of ["implements_pattern", "operation_pattern", "source.unit_dirs", "source.support_dirs", "source.unit_pattern", "source.implements_placement", "source.entry_pattern", "source.entry_exclude", "source.entry_file_pattern", "schema.constraint_pattern", "schema.implements_placement", "entries"])
		assert.match(r.stdout, new RegExp(`err  K6  ${k.replace(".", "\\.")} は廃止した（ADR-0070）。.*キーを削除する`));
	assert.match(r.stdout, /K6  implements_pattern .*実装とスキーマの @implements は読まない。紐づきはテストの @covers に書く/);
	assert.match(r.stdout, /K6  source\.entry_pattern .*入口は commands\.list_entries の一覧と契約の突き合わせ（lint entries）で確かめる/);
	assert.match(r.stdout, /K6  schema\.constraint_pattern .*@covers BR-nnn を書く/);
	//  最上位の廃止したキーは、K1（ひな形に無い）ではなく K6 だけで案内する
	assert.match(r.stdout, /K6  entries は廃止した（ADR-0070）。契約の外の入口は置けない（entries\.outside_contract は無くした）。入口はすべて、契約の inbound の操作として書く。キーを削除する/);
	assert.doesNotMatch(r.stdout, /K1  最上位のキー「(implements_pattern|operation_pattern|entries)」/);
	assert.match(r.stdout, /違反 12 件/);
	//  source や schema が none のときは、子のキーは無い
	assert.equal(run(project(change((c) => ((c.source = { none: "コードが無い" }), (c.schema = { none: "DB が無い" }))))).status, 0);
});

test("K2: commands.list_entries は決めごとを確かめるコマンドではないので、rules.check に書けない", () => {
	const r = run(project(change((c) => ((c.commands.list_entries = "node list.mjs"), (c.rules.layers.check = "list_entries")))));
	assert.equal(r.status, 1);
	assert.match(r.stdout, /K2  rules\.layers\.check の「list_entries」は、決めごとを確かめるコマンドではない/);
});

test("K7: monorepo のルートの設定に書いた commands.list_entries は実行されないので、unit に書くよう案内して違反にする", () => {
	const unit = { "apps/web/harness.config.json": JSON.stringify({ commands: { list_entries: "node list.mjs" } }), "eslint.config.mjs": "" };
	const root = change((c) => ((c.git = { units: { web: "apps/web" } }), (c.commands.list_entries = "node list.mjs")));
	const r = run(project(root, unit));
	assert.equal(r.status, 1, r.stdout + r.stderr);
	assert.match(r.stdout, /err  K7  commands\.list_entries は、monorepo のルートの設定に書いても実行されない.*unit の設定（<unit のディレクトリ>\/harness\.config\.json）に書く/);
	assert.match(r.stdout, /違反 1 件/); //  unit の側の同じ宣言は違反にしない
	//  ひな形から写した none は、何も宣言していないので通す。unit を持たない設定では、普通に書ける
	const blank = change((c) => ((c.git = { units: { web: "apps/web" } }), (c.commands.list_entries = { none: "unit に書く" })));
	assert.equal(run(project(blank, unit)).status, 0);
	const single = change((c) => (c.commands.list_entries = "node list.mjs"));
	assert.equal(run(project(single)).status, 0);
});
