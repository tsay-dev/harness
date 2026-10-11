---
description: "🧱 Next.js / frontend — コンポーネントの粒度と分担"
applyTo: "**/next.config.*,**/app/**/page.tsx,**/app/**/layout.tsx,**/app/**/loading.tsx,**/app/**/error.tsx,**/app/**/not-found.tsx,**/app/**/template.tsx,**/app/**/default.tsx,**/components/**,**/features/**"
---

# 🧱 Next.js / frontend — コンポーネントの粒度と分担

Next.js（App Router）の UI 表層が対象。対象外なら破棄する。表層の記法は [frontend-coding](frontend-coding.instructions.md)、サーバー側の担当は [backend-coding](backend-coding.instructions.md)。この文書はコンポーネント群の分割と、誰がどこを書くかだけを定める。コメントとユーザー向け文言は日本語。

## レイヤーは責務、配置は共有範囲

| レイヤー | 責務 | 例 |
| --- | --- | --- |
| ui（atoms）| 外観の最小単位。業務も取得処理も知らない | `Button` `TextField` `Avatar` |
| parts（molecules）| 再利用可能な ui のまとまり。局所 UI 状態は持つが業務は知らない | `SearchBar` `Modal` `EmptyState` |
| feature（organisms）| 業務を知るまとまり。表示に必要なデータ形状と渡された Server Action を扱ってよい | `UserList` `OrderForm` |
| route（読み取り配線）| 構成と配線だけ。外観は下位へ委譲する | `app/**/page.tsx` `layout.tsx` |

- 再利用可能なコンポーネントは業務 domain を知らず、props もそのレイヤーの語彙で命名する。`Button` が「注文」を知った時点でそれは feature。
- 依存は `route → feature → parts → ui` の一方向。逆流と同階層の参照を作らず、子から親への通知は親から渡された callback で行う。
- 配置は実際の利用範囲を覆う最小の場所。1 画面でしか使わないものを共有場所へ昇格させず、2 つ目の利用箇所が現れた時点で切り出す。書き始める前に既存のものを探し、同じ外観を別々に定義しない。ディレクトリ名（`components/` / `features/` / `src/ui/`）はプロジェクトの `CLAUDE.md` が決める。

## UI 実装者とロジック実装者の境界

外観とロジックは oracle が異なる（目視と機械テスト）ため、別コンテキストの実装者が扱う。route ファイル = 読み取り配線、view コンポーネント = 表示。

| 役割 | 書くもの | 書かないもの |
| --- | --- | --- |
| 外観 | 表示用コンポーネント（props だけで表示が決まる）と styling。データは契約に適合する固定 mock を props に流す | ユースケース、infrastructure、Server Action の本体、`fetch` の import |
| ロジック | 読み取り配線（params 検証、ユースケース呼び出し、props への写像）、Client 末端の局所 UI 状態、既存 Server Action の呼び出しと props 経由の受け渡し | JSX 構造や styling の作り直し、Server Actions / Route Handlers の本体 |

- props 型は両者の契約。UI 実装者が定義・export し、ロジック実装者がそれに写像する。ロジック側が独断で props 型を変えない。不足を見つけた担当は実装を止めて報告する。
- 空 / エラー / 権限なし / 境界（長文、0 行、巨大な数）は view props で表し、UI 側はその由来を知らない。segment の枠での待機は `loading.tsx`、view 内の待機（再試行後、部分更新）は `loading` / `error` prop。同じ意味を両方で持たない。
- 可変長リストの `key` は安定した一意の id。色、余白、角丸、字間は token に置き、同じ style 定義を 2 つのコンポーネントに書かない。`ui` レイヤーのコンポーネントは外側の `margin` を持たず、間隔は親が決める。
