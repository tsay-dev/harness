//  lint entry・lint coverage・lint entries が共有する処理（単独では実行しない）
//
//  3 つのコマンドの引数と設定（harness.config.json）の読み方と、設定の entry（本番の組み立てとテストの入口）の読み方を持つ。
//  entry は lint entry が検査し（X1・X2）、lint coverage が「本番の組み立てが実行されたか」（V5）を確かめるのにも使う。

import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { CONFIG_FILE, renamedConfigHint } from "./config.mjs";

export const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
export const isText = (v) => typeof v === "string" && v.trim() !== "";
export const isNone = (v) => isMap(v) && typeof v.none === "string" && v.none.trim() !== "";
export const posixPath = (p) => p.split(sep).join("/");

//  出力の頭に付ける名前。mode は entry・coverage・entries のどれか（コマンドは harness lint <mode>）
export const tagOf = (mode) => `[lint ${mode}]`;

export function usage(mode, msg) {
	if (msg) console.error(`${tagOf(mode)} ${msg}`);
	console.error("usage: harness lint entry|coverage|entries [--root .] [--config <設定ファイル>] [--since <ms>] [--from <入口の一覧のファイル>]");
	process.exit(2);
}

//  3 つのコマンドの引数を読む。--since は coverage、--from は entries でだけ使える
function parseArgs(mode, argv) {
	const usageOf = (msg) => usage(mode, msg);
	const opts = { mode, root: ".", config: null, since: null, from: null };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--root" || a === "--config" || a === "--since" || a === "--from") {
			if (argv[i + 1] === undefined) usageOf(`${a} に値が無い`);
			opts[a.slice(2)] = argv[++i];
		} else usageOf(`知らない引数: ${a}`);
	}
	if (opts.since !== null) {
		if (mode !== "coverage") usageOf("--since は coverage でだけ使える");
		if (!/^\d+$/.test(opts.since)) usageOf("--since はエポックからのミリ秒（整数）");
		opts.since = Number(opts.since);
	}
	if (opts.from !== null && mode !== "entries") usageOf("--from は entries でだけ使える");
	return opts;
}

function loadConfig(mode, configPath) {
	const TAG = tagOf(mode);
	if (!existsSync(configPath)) {
		console.error(`${TAG} 設定が無い: ${configPath}（テンプレート templates/develop/${CONFIG_FILE} を host 直下に置く）${renamedConfigHint(configPath)}`);
		process.exit(2);
	}
	try {
		const cfg = JSON.parse(readFileSync(configPath, "utf8"));
		if (!isMap(cfg)) throw new Error("最上位がオブジェクトでない");
		return cfg;
	} catch (e) {
		console.error(`${TAG} ${configPath}: JSON として読めない（${e.message}）`);
		process.exit(2);
	}
}

//  text の中に、識別子 name が（より長い識別子の一部としてではなく）現れるか
export function hasName(text, name) {
	const esc = name.replace(/\$/g, "\\$");
	return new RegExp(`(?<![\\p{ID_Continue}$])${esc}(?![\\p{ID_Continue}$])`, "u").test(text);
}

//  「<ファイル>#<名前>」を読む。誤りは errs に積んで null を返す
function parseRef(key, value, root, errs) {
	if (!isText(value)) {
		errs.push(`X1  entry.${key} が無い（「<ファイル>#<名前>」で書く）`);
		return null;
	}
	const m = /^([^#]+)#([\p{ID_Start}_$][\p{ID_Continue}$]*)$/u.exec(value.trim());
	if (!m) {
		errs.push(`X1  entry.${key} は「<ファイル>#<名前>」の形で書く。名前は識別子 1 つ（文字・数字・_・$。「.」や「::」でつないだ名前は書けない）（実際: ${value}）`);
		return null;
	}
	const [, file, name] = m;
	const abs = resolve(root, file);
	const rel = relative(root, abs);
	if (isAbsolute(file) || rel === ".." || rel.startsWith(`..${sep}`) || !existsSync(abs) || !statSync(abs).isFile()) {
		errs.push(`X1  entry.${key} のファイルが無い: ${file}`);
		return null;
	}
	const text = readFileSync(abs, "utf8");
	if (!hasName(text, name)) {
		errs.push(`X1  entry.${key} の名前「${name}」が ${file} の中に無い`);
		return null;
	}
	return { file: posixPath(rel), name, text };
}

//  entry を読む。戻り: { state: "undeclared" | "none" | "declared", reason?, compose?, testEntry?, errs }
export function readEntry(cfg, root) {
	const errs = [];
	if (!("entry" in cfg)) return { state: "undeclared", errs };
	if (isNone(cfg.entry)) return { state: "none", reason: cfg.entry.none, errs };
	if (!isMap(cfg.entry)) {
		errs.push('X1  entry は { "compose", "test_entry" } か { "none": "<理由>" } で書く');
		return { state: "declared", errs };
	}
	for (const k of Object.keys(cfg.entry)) if (k !== "compose" && k !== "test_entry") errs.push(`X1  entry に知らないキー「${k}」がある（compose と test_entry だけ）`);
	const compose = parseRef("compose", cfg.entry.compose, root, errs);
	const testEntry = parseRef("test_entry", cfg.entry.test_entry, root, errs);
	if (compose && testEntry) {
		if (compose.file === testEntry.file) errs.push(`X2  entry.compose と entry.test_entry が同じファイルを指している（${compose.file}）。本番の組み立てとテストの入口は別のファイルに置く`);
		else if (!hasName(testEntry.text, compose.name))
			errs.push(
				`X2  テストの入口（${testEntry.file}）の中に、本番の組み立ての名前「${compose.name}」が無い。テストの入口のファイルから、本番の組み立てを名前で直接呼ぶ（別のファイルを経由して呼ぶ形は、ここでは確かめられない）`,
			);
	}
	return { state: "declared", compose, testEntry, errs };
}

//  コマンドの始め方: 引数を読み、設定を読む。戻り: { opts, root, cfg }
export function openProject(mode, argv) {
	const opts = parseArgs(mode, argv);
	const root = resolve(opts.root);
	const cfg = loadConfig(mode, opts.config ? resolve(opts.config) : join(root, CONFIG_FILE));
	return { opts, root, cfg };
}
