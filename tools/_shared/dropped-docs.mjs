//  やめた文書の検出（共有。ADR-0077）
//
//  設計書（<docs>/design.md）と全体の検証方針（<docs>/verification/GLOBAL.md）は置かない。
//  設計の事実は契約・ADR・コードにあり、design.md はその写しで食い違いやすい。
//  GLOBAL.md の中身（プロジェクト全体で検証しない範囲）は概要の全体の方針へ、計測の決めごとは NFR へ移す。
//  中身をどこへ移すかは人が判断するので、移す道具は作らない。残っていれば lint spec と lint refs が違反にする。

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseFrontmatter } from "./frontmatter.mjs";

export const DROPPED_HINT = "中身を概要（00-overview.md）の全体の方針・NFR・ADR へ移して消す（ADR-0077）";

//  docsDir の下のやめた文書。名前（docs 直下の design.md、verification/GLOBAL.md）と、frontmatter の id（VERIFICATION_GLOBAL）で見つける。
//  戻り: [{ file: 絶対パス, why }]
export function droppedDocsIn(docsDir) {
	const root = resolve(docsDir);
	const out = [];
	const seen = new Set();
	const add = (file, why) => {
		if (seen.has(file)) return;
		seen.add(file);
		out.push({ file, why });
	};
	const design = join(root, "design.md");
	if (existsSync(design)) add(design, "設計書（design.md）");
	const global = join(root, "verification", "GLOBAL.md");
	if (existsSync(global)) add(global, "全体の検証方針（verification/GLOBAL.md）");
	const walk = (dir) => {
		if (!existsSync(dir)) return;
		for (const e of readdirSync(dir, { withFileTypes: true })) {
			if (e.name === "node_modules" || e.name === ".git") continue;
			const p = join(dir, e.name);
			if (e.isDirectory()) walk(p);
			else if (e.isFile() && e.name.endsWith(".md")) {
				let id = "";
				try {
					id = parseFrontmatter(readFileSync(p, "utf8")).data.id || "";
				} catch {}
				if (id === "VERIFICATION_GLOBAL") add(p, "全体の検証方針（id VERIFICATION_GLOBAL）");
			}
		}
	};
	walk(root);
	return out.sort((a, b) => a.file.localeCompare(b.file));
}
