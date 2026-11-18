//  lint refs と next-id のテストが共有する、最小の docs（GOAL・UC・REQ・アクター表）の組み立てと、コマンドの起動。
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
//  コマンド（lint-refs・next-id）のファイル
export const toolOf = (command) => join(HERE, "..", "..", command, `${command}.mjs`);
export const TEMPLATE = join(HERE, "..", "..", "..", "templates", "develop", "harness.config.json");

//  検査の対象外にする範囲は、キーを消さずに理由付きの none で宣言する（ADR-0056）
export const NONE = { none: "このテストでは扱わない" };

//  C16–C18 用: BR / REQ / KPI の表を持つ docs（GOAL.md・00-vision.md・02-actors.md は実行の前に 00-overview.md に畳む）。draft と withdrawn、HTML コメント、プレースホルダーは判定の外に置く
export function makeRefRoot() {
	const root = mkdtempSync(join(tmpdir(), "harness lint-refs refs "));
	const cfg = JSON.parse(readFileSync(TEMPLATE, "utf8"));
	for (const k of ["_comment", "layering"]) delete cfg[k];
	for (const k of ["contract", "schema", "source"]) cfg[k] = NONE;
	cfg.tests.system = NONE;
	writeFileSync(join(root, "harness.config.json"), JSON.stringify(cfg, null, 2) + "\n");

	const w = (rel, text) => {
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), text);
	};
	const fm = (fields) => `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\n`;
	const g = "docs/goals/GOAL-01-register";
	w("docs/00-vision.md", `${fm({ id: "VISION", status: "frozen" })}# Vision\n\n## 成功の定義\n\n| 指標 | 現状 | 目標 |\n| --- | --- | --- |\n| KPI-01 登録率 | 10% | 30% |\n`);
	w("docs/02-actors.md", `${fm({ id: "ACTORS", status: "living" })}| ID | アクター | 種別 | 説明 |\n| --- | --- | --- | --- |\n| ACT-01 | 利用者 | 人間 | 登録する |\n`);
	w("docs/rules/BR-001.md", `${fm({ id: "BR-001", title: "t", enforced_at: "domain 層", status: "active" })}# BR-001\n`);
	w(`${g}/GOAL.md`, `${fm({ id: "GOAL-01", actor: "ACT-09", origin: "KPI-01, KPI-02", status: "active" })}# GOAL-01\n`);
	w("docs/goals/GOAL-02-draft/GOAL.md", `${fm({ id: "GOAL-02", actor: "ACT-07", origin: "KPI-07", status: "draft" })}# GOAL-02\n`);
	const uc = (id, actor, status, body) => `${fm({ id, title: "t", actor, goal: "GOAL-01", status, phase: "定義" })}# ${id}\n\n${body}`;
	w(`${g}/UC-001-register/UC.md`, uc("UC-001", "ACT-08", "active",
		"- 適用される業務規則: BR-001, BR-009\n\n## 主シナリオ\n\n1. REQ-008 は表の節の外なので数えない\n\n## 状態 × イベント表\n\n<!-- 例: BR-007 や REQ-007 はコメントなので数えない -->\n\n| 状態 \\ イベント | 登録 | 取消 |\n| --- | --- | --- |\n| 未登録 | REQ-001 | REQ-002 |\n| 登録済 | REQ-003 | REQ-000 |\n"));
	w(`${g}/UC-002-browse/UC.md`, uc("UC-002", "ACT-01", "active", "## 状態 × イベント表\n\n| 状態 \\ イベント | 閲覧 |\n| --- | --- |\n| 登録済 | REQ-003 |\n"));
	w(`${g}/UC-003-draft/UC.md`, uc("UC-003", "ACT-06", "draft", "- BR-006\n\n## 状態 × イベント表\n\n| 状態 \\ イベント | 閲覧 |\n| --- | --- |\n| 登録済 | REQ-006 |\n"));
	const req = (id, uc, status, br) => `${fm({ id, pattern: "Ubiquitous", uc, ...(br ? { br } : {}), status })}# ${id}\n\n> 1 文\n`;
	w(`${g}/UC-001-register/REQ-001.md`, req("REQ-001", "UC-001", "active", "BR-008"));
	w(`${g}/UC-001-register/REQ-004.md`, req("REQ-004", "UC-001", "draft", "BR-005"));
	w(`${g}/UC-001-register/REQ-005.md`, req("REQ-005", "UC-001", "withdrawn"));
	w(`${g}/UC-002-browse/REQ-003.md`, req("REQ-003", "UC-002", "active", "BR-001"));
	return root;
}
