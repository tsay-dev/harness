//  lint git branch・lint git message のテストが共有する、最小の host（harness.config.json と、必要なら git リポジトリ）の組み立てと、コマンドの起動。
//  ディスク上の fixture は持たない。
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
//  cmd（branch・message）ごとのコマンドのファイル
export const toolOf = (cmd) => join(HERE, "..", "..", `lint-git-${cmd}`, `lint-git-${cmd}.mjs`);

export const MONO = { git: { units: { "app-a": "apps/a", ui: "packages/ui" }, exempt_branches: ["dependabot/**"] } };
export const SINGLE = { git: {} };

//  host を組む。config が null なら harness.config.json を置かない
export function host(t, config, dirs = ["apps/a", "packages/ui"]) {
	const root = mkdtempSync(join(tmpdir(), "harness lint-git "));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	for (const d of dirs) mkdirSync(join(root, d), { recursive: true });
	if (config !== null) writeFileSync(join(root, "harness.config.json"), JSON.stringify(config));
	return root;
}

export const run = (root, cmd, ...args) => spawnSync("node", [toolOf(cmd), ...args, "--root", root], { encoding: "utf8" });

export function git(root, ...args) {
	const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], {
		cwd: root,
		encoding: "utf8",
	});
	assert.equal(r.status, 0, r.stderr);
	return r.stdout.trim();
}

export function message(t, root, text) {
	const file = join(root, "MSG");
	writeFileSync(file, text);
	return run(root, "message", "--file", file, "--branch", "app-a/add-login");
}
