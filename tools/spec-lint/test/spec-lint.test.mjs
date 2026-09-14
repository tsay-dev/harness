//
//  spec-lint の回帰テスト（node --test tools/spec-lint/test/）。
//  fixture の最小 docs を一時ディレクトリに書き、validate --strict の終了コードと出力で判定する。
//
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeMinimalDocs, runNode, SPEC_LINT } from "./fixture.mjs";

//  一時ルートで validate --strict を走らせる（cwd はホストのルート ＝ DEFERRED の対象パスの基準）
function validate(opts = {}) {
	const root = mkdtempSync(join(tmpdir(), "spec-lint-"));
	try {
		writeMinimalDocs(root, opts);
		const r = runNode(SPEC_LINT, ["validate", "--strict"], { cwd: root });
		return { ...r, out: r.stdout + r.stderr };
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const TARGET = "docs/goals/GOAL-01-a/UC-001-b/REQ-001.md";
const row = (id, { date = daysAgo(1), target = TARGET, promote = "未定" } = {}) =>
	`| ${id} | ${date} | reviewer | ${target} | 「速やかに」の観測基準が文にない | 閾値が NFR に無い | ${promote} |`;

test("素の fixture は validate --strict を通る", () => {
	const r = validate();
	assert.equal(r.status, 0, r.out);
});

test("operation 直下の未知のキー（x-* 含む）は err", () => {
	const r = validate({ contractExtra: "x-evaluation-order: [a, b]" });
	assert.equal(r.status, 1, r.out);
	assert.match(r.out, /未知のキー "x-evaluation-order"/);
});

test("errors[] の項目に code / when / wire 以外のキーがあれば err", () => {
	const r = validate({
		contractErrors: `- code: INVALID_INPUT
  when: name が空
  wire: { status: 400 }
  note: 余計`,
	});
	assert.equal(r.status, 1, r.out);
	assert.match(r.out, /未知のキー "note"/);
});

test("fixed の契約は errors の各 code を返す examples が要る", () => {
	const r = validate({
		contractErrors: `- code: INVALID_INPUT
  when: name が空
  wire: { status: 400 }
- code: NOT_FOUND
  when: 親が無い
  wire: { status: 404 }`,
	});
	assert.equal(r.status, 1, r.out);
	assert.match(r.out, /errors\["NOT_FOUND"\] を返す examples が無い/);
});

test("draft の契約では errors ⊆ examples を要求しない", () => {
	const r = validate({
		status: "draft",
		contractErrors: `- code: INVALID_INPUT
  when: name が空
  wire: { status: 400 }
- code: NOT_FOUND
  when: 親が無い
  wire: { status: 404 }`,
	});
	assert.equal(r.status, 0, r.out);
});

test("DEFERRED.md: 正しい 1 行は通る", () => {
	const r = validate({ deferredRows: [row("DEF-001")] });
	assert.equal(r.status, 0, r.out);
});

test("DEFERRED.md: 空の表（ヘッダのみ）は通る", () => {
	const r = validate({ deferredRows: [] });
	assert.equal(r.status, 0, r.out);
});

test("DEFERRED.md: 昇格先が語彙外なら err", () => {
	const r = validate({ deferredRows: [row("DEF-001", { promote: "後で" })] });
	assert.equal(r.status, 1, r.out);
	assert.match(r.out, /DEF-001: 昇格先は .* のいずれか。実際: "後で"/);
});

test("DEFERRED.md: 同じ対象に 3 件以上積もれば warn", () => {
	const r = validate({ deferredRows: [row("DEF-001"), row("DEF-002"), row("DEF-003")] });
	assert.equal(r.status, 0, r.out);
	assert.match(r.out, /3 件（3 件以上）— 機械検査への昇格候補/);
});

test("DEFERRED.md: 起票から 30 日を超えた行は warn", () => {
	const r = validate({ deferredRows: [row("DEF-001", { date: daysAgo(40) })] });
	assert.equal(r.status, 0, r.out);
	assert.match(r.out, /DEF-001: 起票から 40 日（30 日超）/);
});

test("DEFERRED.md: 列数が 7 でなければ err", () => {
	const r = validate({ deferredRows: [`| DEF-001 | ${daysAgo(1)} | reviewer | ${TARGET} | 指摘 | 理由 |`] });
	assert.equal(r.status, 1, r.out);
	assert.match(r.out, /列数が 6/);
});

test("DEFERRED.md: ID 重複・未来の起票日・存在しない対象", () => {
	const r = validate({
		deferredRows: [row("DEF-001"), row("DEF-001", { date: daysAgo(-3) }), row("DEF-002", { target: "docs/nowhere.md" })],
	});
	assert.equal(r.status, 1, r.out);
	assert.match(r.out, /DEF-001: ID が重複している/);
	assert.match(r.out, /DEF-001: 起票日 \d{4}-\d{2}-\d{2} が未来/);
	assert.match(r.out, /DEF-002: 対象 "docs\/nowhere.md" が存在しない/);
});

test("DEFERRED.md: status は living のみ", () => {
	const root = mkdtempSync(join(tmpdir(), "spec-lint-"));
	try {
		writeMinimalDocs(root, { deferredRows: [] });
		//  fixture の外で status だけ書き換える
		const file = join(root, "docs/verification/DEFERRED.md");
		writeFileSync(file, readFileSync(file, "utf8").replace("status: living", "status: draft"));
		const r = runNode(SPEC_LINT, ["validate", "--strict"], { cwd: root });
		assert.equal(r.status, 1, r.stdout + r.stderr);
		assert.match(r.stdout + r.stderr, /status は living のいずれか。実際: "draft"/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
