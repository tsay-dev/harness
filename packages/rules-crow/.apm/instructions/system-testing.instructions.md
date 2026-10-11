---
description: "🎭 crow — system スイート（ブラウザーを起動するシナリオテスト）"
applyTo: "**/crow3_*/e2e/**,**/crow3_*/playwright.config.*"
---

# 🎭 crow — system スイート（ブラウザーを起動するシナリオテスト）

> **対象：crow（crow3）アプリケーション。** crow でなければこの文書は適用しません。
>
> **シナリオテストとは何か、なぜユースケースごとに一つか、いつ実行するかは develop のプロセスが定義します**
> （`docs.instructions.md` R-1106–R-1108。全件実行は完了条件と CI だけ）。この文書は
> **それらの規約を crow 上のブラウザーで成立させる接続**だけを扱います。ランナー、フォルダー、ロケーターの優先順位、
> 未実装マーカー、UC タグ、`@scenario` アノテーションです。既定スイートの規約は [common/testing.md](common-testing.instructions.md) にあります。
>
> **テストタイトルとコメントは日本語で書いてください。**

---

## 1. ランナーとフォルダー

- crow アプリケーションのルートの `e2e/` に **Playwright**（`@playwright/test`）を置き、設定は `playwright.config.ts` とします。PHP 側は関与しません。配信されたページを外から操作するため、ランナーは一般の Web アプリと同じです。利用先は `CLAUDE.md` と `traceconfig.json` の `tests.system.dirs`（`extensions: [".ts"]`）にフォルダーを宣言します。
- **`e2e/` は `tests/` の配下に置きません**。PHPUnit の探索が拾わず、`tests.system.dirs` と `tests.dirs` の対象も分離できます（重なると C11 がシナリオテストを `@covers` なしとして報告します）。
- **一つのコマンドでスイート全体を実行します**（アプリケーションルートから `npx playwright test`）。利用先が終端ゲートに含める場合、`traceconfig.json` の `commands.system` に宣言します。CI は宣言の有無によらず実行します。**UC による選択実行**は `npx playwright test --grep "UC-012"` です。
- スイートは **実アプリケーション**を操作します（利用先のローカルサーバー、シード済み DB、使い捨てアカウント — `CLAUDE.md` に宣言し、推測で作らない）。モックしたバックエンドは外観作成用であり、ここでは使いません。

---

## 2. シナリオテストの形

ユースケースごとに一ファイル、ファイルごとに一つの `test` とし、タイトルに UC ID と名称を入れます。`test(` の直上に `// @scenario UC-nnn` を置きます。

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

- 各 `await` 行は `UC.md` の `## 主シナリオ` の番号付きの一手順、最後の `expect` は `成功時` の事後条件です。シナリオが述べていないことは追加しません。
- **未実装マーカーは `test.fixme(...)`** です。FE 接続の implementer が `test` に変えて green にします。
- **`@covers` は付けず**、**`page.waitForTimeout` は使いません**。
- view part（`frontend-viewpart.md`）で描画する crow のページも、ブラウザーから見れば DOM です。シナリオに part 名、section 名、クラス名は書きません。

---

## 3. ロケーターの優先順位（探索せず導出する）

| 優先順位 | ロケーター | 導出元 |
| --- | --- | --- |
| 1 | `getByRole(role, { name })`、`getByLabel(text)` | **用語集の語**（`docs/01-glossary.md`）— 同義語でなくその語を使う。role は操作要素の種類から導出 |
| 2 | `getByTestId(id)` | **契約**：operation `renameUser` を発火する操作要素 → `data-testid="renameUser"`。その request フィールド `name` → `data-testid="renameUser.name"` |
| 使用禁止 | CSS セレクター、XPath、`nth()`、part 名や section 名、画面の文言をコピーした id | — |

**外観が一致しなければ、外観を修正します**（ADR-0037）。シナリオテストを実装に合わせて変更しません。

---

## 4. ブラウザーで決定的にする

| 不安定さの原因 | 対処 |
| --- | --- |
| 共有アカウントと残存行 | 利用先が宣言した、実行ごとのシード済み fixture または使い捨てアカウント。先行テストに依存しない |
| サーバー描画による画面遷移 | URL だけでなく、遷移先ページの内容を検証する |
| 実時刻 | シナリオが依存する場合はアプリケーションの注入点から固定する |
| リトライ | CI 設定では許可する。通過にリトライを要するシナリオは指摘事項とする |

テストは順序に依存しません。ファイルごとに一つの `test` とし、連鎖させません。

---

## ✅ 返却前のチェックリスト

- [ ] UC の `test` はちょうど一つ、タイトルは `UC-nnn …`、直上に `// @scenario UC-nnn`、未実装マーカーは `test.fixme` か？
- [ ] 各操作は `## 主シナリオ` の番号付き手順、最後のアサーションは `成功時` か？
- [ ] ロケーターは優先順位 1（用語集の語）または 2（operation / `operation.field`）だけか？
- [ ] `e2e/` は PHPUnit の探索対象外で、`tests.system.dirs` と `tests.dirs` が重複していないか？
- [ ] このテストだけ（`--grep "UC-nnn"`）と `trace-check --only C15` を実行したか？
