---
description: "Hono / React SPA — プロジェクトの lint で止める項目の一覧"
applyTo: "**/eslint.config.*,**/.eslintrc*,**/biome.json,**/biome.jsonc,**/tsconfig*.json,**/harness.config.json"
---

# Hono / React SPA — lint で止める項目

このスタックの規約のうち、lint（型検査を含む）で機械的に止められる決まりの一覧。ほかの規約はこれらを文章で繰り返さず、この一覧（`common-lint`）を指す。

- 止め方（使う道具、規則の名前、設定の書き方）は利用プロジェクトが決める。`harness.config.json` の `rules` に、その設定のファイルと、確かめる `commands` のキーを書く。
- まだ止めていない項目は、止めるまで `harness.config.json` の `conventions` に、項目の文と止めていない理由を書く。
- 対象から外すファイル（ランタイムが default export を要求する設定ファイルなど）は、lint の設定の側に書く。

| 止めること | 対象 |
| --- | --- |
| 契約の不一致を隠す `any`、非 null アサーション、検証していない型の断定（`as`。`as const` を除く）、型検査や lint を抑えるコメント | 本番コードとテスト |
| default export（ランタイムが要求するものを除く） | 本番コード |
| 機能の外から、機能の `index.ts` を通らずに機能の中のファイルを読み込む | `apps/web/src/` |
| 機能が別の機能を直接読み込む（ブラウザの機能どうし、API の機能の service どうし） | `apps/web/src/features/`、`apps/api/src/features/` |
| サーバーのモジュール、DB のスキーマ、接続設定、ランタイムのバインディングを読み込む（Hono の `AppType` を `import type` で読むことだけは許す） | `apps/web/src/`、`packages/shared/src/` |
| Hono、DB のクライアントとクエリビルダー、DB から生成した型、環境変数、ランタイムのバインディングを読み込む | `*.service.ts` |
| routes を読み込む | `*.repository.ts` |
| 本番の組み立てでだけ使うもの（ランタイム固有のモジュール、組み立てでだけ使うクラス、サーバーの起動）を読み込む | `*.routes.ts`、`*.service.ts` |
| `app.all()` と `app.mount()` の呼び出し（入口は method を明示して登録する） | `apps/api/src/` |
| `'use server'` の指定（Server Actions） | `apps/web/src/` |
| 仕様のテスト（`@covers` を持つテスト）が、テストの入口（`entry.test_entry`）、テストの足場、`packages/shared/src/` 以外の本番コードを読み込む | `tests.dirs` |
| `waitForTimeout`、`test.fail`、CSS・XPath・位置（`nth()`）によるロケーター | シナリオテスト（`e2e/`） |

lint で見分けられない決まり（`app.use` に渡したものが次へ渡さずに応答を返すか、ロケーターが偶然の画面文言から来ていないか）は、それぞれの規約に残し、レビューで見る。
