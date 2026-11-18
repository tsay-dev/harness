#!/usr/bin/env node
//
//  harness — 同梱ツールの入口（依存ゼロの Node）
//
//  コマンドの名前と、同梱ツールのファイルの名前は 1 つ（ADR-0071）。入口は、名前とファイルの対応表を持たない。
//  コマンドの語を - でつないだものが、置き場とファイルの名前になる（決め方は tools/_shared/command-file.mjs）:
//    harness lint git branch → tools/lint-git-branch/lint-git-branch.mjs
//  ここが持つのは、コマンドの一覧（語、分類、1 行の説明）だけ。一覧にあるコマンドのファイルを起動して、引数をそのまま渡す。
//  検査の中身も、引数の解釈も持たない。各コマンドの引数と終了コードは、そのコマンドのファイルのものがそのまま返る。
//
//  使い方:
//    node <harness のルート>/bin/harness.mjs <コマンド> [そのコマンドの引数...]
//    引数なしで呼ぶと、コマンドの一覧を表示する。
//
//  終了コード: コマンドの終了コード。コマンド名の誤り、コマンドのファイルが無い、起動できない、は 2。
//  コマンドがシグナルで止まったときは、同じシグナルで終わる。入口が SIGINT / SIGTERM / SIGHUP / SIGQUIT を
//  受けたときは、コマンドへ同じシグナルを送り、コマンドが終わるのを待ってから同じシグナルで終わる。
//  `harness lint`（まとめて実行）は、実行したもののうち最も大きい終了コード。途中で出力先が閉じるなどして
//  見出しを書けなくなったら、残りを実行せず、実行済みの最も大きい終了コード（0 なら 1）で終わる。
//  環境変数 HARNESS_TOOLS_DIR は同梱ツールの探索先（<このファイルの場所>/../tools）を差し替える（テスト用）。

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { commandFile } from "../tools/_shared/command-file.mjs";

const TOOLS = process.env.HARNESS_TOOLS_DIR
	? resolve(process.env.HARNESS_TOOLS_DIR)
	: join(dirname(fileURLToPath(import.meta.url)), "..", "tools");

//  コマンドの一覧。words = コマンドの語の並び、group = 分類、desc = 1 行の説明。
//  ファイルの場所は words から決まるので、ここには書かない。引数なしの表示もここから作る。
const COMMANDS = [
	{ group: "読むだけ", words: ["lint", "config"], desc: "プロジェクトの設定の形を検査し、機械で確かめていない決めごとを一覧する" },
	{ group: "読むだけ", words: ["lint", "spec"], desc: "仕様の文書の書式と状態の決まりを検査する" },
	{ group: "読むだけ", words: ["lint", "refs"], desc: "仕様・コード・テストの ID の紐づきを検査する" },
	{ group: "読むだけ", words: ["lint", "entry"], desc: "テストの入口が、本番と同じ組み立てを呼んでいるかを検査する" },
	{ group: "読むだけ", words: ["lint", "coverage"], desc: "テストの実行の記録を読み、どのテストからも実行されなかったソースと関数を洗い出す" },
	{ group: "読むだけ", words: ["lint", "entries"], desc: "アプリの入口の一覧（--from か標準入力）を契約と突き合わせ、契約に無い入口と入口の無い操作を洗い出す" },
	{ group: "読むだけ", words: ["lint", "git", "branch"], desc: "ブランチ名の書式を検査する" },
	{ group: "読むだけ", words: ["lint", "git", "message"], desc: "コミットメッセージの書式を検査する" },
	{ group: "読むだけ", words: ["lint", "git", "uc"], desc: "コミットが指す UC が実装に入れる状態かを検査する" },
	{ group: "実行する", words: ["run", "cases"], desc: "契約の実例を実装に当てて実行する" },
	{ group: "実行する", words: ["verify"], desc: "完了の判定を行う（--level lint|fast|full。--hook で Stop フックとして動く）" },
	{ group: "実行する", words: ["guard"], desc: "書き込み前の関門（PreToolUse フック）" },
	{ group: "補助", words: ["next-id"], desc: "次の空き ID を予約して出力する（goal|uc|req|br|nfr|adr）" },
	{ group: "補助", words: ["index"], desc: "1 行 1 ID の索引を出力する" },
	{ group: "補助", words: ["migrate", "reqs"], desc: "REQ-nnn.md を UC.md の「要件」の節へ移す（--write で書き換える）" },
	{ group: "補助", words: ["convert"], desc: "OpenAPI を契約の書式へ変換する" },
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

//  入口が止められたら、起動したコマンドにも同じシグナルを送る（入口だけが消えてコマンドが裏で動き続けないように）。
//  コマンドがさらに起動したプロセスまでは止めない（そこはコマンドの側の責任）。
//  受けたシグナルは覚えておき、コマンドが終わるのを待ってから、その終了コードにかかわらず同じシグナルで自分も終わる。
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
	const script = commandFile(TOOLS, cmd.words);
	if (!existsSync(script)) {
		console.error(`harness: ${cmd.words.join(" ")} のファイル ${script} が無い（bin/ と tools/ は同じ checkout のまま置く）。`);
		return Promise.resolve(2);
	}
	return new Promise((done) => {
		const finish = (code) => {
			current = null;
			if (stopBy) stopSelf();
			else done(code);
		};
		current = spawn(process.execPath, [script, ...rest], { stdio: "inherit" });
		current.on("error", (e) => {
			console.error(`harness: ${cmd.words.join(" ")} を起動できない: ${e.message}`);
			finish(2);
		});
		current.on("exit", (status, signal) => {
			//  コマンドがシグナルで止まったら、同じシグナルで自分も止まる（呼び出し側に止まり方を伝える）
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
