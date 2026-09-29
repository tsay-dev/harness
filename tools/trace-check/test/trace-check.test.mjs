//  trace-check の回帰検証（C15: シナリオテストの存在）。一時ディレクトリに最小の docs / e2e を組む。
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

function run(root, ...args) {
	return spawnSync("node", [TOOL, "--root", root, ...args], { encoding: "utf8" });
}

function makeRoot({ system = true } = {}) {
	const root = mkdtempSync(join(tmpdir(), "harness trace-check "));
	const cfg = JSON.parse(readFileSync(TEMPLATE, "utf8"));
	delete cfg._comment;
	delete cfg.contract;
	delete cfg.schema;
	delete cfg.source;
	delete cfg.layering;
	if (!system) delete cfg.tests.system;
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
	const r = run(root, "--only", "C15", "--strict");
	assert.equal(r.status, 1, r.stdout + r.stderr);
	assert.match(r.stdout, /\[C15\] UC-003 \(active、アクター ACT-01\) にシナリオテストが存在しない/);
	assert.match(r.stdout, /\[C15\] register\.spec\.ts:3: 未定義の UC-999 を @scenario している/);
	assert.doesNotMatch(r.stdout, /\[C15\] UC-001 /);
	assert.doesNotMatch(r.stdout, /\[C15\] UC-002 /);
	assert.doesNotMatch(r.stdout, /\[C15\] UC-004 /);
});

test("C15: tests.system が無ければ判定しない", (t) => {
	const root = makeRoot({ system: false });
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root, "--only", "C15", "--strict");
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.doesNotMatch(r.stdout, /\[C15\]/);
});

test("レポート: 各 UC の行にシナリオテストの所在を出す", (t) => {
	const root = makeRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root, "--strict");
	assert.match(r.stdout, /UC-001 \(UC-001-register\/\)  \[実装\]  scenario:register\.spec\.ts:1/);
	assert.match(r.stdout, /UC-003 \(UC-003-browse\/\)  \[実装\]  scenario:-/);
	assert.match(r.stdout, /シナリオテスト: 2/);
});

//  REQ を n 件持つ UC を足す（被覆するテストは置かないので、REQ ごとに C1 と C10 が出る）
function addReqs(root, n) {
	for (let i = 1; i <= n; i++) {
		const id = `REQ-${String(i).padStart(3, "0")}`;
		writeFileSync(
			join(root, "docs/goals/GOAL-01-register/UC-001-register", `${id}.md`),
			`---\nid: ${id}\npattern: Event-driven\nuc: UC-001\nstatus: active\n---\n\n# ${id}\n\n> 利用者が送信したとき、システムは ${id} を満たさなければならない。\n\n## 検証方針\n\n- **分割クラス**:\n  - \`#ok\` — 正常\n`,
		);
	}
}

test("出力がパイプでも 64KB で切れない（レポート末尾の FAIL 一覧が最後まで読める）", (t) => {
	const root = makeRoot({ system: false });
	t.after(() => rmSync(root, { recursive: true, force: true }));
	addReqs(root, 900);

	const text = run(root, "--strict");
	assert.equal(text.status, 1);
	assert.ok(Buffer.byteLength(text.stdout) > 64 * 1024, `レポートが小さすぎて検証にならない: ${Buffer.byteLength(text.stdout)} bytes`);
	assert.match(text.stdout, /FAIL（新規違反 1800 件）/);
	assert.match(text.stdout, /逆流ルール R-801）\n$/);
});
