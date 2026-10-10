---
description: "🔀 SwiftUI / フロントエンド — 状態とデータフロー（Clean Architecture）"
applyTo: "**/*.swift,**/Package.swift"
---

# 🔀 SwiftUI / フロントエンド — 状態とデータフロー（Clean Architecture）

> **適用範囲: SwiftUI を使うネイティブ iOS アプリ。** 該当しなければ破棄する。
>
> 共通の表記規則は [common/coding.md](common-coding.instructions.md)、表示側の規則は [coding.md](frontend-coding.instructions.md)、
> 画面の配置と遷移は [routing.md](frontend-routing.instructions.md)、粒度と分業は [components.md](frontend-components.instructions.md)。
> この文書は**状態をどこに保持し、レイヤー間をどう流すか**だけを定義する。
>
> **コメントとユーザー向けの文言は日本語で書く。**

---

## 0. 目的の定義（SwiftUI が支援すること、しないこと）

SwiftUI / Observation が保証に近い形で提供するのは、次のこと:

1. 観測している値が変わると View が更新される
2. データフローは、そのように設計しなければ自動的に一方向にはならない

**ユースケースの実行、通信、キャッシュ方針、永続化、スレッド境界、依存の組み立ては SwiftUI の担当範囲外。**

そこが空白なので、実装は自然に View の `task` / `onAppear` に `URLSession` を書き、
`@Observable` クラスに業務と通信の両方を詰め込む。その実装はデモでは**正しく動く**。
連打、接続不良、画面の生存、テストでの差し替え、つまり検証が届かない場所で壊れる。

**この文書の役目は、その詰め込みを禁止し、レイヤーと配置を定めること。**

---

## 1. レイヤーと依存の向き（必須）

Feature 内のレイヤーは次のとおり。**依存は外側から内側へのみ向かう**（Presentation → Domain ← Data）。

| レイヤー | 置けるもの | 知ってはならないもの |
| --- | --- | --- |
| **Presentation** | View / 薄い ViewModel / Router | `URLSession`、DTO、別の Feature の Data 実装 |
| **Domain** | Entity / UseCase / Repository の **protocol** | SwiftUI、`URLSession`、DTO、具象の通信処理 |
| **Data** | Repository の**実装** / DTO / マッピング | View、ViewModel、Router |

```
View ──呼び出し──▶ ViewModel ──呼び出し──▶ UseCase ──依存──▶ Repository (protocol)
                                                        ▲
                                                        │ 実装
                                                RepositoryImpl (Data, URLSession)
```

- **UseCase は必須。** ViewModel から Repository を直接呼ばない
- **Repository は Domain の protocol と Data の実装に分ける。** Domain に具象型だけを置かない
- Domain の型に `import SwiftUI` や `URLSession` が必要なら、レイヤー構成が崩れている

---

## 2. ViewModel は薄く、`@Observable` + `@MainActor`

画面のクライアント状態（入力中の値、読み込み表示、エラーメッセージ、選択）は、
**その画面の ViewModel** が保持する。

```swift
@MainActor
@Observable
final class LoginViewModel {
  var email = ""
  var password = ""
  var isLoading = false
  var errorMessage: String?

  private let loginUseCase: LoginUseCase
  private let router: LoginRouter

  init(loginUseCase: LoginUseCase, router: LoginRouter) {
    self.loginUseCase = loginUseCase
    self.router = router
  }

  func loginButtonTapped() async {
    isLoading = true
    defer { isLoading = false }
    do {
      try await loginUseCase.execute(email: email, password: password)
      router.showHome()
    } catch {
      errorMessage = "ログインに失敗しました"
    }
  }
}
```

ViewModel がしてよいこと:

- 画面状態の保持と更新
- UseCase の呼び出しと、結果の画面向け整形（表示メッセージなど）
- 遷移してよいことを Router に伝える

ViewModel がしてはならないこと:

- `URLSession` の利用やエンドポイントの組み立て
- Entity をまたぐ業務規則の本体（UseCase の責務）
- 永続化やキーチェーンの直接操作（Data 側の責務へ下ろす）

**View は UseCase も Repository も知らない。** 知るのは ViewModel（と、ルートの配線に必要な Router の binding）だけ。

---

## 3. UseCase と Repository

### UseCase

- 1 つのアプリケーション操作（「ログインする」「明細を取得する」）を表す
- Domain の語彙で入力を受け、出力を返す（画面の文言や View の都合を持ち込まない）
- `init` で受け取るのは Repository protocol など、Domain が許可する依存だけ

### Repository

- protocol は Domain に置く
- 実装は Data に置く。**通信の標準は `URLSession` + `async/await`**
- 外部 JSON / DTO と Domain Entity の変換は Data 内で閉じる（DTO を Presentation に漏らさない）

```swift
// Domain レイヤー
protocol UserRepository: Sendable {
  func fetchUser(id: UserID) async throws -> User
}

struct FetchUserUseCase: Sendable {
  private let users: UserRepository
  init(users: UserRepository) { self.users = users }
  func execute(id: UserID) async throws -> User {
    try await users.fetchUser(id: id)
  }
}

// Data レイヤー
struct UserRepositoryImpl: UserRepository {
  private let session: URLSession
  private let baseURL: URL
  // デコード → Entity へマッピング
}
```

---

## 4. 具象型を知るのは Composition Root だけ

**具象型（`UserRepositoryImpl` など）の構築と配線は `App/`**（または Feature の factory）**だけで行う。**
View / ViewModel / UseCase は protocol または抽象に依存し、**init による注入**で受け取る。

- service locator や `.shared` singleton から Domain / Data を取り出さない
- UseCase や Repository を SwiftUI の `Environment` に入れて、Domain レベルのものを配布しない
  （Environment に入れてよいのは、テーマなど、起動後ほぼ変わらない表示上の関心事に限る）

差し替えられない具象型との結合は、テスト不能と「画面から通信まで一直線」への逆戻りを意味する。

---

## 5. View から通信しない

```swift
// ❌ NG: View が Data の仕事をしている
.task {
  let (data, _) = try await URLSession.shared.data(from: url)
  users = decode(data)
}

// ✅ OK: View は意図だけを渡す
.task { await viewModel.onAppear() }
```

`task` / `onAppear` / ボタンから `URLSession` や Repository の実装に直接触れない。
再入、キャンセル、連打は ViewModel / UseCase 側の設計問題として扱う。

---

## 6. サーバー由来の値と画面だけの値

| 種類 | 定義 | 置き場所 |
| --- | --- | --- |
| **サーバー由来** | サーバーが真実を保持し、こちらはコピーを見る値 | UseCase 経由で取得する。画面に無期限でキャッシュするなら方針を明記する |
| **画面だけ** | 入力中の値、モーダルの開閉、選択など、サーバーが知らない値 | ViewModel（本当に小さければ View の `@State`） |

判断できなければ、**誰が真実を保持するかを先に決める。**
サーバー由来の値を View の `@State` にコピーして「画面の真実」にしない
（編集フォームのように、明示的な編集用コピーを開始する場合は例外）。

---

## ✅ 返却前チェックリスト

- [ ] View → ViewModel → UseCase → Repository（protocol）→ 実装の流れになっているか？
- [ ] UseCase を飛ばして ViewModel から Repository を呼んでいないか？
- [ ] Domain が SwiftUI / `URLSession` / DTO を import していないか？
- [ ] ViewModel は `@Observable` + `@MainActor` で薄く保たれているか？
- [ ] 具象型の構築が Composition Root の外に漏れていないか？
- [ ] View から `URLSession` や Repository の実装を直接呼んでいないか？
- [ ] DTO が Presentation に漏れていないか？
