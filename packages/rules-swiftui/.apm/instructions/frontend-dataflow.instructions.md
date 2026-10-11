---
description: "🔀 SwiftUI / フロントエンド — 状態とデータフロー（Clean Architecture）"
applyTo: "**/*.swift,**/Package.swift"
---

# 🔀 SwiftUI / フロントエンド — 状態とデータフロー（Clean Architecture）

状態をどこに保持し、レイヤー間をどう流すかだけを持つ。表示側は[表示レイヤー](frontend-coding.instructions.md)、遷移は[ルーティング](frontend-routing.instructions.md)。SwiftUI / Observation が担うのは観測値の変化による再描画だけで、ユースケースの実行、通信、キャッシュ、永続化、スレッド境界、依存の組み立ては担わない。

## レイヤーと依存の向き

Presentation → Domain ← Data。依存は外側から内側へのみ向かう。

| レイヤー | 置けるもの | 知ってはならないもの |
| --- | --- | --- |
| **Presentation** | View / 薄い ViewModel / Router | `URLSession`、DTO、別 Feature の Data 実装 |
| **Domain** | Entity / UseCase / Repository の protocol | SwiftUI、`URLSession`、DTO、具象の通信処理 |
| **Data** | Repository の実装 / DTO / マッピング | View、ViewModel、Router |

- 流れは View → ViewModel → UseCase → Repository（protocol）→ 実装。UseCase は必須で、ViewModel から Repository を直接呼ばない。
- Repository は Domain の protocol と Data の実装に分ける。DTO と Entity の変換は Data 内で閉じ、DTO を Presentation に漏らさない。
- Domain の型に `import SwiftUI` や `URLSession` が必要ならレイヤー構成が崩れている。

## ViewModel と UseCase

- 画面のクライアント状態（入力中の値、読み込み表示、エラーメッセージ、選択）は、その画面の `@MainActor` `@Observable` な ViewModel が保持する。
- ViewModel がしてよいのは、画面状態の保持と更新、UseCase の呼び出しと結果の画面向け整形、遷移してよいことを Router に伝えること。`URLSession` やエンドポイントの組み立て、Entity をまたぐ業務規則の本体、永続化やキーチェーンの直接操作はしない。
- View は UseCase も Repository も知らない。知るのは ViewModel と、root の配線に必要な Router の binding だけ。`task` / `onAppear` / ボタンから `URLSession` や Repository 実装に触れない。再入、キャンセル、連打は ViewModel / UseCase 側の設計問題。
- UseCase は 1 つのアプリケーション操作を表し、Domain の語彙で入出力し、`init` で受け取るのは Repository protocol など Domain が許可する依存だけ。

```swift
protocol UserRepository: Sendable {
  func fetchUser(id: UserID) async throws -> User
}

struct FetchUserUseCase: Sendable {
  private let users: UserRepository
  init(users: UserRepository) { self.users = users }
  func execute(id: UserID) async throws -> User { try await users.fetchUser(id: id) }
}
```

## Composition Root

- 具象型（`UserRepositoryImpl` など）の構築と配線は `App/`（または Feature の factory）だけ。View / ViewModel / UseCase は protocol に依存し、init による注入で受け取る。
- service locator や `.shared` singleton から Domain / Data を取り出さない。UseCase や Repository を SwiftUI の `Environment` で配布しない（Environment に入れてよいのはテーマなど、起動後ほぼ変わらない表示上の関心事だけ）。

## 真実の置き場

| 種類 | 置き場所 |
| --- | --- |
| サーバー由来（サーバーが真実を持ち、こちらはコピーを見る） | UseCase 経由で取得する。画面に無期限でキャッシュするなら方針を明記する |
| 画面だけ（入力中の値、モーダルの開閉、選択） | ViewModel。本当に小さければ View の `@State` |

判断できなければ、誰が真実を保持するかを先に決める。サーバー由来の値を View の `@State` にコピーして画面の真実にしない（明示的な編集用コピーを開始する編集フォームは例外）。
