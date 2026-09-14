//  gate-hook（PreToolUse）の却下ログの回帰検証。ディスク上の fixture は持たず、一時ディレクトリに木を組む。
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "..", "gate-hook.mjs");

function runHook(root, payload, args) {
	return spawnSync("node", [HOOK, ...args], {
		input: JSON.stringify(payload),
		encoding: "utf8",
		env: { ...process.env, CLAUDE_PROJECT_DIR: root },
	});
}

const readLog = (root) => {
	const p = join(root, ".harness-gate", "log.jsonl");
	if (!existsSync(p)) return [];
	return readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
};

test("gate-hook: 実装コードへの書き込みは判定を記録し、docs への書き込みは記録しない", (t) => {
	const root = mkdtempSync(join(tmpdir(), "harness gate-hook "));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	mkdirSync(join(root, "docs"), { recursive: true }); //  docs/goals は無い → no-goals でブロック

	//  (1) src/x.js → ブロック + block/no-goals が 1 行
	const r1 = runHook(root, { tool_input: { file_path: "src/x.js" }, cwd: root, session_id: "s1" }, ["--code", "src/**"]);
	assert.equal(r1.status, 2, r1.stderr);
	assert.match(r1.stderr, /\[gate-hook\]/);
	const log1 = readLog(root);
	assert.equal(log1.length, 1);
	assert.equal(log1[0].decision, "block");
	assert.equal(log1[0].reason, "no-goals");
	assert.equal(log1[0].session, "s1");
	assert.equal(log1[0].target, "src/x.js");
	assert.equal(log1[0].hook, "gate-hook");
	assert.equal(log1[0].event, "PreToolUse");
	assert.deepEqual(Object.keys(log1[0]), ["ts", "hook", "event", "session", "decision", "reason", "target", "uc", "round", "failures", "ms"]);

	//  (2) docs/x.md → 許可、ログは増えない（母数＝ゲートされた書き込み）
	const r2 = runHook(root, { tool_input: { file_path: "docs/x.md" }, cwd: root, session_id: "s1" }, ["--code", "src/**"]);
	assert.equal(r2.status, 0, r2.stderr);
	assert.equal(readLog(root).length, 1);

	//  (3) ログ置き場自体への書き込みも許可・非記録
	const r3 = runHook(root, { tool_input: { file_path: ".harness-gate/log.jsonl" }, cwd: root }, ["--code", "**"]);
	assert.equal(r3.status, 0, r3.stderr);
	assert.equal(readLog(root).length, 1);
});

test("gate-hook: --code 未指定は exit 1 で misconfig を記録する", (t) => {
	const root = mkdtempSync(join(tmpdir(), "harness gate-hook "));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = runHook(root, { tool_input: { file_path: "src/x.js" }, cwd: root, session_id: "s2" }, []);
	assert.equal(r.status, 1);
	const log = readLog(root);
	assert.equal(log.length, 1);
	assert.equal(log[0].reason, "misconfig");
	assert.equal(log[0].session, "s2");
});

test("gate-hook: --log でログの置き場を変えられる", (t) => {
	const root = mkdtempSync(join(tmpdir(), "harness gate-hook "));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const r = runHook(root, { tool_input: { file_path: "src/x.js" }, cwd: root }, ["--code", "src/**", "--log", "out/gate.jsonl"]);
	assert.equal(r.status, 2);
	assert.ok(existsSync(join(root, "out", "gate.jsonl")));
	assert.equal(readLog(root).length, 0);
});
