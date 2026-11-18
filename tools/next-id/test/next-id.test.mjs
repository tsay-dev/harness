//  next-id の回帰検証。一時ディレクトリに最小の docs を組み、使用済みに数える番号を確かめる。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { foldReqFiles } from "../../_shared/test/fold-reqs.mjs";
import { toolOf, makeRefRoot } from "../../_shared/test/refs-docs-fixture.mjs";

//  lint refs と同じ読み方を使う、ほかのコマンド（next-id）を実行する
function runTool(command, root, ...args) {
	foldReqFiles(root);
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
