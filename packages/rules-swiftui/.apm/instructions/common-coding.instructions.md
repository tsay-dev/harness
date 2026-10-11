---
description: "📐 SwiftUI — 共通のコーディング規則（全レイヤー）"
applyTo: "**/*.swift,**/Package.swift"
---

# 📐 SwiftUI — 共通のコーディング規則（全レイヤー）

SwiftUI を使うネイティブ iOS アプリに適用する。拡張子で読み込まれるため、サーバー側 Swift や SwiftUI 以外のターゲットでは破棄する。レイヤーをまたぐ共通事項だけを持ち、層別の葉（[表示](frontend-coding.instructions.md)、[データフロー](frontend-dataflow.instructions.md)、[遷移](frontend-routing.instructions.md)、[粒度と分業](frontend-components.instructions.md)）は差分だけを持つ。コメントとユーザー向け文言は日本語。

## 書式と型

- 書式の正本はプロジェクトの format / lint コマンド。返却前に実行し、衝突したらツールの出力を優先する。
- Green にするために `!`、`try!`、`as!`、理由のない `fatalError` を書かない。必要に見えたら型か契約の衝突なので、実装を止めて何と何が衝突しているかを報告し、契約を自分で書き換えない。例外は外部 API / システムが存在を文書で保証する場合だけで、理由をコメントに残す。

## 配置（Feature-first）

```
App/        # @main、Composition Root、ルートの NavigationStack の接続だけ
Shared/     # 現時点で 2 つ以上の Feature が使うものだけ
Features/<Feature>/{Presentation,Domain,Data}/
```

- `App/` に業務ロジック、画面、Repository 実装を置かない。
- 1 つの Feature だけが使う型はその Feature 配下。「後で使うかも」で `Shared/` に昇格させない。
- Feature の Domain は SwiftUI、`URLSession`、別 Feature の Presentation / Data を知らない。Feature 同士は互いの内部を import しない。`Shared/` への抽出でも収まらない結合は設計上の問題として報告する。

## 並行処理

- 新規コードに Combine を増やさない。非同期は `async/await` / `Task`。既存 Combine の移行方針が必要ならホストの `CLAUDE.md` または ADR に書く。
- 画面状態を保持する ViewModel に `@MainActor` を付ける。UseCase / Repository には無差別に付けない。

## 秘密情報と依存

- クライアント成果物（xcconfig、Info.plist、ソース）に焼き込まれた値は秘密ではない。API のベース URL、機能フラグ、公開鍵は置けるが、API の秘密情報、署名鍵、管理者トークンは置けない。秘密情報を要する処理が必要になったら実装を止めて報告し、サーバー側の設計を自分で決めない。
- SPM / CocoaPods の依存を独断で追加しない。必要なら何を、なぜ追加したいかを報告して止まる。既存の依存の利用は制限しない。
- 通信の標準は `URLSession` + `async/await`。別のクライアントを標準とするプロジェクトは `CLAUDE.md` に宣言する。
