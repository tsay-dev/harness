#!/usr/bin/env node
//
//  harness — 同梱ツールの入口（依存ゼロの Node）
//
//  ツールごとに違っていた呼び出し方を、1 つのコマンドと「何をするか」で選ぶ名前にそろえる。
//  ここは名前から同梱ツールを選んで引数をそのまま渡すだけで、検査の中身は持たない。
//  各コマンドの引数と終了コードは、渡した先のツールのものがそのまま返る。
//
//  読むだけ（ファイルを書き換えない）:
//    harness lint                 lint spec → lint refs → lint git branch を続けて実行する
//    harness lint spec            仕様の文書の書式と状態の決まり            → spec-lint validate
//    harness lint refs            仕様・コード・テストの ID の紐づき        → trace-check
//    harness lint git branch      ブランチ名の書式                          → git-lint branch
//    harness lint git message     コミットメッセージの書式                  → git-lint message
//    harness lint git uc          コミットが指す UC が実装に入れる状態か    → spec-lint gate
//  実行するもの:
//    harness run cases            契約の実例を実装に当てて実行する          → contract-run
//    harness verify               完了の判定（Stop フック）                 → stop-gate
//    harness guard                書き込み前の関門（PreToolUse フック）     → gate-hook
//  補助:
//    harness next-id <種類>       次の空き ID を予約して出力する            → trace-check --next
//    harness index                1 行 1 ID の索引を出力する                → trace-check --index
//    harness convert <openapi>    OpenAPI を契約の書式へ変換する            → spec-lint convert
//
//  使い方:
//    node <harness のルート>/bin/harness.mjs <コマンド> [渡した先のツールの引数...]
//
//  終了コード: 渡した先のツールの終了コード。コマンド名の誤りは 2。
//  `harness lint`（まとめて実行）は、実行したもののうち最も大きい終了コード。
//  環境変数 HARNESS_TOOLS_DIR は同梱ツールの探索先（<このファイルの場所>/../tools）を差し替える（テスト用）。

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TOOLS = process.env.HARNESS_TOOLS_DIR
	? resolve(process.env.HARNESS_TOOLS_DIR)
	: join(dirname(fileURLToPath(import.meta.url)), "..", "tools");

//  コマンド表。words = コマンド名の並び、script = tools/ からの相対パス、prefix = 利用者の引数の前に付ける引数。
//  一覧（引数なしの表示）もここから作る。名前と行き先の正本はこの表だけ。
const COMMANDS = [
	{ group: "読むだけ", words: ["lint", "spec"], script: "spec-lint/spec-lint.mjs", prefix: ["validate"], desc: "仕様の文書の書式と状態の決まりを検査する" },
	{ group: "読むだけ", words: ["lint", "refs"], script: "trace-check/trace-check.mjs", prefix: [], desc: "仕様・コード・テストの ID の紐づきを検査する" },
	{ group: "読むだけ", words: ["lint", "git", "branch"], script: "git-lint/git-lint.mjs", prefix: ["branch"], desc: "ブランチ名の書式を検査する" },
	{ group: "読むだけ", words: ["lint", "git", "message"], script: "git-lint/git-lint.mjs", prefix: ["message"], desc: "コミットメッセージの書式を検査する" },
	{ group: "読むだけ", words: ["lint", "git", "uc"], script: "spec-lint/spec-lint.mjs", prefix: ["gate"], desc: "コミットが指す UC が実装に入れる状態かを検査する" },
	{ group: "実行する", words: ["run", "cases"], script: "contract-run/contract-run.mjs", prefix: [], desc: "契約の実例を実装に当てて実行する" },
	{ group: "実行する", words: ["verify"], script: "gate-hook/stop-gate.mjs", prefix: [], desc: "完了の判定を行う（Stop フック）" },
	{ group: "実行する", words: ["guard"], script: "gate-hook/gate-hook.mjs", prefix: [], desc: "書き込み前の関門（PreToolUse フック）" },
	{ group: "補助", words: ["next-id"], script: "trace-check/trace-check.mjs", prefix: ["--next"], desc: "次の空き ID を予約して出力する（goal|uc|req|br|nfr|adr）" },
	{ group: "補助", words: ["index"], script: "trace-check/trace-check.mjs", prefix: ["--index"], desc: "1 行 1 ID の索引を出力する" },
	{ group: "補助", words: ["convert"], script: "spec-lint/spec-lint.mjs", prefix: ["convert"], desc: "OpenAPI を契約の書式へ変換する" },
];

//  `harness lint` だけで呼んだときに続けて実行するもの（引数なしで意味が決まる検査だけ）
const LINT_ALL = [["lint", "spec"], ["lint", "refs"], ["lint", "git", "branch"]];

const sameWords = (a, b) => a.length === b.length && a.every((w, i) => w === b[i]);
const find = (words) => COMMANDS.find((c) => sameWords(c.words, words));

function listing() {
	const lines = ["使い方: harness <コマンド> [引数...]", ""];
	const width = Math.max(...COMMANDS.map((c) => c.words.join(" ").length));
	for (const group of [...new Set(COMMANDS.map((c) => c.group))]) {
		lines.push(`${group}:`);
		if (group === "読むだけ") lines.push(`  ${"lint".padEnd(width)}  ${LINT_ALL.map((w) => w.join(" ")).join(" → ")} を続けて実行する`);
		for (const c of COMMANDS.filter((x) => x.group === group)) lines.push(`  ${c.words.join(" ").padEnd(width)}  ${c.desc}`);
		lines.push("");
	}
	lines.push("引数は、それぞれの検査のものをそのまま渡せる（例: harness lint spec --docs docs）。");
	return lines.join("\n");
}

//  引数の先頭から、コマンド名として最も長く一致するものを選ぶ
function match(argv) {
	const longest = Math.max(...COMMANDS.map((c) => c.words.length));
	for (let n = Math.min(longest, argv.length); n >= 1; n--) {
		const cmd = find(argv.slice(0, n));
		if (cmd) return { cmd, rest: argv.slice(n) };
	}
	return null;
}

function run(cmd, rest) {
	const r = spawnSync(process.execPath, [join(TOOLS, cmd.script), ...cmd.prefix, ...rest], { stdio: "inherit" });
	if (r.error) {
		console.error(`harness: ${cmd.words.join(" ")} を起動できない: ${r.error.message}`);
		return 2;
	}
	//  子がシグナルで止まったら、同じシグナルで自分も止まる（呼び出し側に止まり方を伝える）
	if (r.signal) {
		process.kill(process.pid, r.signal);
		return 1;
	}
	return r.status ?? 1;
}

function main() {
	const argv = process.argv.slice(2);
	if (argv.length === 0 || (argv.length === 1 && ["-h", "--help", "help"].includes(argv[0]))) {
		console.log(listing());
		return 0;
	}
	if (sameWords(argv, ["lint"])) {
		let worst = 0;
		for (const words of LINT_ALL) {
			console.log(`\n== harness ${words.join(" ")}`);
			worst = Math.max(worst, run(find(words), []));
		}
		return worst;
	}
	const hit = match(argv);
	if (!hit) {
		//  途中まで合っているなら、その先の候補だけを示す
		const next = COMMANDS.filter((c) => c.words.length > 1 && c.words[0] === argv[0]).map((c) => c.words.join(" "));
		console.error(`harness: コマンド「${argv.filter((a) => !a.startsWith("-")).slice(0, 3).join(" ")}」は無い。`);
		console.error(next.length ? `候補: ${next.join(" / ")}` : listing());
		return 2;
	}
	return run(hit.cmd, hit.rest);
}

process.exitCode = main();
