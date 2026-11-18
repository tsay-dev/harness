//  index の回帰検証。紐づきの揃った最小のプロジェクトで、ID ごとのテストのファイルが索引に出ることを確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { foldReqFiles } from "../../_shared/test/fold-reqs.mjs";
import { foldOverview } from "../../_shared/test/fold-overview.mjs";
import { toolOf, U, project, br, UC_WITH_BR } from "../../_shared/test/refs-linked-fixture.mjs";

//  lint refs と同じ読み方を使う、ほかのコマンド（index）を実行する
const runTool = (command, root, ...args) => {
	foldReqFiles(root);
	foldOverview(root); //  入力の 00-vision.md・02-actors.md・GOAL.md を 00-overview.md に畳む（ADR-0076）
	return spawnSync("node", [toolOf(command), ...args, "--root", root], { encoding: "utf8" });
};

test("index: REQ・BR・UC ごとに、それを確かめるテストのファイルを引ける（保留は印を付ける）", (t) => {
	const files = {
		"docs/rules/BR-001.md": br("BR-001", "database"),
		"docs/rules/BR-002.md": br("BR-002", "domain 層", "draft"),
		[`${U}/UC.md`]: UC_WITH_BR,
		"tests/x.test.ts": '// @covers REQ-001#ok\ntest("ok", () => {});\n',
		"tests/db/rule.test.ts": '// @covers BR-001\ntest("断られる", () => {});\n',
		"tests/later.test.ts": '// @covers REQ-001#ok\ntest.skip("あとで", () => {});\n',
	};
	const r = runTool("index", project(t, { files }));
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /REQ-001 \[Ubiquitous\][^\n]*\n\s+classes: #ok\n\s+tests: tests\/later\.test\.ts \(保留\), tests\/x\.test\.ts\n/);
	assert.match(r.stdout, /BR-001 {2}t {2}\(enforced_at: database\)\n\s+tests: tests\/db\/rule\.test\.ts\n/);
	assert.match(r.stdout, /BR-002 [^\n]*\n\s+tests: -\n/);
	assert.match(r.stdout, /UC-001\/ [^\n]*\n\s+scenario: e2e\/x\.spec\.ts\n/);
});
