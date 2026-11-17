//  プロジェクトの設定ファイルの名前（共有）
//
//  設定ファイルは harness.config.json。以前の名前（traceconfig.json）のファイルが残っている利用プロジェクトには、
//  「設定が無い」とだけ伝えると原因が分からないので、改名したことを添える。古い名前のファイルは読まない
//  （読む名前が 2 つあると、どちらが効いているかが分からなくなる）。

import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export const CONFIG_FILE = "harness.config.json";
const OLD_CONFIG_FILE = "traceconfig.json";

//  ひな形（templates/develop/harness.config.json）に無いが、最上位に書いてよいキー。
//  既定の動きを変えるときだけ書くキーで、ひな形に値を置くと既定を上書きしてしまうもの。
//  config-lint の K1 は「ひな形のキー + これ」を使えるキーとする
export const OPTIONAL_TOP_KEYS = ["comment_pattern"];

//  configPath が無いとき、同じ場所に古い名前のファイルがあれば、移し方の案内を返す（無ければ空文字）
export function renamedConfigHint(configPath) {
	if (basename(configPath) !== CONFIG_FILE || !existsSync(join(dirname(configPath), OLD_CONFIG_FILE))) return "";
	return `。同じ場所に ${OLD_CONFIG_FILE} がある。設定ファイルは ${CONFIG_FILE} に改名した（中身はそのまま使える。git mv ${OLD_CONFIG_FILE} ${CONFIG_FILE} で移す）`;
}
