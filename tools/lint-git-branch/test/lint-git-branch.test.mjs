//  lint git branch のテスト（node --test）。一時ディレクトリに最小の host を組み立て、終了コードと出力を検証する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { MONO, SINGLE, host, run, git, message } from "../../_shared/test/git-fixture.mjs";

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
	assert.equal(run(root, "branch", "--name", "fix/lint-spec-multi-table-header").status, 0);
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
	assert.equal(run(root, "branch", "nope").status, 2);
	assert.equal(run(root, "branch", "--bogus", "x").status, 2);
	assert.equal(run(root, "message").status, 2);
	assert.equal(run(root, "message", "--file", join(root, "missing")).status, 2);
});
