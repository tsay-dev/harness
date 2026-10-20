# _shared

harness の検査ツールが共有する、依存なしの Node モジュール。単独では実行しない。
同じ文書や契約をツールごとに違う値に読むと、一方は active、他方は draft と判定が割れてすり抜けになるので、
読み方を 1 つにする（ADR-0056）。

| モジュール | 持つもの | 使うツール |
| --- | --- | --- |
| `strict-yaml.mjs` | 契約（`contract.yaml`）と共有語彙（`components.yaml`）を読む厳格な YAML 部分集合のパーサー。anchors / aliases / block scalars はエラー（理由: `docs/adr/ADR-0002`）。`lenient` は spec-lint `convert` の旧 OpenAPI の読み取り専用 | spec-lint / trace-check / contract-run |
| `frontmatter.mjs` | frontmatter のパーサー。曖昧な書き方（先頭が空白の行、キーの重複、区切りもどき、閉じ忘れ、`キー: 値` でない行）を `problems` として返し、spec-lint が違反にする | spec-lint / trace-check / gate-hook |
| `glob.mjs` | 最小の glob（`**` `*` `?`、先頭の `!` で除外）。固定パスはそのファイルか配下を指す。パスはリポジトリ直下からの相対パス（区切りは `/`） | trace-check / gate-hook |

- 各ツールは `../_shared/` を相対パスで import する。ツールのディレクトリだけを写す配置では、`_shared/` も一緒に写す。
- stop-gate は、変更の検出の指紋に `_shared/*.mjs` のハッシュを含める（モジュールを書き換えたら検査をやり直す）。
- 回帰テストは各ツールの `test/` にある（`node --test "tools/**/*.test.mjs"`）。
