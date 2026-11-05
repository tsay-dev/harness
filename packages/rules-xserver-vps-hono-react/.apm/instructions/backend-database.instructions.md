---
description: "VPS 内 DB / Drizzle — スキーマ、SQL マイグレーション、原子性"
applyTo: "**/drizzle.config.*,**/apps/api/migrations/**,**/apps/api/src/db/**,**/apps/api/src/features/**/*.repository.ts,**/deploy/**,**/tests/integration/**"
---

# VPS 内 DB / Drizzle — 永続化

DB エンジン、版、Drizzle ドライバーは利用プロジェクトが選び、VPS 内で管理する。方言、同時実行、ロックの性質を別エンジンと同一視しない。

- スキーマの正本は選択した方言の `apps/api/src/db/schema/*.ts`。接続は `db/client.ts`、クエリは各機能の `<feature>.repository.ts`。ドライバー、ビルダー、推論行型を service や公開契約へ露出しない。
- Drizzle Kit で `apps/api/migrations/` にバージョン付き SQL を生成し、レビューしてスキーマ変更と同じコミットに入れる。本番で `push` や適用済み SQL の書き換えをしない。新規 DB と直前スキーマの両方で検証する。
- 一意性と参照を含む不変条件は DB 制約で保証する。同時更新は条件付き SQL または明示した分離・ロックで守り、読み込み後の書き込みの競合を検証する。
- 複数操作の原子性には選択したドライバーのトランザクションを使い、同じ接続へ束ねる。失敗時のロールバック、デッドロック / busy の扱いと再試行の冪等性を確認する。
- 接続数とプール上限を VPS の容量に合わせる。SQLite を選ぶ場合はファイルの永続配置、書き込み競合、整合したバックアップ方法を宣言する。
- DB とファイル保存 / メッセージ配信は単一トランザクションではない。正本、冪等な伝播、再試行、修復を定義する。
- マイグレーションは多重実行を防ぎ、破壊的変更の復元と旧アプリの互換性を検証する。バックアップは取得成功だけでなく復元可能性を確認する。

実 DB の統合確認は[バックエンドテスト](backend-testing.instructions.md)、既定スイートでは repository 境界をフェイクにする。
