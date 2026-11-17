#!/usr/bin/env node
//  verify — 完了の判定（CI と手元から呼ぶ入口。入口からは `harness verify`）
//
//  Stop フック（stop-gate.mjs）と同じ検査の並び（suite.mjs）を、標準入力もラウンドの記録も使わずに 1 回実行する。
//  フックで通ったものが CI で落ちる（またはその逆の）食い違いを作らないために、検査の並びは suite.mjs の 1 か所にある。
//
//  使い方:
//    node verify.mjs [--level lint|fast|full] [--unit <名前>]... [--root <プロジェクトのルート>]
//                    [--docs docs] [--config harness.config.json] [--timeout 300] [--tail 15]
//    node verify.mjs --hook [stop-gate.mjs の引数...]     Stop フックとして動かす（標準入力の JSON を読む。stop-gate.mjs と同じ）
//      --level    どこまで実行するか（既定 full）。
//                   lint = 読むだけの検査（設定の形・仕様の書式・紐づき）。利用プロジェクトのコマンドは実行しない
//                   fast = lint + 契約の実例の実行 + commands.typecheck / lint / test / extra
//                   full = fast + commands.system（シナリオテスト）
//      --unit     monorepo で、検査する unit の名前（複数可。省略すると全 unit）
//      --timeout  検査 1 つあたりの秒数
//      --tail     失敗した検査の出力のうち、表示する末尾の行数
//      --verbose  実行した検査の出力を、通ったものも含めて全部表示する（警告や違反の一覧を CI のログに残す）
//      --timeout 0 は制限なし。--config の相対パスは、実行したディレクトリから探す
//      --ignore-legacy-layout  旧レイアウト（docs/specs/）が残っていても検査を続ける（spec-lint へ渡す。移行中だけ）
//
//  終了コード: 0 = すべて通過 / 1 = 失敗がある / 2 = 使い方の誤り
//  環境変数 STOP_GATE_TOOLS_DIR は同梱ツールの探索先を差し替える（テスト用。stop-gate.mjs と同じ）。

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG_FILE } from "../_shared/config.mjs";
import { LEVELS, readConfig, runSuite, tailLines } from "./suite.mjs";

const USAGE =
	"usage: verify.mjs [--level lint|fast|full] [--unit <名前>]... [--root .] [--docs docs] [--config harness.config.json] [--timeout 300] [--tail 15] [--verbose] [--ignore-legacy-layout]\n" +
	"       verify.mjs --hook [stop-gate.mjs の引数...]";

function usage(msg) {
	console.error(`verify: ${msg}\n${USAGE}`);
	process.exit(2);
}

function parseArgs(argv) {
	const opts = { root: ".", docs: "docs", config: null, level: "full", only: [], timeout: 300, tail: 15 };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		const value = () => {
			if (argv[i + 1] === undefined) usage(`${a} に値が無い`);
			return argv[++i];
		};
		if (a === "--root") opts.root = value();
		else if (a === "--docs") opts.docs = value();
		else if (a === "--config") opts.config = value();
		else if (a === "--level") opts.level = value();
		else if (a === "--unit") opts.only.push(value());
		else if (a === "--timeout") opts.timeout = Number(value());
		else if (a === "--tail") opts.tail = Number(value());
		else if (a === "--ignore-legacy-layout") opts.ignoreLegacyLayout = true;
		else if (a === "--verbose") opts.verbose = true;
		else usage(`不明な引数 ${a}`);
	}
	if (!LEVELS.includes(opts.level)) usage(`--level は ${LEVELS.join(" / ")}`);
	for (const k of ["timeout", "tail"]) if (!Number.isInteger(opts[k]) || opts[k] < 0) usage(`--${k} は 0 以上の整数`);
	return opts;
}

async function main() {
	const argv = process.argv.slice(2);
	if (argv.includes("--hook")) {
		//  Stop フックとして動かす。stop-gate.mjs は読み込まれると、残りの引数で自分を実行して終了する
		process.argv = [process.argv[0], process.argv[1], ...argv.filter((a) => a !== "--hook")];
		await import("./stop-gate.mjs");
		return;
	}
	const opts = parseArgs(argv);
	const root = resolve(opts.root);
	const configPath = opts.config ? resolve(opts.config) : join(root, CONFIG_FILE);
	const toolsDir = process.env.STOP_GATE_TOOLS_DIR || join(dirname(fileURLToPath(import.meta.url)), "..");

	const { failures, skipped, notes, ran, outputs } = await runSuite(root, opts, toolsDir, configPath, readConfig(configPath));
	if (opts.verbose)
		for (const o of outputs) {
			console.log(`\n== ${o.name}（${o.ok ? "通過" : "失敗"}）`);
			if (o.output.trim()) console.log(o.output.replace(/\s+$/, ""));
		}
	for (const n of notes) console.log(n);
	const scope = `level ${opts.level}${opts.only.length ? `、unit: ${opts.only.join(", ")}` : ""}`;
	if (failures.length === 0) {
		console.log(`[verify] すべて通過（${scope}。${ran} 検査、skip: ${skipped.join(", ") || "なし"}）`);
		return 0;
	}
	const out = [`[verify] 失敗 ${failures.length} 件（${scope}。${ran} 検査）: ${failures.map((f) => f.name).join(", ")}`];
	for (const f of failures) {
		const how = f.config ? "設定" : f.timedOut ? `timeout ${opts.timeout}s` : `exit ${f.code ?? `signal ${f.signal}`}`;
		out.push(`  ${f.name}: ${how}`);
		for (const l of tailLines(f.output, opts.tail)) out.push(`    ${l}`);
	}
	console.error(out.join("\n"));
	return 1;
}

const code = await main();
if (code !== undefined) process.exitCode = code;
