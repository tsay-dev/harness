---
description: "🧱 Next.js / frontend — コンポーネントの粒度と分担"
applyTo: "**/next.config.*,**/app/**/page.tsx,**/app/**/layout.tsx,**/app/**/loading.tsx,**/app/**/error.tsx,**/app/**/not-found.tsx,**/app/**/template.tsx,**/app/**/default.tsx,**/components/**,**/features/**"
---

# 🧱 Next.js / frontend — コンポーネントの粒度と分担

> **対象: Next.js（App Router）の UI 表層。** Next.js でなければ適用外として扱い、破棄する。
>
> 表層の記法は [coding.md](frontend-coding.instructions.md)、状態の保持は [dataflow.md](frontend-dataflow.instructions.md)、
> 画面の場所は [routing.md](frontend-routing.instructions.md)、サーバー側の責務は [backend/coding.md](backend-coding.instructions.md) にある。
> この文書は **コンポーネント群をどう分割し、誰がどこを書くか**を定義する。
> 読み取り配線のコード例の SSOT は [coding.md](frontend-coding.instructions.md) §2 である（ここへ全文をコピーしない）。
>
> **コメントとユーザー向けの文言は日本語で書く。**

---

## 1. レイヤーは責務、配置は共有範囲（別々の 2 軸）

**レイヤー（何を知ってよいか）と配置（どこに置くか）を混同しない。**
レイヤーは責務で、配置は「今いくつの場所で使っているか」で決める。

### レイヤー = 責務

| レイヤー | 責務 | 例 |
| --- | --- | --- |
| **ui**（atoms）| これ以上分解しない外観の最小単位。業務も取得処理も知らない | `Button` `TextField` `Avatar` |
| **parts**（molecules）| 再利用可能な ui のまとまり。局所 UI 状態は持つが業務は知らない | `SearchBar` `Modal` `EmptyState` |
| **feature**（organisms）| 業務を知るまとまり。表示に必要なデータ形状と更新入口（渡された Server Action）を扱ってよい | `UserList` `OrderForm` |
| **route**（読み取り配線）| 構成と配線だけ。外観は下位レイヤーへ委譲する | `app/**/page.tsx` `layout.tsx` |

**再利用可能なコンポーネントは業務 domain を知らない。** `Button` が「注文」を知った瞬間、それは `feature` である。
props もそのレイヤーの語彙で命名する（`ui` コンポーネントの props に業務用語を持ち込まない）。

### 配置 = 共有範囲

**実際の利用範囲を覆う最小の場所に置く。** 1 画面でしか使わない間は共有場所へ昇格させない。
**2 つ目の利用箇所が現れた時点で切り出し、配置も引き上げる。**

**書き始める前に既存のものを探す。** 同じ外観を別々に定義した状態を作らない。

> **harness はディレクトリ名を固定しない。** `components/` / `features/` / `src/ui/` のどれを使うかは
> プロジェクトが決め、**そのプロジェクトの `CLAUDE.md` に記録する**。**分離自体は固定する。**

---

## 2. UI 実装者とロジック実装者の境界

**この分離は develop の要求であり、任意ではない。** 外観とロジックは別コンテキストの実装者が扱う。
oracle が異なるために分ける（外観は人間の目視、ロジックは機械テスト）。

### 構造上必ず作る分離

**route ファイル = 読み取り配線、view コンポーネント = 表示。**
`page.tsx` / `layout.tsx` は検証、ユースケース呼び出し、props の受け渡しだけを持つ。
**JSX の本体は表示用 view 側に置く**（例は [coding.md](frontend-coding.instructions.md) §2）。

### その結果、担当は機械的に分かれる

| 実装者 | 書くもの | 書かないもの |
| --- | --- | --- |
| **UI 実装者**（frontend-ui）| 表示用コンポーネント（**props だけで表示が決まる**）と styling | **ユースケース、infrastructure、Server Action の本体、`fetch` を import しない。** データは契約に適合する固定 mock として props に流し込む |
| **ロジック実装者**（frontend-logic）| 読み取り配線（params 検証、ユースケース呼び出し、props への写像）、Client 末端の局所 UI 状態、**既存 Server Action の呼び出しと props 経由の受け渡し** | **JSX 構造や styling を作り直さない。Server Actions / Route Handlers の本体（zod、ユースケース呼び出し、`revalidatePath`）を書かない**（[backend/coding.md](backend-coding.instructions.md) §1.1）|

### props 型が両者の契約

**UI 実装者が props 型を定義・export し、ロジック実装者がそれに写像する。**
ロジック側が独断で props 型を変えない。

**どちらかが不足を見つけたら、その担当は実装を止めて報告する**（各実装者の出力契約に従う）。

---

## 3. UI 状態は props で表す

**空 / エラー / 権限なし / 境界（長文、0 行、巨大な数）は view props で表す。**
UI 側は **その状態の由来を知らない**。

待機の分担:

- **segment の枠での待機**（page 遷移中の suspense）→ `loading.tsx`（[routing.md](frontend-routing.instructions.md)）
- **view 内の状態**（再試行後、部分更新、権限なし）→ `loading` / `error` prop

同じ意味を両方で二重に持たない。

読み取り配線の仕事は「ユースケースのシナリオ結果を props に写像する」に閉じる
（page は呼び出し側向け ActionResult を返す必要がない。[backend/coding.md](backend-coding.instructions.md) §6）。

データの方向自体は [dataflow.md](frontend-dataflow.instructions.md) にある。

---

## 4. 依存は下向きの一方向

`route → feature → parts → ui` の方向だけに依存する。**逆流や横方向の参照を作らない。**

- 下位レイヤーは上位レイヤーを import しない
- 同階層のレイヤー同士は import しない（循環になる）
- 子から親への通知は **親から渡された callback を呼ぶ**形にする（[dataflow.md](frontend-dataflow.instructions.md) §1）

---

## 5. リストの key は安定させる

可変長リストの描画では **配列 index を `key` に使わない**。
**安定した一意の id** を使う。

行へ渡す props や callback を、毎 render 不必要に新しい参照として作り直さない。
特定のリスト仮想化ライブラリの選択はプロジェクトに委ねる。

---

## 6. 視覚 token を重複させない

- 色、余白、角丸、字間は **token に置き、生の値を hardcode しない**（仕組みはプロジェクトが選ぶ）
- 同じ視覚 style 定義を 2 つのコンポーネントに書かない
- **再利用可能な `ui` レイヤーのコンポーネントは外側の余白（`margin`）を持たない。** 外側の間隔は **親が決める**

---

## ✅ 返却前チェックリスト

- [ ] 着手前に同じ外観の既存コンポーネントを探したか？
- [ ] 再利用可能なコンポーネントが業務 domain を知っていないか？
- [ ] 1 か所でしか使わないものを共有場所へ昇格させていないか？
- [ ] route ファイルに JSX の本体を書いていないか？
- [ ] （UI 実装者）ユースケース、infrastructure、取得ロジックを import していないか？
- [ ] （ロジック実装者）Action の本体を書いたり、JSX を作り直したりしていないか？
- [ ] view 内の状態（空 / エラー / 権限 / 境界、view 内の loading）は props で受け取っているか？ segment の待機を `loading` prop に重複させていないか？
- [ ] 依存は下向きの一方向か？
- [ ] リストの `key` は安定した id（index ではない）か？
- [ ] `ui` レイヤーのコンポーネントが外側の `margin` を持っていないか？
