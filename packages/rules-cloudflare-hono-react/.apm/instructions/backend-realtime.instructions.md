---
description: "Durable Objects — WebSocket ハイバネーション、永続状態、配送、復旧"
applyTo: "apps/api/src/features/**/*.do.ts,apps/api/src/features/**/*.schema.ts,apps/api/src/features/**/*.routes.ts,apps/api/src/index.ts,**/wrangler.toml,**/wrangler.json,**/wrangler.jsonc,**/tests/integration/**"
---

# Durable Objects — リアルタイム

Durable Objects を選択した機能にだけ適用する。認可は[セキュリティ](backend-security.instructions.md)に従う。

## ライフサイクルとストレージ

- 名前空間バインディング、公開クラス、順序付きマイグレーションを宣言し、新規 SQLite ベースのクラスには `new_sqlite_classes` を使う。クラスのマイグレーション宣言は Object 内アプリケーションスキーマのマイグレーションを代替しない。
- Object クラスは機能の `*.do.ts`、SQLite スキーマとバージョン付き初期化は隣接する `*.schema.ts`。ストアは `ctx.storage.sql` を既定とし、D1 の Drizzle とマイグレーションコマンドはこのストアを管理しない。
- コンストラクターの再実行とハイバネーションを通常状態として扱う。正本はストレージに永続化し、メモリーの索引 / キャッシュは再構築する。
- ハイバネーション可能な WebSocket は `ctx.acceptWebSocket` で受け入れ、再開に必要な最小のメタデータを attachments に置く。attachments はソケットの寿命だけ持続する。通常の `socket.accept()` でハイバネーションを主張しない。
- `blockConcurrencyWhile` 内の初期化は短く、バージョン付きで、外部 I/O を伴わないものに限る。`await` をまたぐ分離は保証されない。
- ping / pong の制御フレームはプラットフォームが処理する。`setWebSocketAutoResponse` はアプリケーションレベルのハートビート用。

## 配送契約

- クライアント実装前に、イベント ID、ストリームごとの順序、カーソルの意味、冪等性キーを契約に定義する。
- 受理を応答する前に永続化し、永続化後に配信が失敗した場合の動作を定義する。再試行は重複排除し、送信キューと再接続バックオフに上限を設ける。
- カーソルからの再開と履歴 / ライブ配信の引き継ぎで欠落も重複も起こさない。カーソルが保持範囲外のときのスナップショットまたはリセット動作を定める。
- Object 間、Object と D1 間の更新は分散処理。正本と冪等な整合を選び、ストア間の原子性を主張しない。

Object の分割、保持、検索、配信数の上限は利用プロジェクトが選ぶ。ブラウザ側のキャッシュ整合は[フロントエンドのデータフロー](frontend-dataflow.instructions.md)。
