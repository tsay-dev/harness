---
description: "SwiftUI — プロジェクトの lint で止める項目の一覧"
applyTo: "**/.swiftlint.yml,**/.swiftlint.yaml,**/.swift-format,**/Package.swift,**/harness.config.json"
---

# SwiftUI — lint で止める項目

このスタックの規約のうち、lint（コンパイラーの検査を含む）で機械的に止められる決まりの一覧。ほかの規約はこれらを文章で繰り返さず、この一覧（`common-lint`）を指す。

- 止め方（使う道具、規則の名前、設定の書き方、モジュールの分け方）は利用プロジェクトが決める。`harness.config.json` の `rules` に、その設定のファイルと、確かめる `commands` のキーを書く。
- まだ止めていない項目は、止めるまで `harness.config.json` の `conventions` に、項目の文と止めていない理由を書く。
- 外部 API やシステムが存在を文書で保証する箇所のように、対象から外す箇所は、lint の設定の側に理由と一緒に書く。

| 止めること | 対象 |
| --- | --- |
| 強制アンラップの `!`、`try!`、`as!`、理由を書かない `fatalError` | 本番コード |
| Domain が `SwiftUI`、`URLSession`、別の Feature の Presentation / Data を読み込む | `Features/<Feature>/Domain/` |
| Feature が別の Feature の内部を読み込む | `Features/` |
| `root → feature → parts → ui` の逆向きの読み込みと、同じ階層どうしの読み込み | Presentation |
| 新しいコードで `Combine` を読み込む | 本番コード |
| `sleep` / `Task.sleep` で待つ | テスト |
| 要素の添字（`element(boundBy:)`）や座標によるロケーター | シナリオテスト（`UITests/`） |
