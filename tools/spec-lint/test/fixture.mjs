//
//  spec-lint テスト用の最小 docs 一式を一時ディレクトリに書き出す。
//  validate --strict が 0 で通る「素の状態」を基準にし、各テストは 1 箇所だけ崩して違反を確かめる。
//  書式はテンプレート templates/develop/ に合わせる（テンプレートの改定で基準が崩れたら fixture も直す）。
//
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const SPEC_LINT = join(dirname(fileURLToPath(import.meta.url)), "..", "spec-lint.mjs");

const write = (root, rel, text) => {
	const file = join(root, rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, text);
	return file;
};

//  行頭に indent 桁の空白を足す（空行はそのまま）
const indent = (text, n) =>
	text
		.split("\n")
		.map((l) => (l.trim() === "" ? l : " ".repeat(n) + l))
		.join("\n");

const DEFAULT_ERRORS = `- code: INVALID_INPUT
  when: name が空
  wire: { status: 400 }`;

const DEFAULT_EXAMPLES = `ok:
  request: { name: "abc" }
  response: { id: 1 }
invalid:
  request: { name: "" }
  error: INVALID_INPUT`;

//  contractExtra   operation 直下に足す YAML（例: "x-evaluation-order: [a, b]"）
//  contractErrors  errors: の中身（シーケンス項目の YAML。null なら既定の INVALID_INPUT 1 件）
//  examples        examples: の中身（null なら ok + invalid）
//  status          契約の x-status
//  deferredRows    docs/verification/DEFERRED.md の表の行（文字列配列。null ならファイルを作らない）
export function writeMinimalDocs(root, { contractExtra = "", contractErrors = null, examples = null, status = "fixed", deferredRows = null } = {}) {
	write(
		root,
		"docs/_shared/components.yaml",
		`authSchemes: {}

errorCodes:
  INVALID_INPUT: 入力が要件を満たさない
  NOT_FOUND: 対象が存在しない

schemas: {}
`,
	);

	write(
		root,
		"docs/goals/GOAL-01-a/GOAL.md",
		`---
id: GOAL-01
actor: ACT-01
origin: KPI-01
status: active
---

# GOAL-01

> 利用者として、ものを作りたい
`,
	);

	write(
		root,
		"docs/goals/GOAL-01-a/UC-001-b/UC.md",
		`---
id: UC-001
title: ものを作る
actor: ACT-01
goal: GOAL-01
status: active
phase: 定義
---

# UC-001 ものを作る

## 概要

利用者がものを 1 件作る。

## 事前条件

- 利用者がログイン済みである

## 主シナリオ

1. 利用者が名前を入力する
2. システムが名前を検証する
3. システムがものを保存する

## 状態 × イベント表

| ものの状態 \\ イベント | 作成 |
| --- | --- |
| 未作成 | REQ-001 |

## 例外系の走査（4 分類）

| 軸 | 該当ステップ | 導出 |
| --- | --- | --- |
| 権限 | なし | なし |
| 不変条件違反 | 2 | REQ-001 |
| 並行性 | なし | なし |
| 外部依存 | なし | なし |

## 事後条件

- 成功時: ものが 1 件存在する
- 失敗時: いかなる状態変更も残っていない
`,
	);

	write(
		root,
		"docs/goals/GOAL-01-a/UC-001-b/REQ-001.md",
		`---
id: REQ-001
pattern: Event-driven
uc: UC-001
status: active
---

# REQ-001

> 利用者が名前を送信したとき、システムは名前が空なら拒否しなければならない。

## 検証方針

- **分割クラス**:
  - \`#empty\` — 名前が空
- **尽きている根拠**: 空か否かの 2 値
- **検証しない**: なし
- **参照先**: \`tests/thing.test.mjs::doThing\`
`,
	);

	const opBody = `transport: http
direction: outbound
owned: true
auth: none
summary: ものを作る
wire:
  method: POST
  path: /things
  success: 200
request:
  type: object
  required: [name]
  properties:
    name:
      type: string
      minLength: 1
response:
  type: object
  required: [id]
  properties:
    id: { type: integer }
errors:
${indent(contractErrors ?? DEFAULT_ERRORS, 2)}
examples:
${indent(examples ?? DEFAULT_EXAMPLES, 2)}
${contractExtra}`;

	write(
		root,
		"docs/goals/GOAL-01-a/UC-001-b/contract.yaml",
		`x-uc: UC-001
x-status: ${status}
x-spec: ./UC.md
x-updated: 2026-09-01

operations:
  doThing:
${indent(opBody, 4)}
`,
	);

	if (deferredRows !== null)
		write(
			root,
			"docs/verification/DEFERRED.md",
			`---
id: VERIFICATION_DEFERRED
status: living
---

# 保留台帳（機械判定できない指摘）

## 保留中の指摘

| ID | 起票日 | 出所 | 対象 | 指摘 | 機械判定できない理由（反例） | 昇格先 |
| --- | --- | --- | --- | --- | --- | --- |
${deferredRows.join("\n")}
`,
		);
	return root;
}

//  node <script> <args...> を同期実行し、終了コードと出力を返す
export function runNode(script, args = [], { cwd = process.cwd(), stdin = "" } = {}) {
	const r = spawnSync(process.execPath, [script, ...args], { cwd, input: stdin, encoding: "utf8" });
	return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}
