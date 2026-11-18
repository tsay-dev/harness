---
description: "🔗 Cloudflare / Hono / React — harness.config.json のスタックの値（ひな形からの差分）"
applyTo: "**/harness.config.json"
---

# Cloudflare / Hono / React — harness.config.json のスタックの値

harness のひな形 `harness.config.json` から変える値だけを示す。示さないキーはひな形のまま、示した値は丸ごと置き換える。キーの意味、宣言の必須、`none`、義務は trace-check の README、`entry`・`coverage`・`commands.list_entries`・`entries` は exec-check の README が正本。パスは[共通コーディング](common-coding.instructions.md)の既定の配置で、`harness.config.json` の場所から書く。逸脱は利用プロジェクトの地図に合わせる。正規表現は `u` フラグでコンパイルされる。

```json
{
  "source": {
    "dirs": ["apps/api/src", "apps/web/src", "packages/shared/src", "!**/*.test.*", "!**/*.spec.*"]
  },
  "tests": {
    "dirs": ["tests/**", "apps/api/src/**/*.test.ts"],
    "covers_placement": "after"
  },
  "schema": {
    "dirs": ["apps/api/src/db/schema"],
    "extensions": [".ts"]
  },
  "contract": { "error_source": "packages/shared/src/errors.ts" }
}
```

- `schema.files`（Prisma）と `layering` は削除する。層は機能内のファイル接尾辞（`*.routes.ts` → `*.service.ts` → `*.repository.ts`）で分かれ、C6 のディレクトリ階層では表せない。
- `commands.list_entries` は、本番の組み立て（`entry.compose`）で作った Hono のアプリの `app.routes`（登録済みの method と path の一覧）を、1 行 1 件の JSON で出すスクリプトにする。ミドルウェアだけの登録（method が `ALL` のもの）は出さず、入口のハンドラーだけを出す。ルーターの登録を書き写した一覧にはしない（載せ忘れた入口が見つからない）。生存確認や静的なファイルの配信のような入口も、契約の inbound の操作として書く（契約の外の入口を認める宣言は無い。運用のための入口をまとめる UC の契約に置く）。
- 実行の記録（`coverage`）で確かめる範囲は、API と共有コード（`coverage.scope` に `apps/api/src` と `packages/shared/src`）。画面（`apps/web/src`）はシナリオテストで確かめるので、範囲の外に置く。
- スキーマ源は Drizzle のスキーマ定義。生成された SQL マイグレーションは走査しない。DB で守る規則（`.unique()`、`uniqueIndex`、`check` など）は、規則に反する行を DB に直接入れて断られるテスト（`@covers BR-nnn`）で確かめる。
- 共有エラーコードはブラウザも読むので `packages/shared/src` に置く。
- `@covers` はテスト本文の先頭行に置く（[テストの接続](common-testing.instructions.md)）ので `after`。シナリオテストはひな形のまま。
- 技術部品の自己検査（`@covers` を持たないテスト）を同居させる置き場は、`tests.dirs` から `!` で外す（例: `"!apps/api/src/middleware/**"`）。外さなければ `@covers` の無いテストとして C11 になる。
