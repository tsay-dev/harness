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
//  fns = { 関数の名前: 呼ばれた回数 }。関数の情報を出す道具と同じく、関数を持たないファイルにも FNF:0 を書く
const record = (file, hits, fns = {}) =>
	[`SF:${file}`, ...Object.keys(fns).map((n, i) => `FN:${i + 1},${n}`), ...Object.entries(fns).map(([n, c]) => `FNDA:${c},${n}`), `FNF:${Object.keys(fns).length}`, ...hits.map((h, i) => `DA:${i + 1},${h}`), "end_of_record"].join("\n");

const SOURCES = { "src/compose.ts": "export function assemble() {}\n", "src/a.ts": "export const a = 1;\n", "src/types.ts": "export type T = 1;\n", "src/server.ts": "listen();\n" };
const LCOV = [record("src/compose.ts", [1, 1]), record("src/a.ts", [3, 0], { used: 2, "(anonymous_0)": 0, anonymous_7: 0, "<anonymous>": 0 }), record("src/types.ts", []), record("src/server.ts", [0, 0])].join("\n");

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
	const r = run(project({ lcov: summary, cfg: change((c) => (c.coverage.functions = { none: "記録を出す道具が関数の情報を出さない" })) }), "coverage");
	assert.equal(r.status, 0, r.stdout);
	assert.match(r.stdout, /実行する行があるもの 3 件/);
	assert.match(r.stdout, /coverage\.functions = none（記録を出す道具が関数の情報を出さない）: 呼ばれなかった関数が無いかを確かめていない/);
});

test("coverage: すべてのソースが実行されていれば通る。実行する行の無いファイル（型だけ）は違反にしない", () => {
	const r = run(project(), "coverage");
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /OK: 確かめたソース 4 件（実行する行があるもの 3 件）、確かめた名前のある関数 1 件、実行されないことを認めたもの 1 件/);
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
	["V6", "呼ばれなかった関数", { lcov: LCOV.replace("FNDA:2,used", "FNDA:2,used\nFN:9,left\nFNDA:0,left") }, /1 回も呼ばれなかった関数が 1 件ある[^]*src\/a\.ts#left/],
	["V7", "記録に関数ごとの情報が無い", { lcov: LCOV.replace(/^FN.*\n/gm, "") }, /関数ごとの情報（FN \/ FNDA）が 1 つも無い: coverage\/lcov\.info[^]*coverage\.functions を \{ "none": "<理由>" \}/],
	["V7", "記録に関数の情報があるのに functions を none にしている", { cfg: change((c) => (c.coverage.functions = { none: "出せないと思っていた" })) }, /coverage\.functions を none にできない（実行の記録 coverage\/lcov\.info に、関数ごとの情報 FN \/ FNDA がある）[^]*（none の理由: 出せないと思っていた）/],
	["V7", "一部のファイルにだけ関数の情報が無い", { lcov: LCOV.replace("SF:src/compose.ts\nFNF:0\n", "SF:src/compose.ts\n") }, /関数ごとの情報（FN \/ FNDA）も、関数を持たないことを示す「FNF:0」も無いソースが 1 件ある[^]*src\/compose\.ts/],
	["V7", "関数の数（FNF:1）はあるのに、FN / FNDA が落ちているファイル", { lcov: LCOV.replace("SF:src/compose.ts\nFNF:0\n", "SF:src/compose.ts\nFNF:1\n") }, /「FNF:0」も無いソースが 1 件ある[^]*src\/compose\.ts/],
	["V7", "全ファイルが FNF:0 だけの記録（FN / FNDA が 1 つも無い）", { lcov: LCOV.replace(/^FN:.*\n|^FNDA:.*\n/gm, "").replace(/^FNF:\d+$/gm, "FNF:0") }, /関数ごとの情報（FN \/ FNDA）が 1 つも無い: coverage\/lcov\.info[^]*「FNF:0」だけの記録は、関数の情報がある記録に数えない/],
	["V1", "coverage が null（例外で止まらず、文のある違反になる）", { cfg: change((c) => (c.coverage = null)) }, /coverage は \{ "report", "not_run" \} か \{ "none": "<理由>" \} で書く（実際: null）/],
	["V1", "coverage が文字列", { cfg: change((c) => (c.coverage = "coverage/lcov.info")) }, /coverage は \{ "report", "not_run" \} か \{ "none": "<理由>" \} で書く（実際: "coverage\/lcov\.info"）/],
	["V1", "coverage が空のオブジェクト", { cfg: change((c) => (c.coverage = {})) }, /coverage\.report が無い/],
	["V6", "同じ名前の関数がどれも呼ばれていない（1 件として数える）", { lcov: LCOV.replace("FNDA:2,used", "FNDA:2,used\nFN:5,twice\nFN:9,twice\nFNDA:0,twice\nFNDA:0,twice") }, /1 回も呼ばれなかった関数が 1 件ある[^]*src\/a\.ts#twice/],
	["V6", "名前にカンマを含む関数（FN の名前を最後のカンマで切らない）", { lcov: LCOV.replace("FNDA:2,used", "FNDA:2,used\nFN:5,pair(int, int)\nFNDA:0,pair(int, int)") }, /src\/a\.ts#pair\(int, int\)\n/],
	["V6", "開始行と終了行を持つ FN（FN:<開始行>,<終了行>,<名前>）", { lcov: LCOV.replace("FNDA:2,used", "FNDA:2,used\nFN:5,8,ranged\nFNDA:0,ranged\nFN:9,12,noCount") }, /1 回も呼ばれなかった関数が 2 件ある[^]*src\/a\.ts#ranged\n\s+src\/a\.ts#noCount/],
	["V7", "functions の形が誤り", { cfg: change((c) => (c.coverage.functions = false)) }, /coverage\.functions は、関数の単位の検査を使わないときにだけ/],
	["V7", "functions の none に理由が無い", { cfg: change((c) => (c.coverage.functions = { none: " " })) }, /coverage\.functions は、関数の単位の検査を使わないときにだけ/],
	["V4", "認めた関数が呼ばれている", { cfg: change((c) => c.coverage.not_run.push({ path: "src/a.ts#used", reason: "x" })) }, /src\/a\.ts#used は呼ばれている。coverage\.not_run から消す/],
	["V4", "認めた関数が記録に無い", { cfg: change((c) => c.coverage.not_run.push({ path: "src/a.ts#gone", reason: "x" })) }, /実行の記録の src\/a\.ts に、gone という名前の関数が無い/],
	["V4", "認めた関数のファイルがソースでない", { cfg: change((c) => c.coverage.not_run.push({ path: "src/gone.ts#f", reason: "x" })) }, /ファイルがソースのファイルでない: src\/gone\.ts/],
	["V4", "名前の無い関数は認める項目に書けない", { cfg: change((c) => c.coverage.not_run.push({ path: "src/a.ts#(anonymous_0)", reason: "x" })) }, /名前の無い関数は検査の対象でないので、書けない/],
	["V4", "同じ関数を 2 回", { lcov: LCOV.replace("FNDA:2,used", "FNDA:2,used\nFN:9,left\nFNDA:0,left"), cfg: change((c) => c.coverage.not_run.push({ path: "src/a.ts#left", reason: "x" }, { path: "src/a.ts#left", reason: "x" })) }, /path が重複している: src\/a\.ts#left/],
	["V4", "ファイルごと認めたものの中の関数", { lcov: LCOV.replace("SF:src/server.ts", "SF:src/server.ts\nFN:1,listen\nFNDA:0,listen"), cfg: change((c) => c.coverage.not_run.push({ path: "src/server.ts#listen", reason: "x" })) }, /ファイル src\/server\.ts ごと coverage\.not_run に書いてあるので、関数の項目は要らない/],
	["V4", "functions が none なのに関数の項目がある", { cfg: change((c) => ((c.coverage.functions = { none: "出せない" }), c.coverage.not_run.push({ path: "src/a.ts#used", reason: "x" }))) }, /coverage\.functions が none なので関数の単位では確かめていない/],
	["V1", "report が無い", { cfg: change((c) => delete c.coverage.report) }, /coverage\.report が無い/],
	["V1", "知らないキー", { cfg: change((c) => (c.coverage.threshold = 80)) }, /coverage に知らないキー「threshold」/],
	["V1", "scope が空", { cfg: change((c) => (c.coverage.scope = [])) }, /coverage\.scope は、パスか glob の配列で書く/],
	["V2", "記録に載っていないソース", { files: { "src/new.ts": "export const n = 1;\n" } }, /実行の記録に載っていないソースが 1 件ある[^]*src\/new\.ts/],
	["V2", "source が無い", { cfg: change((c) => delete c.source) }, /source\.dirs が無いので、確かめるソースが決まらない/],
	["V2", "scope に入るソースが無い", { cfg: change((c) => ((c.coverage.scope = ["lib"]), (c.coverage.not_run = []), delete c.entry)) }, /coverage\.scope に入るソースが 1 つも無い/],
	["V3", "1 行も実行されなかったソース", { cfg: change((c) => (c.coverage.not_run = [])) }, /1 行も実行されなかったソースが 1 件ある[^]*src\/server\.ts/],
	["V4", "認めたファイルが実行されている", { lcov: LCOV.replace("SF:src/server.ts\nFNF:0\nDA:1,0", "SF:src/server.ts\nFNF:0\nDA:1,5") }, /src\/server\.ts は実行されている。coverage\.not_run から消す/],
	["V4", "認めたファイルがソースでない", { cfg: change((c) => c.coverage.not_run.push({ path: "src/gone.ts", reason: "x" })) }, /path がソースのファイルでない: src\/gone\.ts/],
	["V4", "reason が無い", { cfg: change((c) => delete c.coverage.not_run[0].reason) }, /reason は 1 行の文で書く/],
	["V4", "同じ path を 2 回", { cfg: change((c) => c.coverage.not_run.push({ ...c.coverage.not_run[0] })) }, /path が重複している: src\/server\.ts/],
	["V4", "not_run が配列でない", { cfg: change((c) => (c.coverage.not_run = {})) }, /coverage\.not_run は配列で書く/],
	["V5", "本番の組み立てが実行されていない", { lcov: LCOV.replace("SF:src/compose.ts\nFNF:0\nDA:1,1\nDA:2,1", "SF:src/compose.ts\nFNF:0\nDA:1,0\nDA:2,0"), cfg: change((c) => c.coverage.not_run.push({ path: "src/compose.ts", reason: "x" })) }, /本番の組み立て（src\/compose\.ts）が、テストから実行されていない/],
];
for (const [id, name, opts, re] of BAD_COV) {
	test(`coverage ${id}: ${name} は違反`, () => {
		const r = run(project(opts), "coverage");
		assert.equal(r.status, 1, r.stdout + r.stderr);
		assert.match(r.stdout, re);
		assert.match(r.stdout, new RegExp(`err  ${id}  `));
	});
}

test("coverage V6: 呼ばれなかった関数は、coverage.not_run に <ファイル>#<関数の名前> で理由を書けば通る。名前の無い関数は対象にしない", () => {
	const lcov = LCOV.replace("FNDA:2,used", "FNDA:2,used\nFN:9,left\nFNDA:0,left");
	const r = run(project({ lcov, cfg: change((c) => c.coverage.not_run.push({ path: "src/a.ts#left", reason: "移行が済むまで残す" })) }), "coverage");
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /実行されないことを認めたもの: src\/a\.ts#left（移行が済むまで残す）/);
	assert.match(r.stdout, /確かめた名前のある関数 2 件、実行されないことを認めたもの 2 件/);
	//  (anonymous_0)・anonymous_7・<anonymous> は 1 回も呼ばれていないが、名前で指せないので違反にしない（基本の記録がその形）
	assert.doesNotMatch(run(project(), "coverage").stdout, /anonymous/);
});

test("coverage V7: FNF:0 だけの記録は、functions を none にすれば通る（関数の単位では確かめていないと表示する）。none の文は記録の中身と食い違わない", () => {
	const fnfOnly = LCOV.replace(/^FN:.*\n|^FNDA:.*\n/gm, "").replace(/^FNF:\d+$/gm, "FNF:0");
	const r = run(project({ lcov: fnfOnly, cfg: change((c) => (c.coverage.functions = { none: "記録を出す道具が関数の情報を出さない" })) }), "coverage");
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /coverage\.functions = none（記録を出す道具が関数の情報を出さない）: 呼ばれなかった関数が無いかを確かめていない/);
	assert.match(r.stdout, /関数の単位では確かめていない/);
	assert.doesNotMatch(r.stdout, /FN \/ FNDA がある|確かめた名前のある関数/);
});

test("coverage V6: 同じ名前の関数が 1 つのファイルに複数あれば、どれか 1 つが呼ばれていれば通る。1 行も実行されなかったファイルの関数は V3 だけで報告する", () => {
	//  記録は名前でしか区別できないので、呼ばれた回数を足して数える（0 回 + 1 回 = 1 回 → 通る。認めた項目に書けば「呼ばれている」で違反）
	const dup = LCOV.replace("FNDA:2,used", "FNDA:2,used\nFN:5,twice\nFN:9,twice\nFNDA:0,twice\nFNDA:1,twice");
	const d = run(project({ lcov: dup }), "coverage");
	assert.equal(d.status, 0, d.stdout);
	assert.match(d.stdout, /確かめた名前のある関数 2 件/);
	const admitted = run(project({ lcov: dup, cfg: change((c) => c.coverage.not_run.push({ path: "src/a.ts#twice", reason: "x" })) }), "coverage");
	assert.match(admitted.stdout, /err  V4  src\/a\.ts#twice は呼ばれている/);
	//  名前にカンマを含む関数も、FN と FNDA が同じ名前として読まれる（呼ばれていれば通る）
	const comma = LCOV.replace("FNDA:2,used", "FNDA:2,used\nFN:5,pair(int, int)\nFNDA:3,pair(int, int)\nFN:9,12,ranged\nFNDA:1,ranged");
	const c = run(project({ lcov: comma }), "coverage");
	assert.equal(c.status, 0, c.stdout);
	assert.match(c.stdout, /確かめた名前のある関数 3 件/);
	const idle = run(project({ lcov: LCOV.replace("SF:src/server.ts", "SF:src/server.ts\nFN:1,listen\nFNDA:0,listen"), cfg: change((c) => (c.coverage.not_run = [])) }), "coverage");
	assert.equal(idle.status, 1);
	assert.match(idle.stdout, /err  V3  /);
	assert.doesNotMatch(idle.stdout, /err  V6  /);
});

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
	assert.equal(run(d, "coverage", ["--from", "x"]).status, 2);
	assert.equal(run(project({ cfg: { docs: { goals_dir: "docs/goals" }, commands: { list_entries: "node list.mjs" } }, lcov: null }), "entries", ["--from", "no-such-file"]).status, 2);
});

//  ---- entries: アプリの入口の一覧と契約の突き合わせ（ADR-0070） ----

const op = (name, { transport = "http", direction = "inbound", owned = true, method = "GET", path = null, entry = null } = {}) =>
	`  ${name}:\n    transport: ${transport}\n    direction: ${direction}\n    owned: ${owned}\n    auth: none\n    summary: s\n` +
	(transport === "http" ? `    wire:\n      method: ${method}\n      path: ${path}\n      success: 200\n` : "") +
	(entry ? `    entry: ${entry}\n` : "") +
	"    errors: []\n";
const contract = (uc, status, ops) => `x-uc: ${uc}\nx-status: ${status}\noperations:\n${ops.join("")}`;
const ucDoc = (id, status = "active") => `---\nid: ${id}\ntitle: t\nstatus: ${status}\n---\n\n# ${id}\n`;
const G = "docs/goals/GOAL-01-x";
//  架空のアプリ: 会員を読む・作る（fixed）、通知を受け取る（fixed。push）、下書きの操作（draft）、撤回済みの UC の操作、外の API を呼ぶ操作（outbound）、
//  運用のための入口（生存確認と静的なファイルの配信。これも契約の操作として書く）
const DOCS = {
	[`${G}/UC-001-members/UC.md`]: ucDoc("UC-001"),
	[`${G}/UC-001-members/contract.yaml`]: contract("UC-001", "fixed", [
		op("getMember", { path: "/api/members/{accountId}" }),
		op("createMember", { method: "POST", path: "/api/members" }),
		op("receiveNotice", { transport: "push", entry: "notice.updated" }),
		op("sendMail", { transport: "http", direction: "outbound", owned: false, method: "POST", path: "/v1/mail" }),
	]),
	[`${G}/UC-002-draft/UC.md`]: ucDoc("UC-002", "draft"),
	[`${G}/UC-002-draft/contract.yaml`]: contract("UC-002", "draft", [op("exportMembers", { path: "/api/members/export" })]),
	[`${G}/UC-003-old/UC.md`]: ucDoc("UC-003", "withdrawn"),
	[`${G}/UC-003-old/contract.yaml`]: contract("UC-003", "fixed", [op("oldReport", { path: "/api/old-report" })]),
	[`${G}/UC-004-operate/UC.md`]: ucDoc("UC-004"),
	[`${G}/UC-004-operate/contract.yaml`]: contract("UC-004", "fixed", [op("checkHealth", { path: "/api/health" }), op("serveAssets", { path: "/assets/*" })]),
};
const line = (o) => JSON.stringify(o);
const LIST = [
	line({ kind: "http", method: "GET", path: "/api/members/:accountId" }),
	line({ kind: "http", method: "post", path: "/api/members/" }),
	line({ kind: "push", name: "notice.updated" }),
	line({ kind: "http", method: "GET", path: "/api/health" }),
	line({ kind: "http", method: "GET", path: "/assets/*" }),
].join("\n");
const entriesCfg = (f = () => {}) => {
	const c = { docs: { goals_dir: "docs/goals" }, commands: { list_entries: "node scripts/list-entries.mjs" } };
	f(c);
	return c;
};
const entries = ({ cfg = entriesCfg(), list = LIST, files = {} } = {}) => {
	const d = project({ cfg, files: { ...DOCS, ...files, "entries.jsonl": list }, lcov: null });
	return run(d, "entries", ["--from", join(d, "entries.jsonl")]);
};

test("entries: 一覧の入口がすべて契約の inbound の操作に合い、fixed の操作の入口が一覧にあれば通る（パラメーターの書き方・method の大小・末尾の / の違いは同じに扱う）", () => {
	const r = entries();
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /OK: 入口 5 件（すべて fixed の契約の inbound の操作に合う）、fixed の契約の inbound の操作 5 件/);
});

test("entries: 契約が draft の間は、入口が無いのが正しい（draft の契約の操作しか無ければ、一覧が 0 行でも通る）", () => {
	const draftOnly = { [`${G}/UC-001-members/contract.yaml`]: null, [`${G}/UC-004-operate/contract.yaml`]: null };
	const r = entries({ files: draftOnly, list: "" });
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /OK: 入口は無い、fixed の契約の inbound の操作 0 件/);
	//  同じ状態では、list_entries を none にもできる（none を認める条件と、0 行を認める条件は同じ）
	const d = project({ cfg: entriesCfg((c) => (c.commands.list_entries = { none: "契約が fixed になるまで入口を置かない" })), files: { ...DOCS, ...draftOnly }, lcov: null });
	assert.equal(run(d, "entries").status, 0);
	//  同じ状態で入口を置くと、契約を fixed にするまで違反
	const early = entries({ files: draftOnly, list: line({ kind: "http", method: "GET", path: "/api/members/export" }) });
	assert.equal(early.status, 1);
	assert.match(early.stdout, /err  E1  契約が fixed でない入口: GET \/api\/members\/export/);
});

test("entries: fixed の契約で owned が false の inbound の操作（外部からの通知など）に合う入口は通る", () => {
	const hook = { [`${G}/UC-004-operate/contract.yaml`]: contract("UC-004", "fixed", [op("checkHealth", { path: "/api/health" }), op("serveAssets", { path: "/assets/*" }), op("receiveHook", { owned: false, method: "POST", path: "/hooks/pay" })]) };
	const r = entries({ files: hook, list: `${LIST}\n${line({ kind: "http", method: "POST", path: "/hooks/pay" })}` });
	assert.equal(r.status, 0, r.stdout + r.stderr);
});

//  一覧のパスの書式に無い形。パラメーター 1 つとみなすと、契約より広い入口が契約の {accountId} に合ったことになる
const BAD_PATH_FORMS = ["/api/members/[...slug]", "/api/members/[id]", "/api/members/{*splat}", "/api/members/:rest{.+}", "/api/members/{path:path}", "/api/members/:id?", "/api/members/${id}", "/api/members/<int:id>", "/api/members/:id(\\d+)", "/api/members/:id.json", "/api/members/x*", "/api/members/:id?x=1", "/api/members/:id#top"];
for (const path of BAD_PATH_FORMS) {
	test(`entries E4: 一覧のパスが書式に無い形（${path}）は、契約のパラメーターに合わせず、読めない行として違反`, () => {
		const r = entries({ list: LIST.replace("/api/members/:accountId", path.replace(/\\/g, "\\\\")) });
		assert.equal(r.status, 1, r.stdout + r.stderr);
		assert.ok(r.stdout.includes(`err  E4  一覧の 1 行目: path に、決まった書式に無い形がある: ${path}（パラメーターは、/ で区切った区分の全体を :name か {name} と書く`), r.stdout);
		//  読めない行は入口として数えないので、契約の操作の入口は無いままになる
		assert.match(r.stdout, /err  E2  UC-001#getMember/);
	});
}

test("entries: 契約の側も * と書いていれば、* の入口はそれとだけ合う。inbound の操作が無ければ、一覧が 0 行でも通る", () => {
	const star = { [`${G}/UC-001-members/contract.yaml`]: contract("UC-001", "fixed", [op("serveFiles", { path: "/files/*" })]), [`${G}/UC-002-draft/contract.yaml`]: null, [`${G}/UC-004-operate/contract.yaml`]: null };
	const ok = entries({ files: star, list: line({ kind: "http", method: "GET", path: "/files/**" }) });
	assert.equal(ok.status, 0, ok.stdout + ok.stderr);
	const param = entries({ files: star, list: line({ kind: "http", method: "GET", path: "/files/:name" }) });
	assert.match(param.stdout, /err  E1  契約に無い入口: GET \/files\/:name/);
	const none = { [`${G}/UC-001-members/contract.yaml`]: contract("UC-001", "fixed", [op("sendMail", { direction: "outbound", owned: false, method: "POST", path: "/v1/mail" })]), [`${G}/UC-002-draft/contract.yaml`]: null, [`${G}/UC-004-operate/contract.yaml`]: null };
	const empty = entries({ files: none, list: "" });
	assert.equal(empty.status, 0, empty.stdout + empty.stderr);
	assert.match(empty.stdout, /OK: 入口は無い、fixed の契約の inbound の操作 0 件/);
});

test("entries: パラメーターの名前には - も使える。deeplink は、区分の全体が :name か {name} のときだけパラメーターとみなす", () => {
	const files = {
		[`${G}/UC-001-members/contract.yaml`]: contract("UC-001", "fixed", [op("getItem", { path: "/api/items/{item-id}" }), op("openItem", { transport: "deeplink", entry: '"app://item/{itemId}"' }), op("openProfile", { transport: "deeplink", entry: '"myapp:profile"' }), op("openSettings", { transport: "deeplink", entry: '"myapp:settings"' })]),
		[`${G}/UC-002-draft/contract.yaml`]: null,
		[`${G}/UC-004-operate/contract.yaml`]: null,
	};
	const list = [line({ kind: "http", method: "GET", path: "/api/items/:id-x" }), line({ kind: "deeplink", name: "app://item/:id" }), line({ kind: "deeplink", name: "myapp:profile" }), line({ kind: "deeplink", name: "myapp:settings" })].join("\n");
	const r = entries({ files, list });
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /OK: 入口 4 件/);
});

test("entries: 一覧は標準入力からも読める", () => {
	const d = project({ cfg: entriesCfg(), files: DOCS, lcov: null });
	const r = spawnSync(process.execPath, [TOOL, "entries", "--root", d], { encoding: "utf8", input: LIST });
	assert.equal(r.status, 0, r.stdout + r.stderr);
});

const BAD_ENTRIES = [
	["E1", "契約に無い入口", { list: `${LIST}\n${line({ kind: "http", method: "DELETE", path: "/api/members/:id" })}` }, /契約に無い入口: DELETE \/api\/members\/:id/],
	["E1", "method が違う", { list: LIST.replace('"post"', '"PUT"') }, /契約に無い入口: PUT \/api\/members\//],
	["E1", "撤回済みの UC の契約にしか無い入口", { list: `${LIST}\n${line({ kind: "http", method: "GET", path: "/api/old-report" })}` }, /契約に無い入口: GET \/api\/old-report/],
	["E1", "outbound の操作と同じパスの入口", { list: `${LIST}\n${line({ kind: "http", method: "POST", path: "/v1/mail" })}` }, /契約に無い入口: POST \/v1\/mail/],
	["E1", "http 以外で契約に無い入口", { list: `${LIST}\n${line({ kind: "deeplink", name: "app://open/{id}" })}` }, /契約に無い入口: deeplink app:\/\/open\/\{id\}/],
	["E1", "契約に書いていない運用の入口（生存確認）は、認める宣言の手段が無く、必ず違反になる", { files: { [`${G}/UC-004-operate/contract.yaml`]: contract("UC-004", "fixed", [op("serveAssets", { path: "/assets/*" })]) } }, /契約に無い入口: GET \/api\/health（契約に inbound の操作として書くか、使っていなければ入口を消す。生存確認や静的なファイルの配信のような入口も、契約に書く）/],
	["E4", "廃止した entries.outside_contract に書いても、入口は認められない", { cfg: entriesCfg((c) => (c.entries = { outside_contract: [{ entry: "GET /api/health", reason: "監視が呼ぶ生存確認" }] })), files: { [`${G}/UC-004-operate/contract.yaml`]: contract("UC-004", "fixed", [op("serveAssets", { path: "/assets/*" })]) } }, /設定の entries は廃止した（契約の外の入口は置けない）[^]*err  E1  契約に無い入口: GET \/api\/health/],
	["E4", "廃止した entries のキーが残っている（空でも）", { cfg: entriesCfg((c) => (c.entries = { outside_contract: [] })) }, /設定の entries は廃止した（契約の外の入口は置けない）。キーを削除し/],
	["E1", "何でも受ける登録（/assets/*）は、契約が同じ * の書き方を持つときだけ合う（契約がパラメーターなら合わない）", { files: { [`${G}/UC-004-operate/contract.yaml`]: contract("UC-004", "fixed", [op("checkHealth", { path: "/api/health" }), op("serveAssets", { path: "/assets/{name}" })]) } }, /契約に無い入口: GET \/assets\/\*/],
	["E2", "fixed の操作の入口が一覧に無い", { list: LIST.split("\n").slice(1).join("\n") }, /UC-001#getMember（fixed、owned かつ inbound）に合う入口が、一覧に無い: GET \/api\/members\/\{accountId\}/],
	["E2", "fixed の push の操作の入口が一覧に無い", { list: LIST.replace("notice.updated", "notice.created") }, /UC-001#receiveNotice（fixed、owned かつ inbound）に合う入口が、一覧に無い: push notice\.updated/],
	["E2", "契約が * なのに、一覧の入口がパラメーター", { list: LIST.replace("/assets/*", "/assets/:name") }, /UC-004#serveAssets（fixed、owned かつ inbound）に合う入口が、一覧に無い: GET \/assets\/\*/],
	["E4", "fixed の契約に inbound の操作があるのに一覧が 0 行", { list: "", files: { [`${G}/UC-001-members/contract.yaml`]: contract("UC-001", "fixed", [op("receiveHook", { owned: false, method: "POST", path: "/hooks/pay" })]), [`${G}/UC-004-operate/contract.yaml`]: null } }, /入口の一覧が 0 行（撤回されていない UC の fixed の契約に inbound の操作が 1 件ある。例: UC-001#receiveHook）/],
	["E1", "draft の契約の操作にしか合わない入口（人が承認していない契約では、入口を通さない）", { list: `${LIST}\n${line({ kind: "http", method: "GET", path: "/api/members/export" })}` }, /契約が fixed でない入口: GET \/api\/members\/export（合う操作 UC-002#exportMembers はあるが、その契約の x-status が draft。fixed でない契約の操作は、入口の突き合わせ先に数えない/],
	["E1", "x-status の無い契約の操作にしか合わない入口", { list: `${LIST}\n${line({ kind: "http", method: "GET", path: "/api/members/export" })}`, files: { [`${G}/UC-002-draft/contract.yaml`]: contract("UC-002", "draft", [op("exportMembers", { path: "/api/members/export" })]).replace("x-status: draft\n", "") } }, /契約が fixed でない入口: GET \/api\/members\/export（合う操作 UC-002#exportMembers はあるが、その契約に x-status が無い。/],
	["E4", "契約の wire.path が書式に無い形（どの入口とも合わない。原因が契約の書き方だと分かる文で出す）", { files: { [`${G}/UC-001-members/contract.yaml`]: contract("UC-001", "fixed", [op("getMember", { path: "/api/members/{accountId:int}" }), op("createMember", { method: "POST", path: "/api/members" }), op("receiveNotice", { transport: "push", entry: "notice.updated" })]) } }, /E4  契約の操作 UC-001#getMember の wire\.path が、決まった書式に無い形を含む: GET \/api\/members\/\{accountId:int\}（契約の書き方の誤り。[^]*E2  UC-001#getMember/],
	["E4", "draft の契約・owned が false の操作でも、読めない wire.path は報告する", { files: { [`${G}/UC-002-draft/contract.yaml`]: contract("UC-002", "draft", [op("receiveHook", { owned: false, path: '"/hooks/:id?"' })]) } }, /E4  契約の操作 UC-002#receiveHook の wire\.path が、決まった書式に無い形を含む: GET \/hooks\/:id\?（契約の書き方の誤り/],
	["E1", "deeplink の名前は、区分の一部が :name に見えても、文字どおりに比べる（myapp:profile と myapp:secret は別）", { files: { [`${G}/UC-004-operate/contract.yaml`]: contract("UC-004", "fixed", [op("checkHealth", { path: "/api/health" }), op("serveAssets", { path: "/assets/*" }), op("openProfile", { transport: "deeplink", entry: '"myapp:profile"' })]) }, list: `${LIST}\n${line({ kind: "deeplink", name: "myapp:secret" })}` }, /契約に無い入口: deeplink myapp:secret/],
	["E1", "何でも受ける登録（*）は、契約のパラメーターの入口とは数えない", { list: LIST.replace("/api/members/:accountId", "/api/members/*") }, /契約に無い入口: GET \/api\/members\/\*/],
	["E4", "JSON でない行", { list: `${LIST}\nGET /api/x` }, /一覧の 6 行目が JSON でない: GET \/api\/x/],
	["E4", "kind が無い", { list: `${LIST}\n${line({ method: "GET", path: "/x" })}` }, /一覧の 6 行目: kind が無いか、知らない種類/],
	["E4", "path が無い", { list: `${LIST}\n${line({ kind: "http", method: "GET" })}` }, /kind が http の入口は、method（GET などの 1 語）と、\/ で始まる path を持つ/],
	["E4", "name が無い", { list: `${LIST}\n${line({ kind: "push" })}` }, /kind が push の入口は、name/],
	["E4", "知らない項目", { list: LIST.replace('"kind":"push"', '"kind":"push","file":"src/x.ts"') }, /知らない項目「file」がある/],
	["E4", "同じ入口の重複", { list: `${LIST}\n${line({ kind: "http", method: "GET", path: "/api/members/{id}" })}` }, /一覧の 6 行目: 同じ入口が 1 行目にもある/],
	["E4", "list_entries が未宣言", { cfg: entriesCfg((c) => delete c.commands) }, /commands\.list_entries が宣言されていない/],
	["E4", "list_entries の形が誤り", { cfg: entriesCfg((c) => (c.commands.list_entries = ["node"])) }, /commands\.list_entries は、文字列のコマンドか/],
	["E4", "inbound の操作があるのに none", { cfg: entriesCfg((c) => (c.commands.list_entries = { none: "入口は無い" })) }, /commands\.list_entries は none にできない（撤回されていない UC の fixed の契約に inbound の操作が 5 件ある。例: UC-001#getMember）/],
	["E4", "none に理由が無い", { cfg: entriesCfg((c) => (c.commands.list_entries = { none: "" })) }, /commands\.list_entries の none は、理由の文字列だけを持つ/],
	["E4", "docs.goals_dir が無い", { cfg: entriesCfg((c) => delete c.docs) }, /docs\.goals_dir が無いので、契約を読めない/],
];
for (const [id, name, opts, re] of BAD_ENTRIES) {
	test(`entries ${id}: ${name} は違反`, () => {
		const r = entries(opts);
		assert.equal(r.status, 1, r.stdout + r.stderr);
		assert.match(r.stdout, re);
		assert.match(r.stdout, new RegExp(`err  ${id}  `));
	});
}

test("entries: none は、撤回されていない UC の fixed の契約に inbound の操作が無い間だけ通り、確かめていないことを表示する", () => {
	const noInbound = {
		[`${G}/UC-001-members/contract.yaml`]: contract("UC-001", "fixed", [op("sendMail", { direction: "outbound", owned: false, method: "POST", path: "/v1/mail" })]),
		[`${G}/UC-002-draft/contract.yaml`]: null,
		[`${G}/UC-004-operate/contract.yaml`]: null,
	};
	const none = (c) => (c.commands.list_entries = { none: "外から呼ばれる入口を持たないバッチ" });
	const d = project({ cfg: entriesCfg(none), files: { ...DOCS, ...noInbound }, lcov: null });
	const r = run(d, "entries");
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /commands\.list_entries = none（外から呼ばれる入口を持たないバッチ）: 契約に無い入口が無いかを確かめていない/);
});
