---
description: "🎭 Next.js — システムスイート（ブラウザーを起動するシナリオテスト）"
applyTo: "**/e2e/**,**/playwright.config.*"
---

# 🎭 Next.js — システムスイート（ブラウザーを起動するシナリオテスト）

> **対象: Next.js（App Router）の TypeScript プロジェクト。** Next.js でなければ適用外として扱い、破棄する。
>
> **シナリオテストの定義、ユースケースごとに 1 本とする理由、実行時期は develop プロセスが所管する**
> （`docs.instructions.md` R-1106–R-1108、`references/playbook.md`「テスト実行の粒度」）。この文書が持つのは
> **Next.js のブラウザー上でその規約を成立させる配線**だけである。runner、フォルダー、locator の優先順、
> pending マーカー、UC タグ、`@scenario` 注釈を定める。既定スイートの規約は [common/testing.md](common-testing.instructions.md) にある。
>
> **テスト名とコメントは日本語で書く。**

---

## 1. runner とフォルダー

- **Playwright**（`@playwright/test`）を使い、プロジェクトの根の `e2e/` 配下に置く。設定は `playwright.config.ts`。利用先はフォルダー名を変えてよい。その場合は `CLAUDE.md` と `traceconfig.json` の `tests.system.dirs` に宣言する。
- **`e2e/` を既定スイートの探索から除外する**（`vitest` / `jest` 設定）。`tests.system.dirs` と `tests.dirs` は重ならないようにする。そうしないとシナリオテストが `@covers` のないテストとして報告される（C11）。
- **単一コマンドでスイート全体を実行する**（`npx playwright test`）。利用先が終端ゲートに含めたい場合は `traceconfig.json` の `commands.system` に宣言する。CI では宣言の有無にかかわらず実行する。**UC での選択実行**は `npx playwright test --grep "UC-012"`。
- 利用先の `CLAUDE.md` が宣言するシナリオ環境に接続する **実アプリケーション**を操作する（設定の `webServer`、投入済みデータ、使い捨てアカウント）。このスイートで backend を mock にしない。それは外観の仕事であり、シナリオの仕事ではない。

---

## 2. シナリオテストの形

ユースケースごとに 1 ファイル、ファイルごとに 1 つの `test` を置き、UC ID と UC の題名をテスト名にする。`@scenario` 注釈は `test(` の直前行に置く（`trace-check` はそこで読む。`scenario_pattern`）。

```ts
import { test, expect } from "@playwright/test";

// @scenario UC-012
test.fixme("UC-012 案件を登録する", async ({ page }) => {
  await page.goto("/projects");
  await page.getByRole("button", { name: "新規案件" }).click();
  await page.getByLabel("件名").fill("案件A");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("row", { name: /案件A/ })).toBeVisible();
});
```

- 各 `await` 行は `UC.md` の `## 主シナリオ` の番号付きステップ 1 つに対応し、最後の `expect` は `成功時` の事後条件に対応する。**それ以外は書かない**。余分な遷移も、シナリオにない assertion も追加しない。
- **pending マーカーは `test.fixme(...)`**。意味上は Red のテストとして作成するが、FE 配線が入るまでは runner が skip する。FE 配線の実装者が `test.fixme` を `test` に置き換え、Green にする。`test.fail` は使わない（「失敗すれば成功」になるシナリオは、配線済みだが誤った画面を隠す）。
- シナリオテストに **`@covers` は付けない**。**`page.waitForTimeout` は使わない**。待機は Playwright の自動待機と web-first assertion が担う。

---

## 3. locator の優先順（探索せず導出する）

シナリオテストと外観は同じ SSOT から locator を導出するため、互いを読まない（ADR-0037）。

| 優先順 | locator | 導出元 |
| --- | --- | --- |
| 1 | `getByRole(role, { name })`、`getByLabel(text)` | **用語集の用語**（`docs/01-glossary.md`）。用語そのものを使い、同義語にしない。role は control の種類（button、link、textbox、row）から決める |
| 2 | `getByTestId(id)` | **契約**。operation `renameUser` を実行する control → `data-testid="renameUser"`、request field `name` の入力 → `data-testid="renameUser.name"` |
| 禁止 | CSS selector、XPath、`nth()`、画面からコピーした文言を id にすること | — |

画面上で文言が一意なら優先順 1 を使い、2 つの control が同名なら 2 を使う。**外観が不一致なら外観側を動かす**。実装に合わせてシナリオテストを変更しない。

---

## 4. ブラウザー上でも決定的にする

| 不安定さの原因 | 対処 |
| --- | --- |
| 共有アカウントと残存データ | 利用先が宣言する使い捨てアカウント、または投入済み fixture を実行ごとに 1 つ使う。前のテストに依存しない |
| animation と transition | それ自体を待たず、web-first assertion で最終状態を検証する |
| 実時間 | シナリオが依存する場合は、アプリ自身の注入点または `page.clock` で固定する |
| retry | CI 用に `retries` を設定してよいが、retry がないと成功しないシナリオは修正済みではなく指摘事項である |

テストは **実行順序に依存しない**。UC ごと 1 シナリオとはファイルごと 1 つの `test` であり、ファイル間でシナリオを連鎖させない。

---

## ✅ 返却前チェックリスト

- [ ] UC の `test` はちょうど 1 つで、題名が `UC-nnn …`、直前行が `// @scenario UC-nnn`、pending マーカーが `test.fixme` か？
- [ ] すべての操作が `## 主シナリオ` の番号付きステップに、最後の assertion が `成功時` に対応するか？
- [ ] locator はすべて優先順 1（用語集の用語）か 2（operation / `operation.field`）か？ CSS、XPath、`nth()` はないか？
- [ ] `e2e/` は既定スイートの探索から除外され、`tests.system.dirs` と `tests.dirs` は重ならないか？
- [ ] このテストだけ（`--grep "UC-nnn"`）と `trace-check --only C15` を実行したか？
