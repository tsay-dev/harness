//  テストの支援: 入力として置いた REQ-nnn.md を、UC.md の「要件」の節の小節に畳む。
//
//  検査ツールのテストは、REQ を 1 つずつ書き換えながら状態を作る。入力を書く側は REQ を 1 ファイルで書き、
//  ツールを実行する直前にここで UC.md に畳む（ADR-0067 の形にする）。本物の移行（tools/docs-migrate/merge-reqs.mjs）と違い、
//  形の誤った REQ（項目の欠け、知らない項目、見出しの欠けなど）も、誤りを残したまま畳む（誤りを検査が見つけることを確かめるため）。
//  同じ ID の小節がすでにあれば置き換える。UC.md が無い場所の REQ-nnn.md は、そのまま残す。
import { existsSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function walk(dir, out = []) {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		if (e.name === ".git" || e.name === "node_modules") continue;
		const p = join(dir, e.name);
		if (e.isDirectory()) walk(p, out);
		else if (/^REQ-\d+\.md$/.test(e.name)) out.push(p);
	}
	return out;
}

function shift(body) {
	let inFence = false;
	return body
		.split("\n")
		.map((line) => {
			if (/^(```|~~~)/.test(line)) inFence = !inFence;
			const m = inFence ? null : /^(#{1,4}) (.*)$/.exec(line);
			return m ? `${"#".repeat(m[1].length + 2)} ${m[2]}` : line;
		})
		.join("\n");
}

function sectionOf(file) {
	const text = readFileSync(file, "utf8");
	const stem = file.match(/(REQ-\d+)\.md$/)[1];
	const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
	const attrs = [];
	let body = text;
	if (m) {
		for (const line of m[1].split(/\r?\n/)) {
			const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line);
			if (kv && kv[1] !== "id" && kv[1] !== "uc") attrs.push(`- ${kv[1]}: ${kv[2]}`);
		}
		body = m[2];
	}
	body = shift(body.replace(/^\s*# REQ-\d+[^\n]*\n/, "")).replace(/^\n+/, "").replace(/\s+$/, "");
	return { id: stem, section: `### ${stem}\n\n${attrs.join("\n")}${attrs.length ? "\n\n" : ""}${body}\n` };
}

export function foldReqFiles(root) {
	if (!existsSync(root) || !statSync(root).isDirectory()) return;
	const byUc = new Map();
	for (const f of walk(root)) {
		const ucFile = join(f, "..", "UC.md");
		if (!existsSync(ucFile)) continue;
		if (!byUc.has(ucFile)) byUc.set(ucFile, []);
		byUc.get(ucFile).push(f);
	}
	for (const [ucFile, files] of byUc) {
		let text = readFileSync(ucFile, "utf8").replace(/\s+$/, "") + "\n";
		if (!/^## 要件\s*$/m.test(text)) text += "\n## 要件\n";
		for (const f of files.sort((a, b) => Number(a.match(/REQ-(\d+)\.md$/)[1]) - Number(b.match(/REQ-(\d+)\.md$/)[1]))) {
			const { id, section } = sectionOf(f);
			const re = new RegExp(`\\n### ${id}\\n[\\s\\S]*?(?=\\n### REQ-\\d+\\n|$)`);
			text = re.test(text) ? text.replace(re, `\n${section.replace(/\s+$/, "")}\n`) : `${text.replace(/\s+$/, "")}\n\n${section}`;
			rmSync(f);
		}
		writeFileSync(ucFile, text);
	}
}
