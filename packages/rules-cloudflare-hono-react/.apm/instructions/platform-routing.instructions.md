---
description: "Cloudflare Static Assets — Worker の振り分け、API エラー、SPA フォールバック"
applyTo: "**/wrangler.toml,**/wrangler.json,**/wrangler.jsonc,**/vite.config.*,apps/api/src/index.ts,apps/api/src/features/**/*.routes.ts,apps/web/public/_headers,apps/web/public/_redirects,**/tests/integration/**,**/e2e/**"
---

# Cloudflare — アセットと API のルーティング

[ランタイム](platform-runtime.instructions.md)に従う。このリーフはネットワークの振り分けを担当し、ブラウザのルート状態は[フロントエンドルーティング](frontend-routing.instructions.md)の責任。

- SPA と HTTP API を同じ公開オリジンから配信する。`/api/*` と宣言済みの WebSocket 名前空間（例: `/ws/*`）を予約する。異なる接頭辞はどちら側の実装前にも利用プロジェクトで宣言する。
- SPA ナビゲーション用の Static Assets `not_found_handling` と、すべての API / WebSocket リクエストが Worker に届く `run_worker_first` を設定する。固定した Wrangler バージョンが対応する選択パターンまたは Worker 優先処理を使う。`/api` や `/ws` の接頭辞ルートを明示的に扱う。
- assets より先に API と WebSocket 名前空間を振り分ける。未知の API は契約の HTTP エラー、通常は JSON 404 を返す。ステータス 200 の `index.html` にフォールスルーしてはならない。
- 失敗した WebSocket upgrade はエラーのままにする。SPA フォールバックへ送ったり、未認証の upgrade を返したりしない。
- ブラウザ routes の直接アクセスと更新は SPA 入口へ解決する。Vite のブラウザ開発サーバーだけでなく、ローカルプレビューでデプロイされたアセットルーティング動作をテストする。
- Worker レスポンスヘッダーで API レスポンスを保護する。静的アセットの `_headers` / `_redirects` 規約は Worker コードが生成するレスポンスを自動的に管理しない。
- 内容でアドレス付けした assets は不変としてキャッシュしてよいが、HTML シェルは更新可能に保つ。意図的に認可されたキャッシュ設計なしに非公開 API レスポンスを共有キャッシュに保存しない。
- 同一オリジン API に許容的な CORS を使わない。R2 直接アップロードなどのクロスオリジン機能は[ストレージ](backend-storage.instructions.md)にそれぞれの明示的な契約を持つ。

## 境界の検証

統合確認では、API の成功・失敗ステータス / content type、未知の API 404、upgrade の拒否、SPA の直接ナビゲーション、静的アセット配信を検証する。
プロトコル失敗はバックエンド / 統合テストに保つ。ブラウザスイートは[システムテスト](system-testing.instructions.md)に定義する UC の主シナリオに留める。
