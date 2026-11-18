//  UC の文書（UC.md）の「要件」の節に書かれた REQ の読み書き（共有）
//
//  REQ は、UC.md の `## 要件` の節の中に、1 つを 1 つの小節として書く（ADR-0067）。
//
//    ## 要件
//
//    ### REQ-158
//
//    - pattern: Event-driven
//    - br: BR-016
//    - status: active
//
//    > 〈EARS の 1 文〉
//
//    #### 検証方針
//
//    - **分割クラス**: …
//
//  小節の見出しは `### REQ-nnn` だけ。直後の `- キー: 値` の並びが REQ の項目（pattern / br / status）。
//  どの UC の要件かは、書かれている UC.md で決まるので、項目には書かない。
//
//  検査ツール（lint spec / lint refs / guard）は、REQ を「id・pattern・uc・br・status の frontmatter と、
//  `# REQ-nnn` で始まる本文」を持つ 1 つの文書として検査する。ここでは、小節からその形の文書（reqDoc）を組み立てる。
//  小節の中の見出しは 2 段浅くする（`#### 検証方針` → `## 検証方針`）。

import { parseFrontmatter } from "./frontmatter.mjs";

export const REQS_HEADING = "要件";
const REQ_HEADING_RE = /^### (REQ-\d+)\s*$/;
const ATTR_RE = /^- ([a-z_]+):\s*(.*)$/;
//  小節の項目として書けるキー（書く順）
export const REQ_ATTRS = ["pattern", "br", "status", "note"];
//  note は、状態についての補足（撤回した理由など）を 1 行で書く任意の項目

//  項目の値。行末の「 # …」は案内のコメントとして読まない（frontmatter の読み方と同じ。tools/_shared/frontmatter.mjs）
const valueOf = (raw) => parseFrontmatter(`---\nv: ${raw}\n---\n`).data.v ?? "";

//  UC.md の本文を、UC 自身の部分と REQ の小節に分ける。
//  戻り: { ucText: 「要件」の節を見出しごと除いた UC.md, reqs: [{ id, line, attrs, body }], problems: [{ line, msg }] }
//    line は UC.md の中の行番号（1 始まり）。attrs は書かれた順の [キー, 値]。body は項目の並びの後から小節の終わりまで
export function splitUc(text) {
	const lines = text.split(/\r?\n/);
	const problems = [];
	let start = -1;
	let end = lines.length;
	let inFence = false;
	for (let i = 0; i < lines.length; i++) {
		if (/^(```|~~~)/.test(lines[i])) inFence = !inFence;
		if (inFence) continue;
		if (start < 0) {
			if (new RegExp(`^## ${REQS_HEADING}\\s*$`).test(lines[i])) start = i;
		} else if (/^## \S/.test(lines[i]) || /^# \S/.test(lines[i])) {
			end = i;
			break;
		}
	}
	if (start < 0) return { ucText: text, reqs: [], problems, hasSection: false };

	const reqs = [];
	let cur = null;
	let commentOpen = false;
	inFence = false;
	for (let i = start + 1; i < end; i++) {
		const line = lines[i];
		if (/^(```|~~~)/.test(line)) inFence = !inFence;
		//  小節の前の案内の HTML コメントの中は、見出しとして読まない
		const m = inFence || (!cur && commentOpen) ? null : REQ_HEADING_RE.exec(line);
		if (m) {
			cur = { id: m[1], line: i + 1, attrs: [], bodyLines: [], inAttrs: true };
			reqs.push(cur);
			continue;
		}
		if (!cur) {
			//  小節の前には、案内の HTML コメントだけを置ける
			const wasInComment = commentOpen;
			if (line.includes("<!--")) commentOpen = line.lastIndexOf("<!--") > line.lastIndexOf("-->");
			else if (commentOpen && line.includes("-->")) commentOpen = false;
			if (line.trim() && !wasInComment && !/^<!--/.test(line.trim()))
				problems.push({ line: i + 1, msg: `「${REQS_HEADING}」の節には、### REQ-nnn の小節だけを書く（小節の外の行: ${line.trim().slice(0, 30)}）` });
			continue;
		}
		if (!inFence && /^### /.test(line)) {
			problems.push({ line: i + 1, msg: `「${REQS_HEADING}」の節の小節の見出しは「### REQ-nnn」だけ（実際: ${line.trim()}）` });
			cur = null;
			continue;
		}
		if (cur.inAttrs) {
			if (!line.trim() && cur.attrs.length === 0) continue; //  見出しの直後の空行
			const a = ATTR_RE.exec(line);
			if (a) {
				cur.attrs.push([a[1], a[2].trim()]);
				continue;
			}
			cur.inAttrs = false;
		}
		cur.bodyLines.push(line);
	}
	//  UC 自身の部分は、「要件」の節を見出しごと除いたもの
	const ucText = [...lines.slice(0, start), ...lines.slice(end)].join("\n");
	//  節の外に書いた REQ の小節と、2 つ目の「要件」の節は、どの検査にも掛からなくなるので問題にする
	inFence = false;
	for (let i = 0; i < lines.length; i++) {
		if (/^(```|~~~)/.test(lines[i])) inFence = !inFence;
		if (inFence || (i >= start && i < end)) continue;
		if (REQ_HEADING_RE.test(lines[i])) problems.push({ line: i + 1, msg: `${lines[i].trim()} が「${REQS_HEADING}」の節の外にある（REQ の小節は「## ${REQS_HEADING}」の節の中に書く）` });
		else if (new RegExp(`^## ${REQS_HEADING}\\s*$`).test(lines[i])) problems.push({ line: i + 1, msg: `「## ${REQS_HEADING}」の節が 2 つある（1 つにまとめる）` });
	}
	return {
		ucText,
		hasSection: true,
		problems,
		reqs: reqs.map((r) => ({ id: r.id, line: r.line, attrs: r.attrs, body: r.bodyLines.join("\n").replace(/^\n+/, "").replace(/\s+$/, "") })),
	};
}

//  見出しを n 段ずらす（コードの囲みの中は触らない）。浅くしすぎる（# を超える）見出しはそのまま
function shiftHeadings(body, n) {
	let inFence = false;
	return body
		.split("\n")
		.map((line) => {
			if (/^(```|~~~)/.test(line)) inFence = !inFence;
			if (inFence) return line;
			const m = /^(#{1,6}) (.*)$/.exec(line);
			if (!m) return line;
			const level = m[1].length + n;
			return level >= 1 && level <= 6 ? `${"#".repeat(level)} ${m[2]}` : line;
		})
		.join("\n");
}

//  小節から、検査ツールが読む形の REQ の文書を組み立てる（frontmatter + `# REQ-nnn` + 本文）
export function reqDocText(req, ucId) {
	const fm = [`id: ${req.id}`];
	const attrs = new Map(req.attrs);
	if (attrs.has("pattern")) fm.push(`pattern: ${attrs.get("pattern")}`);
	fm.push(`uc: ${ucId ?? ""}`);
	for (const [k, v] of req.attrs) if (k !== "pattern") fm.push(`${k}: ${v}`);
	return `---\n${fm.join("\n")}\n---\n\n# ${req.id}\n\n${shiftHeadings(req.body, -2)}\n`;
}

//  UC.md から、REQ の文書の一覧を作る。
//  戻り: { ucText, problems, hasSection, docs: [{ id, label: "<UC.md のパス>#REQ-nnn", line, text, status }] }
export function reqDocsOf(ucPath, ucText, ucId) {
	const s = splitUc(ucText);
	const seen = new Set();
	const docs = [];
	for (const r of s.reqs) {
		for (const [k] of r.attrs)
			if (!REQ_ATTRS.includes(k)) s.problems.push({ line: r.line, msg: `${r.id}: 項目「${k}」は書けない（書けるのは ${REQ_ATTRS.join(" / ")}。どの UC の要件かは、書かれている UC.md で決まる）` });
		const keys = r.attrs.map(([k]) => k);
		for (const k of new Set(keys)) if (keys.filter((x) => x === k).length > 1) s.problems.push({ line: r.line, msg: `${r.id}: 項目「${k}」が重複している` });
		if (seen.has(r.id)) {
			s.problems.push({ line: r.line, msg: `${r.id} の小節が重複している` });
			continue;
		}
		seen.add(r.id);
		//  status は、検査ツールが文書から読む値と同じ読み方で読む（行末の案内のコメントや引用符で、ツールごとに値が割れないように）
		const text = reqDocText(r, ucId);
		docs.push({ id: r.id, label: `${ucPath}#${r.id}`, line: r.line, text, status: parseFrontmatter(text).data.status || null });
	}
	return { ucText: s.ucText, problems: s.problems, hasSection: s.hasSection, docs };
}

//  1 つの REQ の文書（これまでの REQ-nnn.md の形）から、UC.md に書く小節を作る。
//  意味を変えない変換だけを行う: frontmatter の id / uc と `# REQ-nnn` の題は小節の見出しと置き場で表す。
//  落とすのは、ひな形の案内だけ:
//    - status の値の後ろのコメントのうち、statusGuidance に渡した書き出し（案内の文面）に当たる部分
//    - 本文の HTML コメントのうち、guidance に渡した書き出しで始まるもの
//  status の後ろに案内のほかに書かれた文（撤回した理由など）は、項目 note に移す。ほかの項目の行末のコメントは移せない。
//  戻り: { id, uc, section } または { error }
export function sectionFromReqDoc(text, { guidance = [], statusGuidance = [] } = {}) {
	const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
	if (!m) return { error: "frontmatter が無い" };
	const fm = [];
	let note = null;
	for (const line of m[1].split(/\r?\n/)) {
		if (!line.trim()) continue;
		const kv = /^([a-z_]+):\s*(.*)$/.exec(line);
		if (!kv) return { error: `frontmatter の行を読めない: ${line}` };
		const c = /^(.*?)\s+#\s*(.*)$/.exec(kv[2]);
		if (!c) {
			fm.push([kv[1], kv[2].trim()]);
			continue;
		}
		if (kv[1] !== "status") return { error: `${kv[1]} の行末にコメントがある（小節に移せない。コメントを消すか、本文に移してから実行する）: ${line}` };
		fm.push([kv[1], c[1].trim()]);
		const g = statusGuidance.find((x) => c[2].startsWith(x));
		const rest = (g === undefined ? c[2] : c[2].slice(g.length)).replace(/^[\s。．.、,]+/, "").trim();
		if (rest) note = rest;
	}
	const get = (k) => fm.find(([x]) => x === k)?.[1];
	const id = get("id");
	if (!id || !/^REQ-\d+$/.test(id)) return { error: "id が REQ-nnn でない" };
	const unknown = fm.map(([k]) => k).filter((k) => k !== "id" && k !== "uc" && !REQ_ATTRS.includes(k));
	if (unknown.length) return { error: `小節に移せない項目がある: ${unknown.join(", ")}` };
	if (note !== null && get("note") !== undefined) return { error: "status の行末の文と note の両方がある" };
	if (note !== null) fm.push(["note", note]);

	let body = m[2];
	const norm = (s) => s.replace(/\s+/g, " ").trim();
	const known = guidance.map(norm);
	body = body.replace(/<!--([\s\S]*?)-->\n?/g, (all, inner) => (known.some((g) => norm(inner).startsWith(g)) ? "" : all));
	const title = new RegExp(`^\\s*# ${id}[ \\t]*\\r?\\n`);
	if (!title.test(body)) return { error: `本文が「# ${id}」で始まらない` };
	body = shiftHeadings(body.replace(title, "").replace(/\r\n/g, "\n"), 2)
		.replace(/^\n+/, "")
		.replace(/\n{3,}/g, "\n\n")
		.replace(/\s+$/, "");
	if (/^#{1,3} /m.test(stripFences(body))) return { error: "本文に、小節より浅い見出しが残る（# / ## / ###）" };
	const attrs = REQ_ATTRS.filter((k) => get(k) !== undefined && get(k) !== "").map((k) => `- ${k}: ${get(k)}`);
	return { id, uc: get("uc") ?? null, note, section: `### ${id}\n\n${attrs.join("\n")}\n\n${body}\n` };
}

function stripFences(body) {
	let inFence = false;
	return body
		.split("\n")
		.filter((line) => {
			if (/^(```|~~~)/.test(line)) {
				inFence = !inFence;
				return false;
			}
			return !inFence;
		})
		.join("\n");
}
