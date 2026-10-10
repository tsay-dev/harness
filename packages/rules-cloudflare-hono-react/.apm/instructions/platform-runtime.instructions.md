---
description: "Cloudflare Workers — ランタイム互換性、バインディング、秘密情報、環境設定"
applyTo: "**/wrangler.toml,**/wrangler.json,**/wrangler.jsonc,**/vite.config.*,**/worker-configuration.d.ts,apps/api/src/**,**/tests/integration/**,**/vitest.config.*"
---

# Cloudflare Workers — ランタイム

[共通コーディング](common-coding.instructions.md)に従う。このリーフは Worker ランタイムの前提を管理し、アプリケーション方針は管理しない。

## ランタイムとツールチェーン

- Vite / Workers の開発フローに Cloudflare Vite plugin を使う。実際の dev、build、preview、deploy、型生成コマンドを利用プロジェクトに記録する。
- 意図した `compatibility_date` を固定する。必要な API のためにのみ `nodejs_compat` を追加し、各依存を workerd で検証する。このフラグは通常の Node プロセス、永続的なローカルディスク、すべての Node API を提供しない。
- ブラウザビルドと Worker ビルドの両方を検査する。Node ベースの単体テスト成功は Workers 互換性を保証しない。
- 選択した設定・環境に対する利用プロジェクトの `wrangler types` コマンドで環境型を生成する。`apps/api/src/types/env.ts` で生成バインディングと Hono variables を組み合わせる。競合する手書きバインディング宣言を維持しない。
- 必要な各環境の D1、任意の Durable Object 名前空間、任意の R2、assets バインディングを宣言する。継承されない環境設定を明示的に確認する。preview と production が識別子を共有すると想定してはならない。

## バインディングと秘密情報

- Worker / Hono context を通じてバインディングを受け、リクエスト境界で基盤を組み立てる。リクエストごとの秘密情報をモジュールレベルの singleton から読んだり、リクエスト / ユーザー状態をリクエスト間に漏らしたりしてはならない。
- デプロイする機微な値には Cloudflare secrets、開発には無視対象のローカル設定を使う。値なしの名前と例をコミットし、資格情報を `vars` やソース管理に置いてはならない。
- すべての `VITE_*` 値は公開ブラウザビルド入力。署名キー、サービス資格情報、DB アクセス、管理トークンを置かない。
- バインディングを API レスポンス、ブラウザ props、ログ、例外報告へシリアライズしない。構造化ログからトークンと個人情報を除去する。

## 寿命とリソース上限

- リクエストの成否を決める書き込みは await する。`waitUntil` はレスポンス後の処理を延長するが、永続的なジョブキューではない。障害を越えて完了を保証する必要がある場合は適切な永続機構を使う。
- モジュールメモリーはキャッシュとしてのみ使う。body サイズ、ペイロード、並行数、上流タイムアウトの上限を定義し、対応する範囲で放棄された処理をキャンセルする。
- `limits.cpu_ms` は CPU 時間を制限し、経過時間や総課金を制限しない。リクエスト、ストレージ、ネットワーク、ほかのサービスにはそれぞれの運用制御が必要。
- プラン選択、予算、保持、リージョン、リソース識別子は利用プロジェクト設定 / ADR に置く。

アセット振り分けは[ルーティング](platform-routing.instructions.md)、永続化は [D1](backend-database.instructions.md) または [Durable Objects](backend-realtime.instructions.md) を読む。
