#!/usr/bin/env node
//
//  config-lint — プロジェクトの設定（harness.config.json）の形の検査（harness 同梱ツール。依存ゼロの Node）
//
//  設定には 3 種類のことを書く。
//    1. harness が直接使う事実（docs / source / tests / commands / git など）。値の意味は、読むツールが検査する。
//    2. ほかに正本がある決めごと（rules）。設定には中身を書き写さず、正本のファイルと、確かめるコマンドだけを指す。
//    3. ほかに置き場が無い決めごと（conventions）。機械では確かめていないので、理由と一緒に 1 文で書く。
//  このツールは、キーの名前の誤りと、2・3 と exceptions（人間が認めた例外）の形だけを検査する。
//  1 の値が正しいか（パスが実在するか、正規表現が一致するか）は、それを読むツールの担当で、ここでは見ない。
//
//  検査項目:
//    K1  最上位のキーは、ひな形（templates/develop/harness.config.json）にあるものだけ（名前の打ち間違いを通さない）
//    K2  rules は { <名前>: { "source": <ファイル>, "check": <commands のキー> } }。source は実在するファイル、
//        check は commands にコマンドとして宣言されたキー（none の宣言や未宣言は不可。確かめる手段が無いなら conventions に書く）
//    K3  conventions は [{ "rule": <1 文>, "unchecked_because": <機械で確かめていない理由> }]。同じ rule を 2 回書かない
//    K4  exceptions は [{ "what": <何を認めたか>, "approved": "YYYY-MM-DD" }]
//  conventions は、違反が無くても毎回、件数と一覧を表示する（機械が見ていない範囲を見えるままにする）。
//  rules / conventions / exceptions は省略できる。省略したものは「未宣言」と表示する（0 件とは区別する）。
//
//  monorepo（git.units = { 単位名: ディレクトリ }）では、ルートに続けて、設定ファイルを持つ unit を検査する。
//
//  使い方:
//    node config-lint.mjs [--root <プロジェクトのルート>] [--config harness.config.json]
//
//  終了コード: 0 = 違反なし / 1 = 違反あり / 2 = 使い方・設定ファイルが無い・JSON として読めない
//  環境変数 CONFIG_LINT_TEMPLATE は、ひな形の場所を差し替える（テスト用）。

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_FILE, renamedConfigHint } from "../_shared/config.mjs";

const TAG = "[config-lint]";
const TEMPLATE =
	process.env.CONFIG_LINT_TEMPLATE || join(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates", "develop", CONFIG_FILE);

const isMap = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isText = (v) => typeof v === "string" && v.trim() !== "";
const oneLine = (v) => isText(v) && !/[\r\n]/.test(v);
const isNone = (v) => isMap(v) && typeof v.none === "string";

function usage(msg) {
	if (msg) console.error(`${TAG} ${msg}`);
	console.error(`usage: config-lint.mjs [--root .] [--config ${CONFIG_FILE}]`);
	process.exit(2);
}

function parseArgs(argv) {
	const opts = { root: ".", config: null };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--root" || a === "--config") {
			if (argv[i + 1] === undefined) usage(`${a} に値が無い`);
			opts[a.slice(2)] = argv[++i];
		} else usage(`知らない引数: ${a}`);
	}
	return opts;
}

function readJson(path) {
	try {
		const v = JSON.parse(readFileSync(path, "utf8"));
		return isMap(v) ? { value: v } : { error: "最上位がオブジェクトでない" };
	} catch (e) {
		return { error: `JSON として読めない（${e.message}）` };
	}
}

//  1 つの設定ファイルを検査し、違反の一覧と表示用の情報を返す
function lint(cfg, root, allowed) {
	const errs = [];
	const err = (id, msg) => errs.push(`${id}  ${msg}`);

	for (const k of Object.keys(cfg)) {
		if (!allowed.includes(k)) err("K1", `最上位のキー「${k}」は、ひな形に無い（使えるキー: ${allowed.join(" / ")}）`);
	}

	if ("rules" in cfg) {
		if (!isMap(cfg.rules)) err("K2", "rules はオブジェクトで書く（{ <名前>: { source, check } }）");
		else
			for (const [name, r] of Object.entries(cfg.rules)) {
				if (!isMap(r)) {
					err("K2", `rules.${name} はオブジェクトで書く（{ source, check }）`);
					continue;
				}
				for (const k of Object.keys(r)) if (k !== "source" && k !== "check") err("K2", `rules.${name} に知らないキー「${k}」がある（source と check だけ）`);
				if (!isText(r.source)) err("K2", `rules.${name}.source が無い（決めごとの正本のファイルを書く）`);
				else {
					const p = resolve(root, r.source);
					if (!existsSync(p) || !statSync(p).isFile()) err("K2", `rules.${name}.source のファイルが無い: ${r.source}`);
				}
				if (!isText(r.check)) err("K2", `rules.${name}.check が無い（確かめる commands のキーを書く）`);
				else {
					const cmd = isMap(cfg.commands) ? cfg.commands[r.check] : undefined;
					if (cmd === undefined) err("K2", `rules.${name}.check の「${r.check}」が commands に宣言されていない`);
					else if (isNone(cmd)) err("K2", `rules.${name}.check の commands.${r.check} は none（${cmd.none}）。確かめる手段が無い決めごとは conventions に書く`);
					else if (!isText(cmd)) err("K2", `rules.${name}.check の commands.${r.check} がコマンドの文字列でない`);
				}
			}
	}

	if ("conventions" in cfg) {
		if (!Array.isArray(cfg.conventions)) err("K3", "conventions は配列で書く（[{ rule, unchecked_because }]）");
		else {
			const seen = new Set();
			cfg.conventions.forEach((c, i) => {
				const at = `conventions[${i}]`;
				if (!isMap(c)) return err("K3", `${at} はオブジェクトで書く（{ rule, unchecked_because }）`);
				for (const k of Object.keys(c)) if (k !== "rule" && k !== "unchecked_because") err("K3", `${at} に知らないキー「${k}」がある（rule と unchecked_because だけ）`);
				if (!oneLine(c.rule)) err("K3", `${at}.rule は 1 行の文で書く`);
				else if (seen.has(c.rule.trim())) err("K3", `${at}.rule が重複している: ${c.rule.trim()}`);
				else seen.add(c.rule.trim());
				if (!oneLine(c.unchecked_because)) err("K3", `${at}.unchecked_because は 1 行の文で書く（機械で確かめていない理由）`);
			});
		}
	}

	if ("exceptions" in cfg) {
		if (!Array.isArray(cfg.exceptions)) err("K4", "exceptions は配列で書く（[{ what, approved }]）");
		else
			cfg.exceptions.forEach((x, i) => {
				const at = `exceptions[${i}]`;
				if (!isMap(x)) return err("K4", `${at} はオブジェクトで書く（{ what, approved }）`);
				for (const k of Object.keys(x)) if (k !== "what" && k !== "approved") err("K4", `${at} に知らないキー「${k}」がある（what と approved だけ）`);
				if (!oneLine(x.what)) err("K4", `${at}.what は 1 行の文で書く`);
				const d = typeof x.approved === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.approved) ? new Date(`${x.approved}T00:00:00Z`) : null;
				if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== x.approved) err("K4", `${at}.approved は実在する日付を YYYY-MM-DD で書く（人間が認めた日）`);
			});
	}
	return errs;
}

function report(label, cfg, errs) {
	console.log(`${TAG} ${label}`);
	const count = (k, shape) => (k in cfg ? (shape(cfg[k]) ? `${Array.isArray(cfg[k]) ? cfg[k].length : Object.keys(cfg[k]).length} 件` : "形が誤り") : "未宣言");
	console.log(`  正本を指す決めごと（rules）: ${count("rules", isMap)}`);
	console.log(`  人間が認めた例外（exceptions）: ${count("exceptions", Array.isArray)}`);
	console.log(`  機械で確かめていない決めごと（conventions）: ${count("conventions", Array.isArray)}`);
	if (Array.isArray(cfg.conventions))
		for (const c of cfg.conventions) if (isMap(c) && isText(c.rule)) console.log(`    - ${c.rule.trim()}${isText(c.unchecked_because) ? `（確かめていない理由: ${c.unchecked_because.trim()}）` : ""}`);
	for (const e of errs) console.log(`  err  ${e}`);
}

function main() {
	const opts = parseArgs(process.argv.slice(2));
	const root = resolve(opts.root);
	const configPath = opts.config ? resolve(opts.config) : join(root, CONFIG_FILE);
	if (!existsSync(configPath)) {
		console.error(`${TAG} 設定が無い: ${configPath}（テンプレート templates/develop/${CONFIG_FILE} を host 直下に置く）${renamedConfigHint(configPath)}`);
		return 2;
	}
	const template = readJson(TEMPLATE);
	if (template.error) {
		console.error(`${TAG} ひな形を読めない: ${TEMPLATE}（${template.error}）。templates/ は tools/ と同じ checkout のまま置く`);
		return 2;
	}
	const allowed = Object.keys(template.value);

	const targets = [{ label: opts.config ?? CONFIG_FILE, path: configPath, root }];
	const top = readJson(configPath);
	if (top.error) {
		console.error(`${TAG} ${configPath}: ${top.error}`);
		return 2;
	}
	const units = isMap(top.value.git) && isMap(top.value.git.units) ? top.value.git.units : {};
	for (const [name, dir] of Object.entries(units)) {
		if (typeof dir !== "string") continue; //  git.units の形は git-lint が検査する
		const p = join(root, dir, CONFIG_FILE);
		if (existsSync(p)) targets.push({ label: `unit ${name}（${dir}/${CONFIG_FILE}）`, path: p, root: join(root, dir) });
	}

	let total = 0;
	for (const t of targets) {
		const loaded = t.path === configPath ? top : readJson(t.path);
		if (loaded.error) {
			console.error(`${TAG} ${t.path}: ${loaded.error}`);
			return 2;
		}
		const errs = lint(loaded.value, t.root, allowed);
		report(t.label, loaded.value, errs);
		total += errs.length;
	}
	console.log(total ? `${TAG} 違反 ${total} 件` : `${TAG} OK`);
	return total ? 1 : 0;
}

process.exitCode = main();
