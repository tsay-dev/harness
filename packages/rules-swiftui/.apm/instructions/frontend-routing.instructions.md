---
description: "🧭 SwiftUI / フロントエンド — ルーティング（Feature の Router）"
applyTo: "**/*.swift,**/Package.swift"
---

# 🧭 SwiftUI / フロントエンド — ルーティング（Feature の Router）

> **適用範囲: SwiftUI を使うネイティブ iOS アプリ。** 該当しなければ破棄する。
>
> 共通の表記規則は [common/coding.md](common-coding.instructions.md)、表示側の規則は [coding.md](frontend-coding.instructions.md)、
> 粒度と分業は [components.md](frontend-components.instructions.md)。
> この文書は**画面の配置と遷移の仕組み**だけを定義する。状態とレイヤー間のフローは [dataflow.md](frontend-dataflow.instructions.md)。
>
> **コメントとユーザー向けの文言は日本語で書く。**

---

## 0. 目的の定義（NavigationStack にできること、できないこと）

`NavigationStack` は**path に従って画面を積む装置**。
「ここからどこへ進めるか」「成功したらどこへ進むか」という業務上の判断はしない。

path を View の `@State` に置くと、遷移の知識が描画に結びつき、
連打、ディープリンク、テストでの差し替えで壊れやすくなる。

**この文書の役目は、遷移の所有を Feature の Router に固定し、View から path 操作を除くこと。**
その下の API は通常の `NavigationStack(path:)` のまま。

---

## 1. 各 Feature に Router を置く

Presentation に**その Feature の Router** を置く。巨大なアプリ全体の Router を標準にしない。

```swift
enum LoginRoute: Hashable {
  case home
  case forgotPassword
}

@Observable
final class LoginRouter {
  var path = NavigationPath()
  var sheet: LoginSheet?

  func showHome() {
    path.append(LoginRoute.home)
  }

  func showForgotPassword() {
    sheet = .forgotPassword
  }
}
```

- **Router は「現在どの画面が開いているか」を保持する**（path、sheet、fullScreenCover など）
- ViewModel は業務上の結果を作り、遷移が許可されたら Router のメソッドを呼ぶ（[dataflow.md](frontend-dataflow.instructions.md)）
- root View（その Feature の入口）だけが `NavigationStack(path:)` を Router に binding する

---

## 2. View は `path.append` を呼ばない

```swift
// ❌ NG: View が遷移装置を直接いじる
Button("次へ") { path.append(Route.home) }

// ✅ OK: 意図だけを上に渡す（VM 経由でも Router でも、path 操作は View の外）
Button("次へ") { viewModel.nextButtonTapped() }
```

View に書いてよいのは「ユーザーが何をしたか」だけ。
`NavigationPath` の変更と `navigationDestination` の遷移先テーブルの所有は、Router（と、それを binding する root View）の責務。

```swift
struct LoginRootView: View {
  @Bindable var router: LoginRouter
  @Bindable var viewModel: LoginViewModel

  var body: some View {
    NavigationStack(path: $router.path) {
      LoginFormView(viewModel: viewModel)
        .navigationDestination(for: LoginRoute.self) { route in
          switch route {
          case .home: HomeView(/* 必要な依存は init で */)
          case .forgotPassword: ForgotPasswordView(/* ... */)
          }
        }
    }
    .sheet(item: $router.sheet) { sheet in
      // ...
    }
  }
}
```

---

## 3. id を渡し、本体は再取得する

**巨大なモデルや「前画面で取得した JSON」を丸ごと遷移先に渡さない。**
渡すものは識別子など復元可能な値に留め、遷移先が UseCase 経由で本体を取得する。

前画面のメモリー上の値を前提にすると、ディープリンク、状態復元、プロセス終了後に必ず壊れる。

不正な id で開かれることは**例外ではなく到達可能な状態**。
パース失敗や存在しないレコードは、画面として成立する形に着地させる（[common/coding.md](common-coding.instructions.md) の「Green にするために型を弱めない」）。

---

## 4. 戻る、閉じるを明示する

- スタックから取り除く操作（`pop`、`popToRoot` など）も Router が所有する。View が `dismiss` だけで業務フローを組み立てない
- sheet / fullScreenCover の表示と終了も Router の状態で表す
- **戻れない**場合の行き先（ホームなど）は、必要に応じて Router のメソッドとして明示する

---

## 5. ルートの配線は `App/` または Feature の入口だけ

- アプリの最初の `NavigationStack` の接続と Feature Router の構築は、**Composition Root（`App/`）または Feature の入口**で閉じる
- 子 View の深い位置で `NavigationStack` を増殖させない（入れ子のスタックは戻る操作と path の解決を壊しやすい）
- Feature をまたぐ遷移が必要なら、接合点を Composition Root または明示的な境界 API に置く。
  Feature 内部の Router が別の Feature の具象 View を無差別に import し始めないようにする

---

## ✅ 返却前チェックリスト

- [ ] Feature に Router があり、path と sheet の所有がそこにあるか？
- [ ] View が `path.append` を呼ぶなど、遷移装置を直接操作していないか？
- [ ] ViewModel が業務上の結果を得た後に Router を呼んでいるか？
- [ ] 遷移パラメーターは巨大なオブジェクトではなく id 中心か？
- [ ] 不正入力で開かれたときの表示を決めたか？
- [ ] 子の深い位置で `NavigationStack` を増殖させていないか？
