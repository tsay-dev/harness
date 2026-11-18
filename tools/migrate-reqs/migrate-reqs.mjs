#!/usr/bin/env node
//
//  migrate reqs — REQ のファイル（REQ-nnn.md）を、UC の文書（UC.md）の「要件」の節へ移す（harness 同梱ツール）
//
//  REQ を 1 ID 1 ファイルで置く形から、UC.md の `## 要件` の節に小節として書く形（ADR-0067）へ、意味を変えずに移す。
//  入口からは `harness migrate reqs`。
//
//  行うこと（UC のディレクトリごと）:
//    1. REQ-nnn.md を番号の順に読み、1 つずつ小節（### REQ-nnn・項目の並び・本文）に直す。
//       frontmatter の id と uc、本文の `# REQ-nnn` の題は、小節の見出しと置き場が表すので書かない。
//       落とすのは、ひな形の案内だけ（status の値の後ろの案内の文面と、検証方針の下の案内の HTML コメント）。
//       status の後ろに案内に続けて書かれた文（撤回した理由など）は、項目 note に移す。ほかは 1 文字も変えない
//    2. 直した小節を検査ツールと同じ読み方で読み戻し、元のファイルと同じ中身になることを確かめる（合わなければ何も書かない）
//    3. UC.md の末尾に `## 要件` の節を足し、REQ-nnn.md を消す（--write のときだけ）
//  移せないもの（uc が置き場の UC と違う、小節に書けない項目がある、UC.md にすでに「要件」の節がある、など）が
//  1 つでもあれば、どのファイルも書き換えずに失敗する。
//
//  使い方:
//    harness migrate reqs [--root <プロジェクトのルート>] [--docs docs] [--write]
//      --write  書き換える。付けなければ、何を移すかを表示するだけ
//
//  終了コード: 0 = 移せる（--write なら移した） / 1 = 移せないものがある / 2 = 使い方の誤り

import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { REQS_HEADING, reqDocsOf, sectionFromReqDoc } from "../_shared/reqs.mjs";

const TAG = "[migrate reqs]";
//  検証方針の下に置かれていた、ひな形の案内のコメントの書き出し（日本語のひな形と、その前の英語のひな形）
const GUIDANCE = ["要件作成者ではなくテスト設計者が所有する", "Owned by the test designer, not by the requirement"];
//  status の値の後ろに置かれていた、ひな形の案内の文面（長いものから照らす）。これに続けて書かれた文は、項目 note に移す
const STATUS_GUIDANCE = ["draft | active | withdrawn（active = 人間承認済み）", "draft | active | withdrawn (active = approved by a human)", "draft | active | withdrawn"];

function usage(msg) {
	if (msg) console.error(`${TAG} ${msg}`);
	console.error("usage: harness migrate reqs [--root .] [--docs docs] [--write]");
	process.exit(2);
}

function parseArgs(argv) {
	const opts = { root: ".", docs: "docs", write: false };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === "--write") opts.write = true;
		else if (a === "--root" || a === "--docs") {
			if (argv[i + 1] === undefined) usage(`${a} に値が無い`);
			opts[a.slice(2)] = argv[++i];
		} else usage(`知らない引数: ${a}`);
	}
	return opts;
}

const dirs = (d) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : []);
const fmOf = (text) => {
	const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
	const out = {};
	if (m) for (const line of m[1].split(/\r?\n/)) {
		const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
		if (kv) out[kv[1]] = kv[2].replace(/\s+#.*$/, "").trim();
	}
	return out;
};

//  比べるための形にそろえる: 落とすと決めたもの（status の後ろの案内、ひな形の案内のコメント）を除き、空行の数と行末の空白の違いを無視する
function comparable(text) {
	const norm = (s) => s.replace(/\s+/g, " ").trim();
	return text
		.replace(/\r\n/g, "\n")
		.replace(/<!--([\s\S]*?)-->\n?/g, (all, inner) => (GUIDANCE.some((g) => norm(inner).startsWith(g)) ? "" : all))
		.split("\n")
		.map((l) => l.replace(/\s+$/, ""))
		.filter((l) => l !== "")
		.join("\n");
}

//  frontmatter のキーの順の違いは意味を持たないので、並べ直してから比べる
function comparableDoc(text) {
	const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"));
	if (!m) return comparable(text);
	//  status の行末は、案内の文面を除き、続けて書かれた文を note の行として数える（移した後の項目 note と比べる）
	const fm = m[1]
		.split("\n")
		.filter((l) => l.trim())
		.flatMap((l) => {
			const c = /^(status):\s*(.*?)\s+#\s*(.*)$/.exec(l);
			if (!c) return [l.replace(/:\s*/, ": ").trim()];
			const g = STATUS_GUIDANCE.find((x) => c[3].startsWith(x));
			const rest = (g === undefined ? c[3] : c[3].slice(g.length)).replace(/^[\s。．.、,]+/, "").trim();
			return rest ? [`status: ${c[2]}`, `note: ${rest}`] : [`status: ${c[2]}`];
		})
		.sort()
		.join("\n");
	return `${fm}\n---\n${comparable(m[2])}`;
}

function main() {
	const opts = parseArgs(process.argv.slice(2));
	const root = resolve(opts.root);
	const goals = join(root, opts.docs, "goals");
	if (!existsSync(goals)) {
		console.log(`${TAG} ${relative(root, goals) || goals} が無い: 移すものが無い`);
		return 0;
	}
	const errs = [];
	const plans = [];
	let notes = 0;
	for (const g of dirs(goals)) {
		for (const u of dirs(join(goals, g))) {
			const udir = join(goals, g, u);
			const reqFiles = readdirSync(udir).filter((n) => /^REQ-\d+\.md$/.test(n)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
			if (reqFiles.length === 0) continue;
			const ucFile = join(udir, "UC.md");
			const rel = (f) => relative(root, f);
			if (!existsSync(ucFile) || !statSync(ucFile).isFile()) {
				errs.push(`${rel(udir)}: REQ があるのに UC.md が無い`);
				continue;
			}
			const ucText = readFileSync(ucFile, "utf8");
			const ucId = fmOf(ucText).id;
			if (!ucId) {
				errs.push(`${rel(ucFile)}: frontmatter に id が無い`);
				continue;
			}
			if (new RegExp(`^## ${REQS_HEADING}\\s*$`, "m").test(ucText)) {
				errs.push(`${rel(ucFile)}: すでに「${REQS_HEADING}」の節がある（REQ-nnn.md と両方があるので、どちらが正しいかを決めてから移す）`);
				continue;
			}
			const sections = [];
			const originals = new Map();
			for (const n of reqFiles) {
				const f = join(udir, n);
				const text = readFileSync(f, "utf8");
				const r = sectionFromReqDoc(text, { guidance: GUIDANCE, statusGuidance: STATUS_GUIDANCE });
				if (r.error) {
					errs.push(`${rel(f)}: ${r.error}`);
					continue;
				}
				if (r.id !== n.replace(/\.md$/, "")) errs.push(`${rel(f)}: id（${r.id}）がファイル名と違う`);
				if (r.uc !== ucId) errs.push(`${rel(f)}: uc（${r.uc}）が置き場の UC（${ucId}）と違う`);
				if (r.note) notes += 1;
				sections.push(r.section);
				originals.set(r.id, { file: f, text });
			}
			const merged = `${ucText.replace(/\s+$/, "")}\n\n## ${REQS_HEADING}\n\n${sections.join("\n")}`;
			//  読み戻して、元のファイルと同じ中身になることを確かめる
			const back = reqDocsOf(ucFile, merged, ucId);
			for (const p of back.problems) errs.push(`${rel(ucFile)}: 移した後の節を読めない（${p.msg}）`);
			if (back.docs.length !== originals.size) errs.push(`${rel(ucFile)}: 移した後の REQ の数（${back.docs.length}）が元（${originals.size}）と違う`);
			for (const d of back.docs) {
				const o = originals.get(d.id);
				if (!o) errs.push(`${rel(ucFile)}: 移した後に、元に無い ${d.id} がある`);
				else if (comparableDoc(d.text) !== comparableDoc(o.text)) errs.push(`${rel(o.file)}: 移した後に読み戻すと、元と中身が違う`);
			}
			//  UC 自身の部分が変わっていないこと
			if (comparable(back.ucText) !== comparable(ucText)) errs.push(`${rel(ucFile)}: 「${REQS_HEADING}」の節を足すと、UC 自身の部分が変わる`);
			plans.push({ ucFile, merged, files: [...originals.values()].map((o) => o.file), ucId, count: sections.length });
		}
	}
	if (errs.length) {
		for (const e of errs) console.log(`  err  ${e}`);
		console.log(`${TAG} 移せないものが ${errs.length} 件ある。どのファイルも書き換えていない`);
		return 1;
	}
	const total = plans.reduce((n, p) => n + p.count, 0);
	if (!opts.write) {
		for (const p of plans) console.log(`  ${relative(root, p.ucFile)}: REQ ${p.count} 件を「${REQS_HEADING}」の節へ`);
		console.log(`${TAG} 移せる: UC ${plans.length} 件、REQ ${total} 件（status の後ろの文を note に移すもの ${notes} 件。--write で書き換える）`);
		return 0;
	}
	for (const p of plans) {
		writeFileSync(p.ucFile, p.merged);
		for (const f of p.files) rmSync(f);
	}
	console.log(`${TAG} 移した: UC ${plans.length} 件、REQ ${total} 件（status の後ろの文を note に移したもの ${notes} 件。REQ-nnn.md は消した）`);
	return 0;
}

process.exitCode = main();
