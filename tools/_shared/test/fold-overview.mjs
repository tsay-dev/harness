//  テストの支援: 入力として置いた古い形の文書（00-vision.md・02-actors.md・GOAL.md）を、1 枚の概要（00-overview.md）に畳む。
//
//  検査ツールのテストは、GOAL をフォルダの GOAL.md、KPI を vision の表、アクターを 02-actors.md の表で書いて状態を作ってきた。
//  入力を書く側はその形のまま書き、ツールを実行する直前にここで概要に畳む（ADR-0076 の形にする。fold-reqs.mjs と同じ考え方）。
//  本物の移行（harness migrate overview）と違い、形の誤りも残したまま畳む。設定の docs.vision / docs.actors / docs.goals_backlog は
//  docs.overview 1 つにする（どちらかがパスなら docs/00-overview.md、両方 none なら vision の none）。
//  docs/00-overview.md がすでにあれば、何もしない。
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter } from "../frontmatter.mjs";
import { renderOverview } from "../overview.mjs";

const rowsOf = (text, re) =>
	text
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter((l) => l.startsWith("|"))
		.map((l) => l.replace(/^\||\|$/g, "").split("|").map((c) => c.trim()))
		.filter((c) => re.test(c[0]));

export function foldOverview(root) {
	const docs = join(root, "docs");
	const ovFile = join(docs, "00-overview.md");
	const cfgFile = join(root, "harness.config.json");
	if (existsSync(cfgFile)) {
		const cfg = JSON.parse(readFileSync(cfgFile, "utf8"));
		if (cfg.docs && ("vision" in cfg.docs || "actors" in cfg.docs)) {
			const { vision, actors } = cfg.docs;
			const isPath = (v) => typeof v === "string";
			if (!("overview" in cfg.docs)) cfg.docs.overview = isPath(vision) || isPath(actors) ? "docs/00-overview.md" : (vision ?? actors);
			delete cfg.docs.vision;
			delete cfg.docs.actors;
			delete cfg.docs.goals_backlog;
			writeFileSync(cfgFile, JSON.stringify(cfg, null, 2) + "\n");
		}
	}
	if (existsSync(ovFile)) return;
	const vFile = join(docs, "00-vision.md");
	const aFile = join(docs, "02-actors.md");
	const goalsDir = join(docs, "goals");
	const goalFiles = existsSync(goalsDir)
		? readdirSync(goalsDir, { withFileTypes: true })
				.filter((d) => d.isDirectory() && existsSync(join(goalsDir, d.name, "GOAL.md")))
				.map((d) => join(goalsDir, d.name, "GOAL.md"))
				.sort()
		: [];
	if (!existsSync(vFile) && !existsSync(aFile) && !goalFiles.length) return;
	const vision = existsSync(vFile) ? readFileSync(vFile, "utf8") : "";
	const actors = existsSync(aFile) ? readFileSync(aFile, "utf8") : "";
	const st = (t) => parseFrontmatter(t).data.status;
	const vs = st(vision) || st(actors) || "living";
	const kpis = rowsOf(vision, /^KPI-\d+/).map((c) => {
		const m = /^(KPI-\d+)\s*(.*)$/.exec(c[0]);
		return [m[1], m[2], c[1] ?? "", c[2] ?? ""];
	});
	const goals = goalFiles.map((f) => {
		const t = readFileSync(f, "utf8");
		const d = parseFrontmatter(t).data;
		const q = /^>\s?(.*)$/m.exec(parseFrontmatter(t).body);
		return { id: d.id, sentence: q ? q[1] : "", actor: d.actor ?? "", origin: d.origin ?? "", status: d.status ?? "", note: d.status === "withdrawn" ? "撤回した" : "", domain: d.domain ?? "" };
	});
	writeFileSync(ovFile, renderOverview({ status: vs === "frozen" ? "living" : vs, problem: "課題", outOfScope: "なし", kpis, actors: rowsOf(actors, /^ACT-\d+$/), goals }));
	for (const f of [vFile, aFile, join(docs, "goals-backlog.md"), ...goalFiles]) if (existsSync(f)) rmSync(f);
}
