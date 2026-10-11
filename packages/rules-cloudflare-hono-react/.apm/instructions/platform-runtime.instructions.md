---
description: "Cloudflare Workers — ランタイム互換性、バインディング、秘密情報、環境設定"
applyTo: "**/wrangler.toml,**/wrangler.json,**/wrangler.jsonc,**/vite.config.*,**/worker-configuration.d.ts,**/apps/api/src/**,**/tests/integration/**,**/vitest.config.*"
---

# Cloudflare Workers — ランタイム

- Vite / Workers の開発フローに Cloudflare Vite plugin を使い、dev、build、preview、deploy、型生成の実コマンドを利用プロジェクトに記録する。
- `compatibility_date` を固定する。`nodejs_compat` は必要な API のためにだけ追加し、各依存を workerd で検証する。Node ベースの単体テスト成功は Workers 互換性を保証しない。
- 環境型は利用プロジェクトの `wrangler types` コマンドで生成し、`apps/api/src/types/env.ts` で生成バインディングと Hono variables を組み合わせる。手書きのバインディング宣言を併存させない。
- 環境ごとに D1、任意の Durable Object 名前空間、任意の R2、assets バインディングを宣言する。環境設定は継承されないので明示的に確認し、preview と production が識別子を共有すると想定しない。
- バインディングは Worker / Hono context を通じて受け、リクエスト境界で基盤を組み立てる。リクエストごとの秘密情報やユーザー状態をモジュールレベルの singleton に置かない。
- 機微な値は Cloudflare secrets、開発は無視対象のローカル設定。`vars` やソース管理に資格情報を置かない。`VITE_*` はすべて公開ビルド入力。バインディングをレスポンス、props、ログ、例外報告へシリアライズしない。
- 成否を決める書き込みは await する。`waitUntil` はレスポンス後の処理の延長であり永続ジョブキューではない。`limits.cpu_ms` は CPU 時間だけを制限する。body サイズ、並行数、上流タイムアウトの上限を定義する。
- プラン、予算、保持、リージョン、リソース識別子は利用プロジェクトの設定 / ADR に置く。
