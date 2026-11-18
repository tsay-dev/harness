---
description: "🔗 Next.js — harness.config.json のスタックの値（ひな形からの差分）"
applyTo: "**/harness.config.json"
---

# 🔗 Next.js — harness.config.json のスタックの値

Next.js（App Router）のプロジェクトで、harness のひな形 `harness.config.json` から変える値だけを示す。示さないキーはひな形のまま。示した値（文字列、配列、`forbidden` の表）は丸ごと置き換える。キーの意味、宣言の必須、`none`、義務は trace-check の README、`entry`・`coverage`・`commands.list_entries` は exec-check の README が正本で、ここでは繰り返さない。パスは `src/` を使う配置の例であり、利用先の `CLAUDE.md` の配置に合わせて書き換える。正規表現は `u` フラグでコンパイルされる。

```json
{
  "source": {
    "dirs": ["src", "!**/*.test.*", "!**/*.spec.*", "!**/__tests__/**"]
  },
  "tests": {
    "dirs": ["src/**/__tests__/**", "src/**/*.test.*", "src/**/*.spec.*", "tests/**"],
    "covers_placement": "after"
  },
  "layering": {
    "forbidden": {
      "domain": ["use-cases", "infrastructure", "app"],
      "use-cases": ["app"],
      "infrastructure": ["use-cases", "app"]
    }
  }
}
```

- `layering.forbidden` は [backend-coding](backend-coding.instructions.md) の依存の方向をディレクトリ名で写したもの。
- 入口は Route Handlers（`route.ts` の HTTP メソッド名の export）と Server Actions（`"use server"` のファイルの export）。Next.js ではこの形のファイルだけが入口として動くので、`commands.list_entries` は、その形のファイルを走査して 1 行 1 件の JSON を出すスクリプトにする。Route Handlers は、ファイルの場所から決まるパスと export した method を `{"kind":"http",…}` で出す。パスは一覧の書式（exec-check の README の「パスの書式」）に直す。動的な区分 `[id]` は `:id`、catch-all（`[...slug]`）は `*` で出す。省略できる catch-all（`[[...slug]]`）は、親のパスの行と `*` の行の 2 行で出す（`/docs/[[...slug]]` なら `/docs` と `/docs/*`）。契約も、`wire.path` が `/docs` の操作と `/docs/*` の操作の 2 つを書く。catch-all の位置は、契約の `wire.path` も `*` と書く（`[id]` や `[...slug]` のまま出すと E4。catch-all を `:slug` で出すと、契約のパラメーター 1 つより広い入口が合ったことになる）。Server Actions は、契約がその操作に付けた transport に合わせる（`internal` なら `{"kind":"internal","name":"<操作名>"}`）。
- 実行の記録（`coverage`）で確かめる範囲は、テストから実行する層（`coverage.scope` に `src/use-cases`、`src/domain`、`src/infrastructure` など）。画面（`src/app`、`src/components`）はシナリオテストで確かめるので、範囲の外に置く。
- `@covers` はテスト本体の先頭行に置く（[common-testing](common-testing.instructions.md)）ので `after`。
- シナリオテスト（`e2e/`、`test.fixme` の保留）と `commands` はひな形のまま使える。スキーマ源が Prisma でなければ `schema` を合わせる。DB で守る規則は、規則に反する行を DB に直接入れて断られるテスト（`@covers BR-nnn`）で確かめる。
- 技術部品の自己検査（`@covers` を持たないテスト）を同居させる置き場は、`tests.dirs` から `!` で外す（例: `"!src/infrastructure/**"`）。外さなければ `@covers` の無いテストとして C11 になる。
