//  goal-status の回帰検証。一時ディレクトリに spec-lint を通る最小の docs とテスト 1 本を組み、
//  終端リストの結果と trace-check の違反から GOAL の状態が導出されることを確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeMinimalDocs } from "../../spec-lint/test/fixture.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, "..", "goal-status.mjs");
const TRACE_CHECK = join(HERE, "..", "..", "trace-check", "trace-check.mjs");
const TEMPLATE = join(HERE, "..", "..", "..", "templates", "develop", "traceconfig.json");

const COVERED = '// @covers REQ-001#empty\nit("空の名前を拒否する", () => {});\n';

function traceconfig(commands) {
	const cfg = JSON.parse(readFileSync(TEMPLATE, "utf8"));
	for (const k of ["_comment", "contract", "schema", "source", "layering"]) delete cfg[k];
	delete cfg.tests.system;
	if (commands === null) delete cfg.commands; //  null ＝ commands ブロックを宣言しない host
	else cfg.commands = commands;
	return JSON.stringify(cfg, null, 2) + "\n";
}

const write = (root, rel, text) => {
	mkdirSync(dirname(join(root, rel)), { recursive: true });
	writeFileSync(join(root, rel), text);
};

//  GOAL-01 / UC-001 / REQ-001#empty が揃い、テスト 1 本がそれを被覆する「全部通る」状態
function makeRoot({ commands = { test: "exit 0" }, docs = {} } = {}) {
	const root = mkdtempSync(join(tmpdir(), "harness goal-status "));
	writeMinimalDocs(root, docs);
	write(root, "tests/thing.test.ts", COVERED);
	write(root, "traceconfig.json", traceconfig(commands));
	return root;
}

const run = (root, ...args) => spawnSync("node", [TOOL, "--root", root, ...args], { encoding: "utf8" });

function status(root, ...args) {
	const r = run(root, "--json", ...args);
	assert.equal(r.status, 0, r.stdout + r.stderr);
	return JSON.parse(r.stdout);
}

const setPhase = (root, phase) => {
	const file = join(root, "docs/goals/GOAL-01-a/UC-001-b/UC.md");
	writeFileSync(file, readFileSync(file, "utf8").replace(/^phase: .*$/m, `phase: ${phase}`));
};

test("条件があり、違反が無く、終端リストが実行されて通れば true。観測時刻とコミットを添える", (t) => {
	const root = makeRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const git = (...args) => spawnSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { encoding: "utf8" });
	git("init", "-q");
	git("add", "-A");
	git("commit", "-q", "-m", "init");
	write(root, "notes.txt", "未コミット");

	const s = status(root);
	assert.equal(s.schema, 1);
	assert.deepEqual(s.summary, { goals: 1, true: 1, false: 0, unobserved: 0, deferred: 0, phase_disagreements: 0 });
	assert.equal(s.gate.ok, true);
	assert.equal(s.gate.executed, true);
	assert.deepEqual(
		s.gate.steps.map((x) => `${x.step}:${x.state}`),
		["spec-lint:pass", "trace-check:pass", "contract-run:skip", "typecheck:skip", "lint:skip", "test:pass", "system:skip"],
	);
	assert.match(s.observed_at, /^\d{4}-\d{2}-\d{2}T/);
	assert.match(s.commit, /^[0-9a-f]{40}$/);
	assert.equal(s.dirty, 1);
	const g = s.goals[0];
	assert.equal(g.id, "GOAL-01");
	assert.equal(g.state, "true");
	assert.equal(g.conditions, 1);
	assert.equal(g.statement, "利用者として、ものを作りたい");
	assert.equal(g.ucs[0].id, "UC-001");
	assert.equal(g.ucs[0].state, "true");

	const text = run(root);
	assert.equal(text.status, 0, text.stderr);
	assert.match(text.stdout, /終端リスト: 緑 /);
	assert.match(text.stdout, /成立 1 \/ 1（偽 0、未観測 0）/);
	assert.match(text.stdout, /真 +GOAL-01 {2}利用者として、ものを作りたい/);
	assert.match(text.stdout, /未コミット 1 件/);
});

test("被覆するテストが無ければ false。baseline に載せて終端リストを緑にしても true にはならない", (t) => {
	const root = makeRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	rmSync(join(root, "tests/thing.test.ts"));
	setPhase(root, "完了");

	const a = status(root);
	assert.equal(a.gate.ok, false);
	assert.deepEqual(a.gate.failed, ["trace-check"]);
	assert.equal(a.goals[0].state, "false");
	assert.equal(a.goals[0].reason, "violation");
	const uc = a.goals[0].ucs[0];
	assert.equal(uc.state, "false");
	assert.deepEqual(uc.violations.map((v) => `${v.check}:${v.ids.join(",")}:${v.baselined}`), ["C1:REQ-001:false", "C10:REQ-001:false"]);
	//  申告は完了、観測は偽
	assert.equal(uc.phase_disagrees, true);
	assert.equal(a.summary.phase_disagreements, 1);

	const b = spawnSync("node", [TRACE_CHECK, "--root", root, "--update-baseline"], { encoding: "utf8" });
	assert.equal(b.status, 0, b.stderr);
	const c = status(root);
	assert.equal(c.gate.ok, true);
	assert.equal(c.gate.executed, true);
	assert.equal(c.goals[0].state, "false");
	assert.deepEqual(c.goals[0].ucs[0].violations.map((v) => v.baselined), [true, true]);
	assert.deepEqual(c.summary, { goals: 1, true: 0, false: 1, unobserved: 0, deferred: 0, phase_disagreements: 1 });

	const text = run(root);
	assert.match(text.stdout, /偽 +GOAL-01/);
	assert.match(text.stdout, /UC-001 \[完了\] 偽 {2}条件 1 \/ 違反 2 {2}← 申告は完了/);
	assert.match(text.stdout, /\[C1\] REQ-001 を被覆するテストが存在しない（未検証の要件）（baseline 済み）/);
});

test("終端リストが赤なら unobserved（gate-red）。どの GOAL のテストが落ちたかは言わない", (t) => {
	const root = makeRoot({ commands: { typecheck: "exit 0", test: "echo boom; exit 1", system: "exit 0" } });
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const s = status(root);
	assert.equal(s.gate.ok, false);
	assert.equal(s.gate.executed, false);
	assert.deepEqual(s.gate.failed, ["test"]);
	//  test が赤なら system は走らない
	assert.deepEqual(s.gate.steps.slice(-2).map((x) => `${x.step}:${x.state}`), ["test:fail", "system:not-run"]);
	assert.equal(s.goals[0].state, "unobserved");
	assert.equal(s.goals[0].reason, "gate-red");
	assert.deepEqual(s.goals[0].detail, ["test"]);
	//  観測が無いので、申告との食い違いは数えない
	assert.equal(s.summary.phase_disagreements, 0);
	assert.match(run(root).stdout, /未観測 {2}GOAL-01 .*（終端リストが赤: test）/);
});

test("テストが走っていなければ unobserved（not-executed）: commands.test 未宣言 / --no-run", (t) => {
	const root = makeRoot({ commands: null });
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const a = status(root);
	assert.equal(a.gate.ok, true);
	assert.equal(a.gate.executed, false);
	assert.equal(a.goals[0].state, "unobserved");
	assert.equal(a.goals[0].reason, "not-executed");
	assert.deepEqual(a.goals[0].detail, ["commands.test 未宣言"]);
	assert.match(run(root).stdout, /終端リスト: 緑（テスト未実行）/);

	//  --no-run は宣言済みのコマンドを走らせない（走れば印のファイルができる）
	writeFileSync(join(root, "traceconfig.json"), traceconfig({ test: "touch ran.marker" }));
	const b = status(root, "--no-run");
	assert.equal(existsSync(join(root, "ran.marker")), false);
	assert.equal(b.gate.steps.find((x) => x.step === "test").state, "not-run");
	assert.equal(b.goals[0].state, "unobserved");
	assert.equal(b.goals[0].reason, "not-executed");
	//  --no-run でも違反による false は出る
	rmSync(join(root, "tests/thing.test.ts"));
	assert.equal(status(root, "--no-run").goals[0].state, "false");
});

test("条件（active な REQ）が無い GOAL は true に数えない（no-conditions）。withdrawn の GOAL は分母に入れない", (t) => {
	const root = makeRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const goal = (id, st) => `---\nid: ${id}\nactor: ACT-01\norigin: KPI-01\nstatus: ${st}\n---\n\n# ${id}\n\n> 利用者として、${id} を成し遂げたい\n`;
	write(root, "docs/goals/GOAL-02-empty/GOAL.md", goal("GOAL-02", "active"));
	write(root, "docs/goals/GOAL-03-gone/GOAL.md", goal("GOAL-03", "withdrawn"));

	const s = status(root);
	assert.deepEqual(s.goals.map((g) => g.id), ["GOAL-01", "GOAL-02"]);
	const empty = s.goals[1];
	assert.equal(empty.state, "unobserved");
	assert.equal(empty.reason, "no-conditions");
	assert.equal(empty.conditions, 0);
	//  UC の無い GOAL は C8 の違反でもある。違反は GOAL に持たせ、状態は「条件が未定義」を優先する
	assert.deepEqual(empty.violations.map((v) => v.check), ["C8"]);
	assert.equal(s.summary.true, 0);
	assert.equal(s.summary.unobserved, 2);
	assert.match(run(root).stdout, /未観測 {2}GOAL-02 .*（条件が未定義）\n +\[C8\] GOAL-02 .*\n +active な UC が無い/);
});

test("保留台帳の件数を添え、対象のパスで GOAL に配る", (t) => {
	const root = makeRoot({
		docs: {
			deferredRows: [
				"| DEF-001 | 2026-09-14 | reviewer | docs/goals/GOAL-01-a/UC-001-b/REQ-001.md | 指摘 | 期待値を決められない | 未定 |",
				"| DEF-002 | 2026-09-14 | reviewer | src/thing.ts | 指摘 | 実環境でしか確かめられない | test |",
			],
		},
	});
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const s = status(root);
	assert.equal(s.summary.deferred, 2);
	assert.equal(s.goals[0].deferred, 1);
	//  保留は状態を変えない（機械判定できない指摘であって、違反ではない）
	assert.equal(s.goals[0].state, "true");
	assert.match(run(root).stdout, /保留 2 件/);
});

test("使い方・設定の誤りは exit 2。状態が悪いことは exit に出さない", (t) => {
	const root = makeRoot({ commands: { test: "exit 1" } });
	t.after(() => rmSync(root, { recursive: true, force: true }));
	assert.equal(run(root).status, 0);

	const bogus = run(root, "--bogus");
	assert.equal(bogus.status, 2);
	assert.match(bogus.stderr, /usage:/);

	rmSync(join(root, "traceconfig.json"));
	const none = run(root);
	assert.equal(none.status, 2);
	assert.match(none.stderr, /設定が無い/);
});
