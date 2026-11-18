#!/usr/bin/env node
//
//  lint entry — テストの入口が、本番と同じ組み立てを呼んでいるかの検査（harness lint entry。依存ゼロの Node）
//
//  テストが通っていても、テストが本番とは別の組み立てを通っていれば、仕様どおりに動くことの裏付けにならない。
//  実装のコードに書く印（名乗り）ではなく、実行の記録と、アプリ自身が出した入口の一覧で確かめる（ADR-0066 / ADR-0070）。
//  このコマンドはファイルと記録を読むだけで、テストもコマンドも実行しない（完了の判定では、検査の並び tools/_shared/suite.mjs が実行して渡す）。
//  引数と設定の読み方は tools/_shared/entry.mjs（lint entry・lint coverage・lint entries で同じ）。
//
//  設定（harness.config.json）:
//    "entry": {
//      "compose": "apps/api/src/compose.ts#assembleApps",      本番の組み立て（<ファイル>#<名前>）
//      "test_entry": "tests/support/app.ts#createTestApp"       テストの入口（<ファイル>#<名前>）
//    }
//  entry は { "none": "<理由>" } と書ける。省略すると「未宣言」と表示する（確かめていないことを見えるままにする）。
//
//  検査項目:
//    X1  compose と test_entry は「<ファイル>#<名前>」の形で、ファイルが実在し、その中に名前が現れる
//    X2  test_entry のファイルの中に、compose の名前が現れる（テストの入口が、本番の組み立てを呼んでいる）
//
//  使い方:
//    harness lint entry [--root <プロジェクトのルート>] [--config <設定ファイル>]
//
//  終了コード: 0 = 違反なし（未宣言・none を含む） / 1 = 違反あり / 2 = 使い方・設定ファイルが無い・JSON として読めない

import { openProject, readEntry, tagOf } from "../_shared/entry.mjs";

const TAG = tagOf("entry");

function main() {
	const { cfg, root } = openProject("entry", process.argv.slice(2));
	const entry = readEntry(cfg, root);
	if (entry.state === "undeclared") {
		console.log(`${TAG} entry が未宣言: テストが本番と同じ組み立てを通っているかを確かめていない`);
		return 0;
	}
	if (entry.state === "none") {
		console.log(`${TAG} entry = none（${entry.reason}）: テストが本番と同じ組み立てを通っているかを確かめていない`);
		return 0;
	}
	for (const e of entry.errs) console.log(`  err  ${e}`);
	if (entry.errs.length) {
		console.log(`${TAG} 違反 ${entry.errs.length} 件`);
		return 1;
	}
	console.log(`${TAG} OK: テストの入口 ${entry.testEntry.file}#${entry.testEntry.name} は、本番の組み立て ${entry.compose.file}#${entry.compose.name} を呼んでいる`);
	return 0;
}

process.exitCode = main();
