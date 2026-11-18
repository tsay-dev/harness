//  harness（入口）のテスト。入口はコマンドの語からファイルの場所を決めて、引数をそのまま渡すだけなので、
//  確かめるのは「どのコマンドがどのファイルに、どの引数で届くか」と終了コードの受け渡し。
//  コマンドの名前とファイルの名前が 1 つであること（ADR-0071）も、ここで守る。
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENTRY = join(HERE, "..", "harness.mjs");
const REAL_TOOLS = join(HERE, "..", "..", "tools");

//  コマンドと、そのファイルの場所（tools/ からの相対パス）。場所は語を - でつないだもの。
//  入口は対応表を持たないので、決まりどおりの場所になっていることを、ここに書いた文字で確かめる
const ROUTES = [
	[["lint", "config"], "lint-config/lint-config.mjs"],
	[["lint", "spec"], "lint-spec/lint-spec.mjs"],
	[["lint", "refs"], "lint-refs/lint-refs.mjs"],
	[["lint", "entry"], "lint-entry/lint-entry.mjs"],
	[["lint", "coverage"], "lint-coverage/lint-coverage.mjs"],
	[["lint", "entries"], "lint-entries/lint-entries.mjs"],
	[["lint", "git", "branch"], "lint-git-branch/lint-git-branch.mjs"],
	[["lint", "git", "message"], "lint-git-message/lint-git-message.mjs"],
	[["lint", "git", "uc"], "lint-git-uc/lint-git-uc.mjs"],
	[["run", "cases"], "run-cases/run-cases.mjs"],
	[["verify"], "verify/verify.mjs"],
	[["guard"], "guard/guard.mjs"],
	[["next-id"], "next-id/next-id.mjs"],
	[["index"], "index/index.mjs"],
	[["migrate", "reqs"], "migrate-reqs/migrate-reqs.mjs"],
	[["migrate", "overview"], "migrate-overview/migrate-overview.mjs"],
	[["convert"], "convert/convert.mjs"],
];
const SCRIPTS = ROUTES.map(([, script]) => script);

//  tools/ の直下に置いてよい、コマンドでも共有の置き場（_shared）でもないフォルダと、置いてよい理由
const NON_COMMAND_DIRS = {
	apm: "APM の展開の検査（test_projection.py）と、Claude のモデルの対応表。harness のコマンドではなく、このリポジトリの検証で使う",
	"codex-sync": "Codex のモデルの対応表（ADR-0029）。コマンドではなく、orchestrator が読むデータ",
};

//  入口が一覧に出すコマンド（まとめて実行する lint の行を除く）
function listedCommands() {
	const r = spawnSync(process.execPath, [ENTRY], { encoding: "utf8" });
	return r.stdout.split("\n").map((l) => /^  (\S+(?: \S+)*)  /.exec(l)?.[1]).filter((w) => w && w !== "lint");
}

//  呼ばれたら「自分のパスと引数」を 1 行で出し、FAKE_EXIT_<ファイル名> の終了コードで終わる偽のコマンド
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

test("一覧にあるコマンドのファイルは、決まった場所（tools/<語を - でつないだもの>/<同じ名前>.mjs）にすべて実在する", () => {
	const listed = listedCommands();
	assert.deepEqual(listed, ROUTES.map(([words]) => words.join(" ")));
	for (const name of listed.map((c) => c.split(" ").join("-"))) assert.ok(existsSync(join(REAL_TOOLS, name, `${name}.mjs`)), name);
	for (const [words, script] of ROUTES) assert.equal(script, `${words.join("-")}/${words.join("-")}.mjs`);
});

test("tools/ の直下には、コマンドの置き場と、共有の置き場（_shared）と、理由を書いて認めたものしか無い", () => {
	const commands = new Set(listedCommands().map((c) => c.split(" ").join("-")));
	for (const d of readdirSync(REAL_TOOLS, { withFileTypes: true })) {
		assert.ok(d.isDirectory(), `tools/${d.name} はフォルダでない（コマンドのファイルは tools/<コマンド>/ に置く）`);
		if (d.name === "_shared" || commands.has(d.name)) continue;
		assert.ok(typeof NON_COMMAND_DIRS[d.name] === "string" && NON_COMMAND_DIRS[d.name].trim(), `tools/${d.name} は、コマンドにも共有の置き場にも当たらない（コマンドなら入口の一覧に足す。そうでなければ、理由と一緒に NON_COMMAND_DIRS に書く）`);
	}
	for (const name of Object.keys(NON_COMMAND_DIRS)) assert.ok(existsSync(join(REAL_TOOLS, name)), `NON_COMMAND_DIRS の ${name} が tools/ に無い（消したなら一覧からも消す）`);
	//  コマンドの置き場には、コマンドのファイルのほかに実行するファイルを置かない（別の入口を作らない）
	for (const name of commands) {
		const files = readdirSync(join(REAL_TOOLS, name), { withFileTypes: true }).filter((f) => f.isFile() && f.name.endsWith(".mjs")).map((f) => f.name);
		assert.deepEqual(files, [`${name}.mjs`], `tools/${name}`);
	}
});

for (const [words, script] of ROUTES) {
	test(`harness ${words.join(" ")} は ${script} に引数をそのまま渡す`, () => {
		const r = harness([...words, "--x", "値 1"]);
		assert.equal(r.status, 0, r.stderr);
		assert.deepEqual(r.calls, [{ script, args: ["--x", "値 1"], cwd: CWD }]);
	});
}

test("コマンドのファイルは、最後の出力を書いた直後に process.exit で終わらない（終了コードは process.exitCode に入れる）", () => {
	//  標準出力・標準エラーがパイプのときは書き込みが非同期になり、process.exit は書き終わる前にプロセスを終える（出力が途中で切れる）。
	//  関数の外（字下げの無い行）にある process.exit を、main の戻り値で終わる書き方として見つける
	for (const script of [...SCRIPTS, "_shared/gate-log.mjs"]) {
		const hits = readFileSync(join(REAL_TOOLS, script), "utf8").split("\n").filter((l) => /^\S/.test(l) && !l.startsWith("//") && l.includes("process.exit("));
		assert.deepEqual(hits, [], script);
	}
});

test("一覧に出るコマンドと、テストが確かめるコマンドは同じ集合", () => {
	const r = harness([]);
	assert.equal(r.status, 0);
	for (const [words] of ROUTES) assert.match(r.stdout, new RegExp(`^  ${words.join(" ")} `, "m"));
	const listed = r.stdout.split("\n").filter((l) => /^  \S/.test(l)).length;
	assert.equal(listed, ROUTES.length + 1); // +1 は、まとめて実行する lint の行
});

test("終了コードはコマンドのものがそのまま返る", () => {
	assert.equal(harness(["lint", "refs"], { FAKE_EXIT_lint_refs_mjs: "1" }).status, 1);
	assert.equal(harness(["run", "cases"], { FAKE_EXIT_run_cases_mjs: "2" }).status, 2);
});

test("harness lint は 5 つを順に実行し、1 つ失敗しても残りを実行して最も大きい終了コードを返す", () => {
	const r = harness(["lint"], { FAKE_EXIT_lint_spec_mjs: "1" });
	assert.equal(r.status, 1);
	assert.deepEqual(r.calls, [
		{ script: "lint-config/lint-config.mjs", args: [], cwd: CWD },
		{ script: "lint-spec/lint-spec.mjs", args: [], cwd: CWD },
		{ script: "lint-refs/lint-refs.mjs", args: [], cwd: CWD },
		{ script: "lint-entry/lint-entry.mjs", args: [], cwd: CWD },
		{ script: "lint-git-branch/lint-git-branch.mjs", args: [], cwd: CWD },
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
	assert.match(r.stdout, /\[lint git branch\] ブランチ名 OK: feat\/add-some-thing/);
});

test("コマンドのファイルが無ければ 2 で終わる", () => {
	const r = harness(["verify"], { HARNESS_TOOLS_DIR: join(CWD, "無い場所") });
	assert.equal(r.status, 2);
	assert.match(r.stderr, /が無い/);
});

test("標準エラー出力はコマンドのものがそのまま出る（フックは理由を標準エラー出力で返す）", () => {
	const dir = fakeTools();
	writeFileSync(join(dir, "verify/verify.mjs"), `console.error("差し戻しの理由"); process.exit(2);\n`);
	const r = harness(["verify"], { HARNESS_TOOLS_DIR: dir });
	assert.equal(r.status, 2);
	assert.equal(r.stderr, "差し戻しの理由\n");
});

test("コマンドがシグナルで止まったら、入口も同じシグナルで止まる", () => {
	const dir = fakeTools();
	writeFileSync(join(dir, "verify/verify.mjs"), `process.kill(process.pid, "SIGTERM"); setTimeout(() => {}, 5000);\n`);
	const r = harness(["verify"], { HARNESS_TOOLS_DIR: dir });
	assert.equal(r.signal, "SIGTERM");
});

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"]) {
	test(`入口だけを ${sig} で止めても、コマンドが動き続けない`, { skip: process.platform === "win32" }, async () => {
		const dir = fakeTools();
		const started = join(dir, "started");
		const marker = join(dir, "marker");
		writeFileSync(
			join(dir, "verify/verify.mjs"),
			`import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(started)}, "");\nsetTimeout(() => writeFileSync(${JSON.stringify(marker)}, ""), 400);\n`,
		);
		const child = spawn(process.execPath, [ENTRY, "verify"], { stdio: "ignore", env: { ...process.env, HARNESS_TOOLS_DIR: dir } });
		const ended = new Promise((res) => child.on("exit", (status, signal) => res(signal)));
		for (let i = 0; i < 100 && !existsSync(started); i++) await new Promise((res) => setTimeout(res, 50));
		assert.ok(existsSync(started), "コマンドが起動していない");
		child.kill(sig);
		assert.equal(await ended, sig);
		await new Promise((res) => setTimeout(res, 700));
		assert.ok(!existsSync(marker), "入口が止まった後も、コマンドが動いて目印を書いた");
	});
}

test("harness lint の途中で止められたら、コマンドが 0 で終わっても残りを実行せず、同じシグナルで終わる", { skip: process.platform === "win32" }, async () => {
	const dir = fakeTools();
	const started = join(dir, "started");
	const ran = join(dir, "ran");
	writeFileSync(
		join(dir, "lint-spec/lint-spec.mjs"),
		`import { writeFileSync } from "node:fs";\nprocess.on("SIGTERM", () => process.exit(0));\nwriteFileSync(${JSON.stringify(started)}, "");\nsetTimeout(() => {}, 10000);\n`,
	);
	for (const s of ["lint-refs/lint-refs.mjs", "lint-git-branch/lint-git-branch.mjs"]) {
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

test("コマンドが終わった直後、次の検査を起動する前に届いた止める指示も取りこぼさない", { skip: process.platform === "win32" }, () => {
	//  最初の検査が見張りを残して終わる。見張りは、入口が最初の検査を回収したのを見てから入口へ SIGTERM を送る
	//  （kill -0 は回収されるまで成功する）。指示は、検査と検査の間に届く
	for (let i = 0; i < 12; i++) {
		const dir = fakeTools();
		const ran = join(dir, "ran");
		writeFileSync(
			join(dir, "lint-spec/lint-spec.mjs"),
			`import { spawn } from "node:child_process";\n` +
				`spawn("sh", ["-c", "i=0; while kill -0 " + process.pid + " 2>/dev/null && [ $i -lt 200000 ]; do i=$((i+1)); done; kill -TERM " + process.ppid], { detached: true, stdio: "ignore" }).unref();\n` +
				`setTimeout(() => process.exit(0), 30);\n`,
		);
		for (const s of ["lint-refs/lint-refs.mjs", "lint-git-branch/lint-git-branch.mjs"]) {
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
	writeFileSync(join(dir, "lint-spec/lint-spec.mjs"), `setTimeout(() => {}, 300);\n`);
	for (const s of ["lint-refs/lint-refs.mjs", "lint-git-branch/lint-git-branch.mjs"]) {
		writeFileSync(join(dir, s), `import { appendFileSync } from "node:fs";\nappendFileSync(${JSON.stringify(ran)}, "x");\n`);
	}
	const r = spawnSync("bash", ["-c", `"${process.execPath}" "${ENTRY}" lint | true; exit \${PIPESTATUS[0]}`], { encoding: "utf8", env: { ...process.env, HARNESS_TOOLS_DIR: dir } });
	assert.equal(r.status, 1, r.stderr);
	assert.doesNotMatch(r.stderr, /EPIPE|Unhandled/);
	assert.ok(!existsSync(ran), "出力先が閉じた後に残りの検査が実行された");
});

test("標準入力はコマンドに届く（フックは標準入力の JSON を読む）", () => {
	const dir = fakeTools();
	writeFileSync(join(dir, "guard/guard.mjs"), `process.stdin.pipe(process.stdout);\n`);
	const r = spawnSync(process.execPath, [ENTRY, "guard"], { encoding: "utf8", input: '{"tool_name":"Write"}', env: { ...process.env, HARNESS_TOOLS_DIR: dir } });
	assert.equal(r.stdout, '{"tool_name":"Write"}');
});
