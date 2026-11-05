---
description: "Node.js WebSocket — 永続状態、配送、再接続"
applyTo: "**/apps/api/src/features/**/*.socket.ts,**/apps/api/src/features/**/*.schema.ts,**/apps/api/src/features/**/*.routes.ts,**/apps/api/src/index.ts,**/apps/api/src/server.ts,**/deploy/**,**/tests/integration/**"
---

# Node.js — リアルタイム

WebSocket を使う機能だけに適用する。認可は[セキュリティ](backend-security.instructions.md)に従う。

- 採用した Hono / Node.js 対応 WebSocket アダプターを起動境界に組み込み、プロキシを含めて upgrade と切断を検証する。メッセージ処理は機能の `*.socket.ts` で依存を注入可能にする。
- 再起動と切断を通常状態として扱う。正本は VPS 内の DB 等に永続化し、メモリーの購読索引とキャッシュは再構築する。
- 単一プロセスのメモリーを複数プロセスで共有できると想定しない。水平化する場合は VPS 内の共有配信基盤と所有権を宣言し、プロセス間の順序と重複を検証する。
- イベント ID、ストリームごとの順序、カーソル、冪等性キーを契約に定義する。受理を応答する前に永続化し、配信失敗時の再試行を重複排除する。
- カーソルからの再開と履歴 / ライブ配信の引き継ぎで欠落を防ぐ。保持範囲外ではスナップショットまたはリセットの契約に従う。
- heartbeat、切断検出、再接続バックオフ、フレームサイズ、送信キューに上限を設ける。遅い受信者に無制限に蓄積せず、バックプレッシャーまたは切断を行う。
- DB 更新と配信は別の処理。永続イベント / outbox 等で再送可能にし、プロセス停止後も未配信を修復できるようにする。

ブラウザ側の整合は[データフロー](frontend-dataflow.instructions.md)。
