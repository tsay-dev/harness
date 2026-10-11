---
description: "🔀 Expo / frontend — 状態とデータフロー"
applyTo: "**/*.tsx,**/*.ts,**/app.json,**/app.config.*,**/eas.json"
---

# Expo / frontend — 状態とデータフロー

状態の保持場所と流れ方だけを定める。粒度は[コンポーネント](frontend-components.instructions.md)、遷移は[ルーティング](frontend-routing.instructions.md)。Expo でなければ適用外として破棄する。

- server state（サーバーが正本を持ち、アプリはコピーを見る値）は cache を持つ query 層に置く。既定は TanStack Query。別のものを選ぶプロジェクトは `CLAUDE.md` に宣言する。「cache 層を置かない」は選択肢にしない。
- client state（modal の開閉、入力途中、選択、現在の tab）は `useState`、共有が必要なら購読単位を選べる軽量 store。どちらか判断できない値は先に正本の所有者を決める。
- `useEffect` 内で fetch して `setState` しない。`useEffect` に許す用途は外部システムとの同期（購読の開始・停止、native event の受信）だけ。
- query 結果を `useState` にコピーしない。導出は render 時か query 層の `select`。例外は編集中の form で、初期値を取り直す時点を明示する。
- stack に push された前の画面は unmount されず生き残る。再取得は focus 復帰または `AppState` 再開で起動し、timer / 購読 / 位置 watcher は必ず解放する。
- Context は依存注入用。起動後ほぼ変わらないもの（theme、client instance、認証済みユーザーの識別子）だけを入れ、変化する共有 state は store に置く。
- animation を JS 側 state で frame ごとに駆動せず、UI thread で動く手段（Reanimated、`useNativeDriver`）を使う。
- token、認証情報、個人情報を `AsyncStorage` に置かず、`expo-secure-store` を使う。永続化した値は server state の cache であり、アプリの正本ではない。
- 永続化規約がこの文書に収まらなくなったら `persistence` として切り出し、`db` と命名しない（その名前は DB 設計者にしか配送されない）。
