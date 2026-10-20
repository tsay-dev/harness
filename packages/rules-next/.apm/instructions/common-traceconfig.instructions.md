---
description: "🔗 Next.js — traceconfig.json のスタックの値（ひな形からの差分）"
applyTo: "**/traceconfig.json"
---

# 🔗 Next.js — traceconfig.json のスタックの値

Next.js（App Router）のプロジェクトで、harness のひな形 `traceconfig.json` から変える値だけを示す。示さないキーはひな形のまま。示した値（文字列、配列、`forbidden` の表）は丸ごと置き換える。キーの意味、宣言の必須、`none`、義務は trace-check の README が正本で、ここでは繰り返さない。パスは `src/` を使う配置の例であり、利用先の `CLAUDE.md` の配置に合わせて書き換える。正規表現は `u` フラグでコンパイルされる。

```json
{
  "source": {
    "dirs": ["src", "!**/*.test.*", "!**/*.spec.*", "!**/__tests__/**"],
    "unit_dirs": ["src/use-cases/**"],
    "support_dirs": ["src/app/**", "src/actions/**", "src/components/**", "src/features/**", "src/domain/**", "src/infrastructure/**", "src/middleware.*"],
    "entry_pattern": "^export\\s+(?:(?:async\\s+)?function\\s+(\\w+)|const\\s+(\\w+)\\s*=\\s*async\\b)",
    "entry_file_pattern": "^\\s*[\"']use server[\"']|^export\\s+(?:async\\s+)?function\\s+(?:GET|POST|PUT|PATCH|DELETE)\\b"
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

- 実現単位はユースケース（[backend-coding](backend-coding.instructions.md) の Use case）。domain、infrastructure、外側の入口、UI は技術部品の置き場に入れる。`layering.forbidden` は同じ文書の依存の方向をディレクトリ名で写したもの。
- 入口は Server Actions（`"use server"` のファイルの export）と Route Handlers（`route.ts` の HTTP メソッド名の export）。Next.js ではこの印の無いファイルは入口として動かないので、`entry_file_pattern` で入口を探すファイルを絞る。`entry_file_pattern` で範囲を絞ってよいのは、その印が無ければ入口として動かないフレームワークだけで、Hono / Express では使わない。
- 入口の捕捉は操作名か HTTP メソッド名で `/` で始まらないので、`wire.path` との照合は行われない。
- `@covers` はテスト本体の先頭行に置く（[common-testing](common-testing.instructions.md)）ので `after`。
- シナリオテスト（`e2e/`、`test.fixme` の保留）と `commands` はひな形のまま使える。スキーマ源が Prisma でなければ `schema` を合わせる。
- 技術部品の自己検査（`@covers` を持たないテスト）を同居させる置き場は、`tests.dirs` から `!` で外す（例: `"!src/infrastructure/**"`）。外さなければ `@covers` の無いテストとして C11 になる。
