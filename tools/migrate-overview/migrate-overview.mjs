#!/usr/bin/env node
//
//  migrate overview — ビジョン（00-vision.md）・アクター表（02-actors.md）・バックログ（goals-backlog.md）・GOAL.md を、
//  1 枚の概要（00-overview.md）へ移す（harness 同梱ツール。ADR-0076）。入口からは `harness migrate overview`。
//
//  行うこと（docs のフォルダ 1 つ。monorepo では unit ごとに --root で実行する）:
//    1. 4 種類を読む。場所は設定（harness.config.json）に古いキー docs.vision / docs.actors / docs.goals_backlog が
//       パスで残っていればそのパス、無ければ <docs>/ の既定の名前。GOAL.md は <docs>/goals/*/GOAL.md
//    2. 概要を組み立てる。落とすのは、ひな形の案内（案内の HTML コメント、vision の末尾の 2 行、アクター表の末尾の 2 行、
//       status の値の後ろの案内の文面）だけ。ほかの文は 1 文字も変えずに、決まった場所へ移す:
//         vision の課題 → 解決する課題 / 対象ユーザー → アクターの表の前 / 成功の定義 → KPI の表（先頭のセルの KPI-nn を ID の列に分ける）
//         とその後の文 / やらないこと → やらないこと / 知らない節 → 末尾に元の順で
//         GOAL.md → GOAL の表の行（> の 1 段落が目指す状態。status の後ろの文と、撤回の理由の段落は備考）
//         バックログの ### GOAL-nn の塊 → planned（撤回済みなら withdrawn）の行
//       全体の方針は、ひな形の見出しと「（未記入: …）」を置く。概要の status は、vision とアクター表の status から決める
//       （frozen・living → living、draft → draft。2 つが食い違えば移さない）
//    3. 組み立てた概要を検査ツールと同じ読み方（tools/_shared/overview.mjs）で読み戻し、元から取り出した中身
//       （ID・status・アクター・KPI・目指す状態・備考、KPI とアクターの表の全セル）と一致することを確かめる
//    4. --write のときだけ、概要を書き、古い 4 種類を消す
//  移せないもの（定形の外の行、2 段落の GOAL 文、案内でない HTML コメント、バックログの ID のフォルダ、status の食い違いなど）が
//  1 つでもあれば、何も書かずに失敗する。設定は書き換えない（人のゲート。ADR-0057）。入れる変更の案を表示する。
//
//  使い方:
//    harness migrate overview [--root <プロジェクトのルート>] [--docs docs] [--write]
//      --write  書き換える。付けなければ、何を移すかを表示するだけ
//
//  終了コード: 0 = 移せる（--write なら移した。移すものが無いときも 0） / 1 = 移せないものがある / 2 = 使い方の誤り

import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import { parseFrontmatter } from "../_shared/frontmatter.mjs";
import { OVERVIEW_FILE, overviewFormat, readOverview, renderOverview, splitRow, unescapeCell } from "../_shared/overview.mjs";
import { exitWith } from "../_shared/stdio.mjs";

const TAG = "[migrate overview]";
//  ひな形の案内の HTML コメントの書き出し（これで始まるコメントは落とす）
const GUIDANCE = [
	"誰のどの課題か",
	"アクターの大まかな分類",
	"明示的に対象外とする",
	"本文は日本語で書く",
	"システムアクター（",
	"種別は「人間」か「システム」で始める",
	"「システム」で始まるアクターだけ",
	"R-301 の記入例",
	"optional（任意）",
	"ファイルの代わりに ### 見出しで ID を定義する",
];
//  ひな形が本文に置いていた案内の行（書き出しで照らす）
const GUIDANCE_LINES = ["> この文書が持つ唯一の情報: 存在理由と削除判断の根拠。", "> 機能一覧・画面・技術選定はここに書かない", "ゴールの定義は `docs/goals/<GOAL-nn-slug>/GOAL.md`", "未着手ゴールは `docs/goals-backlog.md`", "実現を開始したら `docs/goals/<GOAL-nn-slug>/` を切り"];
//  GOAL.md の status の値の後ろにあった、ひな形の案内の文面（長いものから照らす。migrate reqs の STATUS_GUIDANCE と同じ照らし方）
//  「（active = 人間承認済み。<続けて書いた文>）」の形は、括弧の中に続けて書いた文だけを残す（閉じ括弧も落とす）
const STATUS_GUIDANCE = ["draft | active | withdrawn（active = 人間承認済み。", "draft | active | withdrawn（active = 人間承認済み）", "draft | active | withdrawn (active = approved by a human)", "draft | active | withdrawn"];
//  バックログの「まだ無い」の 1 行（移す行が無いことを書いただけの文）
const EMPTY_BACKLOG_RE = /^未着手の(ゴール|GOAL)は(まだ)?(無い|ない)/;
const OLD_KEYS = { vision: "00-vision.md", actors: "02-actors.md", goals_backlog: "goals-backlog.md" };

function usage(msg) {
	exitWith(2, ...(msg ? [`${TAG} ${msg}`] : []), "usage: harness migrate overview [--root .] [--docs docs] [--write]");
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

const isNone = (v) => v !== null && typeof v === "object" && !Array.isArray(v) && "none" in v;
const norm = (s) => s.replace(/\s+/g, " ").trim();
const isGuidanceComment = (inner) => GUIDANCE.some((g) => norm(inner).startsWith(g));
const isGuidanceLine = (line) => GUIDANCE_LINES.some((g) => line.trim().startsWith(g));

//  本文から、ひな形の案内（コメントと行）を落とす。案内でない HTML コメントは残す（呼ぶ側が扱いを決める）
function dropGuidance(text) {
	return text
		.replace(/<!--([\s\S]*?)-->[ \t]*\n?/g, (all, inner) => (isGuidanceComment(inner) ? "" : all))
		.split("\n")
		.filter((l) => !isGuidanceLine(l))
		.join("\n");
}
const trimBlock = (s) => s.replace(/^\s*\n/, "").replace(/\s+$/, "").replace(/\n{3,}/g, "\n\n");

//  ## の節に分ける: { head（最初の ## より前）, secs: [{ title, key, body }] }
function sections(body) {
	const secs = [];
	const head = [];
	let cur = null;
	let fence = false;
	for (const line of body.split(/\r?\n/)) {
		if (/^(```|~~~)/.test(line)) fence = !fence;
		const m = fence ? null : /^##\s+(.*)$/.exec(line);
		if (m) secs.push((cur = { title: m[1].trim(), key: m[1].trim().split(/[\s（(]/)[0], lines: [] }));
		else (cur ? cur.lines : head).push(line);
	}
	return { head: head.join("\n"), secs: secs.map((s) => ({ ...s, body: s.lines.join("\n") })) };
}

//  節の本文を、最初の表の前・表の行・表の後に分ける
function splitTable(text) {
	const lines = text.split("\n");
	const start = lines.findIndex((l) => l.trim().startsWith("|"));
	if (start < 0) return { before: text, header: null, rows: [], after: "" };
	let end = start;
	while (end < lines.length && lines[end].trim().startsWith("|")) end++;
	const cells = lines.slice(start, end).map(splitRow);
	const rows = cells.slice(1).filter((c) => !c.every((x) => /^:?-{2,}:?$/.test(x)));
	return { before: lines.slice(0, start).join("\n"), header: cells[0], rows, after: lines.slice(end).join("\n") };
}

const readText = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const relTo = (root) => (f) => relative(root, f).split("\\").join("/");

function main() {
	const opts = parseArgs(process.argv.slice(2));
	const root = resolve(opts.root);
	const docsDir = resolve(root, opts.docs);
	const rel = relTo(root);
	let cfg = null;
	try {
		cfg = JSON.parse(readFileSync(join(root, "harness.config.json"), "utf8"));
	} catch {}
	const docsCfg = cfg && typeof cfg.docs === "object" && cfg.docs ? cfg.docs : {};
	const pathOf = (key) => (typeof docsCfg[key] === "string" ? resolve(root, docsCfg[key]) : join(docsDir, OLD_KEYS[key]));
	const files = { vision: pathOf("vision"), actors: pathOf("actors"), backlog: pathOf("goals_backlog") };
	const goalsDir = typeof docsCfg.goals_dir === "string" ? resolve(root, docsCfg.goals_dir) : join(docsDir, "goals");
	const has = (f) => existsSync(f) && statSync(f).isFile();
	const goalDirs = existsSync(goalsDir) ? readdirSync(goalsDir, { withFileTypes: true }).filter((d) => d.isDirectory() && /^GOAL-\d+/.test(d.name)).map((d) => join(goalsDir, d.name)).sort() : [];
	const goalFiles = goalDirs.map((d) => join(d, "GOAL.md")).filter(has);
	const overviewFile = join(docsDir, OVERVIEW_FILE);

	const errs = [];
	const notes = [];
	const config = configAdvice(docsCfg, files, has, rel(overviewFile));
	const olds = [files.vision, files.actors, files.backlog].filter(has);
	if (!olds.length && !goalFiles.length) {
		console.log(`${TAG} ${rel(docsDir) || "."}: 移す文書が無い`);
		printConfig(config);
		return 0;
	}
	if (has(overviewFile)) {
		console.log(`  err  ${rel(overviewFile)} がすでにある（古い文書と両方があるので、どちらが正しいかを決めてから移す）`);
		return 1;
	}

	const parts = { kpis: [], actors: [], goals: [], extra: [] };
	const fail = (f, msg) => errs.push(`${rel(f)}: ${msg}`);
	const status = {};

	//  ---- vision
	if (has(files.vision)) {
		const fm = parseFrontmatter(readText(files.vision));
		status.vision = fm.data.status;
		const { head, secs } = sections(dropGuidance(fm.body));
		if (stripTitle(head, "Vision").trim()) fail(files.vision, `最初の ## より前に本文がある（移す節が決まらない）: ${stripTitle(head, "Vision").trim().slice(0, 40)}`);
		for (const s of secs) {
			const body = trimBlock(s.body);
			if (s.key === "解決する課題") parts.problem = body;
			else if (s.key === "対象ユーザー") parts.audience = body;
			else if (s.key === "成功の定義") {
				const t = splitTable(body);
				if (!t.header) {
					if (body) parts.kpiProse = body;
					continue;
				}
				if (t.header.length !== 3 || t.header[0] !== "指標") fail(files.vision, `成功の定義の表の列が | 指標 | 現状 | 目標 | でない（実際: ${t.header.join(" | ")}）`);
				for (const c of t.rows) {
					const m = /^(KPI-\d+)\s+(.*)$/.exec(c[0] ?? "");
					if (!m || c.length !== 3) {
						fail(files.vision, `成功の定義の行の先頭のセルが「KPI-nn 指標」でない（実際: ${c.join(" | ")}）`);
						continue;
					}
					parts.kpis.push([m[1], unescapeCell(m[2]), unescapeCell(c[1]), unescapeCell(c[2])]);
				}
				parts.kpiProse = trimBlock([t.before, t.after].filter((x) => x.trim()).join("\n\n")) || undefined;
			} else if (s.key === "やらないこと") parts.outOfScope = body;
			else {
				parts.extra.push({ title: s.title, body });
				notes.push(`${rel(files.vision)}: ひな形に無い節「## ${s.title}」を、概要の末尾にそのまま移す`);
			}
		}
	}

	//  ---- アクター表
	if (has(files.actors)) {
		const fm = parseFrontmatter(readText(files.actors));
		status.actors = fm.data.status;
		const { head, secs } = sections(dropGuidance(fm.body));
		if (stripTitle(head, "アクター").trim()) fail(files.actors, `最初の ## より前に本文がある: ${stripTitle(head, "アクター").trim().slice(0, 40)}`);
		for (const s of secs) {
			if (s.key !== "アクター一覧") {
				fail(files.actors, `「## アクター一覧」のほかの節「## ${s.title}」がある（概要のどこへ移すかが決まらない）`);
				continue;
			}
			const t = splitTable(trimBlock(s.body));
			const want = overviewFormat().columns.actors.required;
			if (!t.header || t.header.join("|") !== want.join("|")) fail(files.actors, `アクターの表の列が | ${want.join(" | ")} | でない`);
			for (const c of t.rows) {
				if (c.length !== want.length || !/^ACT-\d+$/.test(c[0])) fail(files.actors, `アクターの表の行を読めない: ${c.join(" | ")}`);
				else parts.actors.push(c.map(unescapeCell));
			}
			parts.actorsBefore = trimBlock(t.before) || undefined;
			parts.actorsAfter = trimBlock(t.after) || undefined;
		}
	}
	parts.actorsProse = [parts.audience, parts.actorsBefore].filter(Boolean).join("\n\n") || undefined;

	//  ---- GOAL.md
	const fromFolder = new Set();
	for (const f of goalFiles) {
		const g = goalFromFile(f, (msg) => fail(f, msg));
		if (!g) continue;
		const dirId = /^(GOAL-\d+)/.exec(basename(join(f, "..")))[1];
		if (g.id !== dirId) fail(f, `id（${g.id}）がフォルダの名前（${dirId}）と違う`);
		fromFolder.add(g.id);
		parts.goals.push(g);
	}

	//  ---- バックログ
	if (has(files.backlog)) {
		const fm = parseFrontmatter(readText(files.backlog));
		for (const g of goalsFromBacklog(fm.body, (msg) => fail(files.backlog, msg))) {
			if (fromFolder.has(g.id) || goalDirs.some((d) => basename(d).startsWith(`${g.id}-`) || basename(d) === g.id)) fail(files.backlog, `${g.id} は未着手なのに、同じ ID のフォルダがある（どちらが正しいかを決めてから移す）`);
			else parts.goals.push(g);
		}
	}
	parts.goals.sort((a, b) => Number(a.id.split("-")[1]) - Number(b.id.split("-")[1]));
	const ids = parts.goals.map((g) => g.id);
	for (const id of new Set(ids)) if (ids.filter((x) => x === id).length > 1) errs.push(`${id} が 2 か所で定義されている`);

	//  ---- 概要の status（vision とアクター表から。食い違えば移さない）
	const lift = (s) => (s === "frozen" || s === "living" ? "living" : s === "draft" ? "draft" : null);
	const sv = status.vision === undefined ? undefined : lift(status.vision);
	const sa = status.actors === undefined ? undefined : lift(status.actors);
	if (sv === null) fail(files.vision, `status（${status.vision}）を読めない`);
	if (sa === null) fail(files.actors, `status（${status.actors}）を読めない`);
	if (sv && sa && sv !== sa) errs.push(`vision の status（${status.vision}）とアクター表の status（${status.actors}）が食い違う（概要の status を 1 つに決められない。どちらかを人が直してから移す）`);
	parts.status = sv ?? sa ?? "draft";

	//  ---- 組み立てて、読み戻す
	const text = renderOverview(parts);
	const back = readOverview(text);
	for (const p of back.problems) errs.push(`組み立てた概要を読めない（${p.line} 行目: ${p.msg}）`);
	const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
	if (!same(back.kpis.map((k) => Object.values(k.cells)), parts.kpis)) errs.push("組み立てた概要の KPI の表が、元と違う");
	if (!same(back.actors.map((a) => Object.values(a.cells)), parts.actors)) errs.push("組み立てた概要のアクターの表が、元と違う");
	const pick = (g) => [g.id, g.sentence, g.actor, g.origin, g.status, g.note, g.domain ?? ""];
	if (!same(back.goals.map(pick), parts.goals.map(pick))) errs.push("組み立てた概要の GOAL の表が、元と違う（セルの中の | や改行を確かめる）");

	if (errs.length) {
		for (const e of errs) console.log(`  err  ${e}`);
		console.log(`${TAG} 移せないものが ${errs.length} 件ある。どのファイルも書き換えていない`);
		printConfig(config);
		return 1;
	}
	const removed = [...olds, ...goalFiles];
	const refs = referencesToFix(root, docsDir, new Set([...removed, overviewFile]));
	//  移した本文の中に残る古い名前（「閉じたアクターの集合は 02-actors.md」など）も、手で直す箇所に出す
	text.split("\n").forEach((l, i) => {
		if (/00-vision\.md|02-actors\.md|goals-backlog\.md|GOAL\.md/.test(l)) refs.push(`${rel(overviewFile)}:${i + 1}（移した本文）`);
	});
	for (const n of notes) console.log(`  note ${n}`);
	const summary = `GOAL ${parts.goals.length} 行（planned ${parts.goals.filter((g) => g.status === "planned").length}）、KPI ${parts.kpis.length} 行、アクター ${parts.actors.length} 行。概要の status は ${parts.status}（vision: ${status.vision ?? "なし"}、アクター表: ${status.actors ?? "なし"}）`;
	if (opts.write) {
		writeFileSync(overviewFile, text);
		for (const f of removed) rmSync(f);
		console.log(`${TAG} 移した: ${rel(overviewFile)} を書き、${removed.map(rel).join(", ")} を消した。${summary}`);
	} else console.log(`${TAG} 移せる: ${rel(overviewFile)} を作り、${removed.length} 件の文書を消す（--write で書き換える）。${summary}`);
	if (refs.length) {
		console.log(`${TAG} 古い文書の名前を書いている箇所（手で直す。ADR は過去の記録なのでそのまま）:`);
		for (const r of refs) console.log(`  ref  ${r}`);
	}
	printConfig(config);
	return 0;
}

//  本文の先頭の「# <題>」を除く
const stripTitle = (head, title) => head.replace(new RegExp(`^\\s*# ${title}[^\\n]*\\n?`), "").replace(/^\s*# [^\n]*\n?/, "");

//  GOAL.md から GOAL の行を作る。読めなければ fail を呼んで null
function goalFromFile(file, fail) {
	const text = readText(file);
	const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
	if (!m) {
		fail("frontmatter が無い");
		return null;
	}
	const g = { id: "", actor: "", origin: "", status: "", note: "", domain: "" };
	const notes = [];
	for (const line of m[1].split("\n")) {
		if (!line.trim()) continue;
		const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
		if (!kv) {
			fail(`frontmatter の行を読めない: ${line}`);
			return null;
		}
		const c = /^(.*?)\s+#\s*(.*)$/.exec(kv[2]);
		let value = (c ? c[1] : kv[2]).trim();
		if (c && kv[1] === "status") {
			const guide = STATUS_GUIDANCE.find((x) => c[2].startsWith(x));
			let rest = (guide === undefined ? c[2] : c[2].slice(guide.length)).replace(/^[\s。．.、,]+/, "").trim();
			if (guide?.endsWith("。")) rest = rest.replace(/）$/, "");
			if (rest) notes.push(rest);
		} else if (c && !(kv[1] === "domain" && isGuidanceComment(c[2]))) {
			fail(`${kv[1]} の行末にコメントがある（行に移せない）: ${line}`);
			return null;
		}
		if (kv[1] === "domain" && /^<.*>$/.test(value)) value = "";
		if (!(kv[1] in g) || kv[1] === "note") {
			fail(`GOAL の行に移せない項目「${kv[1]}」がある`);
			return null;
		}
		g[kv[1]] = value;
	}
	let body = dropGuidance(m[2]).replace(new RegExp(`^\\s*# ${g.id}[ \\t]*\\n`), "");
	if (/<!--/.test(body)) {
		fail("案内でない HTML コメントがある（行に移せない。本文に書くか消してから移す）");
		return null;
	}
	const paras = trimBlock(body).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
	const quotes = paras.filter((p) => p.split("\n").every((l) => l.startsWith(">")));
	const others = paras.filter((p) => !quotes.includes(p));
	if (quotes.length !== 1) {
		fail(`目指す状態の段落（> で始まる）が ${quotes.length} つある（1 つにしてから移す）`);
		return null;
	}
	if (others.length > (g.status === "withdrawn" ? 1 : 0)) {
		fail(`目指す状態のほかに段落がある（${g.status === "withdrawn" ? "撤回の理由の 1 段落のほか" : "備考に移せるのは status の後ろの文と、撤回の理由の 1 段落だけ"}）: ${others[0].slice(0, 40)}`);
		return null;
	}
	if (others.length) notes.push(others[0].replace(/\s*\n\s*/g, " "));
	g.sentence = quotes[0].split("\n").map((l) => l.replace(/^>\s?/, "").trim()).join(" ").trim();
	g.note = notes.join(" ");
	return g;
}

//  バックログの ### GOAL-nn の塊から planned の行を作る
function goalsFromBacklog(body, fail) {
	const out = [];
	let cur = null;
	let quote = null;
	const lines = dropGuidance(body).split("\n");
	for (const raw of lines) {
		const line = raw.trimEnd();
		const h = /^###\s+(GOAL-\d+)\s*$/.exec(line);
		if (h) {
			cur = { id: h[1], actor: "", origin: "", status: "", note: "", domain: "", sentence: "" };
			out.push(cur);
			quote = null;
			continue;
		}
		if (!cur) {
			if (!line.trim() || /^# /.test(line) || EMPTY_BACKLOG_RE.test(line.trim())) continue;
			fail(`最初の ### GOAL-nn より前に、移せない行がある: ${line.trim().slice(0, 40)}`);
			continue;
		}
		if (!line.trim()) {
			if (quote !== null) quote = "done";
			continue;
		}
		const attr = /^-\s+\*\*(actor|由来|ドメイン|status)\*\*:\s*(.*)$/.exec(line);
		if (attr && quote === null) {
			const key = { actor: "actor", 由来: "origin", ドメイン: "domain", status: "status" }[attr[1]];
			let v = attr[2].trim();
			const c = /^(.*?)\s*<!--([\s\S]*?)-->\s*$/.exec(v);
			if (c && isGuidanceComment(c[2])) v = c[1].trim();
			if (key === "domain" && /^<.*>$/.test(v)) v = "";
			cur[key] = v;
			continue;
		}
		if (line.startsWith(">") && quote !== "done") {
			const t = line.replace(/^>\s?/, "").trim();
			cur.sentence = cur.sentence ? `${cur.sentence} ${t}` : t;
			quote = "open";
			continue;
		}
		fail(`${cur.id} の塊に、定形の外の行がある（備考にするか消してから移す）: ${line.trim().slice(0, 40)}`);
	}
	for (const g of out) {
		//  未着手（planned）か、着手せずに撤回したもの（withdrawn。フォルダを持たない行になる）
		if (g.status !== "planned" && g.status !== "withdrawn") fail(`${g.id} の status が planned でも withdrawn でもない（実際: ${g.status || "なし"}）`);
		if (!g.sentence) fail(`${g.id} に目指す状態（> の 1 文）が無い`);
	}
	return out;
}

//  docs と、プロジェクトの CLAUDE.md・AGENTS.md の中で、古い文書の名前を書いている箇所（ADR と消すファイルは除く）
function referencesToFix(root, docsDir, skip) {
	const out = [];
	const re = /00-vision\.md|02-actors\.md|goals-backlog\.md|GOAL\.md/;
	const visit = (f) => {
		if (skip.has(f) || !f.endsWith(".md")) return;
		readText(f)
			.split("\n")
			.forEach((l, i) => {
				if (re.test(l)) out.push(`${relative(root, f).split("\\").join("/")}:${i + 1}`);
			});
	};
	const walk = (d) => {
		if (!existsSync(d)) return;
		for (const e of readdirSync(d, { withFileTypes: true })) {
			const p = join(d, e.name);
			if (e.isDirectory()) {
				if (e.name !== "adr" && e.name !== "node_modules" && !e.name.startsWith(".")) walk(p);
			} else visit(p);
		}
	};
	walk(docsDir);
	for (const n of ["CLAUDE.md", "AGENTS.md"]) if (existsSync(join(root, n))) visit(join(root, n));
	return out;
}

//  設定の docs に入れる変更の案（設定は書かない）
function configAdvice(docs, files, has, ovRel) {
	const v = docs.vision;
	const a = docs.actors;
	const lines = [];
	const present = ["vision", "actors", "goals_backlog"].filter((k) => k in docs);
	if (!present.length && "overview" in docs) return [];
	let value;
	if ((typeof v === "string" && has(files.vision)) || (typeof a === "string" && has(files.actors))) value = `"overview": "${ovRel}"`;
	else if (isNone(v) && isNone(a)) value = `"overview": { "none": ${JSON.stringify(v.none)} }`;
	else if (isNone(v) || isNone(a)) value = `"overview" は人が決める（推奨: { "none": ${JSON.stringify((isNone(v) ? v : a).none)} }。vision とアクター表の片方が none で、もう片方はパスだがファイルが無い）`;
	else value = `"overview": "${ovRel}"`;
	lines.push(`docs に ${value} を足す`);
	if (present.length) lines.push(`docs から ${present.map((k) => `"${k}"`).join("・")} を消す（廃止したキー。lint config K6）`);
	return lines;
}

function printConfig(lines) {
	if (!lines.length) return;
	console.log(`${TAG} harness.config.json に入れる変更の案（設定は書き換えていない。人間の承認で入れる / ADR-0057）:`);
	for (const l of lines) console.log(`  cfg  ${l}`);
}

process.exitCode = main();
