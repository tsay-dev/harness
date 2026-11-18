//  index の回帰検証。紐づきの揃った最小のプロジェクトで、ID ごとのテストのファイルが索引に出ることを確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { foldReqFiles } from "../../_shared/test/fold-reqs.mjs";
import { foldOverview } from "../../_shared/test/fold-overview.mjs";
import { toolOf, U, project, br, fm, UC_WITH_BR } from "../../_shared/test/refs-linked-fixture.mjs";

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

test("index: 索引が 64KB を超えても、パイプ越しに最後の行まで出る", (t) => {
	//  パイプへの書き込みは非同期なので、書き終わる前にプロセスを終えると途中（64KB など）で切れる。
	//  題の長い ADR を並べて索引を大きくし、spawnSync（パイプ）で受けた出力が最後の ADR の行で終わることを確かめる
	const title = "あ".repeat(400);
	const count = 300;
	const adrId = (n) => `ADR-${String(n).padStart(4, "0")}`;
	const files = {};
	for (let n = 1; n <= count; n++) files[`docs/adr/${adrId(n)}-x.md`] = `${fm({ id: adrId(n), title, status: "accepted" })}# ${adrId(n)}\n`;
	const r = runTool("index", project(t, { files }));
	assert.equal(r.status, 0, r.stderr);
	const bytes = Buffer.byteLength(r.stdout);
	assert.ok(bytes > 256 * 1024, `索引が小さすぎて確かめにならない: ${bytes} バイト`);
	const lines = r.stdout.split("\n");
	assert.equal(lines.at(-1), "", "出力が改行で終わっていない");
	assert.equal(lines.at(-2), `   ${adrId(count)}  [accepted]  ${title}`);
	assert.equal(lines.filter((l) => l.startsWith("   ADR-")).length, count);
});
