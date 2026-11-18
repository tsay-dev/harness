#!/usr/bin/env node
//
//  lint git branch — ブランチ名の書式検査（harness lint git branch。依存ゼロの Node）
//
//  設定の git ブロックの読み方と、検査しないブランチの判定は tools/_shared/git-rules.mjs（lint git message と同じ）。
//
//  ブランチ名:
//    B1  <prefix>/<topic> の形（スラッシュはちょうど 1 つ）
//    B2  prefix は宣言された unit か repo（モノレポ）／コミットの type（単一ユニット）
//    B3  topic は小文字 ASCII のケバブケース 2〜5 語
//
//  使い方:
//    harness lint git branch [--name <branch>] [--root <host root>] [--config harness.config.json]
//      --name     検査する名前（既定は現在のブランチ。CI の detached HEAD では必須）
//
//  終了コード: 0 = 違反なし（未宣言・対象外を含む。行に明示する） / 1 = 違反あり / 2 = 設定・引数の異常
//  baseline は持たない（名前はその場で直すもの）。
//

import { TOPIC_RE, currentBranch, isExempt, prefixesOf, report, runGitLint } from "../_shared/git-rules.mjs";

const COMMAND = "lint git branch";
const TAG = `[${COMMAND}]`;

function checkBranch(name, cfg) {
	const shape = cfg.units ? "<unit>/<topic>" : "<type>/<topic>";
	const parts = name.split("/");
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		return [`B1 ${name}: ${shape} の形でない（スラッシュはちょうど 1 つ。既定ブランチや unit 名だけのブランチでは作業しない）`];
	}
	const [prefix, topic] = parts;
	const problems = [];
	const prefixes = prefixesOf(cfg);
	if (!prefixes.includes(prefix)) {
		const kind = cfg.units ? "宣言された unit" : "コミットの type";
		problems.push(`B2 ${name}: 接頭辞 ${prefix} は${kind}でない（使えるのは ${prefixes.join(" / ")}）`);
	}
	if (!TOPIC_RE.test(topic)) problems.push(`B3 ${name}: topic ${topic} が小文字 ASCII のケバブケース 2〜5 語でない`);
	return problems;
}

function cmdBranch(root, cfg, opts) {
	const name = opts.name ?? currentBranch(root);
	if (!name) {
		console.error(`${TAG} ブランチ名が取れない（detached HEAD）。--name で渡す`);
		return 2;
	}
	if (isExempt(name, cfg)) {
		console.log(`${TAG} ${name}: exempt_branches に一致するので検査していない`);
		return 0;
	}
	return report(TAG, checkBranch(name, cfg), `ブランチ名 OK: ${name}`);
}

process.exitCode = runGitLint(COMMAND, cmdBranch);
