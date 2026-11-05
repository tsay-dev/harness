---
description: "Xserver VPS — リバースプロキシ、API と SPA の振り分け"
applyTo: "**/deploy/**,**/vite.config.*,**/apps/api/src/index.ts,**/apps/api/src/server.ts,**/apps/api/src/features/**/*.routes.ts,**/tests/integration/**,**/e2e/**"
---

# Xserver VPS — アセットと API のルーティング

- SPA と API を同じ公開オリジンから配信する。`/api/*` と宣言済み WebSocket 名前空間（例: `/ws/*`）を予約し、異なる接頭辞は利用プロジェクトで宣言する。
- Nginx / Caddy 等の採用したリバースプロキシが TLS を終端し、API と WebSocket を静的アセットより先に Node.js へ渡す。プロキシと Hono の間で接頭辞を重複・欠落させない。
- 未知の API は契約の HTTP エラー（通常 JSON 404）を返し、`index.html` の 200 に置き換えない。失敗した WebSocket upgrade もエラーのままにする。
- SPA の既知のブラウザ routes は直接アクセスと更新でも入口に解決する。存在しない静的ファイルを HTML 成功にしない。
- WebSocket の upgrade ヘッダー、接続タイムアウト、ストリーミングのバッファリングを採用したプロキシで設定・検証する。
- 転送ヘッダーは信頼するプロキシからのものだけを採用し、プロキシがクライアント提供値を除去・上書きする。API ポートへの直接到達を許して転送ヘッダーを信頼しない。
- 内容でアドレス付けした assets は不変キャッシュ、HTML は更新可能に保つ。非公開 API を共有キャッシュに置かず、同一オリジン API に許容的な CORS を設定しない。

本番相当のプロキシとビルド成果物で、API のステータス / content type、未知 API、upgrade 拒否、SPA 直接アクセス、アセット配信を統合検証する。Vite dev server だけで代替しない。
