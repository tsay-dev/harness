---
description: "🎨 SwiftUI / フロントエンド — 表示レイヤーのコーディング規則"
applyTo: "**/*.swift,**/Package.swift"
---

# 🎨 SwiftUI / フロントエンド — 表示レイヤーのコーディング規則

> **適用範囲: SwiftUI を使うネイティブ iOS アプリ。** 該当しなければ破棄する。
>
> **共通規則は [common/coding.md](common-coding.instructions.md)**（書式はツールが決める、Green にするために型を弱めない、
> Feature-first と `App` / `Shared`、`@MainActor` と `async/await`、秘密情報と依存）。
> 状態とレイヤー構成は [dataflow.md](frontend-dataflow.instructions.md)、遷移は [routing.md](frontend-routing.instructions.md)、
> 粒度と実装担当者の分業は [components.md](frontend-components.instructions.md)。
> この文書は、**それらに従った上で**、SwiftUI の表示側（View の書き方）に適用する差分だけを定義する。共通側は再掲しない。
>
> **コメントとユーザー向けの文言は日本語で書く。**

---

## 0. 目的の定義（`body` にできること、できないこと）

SwiftUI の `body` は、**現在の状態を外観に写す宣言**。
データの取得・永続化、遷移の所有、業務規則の本体はここに置かない。

`body` は再評価されうる。実行回数や時機を前提とする副作用を書くと、
デモでは動き、実機、再描画、プレビューでだけ壊れる。

**この文書の役目は、View の表示側で生じやすい抜け穴（副作用、肥大化、リストの事故、画面端の考慮漏れ）を閉じること。**

---

## 1. `body` や描画経路に副作用を書かない

```swift
// ❌ NG: 描画のたびに走りうる
var body: some View {
  let _ = viewModel.load()          // 同期副作用
  Text(viewModel.title)
    .onAppear { Task { await api.fetch() } }  // View が Data を知っている
}

// ✅ OK: 表示と「起動の意図」だけ。本体は ViewModel へ
var body: some View {
  Text(viewModel.title)
    .task { await viewModel.onAppear() }
}
```

- **View に通信、Repository、UseCase の直接呼び出しを書かない**（[dataflow.md](frontend-dataflow.instructions.md)）
- 「ついでに更新する」ために `body` の中で `Task { }` を起動しない。トリガーは `.task` または明示的なユーザー操作に限り、本体は ViewModel に置く
- `body` から重い同期計算、ファイル I/O、セマフォ待機をしない（メインが固まる）

**`.onAppear` より `.task`（必要なら `.task(id:)`）を優先する。**
キャンセルとライフサイクルの扱いが明確になり、画面が消えた後の誤更新を減らせる。

---

## 2. View を巨大な一枚岩にしない

フォーム、リスト、アラート、通信状態、レイアウトを 1 ファイルまたは 1 つの `body` に詰め込まない。

| 分割の兆候 | 対処 |
| --- | --- |
| 画面の一部分が独立して読める | private な子 View に切り出す（同じファイル内の `private struct` でよい） |
| 再利用やプレビューの単位にしたい | Presentation 内の別の View 型にする |
| 状態や操作が増えている | View の分割ではなく、ViewModel / Router の設計を疑う（[dataflow.md](frontend-dataflow.instructions.md)） |

**見た目だけの分割で UseCase を View に引き込まない。**
子 View に必要なのは表示値とクロージャ（または薄い ViewModel への参照）まで。

---

## 3. リストと同一性

長いリストには **遅延コンテナー: `List` / `LazyVStack` / `LazyHStack`** を使う。
通常の `VStack` + `ForEach` で数百行を一度に構築しない（初回描画やスクロールで破綻する）。

```swift
// ❌ NG: 安定しない id、行の中でまた通信
ForEach(Array(items.enumerated()), id: \.offset) { _, item in
  Row(item: item).task { await loadDetail(item) }
}

// ✅ OK: ドメイン上安定した id。行は表示に徹する
ForEach(items, id: \.id) { item in
  Row(item: item)
}
```

- `ForEach` の id は**ドメイン上で安定した識別子**にする（`offset` や表示文字列を id にしない）
- 行が表示されるたびに詳細取得を始めない。リストに必要なデータは UseCase 側で揃えるか、画面ごとの明示的な読み込みにする
- 行に渡すモデルは、その行が表示する範囲に留める（すべての行に巨大なグラフを渡さない）

---

## 4. 画面端 — セーフエリアとキーボード

見落とすとシミュレーターでは気づきにくく、実機でだけ壊れる。

- ノッチ、ホームインジケーター、Dynamic Island を前提にする。
  必要に応じて `safeAreaPadding` / `safeAreaInset` を使い、**手で選んだマジックナンバーだけで余白を埋めない**
- ナビゲーションバーやタブが既に消費した側に、同じ inset を二重に足さない
- 入力のある画面は、キーボードが送信ボタンもフィールドも隠さない構造を最初から作る
  （`ScrollView`、`safeAreaInset(edge: .bottom)` など。後からレイアウトを作り直さない）

---

## 5. Preview は Composition と同じ形の fake で動かす

`#Preview` を本番の `URLSession` や実 API に接続しない。

- Preview 用に **Repository / UseCase の fake** を Composition と同じ形で注入する
- Preview のために View から singleton や `.shared` を参照させない（[dataflow.md](frontend-dataflow.instructions.md)）
- 依存を明示的に渡し、プレビューを「画面の外観を確認する装置」に留め、統合テストの代用品にしない

```swift
#Preview {
  LoginRootView(
    router: LoginRouter(),
    viewModel: LoginViewModel(
      loginUseCase: PreviewLoginUseCase(),
      router: LoginRouter()
    )
  )
}
```

---

## 6. アクセシビリティは「出力する」もの

アイコンだけ、装飾だけのコントロールは VoiceOver に何も伝えない。

| 対象 | 付けるもの |
| --- | --- |
| 押せるもの | ボタンなどとして認識されること（`Button` を使い、必要なら `accessibilityAddTraits`） |
| アイコンだけで文言のないもの | `accessibilityLabel`（アイコン名ではなく操作の意味） |
| 純粋な装飾画像 | `accessibilityHidden(true)` |
| 状態（選択中、無効） | 外観だけでなくアクセシビリティ状態にも表す |

表示文言のコピーを id にしない（文言変更で壊れる）。識別子は**創作せず導出する**（ADR-0037）: 契約の operation を発火するコントロールは `.accessibilityIdentifier("<operation>")`（`"createProject"`）、request フィールドの入力は `.accessibilityIdentifier("<operation>.<field>")`（`"createProject.title"`）を付ける。見える文言、つまり `Text`、ボタンラベル、`accessibilityLabel` は**用語集の語**をそのまま使う（`docs/01-glossary.md`）。新しい語はゲートを通して用語集に追加し、View に先に書かない。

> これは VoiceOver が読み上げ、UC の XCUITest シナリオ（[system-testing.md](system-testing.instructions.md)）がタップ・検証する対象。シナリオは同じ用語集と契約から導出するので、報告に文言 → 識別子の表を返す。両者が一致しなければ外観側を修正する。
> より深いアクセシビリティ指針は置かず、FE ユニットテストは作成しない。

---

## 7. レイアウトの逃げ道を常用しない

- **「なんとなく」で `GeometryReader` を使わない。** 子が提案するサイズを崩し、入れ子はレイアウトを壊しやすい。必要な計測を説明できる場合だけ使う
- 色、フォント、余白のマジックナンバーを画面ごとに散らさない。プロジェクトに共通のデザイン入口（Assets、小さなトークン集合）があれば使う。なければ独断でデザインシステム全体を立てず、既存のスタイルに合わせる
- アニメーションを「動いて見せる」ためだけに毎フレーム状態を更新しない。SwiftUI の `animation` / `withAnimation` に任せ、アニメーションのクロージャに重い計算を埋め込まない

---

## ✅ 返却前チェックリスト

- [ ] `body` や描画経路に通信、重い同期処理、許可されていない `Task` 起動がないか？
- [ ] View が UseCase / Repository / `URLSession` を直接呼んでいないか？
- [ ] 画面が巨大な一枚岩のままになっていないか？
- [ ] 長いリストが遅延コンテナーにあり、`ForEach` の id が安定しているか？
- [ ] 実機のレイアウトがセーフエリアとキーボードに耐えるか？
- [ ] Preview が実 API や `.shared` に依存していないか？
- [ ] アイコンボタンなどに `accessibilityLabel`（または相当するもの）があるか？
- [ ] 見える語はすべて用語集の語であり、すべての operation コントロール / request 入力に `accessibilityIdentifier` の `"<operation>"` / `"<operation>.<field>"` が付いているか？
- [ ] 理由なく `GeometryReader` を増やしていないか？
