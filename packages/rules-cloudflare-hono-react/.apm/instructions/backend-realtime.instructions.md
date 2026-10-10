---
description: "Durable Objects — WebSocket ハイバネーション、永続状態、配送、復旧"
applyTo: "apps/api/src/features/**/*.do.ts,apps/api/src/features/**/*.schema.ts,apps/api/src/features/**/*.routes.ts,apps/api/src/index.ts,**/wrangler.toml,**/wrangler.json,**/wrangler.jsonc,**/tests/integration/**"
---

# Durable Objects — リアルタイム

Durable Objects を選択した場合にのみ適用する。[バックエンドの境界](backend-coding.instructions.md)と [WebSocket セキュリティ](backend-security.instructions.md)に従う。

## ライフサイクルとストレージ

- 名前空間バインディング、公開クラス、順序付きマイグレーションを宣言し、新規 SQLite ベースのクラスには `new_sqlite_classes` を使う。クラスのマイグレーション宣言は Object のアプリケーションスキーマのマイグレーションを代替しない。
- 各 Object クラスをその機能の `*.do.ts`、SQLite スキーマ / バージョン付きマイグレーション初期化を隣接する `*.schema.ts` に置く。これらは D1 の `db/schema/` と `apps/api/migrations/` から独立している。
- Object 内の SQLite は `ctx.storage.sql` を既定とする。D1 の Drizzle repositories とマイグレーションコマンドはこのストアを管理しない。別の ORM アダプターの採用には明示的な利用プロジェクトの判断が必要。
- コンストラクターの再実行とハイバネーションを通常の状態として扱う。正本の状態はストレージに永続化し、メモリーが残っていると想定せず、一時的な索引 / キャッシュを再構築する。
- ハイバネーション可能な WebSocket は `ctx.acceptWebSocket` でサーバーソケットを受け入れ、Object の WebSocket コールバックを処理し、再開に必要な最小限のメタデータを attachments に保存する。通常の `socket.accept()` を使いながらハイバネーション動作を主張しない。
- attachments / ストレージと現在の認可状態から接続メタデータを復元する。attachments はソケットが生きている間だけ持続し、永続記録はストレージに置く。期限切れ権限をソケットの寿命中固定しない。
- `blockConcurrencyWhile` 内で外部 I/O を伴わない、短くバージョン付きで再入に安全な SQLite 初期化を行う。任意の操作が `await` をまたいでも分離されると想定しない。対象の不変条件には対応するストレージトランザクション / 並行性制御を使う。
- ネイティブ WebSocket の ping / pong 制御フレームはプラットフォームが処理する。`setWebSocketAutoResponse` は定義済みのアプリケーションレベルの request / response ハートビート用であり、両者を混同しない。

## 配送契約

- クライアント実装前に、イベント ID、ストリームごとの順序、カーソルの意味、冪等性キーを契約に定義する。
- 受理イベントの永続的受理を応答する前に永続化する。永続化が成功して応答 / 配信が失敗した場合の動作を定義する。
- 再試行を重複排除し、送信キューに上限を設ける。上限付き指数バックオフとジッターで再接続する。バックオフだけでは欠落メッセージを復旧できない。
- カーソルからの再開と、一貫した履歴 / ライブ配信の引き継ぎを定義し、重複期間でイベントの欠落も重複も起こさない。カーソルが保持範囲外の場合のスナップショットまたはリセット動作を指定する。
- 切断、重複フレーム、遅延フレーム、プロセス再起動、一部への配信失敗を想定される状態として扱う。ストレージとハイバネーションに依存する動作をローカル統合テストで確認する。
- Object 間または Object と D1 間の更新は分散処理。正本と冪等な再試行 / 整合を選び、ストア間の原子性を主張しない。

Object の分割（一部屋が一 Object かを含む）、保持、検索、配信数の上限、ストレージの配置は利用プロジェクトが選ぶ。スタック全体の既定ではない。
ブラウザのキャッシュ / イベント整合は[フロントエンドのデータフロー](frontend-dataflow.instructions.md)の責任。
