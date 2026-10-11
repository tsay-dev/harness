---
description: "Cloudflare Static Assets — Worker の振り分け、API エラー、SPA フォールバック"
applyTo: "**/wrangler.toml,**/wrangler.json,**/wrangler.jsonc,**/vite.config.*,**/apps/api/src/index.ts,**/apps/api/src/features/**/*.routes.ts,**/apps/web/public/_headers,**/apps/web/public/_redirects,**/tests/integration/**,**/e2e/**"
---

# Cloudflare — アセットと API のルーティング

- SPA と HTTP API を同じ公開オリジンから配信する。`/api/*` と宣言済みの WebSocket 名前空間（例: `/ws/*`）を予約し、異なる接頭辞は実装前に利用プロジェクトで宣言する。
- Static Assets の `not_found_handling` を SPA ナビゲーション用に設定し、API / WebSocket リクエストが Worker に届くよう `run_worker_first` を固定した Wrangler 版が対応する形で設定する。
- assets より先に API と WebSocket を振り分ける。未知の API は契約の HTTP エラー（通常 JSON 404）を返し、ステータス 200 の `index.html` にフォールスルーしない。失敗した WebSocket upgrade はエラーのままにする。
- ブラウザ routes の直接アクセスと更新は SPA 入口へ解決する。Vite の開発サーバーではなくローカルプレビューでアセットルーティングを検証する。
- 静的アセットの `_headers` / `_redirects` は Worker が生成するレスポンスを管理しない。API のヘッダーは Worker で付ける。内容でアドレス付けした assets は不変キャッシュ、HTML シェルは更新可能に保ち、非公開 API レスポンスを共有キャッシュに置かない。
- 同一オリジン API に許容的な CORS を使わない。クロスオリジン機能（R2 直接アップロード）は[ストレージ](backend-storage.instructions.md)の契約に従う。

統合確認で API のステータス / content type、未知 API の 404、upgrade の拒否、SPA の直接ナビゲーション、アセット配信を検証する。これらはブラウザスイートに入れない。
