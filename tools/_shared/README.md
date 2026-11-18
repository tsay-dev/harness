# _shared

複数のコマンドが共有する、依存なしの Node モジュール。単独では実行しない（入口の一覧に無い）。
同じ文書や契約をコマンドごとに違う値に読むと、一方は active、他方は draft と判定が割れてすり抜けになるので、
読み方を 1 つにする（ADR-0056）。コマンドのファイル（`tools/<コマンド>/<コマンド>.mjs`）は、引数の解釈と出力のほかに、
そのコマンドだけが使う検査の中身を持つ。2 つ以上のコマンドが使う処理は、ここに置く。

| モジュール | 持つもの | 使うコマンド |
| --- | --- | --- |
| `command-file.mjs` | コマンドの語から、そのコマンドのファイルの場所を決める関数（語を `-` でつないだものが、置き場とファイルの名前。ADR-0071） | 入口（`bin/harness.mjs`）/ 検査の並び（`suite.mjs`） |
| `config.mjs` | 設定ファイルの名前（`harness.config.json`）、古い名前（`traceconfig.json`）のファイルだけが残っているときの案内、ひな形に値を置けない任意の最上位キーの一覧、廃止したキーの一覧と案内、設定を黙って読む関数（読めなければ null）。古い名前のファイルは読まない（ADR-0064） | lint config / lint spec / lint refs / lint entry / lint coverage / lint entries / lint git branch / lint git message / lint git uc / run cases / verify / guard / next-id / index |
| `frontmatter.mjs` | frontmatter のパーサー。曖昧な書き方（先頭が空白の行、キーの重複、区切りもどき、閉じ忘れ、`キー: 値` でない行）を `problems` として返し、lint spec が違反にする | lint spec / lint git uc / lint refs / lint entries / guard / next-id / index |
| `strict-yaml.mjs` | 契約（`contract.yaml`）と共有語彙（`components.yaml`）を読む厳格な YAML 部分集合のパーサー。anchors / aliases / block scalars はエラー（理由: `docs/adr/ADR-0002`）。`lenient` は convert の旧 OpenAPI の読み取り専用 | lint spec / lint git uc / lint refs / lint entries / run cases / guard / convert |
| `overview.mjs` | 1 枚の概要（`00-overview.md`）の読み方（ADR-0076）。ひな形から節・列・方針の見出しを導き、KPI・アクター・GOAL の行と方針の本文に組み立てる。置き場の決め方、古い文書の見つけ方、書き出し | lint spec / lint refs / guard / next-id / index / migrate overview |
| `reqs.mjs` | `UC.md` の「要件」の節に書かれた REQ の読み方（ADR-0067）。小節から、検査が読む形の REQ の文書を組み立てる。REQ の文書を小節に直す変換（migrate reqs が使う） | lint spec / lint git uc / lint refs / guard / next-id / migrate reqs |
| `spec-tree.mjs` | 仕様の木の根の決め方（`--docs` から決まる `<docs>/goals` と、設定の `docs.goals_dir`。2 つが別の場所を指せば誤り）と、フォルダの数え方（ゴールの階層と UC の階層で同じ決まり。`.` で始まるフォルダと `_shared` はゴール・UC として読まない。`_shared` 以外の `_` で始まるフォルダも読まず、lint refs が配置の違反にする。lint refs は別に、木に数えなかった場所の md が `id` を持てば C9 にする） | lint spec / lint git uc / lint refs / lint entries / run cases / guard / 検査の並び（`suite.mjs`） |
| `contract-vocab.mjs` | 契約の語彙（`transport`、`direction`、`x-status`、操作の名前の形、`entry` を書く transport）と、突き合わせに使う項目が「書いてある」（空でない文字列。空白だけは空）かの判定 | lint spec / lint entries / convert |
| `glob.mjs` | 最小の glob（`**` `*` `?`、先頭の `!` で除外）。固定パスはそのファイルか配下を指す。パスはリポジトリ直下からの相対パス（区切りは `/`） | lint refs / lint coverage / guard / next-id / index |
| `spec-cli.mjs` | 見つけた違反の集め方と報告、frontmatter を読んで曖昧な書き方を違反に積む関数、3 つのコマンドに共通の引数の読み方 | lint spec / lint git uc / convert |
| `refs.mjs` | 紐づきの読み方: 設定の宣言の読み方と検査、仕様の木と横の文書（BR / NFR / ADR）の読み方、ID の定義の集め方、テストの注釈（`@covers` / `@scenario`）の数え方。検査が数えた ID と、採番が使用済みとみなす ID と、索引に出る ID が食い違わない | lint refs / next-id / index |
| `entry.mjs` | 3 つのコマンドに共通の引数と設定の読み方、設定の `entry`（本番の組み立てとテストの入口）の読み方（X1・X2 の判定。lint coverage の V5 も同じ読み方を使う） | lint entry / lint coverage / lint entries |
| `git-rules.mjs` | 設定の `git` ブロックの読み方、コミットの `type` の閉じた語彙、検査しないブランチの判定、2 つのコマンドに共通の引数と違反の報告 | lint git branch / lint git message |
| `suite.mjs` | 完了の判定が実行する検査の並び（level、monorepo の unit ごとの実行、`commands` の宣言の検査、制限時間）。1 回の実行と Stop フックが同じ並びを使う | verify |
| `gate-log.mjs` | 2 つのフックの判定の記録（`.harness-gate/log.jsonl`。1 行 1 件の JSON）と、その集計。集計だけは、このファイルを直接実行する（`node tools/_shared/gate-log.mjs --summary`。`../guard/README.md`） | guard / verify |

- コマンドのファイルは `../_shared/` を相対パスで import する。`tools/` の一部だけを写す配置では、`_shared/` も一緒に写す。
- Stop フック（`harness verify --hook`）は、変更の検出の指紋に `_shared/*.mjs` のハッシュを含める（モジュールを書き換えたら検査をやり直す）。
- テストは `test/` にある。共有の処理そのもののテスト（`*.test.mjs`）と、複数のコマンドのテストが共有する fixture（`*-fixture.mjs`、`fold-reqs.mjs`）を置く。
  全部を実行するのは `node --test tools/*/test/*.test.mjs bin/test/*.test.mjs`。
