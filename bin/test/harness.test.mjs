//  harness（入口）のテスト。入口は名前から同梱ツールを選んで引数を渡すだけなので、
//  確かめるのは「どの名前がどのツールに、どの引数で届くか」と終了コードの受け渡し。
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY = join(HERE, "..", "harness.mjs");
const REAL_TOOLS = join(HERE, "..", "..", "tools");
const SCRIPTS = [...new Set([...readFileSync(ENTRY, "utf8").matchAll(/script: "([^"]+)"/g)].map((m) => m[1]))];

//  呼ばれたら「自分のパスと引数」を 1 行で出し、FAKE_EXIT_<ツール名> の終了コードで終わる偽のツール
const TEMP = [];
after(() => TEMP.forEach((d) => rmSync(d, { recursive: true, force: true })));

function fakeTools() {
	const dir = mkdtempSync(join(tmpdir(), "harness-entry-"));
	TEMP.push(dir);
	for (const s of SCRIPTS) {
		mkdirSync(dirname(join(dir, s)), { recursive: true });
		const name = s.split("/").pop().replace(/\W/g, "_");
		writeFileSync(
			join(dir, s),
			`console.log(JSON.stringify({ script: ${JSON.stringify(s)}, args: process.argv.slice(2), cwd: process.cwd() }));\n` +
				`process.exit(Number(process.env.FAKE_EXIT_${name} ?? 0));\n`,
		);
	}
	return dir;
}

const CWD = realpathSync(mkdtempSync(join(tmpdir(), "harness-cwd-")));
TEMP.push(CWD);

function harness(args, env = {}) {
	const r = spawnSync(process.execPath, [ENTRY, ...args], {
		encoding: "utf8",
		input: "",
		cwd: CWD,
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
		assert.deepEqual(r.calls, [{ script, args: [...prefix, "--x", "値 1"], cwd: CWD }]);
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
		{ script: "spec-lint/spec-lint.mjs", args: ["validate"], cwd: CWD },
		{ script: "trace-check/trace-check.mjs", args: [], cwd: CWD },
		{ script: "git-lint/git-lint.mjs", args: ["branch"], cwd: CWD },
	]);
});

test("無いコマンドは 2 で終わり、何も実行しない", () => {
	for (const args of [["lnt"], ["lint", "specs"], ["lint", "git"], ["run"], ["lint", "--docs", "docs"]]) {
		const r = harness(args);
		assert.equal(r.status, 2, args.join(" "));
		assert.deepEqual(r.calls, []);
		assert.match(r.stderr, /は無い|引数を渡せない/);
	}
	assert.match(harness(["lint", "--docs", "docs"]).stderr, /引数を渡せない/);
	assert.doesNotMatch(harness(["lint", "--docs", "docs"]).stderr, /「lint docs」/);
});

test("差し替えなしでは、同梱の tools/ の実物が呼ばれる", () => {
	const env = { ...process.env };
	delete env.HARNESS_TOOLS_DIR;
	const r = spawnSync(process.execPath, [ENTRY, "lint", "git", "branch", "--name", "feat/add-some-thing", "--root", join(HERE, "..", "..")], { encoding: "utf8", input: "", env });
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /\[git-lint\] ブランチ名 OK: feat\/add-some-thing/);
});

test("行き先のファイルが無ければ 2 で終わる", () => {
	const r = harness(["verify"], { HARNESS_TOOLS_DIR: join(CWD, "無い場所") });
	assert.equal(r.status, 2);
	assert.match(r.stderr, /が無い/);
});

test("標準エラー出力は渡した先のものがそのまま出る（フックは理由を標準エラー出力で返す）", () => {
	const dir = fakeTools();
	writeFileSync(join(dir, "gate-hook/stop-gate.mjs"), `console.error("差し戻しの理由"); process.exit(2);\n`);
	const r = harness(["verify"], { HARNESS_TOOLS_DIR: dir });
	assert.equal(r.status, 2);
	assert.equal(r.stderr, "差し戻しの理由\n");
});

test("渡した先がシグナルで止まったら、入口も同じシグナルで止まる", () => {
	const dir = fakeTools();
	writeFileSync(join(dir, "gate-hook/stop-gate.mjs"), `process.kill(process.pid, "SIGTERM"); setTimeout(() => {}, 5000);\n`);
	const r = harness(["verify"], { HARNESS_TOOLS_DIR: dir });
	assert.equal(r.signal, "SIGTERM");
});

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"]) {
	test(`入口だけを ${sig} で止めても、渡した先が動き続けない`, { skip: process.platform === "win32" }, async () => {
		const dir = fakeTools();
		const started = join(dir, "started");
		const marker = join(dir, "marker");
		writeFileSync(
			join(dir, "gate-hook/stop-gate.mjs"),
			`import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(started)}, "");\nsetTimeout(() => writeFileSync(${JSON.stringify(marker)}, ""), 400);\n`,
		);
		const child = spawn(process.execPath, [ENTRY, "verify"], { stdio: "ignore", env: { ...process.env, HARNESS_TOOLS_DIR: dir } });
		const ended = new Promise((res) => child.on("exit", (status, signal) => res(signal)));
		for (let i = 0; i < 100 && !existsSync(started); i++) await new Promise((res) => setTimeout(res, 50));
		assert.ok(existsSync(started), "渡した先が起動していない");
		child.kill(sig);
		assert.equal(await ended, sig);
		await new Promise((res) => setTimeout(res, 700));
		assert.ok(!existsSync(marker), "入口が止まった後も、渡した先が動いて目印を書いた");
	});
}

test("harness lint の途中で止められたら、渡した先が 0 で終わっても残りを実行せず、同じシグナルで終わる", { skip: process.platform === "win32" }, async () => {
	const dir = fakeTools();
	const started = join(dir, "started");
	const ran = join(dir, "ran");
	writeFileSync(
		join(dir, "spec-lint/spec-lint.mjs"),
		`import { writeFileSync } from "node:fs";\nprocess.on("SIGTERM", () => process.exit(0));\nwriteFileSync(${JSON.stringify(started)}, "");\nsetTimeout(() => {}, 10000);\n`,
	);
	for (const s of ["trace-check/trace-check.mjs", "git-lint/git-lint.mjs"]) {
		writeFileSync(join(dir, s), `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(ran)}, "x");\n`);
	}
	const child = spawn(process.execPath, [ENTRY, "lint"], { stdio: "ignore", env: { ...process.env, HARNESS_TOOLS_DIR: dir } });
	const ended = new Promise((res) => child.on("exit", (status, signal) => res({ status, signal })));
	for (let i = 0; i < 100 && !existsSync(started); i++) await new Promise((res) => setTimeout(res, 50));
	assert.ok(existsSync(started), "最初の検査が起動していない");
	child.kill("SIGTERM");
	assert.deepEqual(await ended, { status: null, signal: "SIGTERM" });
	await new Promise((res) => setTimeout(res, 300));
	assert.ok(!existsSync(ran), "止められた後に、残りの検査が実行された");
});

test("渡した先が終わった直後、次の検査を起動する前に届いた止める指示も取りこぼさない", { skip: process.platform === "win32" }, () => {
	//  最初の検査が見張りを残して終わる。見張りは、入口が最初の検査を回収したのを見てから入口へ SIGTERM を送る
	//  （kill -0 は回収されるまで成功する）。指示は、検査と検査の間に届く
	for (let i = 0; i < 12; i++) {
		const dir = fakeTools();
		const ran = join(dir, "ran");
		writeFileSync(
			join(dir, "spec-lint/spec-lint.mjs"),
			`import { spawn } from "node:child_process";\n` +
				`spawn("sh", ["-c", "while kill -0 " + process.pid + " 2>/dev/null; do :; done; kill -TERM " + process.ppid], { detached: true, stdio: "ignore" }).unref();\n` +
				`setTimeout(() => process.exit(0), 30);\n`,
		);
		for (const s of ["trace-check/trace-check.mjs", "git-lint/git-lint.mjs"]) {
			writeFileSync(join(dir, s), `import { appendFileSync } from "node:fs";\nsetTimeout(() => appendFileSync(${JSON.stringify(ran)}, "x"), 200);\n`);
		}
		const r = harness(["lint"], { HARNESS_TOOLS_DIR: dir });
		assert.equal(r.signal, "SIGTERM", `${i} 回目: status=${r.status}`);
		spawnSync("sleep", ["0.3"]);
		assert.ok(!existsSync(ran), `${i} 回目: 止められた後に残りの検査が実行された`);
	}
});

test("harness lint の出力先が先に閉じたら、残りを実行せず、失敗で終わる", { skip: process.platform === "win32" }, () => {
	const dir = fakeTools();
	const ran = join(dir, "ran");
	writeFileSync(join(dir, "spec-lint/spec-lint.mjs"), `setTimeout(() => {}, 300);\n`);
	for (const s of ["trace-check/trace-check.mjs", "git-lint/git-lint.mjs"]) {
		writeFileSync(join(dir, s), `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(ran)}, "x");\n`);
	}
	const r = spawnSync("bash", ["-c", `"${process.execPath}" "${ENTRY}" lint | true; exit \${PIPESTATUS[0]}`], { encoding: "utf8", env: { ...process.env, HARNESS_TOOLS_DIR: dir } });
	assert.equal(r.status, 1, r.stderr);
	assert.doesNotMatch(r.stderr, /EPIPE|Unhandled/);
	assert.ok(!existsSync(ran), "出力先が閉じた後に残りの検査が実行された");
});

test("標準入力は渡した先に届く（フックは標準入力の JSON を読む）", () => {
	const dir = fakeTools();
	writeFileSync(join(dir, "gate-hook/gate-hook.mjs"), `process.stdin.pipe(process.stdout);\n`);
	const r = spawnSync(process.execPath, [ENTRY, "guard"], { encoding: "utf8", input: '{"tool_name":"Write"}', env: { ...process.env, HARNESS_TOOLS_DIR: dir } });
	assert.equal(r.stdout, '{"tool_name":"Write"}');
});
