---
description: "🎭 Next.js — システムスイート（ブラウザーを起動するシナリオテスト）"
applyTo: "**/e2e/**,**/playwright.config.*"
---

# 🎭 Next.js — システムスイート（ブラウザーを起動するシナリオテスト）

Next.js（App Router）でなければ破棄する。シナリオテストの定義は R-1106–R-1108。この文書は runner、フォルダー、locator、pending マーカー、注釈だけを定める。既定スイートは [common-testing](common-testing.instructions.md)。テスト名とコメントは日本語。

## runner とフォルダー

- Playwright（`@playwright/test`）、プロジェクト根の `e2e/`、設定は `playwright.config.ts`。フォルダーを変える利用先は `CLAUDE.md` と `traceconfig.json` の `tests.system.dirs` に宣言する。
- `e2e/` を既定スイートの探索から除外し、`tests.system.dirs` と `tests.dirs` を重ねない（重なるとシナリオテストが `@covers` のないテストとして C11 に報告される）。
- 全件は `npx playwright test`、UC 選択は `npx playwright test --grep "UC-012"`。`traceconfig.json` の `commands.system` に宣言する。CI では宣言の有無にかかわらず実行する。
- 利用先の `CLAUDE.md` が宣言するシナリオ環境（`webServer`、投入済みデータ、使い捨てアカウント）の実アプリケーションを操作する。backend を mock にしない。

## シナリオテストの形

UC ごとに 1 ファイル、ファイルごとに 1 つの `test`、テスト名は `UC-nnn <UC の題名>`。`// @scenario UC-nnn` は `test(` の直前行（`trace-check` の `scenario_pattern` がそこで読む）。

```ts
// @scenario UC-012
test.fixme("UC-012 案件を登録する", async ({ page }) => { /* ... */ });
```

- 各 `await` 行は `UC.md` の `## 主シナリオ` の番号付きステップ 1 つに、最後の `expect` は `成功時` の事後条件に対応する。シナリオにない遷移や assertion を足さない。
- pending マーカーは `test.fixme(...)`。FE 配線の実装者が `test` に置き換えて Green にする。`test.fail` は使わない。
- `@covers` は付けない。`page.waitForTimeout` は使わず、自動待機と web-first assertion に任せる。ファイル間でシナリオを連鎖させない。

## locator の優先順（探索せず導出する）

シナリオテストと外観は同じ SSOT から locator を導出し、互いを読まない（ADR-0037）。

| 優先順 | locator | 導出元 |
| --- | --- | --- |
| 1 | `getByRole(role, { name })`、`getByLabel(text)` | 用語集（`docs/01-glossary.md`）の用語そのまま。role は control の種類（button、link、textbox、row）|
| 2 | `getByTestId(id)` | 契約。operation `renameUser` を実行する control → `renameUser`、request field `name` の入力 → `renameUser.name` |
| 禁止 | CSS selector、XPath、`nth()`、画面からコピーした文言の id | — |

文言が一意なら 1、同名の control が 2 つあれば 2。外観が不一致なら外観側を動かし、実装に合わせてシナリオテストを変えない。

## 決定性

使い捨てアカウントまたは投入済み fixture を実行ごとに 1 つ使い、前のテストに依存しない。animation は待たず最終状態を検証する。実時間に依存するならアプリの注入点か `page.clock` で固定する。CI の `retries` は許すが、retry なしで成功しないシナリオは指摘事項であり修正済みではない。
