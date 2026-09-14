//
//  contract-run のテスト（node --test）。
//  一時ディレクトリに最小の host（traceconfig.json / docs / エコーアダプタ）を組み立て、
//  アダプタの返答を adapter-table.json で差し替えながら終了コードと出力を検証する。
//  アダプタは cwd = host root で起動される契約なので、表と「見た要求」の記録はどちらも cwd 相対で読む。
//

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const TOOL = join(dirname(fileURLToPath(import.meta.url)), "..", "contract-run.mjs");

//  エコーアダプタ: 要求ごとに adapter-table.json の replies["<operation>:<request.i_xxx または request.id>"]
//  （無ければ "<operation>:*"）を id つきで返す。crash / hang / silent / garbage で異常系を再現する
const ADAPTER = `
import { readFileSync, appendFileSync } from "node:fs";
import { createInterface } from "node:readline";
const table = JSON.parse(readFileSync("adapter-table.json", "utf8"));
const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => {
	const req = JSON.parse(line);
	appendFileSync("adapter-seen.jsonl", line + "\\n");
	if (table.crash !== undefined) { console.error("boom"); process.exit(table.crash); }
	if (table.hang) { setInterval(() => {}, 1000); return; }
	if (table.silent) return;
	if (table.garbage) { process.stdout.write("not json\\n"); return; }
	const r = req.request ?? {};
	const key = req.operation + ":" + (r.i_xxx ?? r.id ?? "");
	const reply = table.replies[key] ?? table.replies[req.operation + ":*"] ?? { error: "UNMAPPED" };
	process.stdout.write(JSON.stringify({ id: req.id, ...reply }) + "\\n");
});
`;

const COMPONENTS = `
authSchemes:
  bearer: { type: http, scheme: bearer }
errorCodes:
  INVALID_INPUT: { summary: 入力が不正 }
  NOT_FOUND: { summary: 見つからない }
`;

const CONTRACT = `
x-uc: UC-001
x-status: fixed
x-spec: ./UC.md
x-updated: 2026-09-14
operations:
  doThing:
    transport: http
    direction: outbound
    owned: true
    auth: bearer
    summary: 何かをする
    wire:
      method: POST
      path: /things
      success: 200
    request:
      type: object
      required: [i_xxx]
      properties:
        i_xxx: { type: string, minLength: 1 }
    response:
      type: object
      required: [id, status]
      properties:
        id: { type: integer }
        status: { type: string, const: ok }
    errors:
      - code: INVALID_INPUT
        when: i_xxx が空
        wire: { status: 400 }
    examples:
      ok:
        request: { i_xxx: "abc" }
        response: { id: 1, status: ok }
      invalid:
        request: { i_xxx: "" }
        error: INVALID_INPUT
  readThing:
    transport: sdk
    direction: outbound
    owned: false
    source: "https://example.com/sdk@1.2"
    auth: bearer
    summary: 外部 SDK から読む
    response: { type: object, properties: { id: { type: integer } } }
    errors:
      - code: NOT_FOUND
        when: 該当なし
    examples:
      ok: { request: { id: 7 }, response: { id: 7 } }
      missing: { request: { id: 0 }, error: NOT_FOUND }
`;

//  全 pass になる既定の表
const OK_TABLE = {
	replies: {
		"doThing:abc": { response: { id: 1, status: "ok", extra: "ignored" } },
		"doThing:": { error: "INVALID_INPUT" },
		"readThing:7": { response: { id: 7 } },
		"readThing:0": { error: "NOT_FOUND" },
	},
};

function makeHost({ table = OK_TABLE, adapter = "node adapter.mjs", contract = CONTRACT } = {}) {
	const root = mkdtempSync(join(tmpdir(), "contract-run-"));
	mkdirSync(join(root, "docs", "_shared"), { recursive: true });
	const ucDir = join(root, "docs", "goals", "GOAL-01-a", "UC-001-b");
	mkdirSync(ucDir, { recursive: true });
	writeFileSync(join(root, "docs", "_shared", "components.yaml"), COMPONENTS);
	writeFileSync(join(ucDir, "contract.yaml"), contract);
	writeFileSync(join(root, "adapter.mjs"), ADAPTER);
	writeFileSync(join(root, "adapter-table.json"), JSON.stringify(table));
	const commands = adapter === null ? { test: "true" } : { test: "true", contract_adapter: adapter };
	writeFileSync(join(root, "traceconfig.json"), JSON.stringify({ docs: { goals_dir: "docs/goals" }, commands }, null, 2));
	return root;
}

function run(root, ...args) {
	const r = spawnSync(process.execPath, [TOOL, "--root", root, ...args], { encoding: "utf8" });
	return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

const seenOps = (root) =>
	existsSync(join(root, "adapter-seen.jsonl"))
		? readFileSync(join(root, "adapter-seen.jsonl"), "utf8")
				.trim()
				.split("\n")
				.map((l) => JSON.parse(l).operation)
		: [];

test("全例が契約どおりなら exit 0 で pass 2", (t) => {
	const root = makeHost();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root);
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /pass {2}UC-001 doThing\.ok/);
	assert.match(r.stdout, /pass {2}UC-001 doThing\.invalid {2}error INVALID_INPUT/);
	assert.match(r.stdout, /pass 2 \/ fail 0 \/ skip 0/);
	//  既定では owned: false は送られない
	assert.deepEqual(seenOps(root), ["doThing", "doThing"]);
});

test("正常例の response が部分集合でなければ exit 1 で不一致パスを出す", (t) => {
	const root = makeHost({
		table: { replies: { ...OK_TABLE.replies, "doThing:abc": { response: { id: 1, status: "pending" } } } },
	});
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root);
	assert.equal(r.status, 1);
	assert.match(r.stdout, /fail {2}UC-001 doThing\.ok {2}status: 期待 "ok" \/ 実際 "pending"/);
	assert.match(r.stdout, /pass 1 \/ fail 1 \/ skip 0/);
});

test("異常例に別のコードが返れば exit 1", (t) => {
	const root = makeHost({ table: { replies: { ...OK_TABLE.replies, "doThing:": { error: "NOT_FOUND" } } } });
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root);
	assert.equal(r.status, 1);
	assert.match(r.stdout, /fail {2}UC-001 doThing\.invalid {2}期待: error INVALID_INPUT \/ 実際: error NOT_FOUND/);
});

test("異常例に正常応答が返れば exit 1", (t) => {
	const root = makeHost({ table: { replies: { ...OK_TABLE.replies, "doThing:": { response: { id: 2 } } } } });
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root);
	assert.equal(r.status, 1);
	assert.match(r.stdout, /期待: error INVALID_INPUT \/ 実際: 正常/);
});

test("skip 応答は exit 0 のまま skip に数え、pass にはしない", (t) => {
	const root = makeHost({
		table: { replies: { ...OK_TABLE.replies, "doThing:abc": { skip: "XCTest からしか到達できない" } } },
	});
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root);
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /skip {2}UC-001 doThing\.ok {2}XCTest からしか到達できない/);
	assert.match(r.stdout, /pass 1 \/ fail 0 \/ skip 1 \(skipped は検査されていない\)/);
});

test("アダプタが異常終了すれば exit 2 で stderr の末尾を出す", (t) => {
	const root = makeHost({ table: { crash: 3, replies: {} } });
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root);
	assert.equal(r.status, 2);
	assert.match(r.stderr, /アダプタ異常/);
	assert.match(r.stderr, /\| boom/);
});

test("JSON でない行を返せば exit 2", (t) => {
	const root = makeHost({ table: { garbage: true, replies: {} } });
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root);
	assert.equal(r.status, 2);
	assert.match(r.stderr, /アダプタ異常: stdout に JSON でない行がある/);
});

test("応答が来ないまま生き続ければ --timeout で exit 2", (t) => {
	const root = makeHost({ table: { hang: true, replies: {} } });
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root, "--timeout", "1");
	assert.equal(r.status, 2);
	assert.match(r.stderr, /タイムアウト（1 秒）/);
});

test("応答を返さずに終了すれば未応答の id を挙げて exit 2", (t) => {
	const root = makeHost({ table: { silent: true, replies: {} } });
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root);
	assert.equal(r.status, 2);
	assert.match(r.stderr, /アダプタ異常: 応答が無い要求がある（id=1,2 \/ 2 件）/);
});

test("commands.contract_adapter が無ければ exit 0 で「未宣言」と出す", (t) => {
	const root = makeHost({ adapter: null });
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root);
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /commands\.contract_adapter 未宣言: 契約の実行検査は行われていない/);
	assert.equal(seenOps(root).length, 0);
});

test("traceconfig.json が無ければ exit 2", (t) => {
	const root = makeHost();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	rmSync(join(root, "traceconfig.json"));
	const r = run(root);
	assert.equal(r.status, 2);
	assert.match(r.stderr, /設定が無い/);
});

test("--include-external で owned: false の操作も送る", (t) => {
	const root = makeHost();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root, "--include-external");
	assert.equal(r.status, 0, r.stderr);
	assert.deepEqual(seenOps(root), ["doThing", "doThing", "readThing", "readThing"]);
	assert.match(r.stdout, /pass {2}UC-001 readThing\.ok/);
	assert.match(r.stdout, /pass {2}UC-001 readThing\.missing/);
	assert.match(r.stdout, /pass 4 \/ fail 0 \/ skip 0/);
});

test("--json は results と summary を出す", (t) => {
	const root = makeHost({
		table: { replies: { ...OK_TABLE.replies, "doThing:abc": { response: { id: 1, status: "pending" } } } },
	});
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root, "--json");
	assert.equal(r.status, 1);
	const out = JSON.parse(r.stdout);
	assert.deepEqual(Object.keys(out), ["results", "summary"]);
	assert.deepEqual(out.summary, { pass: 1, fail: 1, skip: 0 });
	assert.deepEqual(out.results[0], {
		uc: "UC-001",
		operation: "doThing",
		case: "ok",
		verdict: "fail",
		detail: 'status: 期待 "ok" / 実際 "pending"',
	});
	assert.deepEqual(out.results[1], { uc: "UC-001", operation: "doThing", case: "invalid", verdict: "pass", detail: "error INVALID_INPUT" });
});

test("--uc で絞れる。該当なしなら何も送らず exit 0", (t) => {
	const root = makeHost();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root, "--uc", "UC-999");
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /pass 0 \/ fail 0 \/ skip 0/);
	assert.equal(seenOps(root).length, 0);
});

test("draft の契約は既定で飛ばし、--all で実行する", (t) => {
	const root = makeHost({ contract: CONTRACT.replace("x-status: fixed", "x-status: draft") });
	t.after(() => rmSync(root, { recursive: true, force: true }));
	assert.match(run(root).stdout, /pass 0 \/ fail 0 \/ skip 0/);
	const r = run(root, "--all");
	assert.equal(r.status, 0, r.stderr);
	assert.match(r.stdout, /pass 2 \/ fail 0 \/ skip 0/);
});

test("response も error も無い例は fail（例の不備）として報告する", (t) => {
	const root = makeHost({
		contract: CONTRACT.replace("        error: INVALID_INPUT\n", "        note: forgot\n"),
	});
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root);
	assert.equal(r.status, 1);
	assert.match(r.stdout, /fail {2}UC-001 doThing\.invalid {2}例が不正: response も error も無い/);
	//  不備の例はアダプタに送らない
	assert.deepEqual(seenOps(root), ["doThing"]);
});

test("配列は長さと要素ごとの部分集合で比べ、ネストしたパスを報告する", (t) => {
	const contract = CONTRACT.replace(
		"        response: { id: 1, status: ok }",
		"        response: { id: 1, items: [{ status: ok }, { status: ok }] }",
	);
	const root = makeHost({
		contract,
		table: { replies: { ...OK_TABLE.replies, "doThing:abc": { response: { id: 1, items: [{ status: "ok" }, { status: "pending", n: 1 }] } } } },
	});
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = run(root);
	assert.equal(r.status, 1);
	assert.match(r.stdout, /items\[1\]\.status: 期待 "ok" \/ 実際 "pending"/);
});
