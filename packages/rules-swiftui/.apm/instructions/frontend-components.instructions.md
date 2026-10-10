---
description: "🧱 SwiftUI / フロントエンド — View の粒度と分業"
applyTo: "**/*.swift,**/Package.swift"
---

# 🧱 SwiftUI / フロントエンド — View の粒度と分業

> **適用範囲: SwiftUI を使うネイティブ iOS アプリ。** 該当しなければ破棄する。
>
> 表示側の表記は [coding.md](frontend-coding.instructions.md)、状態とレイヤー構成は [dataflow.md](frontend-dataflow.instructions.md)、
> 画面の配置は [routing.md](frontend-routing.instructions.md)。
> この文書は**複数の View をどう分割し、誰がどの部分を書くか**を定義する。
>
> **コメントとユーザー向けの文言は日本語で書く。**

---

## 1. レイヤーは責務、配置は共有範囲（別々の 2 軸）

**レイヤー（何を知ってよいか）と配置（どこに置くか）を混同しない。**
レイヤーは責務で、配置は「現時点で何か所が使うか」で決まる。
Feature-first のフォルダー規約自体の正本は [common/coding.md](common-coding.instructions.md)。

### レイヤー = 責務（Presentation 内）

| レイヤー | 責務 | 例 |
| --- | --- | --- |
| **ui**（atoms） | これ以上分割しない外観の最小単位。業務も UseCase も知らない | `PrimaryButton` `Avatar` `FormTextField` |
| **parts**（molecules） | ui の再利用可能なまとまり。局所的な UI 状態を持つが業務は知らない | `SearchBar` `EmptyState` `ErrorBanner` |
| **feature**（organisms） | 業務を知るまとまり。ViewModel / Router に触れてよい | `LoginFormView` `UserListView` |
| **root**（配線） | Feature の入口。`NavigationStack` の接続と依存の受け渡しだけ | `LoginRootView` |

**再利用可能なコンポーネントは業務ドメインを知らない。** `PrimaryButton` が「注文」を知り始めた瞬間、それは `feature` になる。
引数もそのレイヤーの語彙で命名する（`ui` コンポーネントの引数に業務用語を持ち込まない）。

### 配置 = 共有範囲

**実際の利用範囲を覆う最小の場所に置く。** 1 画面だけが使う間は `Shared/` に昇格させない。
**2 か所目が現れた瞬間に切り出し、配置も引き上げる。**

**書き始める前に既存のものを探す。** 同じ外観を別々に定義した状態を作らない
（ボタンの角丸を変えるために複数ファイルを直す保守コストを、最初から生じさせない）。

> **harness はこれ以上ディレクトリ名を固定しない。**
> `Presentation/UI` を使うか、平らに保つかはプロジェクトの `CLAUDE.md` に記録してよい。
> **分離自体（ui / parts / feature / root）と Shared への昇格条件は固定する。**

---

## 2. UI 実装担当者とロジック実装担当者の境界

**この分離は develop の要件であり、任意ではない。** 外観とロジックは別コンテキストの実装担当者が扱う。
oracle が異なるために分ける（外観は人間の目、ロジックは機械テスト）。

### 必ず構造として作る分離

**root = 配線、presentational = 表示。**
Feature の入口（`LoginRootView` など）は Router / ViewModel の受け取りと `NavigationStack` の接続に留め、
**画面の外観の本体はその下の View に置く**（[routing.md](frontend-routing.instructions.md)）。

```swift
// ✅ root — 配線だけ
struct LoginRootView: View {
  @Bindable var router: LoginRouter
  @Bindable var viewModel: LoginViewModel

  var body: some View {
    NavigationStack(path: $router.path) {
      LoginFormView(viewModel: viewModel)
        .navigationDestination(for: LoginRoute.self) { /* ... */ }
    }
  }
}

// ✅ presentational に近い feature View — 表示と意図の転送
struct LoginFormView: View {
  @Bindable var viewModel: LoginViewModel

  var body: some View {
    // レイアウトとコントロール。通信・Repository は知らない
  }
}
```

### 結果として所有が機械的に分かれる

| 実装担当者 | 書くもの | 書かないもの |
| --- | --- | --- |
| **UI 実装担当者** | presentational View（**渡された値とクロージャで表示が決まる**）とスタイリング | **UseCase / Repository / `URLSession` を import しない。** データは契約に適合する固定モックとして引数に流れ込む。Preview も fake DI を使う（[coding.md](frontend-coding.instructions.md)） |
| **ロジック実装担当者** | ViewModel / Router / UseCase の接続、root の配線、Domain / Data | **見た目の構造やスタイリングを作り直さない**（既存 View の引数に写像する） |

### 引数（props）の型が両者の契約

**UI 側が View の入力（initializer の引数、渡すモデル型）を定義し、ロジック側がそこに写像する。**
ロジック側は View を「自分に都合のよい引数」に書き換えない。

**どちらかが不足を見つけたら、その側は実装を止めて報告する**（各実装担当者の出力契約に従う）。
自分の都合で片側を変えると、もう片側の Green が嘘になる。

---

## 3. UI 状態は引数（または薄い binding）で表す

**loading / empty / error / no-permission / boundary（長文、0 行、巨大な数）は、表示側から見ると入力として表す。**
UI 側は**その状態がどこから来たかを知らない。**

- `ui` / `parts` はできる限り**値とクロージャだけ**で閉じる（ViewModel を直接保持しない）
- `feature` は ViewModel を保持してよい。ただし View が ViewModel の中身（UseCase）を知らなくてよい形を保つ
- ロジック側の仕事は「UseCase の結果と進捗を、View が受け取る形へ写像する」で閉じる

これが崩れて UI 側が通信を知り始めると、**先に外観を確認する**分離が成立しなくなる。

---

## 4. 依存は下向きの一方向

依存は `root → feature → parts → ui` の向きだけ。**逆流や横の結合を作らない。**

- 下位レイヤーは上位レイヤーを import しない
- 同じレベルのレイヤー同士は import しない（循環になる）
- 子から親への通知は**親が渡したクロージャの呼び出し**で行う（子は親の型を知らない）
- CA のレイヤー（Domain / Data）への依存は [dataflow.md](frontend-dataflow.instructions.md) に従う。`ui` / `parts` から Domain の実装や Data に触れない

---

## 5. リストの行は表示コンポーネントに留める

可変長リストの遅延コンテナーと安定した id の正本は [coding.md](frontend-coding.instructions.md)。
この文書では分業だけを追加する。

- **行 View は `ui` / `parts` に置く。** 行の中で UseCase を起動しない
- リストに必要なデータは親の feature / ViewModel が揃えてから渡す
- 行に渡すモデルは、その行が表示する範囲に留める

---

## 6. 見た目のトークンを重複させない

- 色、余白、角丸、字間は、プロジェクトに共通の入口があればそこに置く。画面ごとに生の値を散らさない
- 同じ見た目のスタイル定義を 2 つの View に書かない
- **再利用可能な `ui` レイヤーのコンポーネントは外側の余白を持たない。**
  配置ごとに上書きが必要になり、再利用できなくなる。外側の余白は**親が決める**

---

## ✅ 返却前チェックリスト

- [ ] 開始前に同じ外観の既存 View を探したか？
- [ ] 再利用可能なコンポーネントが業務ドメインを知っていないか？
- [ ] 1 か所でしか使わないものを `Shared/` に昇格させていないか？
- [ ] root に外観の本体を書きすぎていないか？（配線に留まっているか？）
- [ ] （UI 実装担当者）UseCase / Repository / `URLSession` を import していないか？
- [ ] （ロジック実装担当者）見た目の構造やスタイリングを作り直していないか？
- [ ] UI 状態（loading / empty / error / permission / boundary）が表示側では入力として表されているか？
- [ ] 依存は下向きの一方向か？
- [ ] リストの行が通信や UseCase を持っていないか？
- [ ] `ui` レイヤーが外側の余白を持っていないか？
