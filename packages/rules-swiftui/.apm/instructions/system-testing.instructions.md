---
description: "📱 SwiftUI — システムスイート（シミュレーターまたは実機を起動する XCUITest シナリオテスト）"
applyTo: "**/UITests/**,**/*UITests.swift,**/*UITest.swift"
---

# 📱 SwiftUI — システムスイート（XCUITest シナリオテスト）

UC ごとに主シナリオ 1 つのシナリオテストを XCUITest で書く。既定スイートは[共通テスト](common-testing.instructions.md)。シミュレーターの排他と実行時機は[テスト実行](common-test-execution.instructions.md)をこのターゲットにもそのまま適用する。テスト名とコメントは日本語。

## ターゲットと環境

- 別の UI テストターゲット（`<App>UITests`）、ソースは `UITests/` 配下。`traceconfig.json` の `tests.system.dirs`（`extensions: [".swift"]`）に宣言し、`tests.dirs` と重複させない。
- 全スイートは destination を固定した `xcodebuild test -only-testing:<App>UITests …`。`traceconfig.json` の `commands.system` に宣言する（遅すぎるなら CI のみとする）。UC 選択は `-only-testing:<App>UITests/UC012RegisterProjectTests`。
- 接続先はホストが `CLAUDE.md` に宣言するシナリオ環境（バックエンド、ベース URL を切り替える `launchArguments` / `launchEnvironment`、投入済みデータ、使い捨てアカウント）。producer が創作しない。宣言された stub サーバーは可、アプリ内モックは不可。

## シナリオの形

UC ごとに 1 テストクラス、1 テストメソッド、ともに UC ID で命名する。`// @scenario UC-nnn` を `func` の直上に置き、`@covers` は付けない。

```swift
final class UC012RegisterProjectTests: XCTestCase {
  // @scenario UC-012
  func test_UC012_案件を登録する() throws {
    throw XCTSkip("UC-012 配線待ち")  // pending マーカー。FE 配線で外す
    let app = XCUIApplication()
    app.launchArguments += ["-scenario"]
    app.launch()
    app.buttons["新規案件"].tap()
    app.textFields["createProject.title"].tap()
    app.typeText("案件A")
    app.buttons["保存"].tap()
    XCTAssertTrue(app.staticTexts["案件A"].waitForExistence(timeout: 5))
  }
}
```

- 各行は `UC.md` の `## 主シナリオ` の番号付きステップ、最後の検証は `成功時` の事後条件に対応する。シナリオが言っていないことはしない。
- pending マーカーは先頭の文の `throw XCTSkip("…")`。FE 配線の実装担当者がその行を削除して Green にする。
- `sleep` を使わず、次のステップに必要な要素で `waitForExistence(timeout:)` を使う。

## ロケーター（探索せず導出する）

| 順位 | クエリ | 導出元 |
| --- | --- | --- |
| 1 | `app.buttons["<label>"]`、`app.staticTexts["<text>"]`、`app.textFields["<label>"]` | 用語集の語（`docs/01-glossary.md`）そのもの。要素型はコントロールの種類から決める |
| 2 | `accessibilityIdentifier` による `app.buttons["<id>"]`、`app.otherElements["<id>"]` | 契約: operation → `"createProject"`、request フィールド → `"createProject.title"`（[表示レイヤー](frontend-coding.instructions.md)が出力する） |
| 禁止 | 要素の添字、座標、View / 画面の型名、表示文字列をコピーした識別子 | — |

外観が一致しなければ外観側を修正する（ADR-0037）。シナリオテストを実装に追従させない。

## 決定性

- 前回実行のアプリ状態はホストが宣言した手段（永続化をリセットする起動引数、実行ごとの使い捨てアカウント）で消す。
- アニメーション、sheet、キーボードは `waitForExistence` で最終状態を検証し、キーボードの下の要素はキーボードを閉じてからタップする。権限ダイアログは `addUIInterruptionMonitor` またはホストのシミュレーター設定で事前許可する。
