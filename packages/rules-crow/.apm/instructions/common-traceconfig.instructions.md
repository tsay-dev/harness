---
description: "🔗 crow — traceconfig.json のスタックの値（ひな形からの差分）"
applyTo: "**/traceconfig.json"
---

# 🔗 crow — traceconfig.json のスタックの値

crow（crow3）アプリケーションで、harness のひな形 `traceconfig.json` から変える値だけを示す。示さないキーはひな形のまま、示した値は丸ごと置き換える。キーの意味、宣言の必須、`none`、義務は trace-check の README が正本。パスは `traceconfig.json` を置くアプリケーションルート（`app/`、`tests/`、`e2e/` を持つ階層）からの既定の配置の例で、利用先の `CLAUDE.md` の配置に合わせて書き換える。正規表現は `u` フラグでコンパイルされる。

```json
{
  "source": {
    "dirs": ["app"],
    "extensions": [".php", ".js", ".sql"],
    "unit_dirs": ["app/**/module_*.php"],
    "support_dirs": ["app/**", "!app/**/module_*.php"],
    "unit_pattern": "^\\s*public\\s+function\\s+(action_\\w+)\\s*\\(",
    "entry_pattern": "^\\s*public\\s+function\\s+(action_\\w+)\\s*\\("
  },
  "tests": {
    "extensions": [".php"],
    "test_pattern": "^\\s*public\\s+function\\s+(test\\w*)\\s*\\(",
    "pending_pattern": "\\bmarkTest(?:Skipped|Incomplete)\\s*\\("
  },
  "schema": {
    "files": ["db_design.txt"],
    "extensions": [".txt"]
  },
  "contract": {
    "error_source": "app/classes/_common_/error_codes.php",
    "error_code_pattern": "\\bconst\\s+\\w+\\s*=\\s*(?:'|\")([A-Z][A-Z0-9_]*)(?:'|\")"
  }
}
```

- 実現単位はユースケースである `module_*` の `action_*`（[backend-coding](backend-coding.instructions.md) §1）。`model_*`、service、presenter、util、view、viewpart、assets は技術部品で、`@implements` を書いてもよい。
- `action_*` はそのまま HTTP から呼ばれる入口でもあるので、`entry_pattern` は `unit_pattern` と同じ。画面遷移用の action も入口に数える。入口の捕捉は action 名で `/` で始まらないので、`wire.path` との照合は行われない。crow の action は印が無くても入口として動くので `entry_file_pattern` は使わない。
- 注釈は単位の印の直上に置く（`before`）。`@implements` / `@operation` は `//<TAB>` の行コメントか docblock、`@covers` は行コメント（[共通テスト規約](common-testing.instructions.md)）。ひな形の `comment_pattern` が PHP の `//`、`/*`、`*` を読み、`#[...]` の属性行は窓をつなぐ。
- テストの印は PHPUnit の `public function test…(`。`markTestSkipped` / `markTestIncomplete` はテストの窓の外の本体に書くので、そのファイルの全テストが保留とみなされる。
- `schema.extensions` を `.txt` にしないと `db_design.txt` は走査されない。`schema.constraint_pattern` はひな形（Prisma）のままでは一致しないので、利用先の crow の版の `db_design.txt` の一意制約・参照制約の書き方（[db](backend-db.instructions.md)）に合わせ、名前を 1 つ捕捉する正規表現にする。`db_design.txt` のコメントが `#` で始まるなら `schema.comment_pattern` に `^\\s*#` を書く。
- 契約のエラーコードは 1 ファイルの定数（`const NOT_FOUND = 'NOT_FOUND';`）にまとめる例。
- `layering` は削除する（crow は層をディレクトリで分けない）。シナリオテスト（`e2e/`、`test.fixme`）はひな形のまま。`commands` は[テスト設計](backend-testing.instructions.md)と[システムスイート](system-testing.instructions.md)のコマンドに置き換える。
