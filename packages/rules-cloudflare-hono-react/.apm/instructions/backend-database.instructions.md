---
description: "D1 / Drizzle — スキーマ、レビュー済み SQL マイグレーション、クエリ、原子性"
applyTo: "**/drizzle.config.*,**/apps/api/migrations/**,**/apps/api/src/db/**,**/apps/api/src/features/**/*.repository.ts,**/wrangler.toml,**/wrangler.json,**/wrangler.jsonc,**/tests/integration/**"
---

# D1 / Drizzle — 永続化

D1 のリレーショナル永続化に適用する。Durable Object の SQLite は[リアルタイム](backend-realtime.instructions.md)の別ストア。

- スキーマの正本は Drizzle の SQLite スキーマ定義（`apps/api/src/db/schema/*.ts`）。クライアント構築は `db/client.ts`、クエリは各機能の `<feature>.repository.ts`。D1 型、クエリビルダー、推論行型を service やブラウザの公開契約に露出しない。
- マイグレーションは Drizzle Kit で `apps/api/migrations/` にバージョン付き SQL を生成し、レビューしてスキーマ変更と同じコミットに入れる。本番では `push` や適用済みマイグレーションの書き換えをしない。新規 DB と直前のスキーマからの両方で適用を検証する。
- 一意性と参照を含む永続化不変条件は DB 制約で保証し、同時更新は条件付き SQL で表現する。
- D1 に対話型トランザクション API はない。複数文の原子性は固定した版が対応する `batch` で行い、ロールバックを検証する。読み込み後の別 batch は分離されないので、判断が読み込みに依存するなら条件付き書き込みにする。
- D1 の読み込みレプリケーションを使うなら、書き込み直後の読み込みに session / bookmark を使う。
- D1 と Durable Object は原子トランザクションを共有できない。ストア間更新は正本、冪等な伝播、再試行、修復を定義する。
- SQLite 方言の前提を明示する。Drizzle は PostgreSQL への移植可能性を保証しない。

ローカル D1 の統合確認は[バックエンドテスト](backend-testing.instructions.md)、既定スイートでは repository 境界をフェイクにする。
