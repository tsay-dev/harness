//  exec-check のテスト。形の誤りや、実行の記録の状態を 1 つずつ変え、その検査項目で落ちることを確かめる
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..", "exec-check.mjs");
const TEMP = [];
after(() => TEMP.forEach((d) => rmSync(d, { recursive: true, force: true })));

//  lcov の 1 件分。hits = 行ごとの実行回数（空なら、実行する行の無いファイル）
const record = (file, hits) => [`SF:${file}`, ...hits.map((h, i) => `DA:${i + 1},${h}`), "end_of_record"].join("\n");

const SOURCES = { "src/compose.ts": "export function assemble() {}\n", "src/a.ts": "export const a = 1;\n", "src/types.ts": "export type T = 1;\n", "src/server.ts": "listen();\n" };
const LCOV = [record("src/compose.ts", [1, 1]), record("src/a.ts", [3, 0]), record("src/types.ts", []), record("src/server.ts", [0, 0])].join("\n");

const base = () => ({
	source: { dirs: ["src"], extensions: [".ts"] },
	entry: { compose: "src/compose.ts#assemble", test_entry: "tests/app.ts#createTestApp" },
	coverage: { report: "coverage/lcov.info", not_run: [{ path: "src/server.ts", reason: "プロセスの入口" }] },
});

function project({ cfg = base(), files = {}, lcov = LCOV } = {}) {
	const d = mkdtempSync(join(tmpdir(), "exec-check-"));
	TEMP.push(d);
	const all = { ...SOURCES, "tests/app.ts": "import { assemble } from '../src/compose';\nexport function createTestApp() { return assemble(); }\n", ...files };
	if (lcov !== null) all["coverage/lcov.info"] = lcov;
	if (cfg !== null) all["harness.config.json"] = typeof cfg === "string" ? cfg : JSON.stringify(cfg);
	for (const [f, body] of Object.entries(all)) {
		if (body === null) continue;
		mkdirSync(dirname(join(d, f)), { recursive: true });
		writeFileSync(join(d, f), body);
	}
	return d;
}
const run = (d, mode, args = []) => spawnSync(process.execPath, [TOOL, mode, "--root", d, ...args], { encoding: "utf8", input: "" });
const change = (f) => {
	const c = base();
	f(c);
	return c;
};

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

test("coverage: 関数ごとの記録があり、組み立ての関数が呼ばれていれば通る。行の要約だけの記録も読む", () => {
	const fn = LCOV.replace("SF:src/compose.ts\n", "SF:src/compose.ts\nFN:1,assemble\nFNDA:4,assemble\n");
	assert.equal(run(project({ lcov: fn }), "coverage").status, 0);
	const summary = ["src/compose.ts", "src/a.ts"].map((f) => `SF:${f}\nLF:3\nLH:2\nend_of_record`).join("\n") + "\nSF:src/types.ts\nLF:0\nLH:0\nend_of_record\nSF:src/server.ts\nLF:3\nLH:0\nend_of_record";
	const r = run(project({ lcov: summary }), "coverage");
	assert.equal(r.status, 0, r.stdout);
	assert.match(r.stdout, /実行する行があるもの 3 件/);
});

test("coverage: すべてのソースが実行されていれば通る。実行する行の無いファイル（型だけ）は違反にしない", () => {
	const r = run(project(), "coverage");
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /OK: 確かめたソース 4 件（実行する行があるもの 3 件）、実行されないことを認めたもの 1 件/);
	assert.match(r.stdout, /実行されないことを認めたもの: src\/server\.ts（プロセスの入口）/);
});

const BAD_COV = [
	["V1", "記録が無い", { lcov: null }, /実行の記録が無い: coverage\/lcov\.info/],
	["V1", "記録が空", { lcov: "" }, /実行の記録に、プロジェクトの中のファイルが 1 つも無い/],
	["V1", "記録のパスがすべて外を指す", { lcov: record("/elsewhere/src/a.ts", [1]) }, /プロジェクトの中のファイルが 1 つも無い[^]*記録のパスの例: \/elsewhere\/src\/a\.ts/],
	["V1", "行の情報が 1 つも無い（SF だけ）", { lcov: Object.keys(SOURCES).map((f) => `SF:${f}\nend_of_record`).join("\n"), cfg: change((c) => ((c.coverage.not_run = []), delete c.entry)) }, /行の情報（DA、または LF \/ LH）を持つソースが 1 つも無い/],
	["V2", "記録のパスの基準が違う（1 件も一致しない）", { lcov: Object.keys(SOURCES).map((f) => record(`pkg/${f}`, [1])).join("\n"), cfg: change((c) => ((c.coverage.not_run = []), delete c.entry)) }, /記録に載っていないソースが 4 件ある[^]*記録のパスの例: pkg\/src\//],
	["V3", "行の要約（LF / LH）だけの記録で、実行 0 行のファイル", { lcov: ["src/compose.ts", "src/a.ts"].map((f) => `SF:${f}\nLF:3\nLH:2\nend_of_record`).join("\n") + "\nSF:src/types.ts\nLF:0\nLH:0\nend_of_record\nSF:src/server.ts\nLF:3\nLH:0\nend_of_record", cfg: change((c) => (c.coverage.not_run = [])) }, /1 行も実行されなかったソースが 1 件ある[^]*src\/server\.ts/],
	["V5", "組み立てのファイルは読み込まれたが、関数は 1 回も呼ばれていない", { lcov: LCOV.replace("SF:src/compose.ts\n", "SF:src/compose.ts\nFN:1,assemble\nFNDA:0,assemble\n") }, /本番の組み立ての関数 assemble（src\/compose\.ts）が、テストから 1 回も呼ばれていない/],
	["V1", "report が無い", { cfg: change((c) => delete c.coverage.report) }, /coverage\.report が無い/],
	["V1", "知らないキー", { cfg: change((c) => (c.coverage.threshold = 80)) }, /coverage に知らないキー「threshold」/],
	["V1", "scope が空", { cfg: change((c) => (c.coverage.scope = [])) }, /coverage\.scope は、パスか glob の配列で書く/],
	["V2", "記録に載っていないソース", { files: { "src/new.ts": "export const n = 1;\n" } }, /実行の記録に載っていないソースが 1 件ある[^]*src\/new\.ts/],
	["V2", "source が無い", { cfg: change((c) => delete c.source) }, /source\.dirs が無いので、確かめるソースが決まらない/],
	["V2", "scope に入るソースが無い", { cfg: change((c) => ((c.coverage.scope = ["lib"]), (c.coverage.not_run = []), delete c.entry)) }, /coverage\.scope に入るソースが 1 つも無い/],
	["V3", "1 行も実行されなかったソース", { cfg: change((c) => (c.coverage.not_run = [])) }, /1 行も実行されなかったソースが 1 件ある[^]*src\/server\.ts/],
	["V4", "認めたファイルが実行されている", { lcov: LCOV.replace("SF:src/server.ts\nDA:1,0", "SF:src/server.ts\nDA:1,5") }, /src\/server\.ts は実行されている。coverage\.not_run から消す/],
	["V4", "認めたファイルがソースでない", { cfg: change((c) => c.coverage.not_run.push({ path: "src/gone.ts", reason: "x" })) }, /path がソースのファイルでない: src\/gone\.ts/],
	["V4", "reason が無い", { cfg: change((c) => delete c.coverage.not_run[0].reason) }, /reason は 1 行の文で書く/],
	["V4", "同じ path を 2 回", { cfg: change((c) => c.coverage.not_run.push({ ...c.coverage.not_run[0] })) }, /path が重複している: src\/server\.ts/],
	["V4", "not_run が配列でない", { cfg: change((c) => (c.coverage.not_run = {})) }, /coverage\.not_run は配列で書く/],
	["V5", "本番の組み立てが実行されていない", { lcov: LCOV.replace("SF:src/compose.ts\nDA:1,1\nDA:2,1", "SF:src/compose.ts\nDA:1,0\nDA:2,0"), cfg: change((c) => c.coverage.not_run.push({ path: "src/compose.ts", reason: "x" })) }, /本番の組み立て（src\/compose\.ts）が、テストから実行されていない/],
];
for (const [id, name, opts, re] of BAD_COV) {
	test(`coverage ${id}: ${name} は違反`, () => {
		const r = run(project(opts), "coverage");
		assert.equal(r.status, 1, r.stdout + r.stderr);
		assert.match(r.stdout, re);
		assert.match(r.stdout, new RegExp(`err  ${id}  `));
	});
}

test("coverage: --since より古い記録は違反（前回の記録で通さない）", () => {
	const d = project();
	const old = new Date(Date.now() - 60_000);
	utimesSync(join(d, "coverage/lcov.info"), old, old);
	const stale = run(d, "coverage", ["--since", String(Date.now() - 1000)]);
	assert.equal(stale.status, 1);
	assert.match(stale.stdout, /err  V1  実行の記録が古い/);
	assert.equal(run(d, "coverage", ["--since", String(Date.now() - 120_000)]).status, 0);
});

test("coverage: scope の外のソースは確かめず、件数を表示する", () => {
	const d = project({ cfg: change((c) => ((c.source.dirs = ["src", "web"]), (c.coverage.scope = ["src"]))), files: { "web/page.ts": "export const p = 1;\n", "web/b.ts": "x\n" } });
	const r = run(d, "coverage");
	assert.equal(r.status, 0, r.stdout);
	assert.match(r.stdout, /範囲（coverage\.scope）の外のソース 2 件は、この記録では確かめていない/);
	//  scope を書かなければ、source.dirs の全部を確かめる
	const all = run(project({ cfg: change((c) => (c.source.dirs = ["src", "web"])), files: { "web/page.ts": "export const p = 1;\n" } }), "coverage");
	assert.equal(all.status, 1);
	assert.match(all.stdout, /V2  実行の記録に載っていないソースが 1 件ある/);
});

test("coverage: 記録のパスが絶対パスでも、プロジェクトの中のファイルとして読む。外のファイルは無視する", () => {
	const d = project({ lcov: null });
	const abs = LCOV.replace(/SF:/g, `SF:${d}/`) + "\n" + record("/usr/lib/other.ts", [1]);
	mkdirSync(join(d, "coverage"), { recursive: true });
	writeFileSync(join(d, "coverage/lcov.info"), abs);
	assert.equal(run(d, "coverage").status, 0);
});

test("coverage: source の除外（!）と拡張子に従う", () => {
	const d = project({ cfg: change((c) => (c.source.dirs = ["src", "!**/*.test.*"])), files: { "src/a.test.ts": "test\n", "src/readme.md": "x\n" } });
	assert.equal(run(d, "coverage").status, 0);
});

test("設定が無い・読めない・使い方の誤りは 2 で終わる", () => {
	assert.equal(run(project({ cfg: null }), "entry").status, 2);
	assert.equal(run(project({ cfg: "{" }), "coverage").status, 2);
	const d = project();
	assert.equal(spawnSync(process.execPath, [TOOL], { encoding: "utf8" }).status, 2);
	assert.equal(run(d, "all").status, 2);
	assert.equal(run(d, "entry", ["--since", "1"]).status, 2);
	assert.equal(run(d, "coverage", ["--since", "x"]).status, 2);
	assert.equal(run(d, "coverage", ["--bogus"]).status, 2);
});
