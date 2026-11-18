---
description: "Next.js — プロジェクトの lint で止める項目の一覧"
applyTo: "**/next.config.*,**/middleware.ts,**/middleware.js,**/app/**,**/actions/**/*.ts,**/actions/**/*.tsx,**/components/**,**/features/**,**/domain/**,**/infrastructure/**,**/use-cases/**,**/usecases/**,**/e2e/**,**/playwright.config.*,**/eslint.config.*,**/.eslintrc*,**/biome.json,**/biome.jsonc,**/tsconfig*.json,**/harness.config.json"
---

# Next.js — lint で止める項目

このスタックの規約のうち、lint（型検査を含む）で機械的に止められる決まりの一覧。ほかの規約はこれらを文章で繰り返さず、この一覧（`common-lint`）を指す。

- 止め方（使う道具、規則の名前、設定の書き方）は利用プロジェクトが決める。`harness.config.json` の `rules` に、その設定のファイルと、確かめる `commands` のキーを書く。
- まだ止めていない項目は、止めるまで `harness.config.json` の `conventions` に、項目の文と止めていない理由を書く。
- 対象から外すファイル（App Router がファイル規約で default export を要求するファイルなど）は、lint の設定の側に書く。

| 止めること | 対象 |
| --- | --- |
| 型エラーを消すための `any`、`as any`、非 null アサーション（`!`）、`@ts-expect-error`、lint を抑えるコメント | 本番コードとテスト |
| default export（App Router がファイル規約で要求する `page` / `layout` / `route` / `loading` / `error` / `not-found` / `template` / `default` を除く） | 本番コード |
| 再 export だけの `index.ts`（barrel） | 本番コード |
| `../../../` のように積み重ねた相対の読み込み（tsconfig のパスエイリアスを使う） | 本番コード |
| `"use client"` のモジュールが、ユースケース、infrastructure、サーバーを前提とする domain を読み込む | Client Component |
| `middleware.ts` が、DB のクライアント、ユースケース、domain を読み込む | `middleware.ts` |
| 仕様のテスト（`@covers` を持つテスト）が、入口の表（`common-testing`）が示すファイルとテストの足場以外の本番コードを読み込む | `tests.dirs` |
| `test.fail`、`page.waitForTimeout`、CSS selector・XPath・`nth()` によるロケーター | シナリオテスト |
