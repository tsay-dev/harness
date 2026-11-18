//
//  lint git uc の回帰テスト（node --test tools/lint-git-uc/test/）。
//  fixture の最小 docs を一時ディレクトリに書き、コミットが指す UC の状態の判定を、終了コードと出力で確かめる。
//
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeMinimalDocs, runNode, LINT_GIT_UC } from "../../_shared/test/spec-fixture.mjs";

//  ---- gate（UC: トレーラ） -------------------------------------------------------
//  layout: { "<docs を置くディレクトリ（ホスト直下は "."）>": 契約の x-status }
//  units:  harness.config.json の git.units（null なら harness.config.json を置かない ＝ 単一ユニット）
function gate(args, { layout = { ".": "fixed" }, units = null, message = null } = {}) {
	const root = mkdtempSync(join(tmpdir(), "lint-git-uc-"));
	try {
		for (const [dir, status] of Object.entries(layout)) writeMinimalDocs(join(root, dir), { status });
		if (units) writeFileSync(join(root, "harness.config.json"), JSON.stringify({ git: { units } }));
		if (message !== null) writeFileSync(join(root, "msg.txt"), message);
		const r = runNode(LINT_GIT_UC, args, { cwd: root });
		return { ...r, out: r.stdout + r.stderr };
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

const UNITS = { "app-a": "apps/a", "app-b": "apps/b" };
const commit = (header, trailer = "UC: UC-001") => `${header}\n\n本文\n\n${trailer}\n`;

test("gate: 単一ユニットでは cwd 直下の docs で UC を引く", () => {
	const ok = gate(["--message", "msg.txt"], { message: commit("feat(auth): ログインを足す") });
	assert.equal(ok.status, 0, ok.out);
	const draft = gate(["--message", "msg.txt"], { layout: { ".": "draft" }, message: commit("feat(auth): ログインを足す") });
	assert.equal(draft.status, 1, draft.out);
	assert.match(draft.out, /UC-001: 契約が fixed でない/);
});

test("gate: モノレポでは scope の unit の docs で UC を引く（同じ番号が別 unit にあっても混ざらない）", () => {
	const layout = { "apps/a": "fixed", "apps/b": "draft" };
	const a = gate(["--message", "msg.txt"], { layout, units: UNITS, message: commit("feat(app-a): ログインを足す") });
	assert.equal(a.status, 0, a.out);
	const b = gate(["--message", "msg.txt"], { layout, units: UNITS, message: commit("feat(app-b): ログインを足す") });
	assert.equal(b.status, 1, b.out);
	assert.match(b.out, /UC-001: 契約が fixed でない/);
});

test("gate: モノレポで UC が scope の unit に無ければ、その unit の docs を指して落とす", () => {
	const r = gate(["--message", "msg.txt"], { layout: { "apps/a": "fixed" }, units: UNITS, message: commit("feat(app-b): ログインを足す") });
	assert.equal(r.status, 1, r.out);
	assert.match(r.out, /UC-001: 対応する UC が無い（apps\/b\/docs\/goals\//);
});

test("gate: モノレポで UC: を付けたコミットの scope が unit でなければ落とす（repo・scope なし・未宣言）", () => {
	for (const [header, shown] of [
		["chore(repo): 依存を上げる", "repo"],
		["feat: ログインを足す", "（なし）"],
		["feat(auth): ログインを足す", "auth"],
	]) {
		const r = gate(["--message", "msg.txt"], { layout: { "apps/a": "fixed" }, units: UNITS, message: commit(header) });
		assert.equal(r.status, 1, r.out);
		assert.ok(r.out.includes(`UC-001: コミットの scope ${shown} が unit でない`), r.out);
		assert.match(r.out, /app-a \/ app-b/);
	}
});

test("gate: UC: トレーラの無いコミットは、モノレポでも scope に関係なく素通りする", () => {
	const r = gate(["--message", "msg.txt"], { layout: {}, units: UNITS, message: commit("chore(repo): 依存を上げる", "Refs: #1") });
	assert.equal(r.status, 0, r.out);
});

test("gate: commit-msg ファイルの # 行は 1 行目として読まない", () => {
	const r = gate(["--message", "msg.txt"], { layout: { "apps/a": "fixed" }, units: UNITS, message: "# コメント\n" + commit("feat(app-a): ログインを足す") });
	assert.equal(r.status, 0, r.out);
});

test("gate: モノレポの --uc は --unit で unit を決める", () => {
	const layout = { "apps/a": "fixed", "apps/b": "draft" };
	const none = gate(["--uc", "UC-001"], { layout, units: UNITS });
	assert.equal(none.status, 2, none.out);
	assert.match(none.out, /--unit <名前> が要る（使えるのは app-a \/ app-b）/);
	const a = gate(["--uc", "UC-001", "--unit", "app-a"], { layout, units: UNITS });
	assert.equal(a.status, 0, a.out);
	const b = gate(["--uc", "UC-001", "--unit", "app-b"], { layout, units: UNITS });
	assert.equal(b.status, 1, b.out);
	const unknown = gate(["--uc", "UC-001", "--unit", "repo"], { layout, units: UNITS });
	assert.equal(unknown.status, 2, unknown.out);
});

test("gate: --unit は単一ユニットのホストと --message では使えない", () => {
	const single = gate(["--uc", "UC-001", "--unit", "app-a"]);
	assert.equal(single.status, 2, single.out);
	const withMessage = gate(["--message", "msg.txt", "--unit", "app-a"], { layout: { "apps/a": "fixed" }, units: UNITS, message: commit("feat(app-a): ログインを足す") });
	assert.equal(withMessage.status, 2, withMessage.out);
});

test("gate: git.units から unit を読めない harness.config.json は設定異常（2）", () => {
	const r = gate(["--message", "msg.txt"], { layout: { "apps/a": "fixed" }, units: {}, message: commit("feat(app-a): ログインを足す") });
	assert.equal(r.status, 2, r.out);
	assert.match(r.out, /git\.units から unit を読めない/);
});
