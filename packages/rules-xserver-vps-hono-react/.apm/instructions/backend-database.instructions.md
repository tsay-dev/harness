---
description: "VPS 内 PostgreSQL / Drizzle — スキーマ、SQL マイグレーション、原子性"
applyTo: "**/drizzle.config.*,**/apps/api/migrations/**,**/apps/api/src/db/**,**/apps/api/src/features/**/*.repository.ts,**/deploy/**,**/tests/integration/**"
---

# VPS 内 PostgreSQL / Drizzle — 永続化

PostgreSQL を VPS 内で管理し、サポート中の版を固定する。接続は `pg` の `Pool` と `drizzle-orm/node-postgres`、スキーマ定義は `drizzle-orm/pg-core` を使う。

- スキーマの正本は PostgreSQL 方言の `apps/api/src/db/schema/*.ts`。接続は `db/client.ts`、クエリは各機能の `<feature>.repository.ts`。ドライバー、ビルダー、推論行型を service や公開契約へ露出しない。
- Drizzle Kit の `dialect: "postgresql"` で `apps/api/migrations/` にバージョン付き SQL を生成し、レビューしてスキーマ変更と同じコミットに入れる。本番で `push` や適用済み SQL の書き換えをしない。新規 DB と直前スキーマの両方で検証する。
- 一意性と参照を含む不変条件は DB 制約で保証する。同時更新は条件付き SQL または明示した分離・ロックで守り、読み込み後の書き込みの競合を検証する。
- 複数操作は Drizzle の `db.transaction` へ束ね、コールバックの `tx` を使って同じ接続で実行する。分離レベルを明示し、ロールバック、デッドロック / serialization failure とトランザクション全体の再試行の冪等性を検証する。
- `Pool` はプロセス単位で再利用し、全プロセスの接続上限合計を PostgreSQL の `max_connections` と VPS の容量に収める。接続待ちとクエリ / ロック待ちに期限を設け、終了時にプールを閉じる。
- DB とファイル保存 / メッセージ配信は単一トランザクションではない。正本、冪等な伝播、再試行、修復を定義する。
- マイグレーションは多重実行を防ぎ、破壊的変更の復元と旧アプリの互換性を検証する。バックアップは取得成功だけでなく復元可能性を確認する。

実 PostgreSQL の統合確認は[バックエンドテスト](backend-testing.instructions.md)、既定スイートでは repository 境界をフェイクにする。
