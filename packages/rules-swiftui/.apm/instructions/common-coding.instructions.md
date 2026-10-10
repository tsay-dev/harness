---
description: "📐 SwiftUI — 共通のコーディング規則（全レイヤー）"
applyTo: "**/*.swift,**/Package.swift"
---

# 📐 SwiftUI — 共通のコーディング規則（全レイヤー）

> **適用範囲: SwiftUI を使うネイティブ iOS アプリ。**
> この文書は拡張子を条件に読み込まれるため、サーバー側の Swift や SwiftUI 以外のターゲットにも注入されることがある。
> **対象が SwiftUI の iOS アプリでなければ、この文書は適用対象外として破棄する。**
>
> この文書が保持するのは、**レイヤーをまたいで共通する事項**だけ。
> SwiftUI の表示側の差分は [frontend/coding.md](frontend-coding.instructions.md)、状態とレイヤー構成は
> [frontend/dataflow.md](frontend-dataflow.instructions.md)、画面遷移は
> [frontend/routing.md](frontend-routing.instructions.md)、粒度と分業は
> [frontend/components.md](frontend-components.instructions.md) にある。テストの配線は
> [testing.md](common-testing.instructions.md)、テストの実行時機は
> [test-execution.md](common-test-execution.instructions.md) にある。
> **共通規則をレイヤー別の末端文書にコピーしない**（唯一の正本はこの一か所）。
>
> **コメントとユーザー向けの文言は日本語で書く。**

---

## 0. 書式はこの文書ではなくツールが決める

インデント、改行、import の順序、空白の正本は**プロジェクトの format / lint コマンド**であり、
この文書では一切定義しない。手作業で列を揃えない。**返却前に format コマンドを実行する。**

規則が衝突したらツールの出力を優先する（人間が見るのもその出力だけ）。

---

## 1. Green にするために型や失敗を弱めない

**「コンパイルを通すため」に強制アンラップ（`!`）、`try!`、`as!`、理由のない `fatalError` を書かない。**

それが必要になるのは、**型か契約のどちらかが間違っている**という兆候。
黙って押し潰すと、誤った前提の上に後続の作業が積み上がり、実行時に別の場所へ着地する。

```swift
// ❌ NG: 失敗しうる値を成功前提に押し潰している
let user = try! await repository.fetchUser(id: id)
let id = Int(rawId)!

// ✅ OK: 失敗を型で運び、呼び出し側で扱う
let user = try await repository.fetchUser(id: id)
guard let id = Int(rawId) else { /* 到達可能な不正入力として扱う */ return }
```

**何かを押し潰したくなったら実装を止め、「何と何が衝突しているか」を報告する**（各実装担当者の出力契約に従う）。
辻褄を合わせるために契約を自分で書き換えない。

唯一の例外は、**外部 API またはシステムが「これは必ず存在する」と保証を文書化している場合**であり、理由をコメントに残す。
IB 境界での `@IBOutlet` の慣例など、フレームワークが要求する箇所はそれに従う。

---

## 2. モジュールと配置（Feature-first）

コードの配置は **Feature-first**。トップ階層にレイヤー名を置かない。

```
App/                         # 起動、Composition Root、ルートの配線のみ
Shared/                      # 複数の Feature が実際に使うものだけ
Features/
  Login/
    Presentation/            # View / ViewModel / Router
    Domain/                  # Entity / UseCase / Repository の protocol
    Data/                    # Repository の実装 / DTO / URLSession の利用
```

### `App/` に置けるもの

- アプリのエントリーポイント（`@main`）
- **Composition Root**（具象型の構築と配線。詳細は [dataflow.md](frontend-dataflow.instructions.md)）
- ルートの `NavigationStack` の接続（詳細は [routing.md](frontend-routing.instructions.md)）

業務ロジック、画面、Repository の実装を `App/` に流出させない。

### `Shared/` に昇格させる条件

**現時点で 2 つ以上の Feature が使うものだけ**昇格させる。
「後で使うかもしれない」で昇格させない。1 つの Feature だけが使う型はその Feature 配下に置く。

`Shared/` が Domain の寄せ集めになった瞬間に、Feature-first の局所性は失われる。

### 依存の向き（配置にかかわらず共通）

- Feature の Domain は SwiftUI、`URLSession`、別の Feature の Presentation / Data を知らない
- Feature 同士は互いの内部を import して依存しない
  （共有が必要なら、実際に共有する型だけを `Shared/` に抽出する。それでも収まらない結合は設計上の問題として報告する）

---

## 3. 並行処理: `async/await` のみ、UI 状態は Main 上

**新規コードに Combine を増やさない**（`PassthroughSubject`、`AnyPublisher` など）。
非同期処理は `async` / `await` / `Task` で書く。

**画面状態を保持する ViewModel に `@MainActor` を付ける。**
これにより UI に触れる値の更新をメインスレッドに固定し、View からの呼び出しと更新の競合を型レベルで防ぐ。

```swift
@MainActor
@Observable
final class LoginViewModel {
  var isLoading = false
  // ...
}
```

- 重い処理や通信の本体は ViewModel に書かず、UseCase / Repository に下ろす（[dataflow.md](frontend-dataflow.instructions.md)）
- UseCase / Repository に無差別に `@MainActor` を付けない（メインを占有し、画面が固まる）
- View の `body` から同期的にブロッキング I/O や重い計算をしない

既存コードに Combine が残っていても、**新しい経路は `async/await` にする。**
規模上、移行方針が必要なら、そのプロジェクトの `CLAUDE.md` または ADR に書く。

---

## 4. ソースやクライアントに秘密情報を埋め込まない

配布されるバイナリから取り出せる場所に秘密情報を置かない。

- API のベース URL、機能フラグ、公開鍵 → クライアントに置いてよい
- API の秘密情報、署名鍵、管理者トークン → **置いてはならない**

xcconfig、Info.plist、ソースのリテラルのどれであっても、クライアントに焼き込まれた値は秘密ではない。
秘密情報を必要とする処理が必要になったら、その処理はクライアントに置けない。
**実装を止めて報告する**（サーバー側の設計を自分で決めない）。

---

## 5. 依存追加の境界

**Swift Package または CocoaPods / SPM のプロダクト依存を独断で追加しない。**

追加はビルド、レビュー、解決済みのバージョンに影響する。
コンパイル成功は依存追加の承認ではない。

依存追加が必要になったら、**何を、なぜ追加したいかを報告して止まる。**
既にプロジェクトにある依存の利用は制限しない。

通信の標準は **`URLSession` + `async/await`**（[dataflow.md](frontend-dataflow.instructions.md)）。
別のクライアントを標準とするプロジェクトは、そのプロジェクトの `CLAUDE.md` に宣言する。

---

## ✅ 返却前チェックリスト

- [ ] lint / format コマンドを実行したか？
- [ ] Green にするために `!` / `try!` / `as!` を追加していないか？
- [ ] 新規コードに Combine を増やしていないか？
- [ ] UI 状態を保持する ViewModel に `@MainActor` が付いているか？
- [ ] 1 つの Feature だけが使う型を `Shared/` に昇格させていないか？
- [ ] 秘密情報かもしれない値をクライアント成果物に埋め込んでいないか？
- [ ] 許可なく新しい外部依存を追加していないか？
