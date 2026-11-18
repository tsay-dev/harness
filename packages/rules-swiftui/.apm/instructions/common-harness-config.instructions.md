---
description: "🔗 SwiftUI — harness.config.json のスタックの値（ひな形からの差分）"
applyTo: "**/harness.config.json"
---

# 🔗 SwiftUI — harness.config.json のスタックの値

SwiftUI の iOS アプリで、harness のひな形 `harness.config.json` から変える値だけを示す。示さないキーはひな形のまま、示した値は丸ごと置き換える。キーの意味、宣言の必須、`none`、義務は trace-check の README、`entry`・`coverage`・`commands.list_entries` は exec-check の README が正本。パスは[共通のコーディング規則](common-coding.instructions.md)の Feature-first の配置とテストの既定例で、利用先の `CLAUDE.md` の配置に合わせて書き換える。正規表現は `u` フラグでコンパイルされる（日本語を含む名前は `[\\p{L}\\p{N}_]`）。

```json
{
  "source": {
    "dirs": ["App", "Features", "Shared/**"],
    "extensions": [".swift"]
  },
  "commands": { "list_entries": { "none": "受信する操作（deeplink / push）が契約に無い" } },
  "tests": {
    "dirs": ["Tests"],
    "extensions": [".swift"],
    "test_pattern": "^\\s*(?:@Test\\b.*?\\bfunc\\s+([\\p{L}\\p{N}_]+)|(?:@\\w+\\s+)*func\\s+(test[\\p{L}\\p{N}_]*)\\s*\\()",
    "pending_pattern": "\\bXCTSkip(?:If|Unless)?\\(|\\.disabled\\b",
    "covers_placement": "after",
    "system": {
      "dirs": ["UITests"],
      "extensions": [".swift"],
      "test_pattern": "^\\s*(?:@\\w+\\s+)*func\\s+(test[\\p{L}\\p{N}_]*)\\s*\\(",
      "pending_pattern": "\\bXCTSkip(?:If|Unless)?\\("
    }
  },
  "schema": { "none": "DB の制約で守る規則を持たない（端末の永続化は Data の実装）" },
  "contract": {
    "error_source": "Shared/APIErrorCode.swift",
    "error_code_pattern": "\\bcase\\s+\\w+\\s*=\\s*\"([A-Z][A-Z0-9_]*)\""
  }
}
```

- `commands` の例は `list_entries` だけを示す（ほかのキーはひな形に続けて書く）。アプリが呼ぶ側の操作（outbound）しか契約に無い間は none でよい。deeplink / push を inbound の操作に持つ契約を fixed にすると、none は通らない。そのときは、受信を登録している 1 か所（URL の対応表、通知の種別の enum）から `{"kind":"deeplink","name":"<契約の entry>"}` / `{"kind":"push","name":"<契約の entry>"}` を 1 行ずつ出すコマンドにする。
- 実行の記録（`coverage`）は、`xcodebuild` の計測結果を lcov（関数ごとの `FN` / `FNDA` を含む）に変換して書き出す。確かめる範囲は Domain の `<Operation>UseCase`（[共通のテスト規則](common-testing.instructions.md)の主戦場。`coverage.scope` に `Features/*/Domain/**`）。Presentation は UI テストで確かめるので、範囲の外に置く。
- テストの印は XCTest の `func test…(` と、Swift Testing の `@Test … func …(`（属性と `func` を 1 行に書く）。`@covers` は本体の先頭行に置くので `after`。
- 保留は `XCTSkip` と Swift Testing の `.disabled`。本体の `throw XCTSkip` はテストの窓の外なので、そのファイルの全テストが保留とみなされる。
- 共有エラーコードは `String` の raw value を持つ enum（`case notFound = "NOT_FOUND"`）に 1 か所でまとめる例。
- `layering` は削除する。単一モジュールのアプリでは層の間に import が無く、C6 は何も検出しない。方向は Feature の Domain が SwiftUI と Data を知らないこと（共通のコーディング規則）で保つ。
- `commands` は[テスト実行](common-test-execution.instructions.md)と[システムスイート](system-testing.instructions.md)が定める destination 固定の `xcodebuild` に置き換える。
