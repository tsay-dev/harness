#!/usr/bin/env node
//
//  index — 1 行 1 ID の索引を出力する（harness index。依存ゼロの Node）
//
//  GOAL / UC / REQ / BR / NFR / ADR と、それを確かめるテストのファイルを、仕様の文書とテストの注釈から組み立てて出力する。
//  導出できる地図なので、ファイルに書いてコミットしない（必要なときに生成する）。
//  文書と注釈の読み方は tools/_shared/refs.mjs（lint refs・next-id と同じ）。
//
//  使い方:
//    harness index [--root .] [--config harness.config.json]
//
//  終了コード: 0 = 出力した / 2 = 使い方・設定エラー
//

import { basename, join } from "node:path";
import { parseFrontmatter } from "../_shared/frontmatter.mjs";
import { Corpus, DEFAULTS, compile, declared, frontmatter, iterFiles, openProject, p, read, scanTests, textOf, usage, useCommandName, walk } from "../_shared/refs.mjs";

useCommandName("index");

//  ---- 索引（派生物: ファイルへコミットしない） ----------------------------------------

function printIndex(cfg) {
	const firstQuoteOf = (text) => {
		for (const line of text.split(/\r?\n/)) if (line.startsWith("> ")) return line.slice(2).trim();
		return "";
	};
	const firstQuote = (path) => firstQuoteOf(read(path));
	const corpus = new Corpus(cfg);
	//  ID ごとの、それを確かめるテストのファイル（保留のテストは「(保留)」を付ける）。tests が none なら引かない
	const testSec = declared(cfg.tests);
	const sysSec = testSec ? declared(testSec.system) : null;
	const testFiles = {}; //  ID -> Map<ファイル, 保留でないテストがあるか>
	const note = (id, u, where) => {
		const file = where.replace(/:\d+$/, "");
		const m = (testFiles[id] ||= new Map());
		m.set(file, m.get(file) || !u.pending);
	};
	const kinds = {
		covers: compile("covers_pattern", cfg.covers_pattern, "g"),
		nfr: compile("nfr_pattern", cfg.nfr_pattern ?? DEFAULTS.nfr_pattern, "g"),
		br: compile("br_pattern", cfg.br_pattern ?? DEFAULTS.br_pattern, "g"),
	};
	if (testSec) for (const u of scanTests(cfg, testSec, "tests", iterFiles(cfg, "tests"), "covers_placement", kinds).units) for (const k of Object.keys(kinds)) for (const a of u.ann[k]) note(a.m[1], u, a.where);
	if (sysSec) {
		const sysKinds = { scenario: compile("scenario_pattern", cfg.scenario_pattern ?? DEFAULTS.scenario_pattern, "g"), nfr: kinds.nfr };
		for (const u of scanTests(cfg, sysSec, "tests.system", iterFiles(cfg, "tests.system"), "scenario_placement", sysKinds).units) for (const k of Object.keys(sysKinds)) for (const a of u.ann[k]) note(a.m[1], u, a.where);
	}
	const testsOf = (id) => {
		if (!testSec) return "(tests は none)";
		return [...(testFiles[id] || [])].sort().map(([f, live]) => (live ? f : `${f} (保留)`)).join(", ") || "-";
	};
	const out = ["# 索引（生成物 / harness index。コミット禁止）"];
	for (const goal of Object.keys(corpus.goals).sort()) {
		const g = corpus.goals[goal];
		out.push("", `## ${goal} [${g.status}] ${basename(g.dir)}/`, `   ${firstQuote(join(g.dir, "GOAL.md"))}`);
		for (const [uid, u] of Object.entries(corpus.ucs).sort()) {
			if (u.goalDir !== g.dir) continue;
			out.push(`   ${uid}/ [${u.status}${u.phase ? ` / ${u.phase}` : ""}]  ${frontmatter(u.file).title || ""}`);
			if (sysSec) out.push(`            scenario: ${testsOf(uid)}`);
			for (const [rid, r] of Object.entries(corpus.reqs).sort()) {
				if (r.dir !== u.dir) continue;
				let text = firstQuoteOf(textOf(r));
				if (text.length > 42) text = text.slice(0, 42) + "…";
				out.push(`     ${rid} [${parseFrontmatter(textOf(r)).data.pattern || "?"}] ${text}`, `            classes: ${r.classes.map((k) => `#${k}`).join(" ")}`, `            tests: ${testsOf(rid)}`);
			}
		}
	}
	out.push("", "## rules");
	for (const f of walk(p(cfg, "docs.rules_dir"), [".md"])) {
		const fm = frontmatter(f);
		if (fm.id) out.push(`   ${fm.id}  ${fm.title || ""}  (enforced_at: ${fm.enforced_at || "?"})`, `            tests: ${testsOf(fm.id)}`);
	}
	out.push("", "## nfr");
	for (const f of walk(p(cfg, "docs.nfr_dir"), [".md"])) {
		const fm = frontmatter(f);
		if (fm.id) out.push(`   ${fm.id}  [${fm.category || "?"}]  ${firstQuote(f).slice(0, 60)}`, `            tests: ${testsOf(fm.id)}`);
	}
	out.push("", "## adr");
	for (const f of walk(p(cfg, "docs.adr_dir"), [".md"])) {
		const fm = frontmatter(f);
		if (fm.id) out.push(`   ${fm.id}  [${fm.status || "?"}]  ${fm.title || ""}`);
	}
	console.log(out.join("\n"));
}

//  ---- 引数と main ---------------------------------------------------------------

function parseArgs(argv) {
	const opts = { root: ".", config: null };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const value = () => (i + 1 < argv.length ? argv[++i] : usage(`${a} には値が要る`));
		if (a === "--root") opts.root = value();
		else if (a === "--config") opts.config = value();
		else usage(`不明な引数 ${a}`);
	}
	return opts;
}

function main() {
	const { cfg, decl, declError } = openProject(parseArgs(process.argv.slice(2)));
	if (decl.errors.length) return declError();
	printIndex(cfg);
	return 0;
}

process.exitCode = main();
