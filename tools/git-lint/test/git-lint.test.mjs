//
//  git-lint のテスト（node --test）。
//  一時ディレクトリに最小の host（traceconfig.json と、必要なら git リポジトリ）を組み立て、
//  終了コードと出力を検証する。ディスク上の fixture は持たない。
//

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = join(HERE, "..", "git-lint.mjs");
const COMMIT_MD = join(HERE, "..", "..", "..", "packages", "develop-core", ".apm", "skills", "develop", "references", "commit.md");

const MONO = { git: { units: { "app-a": "apps/a", ui: "packages/ui" }, exempt_branches: ["dependabot/**"] } };
const SINGLE = { git: {} };

//  host を組む。config が null なら traceconfig.json を置かない
function host(t, config, dirs = ["apps/a", "packages/ui"]) {
	const root = mkdtempSync(join(tmpdir(), "harness git-lint "));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	for (const d of dirs) mkdirSync(join(root, d), { recursive: true });
	if (config !== null) writeFileSync(join(root, "traceconfig.json"), JSON.stringify(config));
	return root;
}

const run = (root, ...args) => spawnSync("node", [TOOL, ...args, "--root", root], { encoding: "utf8" });

function git(root, ...args) {
	const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], {
		cwd: root,
		encoding: "utf8",
	});
	assert.equal(r.status, 0, r.stderr);
	return r.stdout.trim();
}

function message(t, root, text) {
	const file = join(root, "MSG");
	writeFileSync(file, text);
	return run(root, "message", "--file", file, "--branch", "app-a/add-login");
}

test("git 未宣言: 検査していないと明示して 0（pass とは書かない）", (t) => {
	const root = host(t, {});
	const r = run(root, "branch", "--name", "whatever");
	assert.equal(r.status, 0);
	assert.match(r.stdout, /未宣言.*検査は行われていない/);
	assert.doesNotMatch(r.stdout, /OK/);
});

test("モノレポ: <unit>/<topic> と repo/<topic> は通る", (t) => {
	const root = host(t, MONO);
	for (const name of ["app-a/add-login", "ui/fix-button-focus", "repo/bump-eslint"]) {
		const r = run(root, "branch", "--name", name);
		assert.equal(r.status, 0, `${name}: ${r.stderr}`);
		assert.match(r.stdout, /ブランチ名 OK/);
	}
});

test("モノレポ: 形・接頭辞・topic の違反はコードつきで 1", (t) => {
	const root = host(t, MONO);
	const cases = [
		["main", /B1/],
		["app-a", /B1/],
		["app-a/main/add-login", /B1/],
		["feat/add-login", /B2.*app-a \/ ui \/ repo/],
		["app-b/add-login", /B2/],
		["app-a/login", /B3/],
		["app-a/Add-Login", /B3/],
		["app-a/add_login", /B3/],
		["app-a/a-b-c-d-e-f", /B3/],
	];
	for (const [name, re] of cases) {
		const r = run(root, "branch", "--name", name);
		assert.equal(r.status, 1, name);
		assert.match(r.stderr, re, name);
	}
});

test("単一ユニット: <type>/<topic> を求め、unit 名の接頭辞は通さない", (t) => {
	const root = host(t, SINGLE);
	assert.equal(run(root, "branch", "--name", "feat/add-login").status, 0);
	assert.equal(run(root, "branch", "--name", "fix/spec-lint-multi-table-header").status, 0);
	const r = run(root, "branch", "--name", "app-a/add-login");
	assert.equal(r.status, 1);
	assert.match(r.stderr, /B2.*コミットの type/);
});

test("exempt_branches に一致するブランチは検査しない（名前もメッセージも）", (t) => {
	const root = host(t, MONO);
	const b = run(root, "branch", "--name", "dependabot/npm_and_yarn/lodash-4.17.21");
	assert.equal(b.status, 0);
	assert.match(b.stdout, /検査していない/);
	const file = join(root, "MSG");
	writeFileSync(file, "Bump lodash from 4.17.20 to 4.17.21\n");
	const m = run(root, "message", "--file", file, "--branch", "dependabot/npm_and_yarn/lodash-4.17.21");
	assert.equal(m.status, 0);
	assert.match(m.stdout, /検査していない/);
});

test("--name が無ければ現在のブランチを見る。detached HEAD は 2", (t) => {
	const root = host(t, SINGLE);
	git(root, "init", "-q", "-b", "main");
	git(root, "commit", "-q", "--allow-empty", "-m", "chore: 初期化する");
	const onMain = run(root, "branch");
	assert.equal(onMain.status, 1);
	assert.match(onMain.stderr, /B1 main/);
	git(root, "switch", "-q", "-c", "feat/add-login");
	assert.equal(run(root, "branch").status, 0);
	git(root, "switch", "-q", "--detach");
	const detached = run(root, "branch");
	assert.equal(detached.status, 2);
	assert.match(detached.stderr, /--name/);
});

test("メッセージ: モノレポでは type と unit の scope が要る", (t) => {
	const root = host(t, MONO);
	assert.equal(message(t, root, "feat(app-a): ログインを追加する\n\n本文。\n").status, 0);
	assert.equal(message(t, root, "# コメント行\n\nfix(repo)!: CI を直す\n").status, 0);
	const cases = [
		["ログインを追加する", /M1/],
		["feature(app-a): ログインを追加する", /M1.*閉じた語彙/],
		["feat(app-a): ログインを追加する。", /M2/],
		["feat(app-a): add login.", /M2/],
		["feat: ログインを追加する", /M3.*scope が無い/],
		["feat(auth): ログインを追加する", /M3.*宣言された unit でない/],
		["", /M1.*件名が無い/],
	];
	for (const [text, re] of cases) {
		const r = message(t, root, text);
		assert.equal(r.status, 1, text);
		assert.match(r.stderr, re, text);
	}
});

test("メッセージ: 単一ユニットでは scope は任意で自由", (t) => {
	const root = host(t, SINGLE);
	const file = join(root, "MSG");
	for (const text of ["feat: ログインを追加する", "feat(auth): ログインを追加する"]) {
		writeFileSync(file, text);
		assert.equal(run(root, "message", "--file", file, "--branch", "feat/add-login").status, 0, text);
	}
});

test("--range: 範囲の各コミットを検査し、マージと Revert は対象外にする", (t) => {
	const root = host(t, MONO);
	git(root, "init", "-q", "-b", "main");
	git(root, "commit", "-q", "--allow-empty", "-m", "chore(repo): 初期化する");
	const base = git(root, "rev-parse", "HEAD");
	git(root, "switch", "-q", "-c", "app-a/add-login");
	git(root, "commit", "-q", "--allow-empty", "-m", "feat(app-a): ログインを追加する");
	git(root, "commit", "-q", "--allow-empty", "-m", 'Revert "feat(app-a): ログインを追加する"');
	const ok = run(root, "message", "--range", `${base}..HEAD`);
	assert.equal(ok.status, 0, ok.stderr);
	assert.match(ok.stdout, /コミットメッセージ OK: 1 件/);
	assert.match(ok.stdout, /git が作る文面/);

	git(root, "commit", "-q", "--allow-empty", "-m", "wip");
	const bad = run(root, "message", "--range", `${base}..HEAD`);
	assert.equal(bad.status, 1);
	assert.match(bad.stderr, /M1 [0-9a-f]{7}: .*wip/);
	assert.match(bad.stderr, /違反 1 件/);

	const broken = run(root, "message", "--range", "no-such-ref..HEAD");
	assert.equal(broken.status, 2);
});

test("設定・引数の異常は 2", (t) => {
	const cases = [
		[{ git: [] }, /オブジェクト/],
		[{ git: { units: {} } }, /units が空/],
		[{ git: { units: { repo: "apps/a" } } }, /予約名/],
		[{ git: { units: { App: "apps/a" } } }, /ケバブケース/],
		[{ git: { units: { "app-b": "apps/b" } } }, /ディレクトリ apps\/b が無い/],
		[{ git: { exempt_branches: "dependabot/**" } }, /配列/],
	];
	for (const [config, re] of cases) {
		const r = run(host(t, config), "branch", "--name", "app-a/add-login");
		assert.equal(r.status, 2, JSON.stringify(config));
		assert.match(r.stderr, re);
	}
	const root = host(t, MONO);
	assert.equal(run(host(t, null), "branch", "--name", "app-a/add-login").status, 2);
	assert.equal(run(root, "nope").status, 2);
	assert.equal(run(root, "branch", "--bogus", "x").status, 2);
	assert.equal(run(root, "message").status, 2);
	assert.equal(run(root, "message", "--file", join(root, "missing")).status, 2);
});

test("type の閉じた語彙は commit.md の表と一致する", (t) => {
	//  表の 1 列目のバッククォート語が語彙。ツール側は M1 の文面に語彙を全部出す
	const md = readFileSync(COMMIT_MD, "utf8");
	const table = md.slice(md.indexOf("### The types"), md.indexOf("### Rules for the subject"));
	const documented = [];
	for (const line of table.split("\n")) {
		if (!line.startsWith("| `")) continue;
		for (const m of line.split("|")[1].matchAll(/`([a-z]+)`/g)) documented.push(m[1]);
	}
	assert.ok(documented.length > 0, "commit.md の type 表が読めない");

	const root = host(t, SINGLE);
	const file = join(root, "MSG");
	writeFileSync(file, "nope: 何かする");
	const r = run(root, "message", "--file", file, "--branch", "feat/add-login");
	const listed = /使えるのは (.+?)）/.exec(r.stderr)[1].split(" / ");
	assert.deepEqual([...listed].sort(), [...documented].sort());
});
