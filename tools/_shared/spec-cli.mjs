//  lint spec・lint git uc・convert が共有する処理（単独では実行しない）
//
//  見つけた違反の集め方と報告、frontmatter の読み方（曖昧な書き方を違反として集める）、3 つのコマンドに共通の引数の読み方を持つ。
//  baseline（既知の違反を通す台帳）は持たない。違反はすべて失敗にする（ADR-0056）。

import { existsSync, readFileSync } from "node:fs";
import { parseFrontmatter } from "./frontmatter.mjs";

//  --- 収集した違反 ---
export const errors = [];
const warns = [];
export const err = (file, msg) => errors.push({ file, msg });
export const warn = (file, msg) => warns.push({ file, msg });

//  --- パーサ ---
//  frontmatter は tools/_shared/frontmatter.mjs が唯一の読み方。曖昧な書き方（先頭が空白の行、キーの重複、区切りもどき）は
//  ツールごとに読みが割れてすり抜けになるので違反にする（ADR-0056）
//  ファイルの代わりに読ませる文面。UC.md は「要件」の節を除いた UC 自身の部分、REQ は「<UC.md>#REQ-nnn」の名前で
//  小節から組み立てた文書（tools/_shared/reqs.mjs）を置く
export const VIRTUAL = new Map();

export function readFm(file) {
	const r = parseFrontmatter(VIRTUAL.has(file) ? VIRTUAL.get(file) : readFileSync(file, "utf8"));
	for (const p of r.problems) err(`${file}:${p.line}`, p.msg);
	return r;
}

//  --- 報告。baseline（既知の違反を通す台帳）は持たない。違反はすべて失敗にする（ADR-0056）---
const LEGACY_BASELINE = ".spec-baseline.json";

export function report(command) {
	for (const w of warns) console.warn(`  warn  ${w.file}: ${w.msg}`);
	if (existsSync(LEGACY_BASELINE)) console.warn(`  warn  ${LEGACY_BASELINE}: baseline は廃止した（ADR-0056）。読まないので削除する`);
	for (const e of errors) console.error(`  ERROR ${e.file}: ${e.msg}`);
	if (errors.length === 0) console.log(`${command}: OK（warn ${warns.length}）`);
	else console.error(`${command}: ${errors.length} 件の違反`);
	return errors.length > 0 ? 1 : 0;
}

//  --- 引数（3 つのコマンドが、同じオプションの組を受け取る）---
export function parseArgs(command, argv) {
	const opts = { docs: "docs", direction: "outbound", _: [] };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--docs") opts.docs = argv[++i];
		else if (a === "--message") opts.message = argv[++i];
		else if (a === "--uc") opts.uc = argv[++i];
		else if (a === "--unit") opts.unit = argv[++i];
		else if (a === "--ignore-legacy-layout") opts.ignoreLegacy = true;
		else if (["--update-baseline", "--strict", "--baseline"].includes(a)) {
			console.error(`${command}: ${a} は廃止した（baseline を持たず、常にすべての違反で失敗する。ADR-0056）`);
			process.exit(2);
		}
		else if (a === "--out") opts.out = argv[++i];
		else if (a === "--direction") opts.direction = argv[++i];
		else if (a === "--date") opts.date = argv[++i];
		else if (a.startsWith("--")) {
			console.error(`${command}: 不明な引数 ${a}`);
			process.exit(2);
		} else opts._.push(a);
	}
	return opts;
}
