---
description: "🧱 SwiftUI / フロントエンド — View の粒度と分業"
applyTo: "**/*.swift,**/Package.swift"
---

# 🧱 SwiftUI / フロントエンド — View の粒度と分業

複数の View をどう分割し、誰がどの部分を書くかだけを持つ。Feature-first のフォルダー規約は[共通規則](common-coding.instructions.md)、レイヤー間のフローは[データフロー](frontend-dataflow.instructions.md)、root の配線は[ルーティング](frontend-routing.instructions.md)。

## レイヤー = 責務、配置 = 共有範囲

| レイヤー | 責務 | 例 |
| --- | --- | --- |
| **ui**（atoms） | 外観の最小単位。業務も UseCase も知らない | `PrimaryButton` `Avatar` `FormTextField` |
| **parts**（molecules） | ui のまとまり。局所的な UI 状態は持つが業務は知らない | `SearchBar` `EmptyState` `ErrorBanner` |
| **feature**（organisms） | 業務を知る。ViewModel / Router に触れてよい | `LoginFormView` `UserListView` |
| **root**（配線） | Feature の入口。`NavigationStack` の接続と依存の受け渡しだけ | `LoginRootView` |

- 再利用可能なコンポーネントは業務ドメインを知らない。引数もそのレイヤーの語彙で命名する。
- 実際の利用範囲を覆う最小の場所に置く。2 か所目が現れた時点で切り出し、配置を引き上げる。書き始める前に既存のものを探し、同じ外観を別々に定義しない。
- harness はディレクトリ名を固定しない（`Presentation/UI` か平らかはホストの `CLAUDE.md`）。分離自体と Shared への昇格条件は固定する。
- 依存は `root → feature → parts → ui` の一方向。下位は上位を import せず、同レベル同士も import しない。子から親への通知は親が渡したクロージャで行う。`ui` / `parts` から Domain の実装や Data に触れない。

## UI 実装担当者とロジック実装担当者の境界（develop の要件）

外観は人間の目、ロジックは機械テストと oracle が異なるため、別コンテキストの実装担当者が扱う。root = 配線、presentational = 表示を構造として分け、画面の外観の本体は root の下の View に置く。

| 実装担当者 | 書くもの | 書かないもの |
| --- | --- | --- |
| **UI 実装担当者** | presentational View（渡された値とクロージャで表示が決まる）とスタイリング。データは契約に適合する固定モックとして引数に流れ込み、Preview も fake DI | UseCase / Repository / `URLSession` の import |
| **ロジック実装担当者** | ViewModel / Router / UseCase の接続、root の配線、Domain / Data。既存 View の引数に写像する | 見た目の構造やスタイリングの作り直し |

- View の入力（initializer の引数、渡すモデル型）は UI 側が定義し、ロジック側がそこに写像する。ロジック側は View を自分に都合のよい引数に書き換えない。
- どちらかが不足を見つけたら、その側は実装を止めて報告する（各実装担当者の出力契約に従う）。
- loading / empty / error / no-permission / boundary（長文、0 行、巨大な数）は表示側から見て入力として表す。`ui` / `parts` は値とクロージャだけで閉じ、`feature` は ViewModel を保持してよいが UseCase を知らない形を保つ。
- リストの行 View は `ui` / `parts` に置き、行の中で UseCase を起動しない。データは親の feature / ViewModel が揃えてから渡す。

## 見た目のトークン

- 色、余白、角丸、字間はプロジェクト共通の入口に置き、同じスタイル定義を 2 つの View に書かない。
- 再利用可能な `ui` コンポーネントは外側の余白を持たない。外側の余白は親が決める。
