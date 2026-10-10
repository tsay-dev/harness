---
description: "🧱 Expo / frontend — コンポーネントの粒度と分担"
applyTo: "**/*.tsx,**/*.ts,**/app.json,**/app.config.*,**/eas.json"
---

# 🧱 Expo / frontend — コンポーネントの粒度と分担

> **対象: Expo（expo-router）の React Native アプリ。** Expo でなければ適用外として扱い、破棄する。
>
> 表層の記法は [coding.md](frontend-coding.instructions.md)、状態の保持は [dataflow.md](frontend-dataflow.instructions.md)、
> 画面の場所は [routing.md](frontend-routing.instructions.md) にある。
> この文書は **コンポーネント群をどう分割し、誰がどこを書くか**を定義する。
>
> **コメントとユーザー向けの文言は日本語で書く。**

---

## 1. レイヤーは責務、配置は共有範囲（別々の 2 軸）

**レイヤー（何を知ってよいか）と配置（どこに置くか）を混同しない。**
レイヤーは責務で、配置は「今いくつの場所で使っているか」で決める。

### レイヤー = 責務

| レイヤー | 責務 | 例 |
| --- | --- | --- |
| **ui**（atoms）| これ以上分解しない外観の最小単位。業務も通信も知らない | `Button` `TextField` `Avatar` |
| **parts**（molecules）| 再利用可能な ui のまとまり。局所 state は持つが業務は知らない | `SearchBar` `Modal` `EmptyState` |
| **feature**（organisms）| 業務を知るまとまり。契約に適合する通信や query を扱ってよい | `UserList` `OrderForm` |
| **screen / route** | 構成と配線だけ。外観は下位レイヤーへ委譲する | `app/user/[id].tsx` |

**再利用可能なコンポーネントは業務 domain を知らない。** `Button` が「注文」を知った瞬間、それは `feature` である。
props もそのレイヤーの語彙で命名する（`ui` コンポーネントの props に業務用語を持ち込まない）。

### 配置 = 共有範囲

**実際の利用範囲を覆う最小の場所に置く。** 1 画面でしか使わない間は共有場所へ昇格させない。
**2 つ目の利用箇所が現れた時点で切り出し、配置も引き上げる。**

**書き始める前に既存のものを探す。** 同じ外観を別々に定義した状態を作らない
（button の角丸変更に 7 ファイルの修正が必要になる保守コストを、最初から負わない）。

> **harness はディレクトリ名を固定しない。** `components/` / `features/` / `src/ui/` のどれを使うかは
> プロジェクトが決め、**そのプロジェクトの `CLAUDE.md` に記録する**。**分離自体は固定する。**

---

## 2. UI 実装者とロジック実装者の境界

**この分離は develop の要求であり、任意ではない。** 外観とロジックは別コンテキストの実装者が扱う。
oracle が異なるために分ける（外観は人間の目視、ロジックは機械テスト）。

### 構造上必ず作る分離

**route ファイル = 配線、view コンポーネント = 表示。**
`app/**` 配下の route ファイルは hook の呼び出しと props の受け渡しだけを持つ。
**JSX の本体は表示用 view コンポーネント側に置く。**

```tsx
//  app/user/[id].tsx — 配線だけ
export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, error } = useUser(id);
  return <UserDetailView user={data} isLoading={isPending} error={error} onRetry={...} />;
}
```

### その結果、担当は機械的に分かれる

| 実装者 | 書くもの | 書かないもの |
| --- | --- | --- |
| **UI 実装者** | 表示用コンポーネント（**props だけで表示が決まる**）と styling | **query hook、API client、store、`expo-secure-store` を import しない。`fetch` を書かない。** データは契約に適合する固定 mock として props に流し込む |
| **ロジック実装者** | hook、API client、query / store 設定、route ファイルの配線 | **JSX 構造や styling を作り直さない** |

### props 型が両者の契約

**UI 実装者が props 型を定義・export し、ロジック実装者がそれに写像する。**
ロジック側が独断で props 型を変えない。

**どちらかが不足を見つけたら、その担当は実装を止めて報告する**（各実装者の出力契約に従う）。
自分の都合で片方を変えると、他方の Green が嘘になる。

---

## 3. UI 状態は props で表す

**loading / 空 / エラー / 権限なし / 境界（長文、0 行、巨大な数）はすべて props で表す。**
UI 側は **その状態の由来を知らない**。

ロジック側の仕事は「query の状態を props に写像する」に閉じる。
これが破れて UI 側が通信を知り始めると、**外観を先に確認する**分離が成立しなくなる。

---

## 4. 依存は下向きの一方向

`screen → feature → parts → ui` の方向だけに依存する。**逆流や横方向の参照を作らない。**

- 下位レイヤーは上位レイヤーを import しない
- 同階層のレイヤー同士は import しない（循環になる）
- 子から親への通知は **親から渡された callback を呼ぶ**形にする（子は親を知らない）

---

## 5. リストは `FlatList` に載せる

**長くなり得る可変長リストを `.map()` で描画しない。** 全行が一度に mount され、実機で落ちる。

`FlatList`（または `FlashList`）に載せ、次を守る。

- **`keyExtractor` は安定した一意の id を返す。**
  既定では `key` → `id` → **配列 index** の順で fallback する。
  **index に落ちると、並び替え・削除時に行と state がずれる**（別の行の値が表示される）
- **行コンポーネントを memo 化し、渡す props を毎 render 作り直さない。**
  inline style と callback は memo 化を破る（[coding.md](frontend-coding.instructions.md) §2 と同じ理由）
- **行の高さが固定のときだけ `getItemLayout` を追加する。** 付けると `scrollToIndex` が正しく働く。
  可変高で追加すると位置がずれる
- **同じ向きの `ScrollView` の中に `FlatList` を置かない。** 仮想化が破られ、リストに載せる意味がなくなる。
  header を付けるなら `ListHeaderComponent` を使う
- 空、loading、末尾は `ListEmptyComponent` / `ListFooterComponent` で表す

---

## 6. 視覚 token を重複させない

- 色、余白、角丸、字間は **token に置き、生の値を hardcode しない**
- 同じ視覚 style 定義を 2 つのコンポーネントに書かない
- **再利用可能な `ui` レイヤーのコンポーネントは外側の余白（`margin`）を持たない。**
  配置ごとに override が必要になり、再利用できなくなる。外側の間隔は **親が決める**

---

## ✅ 返却前チェックリスト

- [ ] 着手前に同じ外観の既存コンポーネントを探したか？
- [ ] 再利用可能なコンポーネントが業務 domain を知っていないか？
- [ ] 1 か所でしか使わないものを共有場所へ昇格させていないか？
- [ ] route ファイルに JSX の本体を書いていないか？
- [ ] （UI 実装者）query、API client、store を import していないか？
- [ ] （ロジック実装者）JSX 構造と styling を作り直していないか？
- [ ] UI 状態（loading / 空 / エラー / 権限 / 境界）はすべて props で受け取っているか？
- [ ] 依存は下向きの一方向か？
- [ ] 可変長リストは `FlatList` に載り、`keyExtractor` が安定した id を返すか？
- [ ] `ui` レイヤーのコンポーネントが外側の `margin` を持っていないか？
