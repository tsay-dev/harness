//  stop-gate（Stop フック）の回帰検証。一時ディレクトリに git リポジトリを組み、Stop の stdin を模擬する。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = join(HERE, "..", "stop-gate.mjs");
const GATE_LOG = join(HERE, "..", "gate-log.mjs");
const TEMPLATE = join(HERE, "..", "..", "..", "templates", "develop", "traceconfig.json");

//  テンプレートから、空の skeleton では通らない contract / schema を抜いた最小設定
function traceconfig(commands) {
	const cfg = JSON.parse(readFileSync(TEMPLATE, "utf8"));
	delete cfg._comment;
	delete cfg.contract;
	delete cfg.schema;
	if (commands === undefined) delete cfg.commands;
	else cfg.commands = commands;
	return JSON.stringify(cfg, null, 2) + "\n";
}

function git(root, ...args) {
	const r = spawnSync("git", ["-C", root, "-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { encoding: "utf8" });
	assert.equal(r.status, 0, r.stderr);
	return r.stdout;
}

function makeRoot() {
	const root = mkdtempSync(join(tmpdir(), "harness stop-gate "));
	mkdirSync(join(root, "docs"), { recursive: true });
	writeFileSync(join(root, "empty.txt"), "");
	writeFileSync(join(root, "traceconfig.json"), traceconfig({ test: "exit 0" }));
	git(root, "init", "-q");
	git(root, "add", "-A");
	git(root, "commit", "-q", "-m", "init");
	return root;
}

function runGate(root, payload, args = []) {
	return spawnSync("node", [GATE, ...args], {
		input: typeof payload === "string" ? payload : JSON.stringify(payload),
		encoding: "utf8",
		env: { ...process.env, CLAUDE_PROJECT_DIR: root },
	});
}

const readLog = (root) =>
	existsSync(join(root, ".harness-gate", "log.jsonl"))
		? readFileSync(join(root, ".harness-gate", "log.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
		: [];
const last = (root) => readLog(root).at(-1);

const stop = (root, extra = {}) => ({ session_id: "s1", cwd: root, hook_event_name: "Stop", stop_hook_active: false, ...extra });

test("stop-gate: 合格 → 変更なし skip → 不通過ブロック → ラウンド上限で release → skip 表示 → 対象外イベント → 壊れた stdin", (t) => {
	const root = makeRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));

	//  (a) 全部通過
	const a = runGate(root, stop(root));
	assert.equal(a.status, 0, a.stderr + a.stdout);
	assert.match(a.stdout, /\[stop-gate\] 終端ゲート通過/);
	assert.match(a.stdout, /skip: commands\.typecheck 未宣言/);
	assert.equal(last(root).decision, "pass");
	assert.equal(last(root).session, "s1");
	assert.equal(last(root).hook, "stop-gate");
	assert.equal(last(root).event, "Stop");
	const state = JSON.parse(readFileSync(join(root, ".harness-gate", "state.json"), "utf8"));
	assert.ok(state.last_pass.fingerprint);

	//  (b) 同じ木で再度 Stop → 再検査しない（.harness-gate/ が増えても指紋は変わらない）
	const b = runGate(root, stop(root));
	assert.equal(b.status, 0, b.stderr);
	assert.match(b.stdout, /\[stop-gate\] 変更なし/);
	assert.equal(last(root).decision, "skip");
	assert.equal(last(root).reason, "no-changes");

	//  (b') --force は指紋を無視して検査する
	const bf = runGate(root, stop(root), ["--force"]);
	assert.equal(bf.status, 0, bf.stderr);
	assert.equal(last(root).decision, "pass");

	//  (c) test コマンドを失敗させる（tracked ファイルの変更 → 新しい指紋）
	writeFileSync(join(root, "traceconfig.json"), traceconfig({ test: "echo boom; exit 1" }));
	const c = runGate(root, stop(root));
	assert.equal(c.status, 2, c.stdout);
	assert.match(c.stderr, /\[stop-gate\] 終端ゲート不通過（round 1\/2）: 失敗 = test/);
	assert.match(c.stderr, /  test: exit 1\n    boom/);
	assert.match(c.stderr, /DEFERRED\.md/);
	assert.equal(last(root).decision, "block");
	assert.equal(last(root).reason, "test");
	assert.deepEqual(last(root).failures, ["test"]);
	assert.equal(last(root).round, 1);

	//  (d) フック継続中（stop_hook_active）でラウンド上限 → ブロックせず人間へ
	const d = runGate(root, stop(root, { stop_hook_active: true }), ["--max-rounds", "1"]);
	assert.equal(d.status, 0, d.stderr);
	assert.match(d.stdout, /\[stop-gate\] 非収束/);
	assert.equal(last(root).decision, "release");
	assert.equal(last(root).reason, "round-cap");
	assert.deepEqual(last(root).failures, ["test"]);

	//  (d') 別セッションならラウンドはリセットされ、通常どおりブロックする
	const d2 = runGate(root, stop(root, { session_id: "s2", stop_hook_active: true }), ["--max-rounds", "1"]);
	assert.equal(d2.status, 2, d2.stdout);
	assert.match(d2.stderr, /round 1\/1/);

	//  (e) commands 無し → 未宣言を表示して通過
	writeFileSync(join(root, "traceconfig.json"), traceconfig(undefined));
	const e = runGate(root, stop(root));
	assert.equal(e.status, 0, e.stderr);
	assert.match(e.stdout, /commands\.test 未宣言/);
	assert.match(e.stdout, /commands\.contract_adapter 未宣言/);
	assert.match(e.stdout, /終端ゲート通過（2 検査、skip: contract-run, typecheck, lint, test）/);

	//  (f) Stop 以外のイベントは対象外
	const f = runGate(root, stop(root, { hook_event_name: "SubagentStop" }));
	assert.equal(f.status, 0, f.stderr);
	assert.equal(last(root).decision, "skip");
	assert.equal(last(root).reason, "wrong-event");

	//  (g) 壊れた stdin → fail-open
	const g = runGate(root, "{not json");
	assert.equal(g.status, 0, g.stderr);
	assert.equal(last(root).reason, "internal-error");

	//  (h) 不明な引数 → usage で exit 2
	const h = runGate(root, stop(root), ["--bogus"]);
	assert.equal(h.status, 2);
	assert.match(h.stderr, /usage:/);

	//  gate-log --summary のスモーク
	const s = spawnSync("node", [GATE_LOG, "--summary", "--log", join(root, ".harness-gate", "log.jsonl"), "--since", "1"], { encoding: "utf8" });
	assert.equal(s.status, 0, s.stderr);
	assert.match(s.stdout, /stop-gate: runs \d+ \/ block 2 \/ release 1 \/ skip/);
	assert.match(s.stdout, /gate-hook: gated 0 \/ block 0/);
	assert.match(s.stdout, /降格候補/);
});

test("stop-gate: traceconfig.json が無くても spec-lint だけで判定する", (t) => {
	const root = mkdtempSync(join(tmpdir(), "harness stop-gate "));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	mkdirSync(join(root, "docs"), { recursive: true });
	//  git 無し → 指紋なし → 毎回検査する
	const r1 = runGate(root, stop(root));
	assert.equal(r1.status, 0, r1.stderr);
	assert.match(r1.stdout, /skip: traceconfig\.json 無し/);
	assert.match(r1.stdout, /終端ゲート通過（1 検査/);
	const r2 = runGate(root, stop(root));
	assert.equal(r2.status, 0, r2.stderr);
	assert.equal(last(root).decision, "pass"); //  skip/no-changes にはならない
});

test("stop-gate: タイムアウトは timeout:<step> として失敗にする", (t) => {
	const root = makeRoot();
	t.after(() => rmSync(root, { recursive: true, force: true }));
	writeFileSync(join(root, "traceconfig.json"), traceconfig({ test: "sleep 5" }));
	const r = runGate(root, stop(root), ["--timeout", "1"]);
	assert.equal(r.status, 2, r.stdout);
	assert.match(r.stderr, /失敗 = timeout:test/);
	assert.match(r.stderr, /timeout:test: timeout 1s/);
	assert.deepEqual(last(root).failures, ["timeout:test"]);
});
