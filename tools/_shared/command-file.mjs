//  コマンドの語から、そのコマンドのファイルの場所を決める（唯一の決め方）。
//  コマンドの名前とファイルの名前を別に持たない（ADR-0071）。語を - でつないだものが、置き場の名前とファイルの名前になる:
//    lint git branch → <tools>/lint-git-branch/lint-git-branch.mjs
//  入口（bin/harness.mjs）と、検査の並び（suite.mjs）が、同じこの関数で場所を決める。

import { join } from "node:path";

//  words: コマンドの語の並び（["lint", "git", "branch"]）。toolsDir: 同梱ツールの置き場（tools/）
export function commandFile(toolsDir, words) {
	const name = words.join("-");
	return join(toolsDir, name, `${name}.mjs`);
}
