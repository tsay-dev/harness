//
//  lint spec の回帰テスト（node --test tools/lint-spec/test/）。
//  fixture の最小 docs を一時ディレクトリに書き、終了コードと出力で判定する。
//
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { writeMinimalDocs, runNode, LINT_SPEC } from "../../_shared/test/spec-fixture.mjs";

//  一時ルートで validate を走らせる（cwd はホストのルート ＝ DEFERRED の対象パスの基準）
function validate(opts = {}) {
	const root = mkdtempSync(join(tmpdir(), "lint-spec-"));
	try {
		writeMinimalDocs(root, opts);
		for (const [rel, text] of Object.entries(opts.hostFiles ?? {})) {
			mkdirSync(dirname(join(root, rel)), { recursive: true });
			writeFileSync(join(root, rel), text);
		}
		const r = runNode(LINT_SPEC, [], { cwd: root });
		return { ...r, out: r.stdout + r.stderr };
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
}

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const TARGET = "docs/goals/GOAL-01-a/UC-001-b/REQ-001.md";
const row = (id, { date = daysAgo(1), target = TARGET, promote = "未定" } = {}) =>
	`| ${id} | ${date} | reviewer | ${target} | 「速やかに」の観測基準が文にない | 閾値が NFR に無い | ${promote} |`;

test("素の fixture は validate を通る", () => {
	const r = validate();
	assert.equal(r.status, 0, r.out);
});

//  ---- ADR の置き換え ----
const adr = (id, status, supersedes = null) =>
	`---\nid: ${id}\ntitle: 決定\nstatus: ${status}\ndate: 2026-01-01\n${supersedes ? `supersedes: ${supersedes}\n` : ""}---\n\n# ${id} 決定\n\n## Context\n\n経緯。\n\n## Decision\n\n決めたこと。\n\n## Consequences\n\n結果。\n\n## 却下した選択肢\n\n- **別の案**: 採らない理由。\n`;
const adrFiles = (oldStatus, newStatus) => ({
	"docs/adr/ADR-0001-old.md": adr("ADR-0001", oldStatus),
	"docs/adr/ADR-0002-new.md": adr("ADR-0002", newStatus, "ADR-0001"),
});

test("ADR: accepted の ADR が置き換えた ADR は superseded でなければ err", () => {
	const r = validate({ hostFiles: adrFiles("accepted", "accepted") });
	assert.equal(r.status, 1, r.out);
	assert.match(r.out, /ADR-0002（accepted）が ADR-0001 を置き換えているのに、ADR-0001 の status が accepted/);
});

test("ADR: 置き換えた側がさらに置き換えられて superseded になっていても、最初の ADR は superseded でなければ err", () => {
	const r = validate({
		hostFiles: {
			"docs/adr/ADR-0001-first.md": adr("ADR-0001", "accepted"),
			"docs/adr/ADR-0002-second.md": adr("ADR-0002", "superseded", "ADR-0001"),
			"docs/adr/ADR-0003-third.md": adr("ADR-0003", "accepted", "ADR-0002"),
		},
	});
	assert.equal(r.status, 1, r.out);
	assert.match(r.out, /ADR-0002（superseded）が ADR-0001 を置き換えているのに、ADR-0001 の status が accepted/);
});

test("ADR: 置き換えられた側が superseded なら通る", () => {
	const r = validate({ hostFiles: adrFiles("superseded", "accepted") });
	assert.equal(r.status, 0, r.out);
});

test("ADR: 置き換える側が proposed の間は、置き換えられる側が accepted のままでも通る", () => {
	const r = validate({ hostFiles: adrFiles("accepted", "proposed") });
	assert.equal(r.status, 0, r.out);
});

test("baseline は持たない: 台帳ファイルがあっても違反は失敗し、廃止したフラグは使い方エラー（ADR-0056）", () => {
	const key = "docs/goals/GOAL-01-a/UC-001-b/contract.yaml: 未知のキー";
	const r = validate({ contractExtra: "x-evaluation-order: [a, b]", hostFiles: { ".spec-baseline.json": JSON.stringify([key]) } });
	assert.equal(r.status, 1, r.out);
	assert.match(r.out, /\.spec-baseline\.json: baseline は廃止した/);
	//  空の作業場所で実行する（一時フォルダの親を作業場所にすると、ほかのテストの入力まで畳んでしまう）
	const empty = mkdtempSync(join(tmpdir(), "lint-spec-empty-"));
	for (const flag of ["--strict", "--update-baseline"]) {
		const u = runNode(LINT_SPEC, [flag], { cwd: empty });
		assert.equal(u.status, 2, u.stdout + u.stderr);
		assert.match(u.stderr, new RegExp(`${flag} は廃止した`));
	}
	rmSync(empty, { recursive: true, force: true });
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

test("DEFERRED.md: 残っている件数を 1 行で示す。行ごとの古さ・積もり方の警告は出さない（ADR-0068）", () => {
	const r = validate({ deferredRows: [row("DEF-001", { date: daysAgo(40) }), row("DEF-002"), row("DEF-003")] });
	assert.equal(r.status, 0, r.out);
	assert.match(r.out, /凍結済みの保留が 3 件残っている/);
	assert.doesNotMatch(r.out, /昇格候補|30 日超/);
	assert.doesNotMatch(validate({ deferredRows: [] }).out, /凍結済みの保留が/);
});

test("DEFERRED.md: frozen_at より後の起票日の行は err（保留を新しく足さない / ADR-0068）", () => {
	const late = validate({ deferredRows: [row("DEF-001", { date: daysAgo(1) })], frozenAt: daysAgo(5) });
	assert.equal(late.status, 1, late.out);
	assert.match(late.out, /DEF-001: 起票日 .* が frozen_at（.*）より後 — 保留は新しく足さない/);
	//  凍結した日と同じ日・それより前の行は通る
	assert.equal(validate({ deferredRows: [row("DEF-001", { date: daysAgo(5) }), row("DEF-002", { date: daysAgo(9) })], frozenAt: daysAgo(5) }).status, 0);
});

test("DEFERRED.md: frozen_at が無い・日付でない・先の日付なら err", () => {
	const none = validate({ deferredRows: [row("DEF-001")], frozenAt: null });
	assert.equal(none.status, 1, none.out);
	assert.match(none.out, /ERROR .*frozen_at が無い — 保留の一覧は凍結済み/);
	for (const [frozenAt, message] of [
		["2026/11/18", /frozen_at は YYYY-MM-DD/],
		["2026-02-31", /frozen_at は YYYY-MM-DD/], //  実在しない日付
		["2999-01-01", /frozen_at 2999-01-01 が未来/],
		[daysAgo(-2), /が未来/], //  余裕は 1 日だけ
	]) {
		const r = validate({ deferredRows: [], frozenAt });
		assert.equal(r.status, 1, `${frozenAt}: ${r.out}`);
		assert.match(r.out, message);
	}
	//  UTC より進んだ時刻帯で凍結した当日の日付（UTC では明日）は通す
	assert.equal(validate({ deferredRows: [], frozenAt: daysAgo(-1) }).status, 0);
	//  件数は行の数（ID の重複した行・ID が不正な行も 1 件ずつ数える）
	assert.match(validate({ deferredRows: [row("DEF-001"), row("DEF-001"), row("DEF-x")] }).out, /凍結済みの保留が 3 件残っている/);
	//  起票日も、実在しない日付は err
	const fake = validate({ deferredRows: [row("DEF-001", { date: "2026-02-31" })] });
	assert.equal(fake.status, 1, fake.out);
	assert.match(fake.out, /DEF-001: 起票日は YYYY-MM-DD/);
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
	const root = mkdtempSync(join(tmpdir(), "lint-spec-"));
	try {
		writeMinimalDocs(root, { deferredRows: [] });
		//  fixture の外で status だけ書き換える
		const file = join(root, "docs/verification/DEFERRED.md");
		writeFileSync(file, readFileSync(file, "utf8").replace("status: living", "status: draft"));
		const r = runNode(LINT_SPEC, [], { cwd: root });
		assert.equal(r.status, 1, r.stdout + r.stderr);
		assert.match(r.stdout + r.stderr, /status は living のいずれか。実際: "draft"/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

const linesOf = (n) => Array.from({ length: n }, (_, i) => `行 ${i + 1}`).join("\n") + "\n";

test("作業指針: 150 行の CLAUDE.md / AGENTS.md は通る", () => {
	const r = validate({ hostFiles: { "CLAUDE.md": linesOf(150), "AGENTS.md": linesOf(150) } });
	assert.equal(r.status, 0, r.out);
});

test("作業指針: 150 行を超える CLAUDE.md・AGENTS.md はそれぞれ err（R-1010）", () => {
	const r = validate({ hostFiles: { "CLAUDE.md": linesOf(151), "AGENTS.md": linesOf(200) } });
	assert.equal(r.status, 1, r.out);
	assert.match(r.out, /CLAUDE\.md: 作業指針が 150 行を超える/);
	assert.match(r.out, /AGENTS\.md: 作業指針が 150 行を超える/);
});

test("frontmatter の曖昧な書き方（先頭が空白の行、キーの重複、区切りもどき）は違反（ADR-0056）", () => {
	const root = mkdtempSync(join(tmpdir(), "lint-spec-"));
	try {
		writeMinimalDocs(root);
		//  UC.md の frontmatter で確かめる（REQ は UC.md の「要件」の節の小節で、frontmatter を持たない）
		const file = join(root, "docs/goals/GOAL-01-a/UC-001-b/UC.md");
		writeFileSync(file, readFileSync(file, "utf8").replace(/^status: (\w+)(.*)$/m, "status: draft\n status: $1\nstatus: $1"));
		const r = runNode(LINT_SPEC, [], { cwd: root });
		const out = r.stdout + r.stderr;
		assert.equal(r.status, 1, out);
		assert.match(out, /先頭が空白の行がある/);
		assert.match(out, /キー "status" が重複している/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("docs/goals が無ければ設定エラー（exit 2）、アクターの種別は 人間 / システム で始める", () => {
	const root = mkdtempSync(join(tmpdir(), "lint-spec-"));
	try {
		const r = runNode(LINT_SPEC, [], { cwd: root });
		assert.equal(r.status, 2, r.stdout + r.stderr);
		assert.match(r.stderr, /docs\/goals が無い/);
		writeMinimalDocs(root);
		const ov = join(root, "docs/00-overview.md");
		const actors = (kind) => readFileSync(ov, "utf8").replace(/(## アクター[^\n]*\n\n\| ID[^\n]*\n\| ---[^\n]*\n)(\| ACT-01 [^\n]*\n)?/, `$1| ACT-01 | 利用者 | ${kind} | 登録する |\n`);
		runNode(LINT_SPEC, [], { cwd: root }); //  入力の GOAL.md を概要に畳む
		writeFileSync(ov, actors("利用者（人間）"));
		const bad = runNode(LINT_SPEC, [], { cwd: root });
		assert.match(bad.stdout + bad.stderr, /ACT-01: 種別は 人間 \/ システム のどちらかで始める/);
		writeFileSync(ov, actors("人間 / 認証済"));
		const good = runNode(LINT_SPEC, [], { cwd: root });
		assert.doesNotMatch(good.stdout + good.stderr, /種別は/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

//  ---- stream（持続する接続のメッセージ）と events（ADR-0061）----

//  move（送るメッセージ）と avatarMoved / avatarLeft（届くイベント）を持つ契約。各テストは 1 箇所だけ置き換える
const STREAM_CONTRACT = `x-uc: UC-001
x-status: fixed
x-spec: ./UC.md
x-updated: 2026-09-01

observers:
  neighbor: 同じ場所を見ている別の利用者

operations:
  move:
    transport: stream
    direction: outbound
    owned: true
    auth: none
    summary: 位置を動かす
    entry: move
    request:
      type: object
      required: [x]
      properties:
        x: { type: integer }
    response:
      type: object
      required: [x]
      properties:
        x: { type: integer }
    errors:
      - code: INVALID_INPUT
        when: 動けない位置
    examples:
      ok:
        request: { x: 3 }
        response: { x: 3 }
        events:
          self: []
          neighbor:
            - { entry: avatarMoved, payload: { userId: u1, x: 3 } }
      invalid:
        request: { x: -1 }
        error: INVALID_INPUT
        events: { self: [], neighbor: [] }
  avatarMoved:
    transport: stream
    direction: inbound
    owned: true
    auth: none
    summary: ほかの利用者が動いた
    entry: avatarMoved
    request:
      type: object
      required: [userId, x]
      properties:
        userId: { type: string }
        x: { type: integer }
  avatarLeft:
    transport: stream
    direction: inbound
    owned: true
    auth: none
    summary: ほかの利用者が去った
    entry: avatarLeft
    request:
      type: object
      required: [userId]
      properties:
        userId: { type: string }
    examples:
      graceExpired:
        events:
          neighbor:
            - { entry: avatarLeft, payload: { userId: u1 } }
`;

const streamWith = (from, to) => {
	assert.ok(STREAM_CONTRACT.includes(from), `置換元が fixture に無い: ${from}`);
	return validate({ contract: STREAM_CONTRACT.replace(from, to) });
};

test("stream: 送るメッセージ・届くイベント・観測者ごとの events を持つ契約は通る", () => {
	const r = validate({ contract: STREAM_CONTRACT });
	assert.equal(r.status, 0, r.out);
});

test("stream: entry が無ければ err", () => {
	const r = streamWith("    entry: move\n", "");
	assert.equal(r.status, 1, r.out);
	assert.match(r.out, /operations\.move: transport が stream なら entry/);
});

test("stream: fixed の例が events を省略すれば err（届かないなら [] と書く）", () => {
	const r = streamWith("        events: { self: [], neighbor: [] }\n", "");
	assert.equal(r.status, 1, r.out);
	assert.match(r.out, /examples\.invalid に events が無い/);
});

test("stream: events の観測者が observers に無ければ err、self は宣言できない", () => {
	const a = streamWith("events: { self: [], neighbor: [] }", "events: { self: [], stranger: [] }");
	assert.equal(a.status, 1, a.out);
	assert.match(a.out, /観測者 "stranger" が observers に無い/);
	const b = streamWith("  neighbor: 同じ場所を見ている別の利用者", "  neighbor: 同じ場所を見ている別の利用者\n  self: 本人");
	assert.equal(b.status, 1, b.out);
	assert.match(b.out, /"self" は予約語/);
});

test("stream: events の entry が届くイベントを指さない / payload が形に合わなければ err", () => {
	const a = streamWith("{ entry: avatarMoved, payload: { userId: u1, x: 3 } }", "{ entry: avatarJumped, payload: { userId: u1, x: 3 } }");
	assert.equal(a.status, 1, a.out);
	assert.match(a.out, /entry "avatarJumped" を持つ届くイベント/);
	const b = streamWith("{ entry: avatarMoved, payload: { userId: u1, x: 3 } }", "{ entry: avatarMoved, payload: { userId: u1, y: 3 } }");
	assert.equal(b.status, 1, b.out);
	assert.match(b.out, /payload の "y" が operations\.avatarMoved の request\.properties に無い/);
	assert.match(b.out, /payload に必須の "x" が無い/);
});

test("stream: どの例の events にも現れない届くイベントは err", () => {
	const r = streamWith("            - { entry: avatarMoved, payload: { userId: u1, x: 3 } }\n", "            - { entry: avatarLeft, payload: { userId: u1 } }\n");
	assert.equal(r.status, 1, r.out);
	assert.match(r.out, /operations\.avatarMoved: 届くイベント "avatarMoved" がどの例の events にも現れない/);
});

test("stream: 届くイベントは response / errors を持てず、自身の例は自身を含む events だけ", () => {
	const a = streamWith("    entry: avatarLeft\n", "    entry: avatarLeft\n    response: { type: object }\n");
	assert.equal(a.status, 1, a.out);
	assert.match(a.out, /operations\.avatarLeft: 届くイベント（stream \/ inbound）に response は書かない/);
	const b = streamWith("            - { entry: avatarLeft, payload: { userId: u1 } }\n", "            - { entry: avatarMoved, payload: { userId: u1, x: 1 } }\n");
	assert.equal(b.status, 1, b.out);
	assert.match(b.out, /examples\.graceExpired\.events にこのイベント自身/);
});

test("events は stream 専用: http の例に書けば err", () => {
	const r = validate({
		examples: `ok:
  request: { name: "abc" }
  response: { id: 1 }
  events: { self: [] }
invalid:
  request: { name: "" }
  error: INVALID_INPUT`,
	});
	assert.equal(r.status, 1, r.out);
	assert.match(r.out, /examples\.ok に events があるが transport が stream でない/);
});

test("deeplink / push は従来どおり inbound のみ", () => {
	const r = streamWith("    transport: stream\n    direction: outbound", "    transport: push\n    direction: outbound");
	assert.equal(r.status, 1, r.out);
	assert.match(r.out, /transport が push なら direction は inbound/);
});

test("DEFERRED.md: REQ を指す対象（UC.md#REQ-nnn）は、その小節があれば通り、無ければ警告する（ADR-0067）", () => {
	const uc = "docs/goals/GOAL-01-a/UC-001-b/UC.md";
	const ok = validate({ deferredRows: [row("DEF-001", { target: `${uc}#REQ-001` })] });
	assert.equal(ok.status, 0, ok.out);
	assert.doesNotMatch(ok.out, /が存在しない/);
	const gone = validate({ deferredRows: [row("DEF-001", { target: `${uc}#REQ-999` })] });
	assert.match(gone.out, /対象 "docs\/goals\/GOAL-01-a\/UC-001-b\/UC\.md#REQ-999" が存在しない/);
	const noFile = validate({ deferredRows: [row("DEF-001", { target: "docs/goals/GOAL-01-a/UC-009-z/UC.md#REQ-001" })] });
	assert.match(noFile.out, /が存在しない/);
});

//  撤回済みの文書は短い形でよい: 効いていた頃の節を残すことを求めない
const shortUc = (status, reqStatus) => ({
	"docs/goals/GOAL-01-a/UC-009-z/UC.md": `---
id: UC-009
title: 一括で配信する
actor: ACT-01
goal: GOAL-01
status: ${status}
phase: 完了
---

# UC-009 一括で配信する

> 撤回: 運営からのお知らせに作り直した（ADR-0001）。

## 要件

### REQ-900

- pattern: Event-driven
- status: ${reqStatus}
- note: 一括の配信を廃止した（ADR-0001）

> 運営者が配信を求めた場合、システムは全員に届ける。
`,
});

test("撤回済みの UC と REQ は、節（検証方針・状態・例外系など）が無い短い形で通る", () => {
	const r = validate({ hostFiles: shortUc("withdrawn", "withdrawn") });
	assert.equal(r.status, 0, r.out);
});

test("撤回済みでない UC と REQ は、節が無ければ err のまま", () => {
	const uc = validate({ hostFiles: shortUc("active", "withdrawn") });
	assert.equal(uc.status, 1, uc.out);
	assert.match(uc.out, /UC-009-z\/UC\.md: 必須セクション "概要" が無い/);
	const req = validate({ hostFiles: shortUc("withdrawn", "active") });
	assert.equal(req.status, 1, req.out);
	assert.match(req.out, /REQ-900: 必須セクション "検証方針" が無い/);
});

test("撤回済みの REQ でも、要件文（> の 1 文）は要る", () => {
	const files = shortUc("withdrawn", "withdrawn");
	const path = Object.keys(files)[0];
	files[path] = files[path].replace("> 運営者が配信を求めた場合、システムは全員に届ける。\n", "");
	const r = validate({ hostFiles: files });
	assert.equal(r.status, 1, r.out);
	assert.match(r.out, /REQ-900: 要件文（> で始まる EARS 1 文）が無い/);
});

test("撤回済みの UC に空の表の節が残っていても、表の中身は求めない（撤回済みでなければ err）", () => {
	const withTables = (status) => {
		const files = shortUc(status, "withdrawn");
		const path = Object.keys(files)[0];
		files[path] = files[path].replace("## 要件", "## 概要\n\n撤回した。\n\n## 事前条件\n\nなし。\n\n## 主シナリオ\n\n1. なし。\n\n## 状態 × イベント表\n\n## 例外系の走査（4 分類）\n\n| 分類 | 対象ステップ | 導出した要件 |\n| --- | --- | --- |\n\n## 事後条件\n\nなし。\n\n## 要件");
		return files;
	};
	assert.equal(validate({ hostFiles: withTables("withdrawn") }).status, 0);
	const active = validate({ hostFiles: withTables("active") });
	assert.equal(active.status, 1, active.out);
	assert.match(active.out, /例外系の走査に「権限」の行が無い/);
});

test("撤回済みの REQ に撤回の理由（note）が無ければ warn", () => {
	const files = shortUc("withdrawn", "withdrawn");
	const path = Object.keys(files)[0];
	files[path] = files[path].replace("- note: 一括の配信を廃止した（ADR-0001）\n", "");
	const r = validate({ hostFiles: files });
	assert.equal(r.status, 0, r.out);
	assert.match(r.out, /warn .*REQ-900: withdrawn なのに撤回の理由（- note:）が無い/);
	assert.doesNotMatch(validate({ hostFiles: shortUc("withdrawn", "withdrawn") }).out, /撤回の理由/);
});

test("検証方針に「参照先」の行が残っていれば warn にし、harness index を案内する（err にはしない / ADR-0080）", () => {
	const root = mkdtempSync(join(tmpdir(), "lint-spec-"));
	try {
		writeMinimalDocs(root);
		const req = join(root, "docs/goals/GOAL-01-a/UC-001-b/REQ-001.md");
		writeFileSync(req, `${readFileSync(req, "utf8").replace(/\n*$/, "\n")}- **参照先**: \`tests/thing.test.mjs::doThing\`\n`);
		const r = runNode(LINT_SPEC, [], { cwd: root });
		const out = r.stdout + r.stderr;
		assert.equal(r.status, 0, out);
		assert.match(out, /warn .*REQ-001: 検証方針の「参照先」は使わない（どのテストが確かめるかは `harness index` が出す。この欄は消してよい \/ ADR-0080）/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
	assert.doesNotMatch(validate().out, /参照先/);
});

//  ---- 呼ばれる側の http の操作の wire.method / wire.path（入口の一覧と文字どおり比べる。形は解釈しない） ----

const httpContract = ({ status = "draft", direction = "inbound", method = "POST", path }) => `x-uc: UC-001
x-status: ${status}
x-spec: ./UC.md
x-updated: 2026-09-01

operations:
  doThing:
    transport: http
    direction: ${direction}
    owned: true
    auth: none
    summary: ものを作る
    wire:
      method: ${method}
      path: ${path}
      success: 200
    errors: []
`;

test("契約: inbound の http の操作の wire.path と wire.method は、空でない文字列（draft の段階から err）", () => {
	const empty = validate({ contract: httpContract({ path: '""' }) });
	assert.equal(empty.status, 1, empty.out);
	assert.match(empty.out, /operations\.doThing: wire\.path は、空でない文字列で書く（実際: ""。入口の一覧の path と、文字どおり比べる）/);
	assert.match(validate({ contract: httpContract({ path: "123" }) }).out, /wire\.path は、空でない文字列で書く（実際: 123。/);
	assert.match(validate({ contract: httpContract({ path: "[a, b]" }) }).out, /wire\.path は、空でない文字列で書く（実際: \["a","b"\]。/);
	assert.match(validate({ contract: httpContract({ method: "1", path: "/a" }) }).out, /wire\.method は、空でない文字列で書く（実際: 1。/);
	//  無いときは、今までどおりの文
	assert.match(validate({ contract: httpContract({ path: "~" }) }).out, /operations\.doThing: wire\.path が無い/);
});

test("契約: wire.path の形は解釈しない（どんな書き方でも通る）。outbound の操作は、空でない文字列の検査もしない", () => {
	for (const path of ["/things/{id}", "/things/:id", "/files/{name}.json", "/v1/items/{id}:cancel", "/odata/$metadata", "/docs/[[...slug]]", "/a?x=1", "items/{id}", "/assets/*"]) {
		const r = validate({ contract: httpContract({ path: JSON.stringify(path) }) });
		assert.equal(r.status, 0, `${path}\n${r.out}`);
	}
	const out = validate({ contract: httpContract({ direction: "outbound", path: "123" }) });
	assert.doesNotMatch(out.out, /空でない文字列で書く/, out.out);
});

test("契約: 撤回済みの UC の契約には、wire.path と wire.method の検査を掛けない（入口の突き合わせの対象でない）", () => {
	const withdrawnUc = { "docs/goals/GOAL-01-a/UC-001-b/UC.md": "---\nid: UC-001\ntitle: ものを作る\nactor: ACT-01\ngoal: GOAL-01\nstatus: withdrawn\n---\n\n# UC-001 ものを作る\n\n- note: 作らないことにした\n" };
	const r = validate({ contract: httpContract({ path: "123" }), hostFiles: withdrawnUc });
	assert.doesNotMatch(r.out, /空でない文字列で書く/, r.out);
});

test("契約: 入口の一覧と比べる項目は、lint entries と同じ判定（空でない文字列。空白だけは空）で検査する", () => {
	assert.match(validate({ contract: httpContract({ path: '" "' }) }).out, /wire\.path は、空でない文字列で書く（実際: " "。/);
	const push = (entry) => `x-uc: UC-001\nx-status: draft\nx-spec: ./UC.md\nx-updated: 2026-09-01\n\noperations:\n  onNotice:\n    transport: push\n    direction: inbound\n    owned: true\n    auth: none\n    summary: 通知を受け取る\n    entry: ${entry}\n    request: { type: object }\n`;
	for (const [entry, shown] of [["123", "123"], ['" "', '" "'], ["[a]", '["a"]']]) {
		const r = validate({ contract: push(entry) });
		assert.equal(r.status, 1, r.out);
		assert.ok(r.out.includes(`operations.onNotice: transport が push なら entry（URL パターン / ペイロード識別子 / メッセージ種別）を、空でない文字列で書く（実際: ${shown}）`), r.out);
	}
	assert.doesNotMatch(validate({ contract: push("notice.updated") }).out, /entry（URL パターン/);
});

test("フォルダの数え方: goals の直下の . と _ で始まるフォルダ、ゴールの直下の . で始まるフォルダの契約は読まない（lint entries も数えない）", () => {
	const bad = "x-uc: UC-900\nx-status: fixed\noperations:\n  wipe:\n    bogus: 1\n";
	const files = {};
	for (const dir of ["docs/goals/.stash/x", "docs/goals/_shared/x", "docs/goals/_tmp/x", "docs/goals/GOAL-01-a/.hidden"]) {
		files[`${dir}/UC.md`] = "---\nid: UC-900\nstatus: active\n---\n";
		files[`${dir}/contract.yaml`] = bad;
	}
	const r = validate({ hostFiles: files });
	assert.equal(r.status, 0, r.out);
	assert.doesNotMatch(r.out, /UC-900|wipe/);
});

test("根: docs の隣の設定が docs.goals_dir を別の場所に宣言していれば、設定の誤りで止まる（lint entries と別の木を読まない）", () => {
	const alt = {
		"harness.config.json": JSON.stringify({ docs: { goals_dir: "specs/goals" } }),
		"specs/goals/GOAL-01-a/UC-001-b/UC.md": "---\nid: UC-001\nstatus: active\n---\n",
		"specs/goals/GOAL-01-a/UC-001-b/contract.yaml": "x-uc: UC-001\nx-status: fixed\noperations:\n  wipe:\n    bogus: 1\n",
	};
	const r = validate({ hostFiles: alt });
	assert.equal(r.status, 2, r.out);
	assert.match(r.out, /lint spec: 仕様の置き場が 2 通りに決まっている: 設定の docs\.goals_dir は .*specs\/goals、docs のフォルダ（--docs）から決まる場所は .*docs\/goals/);
	//  設定が同じ場所を指していれば、今までどおり検査する
	assert.equal(validate({ hostFiles: { "harness.config.json": JSON.stringify({ docs: { goals_dir: "docs/goals" } }) } }).status, 0);
});

test("フォルダの数え方: ゴールの直下の _ で始まるフォルダも読まない（goals の直下と同じ決まり。lint refs が配置の違反にする）", () => {
	const r = validate({ hostFiles: { "docs/goals/GOAL-01-a/_draft/UC.md": "---\nid: UC-900\nstatus: active\n---\n", "docs/goals/GOAL-01-a/_draft/contract.yaml": "x-uc: UC-900\nx-status: fixed\noperations:\n  wipe:\n    bogus: 1\n" } });
	assert.equal(r.status, 0, r.out);
});

//  ---- 1 枚の概要（00-overview.md。ADR-0076） ----

//  最小の docs を書き、入力の GOAL.md を概要に畳んでから、概要を書き換える
function overviewRoot() {
	const root = mkdtempSync(join(tmpdir(), "lint-spec-overview-"));
	writeMinimalDocs(root);
	runNode(LINT_SPEC, [], { cwd: root });
	return root;
}
const OV = "docs/00-overview.md";
const UCF = "docs/goals/GOAL-01-a/UC-001-b/UC.md";
const edit = (root, rel, fn) => writeFileSync(join(root, rel), fn(readFileSync(join(root, rel), "utf8")));
const lint = (root) => {
	const r = runNode(LINT_SPEC, [], { cwd: root });
	return { status: r.status, out: r.stdout + r.stderr };
};
const POLICY_FILLED = (t) =>
	t.replace(/（未記入: [^\n]*）/g, "同じ対象に先に届いた要求を通し、後の要求には競合を返す。").replace(/^status: draft$/m, "status: living");

test("lint spec 概要: GOAL のフォルダと行の対応（行なし・planned・フォルダなしの draft・フォルダありの withdrawn）", () => {
	const root = overviewRoot();
	try {
		assert.equal(lint(root).status, 0, lint(root).out);
		const row = (id, status) => `| ${id} | 状態 | ACT-01 | KPI-01 | ${status} | ${status === "withdrawn" ? "撤回した" : ""} |`;
		//  draft の行のフォルダが無くても、withdrawn の行のフォルダがあっても通す
		edit(root, OV, (t) => t.replace(/(\| GOAL-01 [^\n]*\n)/, `$1${row("GOAL-02", "draft")}\n${row("GOAL-03", "withdrawn")}\n`));
		mkdirSync(join(root, "docs/goals/GOAL-03-c"), { recursive: true });
		assert.equal(lint(root).status, 0, lint(root).out);
		//  行の無いフォルダ
		mkdirSync(join(root, "docs/goals/GOAL-09-x"), { recursive: true });
		assert.match(lint(root).out, /GOAL-09 の行が概要（00-overview\.md）の GOAL の表に無い/);
		rmSync(join(root, "docs/goals/GOAL-09-x"), { recursive: true });
		//  planned の行のフォルダ
		edit(root, OV, (t) => t.replace(row("GOAL-03", "withdrawn"), row("GOAL-03", "planned")));
		assert.match(lint(root).out, /GOAL-03 は概要で planned（未着手）なのにフォルダがある/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("lint spec 概要: 古い文書は名前でも frontmatter の id でも違反にし、migrate overview を案内する。行の status の語彙と目指す状態の空を検査する", () => {
	const root = overviewRoot();
	try {
		writeFileSync(join(root, "docs/goals-backlog.md"), "---\nid: X\nstatus: living\n---\n");
		writeFileSync(join(root, "docs/product-vision.md"), "---\nid: VISION\nstatus: frozen\n---\n");
		writeFileSync(join(root, "docs/goals/GOAL-01-a/GOAL.md"), "---\nid: GOAL-01\nstatus: active\n---\n");
		edit(root, OV, (t) => t.replace(/\| GOAL-01 \| [^|]* \|([^\n]*)\| active \|/, "| GOAL-01 | |$1| done |"));
		const { status, out } = lint(root);
		assert.equal(status, 1, out);
		assert.match(out, /goals-backlog\.md の文書は置かない.*harness migrate overview --write/);
		assert.match(out, /product-vision\.md: id VISION（00-vision\.md） の文書は置かない/);
		assert.match(out, /GOAL-01-a\/GOAL\.md: GOAL\.md の文書は置かない/);
		assert.match(out, /GOAL-01: status は planned\|draft\|active\|withdrawn のいずれか。実際: "done"/);
		assert.match(out, /GOAL-01: 目指す状態の 1 文が空/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("lint spec 概要: 並行性・外部依存の行は、方針の 3 つの小節が埋まり概要が living のときだけ省ける。方針の例外は見出し・理由・REQ を検査する", () => {
	const root = overviewRoot();
	try {
		const omit = (t) => t.replace(/\| 並行性 \| なし \| なし \|\n/, "").replace(/\| 外部依存 \| なし \| なし \|\n/, "");
		edit(root, UCF, omit);
		//  方針が未記入（概要は living）
		assert.match(lint(root).out, /例外系の走査に「並行性」の行が無い.*概要の全体の方針の 3 つの小節が埋まっていて、概要が living のときだけ省ける/);
		//  方針が埋まっていても概要が draft なら省けない
		edit(root, OV, (t) => POLICY_FILLED(t).replace(/^status: living$/m, "status: draft"));
		assert.match(lint(root).out, /例外系の走査に「外部依存」の行が無い/);
		//  埋まっていて living なら省ける
		edit(root, OV, (t) => t.replace(/^status: draft$/m, "status: living"));
		assert.equal(lint(root).status, 0, lint(root).out);
		//  方針の例外: 正しい書き方は通る
		const exc = (cell) => edit(root, UCF, (t) => t.replace(/(\| 不変条件違反 [^\n]*\n)(\| 並行性[^\n]*\n)?/, `$1| 並行性 | 2 | ${cell} |\n`));
		exc("方針の例外（同時に届いた要求）: 後の要求も受け付ける。理由: 重複しても害が無い。REQ-001");
		assert.equal(lint(root).status, 0, lint(root).out);
		exc("方針の例外（同時の要求）: 後の要求も受け付ける。REQ-001");
		const out = lint(root).out;
		assert.match(out, /方針の例外は「方針の例外（同時に届いた要求 \| 外部の情報の遅れ \| 外部が応答しない）/);
		assert.match(out, /方針の例外に「理由: 」の後の理由が無い/);
		exc("方針の例外（外部が応答しない）: 待たずに返す。理由: 画面を止めない");
		assert.match(lint(root).out, /方針の例外に REQ-nnn が無い/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
