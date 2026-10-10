---
description: "📱 SwiftUI — システムスイート（シミュレーターまたは実機を起動する XCUITest シナリオテスト）"
applyTo: "**/UITests/**,**/*UITests.swift,**/*UITest.swift"
---

# 📱 SwiftUI — システムスイート（シミュレーターまたは実機を起動する XCUITest シナリオテスト）

> **適用範囲: SwiftUI を使うネイティブ iOS アプリ。** 該当しなければ破棄する。
>
> **シナリオテストとは何か、なぜ UC ごとに 1 本なのか、いつ実行するかは develop プロセスが定義する**
> （`docs.instructions.md` R-1106–R-1108、`references/playbook.md` の「テスト実行の粒度」）。この文書が保持するのは
> **それらの規則を XCUITest で成立させる配線**だけ: ターゲット、ロケーターの優先順位、pending マーカー、UC
> タグ、`@scenario` アノテーション。既定スイートの規則は [testing.md](common-testing.instructions.md)、**誰が、いつ
> シミュレーターを実行するか**は [test-execution.md](common-test-execution.instructions.md) で、このスイートにも適用する。
>
> **テスト名とコメントは日本語で書く。**

---

## 1. ターゲットとフォルダー

- **別の UI テストターゲットで XCUITest を使う**（`<App>UITests`）。ソースは `UITests/` 配下。ホストは `traceconfig.json` の `tests.system.dirs`（`extensions: [".swift"]`）にフォルダーを宣言し、ユニットターゲットのフォルダーである **`tests.dirs` と重複させない**。これにより C11 がシナリオテストを `@covers` のないテストとして扱わない。
- **1 コマンドでスイート全体を実行する**: destination を固定したホストの `xcodebuild test -only-testing:<App>UITests …` のコマンド。ホストが終端ゲートに含める場合は `commands.system` として宣言する（停止のたびにシミュレーターを起動すると遅すぎる場合が多い。その場合は CI のみとし、省略行に明記する）。**UC による選択**は `-only-testing:<App>UITests/UC012RegisterProjectTests`。UC ごとに 1 つのテストクラスを置き、UC ID で命名することで機械的に選択できる。
- テスト対象アプリは**ホストが `CLAUDE.md` に宣言するシナリオ環境**に接続する。使うバックエンド、ベース URL の切り替え方法（scheme、アプリの設定入口が読む `launchArguments` / `launchEnvironment`）、投入済みデータ、使い捨てアカウントを宣言する。producer が創作しない。宣言された stub サーバーは許可するが、アプリ内のモックは不可。それは外観の preview であり、シナリオではない。

---

## 2. シナリオテストの形

UC ごとに 1 テストクラス（`UC012RegisterProjectTests`）、**1 テストメソッド**とし、UC ID で命名する。`// @scenario UC-nnn` を `func` の直上の行に置く。

```swift
import XCTest

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

- 各行は `UC.md` の `## 主シナリオ` の番号付きステップに対応し、最後の検証は `成功時` の事後条件に対応する。シナリオが言っていないことはしない。
- **pending マーカーは先頭の文として置く `throw XCTSkip("…")`**。FE 配線の実装担当者がその行を削除し、テストを Green にする。
- シナリオテストに **`@covers` を付けない**。**`sleep` を使わない**。次のステップに必要な要素で `waitForExistence(timeout:)` を使う。

---

## 3. ロケーターの優先順位（探索せず導出する）

| 順位 | クエリ | 導出元 |
| --- | --- | --- |
| 1 | `app.buttons["<label>"]`、`app.staticTexts["<text>"]`、`app.textFields["<label>"]` | **用語集の語**（`docs/01-glossary.md`）。同義語ではなく語そのもの。要素型はコントロールの種類から決める |
| 2 | `accessibilityIdentifier` による `app.otherElements["<id>"]`、`app.buttons["<id>"]` | **契約**: operation `createProject` を発火するコントロール → `.accessibilityIdentifier("createProject")`、その request フィールド `title` → `"createProject.title"`（[frontend/coding.md](frontend-coding.instructions.md) §6 が出力する） |
| 禁止 | 要素の添字、座標、View / 画面の型名、表示文字列をコピーした識別子 | — |

**外観が一致しなければ外観側を修正する**（ADR-0037）。シナリオテストを実装に追従させる編集はしない。

---

## 4. シミュレーターは排他資源

[test-execution.md](common-test-execution.instructions.md) をこのターゲットにもそのまま適用する: 並行区間では `xcodebuild test` を実行しない（UC タグを未実行として報告）、作成直後の選択的な Red / pending 確認は許可、destination は 1 つに固定、`xcodebuild` は同時に 1 つ、修正ラウンドは選択実行（`-only-testing:` で UC クラスを指定）、全体は境界でのみ実行する。

---

## 5. 実機上でも決定的にする

| 揺らぎの原因 | 対処 |
| --- | --- |
| 前回実行のアプリ状態 | ローカルの永続化をリセットする、アプリが対応した起動引数、または実行ごとの使い捨てアカウント。ホストが宣言する |
| アニメーション、sheet、キーボード | `waitForExistence` で最終状態を検証する。アニメーションを待たない。キーボードの下にあるものをタップする前にキーボードを閉じる |
| 権限ダイアログ | `addUIInterruptionMonitor` またはホストのシミュレーター設定による事前許可 |
| シナリオバックエンドへのネットワーク | ホストが宣言したバックエンド。遅延は `waitForExistence` で吸収し、`sleep` は使わない |

---

## ✅ 返却前チェックリスト

- [ ] UC に対して正確に 1 テストクラス、1 メソッドがあり、両方を `UCnnn` で命名し、メソッドの直上に `// @scenario UC-nnn`、pending マーカーに `throw XCTSkip` を使っているか？
- [ ] 各ステップは `## 主シナリオ` の番号付きステップで、最後の検証は `成功時` か？
- [ ] クエリは順位 1（用語集の語）または順位 2（`accessibilityIdentifier` としての operation / `operation.field`）だけか？
- [ ] UI テストターゲットのフォルダーが `tests.system.dirs` にあり、`tests.dirs` と重複していないか？
- [ ] このクラスだけ（`-only-testing:`）を実行したか、または並行区間がシミュレーターを占有するため未実行と報告したか？ `trace-check --only C15` を実行したか？
