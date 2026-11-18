# _shared

harness の検査ツールが共有する、依存なしの Node モジュール。単独では実行しない。
同じ文書や契約をツールごとに違う値に読むと、一方は active、他方は draft と判定が割れてすり抜けになるので、
読み方を 1 つにする（ADR-0056）。

| モジュール | 持つもの | 使うツール |
| --- | --- | --- |
| `strict-yaml.mjs` | 契約（`contract.yaml`）と共有語彙（`components.yaml`）を読む厳格な YAML 部分集合のパーサー。anchors / aliases / block scalars はエラー（理由: `docs/adr/ADR-0002`）。`lenient` は spec-lint `convert` の旧 OpenAPI の読み取り専用 | spec-lint / trace-check / contract-run |
| `frontmatter.mjs` | frontmatter のパーサー。曖昧な書き方（先頭が空白の行、キーの重複、区切りもどき、閉じ忘れ、`キー: 値` でない行）を `problems` として返し、spec-lint が違反にする | spec-lint / trace-check / gate-hook |
| `config.mjs` | 設定ファイルの名前（`harness.config.json`）、古い名前（`traceconfig.json`）のファイルだけが残っているときの案内、ひな形に値を置けない任意の最上位キーの一覧。古い名前のファイルは読まない（ADR-0064） | trace-check / spec-lint / git-lint / contract-run / gate-hook / stop-gate / config-lint |
| `reqs.mjs` | `UC.md` の「要件」の節に書かれた REQ の読み方（ADR-0067）。小節から、検査ツールが読む形の REQ の文書を組み立てる。REQ の文書を小節に直す変換（移行のスクリプトが使う） | spec-lint / trace-check / gate-hook / docs-migrate |
| `goals-tree.mjs` | 仕様の木の根の決め方（`--docs` から決まる `<docs>/goals` と、設定の `docs.goals_dir`。2 つが別の場所を指せば誤り）と、フォルダの数え方（ゴールの階層と UC の階層で同じ決まり。`.` で始まるフォルダと `_shared` はゴール・UC として読まない。`_shared` 以外の `_` で始まるフォルダも読まず、trace-check が配置の違反にする。trace-check は別に、木に数えなかった場所の md が `id` を持てば C9 にする）。契約の transport の語彙と、突き合わせに使う項目が「書いてある」（空でない文字列。空白だけは空）かの判定 | spec-lint / trace-check / gate-hook / exec-check / contract-run / 検査の並び（`gate-hook/suite.mjs`） |
| `glob.mjs` | 最小の glob（`**` `*` `?`、先頭の `!` で除外）。固定パスはそのファイルか配下を指す。パスはリポジトリ直下からの相対パス（区切りは `/`） | trace-check / gate-hook |

- 各ツールは `../_shared/` を相対パスで import する。ツールのディレクトリだけを写す配置では、`_shared/` も一緒に写す。
- stop-gate は、変更の検出の指紋に `_shared/*.mjs` のハッシュを含める（モジュールを書き換えたら検査をやり直す）。
- 回帰テストは各ツールの `test/` にある（`node --test "tools/**/*.test.mjs"`）。
