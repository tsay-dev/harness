---
description: "🔗 crow — harness.config.json のスタックの値（ひな形からの差分）"
applyTo: "**/harness.config.json"
---

# 🔗 crow — harness.config.json のスタックの値

crow（crow3）アプリケーションで、harness のひな形 `harness.config.json` から変える値だけを示す。示さないキーはひな形のまま、示した値は丸ごと置き換える。キーの意味、宣言の必須、`none`、義務は trace-check の README、`entry`・`coverage`・`commands.list_entries` は exec-check の README が正本。パスは `harness.config.json` を置くアプリケーションルート（`app/`、`tests/`、`e2e/` を持つ階層）からの既定の配置の例で、利用先の `CLAUDE.md` の配置に合わせて書き換える。正規表現は `u` フラグでコンパイルされる。

```json
{
  "source": {
    "dirs": ["app"],
    "extensions": [".php", ".js", ".sql"]
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

- `module_*` の `action_*`（[backend-coding](backend-coding.instructions.md) §1）は、そのまま HTTP から呼ばれる入口になる。`commands.list_entries` は、`app/` の `module_*` の `public function action_*` を走査し、crow がその action に割り当てる URL と method を `{"kind":"http","method":…,"path":…}` で 1 行ずつ出すスクリプトにする（URL の決まり方は利用先の crow の版に従う）。入口と契約の突き合わせは文字の完全一致なので、URL と method は、契約の `wire.path`・`wire.method` に書いたとおりの文字で出す。画面遷移用の action も入口なので出す。画面遷移用の action も、契約の inbound の操作として書く（契約の外の入口を認める宣言は無い）。
- 注釈はテストにだけ書く。`@covers` はテストの印の直上の行コメント（`before`。[共通テスト規約](common-testing.instructions.md)）。ひな形の `comment_pattern` が PHP の `//`、`/*`、`*` を読み、`#[...]` の属性行は窓をつなぐ。
- テストの印は PHPUnit の `public function test…(`。`markTestSkipped` / `markTestIncomplete` はテストの窓の外の本体に書くので、そのファイルの全テストが保留とみなされる。
- `schema.extensions` を `.txt` にしないと `db_design.txt` は走査されない。`db_design.txt` のコメントが `#` で始まるなら `schema.comment_pattern` に `^\\s*#` を書く。DB で守る規則（一意制約・参照制約。[db](backend-db.instructions.md)）は、規則に反する行を DB に直接入れて断られるテスト（`@covers BR-nnn`）で確かめる。
- 契約のエラーコードは 1 ファイルの定数（`const NOT_FOUND = 'NOT_FOUND';`）にまとめる例。
- 実行の記録（`coverage`）: active な REQ と `source` があると、`coverage` は none にも省略にもできない（C26）。`coverage.report` は lcov 形式のファイルで、PHPUnit は lcov を直接は出さない。PHPUnit が出した記録を lcov に変換するところまでを `commands.test` に含める（変換の道具は harness では確かめていない。利用先で選び、`CLAUDE.md` に記録する）。変換した記録に関数ごとの情報（`FN` / `FNDA`）が無ければ、`coverage.functions` を `{ "none": "<理由>" }` にする。PHPUnit の記録に載らないソース（`.js`、`.sql`）は、`coverage.scope` を PHP のソースに絞って範囲の外に置く（例: `app/**/*.php`）。
- `layering` は削除する（crow は層をディレクトリで分けない）。シナリオテスト（`e2e/`、`test.fixme`）はひな形のまま。`commands` は[テスト設計](backend-testing.instructions.md)と[システムスイート](system-testing.instructions.md)のコマンドに置き換える。
