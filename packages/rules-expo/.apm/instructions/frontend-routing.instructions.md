---
description: "🧭 Expo / frontend — ルーティング（expo-router）"
applyTo: "**/*.tsx,**/*.ts,**/app.json,**/app.config.*,**/eas.json"
---

# 🧭 Expo / frontend — ルーティング（expo-router）

> **対象: Expo（expo-router）の React Native アプリ。** Expo でなければ適用外として扱い、破棄する。
>
> 共通の記法規約は [common/coding.md](common-coding.instructions.md)、表層の規約は [coding.md](frontend-coding.instructions.md) にある。
> この文書は **画面の場所と遷移の仕組み**だけを定義する。状態の保持は [dataflow.md](frontend-dataflow.instructions.md) にある。
>
> **コメントとユーザー向けの文言は日本語で書く。**

---

## 0. 目的の定義（expo-router ができること、できないこと）

expo-router では **ファイル配置そのものがルーティング仕様**である。
router 設定 object、遷移表、登録手順はない。

その代わり、**アプリ内遷移と URL / deep link からの直接入場は同じルートを通る**。
つまり **すべての画面は前の画面を経由せず、いきなり開かれ得る**。
「前の画面から渡された値」を前提にする画面は、その経路で必ず壊れる。

**この文書の役割は、ファイル配置規約を守らせ、「いきなり開かれる」前提を維持することである。**

---

## 1. `app/` 配下に置いたファイルは、意図に関係なくルートになる

`app/` にコンポーネント、hook、定数、型定義を置かない。**置いた瞬間、到達可能な画面が現れる。**
画面以外は `app/` の外に置く（`components/`、`hooks/` など。場所はプロジェクトの `CLAUDE.md` に従う）。

**route ファイルは `export default` を要求する。**
これは [common/coding.md](common-coding.instructions.md) の「default export を使わない」の **唯一の例外**である。
named export ではフレームワークがルートを解決できず、**画面が空白になる**（build は通る）。

---

## 2. ファイル名が仕様

| 名前 | 意味 |
| --- | --- |
| `_layout.tsx` | そのディレクトリ以下の共有 layout と navigator |
| `(group)` | URL に現れないグループ化（tab、認証状態などを束ねる）|
| `[id]` | 動的 segment |
| `[...rest]` | catch-all |
| `+not-found.tsx` | 未定義 path を受け止める場所 |
| `index.tsx` | そのディレクトリ自身の path |

**手続き的なコードでこの規約へ割り込まない。** 1 ファイル内で分岐して複数画面を表示する
「疑似 route」を作ると、その状態に URL から到達できず、ファイル構造が仕様ではなくなる。
2 画面なら 2 ファイルである。

---

## 3. params は文字列であり、あなたの型ではない

`useLocalSearchParams()` が返すのは **`string | string[] | undefined`**。
数値、boolean、日付、JSON は **必ず parse し、失敗を扱う**。

```tsx
//  NG: 型を騙しているだけ。不正な値でそのまま下流へ流れる
const { id } = useLocalSearchParams<{ id: number }>();

//  OK: パースして、不正なら到達可能な状態として扱う
const { id: rawId } = useLocalSearchParams<{ id: string }>();
const id = Number(rawId);
if (Number.isNaN(id)) return <NotFound />;
```

不正な `id` で開かれることは **例外ではなく到達可能な状態**である（URL は編集できる）。
[common/coding.md](common-coding.instructions.md) の「成功させるために型を弱めない」がここにも適用される。

**既定は `useLocalSearchParams`。** `useGlobalSearchParams` は現在 focus 中の route の params を返すため、
**アプリ内のどこへ遷移しても再 render する**。理由を説明できるときだけ使う。

---

## 4. params にオブジェクトを詰め込まない

params は URL にシリアル化される。**「前の画面から渡された JSON」を前提にする画面は、
deep link と復元経路で必ず壊れる。**

**id だけを渡し、本体は cache 層から取得する**（[dataflow.md](frontend-dataflow.instructions.md)）。
cache 層があれば「既に手元にあるので渡す方が速い」は成立しない。

---

## 5. 遷移

**既定は `<Link>` の宣言的な形。**

```tsx
//  NG: エスケープ漏れが起き、typed routes の恩恵も消える
<Link href={`/user/${id}?tab=${tab}`} />

//  OK
<Link href={{ pathname: '/user/[id]', params: { id, tab } }} />
```

命令的な `router.push` / `router.replace` は **event handler またはロジック側からだけ**呼ぶ
（render 中には呼ばない）。

**`router.back()` を `router.canGoBack()` で guard する。**
deep link で直接入った画面では、stack に戻る先がなく、
「閉じる button が何もしない」として壊れる。戻れないときの遷移先（home など）を明示する。

---

## 6. provider の場所は 1 つ: 根の `_layout.tsx`

アプリ全体で共有する provider（query client、safe area、theme、認証状態）は
**最上位の `_layout.tsx` だけに置く**。

画面ごとに provider を作ると **cache と inset が画面ごとに分断され**、追跡しにくい
**「戻ると値が違う」「画面ごとに余白がずれる」**として壊れる。

---

## ✅ 返却前チェックリスト

- [ ] `app/` 内に画面以外のファイルを置いていないか？
- [ ] route ファイルが `export default` を使っているか？
- [ ] 1 ファイル内で分岐して複数画面を表示していないか？
- [ ] params を parse し、不正値時の表示を決めたか？
- [ ] params にオブジェクトを詰め込まず、id だけを渡しているか？
- [ ] 文字列連結で `href` を組み立てていないか？
- [ ] `router.back()` を `canGoBack()` で guard したか？
- [ ] 画面ごとに provider を作っていないか？
