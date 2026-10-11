---
description: "Hono / Workers — セッション、CSRF、認可、WebSocket のセキュリティ境界"
applyTo: "**/apps/api/src/**,**/apps/web/src/lib/api-client.ts,**/apps/web/src/features/auth/**,**/tests/backend/**,**/tests/integration/**"
---

# Hono / Workers — セキュリティ

同一オリジンのデプロイはセキュリティ検査を代替しない。

- セッションはサーバー管理で cookie に運ぶ（`HttpOnly`、`Secure`、意図した `SameSite`、狭い path / domain）。ブラウザのローカルストレージや URL に置かない。
- cookie 認証の安全でないリクエストでは `Origin` を設定済み公開オリジンに照合し、必要なら利用プロジェクトの CSRF 方針を実装する。CORS や `SameSite` だけを CSRF 対策にしない。
- 入口で認証し、ユースケースでリソース / テナント / 操作を認可する。入力の owner / tenant フィールドを主体の識別情報として信頼しない。
- 高コストの解析や書き込みの前にペイロード上限とレート制限を適用する。資格情報をログに残さない。
- WebSocket は upgrade を認証し、`Origin` を照合し、Durable Object へ転送する前に対象を認可する。クライアント指定の actor ヘッダーを識別情報として受け入れない。メッセージごとに操作レベルの認可を再確認し、長寿命接続中の期限 / 失効 / 所属変更の再検証遅延と切断動作を宣言する。
- 長寿命の資格情報をクエリ文字列に置かない。フレームごとにスキーマ、サイズ、操作を検証し、頻度と送信キューに上限を設ける。非公開の Object ID や stub は呼び出し元を認証しない。
