//  標準入力・標準エラー出力の扱い（stdio.mjs）のテスト。非ブロッキングのパイプで、書き手が遅れて書いても最後まで読めること
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const STDIO = pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "..", "stdio.mjs")).href;

test("readStdin: パイプが非ブロッキングでも、まだ届いていない入力を待って最後まで読む", async () => {
	//  process.stdin に触れると Node はパイプを非ブロッキングにする（同じパイプを使うほかのプロセスにも及ぶ）。
	//  その状態で、書き手が 2 回に分けて遅れて書いた 200KB を超える入力を読み、長さと末尾を返させる
	const code = `process.stdin.isTTY; const { readStdin } = await import(${JSON.stringify(STDIO)}); const s = readStdin(); console.log(s.length, JSON.stringify(s.slice(-5)));`;
	const child = spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: ["pipe", "pipe", "pipe"] });
	child.stdout.setEncoding("utf8");
	let out = "";
	let err = "";
	child.stdout.on("data", (c) => (out += c));
	child.stderr.on("data", (c) => (err += c));
	const part = "あ".repeat(40000);
	setTimeout(() => child.stdin.write(part), 200);
	setTimeout(() => child.stdin.end(`${part}おわり\n`), 400);
	const status = await new Promise((res) => child.on("close", res));
	assert.equal(status, 0, err);
	assert.equal(out, `${part.length * 2 + 4} "あおわり\\n"\n`);
});

test("exitWith: 読み手が遅くても、200KB を超えるメッセージを書き終えてから終わる", async () => {
	const code = `const { exitWith } = await import(${JSON.stringify(STDIO)}); exitWith(3, "い".repeat(80000), "おわり");`;
	const child = spawn(process.execPath, ["--input-type=module", "-e", code], { stdio: ["ignore", "pipe", "pipe"] });
	//  しばらく読まずにおき、パイプを満たしてから読み始める
	child.stderr.pause();
	setTimeout(() => child.stderr.resume(), 300);
	child.stderr.setEncoding("utf8");
	let err = "";
	child.stderr.on("data", (c) => (err += c));
	const status = await new Promise((res) => child.on("close", res));
	assert.equal(status, 3);
	assert.equal(err.length, 80000 + "\nおわり\n".length);
	assert.ok(err === `${"い".repeat(80000)}\nおわり\n`, err.slice(-20));
});
