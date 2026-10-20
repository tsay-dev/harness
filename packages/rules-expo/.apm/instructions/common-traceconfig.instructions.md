---
description: "🔗 Expo — traceconfig.json のスタックの値（ひな形からの差分）"
applyTo: "**/traceconfig.json"
---

# Expo — traceconfig.json のスタックの値

Expo（expo-router）のアプリで、harness のひな形 `traceconfig.json` から変える値だけを示す。示さないキーはひな形のまま、示した値は丸ごと置き換える。キーの意味、宣言の必須、`none`、義務は trace-check の README が正本。パスは `app/`（ルート）と `src/`（それ以外）に分ける配置の例で、利用先の `CLAUDE.md` の配置に合わせて書き換える。正規表現は `u` フラグでコンパイルされる。

```json
{
  "source": {
    "dirs": ["app", "src", "!**/*.test.*", "!**/*.spec.*", "!**/__tests__/**"],
    "unit_dirs": ["src/features/*/api/**"],
    "support_dirs": ["app/**", "src/**", "!src/features/*/api/**"],
    "entry_pattern": { "none": "受信する owned の操作（deeplink / push）が無い" }
  },
  "tests": {
    "dirs": ["src/**/__tests__/**", "src/**/*.test.*", "tests/**"],
    "covers_placement": "after",
    "system": {
      "dirs": [".maestro", "!.maestro/config.yaml", "!.maestro/subflows/**"],
      "extensions": [".yaml", ".yml"],
      "test_pattern": "^name:\\s*(\\S.*)$",
      "pending_pattern": "^\\s*-\\s*pending\\s*$|^tags:.*\\bpending\\b",
      "comment_pattern": "^\\s*#"
    }
  },
  "schema": { "none": "アプリは DB スキーマを持たない（永続化は server state の cache）" },
  "contract": { "error_source": "src/shared/errors.ts" }
}
```

- 実現単位は契約の操作と同名の関数を export する module（[テストの接続](common-testing.instructions.md)の操作 → 入口の API・永続化・OS 機能 module）。例では feature の `api/` に置く。route、コンポーネント、hook、store は技術部品。
- deeplink / push を owned の inbound 操作として固定すると `entry_pattern` の none は通らない。そのときは受信入口を包む module の、操作と同名の export に一致する正規表現を宣言し、その窓に `@operation` を書く。
- `@covers` はテスト本体の先頭行に置くので `after`。
- シナリオ flow は YAML なので `#` を行コメントとして読む `comment_pattern` を置く。テストの印は flow の最上位の `name:` で、`# @scenario` はその直上の行（[システムテスト](system-testing.instructions.md)）。`pending` tag の flow は保留で、被覆に数えない。
- Maestro の workspace 設定（`config.yaml`）と subflow は UC のシナリオではないので、除外の glob で範囲から外す。subflow の置き場が違えば glob を合わせる。`e2e/` に置くなら `dirs` をそちらにする。
- `layering` はひな形の層名を持たないので削除するか、`CLAUDE.md` の層の置き場で書き直す。
- `commands` は[テストの接続](common-testing.instructions.md)と[システムテスト](system-testing.instructions.md)が定めるコマンドに置き換える。
- 技術部品の自己検査（`@covers` を持たないテスト）を同居させる置き場は、`tests.dirs` から `!` で外す（例: `"!src/lib/**"`）。外さなければ `@covers` の無いテストとして C11 になる。
