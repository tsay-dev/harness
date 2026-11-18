---
description: "Righthub / Hono / React — スタックの適用範囲、ソースの境界、共通コーディング規約"
applyTo: "**/apps/web/src/**,**/apps/api/src/**,**/packages/shared/src/**,**/tsconfig*.json,**/vite.config.*,**/deploy/**,**/prisma.config.*,**/prisma/**,**/Dockerfile*,**/compose*.yml,**/compose*.yaml"
---

# Righthub / Hono / React — 共通コーディング

Righthub は、利用プロジェクトが宣言した Xserver VPS 内で動く Node.js + Hono + React SPA + PostgreSQL スタックにだけ適用する。モノレポの無関係な単位には適用しない。

## スタックの既定

- VPS 内のリバースプロキシと Node.js で Vite React SPA と Hono API を同一オリジンから配信する。ブラウザルートは TanStack Router、サーバー状態は TanStack Query、型付き HTTP 呼び出しは Hono RPC、HTTP 入力境界は Zod + `@hono/zod-validator`、リレーショナル永続化は VPS 内の PostgreSQL + Prisma。接続とスキーマの規約は[永続化](backend-database.instructions.md)に従う。WebSocket とファイル保存は必要な機能だけに導入する。
- API、DB、非公開ファイルの実行・保存先は Xserver VPS 内に置く。RSC と Server Actions は導入しない。
- 選択した単位、実際のパス、接続設定、逸脱は利用プロジェクトの `AGENTS.md` / `CLAUDE.md` に地図として宣言する（R-1010）。コマンドは `harness.config.json` の `commands`、バージョンはマニフェストとロックファイルが持つ。

## 配置（機能単位）

同じ機能名（`chat`、`auth`、`rooms` など）をブラウザ、API、共有契約で使う。別の配置を使う利用プロジェクトは、委譲前に役割と配置の対応を宣言し、`applyTo` またはパス配送でリーフを届ける。

| 配置 | 読むリーフ |
| --- | --- |
| `deploy/**`、`vite.config.*`、`apps/api/src/{index,server}.ts` | [ランタイム](platform-runtime.instructions.md)、[アセットルーティング](platform-routing.instructions.md) |
| `apps/api/src/features/<feature>/<feature>.{routes,service,repository}.ts`、`middleware/**`、`types/env.ts` | [バックエンドの境界](backend-coding.instructions.md)、認証境界では[セキュリティ](backend-security.instructions.md) |
| `prisma/schema.prisma`、`prisma/migrations/**`、`prisma.config.*`、`apps/api/src/db/client.ts` | [PostgreSQL / Prisma](backend-database.instructions.md) |
| `apps/api/src/features/<feature>/*.socket.ts`、`*.schema.ts` | [リアルタイム](backend-realtime.instructions.md) |
| ファイル保存を使う repository とアップロードルート | [ファイル保存](backend-storage.instructions.md) |
| `apps/web/src/routes/**`、`features/<feature>/{api,components,hooks,lib,index.ts}` | 依存の `rules-hono-react-spa` のブラウザルーティング（`frontend-routing`）、データフロー（`frontend-dataflow`） |
| `packages/shared/src/<feature>/schemas.ts` | [バックエンドの境界](backend-coding.instructions.md) |
| テストとランナー設定 | [テストの接続](common-testing.instructions.md)、[バックエンド](backend-testing.instructions.md)、[システム](system-testing.instructions.md) |

## 規約

lint で止める決まり（型の抜け道、default export、機能・層をまたぐ読み込みなど）は、依存の `rules-hono-react-spa` の一覧（`common-lint`）にあり、ここでは繰り返さない。

- ブラウザと Node.js のコンパイラー環境を分け、両方で厳格な型検査を有効にする。
- 信頼境界では `unknown` を絞り込み、契約との矛盾は型で隠さずに報告する。
- React 機能の `index.ts` は意図的な公開 API。外部はそこから import し、機能内部は直接相互に import する。ほかの場所に再 export の連鎖を作らない。
- `packages/shared/src/<feature>/schemas.ts` にはブラウザで安全な HTTP / WebSocket の Zod スキーマと推論型だけを置く。DB スキーマ、行、サービス実装、接続設定は置かない。
- Hono の `AppType` は `import type` で読み、ブラウザのバンドルから消えること。
- 書式と import 順序は利用プロジェクトのフォーマッター / lint に従う。生成されたルートツリーは手編集せず再生成する。コメントとユーザー向け文言は `harness.config.json` の `policy.language`（未宣言なら日本語）。
