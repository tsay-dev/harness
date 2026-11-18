//  プロジェクトの設定ファイルの名前（共有）
//
//  設定ファイルは harness.config.json。以前の名前（traceconfig.json）のファイルが残っている利用プロジェクトには、
//  「設定が無い」とだけ伝えると原因が分からないので、改名したことを添える。古い名前のファイルは読まない
//  （読む名前が 2 つあると、どちらが効いているかが分からなくなる）。

import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export const CONFIG_FILE = "harness.config.json";
const OLD_CONFIG_FILE = "traceconfig.json";

//  フォルダ hostRoot の設定を読む。無い・読めないときは null（読めないことは、設定の形の検査と紐づきの検査が報告する）。
//  読めないことを自分で報告しない場面（仕様の木の根を決めるとき、アクター表の場所を引くとき）で使う
export function readHostConfig(hostRoot) {
	try {
		return JSON.parse(readFileSync(join(hostRoot, CONFIG_FILE), "utf8"));
	} catch {
		return null;
	}
}

//  ひな形（templates/develop/harness.config.json）に無いが、最上位に書いてよいキー。
//  既定の動きを変えるときだけ書くキーで、ひな形に値を置くと既定を上書きしてしまうもの。
//  lint config の K1 は「ひな形のキー + これ」を使えるキーとする
export const OPTIONAL_TOP_KEYS = ["comment_pattern"];

//  廃止したキーと、代わりにすること、廃止を決めた ADR（[キー, 案内, ADR]）。
//  ADR-0070: 手で書く紐づきはテストの側だけにし、実装のコードの注釈を読まない。ADR-0076: vision・アクター表・バックログを 1 枚の概要にまとめた。
//  設定に残っていたら、lint config（K6）と lint refs が案内を付けて失敗にする。黙って無視すると、
//  利用プロジェクトは「まだ検査されている」と思ったまま、注釈と設定を保ち続けることになる
const NO_IMPLEMENTS = "実装とスキーマの @implements は読まない。紐づきはテストの @covers に書く";
const NO_UNITS = "実現単位と技術部品の置き場の分類はやめた。実行されないソースは lint coverage（実行の記録）で見つける";
const NO_OPERATION = "入口の @operation は読まない。入口は commands.list_entries の一覧と契約の突き合わせ（lint entries）で確かめる";
const OVERVIEW = "ビジョン・アクター表・バックログは 1 枚の概要（docs.overview = <docs>/00-overview.md）にまとめた。harness migrate overview を参照";
export const RETIRED_KEYS = [
	["implements_pattern", NO_IMPLEMENTS, "ADR-0070"],
	["operation_pattern", NO_OPERATION, "ADR-0070"],
	["source.unit_dirs", NO_UNITS, "ADR-0070"],
	["source.support_dirs", NO_UNITS, "ADR-0070"],
	["source.unit_pattern", NO_UNITS, "ADR-0070"],
	["source.implements_placement", NO_IMPLEMENTS, "ADR-0070"],
	["source.entry_pattern", NO_OPERATION, "ADR-0070"],
	["source.entry_exclude", NO_OPERATION, "ADR-0070"],
	["source.entry_file_pattern", NO_OPERATION, "ADR-0070"],
	["schema.constraint_pattern", "スキーマの制約の @implements は読まない。DB で守る規則は、規則に反する行を DB に直接入れて断られることを確かめるテストに @covers BR-nnn を書く", "ADR-0070"],
	["schema.implements_placement", NO_IMPLEMENTS, "ADR-0070"],
	["entries", "契約の外の入口は置けない（entries.outside_contract は無くした）。入口はすべて、契約の inbound の操作として書く", "ADR-0070"],
	//  1 枚の概要にまとめた文書の置き場（ADR-0076）
	["docs.vision", OVERVIEW, "ADR-0076"],
	["docs.actors", OVERVIEW, "ADR-0076"],
	["docs.goals_backlog", OVERVIEW, "ADR-0076"],
];
//  cfg に残っている廃止したキー: [[キー, 案内, ADR]]。親が none（{ "none": … }）やオブジェクトでないときは、子は無いものとして扱う
export function retiredKeysIn(cfg) {
	const out = [];
	for (const [keyPath, hint, adr] of RETIRED_KEYS) {
		let node = cfg;
		for (const k of keyPath.split(".")) node = node !== null && typeof node === "object" && !Array.isArray(node) && Object.hasOwn(node, k) ? node[k] : undefined;
		if (node !== undefined) out.push([keyPath, hint, adr]);
	}
	return out;
}

//  configPath が無いとき、同じ場所に古い名前のファイルがあれば、移し方の案内を返す（無ければ空文字）
export function renamedConfigHint(configPath) {
	if (basename(configPath) !== CONFIG_FILE || !existsSync(join(dirname(configPath), OLD_CONFIG_FILE))) return "";
	return `。同じ場所に ${OLD_CONFIG_FILE} がある。設定ファイルは ${CONFIG_FILE} に改名した（中身はそのまま使える。git mv ${OLD_CONFIG_FILE} ${CONFIG_FILE} で移す）`;
}
