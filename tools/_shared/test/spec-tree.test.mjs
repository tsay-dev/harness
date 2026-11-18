//  spec-tree のテスト。仕様の木の根の決め方と、読む・読まないフォルダの表を固定する
//  （lint spec・lint refs・lint entries・run cases・guard が、同じ根の同じフォルダを読む）
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { allUcDirs, goalsRootOf, specDirs } from "../spec-tree.mjs";

const TEMP = [];
after(() => TEMP.forEach((d) => rmSync(d, { recursive: true, force: true })));
const tree = (dirs, files = []) => {
	const root = mkdtempSync(join(tmpdir(), "spec-tree-"));
	TEMP.push(root);
	for (const d of dirs) mkdirSync(join(root, d), { recursive: true });
	for (const f of files) writeFileSync(join(root, f), "");
	return root;
};

test("根: --docs だけなら <docs>/goals、設定だけなら docs.goals_dir。2 つが同じ場所を指せば、その場所", () => {
	assert.deepEqual(goalsRootOf({ docsDir: "/p/docs" }), { root: "/p/docs/goals", error: null });
	assert.deepEqual(goalsRootOf({ hostRoot: "/p", cfg: { docs: { goals_dir: "specs/goals" } } }), { root: "/p/specs/goals", error: null });
	assert.deepEqual(goalsRootOf({ docsDir: "/p/docs", hostRoot: "/p", cfg: { docs: { goals_dir: "./docs/goals/" } } }), { root: "/p/docs/goals", error: null });
	//  設定が goals_dir を持たない（docs だけのプロジェクト、monorepo のルートの設定）なら、--docs から決まる
	assert.deepEqual(goalsRootOf({ docsDir: "/p/docs", hostRoot: "/p", cfg: { git: {} } }), { root: "/p/docs/goals", error: null });
	assert.deepEqual(goalsRootOf({ docsDir: "/p/docs", hostRoot: "/p", cfg: null }), { root: "/p/docs/goals", error: null });
	assert.deepEqual(goalsRootOf({ hostRoot: "/p", cfg: {} }), { root: null, error: null });
});

test("根: --docs から決まる場所と、設定の docs.goals_dir が違えば、どちらも選ばず誤りを返す", () => {
	const r = goalsRootOf({ docsDir: "/p/docs", hostRoot: "/p", cfg: { docs: { goals_dir: "specs/goals" } } });
	assert.equal(r.root, null);
	assert.match(r.error, /仕様の置き場が 2 通りに決まっている: 設定の docs\.goals_dir は \/p\/specs\/goals、docs のフォルダ（--docs）から決まる場所は \/p\/docs\/goals/);
});

test("フォルダ: . で始まるものと _shared は読まず、ほかの _ で始まるものは stray。ゴールの階層と UC の階層で同じ決まり", () => {
	const root = tree(["GOAL-01-a/UC-001-b", "GOAL-01-a/UC-002-c", "GOAL-01-a/.hidden", "GOAL-01-a/_draft", "GOAL-01-a/_shared", "GOAL-01-a/notes", "GOAL-02-b", ".stash/x", "_shared/x", "_tmp/x", "misc/x"], ["GOAL-01-a/GOAL.md", "README.md"]);
	const names = (list) => list.map((d) => relative(root, d));
	const top = specDirs(root);
	assert.deepEqual(names(top.dirs), ["GOAL-01-a", "GOAL-02-b", "misc"]);
	assert.deepEqual(names(top.stray), ["_tmp"]);
	const ucs = specDirs(join(root, "GOAL-01-a"));
	assert.deepEqual(names(ucs.dirs), ["GOAL-01-a/UC-001-b", "GOAL-01-a/UC-002-c", "GOAL-01-a/notes"]);
	assert.deepEqual(names(ucs.stray), ["GOAL-01-a/_draft"]);
	//  名前の形（GOAL-nn・UC-nnn）は見ない。形の違反は、各ツールが報告する
	assert.deepEqual(allUcDirs(root).map(({ ucDir }) => relative(root, ucDir)), ["GOAL-01-a/UC-001-b", "GOAL-01-a/UC-002-c", "GOAL-01-a/notes", "misc/x"]);
	assert.deepEqual(specDirs(join(root, "none")), { dirs: [], stray: [] });
});
