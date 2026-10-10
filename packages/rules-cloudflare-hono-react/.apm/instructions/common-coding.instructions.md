---
description: "Cloudflare / Hono / React — スタックの適用範囲、ソースの境界、共通コーディング規約"
applyTo: "apps/web/src/**,apps/api/src/**,packages/shared/src/**,**/tsconfig*.json,**/vite.config.*,**/wrangler.toml,**/wrangler.json,**/wrangler.jsonc,**/drizzle.config.*,**/worker-configuration.d.ts"
---

# Cloudflare / Hono / React — 共通コーディング

このパッケージは、利用プロジェクトが宣言した Cloudflare Workers + Hono + React SPA スタックにのみ適用する。
通常は `develop-core` とともに独立して選択する。`rules-next` は継承しない。
規約は選択したアプリケーションを拘束し、モノレポの無関係な単位には適用しない。その範囲外のリーフは除外する。

## スタックと利用プロジェクト固有の情報

- Workers + Static Assets で Vite React SPA と Hono API を同一オリジンから配信する。
- ブラウザルートには TanStack Router、サーバー状態には TanStack Query、型付き HTTP 呼び出しには Hono RPC を使う。
- HTTP 入力境界では Zod と `@hono/zod-validator` を使い、リレーショナル永続化には D1 と `drizzle-orm/d1` を使う。
- Durable Objects と R2 は任意の機能であり、すべてのアプリケーションの前提条件ではない。
- 利用プロジェクトの `AGENTS.md` / `CLAUDE.md` に、選択した単位、実際のパス、バインディング、コマンド、逸脱を宣言する。バージョンはそのマニフェストとロックファイルに置く。
- RSC、Server Actions、常駐 Node.js サーバーを前提にしない。スタック変更には利用プロジェクトの設計判断が必要であり、偶然追加された依存関係で変更しない。

## ソースの配置と配送

以下の機能単位の配置を既定とする。同じ機能名をブラウザ、API、共有契約で使う（例: `chat`、`auth`、`rooms`、`profile`）。`users` と `profile` はドメイン概念が異なる場合にのみ分離する。
利用プロジェクトは別の配置を使ってもよいが、委譲前に役割と配置の対応を宣言しなければならない。
一致しない配置には、適切なインストール済みリーフを指す利用プロジェクト範囲の中立な `applyTo` メタデータ、またはタスク実行時の明示的なリーフパス配送が必要。Markdown リンクだけでは規約を配送できない。
インストール済みのプロバイダー出力を修正したり、常駐する規約索引を作ったりしない。単に `routes/` ディレクトリがあるだけで層を推測しない。

| 作成担当者の配置 | そこで作業するときに読むもの |
| --- | --- |
| `wrangler.*`, `vite.config.*`, `apps/api/src/index.ts`, 生成される環境型 | [ランタイム](platform-runtime.instructions.md)、[アセットルーティング](platform-routing.instructions.md) |
| `apps/api/src/features/<feature>/<feature>.{routes,service,repository}.ts`, `middleware/**`, `types/env.ts` | [バックエンドの境界](backend-coding.instructions.md)。認証境界では[セキュリティ](backend-security.instructions.md) |
| `apps/api/src/db/{schema/*.ts,client.ts}`, 機能の repository、`drizzle.config.*`, `apps/api/migrations/*.sql` | DB 変更時の [D1 / Drizzle](backend-database.instructions.md) |
| `apps/api/src/features/<feature>/*.do.ts` と `*.schema.ts` | Object クラスとそのローカル SQLite マイグレーションの[リアルタイム](backend-realtime.instructions.md) |
| R2 を使う機能の repository とアップロードルート | オブジェクトストレージ使用時の [R2](backend-storage.instructions.md) |
| `apps/web/src/routes/**`, `features/<feature>/{api,components,hooks,lib,index.ts}`, 共有 UI / クライアントライブラリ | [ブラウザルーティング](frontend-routing.instructions.md)、[データフロー](frontend-dataflow.instructions.md) |
| `packages/shared/src/<feature>/schemas.ts` | HTTP / WebSocket の共有 Zod 契約についての[バックエンドの境界](backend-coding.instructions.md) |
| テストとランナー設定 | [テストの接続](common-testing.instructions.md)、続いて[バックエンド](backend-testing.instructions.md)または[システム](system-testing.instructions.md) |

## 共通コーディング規約

- 両ランタイムで TypeScript の厳格な型検査を有効にする。ブラウザと Worker のコンパイラー環境を分け、ブラウザコードがサーバーのグローバルを気づかず使うことを防ぐ。
- 契約の不一致を隠すために `any`、非 null アサーション、未検証キャスト、抑制コメントを使ってはならない。信頼境界で `unknown` を絞り込む。実装に合わせて契約を書き換えず、矛盾を報告する。
- 名前付き export を優先する。Hono Worker の default app や設定の default など、ランタイムが要求する export は例外。深い相対 import の連鎖を避ける。
- React 機能の `index.ts` は意図的な公開 API とする。外部の利用者はそれを使い、機能内部は直接相互に import する。これは明示的なバレルの例外であり、ほかの場所に任意の再 export の連鎖を追加しない。
- `packages/shared/src/<feature>/schemas.ts` にブラウザで安全な HTTP / WebSocket の Zod スキーマと推論された公開型を置く。ルートの `index.ts` は選択した公開契約だけを明示的に公開する。内部モジュールはそのルートを通じて import して循環を作ってはならない。
- ブラウザコードはサーバーのランタイムモジュール、バインディング、DB スキーマ、秘密情報を import してはならない。Zod 契約の共有は永続化やサービス実装の共有を正当化しない。
- Hono のアプリケーション型の型のみの import は、限定的なサーバーソース参照の例外。ブラウザバンドルから消えなければならない。[バックエンドの境界](backend-coding.instructions.md)を参照。
- 書式と import 順序は利用プロジェクトのフォーマッター / lint コマンドに従う。コメントとユーザー向け文言は日本語で書き、識別子は利用プロジェクトの語彙に従う。
- 生成されたルートツリーやバインディング宣言を手編集しない。利用プロジェクトのコマンドで再生成する。
