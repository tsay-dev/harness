//  verify（CI と手元から呼ぶ完了の判定）のテスト。検査の並びそのものは stop-gate.test.mjs が固定するので、
//  ここでは、標準入力なしで 1 回実行して終了コードで結果を返すこと、--hook で Stop フックとして動くこと、
//  止められたときに実行中のコマンドを残さないことを確かめる。
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
	for (const n of ["config-lint", "spec-lint", "trace-check", "exec-check", "contract-run"]) {
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
	const env = { ...process.env, STOP_GATE_TOOLS_DIR: tools, STUB_FAIL: fail };
	delete env.CLAUDE_PROJECT_DIR;
	return spawnSync(process.execPath, [VERIFY, ...args], { encoding: "utf8", input, cwd: root, env });
}

test("verify: すべて通れば 0。標準入力を読まず、状態もログも残さない", () => {
	const tools = makeTools();
	const root = makeRoot({ commands: cmds({ test: "pwd > ran.txt" }) });
	const r = run(root, [], { tools });
	assert.equal(r.status, 0, r.stdout + r.stderr);
	assert.match(r.stdout, /\[verify\] すべて通過（level full。7 検査、skip: typecheck, lint, system）/);
	assert.deepEqual(calls(tools), ["config-lint", "spec-lint", "trace-check", "exec-check", "contract-run", "exec-check"]);
	assert.ok(existsSync(join(root, "ran.txt")));
	assert.ok(!existsSync(join(root, ".harness-gate")), "フックの状態を作っている");
});

test("verify: 失敗があれば 1。失敗した検査の名前と出力の末尾を標準エラー出力に出す", () => {
	const tools = makeTools();
	const root = makeRoot({ commands: cmds({ test: "echo boom; exit 3" }) });
	const r = run(root, [], { tools, fail: "trace-check" });
	assert.equal(r.status, 1, r.stdout);
	assert.match(r.stderr, /\[verify\] 失敗 2 件（level full。6 検査）: trace-check, test/);
	assert.match(r.stderr, /  trace-check: exit 1\n    trace-check red/);
	assert.match(r.stderr, /  test: exit 3\n    boom/);
});

test("verify --verbose: 通った検査の出力（警告など）も表示する", () => {
	const tools = makeTools();
	writeFileSync(join(tools, "spec-lint", "spec-lint.mjs"), `console.log("  warn  docs/x.md: 何かの警告");\n`);
	const root = makeRoot({ commands: cmds({ test: "echo test-out" }) });
	const quiet = run(root, [], { tools });
	assert.doesNotMatch(quiet.stdout, /何かの警告/);
	const r = run(root, ["--verbose"], { tools });
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /== spec-lint（通過）\n  warn  docs\/x\.md: 何かの警告/);
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
	assert.match(r.stdout, /level fast、unit: api/);
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
	assert.match(r.stderr, /\[stop-gate\] 終端ゲート不通過（round 1\/2）: 失敗 = test/);
	assert.ok(existsSync(join(root, ".harness-gate", "state.json")));
	//  Stop 以外のイベントは対象外（フックの規則のまま）
	const other = run(root, ["--hook"], { tools, input: JSON.stringify({ cwd: root, hook_event_name: "SubagentStop" }) });
	assert.equal(other.status, 0);
});

test("verify: 止められたら、実行中のコマンドが起動したプロセスを残さず、同じシグナルで終わる", { skip: process.platform === "win32" }, async () => {
	const tools = makeTools();
	const root = makeRoot({ commands: cmds({ test: `node -e "setInterval(() => require('fs').appendFileSync('alive.txt', 'x'), 100)" ; true`, system: "echo s > system.txt" }) });
	const child = spawn(process.execPath, [VERIFY], { cwd: root, stdio: "ignore", env: { ...process.env, STOP_GATE_TOOLS_DIR: tools } });
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
