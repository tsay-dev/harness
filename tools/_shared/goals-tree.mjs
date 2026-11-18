//  仕様の木（<goals_dir>/<GOAL-nn-slug>/<UC-nnn-slug>/）のフォルダの数え方と、契約の入口の項目が「書いてある」かの判定。
//  spec-lint・trace-check・gate-hook・exec-check が同じものを使う。ツールごとに数え方が違うと、あるツールが検査しない
//  フォルダの契約を、別のツールが正しい契約として数える（ADR-0056。読み方を 1 つにする）。

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const subdirs = (dir) =>
	existsSync(dir)
		? readdirSync(dir, { withFileTypes: true })
				.filter((d) => d.isDirectory())
				.map((d) => d.name)
				.sort()
		: [];

//  goals_dir の直下のフォルダを分ける。戻り: { goals: [絶対パス], stray: [絶対パス] }
//    goals  ゴールのフォルダとして読むもの（名前が GOAL-nn-<slug> かどうかは、各ツールが検査する）
//    stray  _shared 以外の、_ で始まるフォルダ。どのツールも読まない。trace-check が配置の違反として報告する
//  . で始まるフォルダと _shared は、木の外として、どのツールも黙って読まない
export function goalDirs(goalsRoot) {
	const goals = [];
	const stray = [];
	for (const name of subdirs(goalsRoot)) {
		if (name.startsWith(".") || name === "_shared") continue;
		(name.startsWith("_") ? stray : goals).push(join(goalsRoot, name));
	}
	return { goals, stray };
}

//  ゴールのフォルダの直下の、UC のフォルダとして読むもの（絶対パス）。. で始まるフォルダは、どのツールも読まない。
//  名前が UC-nnn-<slug> かどうかと、UC.md があるかは、各ツールが検査する
export const ucDirs = (goalDir) =>
	subdirs(goalDir)
		.filter((name) => !name.startsWith("."))
		.map((name) => join(goalDir, name));

//  契約と入口の一覧の、突き合わせに使う項目（wire.method・wire.path・entry、一覧の method・path・name）が書いてあるか。
//  空でない文字列だけを「書いてある」とみなす（空白だけは空とみなす。数や真偽値は文字列でない）
export const isFilledText = (v) => typeof v === "string" && v.trim() !== "";
