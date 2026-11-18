#!/usr/bin/env node
//
//  lint git message — コミットメッセージの書式検査（harness lint git message。依存ゼロの Node）
//
//  設定の git ブロックの読み方と、コミットの type の語彙は tools/_shared/git-rules.mjs（lint git branch と同じ）。
//
//  コミットメッセージ（1 行目）:
//    M1  <type>(<scope>): <subject> の形で、type は閉じた語彙
//    M2  subject の末尾に句点を付けない
//    M3  モノレポでは scope が必須で、宣言された unit か repo
//    "Merge " / "Revert \"" で始まるものは git が作る文面なので対象外（一覧には出す）
//
//  使い方:
//    harness lint git message (--file <path> | --range <base>..<head>) [--branch <name>] [--root <host root>] [--config harness.config.json]
//      --file     commit-msg フックが渡すメッセージファイル（# 行は無視する）
//      --range    その範囲の各コミット（マージコミットを除く）
//      --branch   exempt_branches と突き合わせる名前（既定は現在のブランチ）
//
//  終了コード: 0 = 違反なし（未宣言・対象外を含む。行に明示する） / 1 = 違反あり / 2 = 設定・引数の異常
//  baseline は持たない（文面はその場で直すもの）。
//

import { existsSync, readFileSync } from "node:fs";
import { GENERATED_RE, HEADER_RE, TYPES, currentBranch, git, isExempt, prefixesOf, report, runGitLint } from "../_shared/git-rules.mjs";

const COMMAND = "lint git message";
const TAG = `[${COMMAND}]`;

//  メッセージの 1 行目（空行と commit-msg ファイルの # 行を飛ばす）
function headerOf(text) {
	for (const line of text.split(/\r?\n/)) {
		if (!line.trim() || line.startsWith("#")) continue;
		return line.trimEnd();
	}
	return "";
}

function checkHeader(label, header, cfg) {
	if (!header) return [`M1 ${label}: 件名が無い`];
	const m = HEADER_RE.exec(header);
	if (!m) return [`M1 ${label}: <type>(<scope>): <subject> の形でない — ${header}`];
	const [, type, scope, , subject] = m;
	const problems = [];
	if (!TYPES.includes(type)) problems.push(`M1 ${label}: type ${type} は閉じた語彙に無い（使えるのは ${TYPES.join(" / ")}）`);
	if (/[.。]$/.test(subject)) problems.push(`M2 ${label}: subject の末尾に句点を付けない — ${header}`);
	if (cfg.units) {
		const scopes = prefixesOf(cfg);
		if (!scope) problems.push(`M3 ${label}: scope が無い（モノレポでは ${scopes.join(" / ")} のどれか）`);
		else if (!scopes.includes(scope)) problems.push(`M3 ${label}: scope ${scope} は宣言された unit でない（使えるのは ${scopes.join(" / ")}）`);
	}
	return problems;
}

function cmdMessage(root, cfg, opts) {
	if ((opts.file === null) === (opts.range === null)) {
		console.error(`${TAG} message には --file <path> か --range <base>..<head> のどちらか一方が要る`);
		return 2;
	}
	const branch = opts.branch ?? currentBranch(root);
	if (branch && isExempt(branch, cfg)) {
		console.log(`${TAG} ${branch}: exempt_branches に一致するのでメッセージを検査していない`);
		return 0;
	}

	const messages = [];
	if (opts.file !== null) {
		if (!existsSync(opts.file)) {
			console.error(`${TAG} メッセージファイルが無い: ${opts.file}`);
			return 2;
		}
		messages.push({ label: opts.file, text: readFileSync(opts.file, "utf8") });
	} else {
		const list = git(root, ["rev-list", "--no-merges", opts.range]);
		if (!list.ok) {
			console.error(`${TAG} 範囲が読めない: ${opts.range}（${list.err}）`);
			return 2;
		}
		for (const sha of list.out.split("\n").filter(Boolean)) {
			messages.push({ label: sha.slice(0, 7), text: git(root, ["log", "-1", "--format=%B", sha]).out });
		}
	}

	const problems = [];
	let checked = 0;
	for (const { label, text } of messages) {
		const header = headerOf(text);
		if (GENERATED_RE.test(header)) {
			console.log(`${TAG} ${label}: git が作る文面なので検査していない — ${header}`);
			continue;
		}
		checked++;
		problems.push(...checkHeader(label, header, cfg));
	}
	return report(TAG, problems, `コミットメッセージ OK: ${checked} 件`);
}

process.exit(runGitLint(COMMAND, cmdMessage));
