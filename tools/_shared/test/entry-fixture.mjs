//  lint entry・lint coverage・lint entries のテストが共有する、最小のプロジェクトの組み立てと、コマンドの起動
import { after } from "node:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

//  mode（entry・coverage・entries）ごとのコマンドのファイル
export const TOOLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const toolOf = (mode) => join(TOOLS_DIR, `lint-${mode}`, `lint-${mode}.mjs`);
export const TEMP = [];
after(() => TEMP.forEach((d) => rmSync(d, { recursive: true, force: true })));

//  lcov の 1 件分。hits = 行ごとの実行回数（空なら、実行する行の無いファイル）
//  fns = { 関数の名前: 呼ばれた回数 }。関数の情報を出す道具と同じく、関数を持たないファイルにも FNF:0 を書く
export const record = (file, hits, fns = {}) =>
	[`SF:${file}`, ...Object.keys(fns).map((n, i) => `FN:${i + 1},${n}`), ...Object.entries(fns).map(([n, c]) => `FNDA:${c},${n}`), `FNF:${Object.keys(fns).length}`, ...hits.map((h, i) => `DA:${i + 1},${h}`), "end_of_record"].join("\n");

export const SOURCES = { "src/compose.ts": "export function assemble() {}\n", "src/a.ts": "export const a = 1;\n", "src/types.ts": "export type T = 1;\n", "src/server.ts": "listen();\n" };
export const LCOV = [record("src/compose.ts", [1, 1]), record("src/a.ts", [3, 0], { used: 2, "(anonymous_0)": 0, anonymous_7: 0, "<anonymous>": 0 }), record("src/types.ts", []), record("src/server.ts", [0, 0])].join("\n");

export const base = () => ({
	source: { dirs: ["src"], extensions: [".ts"] },
	entry: { compose: "src/compose.ts#assemble", test_entry: "tests/app.ts#createTestApp" },
	coverage: { report: "coverage/lcov.info", not_run: [{ path: "src/server.ts", reason: "プロセスの入口" }] },
});

export function project({ cfg = base(), files = {}, lcov = LCOV } = {}) {
	const d = mkdtempSync(join(tmpdir(), "lint-entry-"));
	TEMP.push(d);
	const all = { ...SOURCES, "tests/app.ts": "import { assemble } from '../src/compose';\nexport function createTestApp() { return assemble(); }\n", ...files };
	if (lcov !== null) all["coverage/lcov.info"] = lcov;
	if (cfg !== null) all["harness.config.json"] = typeof cfg === "string" ? cfg : JSON.stringify(cfg);
	for (const [f, body] of Object.entries(all)) {
		if (body === null) continue;
		mkdirSync(dirname(join(d, f)), { recursive: true });
		writeFileSync(join(d, f), body);
	}
	return d;
}
export const run = (d, mode, args = []) => spawnSync(process.execPath, [toolOf(mode), "--root", d, ...args], { encoding: "utf8", input: "" });
export const change = (f) => {
	const c = base();
	f(c);
	return c;
};

//  ---- entries: アプリの入口の一覧と契約の突き合わせ（ADR-0070。文字の完全一致） ----

export const op = (name, { transport = "http", direction = "inbound", owned = true, method = "GET", path = null, entry = null } = {}) =>
	`  ${name}:\n    transport: ${transport}\n    direction: ${direction}\n    owned: ${owned}\n    auth: none\n    summary: s\n` +
	(transport === "http" ? `    wire:\n      method: ${method}\n      path: ${path}\n      success: 200\n` : "") +
	(entry ? `    entry: ${entry}\n` : "") +
	"    errors: []\n";
export const contract = (uc, status, ops) => `x-uc: ${uc}\n${status ? `x-status: ${status}\n` : ""}operations:\n${ops.join("")}`;
export const ucDoc = (id, status = "active") => `---\nid: ${id}\ntitle: t\nstatus: ${status}\n---\n\n# ${id}\n`;
export const G = "docs/goals/GOAL-01-x";
//  架空のアプリ: 会員を読む・作る（fixed）、通知を受け取る（fixed。push）、下書きの操作（draft）、撤回済みの UC の操作、外の API を呼ぶ操作（outbound）、
//  運用のための入口（生存確認と静的なファイルの配信。これも契約の操作として書く）
export const DOCS = {
	[`${G}/UC-001-members/UC.md`]: ucDoc("UC-001"),
	[`${G}/UC-001-members/contract.yaml`]: contract("UC-001", "fixed", [
		op("getMember", { path: "/api/members/{accountId}" }),
		op("createMember", { method: "POST", path: "/api/members" }),
		op("receiveNotice", { transport: "push", entry: "notice.updated" }),
		op("sendMail", { transport: "http", direction: "outbound", owned: false, method: "POST", path: "/v1/mail" }),
	]),
	[`${G}/UC-002-draft/UC.md`]: ucDoc("UC-002", "draft"),
	[`${G}/UC-002-draft/contract.yaml`]: contract("UC-002", "draft", [op("exportMembers", { path: "/api/members/export" })]),
	[`${G}/UC-003-old/UC.md`]: ucDoc("UC-003", "withdrawn"),
	[`${G}/UC-003-old/contract.yaml`]: contract("UC-003", "fixed", [op("oldReport", { path: "/api/old-report" })]),
	[`${G}/UC-004-operate/UC.md`]: ucDoc("UC-004"),
	[`${G}/UC-004-operate/contract.yaml`]: contract("UC-004", "fixed", [op("checkHealth", { path: "/api/health" }), op("serveAssets", { path: "/assets/*" })]),
};
export const line = (o) => JSON.stringify(o);
export const h = (method, path) => line({ kind: "http", method, path });
export const LIST = [h("GET", "/api/members/{accountId}"), h("POST", "/api/members"), line({ kind: "push", name: "notice.updated" }), h("GET", "/api/health"), h("GET", "/assets/*")].join("\n");
export const entriesCfg = (f = () => {}) => {
	const c = { docs: { goals_dir: "docs/goals" }, commands: { list_entries: "node scripts/list-entries.mjs" } };
	f(c);
	return c;
};
export const entries = ({ cfg = entriesCfg(), list = LIST, files = {} } = {}) => {
	const d = project({ cfg, files: { ...DOCS, ...files, "entries.jsonl": list }, lcov: null });
	return run(d, "entries", ["--from", join(d, "entries.jsonl")]);
};
