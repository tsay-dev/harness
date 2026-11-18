//  verify（CI と手元から呼ぶ完了の判定）のテスト。検査の並びそのものは hook.test.mjs が固定するので、
//  ここでは、標準入力なしで 1 回実行して終了コードで結果を返すこと、--hook で Stop フックとして動くこと、
//  止められたときに実行中のコマンドを残さないことを確かめる。
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { foldReqFiles } from "../../_shared/test/fold-reqs.mjs";
import { foldOverview } from "../../_shared/test/fold-overview.mjs";
import { project, bigReportFiles, LAST_VIOLATION } from "../../_shared/test/refs-linked-fixture.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const VERIFY = join(HERE, "..", "verify.mjs");
const TEMP = [];
after(() => TEMP.forEach((d) => rmSync(d, { recursive: true, force: true })));
const temp = (prefix) => {
	const d = mkdtempSync(join(tmpdir(), prefix));
	TEMP.push(d);
	return d;
};

const NONE = { none: "テストでは使わない" };
const cmds = (over = {}) => ({ typecheck: NONE, lint: NONE, test: "exit 0", system: NONE, ...over });

//  呼ばれたら名前を記録して終わるだけの偽の検査（STUB_FAIL に名前があれば失敗）
function makeTools() {
	const dir = temp("harness verify tools ");
	for (const n of ["lint-config", "lint-spec", "lint-refs", "lint-entry", "lint-entries", "run-cases", "lint-coverage"]) {
		mkdirSync(join(dir, n), { recursive: true });
		writeFileSync(
			join(dir, n, `${n}.mjs`),
			`import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(join(dir, "calls.txt"))}, ${JSON.stringify(n)} + "\\n");\n` +
				`if ((process.env.STUB_FAIL || "").split(",").includes(${JSON.stringify(n)})) { console.log(${JSON.stringify(n)} + " red"); process.exit(1); }\n`,
		);
	}
	return dir;
}
const calls = (tools) => (existsSync(join(tools, "calls.txt")) ? readFileSync(join(tools, "calls.txt"), "utf8").split("\n").filter(Boolean) : []);

function makeRoot(cfg) {
	const root = temp("harness verify ");
	mkdirSync(join(root, "docs"), { recursive: true });
	if (cfg !== null) writeFileSync(join(root, "harness.config.json"), JSON.stringify(cfg));
	return root;
}

function run(root, args, { tools, fail = "", input = "" } = {}) {
	const env = { ...process.env, HARNESS_TOOLS_DIR: tools, STUB_FAIL: fail };
	delete env.CLAUDE_PROJECT_DIR;
	return spawnSync(process.execPath, [VERIFY, ...args], { encoding: "utf8", input, cwd: root, env });
}

test("verify: すべて通れば 0。標準入力を読まず、状態もログも残さない", () => {
	const tools = makeTools();
	const root = makeRoot({ commands: cmds({ test: "pwd > ran.txt" }) });
	const r = run(root, [], { tools });
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /\[verify\] すべて通過（level full。8 検査、skip: typecheck, lint, system）/);
	assert.deepEqual(calls(tools), ["lint-config", "lint-spec", "lint-refs", "lint-entry", "lint-entries", "run-cases", "lint-coverage"]);
	assert.ok(existsSync(join(root, "ran.txt")));
	assert.ok(!existsSync(join(root, ".harness-gate")), "フックの状態を作っている");
});

test("verify: 失敗があれば 1。失敗した検査の名前と出力の末尾を標準エラー出力に出す", () => {
	const tools = makeTools();
	const root = makeRoot({ commands: cmds({ test: "echo boom; exit 3" }) });
	const r = run(root, [], { tools, fail: "lint-refs" });
	assert.equal(r.status, 1, r.stdout);
	assert.match(r.stderr, /\[verify\] 失敗 2 件（level full。7 検査）: lint refs, test/);
	assert.match(r.stderr, /  lint refs: exit 1\n    lint-refs red/);
	assert.match(r.stderr, /  test: exit 3\n    boom/);
});

test("verify --verbose: 通った検査の出力（警告など）も表示する", () => {
	const tools = makeTools();
	writeFileSync(join(tools, "lint-spec", "lint-spec.mjs"), `console.log("  warn  docs/x.md: 何かの警告");\n`);
	const root = makeRoot({ commands: cmds({ test: "echo test-out" }) });
	const quiet = run(root, [], { tools });
	assert.doesNotMatch(quiet.stdout, /何かの警告/);
	const r = run(root, ["--verbose"], { tools });
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /== lint spec（通過）\n  warn  docs\/x\.md: 何かの警告/);
	assert.match(r.stdout, /== test（通過）\ntest-out/);
});

test("verify: 設定が無ければ失敗（1）。使い方の誤りは 2", () => {
	const tools = makeTools();
	const r = run(makeRoot(null), [], { tools });
	assert.equal(r.status, 1);
	assert.match(r.stderr, /harness\.config\.json が無い。紐づきの検査は省略できない/);
	const root = makeRoot({ commands: cmds() });
	for (const args of [["--bogus"], ["--level", "all"], ["--level"], ["--timeout", "x"]]) assert.equal(run(root, args, { tools }).status, 2, args.join(" "));
});

test("verify: --root と --level と --unit を、Stop フックと同じ意味で受ける", () => {
	const tools = makeTools();
	const root = makeRoot({ git: { units: { web: "apps/web", api: "apps/api" } } });
	for (const u of ["web", "api"]) {
		mkdirSync(join(root, "apps", u), { recursive: true });
		writeFileSync(join(root, "apps", u, "harness.config.json"), JSON.stringify({ commands: cmds({ test: "pwd > ran.txt" }) }));
	}
	const elsewhere = temp("harness verify cwd ");
	const r = run(elsewhere, ["--root", root, "--level", "fast", "--unit", "api"], { tools });
	assert.equal(r.status, 0, r.stdout + r.stderr);
	//  full でない通過は、完了の判定ではないと分かる形で出す（終了コードは 0 のまま）
	assert.match(r.stdout, /\[verify\] 完了の判定ではない（level fast。シナリオテストは実行していない）: 実行した \d+ 検査はすべて通過（unit: api。skip: /);
	assert.doesNotMatch(r.stdout, /\[verify\] すべて通過/);
	assert.ok(existsSync(join(root, "apps", "api", "ran.txt")));
	assert.ok(!existsSync(join(root, "apps", "web", "ran.txt")));
	assert.match(r.stdout, /skip: commands\.system:api = none/);
});

test("verify --hook: Stop フックとして動く（標準入力の JSON を読み、失敗は 2 で返し、状態を残す）", () => {
	const tools = makeTools();
	const root = makeRoot({ commands: cmds({ test: "exit 1" }) });
	const payload = JSON.stringify({ session_id: "s1", cwd: root, hook_event_name: "Stop", stop_hook_active: false });
	const r = run(root, ["--hook", "--level", "fast"], { tools, input: payload });
	assert.equal(r.status, 2, r.stdout + r.stderr);
	assert.match(r.stderr, /\[verify\] 終端ゲート不通過（round 1\/2）: 失敗 = test/);
	assert.ok(existsSync(join(root, ".harness-gate", "state.json")));
	//  Stop 以外のイベントは対象外（フックの規則のまま）
	const other = run(root, ["--hook"], { tools, input: JSON.stringify({ cwd: root, hook_event_name: "SubagentStop" }) });
	assert.equal(other.status, 0);
});

test("verify: 止められたら、実行中のコマンドが起動したプロセスを残さず、同じシグナルで終わる", { skip: process.platform === "win32" }, async () => {
	const tools = makeTools();
	const root = makeRoot({ commands: cmds({ test: `node -e "setInterval(() => require('fs').appendFileSync('alive.txt', 'x'), 100)" ; true`, system: "echo s > system.txt" }) });
	const child = spawn(process.execPath, [VERIFY], { cwd: root, stdio: "ignore", env: { ...process.env, HARNESS_TOOLS_DIR: tools } });
	const ended = new Promise((res) => child.on("exit", (status, signal) => res({ status, signal })));
	for (let i = 0; i < 100 && !existsSync(join(root, "alive.txt")); i++) await new Promise((res) => setTimeout(res, 50));
	assert.ok(existsSync(join(root, "alive.txt")), "コマンドが起動していない");
	child.kill("SIGTERM");
	assert.deepEqual(await ended, { status: null, signal: "SIGTERM" });
	const size = () => readFileSync(join(root, "alive.txt"), "utf8").length;
	const before = size();
	await new Promise((res) => setTimeout(res, 600));
	assert.equal(size(), before, "止められた後も、コマンドが起動したプロセスが動き続けている");
	assert.ok(!existsSync(join(root, "system.txt")), "止められた後に、残りの検査が実行された");
});

test("verify: 入口の一覧のコマンドの途中で止められても、一覧の一時フォルダを残さない", { skip: process.platform === "win32" }, async () => {
	const tools = makeTools();
	const tmp = temp("harness verify tmp ");
	const root = makeRoot({ commands: cmds({ list_entries: `node -e "require('fs').writeFileSync('started.txt', 'x'); setInterval(() => {}, 1000)"` }) });
	const child = spawn(process.execPath, [VERIFY], { cwd: root, stdio: "ignore", env: { ...process.env, HARNESS_TOOLS_DIR: tools, TMPDIR: tmp } });
	const ended = new Promise((res) => child.on("exit", (status, signal) => res({ status, signal })));
	for (let i = 0; i < 100 && !existsSync(join(root, "started.txt")); i++) await new Promise((res) => setTimeout(res, 50));
	assert.ok(existsSync(join(root, "started.txt")), "コマンドが起動していない");
	assert.equal(readdirSync(tmp).filter((n) => n.startsWith("harness-entries-")).length, 1);
	child.kill("SIGTERM");
	assert.deepEqual(await ended, { status: null, signal: "SIGTERM" });
	assert.deepEqual(readdirSync(tmp).filter((n) => n.startsWith("harness-entries-")), []);
});

test("verify: 検査の出力が 200KB を超えても、末尾（FAIL と違反の行）を表示する", (t) => {
	//  本物の lint refs を実行する。検査が出力を書き終える前に終わると、verify が受け取る出力が途中で切れ、
	//  表示する末尾が報告の途中の行になって、何が違反か分からなくなる
	const root = project(t, { files: bigReportFiles() });
	foldReqFiles(root);
	foldOverview(root);
	const env = { ...process.env };
	delete env.HARNESS_TOOLS_DIR;
	delete env.CLAUDE_PROJECT_DIR;
	const r = spawnSync(process.execPath, [VERIFY, "--level", "lint", "--root", root], { encoding: "utf8", env });
	assert.equal(r.status, 1, r.stdout + r.stderr);
	const shown = r.stderr.split("\n  lint refs: exit 1\n")[1]?.split(/\n {2}\S/)[0] ?? "";
	assert.match(shown, /\n {4}FAIL（違反 1 件）:\n {6}x \[C11\] /, r.stderr);
	assert.ok(shown.includes(LAST_VIOLATION), r.stderr);
	assert.match(shown, /-> 上流 SSOT を更新してから再導出すること/);
});
