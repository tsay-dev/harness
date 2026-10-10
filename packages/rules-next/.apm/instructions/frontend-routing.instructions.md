---
description: "🧭 Next.js / frontend — ルーティング（App Router）"
applyTo: "**/next.config.*,**/app/**/page.tsx,**/app/**/layout.tsx,**/app/**/loading.tsx,**/app/**/error.tsx,**/app/**/not-found.tsx,**/app/**/template.tsx,**/app/**/default.tsx,**/components/**,**/features/**"
---

# 🧭 Next.js / frontend — ルーティング（App Router）

> **対象: Next.js（App Router）。** Next.js でなければ適用外として扱い、破棄する。
>
> 共通の記法規約は [common/coding.md](common-coding.instructions.md)、表層の規約は [coding.md](frontend-coding.instructions.md) にある。
> この文書は **画面の場所と URL から入る前提**だけを定義する。状態の保持は [dataflow.md](frontend-dataflow.instructions.md)、
> 粒度は [components.md](frontend-components.instructions.md) にある。
>
> **コメントとユーザー向けの文言は日本語で書く。**

---

## 0. 目的の定義（ファイル配置が仕様）

App Router では **`app/` 配下のファイル配置そのものがルーティング仕様**である。
「画面一覧」を持つ別の巨大な route 表は存在しない。

その代わり、**アプリ内 link と、URL を直接開いて入る場合は同じルートを通る**。
つまり **すべての page は前の画面を経由せず、いきなり開かれ得る**。
「前の画面から渡された値」「前の画面の state」を前提にする page は、その経路で必ず壊れる。

**この文書の役割は、ファイル配置規約を守らせ、「いきなり開かれる」前提を維持することである。**

---

## 1. `app/` にはルートと枠だけを置く

**`app/` には到達可能な UI の入口と、フレームワークが要求する特殊ファイル以外を置かない。**
汎用コンポーネント、hook、domain、ユースケース、style の置き場所を `app/` にすると、
意図しない URL が増え、配線と実装が混ざる。

画面のコンポーネントは `app/` の外に置く（場所はプロジェクトの `CLAUDE.md` にある）。

Server Actions を `app/` 配下に置く場合も **ミューテーション・コントローラーとして薄く保つ**
（[backend/coding.md](backend-coding.instructions.md)）。Action ファイルに業務の本体を沈めることは禁止する。

**`page.tsx` / `layout.tsx` / `route.ts` などはフレームワークが要求する default export を使う。**
例外の範囲は [common/coding.md](common-coding.instructions.md) にある。named export ではルートが空になることがある。

---

## 2. ファイル名が仕様

| 名前 | 意味 |
| --- | --- |
| `page.tsx` | その segment の UI 入口 |
| `layout.tsx` | 配下の segment を包む共有の枠（入れ子になる）|
| `route.ts(x)` | Route Handler（HTTP endpoint）|
| `loading.tsx` | その枠の loading UI（segment の待機。view 状態の `loading` prop との分担は [components.md](frontend-components.instructions.md) §3）|
| `error.tsx` | その枠のエラー UI（Client Component）|
| `not-found.tsx` | 存在しないものを受け止める場所 |
| `template.tsx` | 遷移のたびに state がリセットされる枠 |
| `default.tsx` | Parallel Routes の fallback |
| `(group)` | URL に現れないグループ化 |
| `[id]` | 動的 segment |
| `[...slug]` / `[[...slug]]` | catch-all / optional catch-all |

**手続き的なコードでこの規約へ割り込まない。** 1 つの `page.tsx` 内で分岐し、複数の「画面」を表示する
疑似 route を作ると、その状態に URL から到達できず、ファイル構造が仕様ではなくなる。
2 画面なら 2 segment（2 ファイル）である。

---

## 3. `params` / `searchParams` は文字列であり、あなたの型ではない

動的 segment も query 値も **文字列（または文字列の配列）**として到着する。
数値、boolean、日付として使うなら **読み取り配線の境界で parse し、失敗を扱う**。
（[backend/coding.md](backend-coding.instructions.md) §5、[frontend/coding.md](frontend-coding.instructions.md) §2、[common/coding.md](common-coding.instructions.md) §1）

```tsx
//  NG: 型パラメータで数値だと信じ込ませ、未検証のままユースケースへ
//  OK: スキーマ検証に失敗したら notFound() 等。成功時だけユースケースへ
```

不正な `id` で開かれることは **例外ではなく到達可能な状態**である（URL は編集できる）。
`notFound()` / エラー UI / view props の error・empty で表示を明示する
（読み取りに Client 向け ActionResult は要求しない。[backend/coding.md](backend-coding.instructions.md) §6）。

---

## 4. URL にオブジェクトや「前の画面の荷物」を詰め込まない

「次の画面へ渡す」ために JSON や大きな state を searchParams や path に載せることを既定にしない。
**渡すものは id、または filter として意味のある短い query に限定する。**
本体はユースケース経由でサーバーの正本から取得する（[dataflow.md](frontend-dataflow.instructions.md)、[backend/coding.md](backend-coding.instructions.md)）。

「既に手元にあるので、全部 props や URL で渡す方が速い」は、
URL を直接開いた瞬間に崩れる。

---

## 5. 遷移

**宣言的遷移は `next/link` の `<Link>` を既定にする。**
命令的な `useRouter().push` / `replace` は **Client の event handler またはロジック側からだけ**呼ぶ
（render 中には呼ばない）。

```tsx
//  OK
<Link href={`/users/${id}`}>詳細</Link>

//  動的に組むときも、不正な文字列や未検証の値をそのまま連結しない
```

外部 URL への `Link` や `redirect` は、open redirect にならないよう **プロジェクト側で許可する遷移先を制限する**
（具体的な方法はプロジェクトが選ぶ）。

---

## 6. 共有 provider は根の `layout.tsx` にまとめる

アプリ全体で共有する Client provider（theme、toast、client 側 cache など）は
**根に近い `app/layout.tsx`（またはプロジェクトが決めた単一箇所）に置く**。

page ごとに provider を増やして cache や設定を分断しない。
何を provider にするか自体はプロジェクトが選ぶ。この文書が禁止するのは **配置の分散**だけである。

---

## ✅ 返却前チェックリスト

- [ ] `app/` にルート、枠、薄い controller 以外を置いていないか？
- [ ] フレームワークが要求するファイルで default export を使っているか？
- [ ] 1 つの page を複数画面へ分岐する疑似 route にしていないか？
- [ ] `params` / `searchParams` を parse・検証し、不正入力時の表示を決めたか？
- [ ] 次の画面へ渡すためにオブジェクトや大きな state を URL に詰め込んでいないか？
- [ ] render 中に命令的遷移を呼んでいないか？
- [ ] 共有 provider を page ごとに増やしていないか？
