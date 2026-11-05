---
description: "Righthub / PostgreSQL / Prisma — スキーマ、マイグレーション、原子性"
applyTo: "**/prisma/**,**/prisma.config.*,**/apps/api/src/db/**,**/apps/api/src/features/**/*.repository.ts,**/deploy/**,**/tests/integration/**"
---

# Righthub / PostgreSQL / Prisma — 永続化

PostgreSQL を VPS 内で管理し、サポート中の版を固定する。Prisma CLI、Client、採用する PostgreSQL アダプターは相互に対応する版を固定し、その版の接続・生成設定を使う。

- スキーマの正本は `prisma/schema.prisma`（datasource の `provider = "postgresql"`）。Client の構築は `apps/api/src/db/client.ts`、クエリは各機能の `<feature>.repository.ts`。Prisma Client と生成モデル型を service や公開契約へ露出しない。
- 開発では `prisma migrate dev --create-only` で `prisma/migrations/` に SQL を生成し、レビューしてスキーマと同じコミットに入れる。開発用 DB への適用は `prisma migrate dev`、本番適用は `prisma migrate deploy`。本番で `db push`、`migrate dev`、適用済み SQL の書き換えをしない。
- Client はスキーマ変更後とビルド時に `prisma generate` で明示的に生成する。生成先と接続設定は固定した Prisma 版に合わせ、生成物を手編集せず、接続情報をソースやブラウザへ含めない。
- 一意性と参照を含む不変条件は DB 制約で保証する。Prisma で表せない制約はレビュー済み SQL マイグレーションを正本とし、実 DB で検証する。生 SQL はパラメーター化し、入力を文字列連結しない。
- 複数操作は `$transaction` へ束ね、対話型ではコールバックの `tx` を使う。外部通信をトランザクションに含めず、分離レベル・期限、ロールバック、デッドロック / serialization failure と全体再試行の冪等性を検証する。
- Prisma Client はプロセス単位で再利用し、リクエストごとに生成・切断しない。採用したアダプター / エンジンの設定でプール上限と待機期限を定め、全プロセスの合計を PostgreSQL の接続上限に収める。終了時に Client と所有するプールを閉じる。
- DB とファイル保存 / メッセージ配信は単一トランザクションではない。正本、冪等な伝播、再試行、修復を定義する。
- マイグレーションは多重実行を防ぎ、新規 DB と直前スキーマの両方から適用を検証する。破壊的変更の復元と旧アプリの互換性を検証し、バックアップの復元可能性を確認する。

実 PostgreSQL の統合確認は[バックエンドテスト](backend-testing.instructions.md)、既定スイートでは repository 境界をフェイクにする。
