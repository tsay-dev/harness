---
description: "React SPA / TanStack Query — サーバーキャッシュ、HTTP 失敗、変更、リアルタイム整合"
applyTo: "apps/web/src/**,packages/shared/src/**"
---

# React SPA — データフロー

TanStack Query はキャッシュしたサーバー状態を所有するが、永続データの正本ではない。

## HTTP とキャッシュ

- 型付き Hono `hc<AppType>` クライアントは `apps/web/src/lib/api-client.ts`、Query クライアントは `lib/query-client.ts`。HTTP 呼び出し、query options、Query / mutation hooks は `features/<feature>/api/`、socket などのライフサイクル hooks は機能の `hooks/`。公開は `index.ts` だけ。
- `fetch` / Hono RPC は非 2xx を拒否しない。query / mutation 関数はステータスを確認し、宣言済みエラーを解釈して throw する。
- query key には結果に影響する入力と主体 / テナント範囲を含める。ログアウトや主体の切り替えでは機微なキャッシュを削除し、進行中の処理をキャンセルする。
- query options を routes と components で再利用し、`useEffect` + `useState` の第二キャッシュやサーバー一覧のローカル複製を作らない。
- 鮮度、再試行、キャンセル、focus / reconnect を意図的に設定する。権限の失敗と非冪等な mutation を無条件に再試行しない。mutation 後は影響するキーを無効化するか正本のレスポンスで更新し、楽観更新にはロールバックと整合規則を持つ。

## UI 状態

- 一時的な UI 状態は所有者の近くに置く。データは下向き、イベントはコールバックで上向き。
- 編集可能な下書きは初期サーバーデータをコピーしてよいが、リセットの時点と、受信更新 / バージョン競合が未保存入力へ与える影響を定義する。
- 共有可能な状態は router の検証済み URL パラメーターに置く。秘密情報やセッション資格情報を永続化するクライアント状態に保存しない。
- 読み込み、エラー、空、古い状態を明示し、重複送信を UI で処理する（サーバー冪等性に依存しない）。

## 任意のリアルタイム

- 認可済みイベントは同じ Query キャッシュに投入し、独立した正本一覧を作らない。契約のイベント ID、順序、カーソルで整合し、重複と旧版を拒否する。
- 再接続や欠落検出時は契約に従って再開 / 欠落範囲の fetch / リセットを行い、安全な増分マージができなければ無効化する。範囲変更時はソケットと購読を破棄し、再接続時に再認証する。
