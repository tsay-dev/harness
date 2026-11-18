//  仕様の木（<goals の根>/<GOAL-nn-slug>/<UC-nnn-slug>/）の根の決め方と、フォルダの数え方。
//  lint spec・lint refs・lint entries・lint git uc・run cases・guard と、検査の並び（suite.mjs）が同じものを使う。
//  コマンドごとに根や数え方が違うと、あるコマンドが検査しないフォルダの契約を、別のコマンドが正しい契約として数える
//  （ADR-0056。読み方を 1 つにする）。

import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

//  ---- 根 ----------------------------------------------------------------------

//  仕様の木の根（goals のフォルダ）を決める。戻り: { root: 絶対パス | null, error: 文 | null }
//    docsDir   --docs で渡された docs のフォルダ（絶対パス）。根は <docsDir>/goals
//    hostRoot  設定ファイルを置いたフォルダ（絶対パス）。cfg  読んだ設定（harness.config.json）。根は docs.goals_dir
//  --docs を受けるコマンド（lint spec・run cases・guard）と、設定を読むコマンド（lint refs・lint entries）がある。
//  2 つの決め方が別のフォルダを指すと、コマンドごとに別の木を読むので、食い違いは設定の誤りとして error を返す。
//  片方しか分からないときは、分かるほうを返す（どちらも無ければ root は null）
export function goalsRootOf({ docsDir = null, hostRoot = null, cfg = null } = {}) {
	const fromDocs = docsDir ? resolve(docsDir, "goals") : null;
	const declared = isMap(cfg) && isMap(cfg.docs) && typeof cfg.docs.goals_dir === "string" && cfg.docs.goals_dir.trim() !== "" ? cfg.docs.goals_dir : null;
	const fromCfg = declared !== null && hostRoot ? resolve(hostRoot, declared) : null;
	if (fromDocs && fromCfg && fromDocs !== fromCfg)
		return {
			root: null,
			error: `仕様の置き場が 2 通りに決まっている: 設定の docs.goals_dir は ${fromCfg}、docs のフォルダ（--docs）から決まる場所は ${fromDocs}。検査ツールが別々の木を読むことになるので、docs.goals_dir を <docs>/goals に合わせる（docs を別の場所に置くなら、--docs もその場所にする）`,
		};
	return { root: fromCfg ?? fromDocs, error: null };
}

//  ---- フォルダの数え方 ----------------------------------------------------------

//  仕様の木の 1 階層（根の直下 = ゴール、ゴールの直下 = UC）のフォルダを分ける。2 つの階層で同じ決まりを使う。
//  戻り: { dirs: [絶対パス], stray: [絶対パス] }
//    dirs   ゴール・UC のフォルダとして読むもの（名前が GOAL-nn-<slug>・UC-nnn-<slug> か、GOAL.md・UC.md があるかは、各コマンドが検査する）
//    stray  _shared 以外の、_ で始まるフォルダ。どのコマンドもゴール・UC として読まない。lint refs が配置の違反として報告する
//  . で始まるフォルダと _shared は、どのコマンドもゴール・UC として読まない（報告もしない）。
//  ただし lint refs は、根の下の md を別に走査し、木に数えなかった場所の md が id を持てば、配置の違反（C9）にする
export function specDirs(parent) {
	const dirs = [];
	const stray = [];
	if (!existsSync(parent)) return { dirs, stray };
	const names = readdirSync(parent, { withFileTypes: true })
		.filter((d) => d.isDirectory())
		.map((d) => d.name)
		.sort();
	for (const name of names) {
		if (name.startsWith(".") || name === "_shared") continue;
		(name.startsWith("_") ? stray : dirs).push(join(parent, name));
	}
	return { dirs, stray };
}

//  木の中の UC のフォルダを、すべて返す: [{ goalDir, ucDir }]
export function allUcDirs(goalsRoot) {
	const out = [];
	for (const goalDir of specDirs(goalsRoot).dirs) for (const ucDir of specDirs(goalDir).dirs) out.push({ goalDir, ucDir });
	return out;
}
