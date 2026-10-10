---
description: "React SPA / TanStack Query — サーバーキャッシュ、HTTP 失敗、変更、リアルタイム整合"
applyTo: "apps/web/src/**,packages/shared/src/**"
---

# React SPA — データフロー

[共通コーディング](common-coding.instructions.md)と[ブラウザルーティング](frontend-routing.instructions.md)に従う。TanStack Query はキャッシュしたサーバー状態を所有するが、永続データの正本ではない。

## HTTP とキャッシュの所有

- 共有の型付き Hono `hc<AppType>` クライアントを `apps/web/src/lib/api-client.ts`、Query クライアントを `lib/query-client.ts` に置く。HTTP 呼び出し、query options、`useMessages` / `useSendMessage` などの Query / mutation hooks は `features/<feature>/api/` に置く。`useChatSocket` などの socket / ライフサイクル hooks は機能の `hooks/` を使う。`index.ts` では必要な公開インターフェースだけを露出する。[バックエンドコーディング](backend-coding.instructions.md)が説明するクライアントを使う。同一オリジン API 呼び出しはアプリケーションのオリジンに維持し、[セキュリティ](backend-security.instructions.md)に従って cookie と CSRF 情報を与える。
- `fetch` / Hono RPC はすべての非 2xx レスポンスを拒否するわけではない。query と mutation の関数はステータスを確認し、宣言済みエラーを解釈して、失敗した操作には適切なエラーを throw しなければならない。それにより Query がエラー状態に入れる。
- 結果に影響するすべての入力と関連する主体 / テナント範囲を含む安定した query keys を定義する。ログアウトや主体の切り替え時に機微なキャッシュを無効化 / 削除し、進行中の処理をキャンセルする。古いレスポンスが別セッションのデータを再投入してはならない。
- routes と components で query options を再利用する。第二のサーバーキャッシュとして `useEffect` + `useState` に fetch したり、サーバーの一覧をローカル state に複製したりしない。
- 鮮度、再試行、キャンセル、focus / reconnect 動作を意図的に設定する。権限の失敗や非冪等な mutation を無条件に再試行しない。
- mutation 後は影響するキーを無効化するか、正本のレスポンスから更新する。楽観更新にはロールバック、同時 mutation の扱い、宣言した整合規則が必要。

## UI 状態とイベント

- 一時的な UI 状態は所有者の近くに置き、複数の子が必要とする場合にのみ引き上げる。データは下向き、イベントはコールバックを通じて上向きに渡す。
- 編集可能な下書きは初期サーバーデータをコピーしてよいが、リセットするタイミングと、受信更新 / バージョン競合が未保存入力にどう影響するかを定義しなければならない。
- 共有可能な状態は router の検証済み URL パラメーターに置く。秘密情報やセッション資格情報を永続化するクライアント状態に保存しない。
- 読み込み、エラー、空、古い状態を明示的に表示する。重複送信を無効化または別の方法で処理し、サーバー冪等性を UI 動作に依存させない。

## 任意のリアルタイム

- 認可済みリアルタイムイベントを同じ Query キャッシュに投入し、独立した正本メッセージ一覧を作らない。
- 契約のイベント ID、順序、カーソルで整合する。履歴 fetch の前 / 中 / 後に届くライブイベントを考慮し、重複や旧版の更新を拒否する。
- 再接続や欠落検出時は、契約に従って再開 / 欠落範囲の fetch / スナップショットからのリセットを行う。安全な増分マージが不可能なら無効化する。
- 範囲変更時にソケットと購読を破棄し、再接続時に再認証し、古いユーザー / リソースのイベントを分離する。ブラウザのバックオフは[リアルタイム](backend-realtime.instructions.md)のサーバー側復旧の意味を代替できない。
