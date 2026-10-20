---
description: "🔗 SwiftUI — traceconfig.json のスタックの値（ひな形からの差分）"
applyTo: "**/traceconfig.json"
---

# 🔗 SwiftUI — traceconfig.json のスタックの値

SwiftUI の iOS アプリで、harness のひな形 `traceconfig.json` から変える値だけを示す。示さないキーはひな形のまま、示した値は丸ごと置き換える。キーの意味、宣言の必須、`none`、義務は trace-check の README が正本。パスは[共通のコーディング規則](common-coding.instructions.md)の Feature-first の配置とテストの既定例で、利用先の `CLAUDE.md` の配置に合わせて書き換える。正規表現は `u` フラグでコンパイルされる（日本語を含む名前は `[\\p{L}\\p{N}_]`）。

```json
{
  "source": {
    "dirs": ["App", "Features", "Shared/**"],
    "extensions": [".swift"],
    "unit_dirs": ["Features/*/Domain/**"],
    "support_dirs": ["App/**", "Shared/**", "Features/*/Presentation/**", "Features/*/Data/**"],
    "unit_pattern": "^\\s*(?:(?:public|internal|package)\\s+)?(?:final\\s+)?(?:struct|class|actor)\\s+(\\w+UseCase)\\b",
    "entry_pattern": { "none": "受信する owned の操作（deeplink / push）が無い" }
  },
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
  "schema": { "none": "DB 制約で強制する規則を持たない（端末の永続化は Data の実装）" },
  "contract": {
    "error_source": "Shared/APIErrorCode.swift",
    "error_code_pattern": "\\bcase\\s+\\w+\\s*=\\s*\"([A-Z][A-Z0-9_]*)\""
  }
}
```

- 実現単位は Domain の `<Operation>UseCase` 型（[共通のテスト規則](common-testing.instructions.md)の主戦場）。`unit_pattern` は UseCase だけに一致させ、同じ Domain の Entity と Repository protocol は単位に数えない。Presentation、Data、App、Shared は技術部品。
- deeplink / push を owned の inbound 操作として固定すると `entry_pattern` の none は通らない。そのときは受信を転送する先の `<Operation>UseCase` の型宣言に一致する正規表現を宣言し、その窓に `@operation` を書く。
- テストの印は XCTest の `func test…(` と、Swift Testing の `@Test … func …(`（属性と `func` を 1 行に書く）。`@covers` は本体の先頭行に置くので `after`。
- 保留は `XCTSkip` と Swift Testing の `.disabled`。本体の `throw XCTSkip` はテストの窓の外なので、そのファイルの全テストが保留とみなされる。
- 共有エラーコードは `String` の raw value を持つ enum（`case notFound = "NOT_FOUND"`）に 1 か所でまとめる例。
- `layering` は削除する。単一モジュールのアプリでは層の間に import が無く、C6 は何も検出しない。方向は Feature の Domain が SwiftUI と Data を知らないこと（共通のコーディング規則）で保つ。
- `commands` は[テスト実行](common-test-execution.instructions.md)と[システムスイート](system-testing.instructions.md)が定める destination 固定の `xcodebuild` に置き換える。
