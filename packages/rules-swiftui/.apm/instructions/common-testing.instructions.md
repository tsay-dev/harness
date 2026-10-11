---
description: "🧪 SwiftUI — 共通のテスト規則（全レイヤー）"
applyTo: "**/*Tests.swift,**/*Test.swift,**/*Tests/**,**/*Spec.swift"
---

# 🧪 SwiftUI — 共通のテスト規則（全レイヤー）

develop のテスト原則を SwiftUI iOS に接続する配線だけを持つ。View のユニットテストの葉はなく、develop は FE ユニットテストを作らない。シナリオ（XCUITest）は[システムスイート](system-testing.instructions.md)、実行の時機と排他は[テスト実行](common-test-execution.instructions.md)。テスト名とコメントは日本語。

## ランナー

- harness はランナーを固定しない（XCTest / Swift Testing）。選択と設定、既定スイート全体を 1 コマンドで実行し終了コードで Red / Green を読めるコマンド、UC による選択コマンドをホストの `CLAUDE.md` に記録する。
- ランナー未導入なら、導入が開始のゲート。

## 操作 → 入口（実装を読まずに導出）

`test-author` と `implementer` はそれぞれ `contract.yaml` と下表から入口を導出し、互いからは導出しない。実装が入口を別の場所に置いたなら実装を移す（R-801）。

| 契約（`contract.yaml`） | テストが構築する型 | 呼ぶ入口 |
| --- | --- | --- |
| `transport: http` / `sdk` / `local-store` / `device`（outbound）、operation `fetchUser` | Domain の `<Operation>UseCase`（`FetchUserUseCase`）。Repository protocol の fake で構築する | `examples.*.request` の引数で `execute(...)`。fake は `examples.*.response` を返すか `errors[].code` を throw する |
| `transport: deeplink` / `push`（inbound）、operation `openItem` | 同じ `<Operation>UseCase`（`OpenItemUseCase`）。Router / app delegate は転送だけ | デコード済みペイロードで `execute(...)`。ペイロードのデコードは Data で別途検証する |
| ホストの `commands.contract_adapter`（`traceconfig.json`）経由 | なし。operation 名と例でアダプターを同一プロセス内で駆動し、実装シンボルをテストに出さない | — |

## 注釈

- 最外側のグループ名は `UC-012 <UC title>`（`docs/goals/` の UC ディレクトリ名と同じキー）。Swift Testing は `@Suite("UC-012 …")`、XCTest は最外側のクラス名または名前に `UC-012` を含める。タグなしの新規テストを作らない。
- 各テスト本体の先頭行に `// @covers REQ-045#class` を正確に 1 つ置く（`trace-check` C10 / C11 が読む。クラスは先に REQ の `## 検証方針` で宣言する）。

```swift
@Test("UC-012 ログイン — 成功するとセッションが立つ")
func loginSucceeds() async throws {
  // @covers REQ-045#accept-standard
  let useCase = LoginUseCase(users: FakeUserRepository(result: .success(sampleUser)))
  try await useCase.execute(email: "a@b.c", password: "secret")
}
```

## 対象と決定性

- 機械 oracle の主戦場は UseCase（Repository protocol の fake を注入）。次に薄い ViewModel（fake の UseCase を注入し、画面状態と Router の呼び出しを spy で観測）。View のスナップショットは作らない。
- モックは境界だけ（Repository、時計、乱数）。Domain Entity をモックしない。既定スイートで `URLSession` 実装を実ネットワークにつながず、HTTP を試すなら fake の `URLProtocol` で閉じる。
- 実時間の `sleep` / `Task.sleep` で待たない。アニメーション完了を待たず、検証対象にしない。ViewModel のテストはテスト関数側でも `@MainActor` を揃える。
- テストは順序に依存しない。共有可変グローバルや singleton を変えたら元に戻す。`.shared` に依存するテストは設計の崩れの兆候。
- 修正ラウンドでは選択実行、全件は完了条件と CI だけ。

## スイートの分離（実行に必要なもので分ける）

| スイート | 基準 | 配置（既定例） |
| --- | --- | --- |
| 既定 | テスト自体がシミュレーター、実機、実 API を起動しない（ランナーが destination を要求する構成は許容） | 対象と対応する `Tests/` など |
| 統合 | 実 API または実サービスに接続する | `Tests/Integration/` |
| システム | シミュレーターまたは実機を起動する XCUITest。シナリオテストだけを置く | `UITests/`（別テストターゲット） |

- フォルダーまたは別テストターゲットで分け、統合とシステムを既定スイートの探索対象から除外する。シミュレーターもサーバーもないマシンで既定スイートが Green であること。
- 外部環境を起動しない UseCase / 契約適合テストは既定スイートに置く。統合や `UITests/` に移さない。
