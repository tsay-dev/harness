//  next-id の回帰検証。一時ディレクトリに最小の docs を組み、使用済みに数える番号を確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { foldReqFiles } from "../../_shared/test/fold-reqs.mjs";
import { foldOverview } from "../../_shared/test/fold-overview.mjs";
import { toolOf, makeRefRoot } from "../../_shared/test/refs-docs-fixture.mjs";

//  lint refs と同じ読み方を使う、ほかのコマンド（next-id）を実行する
function runTool(command, root, ...args) {
	foldReqFiles(root);
	foldOverview(root); //  入力の 00-vision.md・02-actors.md・GOAL.md を 00-overview.md に畳む（ADR-0076）
	return spawnSync("node", [toolOf(command), ...args, "--root", root], { encoding: "utf8" });
}

test("next-id req: REQ の本文に書かれた番号（ほかのプロジェクトの REQ への言及）は、使用済みに数えない", (t) => {
	const root = makeRefRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const f = join(root, "docs/goals/GOAL-01-register/UC-001-register/REQ-001.md");
	writeFileSync(f, `${readFileSync(f, "utf8")}\n## 検証方針\n\n- **検証しない**: 別のプロジェクトの REQ-901 が受け持つ範囲\n`);
	const r = runTool("next-id", root, "req");
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.doesNotMatch(r.stdout, /REQ-902/);
	assert.match(r.stdout, /^REQ-0\d\d$/m);
});

test("next-id goal: 概要の planned・withdrawn の行と、行の無いフォルダの番号も使用済みに数える（ADR-0076）", (t) => {
	const root = makeRefRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	foldOverview(root);
	const ov = join(root, "docs/00-overview.md");
	writeFileSync(ov, readFileSync(ov, "utf8").replace(/(\| GOAL-02 [^\n]*\n)/, "$1| GOAL-05 | 未着手 | ACT-01 | KPI-01 | planned | |\n| GOAL-06 | 撤回 | ACT-01 | KPI-01 | withdrawn | 撤回した |\n"));
	assert.match(runTool("next-id", root, "goal").stdout, /^GOAL-07$/m);
	mkdirSync(join(root, "docs/goals/GOAL-11-stale"), { recursive: true });
	assert.match(runTool("next-id", root, "goal").stdout, /^GOAL-12$/m);
});
