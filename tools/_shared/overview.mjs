//  1 枚の概要（docs/00-overview.md）の読み方（共有。lint spec / lint refs / guard / next-id / index / migrate overview が使う）
//
//  概要は、課題・成功の定義（KPI の表）・アクターの表・GOAL の表・全体の方針・やらないことを 1 つの文書に持つ（ADR-0076）。
//  GOAL の ID は GOAL の表の行で定義する。未着手（planned）・着手済み・撤回済みの GOAL が同じ表に並ぶ。
//  節の名前、表の列（必須の列と任意の列）、方針の小節の見出しは、ひな形 templates/develop/00-overview.md から導く。
//  閉じた語彙（ファイルの status と、GOAL の行の status）は実行コードでしか強制できないので、ここに置く。
//
//  ここでは、表を列の見出しの名前で読み、検査ツールが使う形（KPI・アクター・GOAL の行、方針の本文）に組み立てる。
//  読めない書き方（列の見出しの誤り、ID の形の誤り、同じ ID の行、列の数の食い違い）は problems に入れる。

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter } from "./frontmatter.mjs";

export const OVERVIEW_TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "templates", "develop", "00-overview.md");
export const OVERVIEW_FILE = "00-overview.md";
export const OVERVIEW_ID = "OVERVIEW";
//  閉じた語彙
export const OVERVIEW_STATUS = ["draft", "living"];
export const GOAL_ROW_STATUS = ["planned", "draft", "active", "withdrawn"];
//  概要に移した文書（ADR-0076）。残っていれば lint spec と lint refs C9 が違反にし、harness migrate overview を案内する
export const RETIRED_DOCS = ["00-vision.md", "02-actors.md", "goals-backlog.md"];
export const MIGRATE_HINT = "harness migrate overview --write で 00-overview.md へ移す（ADR-0076）";

//  節の役目（どの節の表を何として読むか）。節の名前と列はひな形から導き、ここは役目と節の先頭語の対応だけを持つ
const ROLE_SECTION = { kpis: "成功の定義", actors: "アクター", goals: "GOAL", policies: "全体の方針" };
//  検査が意味を読む列（ひな形の列の見出しと同じ名前。ひな形との一致はテストで固定する）
export const COL = { id: "ID", kind: "種別", sentence: "目指す状態", actor: "アクター", kpi: "KPI", status: "status", note: "備考", domain: "ドメイン" };
//  方針の小節の本文が、ひな形の「（未記入: …）」のままなら未記入
const UNFILLED_RE = /^（未記入/;

const sectionKey = (title) => title.split(/[\s（(]/)[0];
const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, "");

//  表の 1 行をセルに分ける（\| はセルの中の | として読む）。戻り: 前後の | を除いたセルの配列（前後の空白は除く）
export function splitRow(line) {
	const t = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
	return t.split(/(?<!\\)\|/).map((c) => c.trim());
}
const isRule = (cells) => cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
export const unescapeCell = (c) => c.replace(/\\\|/g, "|");
//  カンマ区切りの値（アクター・KPI の欄）
export const values = (s) => (s ?? "").split(/[,、]/).map((x) => x.trim()).filter(Boolean);

//  本文を ## の節に分ける。節ごとに { title, key, line（見出しの行番号、1 始まり）, lines: [{ text, line }] }。コードの囲みの中は見出しにしない
function sectionsOf(text, bodyStart) {
	const secs = [];
	let cur = null;
	let fence = false;
	text.split(/\r?\n/).forEach((t, i) => {
		const line = bodyStart + i + 1;
		if (/^(```|~~~)/.test(t)) fence = !fence;
		const m = fence ? null : /^##\s+(.*)$/.exec(t);
		if (m) secs.push((cur = { title: m[1].trim(), key: sectionKey(m[1].trim()), line, lines: [] }));
		else if (cur) cur.lines.push({ text: t, line });
	});
	return secs;
}

//  節の中の最初の表と、その直前の「<!-- 任意の列: A, B -->」。戻り: { header, optional, rows: [{ cells, line }] } | null
function tableOf(sec) {
	let optional = [];
	let header = null;
	const rows = [];
	for (const { text, line } of sec.lines) {
		const t = text.trim();
		const opt = /^<!--\s*任意の列:\s*(.*?)\s*-->$/.exec(t);
		if (!header && opt) {
			optional = values(opt[1]);
			continue;
		}
		if (!t.startsWith("|")) {
			if (header) break;
			continue;
		}
		const cells = splitRow(t);
		if (!header) header = cells;
		else if (!isRule(cells)) rows.push({ cells, line });
	}
	return header ? { header, optional, rows } : null;
}

//  方針の小節（### 見出し → 本文）。本文は HTML コメントを除いて前後の空白を落としたもの
function subsectionsOf(sec) {
	const out = [];
	let cur = null;
	for (const { text, line } of sec.lines) {
		const m = /^###\s+(.*)$/.exec(text);
		if (m) out.push((cur = { title: m[1].trim(), line, body: [] }));
		else if (cur) cur.body.push(text);
	}
	return out.map((s) => ({ title: s.title, line: s.line, text: stripComments(s.body.join("\n")).trim() }));
}

let cached = null;
//  ひな形から導く書式: { sections: [節の先頭語], columns: { kpis|actors|goals: { required, optional } }, policies: [見出し], frontmatter: [キー] }
export function overviewFormat() {
	if (cached) return cached;
	const text = readFileSync(OVERVIEW_TEMPLATE, "utf8");
	const fm = parseFrontmatter(text);
	const bodyStart = text.split(/\r?\n/).length - fm.body.split(/\r?\n/).length;
	const secs = sectionsOf(fm.body, bodyStart);
	const columns = {};
	for (const role of ["kpis", "actors", "goals"]) {
		const t = tableOf(secs.find((s) => s.key === ROLE_SECTION[role]));
		columns[role] = { required: t.header.filter((h) => !t.optional.includes(h)), optional: t.optional };
	}
	const pol = secs.find((s) => s.key === ROLE_SECTION.policies);
	cached = {
		sections: secs.map((s) => s.key),
		columns,
		policies: subsectionsOf(pol).map((s) => s.title),
		frontmatter: fm.raw.map((l) => /^([^:#\s]+):/.exec(l)?.[1]).filter(Boolean),
	};
	return cached;
}

//  方針の本文が埋まっているか（空でも「（未記入: …）」のままでもない）
export const policyFilled = (text) => !!text && !UNFILLED_RE.test(text);

//  概要の文書を読む。
//  戻り: { fm, status, kpis: [{ id, cells, line }], actors: [{ id, name, kind, cells, line }],
//          goals: [{ id, sentence, actor, origin, status, note, domain, line }], policies: { 見出し: 本文 }, policyLines: { 見出し: 行 },
//          sections: [節の先頭語], problems: [{ line, msg }] }
//  cells は見出しの名前 → セルの文字列（\| は | に戻す）
export function readOverview(text) {
	const fmt = overviewFormat();
	const fm = parseFrontmatter(text);
	const bodyStart = text.split(/\r?\n/).length - fm.body.split(/\r?\n/).length;
	const secs = sectionsOf(fm.body, bodyStart);
	const problems = [];
	const out = { fm: fm.data, status: fm.data.status || null, kpis: [], actors: [], goals: [], policies: {}, policyLines: {}, sections: secs.map((s) => s.key), problems };

	const readTable = (role, idRe, label) => {
		const form = idRe.source.replace(/^\^|\\d\+\$$/g, "") + "nn";
		const sec = secs.find((s) => s.key === ROLE_SECTION[role]);
		if (!sec) return [];
		const t = tableOf(sec);
		if (!t) return [];
		const { required, optional } = fmt.columns[role];
		const missing = required.filter((h) => !t.header.includes(h));
		const unknown = t.header.filter((h) => !required.includes(h) && !optional.includes(h));
		if (missing.length || unknown.length) {
			problems.push({
				line: sec.line,
				msg: `「${sec.title}」の表の列の見出しがひな形と違う（必須: ${required.join(" / ")}${optional.length ? `。任意: ${optional.join(" / ")}` : ""}。${missing.length ? `無い列: ${missing.join(", ")}` : ""}${missing.length && unknown.length ? "。" : ""}${unknown.length ? `知らない列: ${unknown.join(", ")}` : ""}）`,
			});
			if (missing.includes(COL.id)) return [];
		}
		const seen = new Map();
		const rows = [];
		for (const r of t.rows) {
			if (r.cells.length !== t.header.length) {
				problems.push({ line: r.line, msg: `${label}の表の行の列の数（${r.cells.length}）が見出し（${t.header.length}）と違う（セルの中の | は \\| と書く）` });
				continue;
			}
			const cells = Object.fromEntries(t.header.map((h, i) => [h, unescapeCell(r.cells[i])]));
			const id = cells[COL.id];
			if (!idRe.test(id)) {
				problems.push({ line: r.line, msg: `${label}の表の ID は ${form} の形にする（実際: "${id}"）` });
				continue;
			}
			if (seen.has(id)) {
				problems.push({ line: r.line, msg: `${id} の行が 2 つある（${seen.get(id)} 行目と。ID はこの表で 1 つ）` });
				continue;
			}
			seen.set(id, r.line);
			rows.push({ id, cells, line: r.line });
		}
		return rows;
	};

	out.kpis = readTable("kpis", /^KPI-\d+$/, "成功の定義");
	out.actors = readTable("actors", /^ACT-\d+$/, "アクター").map((r) => ({ ...r, name: r.cells[COL.actor] ?? "", kind: r.cells[COL.kind] ?? "" }));
	out.goals = readTable("goals", /^GOAL-\d+$/, "GOAL").map((r) => ({
		id: r.id,
		sentence: r.cells[COL.sentence] ?? "",
		actor: r.cells[COL.actor] ?? "",
		origin: r.cells[COL.kpi] ?? "",
		status: r.cells[COL.status] ?? "",
		note: r.cells[COL.note] ?? "",
		domain: r.cells[COL.domain] ?? "",
		line: r.line,
	}));
	const pol = secs.find((s) => s.key === ROLE_SECTION.policies);
	if (pol)
		for (const s of subsectionsOf(pol)) {
			if (!fmt.policies.includes(s.title)) {
				problems.push({ line: s.line, msg: `全体の方針の小節「${s.title}」はひな形に無い（見出しは ${fmt.policies.join(" / ")} のどれか）` });
				continue;
			}
			out.policies[s.title] = s.text;
			out.policyLines[s.title] = s.line;
		}
	return out;
}

//  概要のファイルを読む（無ければ null）
export function readOverviewFile(file) {
	if (!file || !existsSync(file)) return null;
	return readOverview(readFileSync(file, "utf8"));
}

//  全体の方針の 3 つの小節がすべて埋まっていて、概要が living か（UC の並行性・外部依存の行を省けるか）
export function policiesInForce(ov) {
	if (!ov || ov.status !== "living") return false;
	return overviewFormat().policies.every((h) => policyFilled(ov.policies[h]));
}

//  アクターの種別（ACT-nn -> 種別）
export const actorKindsOf = (ov) => Object.fromEntries((ov?.actors ?? []).map((a) => [a.id, a.kind]));

//  ---- 書き出し（harness migrate overview とテストの部品が使う） ----

export const escapeCell = (s) => String(s ?? "").replace(/\r?\n/g, " ").replace(/(?<!\\)\|/g, "\\|").trim();
export const UNFILLED_POLICY = "（未記入: 未記入の間は、UC の並行性・外部依存の行を省けない）";

//  概要の文書を組み立てる。列の見出しと方針の見出しはひな形から取る。
//  parts: { status, problem, kpis: [[ID, 指標, 現状, 目標]], kpiProse, actorsProse, actors: [[ID, アクター, 種別, 説明]], actorsAfter,
//           goals: [{ id, sentence, actor, origin, status, note, domain }], policies: { 見出し: 本文 }, outOfScope, extra: [{ title, body }] }
//  extra は、ひな形に無い ## 節（元の順で末尾に置く）
export function renderOverview(parts) {
	const fmt = overviewFormat();
	const table = (header, rows) => [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...rows.map((r) => `| ${r.map(escapeCell).join(" | ")} |`.replace(/ {2,}\|/g, " |"))].join("\n");
	const block = (...xs) => xs.filter((x) => x !== undefined && x !== null && String(x).trim() !== "").join("\n\n");
	const goals = parts.goals ?? [];
	const withDomain = goals.some((g) => g.domain);
	const gHeader = [...fmt.columns.goals.required, ...(withDomain ? [COL.domain] : [])];
	const gRows = goals.map((g) => gHeader.map((h) => ({ [COL.id]: g.id, [COL.sentence]: g.sentence, [COL.actor]: g.actor, [COL.kpi]: g.origin, [COL.status]: g.status, [COL.note]: g.note, [COL.domain]: g.domain })[h] ?? ""));
	const out = [
		`---\nid: ${OVERVIEW_ID}\nstatus: ${parts.status ?? "draft"}\n---`,
		"# 概要",
		block("## 解決する課題", parts.problem),
		block("## 成功の定義", table(fmt.columns.kpis.required, parts.kpis ?? []), parts.kpiProse),
		block("## アクター（この表は閉じている）", parts.actorsProse, table(fmt.columns.actors.required, parts.actors ?? []), parts.actorsAfter),
		block("## GOAL", withDomain ? `<!-- 任意の列: ${COL.domain} -->` : null, table(gHeader, gRows)),
		block("## 全体の方針", ...fmt.policies.map((h) => `### ${h}\n\n${(parts.policies ?? {})[h] || UNFILLED_POLICY}`)),
		block("## やらないこと（Out of Scope）", parts.outOfScope),
		...(parts.extra ?? []).map((x) => block(`## ${x.title}`, x.body)),
	];
	return out.join("\n\n") + "\n";
}

//  ---- 置き場 ----

//  概要の場所は 1 つに固定する: <docs>/00-overview.md（docs は --docs のフォルダか、設定の docs.goals_dir の親）。
//  設定の docs.overview に書けるのは、そのパスか理由付きの none だけ（lint spec・lint refs・guard が別のファイルを読まないように）。
//  戻り: { file: 絶対パス | null（none）, declared: 設定に書いた値, error: 文 | null }
export function overviewPathOf({ docsDir = null, hostRoot = null, cfg = null } = {}) {
	const docs = cfg && typeof cfg === "object" ? cfg.docs : null;
	const goalsDir = docs && typeof docs.goals_dir === "string" && docs.goals_dir.trim() && hostRoot ? resolve(hostRoot, docs.goals_dir) : null;
	const base = docsDir ? resolve(docsDir) : goalsDir ? dirname(goalsDir) : null;
	const expected = base ? join(base, OVERVIEW_FILE) : null;
	const v = docs && typeof docs === "object" ? docs.overview : undefined;
	if (v !== null && typeof v === "object" && !Array.isArray(v) && "none" in v) return { file: null, declared: v, error: null };
	if (typeof v === "string" && hostRoot && expected && resolve(hostRoot, v) !== expected)
		return {
			file: null,
			declared: v,
			error: `docs.overview は ${relative(hostRoot, expected).split("\\").join("/")}（docs のフォルダ直下の ${OVERVIEW_FILE}）か、理由付きの none にする（実際: ${v}。概要の置き場は 1 つに固定する / ADR-0076）`,
		};
	return { file: expected, declared: v, error: null };
}

//  概要に移した古い文書を、名前と frontmatter の id で見つける（ADR-0076）。docsDir の下の md を走査する。
//  戻り: [{ file, why }]（GOAL.md は、名前が GOAL.md か、id が GOAL-nn のときに数える）
export const RETIRED_IDS = { VISION: "00-vision.md", ACTORS: "02-actors.md", GOALS_BACKLOG: "goals-backlog.md" };
export function retiredDocsIn(docsDir) {
	const out = [];
	const walkMd = (dir) => {
		if (!existsSync(dir)) return;
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			if (e.name === "node_modules" || e.name === ".git") continue;
			const p = join(dir, e.name);
			if (e.isDirectory()) walkMd(p);
			else if (e.isFile() && e.name.endsWith(".md")) {
				let id = "";
				try {
					id = parseFrontmatter(readFileSync(p, "utf8")).data.id || "";
				} catch {}
				const atTop = dirname(p) === resolve(docsDir);
				if (id in RETIRED_IDS) out.push({ file: p, why: `id ${id}（${RETIRED_IDS[id]}）` });
				else if (atTop && RETIRED_DOCS.includes(e.name)) out.push({ file: p, why: e.name });
				else if (e.name === "GOAL.md" || (/^GOAL-\d+$/.test(id) && e.name !== OVERVIEW_FILE)) out.push({ file: p, why: e.name === "GOAL.md" ? "GOAL.md" : `id ${id}` });
			}
		}
	};
	walkMd(resolve(docsDir));
	return out.sort((a, b) => a.file.localeCompare(b.file));
}
