---
description: "🧭 SwiftUI / フロントエンド — ルーティング（Feature の Router）"
applyTo: "**/*.swift,**/Package.swift"
---

# 🧭 SwiftUI / フロントエンド — ルーティング（Feature の Router）

画面の配置と遷移の所有だけを持つ。状態とレイヤー間のフローは[データフロー](frontend-dataflow.instructions.md)。遷移の所有は Feature の Router に固定し、View から path 操作を除く。API は通常の `NavigationStack(path:)` のまま。

## Router の所有

- Presentation に Feature ごとの `@Observable` な Router を置き、現在どの画面が開いているか（`path`、`sheet`、`fullScreenCover`）を保持する。アプリ全体の巨大な Router を標準にしない。
- `NavigationPath` の変更と遷移先テーブル（`navigationDestination`）は Router とそれを binding する root View の責務。root View だけが `NavigationStack(path: $router.path)` を接続する。
- ViewModel は業務上の結果を作り、遷移が許可されたら Router のメソッドを呼ぶ。View に書いてよいのは「ユーザーが何をしたか」（`viewModel.nextButtonTapped()`）だけで、`path.append` を呼ばない。
- `pop`、`popToRoot`、sheet / fullScreenCover の表示と終了、戻れない場合の行き先も Router が所有する。View が `dismiss` だけで業務フローを組み立てない。

```swift
enum LoginRoute: Hashable { case home, forgotPassword }

@Observable
final class LoginRouter {
  var path = NavigationPath()
  var sheet: LoginSheet?
  func showHome() { path.append(LoginRoute.home) }
}
```

## 遷移パラメーター

- 巨大なモデルや前画面で取得した JSON を丸ごと渡さない。識別子など復元可能な値に留め、遷移先が UseCase 経由で本体を取得する。
- 不正な id で開かれることは到達可能な状態。パース失敗や存在しないレコードは、画面として成立する形に着地させる。

## ルートの配線

- 最初の `NavigationStack` の接続と Feature Router の構築は Composition Root（`App/`）または Feature の入口で閉じる。子 View の深い位置で `NavigationStack` を増殖させない。
- Feature をまたぐ遷移の接合点は Composition Root または明示的な境界 API に置く。Feature 内部の Router が別 Feature の具象 View を import しない。
