//  harness（入口）のテスト。入口は名前から同梱ツールを選んで引数を渡すだけなので、
//  確かめるのは「どの名前がどのツールに、どの引数で届くか」と終了コードの受け渡し。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY = join(HERE, "..", "harness.mjs");
const REAL_TOOLS = join(HERE, "..", "..", "tools");
const SCRIPTS = [...new Set([...readFileSync(ENTRY, "utf8").matchAll(/script: "([^"]+)"/g)].map((m) => m[1]))];

//  呼ばれたら「自分のパスと引数」を 1 行で出し、FAKE_EXIT_<ツール名> の終了コードで終わる偽のツール
function fakeTools() {
	const dir = mkdtempSync(join(tmpdir(), "harness-entry-"));
	for (const s of SCRIPTS) {
		mkdirSync(dirname(join(dir, s)), { recursive: true });
		const name = s.split("/").pop().replace(/\W/g, "_");
		writeFileSync(
			join(dir, s),
			`console.log(JSON.stringify({ script: ${JSON.stringify(s)}, args: process.argv.slice(2) }));\n` +
				`process.exit(Number(process.env.FAKE_EXIT_${name} ?? 0));\n`,
		);
	}
	return dir;
}

function harness(args, env = {}) {
	const r = spawnSync(process.execPath, [ENTRY, ...args], {
		encoding: "utf8",
		input: "",
		env: { ...process.env, HARNESS_TOOLS_DIR: fakeTools(), ...env },
	});
	const calls = r.stdout.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));
	return { ...r, calls };
}

test("表にあるツールは、同梱の tools/ にすべて実在する", () => {
	assert.ok(SCRIPTS.length > 0);
	for (const s of SCRIPTS) assert.ok(existsSync(join(REAL_TOOLS, s)), s);
});

const ROUTES = [
	[["lint", "spec"], "spec-lint/spec-lint.mjs", ["validate"]],
	[["lint", "refs"], "trace-check/trace-check.mjs", []],
	[["lint", "git", "branch"], "git-lint/git-lint.mjs", ["branch"]],
	[["lint", "git", "message"], "git-lint/git-lint.mjs", ["message"]],
	[["lint", "git", "uc"], "spec-lint/spec-lint.mjs", ["gate"]],
	[["run", "cases"], "contract-run/contract-run.mjs", []],
	[["verify"], "gate-hook/stop-gate.mjs", []],
	[["guard"], "gate-hook/gate-hook.mjs", []],
	[["next-id"], "trace-check/trace-check.mjs", ["--next"]],
	[["index"], "trace-check/trace-check.mjs", ["--index"]],
	[["convert"], "spec-lint/spec-lint.mjs", ["convert"]],
];

for (const [words, script, prefix] of ROUTES) {
	test(`harness ${words.join(" ")} は ${script} に引数をそのまま渡す`, () => {
		const r = harness([...words, "--x", "値 1"]);
		assert.equal(r.status, 0, r.stderr);
		assert.deepEqual(r.calls, [{ script, args: [...prefix, "--x", "値 1"] }]);
	});
}

test("一覧に出るコマンドと、テストが確かめる行き先は同じ集合", () => {
	const r = harness([]);
	assert.equal(r.status, 0);
	for (const [words] of ROUTES) assert.match(r.stdout, new RegExp(`^  ${words.join(" ")} `, "m"));
	const listed = r.stdout.split("\n").filter((l) => /^  \S/.test(l)).length;
	assert.equal(listed, ROUTES.length + 1); // +1 は、まとめて実行する lint の行
});

test("終了コードは渡した先のものがそのまま返る", () => {
	assert.equal(harness(["lint", "refs"], { FAKE_EXIT_trace_check_mjs: "1" }).status, 1);
	assert.equal(harness(["run", "cases"], { FAKE_EXIT_contract_run_mjs: "2" }).status, 2);
});

test("harness lint は 3 つを順に実行し、1 つ失敗しても残りを実行して最も大きい終了コードを返す", () => {
	const r = harness(["lint"], { FAKE_EXIT_spec_lint_mjs: "1" });
	assert.equal(r.status, 1);
	assert.deepEqual(r.calls, [
		{ script: "spec-lint/spec-lint.mjs", args: ["validate"] },
		{ script: "trace-check/trace-check.mjs", args: [] },
		{ script: "git-lint/git-lint.mjs", args: ["branch"] },
	]);
});

test("無いコマンドは 2 で終わり、何も実行しない", () => {
	for (const args of [["lnt"], ["lint", "specs"], ["lint", "git"], ["run"], ["lint", "--docs", "docs"]]) {
		const r = harness(args);
		assert.equal(r.status, 2, args.join(" "));
		assert.deepEqual(r.calls, []);
		assert.match(r.stderr, /は無い/);
	}
});

test("標準入力は渡した先に届く（フックは標準入力の JSON を読む）", () => {
	const dir = fakeTools();
	writeFileSync(join(dir, "gate-hook/gate-hook.mjs"), `process.stdin.pipe(process.stdout);\n`);
	const r = spawnSync(process.execPath, [ENTRY, "guard"], { encoding: "utf8", input: '{"tool_name":"Write"}', env: { ...process.env, HARNESS_TOOLS_DIR: dir } });
	assert.equal(r.stdout, '{"tool_name":"Write"}');
});
