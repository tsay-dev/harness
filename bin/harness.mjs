#!/usr/bin/env node
//
//  harness — 同梱ツールの入口（依存ゼロの Node）
//
//  ツールごとに違っていた呼び出し方を、1 つのコマンドと「何をするか」で選ぶ名前にそろえる。
//  ここは名前から同梱ツールを選んで引数をそのまま渡すだけで、検査の中身は持たない。
//  各コマンドの引数と終了コードは、渡した先のツールのものがそのまま返る。
//
//  コマンドの名前と行き先は、下の COMMANDS の表が正本（引数なしで呼ぶと一覧を表示する）。
//
//  使い方:
//    node <harness のルート>/bin/harness.mjs <コマンド> [渡した先のツールの引数...]
//
//  終了コード: 渡した先のツールの終了コード。コマンド名の誤り、行き先のファイルが無い、起動できない、は 2。
//  渡した先がシグナルで止まったときは、同じシグナルで終わる。入口が SIGINT / SIGTERM / SIGHUP / SIGQUIT を
//  受けたときは、渡した先へ同じシグナルを送り、渡した先が終わるのを待ってから同じシグナルで終わる。
//  `harness lint`（まとめて実行）は、実行したもののうち最も大きい終了コード。途中で出力先が閉じるなどして
//  見出しを書けなくなったら、残りを実行せず、実行済みの最も大きい終了コード（0 なら 1）で終わる。
//  環境変数 HARNESS_TOOLS_DIR は同梱ツールの探索先（<このファイルの場所>/../tools）を差し替える（テスト用）。

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TOOLS = process.env.HARNESS_TOOLS_DIR
	? resolve(process.env.HARNESS_TOOLS_DIR)
	: join(dirname(fileURLToPath(import.meta.url)), "..", "tools");

//  コマンド表。words = コマンド名の並び、script = tools/ からの相対パス、prefix = 利用者の引数の前に付ける引数。
//  一覧（引数なしの表示）もここから作る。名前と行き先の正本はこの表だけ。
const COMMANDS = [
	{ group: "読むだけ", words: ["lint", "config"], script: "config-lint/config-lint.mjs", prefix: [], desc: "プロジェクトの設定の形を検査し、機械で確かめていない決めごとを一覧する" },
	{ group: "読むだけ", words: ["lint", "spec"], script: "spec-lint/spec-lint.mjs", prefix: ["validate"], desc: "仕様の文書の書式と状態の決まりを検査する" },
	{ group: "読むだけ", words: ["lint", "refs"], script: "trace-check/trace-check.mjs", prefix: [], desc: "仕様・コード・テストの ID の紐づきを検査する" },
	{ group: "読むだけ", words: ["lint", "entry"], script: "exec-check/exec-check.mjs", prefix: ["entry"], desc: "テストの入口が、本番と同じ組み立てを呼んでいるかを検査する" },
	{ group: "読むだけ", words: ["lint", "coverage"], script: "exec-check/exec-check.mjs", prefix: ["coverage"], desc: "テストの実行の記録を読み、どのテストからも実行されなかったソースを洗い出す" },
	{ group: "読むだけ", words: ["lint", "git", "branch"], script: "git-lint/git-lint.mjs", prefix: ["branch"], desc: "ブランチ名の書式を検査する" },
	{ group: "読むだけ", words: ["lint", "git", "message"], script: "git-lint/git-lint.mjs", prefix: ["message"], desc: "コミットメッセージの書式を検査する" },
	{ group: "読むだけ", words: ["lint", "git", "uc"], script: "spec-lint/spec-lint.mjs", prefix: ["gate"], desc: "コミットが指す UC が実装に入れる状態かを検査する" },
	{ group: "実行する", words: ["run", "cases"], script: "contract-run/contract-run.mjs", prefix: [], desc: "契約の実例を実装に当てて実行する" },
	{ group: "実行する", words: ["verify"], script: "gate-hook/verify.mjs", prefix: [], desc: "完了の判定を行う（--level lint|fast|full。--hook で Stop フックとして動く）" },
	{ group: "実行する", words: ["guard"], script: "gate-hook/gate-hook.mjs", prefix: [], desc: "書き込み前の関門（PreToolUse フック）" },
	{ group: "補助", words: ["next-id"], script: "trace-check/trace-check.mjs", prefix: ["--next"], desc: "次の空き ID を予約して出力する（goal|uc|req|br|nfr|adr）" },
	{ group: "補助", words: ["index"], script: "trace-check/trace-check.mjs", prefix: ["--index"], desc: "1 行 1 ID の索引を出力する" },
	{ group: "補助", words: ["convert"], script: "spec-lint/spec-lint.mjs", prefix: ["convert"], desc: "OpenAPI を契約の書式へ変換する" },
];

//  `harness lint` だけで呼んだときに続けて実行するもの（引数なしで意味が決まる検査だけ）
const LINT_ALL = [["lint", "config"], ["lint", "spec"], ["lint", "refs"], ["lint", "entry"], ["lint", "git", "branch"]];

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

//  入口が止められたら、渡した先のツールにも同じシグナルを送る（入口だけが消えてツールが裏で動き続けないように）。
//  ツールがさらに起動したコマンドまでは止めない（そこはツールの側の責任）。
//  受けたシグナルは覚えておき、ツールが終わるのを待ってから、その終了コードにかかわらず同じシグナルで自分も終わる。
//  受け口は最初に 1 回だけ付け、動いている間は外さない。検査ごとに付け外しすると、外した瞬間に届いたシグナルが
//  消えたり、付ける前に届いたシグナルで入口だけが止まったりする。
const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"];
let stopBy = null;
let current = null;
const onSignal = (sig) => {
	stopBy ??= sig;
	current?.kill(sig);
};
for (const s of SIGNALS) process.on(s, onSignal);

//  覚えたシグナルで自分を止める。止まるまでの間に先へ進まないよう、解決しない Promise を返す
function stopSelf() {
	for (const s of SIGNALS) process.removeListener(s, onSignal);
	process.kill(process.pid, stopBy);
	return new Promise(() => setTimeout(() => process.exit(1), 5000));
}

function run(cmd, rest) {
	//  いまの呼び出し方では、検査と検査の間にシグナルの受け口は動かないので届かない。呼び出し方を変えたときの備え
	if (stopBy) return stopSelf();
	const script = join(TOOLS, cmd.script);
	if (!existsSync(script)) {
		console.error(`harness: ${cmd.words.join(" ")} の行き先 ${script} が無い（bin/ と tools/ は同じ checkout のまま置く）。`);
		return Promise.resolve(2);
	}
	return new Promise((done) => {
		const finish = (code) => {
			current = null;
			if (stopBy) stopSelf();
			else done(code);
		};
		current = spawn(process.execPath, [script, ...cmd.prefix, ...rest], { stdio: "inherit" });
		current.on("error", (e) => {
			console.error(`harness: ${cmd.words.join(" ")} を起動できない: ${e.message}`);
			finish(2);
		});
		current.on("exit", (status, signal) => {
			//  渡した先がシグナルで止まったら、同じシグナルで自分も止まる（呼び出し側に止まり方を伝える）
			stopBy ??= signal;
			//  届いているのにまだ配られていないシグナルを先に受け取ってから、続きを決める
			setImmediate(() => finish(status ?? 1));
		});
	});
}

//  標準出力へ書き、書けたかどうかを返す。失敗は戻り値で扱うので、ストリームの error では落とさない
process.stdout.on("error", () => {});
const say = (text) => new Promise((res) => process.stdout.write(text, (e) => res(!e)));

async function main() {
	const argv = process.argv.slice(2);
	if (argv.length === 0 || (argv.length === 1 && ["-h", "--help", "help"].includes(argv[0]))) {
		console.log(listing());
		return 0;
	}
	if (sameWords(argv, ["lint"])) {
		let worst = 0;
		for (const words of LINT_ALL) {
			//  見出しを書けなければ（harness lint | head などで出力先が先に閉じた、など）、残りを実行せずに失敗で終わる。
			//  実行していない検査を、通ったことにしない
			if (!(await say(`\n== harness ${words.join(" ")}\n`))) return Math.max(worst, 1);
			worst = Math.max(worst, await run(find(words), []));
		}
		return worst;
	}
	const hit = match(argv);
	if (!hit) {
		const names = [];
		for (const a of argv) {
			if (a.startsWith("-")) break;
			names.push(a);
		}
		const next = COMMANDS.filter((c) => c.words.length > 1 && c.words[0] === argv[0]).map((c) => c.words.join(" "));
		if (sameWords(names, ["lint"])) console.error("harness: lint をまとめて実行するときは引数を渡せない。lint spec --docs docs のように、検査を選んで渡す。");
		else console.error(`harness: コマンド「${names.slice(0, 3).join(" ") || argv[0]}」は無い。`);
		console.error(next.length ? `候補: ${next.join(" / ")}` : listing());
		return 2;
	}
	return run(hit.cmd, hit.rest);
}

process.exitCode = await main();
