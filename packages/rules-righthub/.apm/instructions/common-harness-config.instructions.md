---
description: "🔗 Righthub / Hono / React — harness.config.json のスタックの値（ひな形からの差分）"
applyTo: "**/harness.config.json"
---

# Righthub / Hono / React — harness.config.json のスタックの値

harness のひな形 `harness.config.json` から変える値だけを示す。示さないキーはひな形のまま、示した値は丸ごと置き換える。キーの意味、宣言の必須、`none`、義務は `harness lint refs` の README、`entry`・`coverage`・`commands.list_entries` は `harness lint entry`・`lint coverage`・`lint entries` の README が正本。パスは[共通コーディング](common-coding.instructions.md)の既定の配置で、`harness.config.json` の場所から書く。逸脱は利用プロジェクトの地図に合わせる。正規表現は `u` フラグでコンパイルされる。

```json
{
  "source": {"dirs": ["apps/api/src", "apps/web/src", "packages/shared/src", "!**/*.test.*", "!**/*.spec.*"]},
  "tests": {"dirs": ["tests/**", "apps/api/src/**/*.test.ts"], "covers_placement": "after"},
  "schema": {"files": ["prisma/schema.prisma"]},
  "contract": {"error_source": "packages/shared/src/errors.ts"}
}
```

- `layering` は削除する。層は機能内のファイル接尾辞（`*.routes.ts` → `*.service.ts` → `*.repository.ts`）で分かれ、C6 のディレクトリ階層では表せない。
- `commands.list_entries` は、本番の組み立て（`entry.compose`）で作った Hono のアプリの `app.routes`（登録済みの method と path の一覧）を、1 行 1 件の JSON で出すスクリプトにする。`app.use` で登録したミドルウェアは method が `ALL` の登録として載るので、`ALL` の登録は出さない。そのため、次へ渡さずに、その経路の本来の応答を返すもの（静的なファイルの配信、別のアプリの取り付けなど）は、`ALL` として載る書き方（`app.all()`、`app.use()`、`app.mount()`）で登録しない（一覧から落ちて検査の外になる）。CORS や認証のように、条件に合わないときだけ応答を返して、ふだんは次へ渡すミドルウェアは、これに当たらない。静的なファイルの配信も、`app.use('/static/*', serveStatic(...))` ではなく `app.get('/static/*', serveStatic(...))` と書く。入口は method を明示して登録し、`app.all()` と `app.mount()` の呼び出しは lint で止める（`app.use` に渡したものが、次へ渡さずに本来の応答を返すかどうかは lint では見分けられないので、レビューで見る）。入口と契約の突き合わせは文字の完全一致なので、`app.routes` のパスは、契約の `wire.path` に書いたとおりの文字に直して出す。このスタックの契約では、パスのパラメーターを `{id}` と書く。`app.routes` の `:id` は `{id}` に直し、パラメーターの名前は契約と同じにする（登録の側の名前を契約に合わせる）。`app.get('/x', mw, handler)` のようにミドルウェアとハンドラーを並べて登録すると、同じ method と path が `app.routes` に複数載るので、1 行にまとめて出す（同じ入口を 2 回出すと E4）。method も契約の `wire.method` と同じ表記で出す。正規表現付きのパラメーター（`:id{[0-9]+}`）と省略できるパラメーター（`:id?`）は、契約に書いた形に合わせて出す。省略できるもの（`app.routes` には `/x/:id?` の 1 件で載る）は、契約も、付く形と付かない形の操作を 2 つ書き、一覧も 2 行で出す。ルーターの登録を書き写した一覧にはしない（載せ忘れた入口が見つからない）。生存確認や静的なファイルの配信のような入口も、契約の inbound の操作として書く（契約の外の入口を認める宣言は無い。運用のための入口をまとめる UC の契約に置く）。
- 実行の記録（`coverage`）で確かめる範囲は、API と共有コード（`coverage.scope` に `apps/api/src` と `packages/shared/src`）。画面（`apps/web/src`）はシナリオテストで確かめるので、範囲の外に置く。
- スキーマ源は `prisma/schema.prisma`。SQL でだけ表せる制約を採用する場合は、その正本も `schema` の範囲に追加する。DB で守る規則（`@unique` / `@@unique` など）は、規則に反する行を DB に直接入れて断られるテスト（`@covers BR-nnn`）で確かめる（C13）。
- 共有エラーコードはブラウザも読むので `packages/shared/src` に置く。
- `@covers` はテスト本文の先頭行に置く（[テストの接続](common-testing.instructions.md)）ので `after`。シナリオテストはひな形のまま。
- 技術部品の自己検査（`@covers` を持たないテスト）を同居させる置き場は、`tests.dirs` から `!` で外す（例: `"!apps/api/src/middleware/**"`）。外さなければ `@covers` の無いテストとして C11 になる。
