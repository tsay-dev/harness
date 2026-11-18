//  仕様の木（<goals の根>/<GOAL-nn-slug>/<UC-nnn-slug>/）の根の決め方と、フォルダの数え方。契約の語彙のうち、複数のツールが使うもの。
//  spec-lint・trace-check・gate-hook・exec-check・contract-run と、検査の並び（gate-hook/suite.mjs）が同じものを使う。
//  ツールごとに根や数え方が違うと、あるツールが検査しないフォルダの契約を、別のツールが正しい契約として数える
//  （ADR-0056。読み方を 1 つにする）。

import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

//  ---- 根 ----------------------------------------------------------------------

//  仕様の木の根（goals のフォルダ）を決める。戻り: { root: 絶対パス | null, error: 文 | null }
//    docsDir   --docs で渡された docs のフォルダ（絶対パス）。根は <docsDir>/goals
//    hostRoot  設定ファイルを置いたフォルダ（絶対パス）。cfg  読んだ設定（harness.config.json）。根は docs.goals_dir
//  --docs を受けるツール（spec-lint・contract-run・gate-hook）と、設定を読むツール（trace-check・exec-check）がある。
//  2 つの決め方が別のフォルダを指すと、ツールごとに別の木を読むので、食い違いは設定の誤りとして error を返す。
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
//    dirs   ゴール・UC のフォルダとして読むもの（名前が GOAL-nn-<slug>・UC-nnn-<slug> か、GOAL.md・UC.md があるかは、各ツールが検査する）
//    stray  _shared 以外の、_ で始まるフォルダ。どのツールもゴール・UC として読まない。trace-check が配置の違反として報告する
//  . で始まるフォルダと _shared は、どのツールもゴール・UC として読まない（報告もしない）。
//  ただし trace-check は、根の下の md を別に走査し、木に数えなかった場所の md が id を持てば、配置の違反（C9）にする
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

//  ---- 契約の語彙 ----------------------------------------------------------------

//  契約の transport の語彙（閉じている）。入口の一覧の kind も同じ語を使う
export const TRANSPORTS = ["http", "sdk", "local-store", "deeplink", "push", "device", "internal", "stream"];
//  契約に entry（入口の名前）を書く transport。それ以外の、http でない transport の入口は、操作の名前で表す
export const ENTRY_TRANSPORTS = ["deeplink", "push", "stream"];

//  契約と入口の一覧の、突き合わせに使う項目（wire.method・wire.path・entry、一覧の method・path・name）が書いてあるか。
//  空でない文字列だけを「書いてある」とみなす（空白だけは空とみなす。数や真偽値は文字列でない）
export const isFilledText = (v) => typeof v === "string" && v.trim() !== "";
