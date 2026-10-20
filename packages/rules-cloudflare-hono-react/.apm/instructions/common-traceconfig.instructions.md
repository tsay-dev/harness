---
description: "🔗 Cloudflare / Hono / React — traceconfig.json のスタックの値（ひな形からの差分）"
applyTo: "**/traceconfig.json"
---

# Cloudflare / Hono / React — traceconfig.json のスタックの値

harness のひな形 `traceconfig.json` から変える値だけを示す。示さないキーはひな形のまま、示した値は丸ごと置き換える。キーの意味、宣言の必須、`none`、義務は trace-check の README が正本。パスは[共通コーディング](common-coding.instructions.md)の既定の配置で、`traceconfig.json` の場所から書く。逸脱は利用プロジェクトの地図に合わせる。正規表現は `u` フラグでコンパイルされる。

```json
{
  "source": {
    "dirs": ["apps/api/src", "apps/web/src", "packages/shared/src", "!**/*.test.*", "!**/*.spec.*"],
    "unit_dirs": ["apps/api/src/features/**/*.service.ts"],
    "support_dirs": ["apps/api/src/**", "!apps/api/src/features/**/*.service.ts", "apps/web/src/**", "packages/shared/src/**"]
  },
  "tests": {
    "dirs": ["tests/**", "apps/api/src/**/*.test.ts"],
    "covers_placement": "after"
  },
  "schema": {
    "dirs": ["apps/api/src/db/schema"],
    "extensions": [".ts"],
    "constraint_pattern": "^\\s*(\\w+)\\s*:\\s*\\w+\\(.*\\.unique\\(|^[^/]*\\b(?:uniqueIndex|unique|check)\\(\\s*(?:\"|'|`)([^\"'`]+)"
  },
  "contract": { "error_source": "packages/shared/src/errors.ts" }
}
```

- `schema.files`（Prisma）と `layering` は削除する。層は機能内のファイル接尾辞（`*.routes.ts` → `*.service.ts` → `*.repository.ts`）で分かれ、C6 のディレクトリ階層では表せない。
- 実現単位は `*.service.ts`（[バックエンドの境界](backend-coding.instructions.md)のユースケースの役割）。routes、repository、middleware、SPA、共有スキーマは技術部品。
- `entry_pattern` はひな形のまま（チェーンの `.get("/…")` などを読む）。Hono のルートは印が無くても入口として動くので `entry_file_pattern` は使わない。
- 制約は Drizzle のスキーマ定義の `.unique()`、`uniqueIndex("…")`、`unique("…")`、`check("…")`。生成された SQL マイグレーションは走査しない。
- 共有エラーコードはブラウザも読むので `packages/shared/src` に置く。
- `@covers` はテスト本文の先頭行に置く（[テストの接続](common-testing.instructions.md)）ので `after`。シナリオテストはひな形のまま。
