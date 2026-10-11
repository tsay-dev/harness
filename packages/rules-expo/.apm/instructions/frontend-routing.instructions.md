---
description: "🧭 Expo / frontend — ルーティング（expo-router）"
applyTo: "**/*.tsx,**/*.ts,**/app.json,**/app.config.*,**/eas.json"
---

# Expo / frontend — ルーティング（expo-router）

画面の場所と遷移だけを定める。状態は[データフロー](frontend-dataflow.instructions.md)。Expo でなければ適用外として破棄する。

- `app/` 配下のファイルは意図に関係なくルートになる。画面以外（コンポーネント、hook、定数、型）は `app/` の外に置き、場所はプロジェクトの `CLAUDE.md` に従う。
- route ファイルは `export default`。[共通コーディング](common-coding.instructions.md)の named export 規則の唯一の例外。
- 1 ファイル内で分岐して複数画面を表示する疑似 route を作らない。2 画面なら 2 ファイル。
- すべての画面は deep link から前の画面を経由せず開かれ得る。params は `string | string[] | undefined` であり、型引数で別の型を名乗らず parse し、不正値を到達可能な状態（not found 表示など）として扱う。params に object を詰めず id だけを渡し、本体は cache 層から取得する。
- 既定は `useLocalSearchParams`。`useGlobalSearchParams` は理由を説明できるときだけ。
- 遷移の既定は `<Link href={{ pathname: '/user/[id]', params: { id } }}>` の object 形で、文字列連結で `href` を組まない。`router.push` / `router.replace` は event handler かロジック側からだけ呼ぶ。`router.back()` は `router.canGoBack()` で guard し、戻れないときの遷移先を明示する。
- アプリ全体の provider（query client、safe area、theme、認証状態）は根の `_layout.tsx` だけに置く。
