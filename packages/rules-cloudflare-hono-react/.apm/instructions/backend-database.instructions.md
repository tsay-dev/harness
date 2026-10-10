---
description: "D1 / Drizzle — スキーマ、レビュー済み SQL マイグレーション、クエリ、原子性"
applyTo: "**/drizzle.config.*,apps/api/migrations/**,apps/api/src/db/**,apps/api/src/features/**/*.repository.ts,**/wrangler.toml,**/wrangler.json,**/wrangler.jsonc,**/tests/integration/**"
---

# D1 / Drizzle — 永続化

このリーフは D1 によるリレーショナル永続化に適用する。[バックエンドの境界](backend-coding.instructions.md)に従う。Durable Object SQLite は[リアルタイム](backend-realtime.instructions.md)に定義する別のストア。

## スキーマとマイグレーションの所有

- Drizzle の SQLite スキーマ定義をスキーマの正本とし、実行時のクエリには実際の D1 バインディング上の `drizzle-orm/d1` を使う。
- D1 スキーマを `apps/api/src/db/schema/*.ts`、クライアント構築を `db/client.ts`、クエリを各機能の `<feature>.repository.ts` に置く。services とブラウザモジュールは D1 型、Drizzle クエリビルダー、推論された行型を公開契約として露出してはならない。
- Drizzle Kit でバージョン付き SQL を `apps/api/migrations/` に生成し、レビューしてスキーマ変更とともにコミットする。生成器と Wrangler の D1 マイグレーション設定には同じ利用プロジェクト宣言のディレクトリを使う。
- 利用プロジェクトが宣言した D1 マイグレーションフローでファイルを適用し、local / preview / production とバインディングを明示的に選択する。通常の本番デプロイではスキーマの `push` や未レビューの場当たり的な変更を使わない。
- 新規 DB と直前のサポート対象スキーマからのマイグレーションをテストする。破壊的な手順、バックフィル、段階的展開の互換性を分け、本番適用前に復旧手順を記録する。
- 差異を隠すために適用済みマイグレーションを書き換えない。生成 SQL でも制約、既定値、索引、データ保全、D1 の対応状況のレビューが必要。

## クエリと整合性

- services に repository 境界を注入する。SQL をパラメーター化する。必要な生 SQL は明確な理由と結果サイズの上限を伴って repository 内に留める。
- フィルター、結合、並び順、選択性、クエリ計画から索引を選ぶ。無制限の読み込みと N+1 クエリを避け、安定したページネーション順序と同順位時の順序を定義する。
- 一意性と参照を含む永続化不変条件を DB 制約で保証する。同時更新を、対応する条件付き SQL または明示的な並行性戦略で表現する。
- D1 に一般的な対話型トランザクション API があると想定しない。複数文の原子的処理には、固定したバージョンが実際に対応する D1 / Drizzle の batch 動作を使い、失敗時のロールバックを検証する。
- 読み込み後の別の batch は、競合する書き込みから自動で分離されない。読み込みに判断が依存するなら、条件付き書き込み / 制約を使うか、直列化境界を再設計する。
- D1 の読み込みレプリケーションを有効にする場合、必要な整合性を宣言し、書き込み直後の読み込みが必要な箇所では対応する session / bookmark 機構を使う。
- D1 と Durable Object は原子トランザクションを共有できない。ストア間更新では、正本の記録、冪等な伝播、再試行、修復を定義する。
- Drizzle は SQLite スキーマやクエリを自動で PostgreSQL に移植可能にしない。方言の前提を明示する。DB 移行は別の設計・検証タスク。

ローカル D1 統合確認には[バックエンドテスト](backend-testing.instructions.md)を使う。単体テストでは repository 境界を代替する。
