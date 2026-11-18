//  lint coverage のテスト。実行の記録の状態を 1 つずつ変え、その検査項目で落ちることを確かめる
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { record, SOURCES, LCOV, project, run, change } from "../../_shared/test/entry-fixture.mjs";

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
