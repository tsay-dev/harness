---
description: "Cloudflare / Hono / React — スタックの適用範囲、ソースの境界、共通コーディング規約"
applyTo: "**/apps/web/src/**,**/apps/api/src/**,**/packages/shared/src/**,**/tsconfig*.json,**/vite.config.*,**/wrangler.toml,**/wrangler.json,**/wrangler.jsonc,**/drizzle.config.*,**/worker-configuration.d.ts"
---

# Cloudflare / Hono / React — 共通コーディング

利用プロジェクトが宣言した Cloudflare Workers + Hono + React SPA スタックにだけ適用する。`rules-next` は継承しない。モノレポの無関係な単位には適用しない。

## スタックの既定

- Workers + Static Assets で Vite React SPA と Hono API を同一オリジンから配信する。ブラウザルートは TanStack Router、サーバー状態は TanStack Query、型付き HTTP 呼び出しは Hono RPC、HTTP 入力境界は Zod + `@hono/zod-validator`、リレーショナル永続化は D1 + `drizzle-orm/d1`。Durable Objects と R2 は使う機能だけの任意。
- RSC、Server Actions、常駐 Node.js サーバーを前提にしない。
- 選択した単位、実際のパス、バインディング、逸脱は利用プロジェクトの `AGENTS.md` / `CLAUDE.md` に地図として宣言する（R-1010）。コマンドは `traceconfig.json` の `commands`、バージョンはマニフェストとロックファイルが持つ。

## 配置（機能単位）

同じ機能名（`chat`、`auth`、`rooms` など）をブラウザ、API、共有契約で使う。別の配置を使う利用プロジェクトは、委譲前に役割と配置の対応を宣言し、`applyTo` またはパス配送でリーフを届ける。

| 配置 | 読むリーフ |
| --- | --- |
| `wrangler.*`、`vite.config.*`、`apps/api/src/index.ts`、生成される環境型 | [ランタイム](platform-runtime.instructions.md)、[アセットルーティング](platform-routing.instructions.md) |
| `apps/api/src/features/<feature>/<feature>.{routes,service,repository}.ts`、`middleware/**`、`types/env.ts` | [バックエンドの境界](backend-coding.instructions.md)、認証境界では[セキュリティ](backend-security.instructions.md) |
| `apps/api/src/db/{schema/*.ts,client.ts}`、`drizzle.config.*`、`apps/api/migrations/*.sql` | [D1 / Drizzle](backend-database.instructions.md) |
| `apps/api/src/features/<feature>/*.do.ts`、`*.schema.ts` | [リアルタイム](backend-realtime.instructions.md) |
| R2 を使う repository とアップロードルート | [R2](backend-storage.instructions.md) |
| `apps/web/src/routes/**`、`features/<feature>/{api,components,hooks,lib,index.ts}` | [ブラウザルーティング](frontend-routing.instructions.md)、[データフロー](frontend-dataflow.instructions.md) |
| `packages/shared/src/<feature>/schemas.ts` | [バックエンドの境界](backend-coding.instructions.md) |
| テストとランナー設定 | [テストの接続](common-testing.instructions.md)、[バックエンド](backend-testing.instructions.md)、[システム](system-testing.instructions.md) |

## 規約

- ブラウザと Worker のコンパイラー環境を分け、両方で厳格な型検査を有効にする。
- 契約の不一致を隠す `any`、非 null アサーション、未検証キャスト、抑制コメントは禁止。信頼境界では `unknown` を絞り込み、矛盾は報告する。
- 名前付き export を使う。ランタイムが要求する default export（Hono Worker の app、設定ファイル）だけが例外。
- React 機能の `index.ts` は意図的な公開 API。外部はそこから import し、機能内部は直接相互に import する。ほかの場所に再 export の連鎖を作らない。
- `packages/shared/src/<feature>/schemas.ts` にはブラウザで安全な HTTP / WebSocket の Zod スキーマと推論型だけを置く。DB スキーマ、行、サービス実装、バインディングは置かない。
- ブラウザコードはサーバーのランタイムモジュール、バインディング、DB スキーマ、秘密情報を import しない。Hono の `AppType` の `import type` だけが例外で、バンドルから消えること。
- 書式と import 順序は利用プロジェクトのフォーマッター / lint に従う。生成されたルートツリーとバインディング宣言は手編集せず再生成する。コメントとユーザー向け文言は `traceconfig.json` の `policy.language`（未宣言なら日本語）。
