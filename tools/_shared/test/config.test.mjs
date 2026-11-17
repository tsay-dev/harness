//  設定ファイルの名前と、古い名前のファイルが残っているときの案内のテスト
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_FILE, renamedConfigHint } from "../config.mjs";

const TOOLS = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEMP = [];
after(() => TEMP.forEach((d) => rmSync(d, { recursive: true, force: true })));
const dir = (files) => {
	const d = mkdtempSync(join(tmpdir(), "harness-config-"));
	TEMP.push(d);
	for (const f of files) writeFileSync(join(d, f), "{}");
	return d;
};

test("古い名前のファイルだけがあるときは、改名の案内を返す", () => {
	assert.match(renamedConfigHint(join(dir(["traceconfig.json"]), CONFIG_FILE)), /traceconfig\.json がある.*harness\.config\.json に改名した/);
});

test("どちらも無いとき、別の名前を --config で指したときは、案内を返さない", () => {
	assert.equal(renamedConfigHint(join(dir([]), CONFIG_FILE)), "");
	assert.equal(renamedConfigHint(join(dir(["traceconfig.json"]), "other.json")), "");
});

for (const [name, args] of [
	["trace-check", ["trace-check/trace-check.mjs"]],
	["git-lint", ["git-lint/git-lint.mjs", "branch", "--name", "feat/add-some-thing"]],
	["contract-run", ["contract-run/contract-run.mjs"]],
]) {
	test(`${name}: 古い名前のファイルは読まず、設定が無いことと改名の案内を出して失敗する`, () => {
		const d = dir(["traceconfig.json"]);
		const r = spawnSync(process.execPath, [join(TOOLS, args[0]), ...args.slice(1), "--root", d], { encoding: "utf8", input: "", cwd: d });
		assert.notEqual(r.status, 0);
		assert.match(r.stderr, /設定が無い/);
		assert.match(r.stderr, /harness\.config\.json に改名した/);
	});
}

test("spec-lint gate: 古い名前のファイルだけがあるときは、単一ユニットと取り違えずに案内を出して失敗する", () => {
	const d = dir(["traceconfig.json"]);
	const r = spawnSync(process.execPath, [join(TOOLS, "spec-lint/spec-lint.mjs"), "gate", "--uc", "UC-001"], { encoding: "utf8", input: "", cwd: d });
	assert.notEqual(r.status, 0);
	assert.match(r.stderr, /harness\.config\.json が無い.*改名した/);
});

test("stop-gate: docs を持たない unit に古い名前のファイルだけがあるときは、「docs なし」で済ませず失敗する", () => {
	const d = dir([]);
	mkdirSync(join(d, "app"));
	writeFileSync(join(d, "app", "traceconfig.json"), "{}");
	writeFileSync(join(d, CONFIG_FILE), JSON.stringify({ git: { units: { app: "app" } }, commands: {} }));
	const r = spawnSync(process.execPath, [join(TOOLS, "gate-hook/stop-gate.mjs"), "--force"], { encoding: "utf8", input: JSON.stringify({ hook_event_name: "Stop", cwd: d }), cwd: d });
	assert.equal(r.status, 2, r.stdout + r.stderr);
	assert.match(r.stderr, /unit app（app）に app\/harness\.config\.json が無い.*改名した/);
	assert.doesNotMatch(r.stdout + r.stderr, /unit app（app）: docs なし/);
});
