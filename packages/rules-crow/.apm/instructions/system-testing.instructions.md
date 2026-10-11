---
description: "🎭 crow — system スイート（ブラウザーを起動するシナリオテスト）"
applyTo: "**/crow3_*/e2e/**,**/crow3_*/playwright.config.*"
---

# 🎭 crow — system スイート（ブラウザーを起動するシナリオテスト）

crow（crow3）アプリケーションの UC ごとのシナリオテスト（`docs.instructions.md` R-1106–R-1108）をブラウザーで成立させる接続。既定スイートの規約は [common-testing](common-testing.instructions.md)。テストタイトルとコメントは日本語で書く。

## 1. ランナーとフォルダー

- アプリケーションルートの `e2e/` に Playwright（`@playwright/test`）を置き、設定は `playwright.config.ts`。PHP 側は関与せず、配信されたページを外から操作する。利用先は `CLAUDE.md` と `traceconfig.json` の `tests.system.dirs`（`extensions: [".ts"]`）にフォルダーを宣言する。
- `e2e/` は `tests/` の配下に置かない（PHPUnit の探索が拾わず、`tests.system.dirs` と `tests.dirs` が重なると C11 がシナリオテストを `@covers` なしとして報告する）。
- 全件実行はアプリケーションルートから `npx playwright test`（終端ゲートに含めるなら `traceconfig.json` の `commands.system` に宣言。CI は宣言の有無によらず実行）。UC による選択実行は `npx playwright test --grep "UC-012"`。全件は完了条件と CI だけ。
- 実アプリケーションを操作する（利用先のローカルサーバー、シード済み DB、使い捨てアカウントは `CLAUDE.md` に宣言し、推測で作らない）。モックしたバックエンドは使わない。

## 2. シナリオテストの形

UC ごとに一ファイル、ファイルごとに一つの `test`。タイトルに UC ID と名称を入れ、`test(` の直上に `// @scenario UC-nnn` を置く。

```ts
import { test, expect } from "@playwright/test";

// @scenario UC-012
test.fixme("UC-012 案件を登録する", async ({ page }) => {
  await page.goto("/projects");
  await page.getByRole("link", { name: "新規案件" }).click();
  await page.getByLabel("件名").fill("案件A");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("row", { name: /案件A/ })).toBeVisible();
});
```

- 各 `await` 行は `UC.md` の `## 主シナリオ` の番号付きの一手順、最後の `expect` は `成功時` の事後条件。シナリオが述べていないことは追加しない。
- 未実装マーカーは `test.fixme(...)`。FE 接続の implementer が `test` に変えて green にする。
- `@covers` は付けない。`page.waitForTimeout` は使わない。テストは順序に依存せず、ファイル間で連鎖させない。
- viewpart で描画するページもブラウザーから見れば DOM であり、シナリオに part 名、section 名、クラス名は書かない。

## 3. ロケーター（探索せず導出する）

| 優先順位 | ロケーター | 導出元 |
| --- | --- | --- |
| 1 | `getByRole(role, { name })`、`getByLabel(text)` | 用語集の語（`docs/01-glossary.md`）。同義語でなくその語を使う |
| 2 | `getByTestId(id)` | 契約: operation `renameUser` を発火する操作要素 → `data-testid="renameUser"`。その request フィールド `name` → `data-testid="renameUser.name"` |
| 禁止 | CSS セレクター、XPath、`nth()`、part 名や section 名、画面の文言をコピーした id | — |

外観が一致しなければ外観を修正する（ADR-0037）。シナリオテストを実装に合わせて変えない。

## 4. ブラウザーで決定的にする

- 共有アカウントと残存行: 利用先が宣言した実行ごとのシード済み fixture または使い捨てアカウント。先行テストに依存しない。
- サーバー描画による画面遷移: URL だけでなく遷移先ページの内容を検証する。
- 実時刻: シナリオが依存する場合はアプリケーションの注入点から固定する。
- リトライ: CI 設定では許可する。通過にリトライを要するシナリオは指摘事項とする。
