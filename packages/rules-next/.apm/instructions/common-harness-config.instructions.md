---
description: "🔗 Next.js — harness.config.json のスタックの値（ひな形からの差分）"
applyTo: "**/harness.config.json"
---

# 🔗 Next.js — harness.config.json のスタックの値

Next.js（App Router）のプロジェクトで、harness のひな形 `harness.config.json` から変える値だけを示す。示さないキーはひな形のまま。示した値（文字列、配列、`forbidden` の表）は丸ごと置き換える。キーの意味、宣言の必須、`none`、義務は `harness lint refs` の README、`entry`・`coverage`・`commands.list_entries` は `harness lint entry`・`lint coverage`・`lint entries` の README が正本で、ここでは繰り返さない。パスは `src/` を使う配置の例であり、利用先の `CLAUDE.md` の配置に合わせて書き換える。正規表現は `u` フラグでコンパイルされる。

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
- 入口は Route Handlers（`route.ts` の HTTP メソッド名の export）、Server Actions（`"use server"` のファイルの export）、画面（`page.tsx`）。`commands.list_entries` は、これらの形のファイルを走査して 1 行 1 件の JSON を出すスクリプトにする。画面の配信も入口なので、`page.tsx` の場所から決まるパスを method `GET` の行として出し、契約の inbound の操作として書く（運用のための入口をまとめる UC の契約に置く）。Route Handlers は、ファイルの場所から決まるパスと export した method を `{"kind":"http",…}` で出す。入口と契約の突き合わせは文字の完全一致なので、ファイルの場所から決まるパスを、契約の `wire.path` に書いたとおりの文字で出す。このスタックの契約では、パスのパラメーターを `{id}` と書く。動的な区分 `[id]` は `{id}` に直す（名前も契約と同じにする）。catch-all（`[...slug]`）は、契約に書いた形（例: `/docs/*`）で出す。省略できる catch-all（`[[...slug]]`）は、契約も操作を 2 つ（`/docs` と `/docs/*`）書き、一覧も 2 行で出す。method も契約の `wire.method` と同じ表記で出す。Server Actions は、契約がその操作に付けた transport に合わせる（`internal` なら `{"kind":"internal","name":"<操作名>"}`）。
- 実行の記録（`coverage`）で確かめる範囲は、テストから実行する層（`coverage.scope` に `src/use-cases`、`src/domain`、`src/infrastructure` など）。画面（`src/app`、`src/components`）はシナリオテストで確かめるので、範囲の外に置く。
- `@covers` はテスト本体の先頭行に置く（[common-testing](common-testing.instructions.md)）ので `after`。
- シナリオテスト（`e2e/`、`test.fixme` の保留）と `commands` はひな形のまま使える。スキーマ源が Prisma でなければ `schema` を合わせる。DB で守る規則は、規則に反する行を DB に直接入れて断られるテスト（`@covers BR-nnn`）で確かめる。
- 部品の自己検査（`@covers` を持たないテスト）を同居させる置き場は、`tests.dirs` から `!` で外す（例: `"!src/infrastructure/**"`）。外さなければ `@covers` の無いテストとして C11 になる。
