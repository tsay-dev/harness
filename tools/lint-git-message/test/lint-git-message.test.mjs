//  lint git message のテスト（node --test）。一時ディレクトリに最小の host を組み立て、終了コードと出力を検証する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HERE, MONO, SINGLE, host, run, git, message } from "../../_shared/test/git-fixture.mjs";

const COMMIT_MD = join(HERE, "..", "..", "..", "packages", "develop-core", ".apm", "skills", "develop", "references", "commit.md");

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

test("type の閉じた語彙は commit.md の表と一致する", (t) => {
	//  表の 1 列目のバッククォート語が語彙。ツール側は M1 の文面に語彙を全部出す
	const md = readFileSync(COMMIT_MD, "utf8");
	const table = md.slice(md.indexOf("### type 一覧"), md.indexOf("### subject（要約行）の規則"));
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
