//  lint refs と index のテストが共有する、紐づきの揃った最小のプロジェクト（違反 0 件）の組み立てと、コマンドの起動。
//  テンプレートの harness.config.json から組み、テストは 1 か所ずつ崩す。
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
//  コマンド（lint-refs・index）のファイル
export const toolOf = (command) => join(HERE, "..", "..", command, `${command}.mjs`);
export const TEMPLATE = join(HERE, "..", "..", "..", "templates", "develop", "harness.config.json");

export const fm = (fields) => `---\n${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n")}\n---\n\n`;
export const G = "docs/goals/GOAL-01-x";
export const U = `${G}/UC-001-x`;

//  紐づきの揃った最小のプロジェクト（違反 0 件）。files で上書き・追加（null は削除）し、configure で harness.config.json を変える
export function project(t, { files = {}, configure = () => {} } = {}) {
	const root = mkdtempSync(join(tmpdir(), "harness lint-refs links "));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const cfg = JSON.parse(readFileSync(TEMPLATE, "utf8"));
	delete cfg.layering;
	//  active な REQ と source があるので、実行の記録の宣言が要る（C26。記録の中身は lint coverage が読む）
	cfg.coverage = { report: "coverage/lcov.info" };
	configure(cfg);
	const base = {
		"harness.config.json": JSON.stringify(cfg, null, 2),
		"docs/00-vision.md": `${fm({ id: "VISION", status: "frozen" })}| 指標 | 現状 | 目標 |\n| --- | --- | --- |\n| KPI-01 登録数 | 0 | 10 |\n`,
		"docs/01-glossary.md": `${fm({ id: "GLOSSARY", status: "living" })}| 用語 | 定義 | コード識別子 | 禁止同義語 |\n| --- | --- | --- | --- |\n| 案件 | 登録する単位 | \`createX\` | 仕事 |\n`,
		"docs/02-actors.md": `${fm({ id: "ACTORS", status: "living" })}| ID | アクター | 種別 | 説明 |\n| --- | --- | --- | --- |\n| ACT-01 | 利用者 | 人間 / 認証済 | 登録する |\n| ACT-02 | 夜間バッチ | システム / スケジューラー | 集計する |\n`,
		"docs/_shared/components.yaml": "authSchemes: {}\nerrorCodes: {}\nschemas: {}\n",
		"docs/rules/.gitkeep": "",
		"docs/nfr/.gitkeep": "",
		"docs/adr/.gitkeep": "",
		[`${G}/GOAL.md`]: `${fm({ id: "GOAL-01", actor: "ACT-01", origin: "KPI-01", status: "active" })}# GOAL-01\n`,
		[`${U}/UC.md`]: `${fm({ id: "UC-001", title: "t", actor: "ACT-01", goal: "GOAL-01", status: "active", phase: "実装" })}# UC-001\n\n## 主シナリオ\n\n1. 利用者が案件を登録する\n\n## 状態 × イベント表\n\n| 状態 \\ イベント | 登録 |\n| --- | --- |\n| 未登録 | REQ-001 |\n`,
		[`${U}/REQ-001.md`]: `${fm({ id: "REQ-001", pattern: "Ubiquitous", uc: "UC-001", status: "active" })}# REQ-001\n\n> 1 文\n\n## 検証方針\n\n- **分割クラス**:\n  - \`#ok\` — 正常\n`,
		[`${U}/contract.yaml`]:
			"x-uc: UC-001\nx-status: fixed\noperations:\n  createX:\n    transport: http\n    direction: inbound\n    owned: true\n    auth: none\n    summary: 登録\n    wire:\n      method: POST\n      path: /x/{id}\n      success: 200\n    errors: []\n",
		"src/usecase/x.ts": "export function createX() {}\n",
		"src/infra/routes.ts": 'app.post("/x/:id", h);\n',
		"src/domain/errors.ts": "export {};\n",
		"tests/x.test.ts": '// @covers REQ-001#ok\ntest("ok", () => {});\n',
		"e2e/x.spec.ts": '// @scenario UC-001\ntest("flow", () => {});\n',
		"prisma/schema.prisma": "model X {\n  id Int @id\n}\n",
	};
	for (const [rel, text] of Object.entries({ ...base, ...files })) {
		if (text === null) continue;
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), text);
	}
	return root;
}

//  ---- 規則を確かめるテスト（@covers BR-nnn。ADR-0070） ----

export const br = (id, enforcedAt, status = "active") => `${fm({ id, title: "t", enforced_at: enforcedAt, status })}# ${id}\n`;
//  UC の本文から BR-001 を参照する（C4 の「死んだ規則」にしない）
export const UC_WITH_BR = `${fm({ id: "UC-001", title: "t", actor: "ACT-01", goal: "GOAL-01", status: "active", phase: "実装" })}# UC-001\n\n- 適用される業務規則: BR-001\n\n## 状態 × イベント表\n\n| 状態 \\ イベント | 登録 |\n| --- | --- |\n| 未登録 | REQ-001 |\n`;

//  ---- 大きな出力（パイプ越しに最後まで届くかを確かめる） ----

//  REQ-001 に分割クラスを count 個置き、どれもテストで確かめる（報告が 1 クラス 1 行で長くなる）。
//  最後に @covers の無いテストを 1 つ置き、報告の末尾の FAIL に違反を 1 件だけ出す（C11）
export const LAST_VIOLATION = 'tests/zz.test.ts:1 "最後の違反"';
export function bigReportFiles(count = 5000) {
	const ids = Array.from({ length: count }, (_, n) => `c${String(n).padStart(4, "0")}`);
	return {
		[`${U}/REQ-001.md`]: `${fm({ id: "REQ-001", pattern: "Ubiquitous", uc: "UC-001", status: "active" })}# REQ-001\n\n> 1 文\n\n## 検証方針\n\n- **分割クラス**:\n${ids.map((c) => `  - \`#${c}\` — x\n`).join("")}`,
		"tests/x.test.ts": ids.map((c) => `// @covers REQ-001#${c}\ntest("${c}", () => {});\n`).join(""),
		"tests/zz.test.ts": 'test("最後の違反", () => {});\n',
	};
}
