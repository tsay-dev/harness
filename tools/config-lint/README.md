# config-lint

プロジェクトの設定（`harness.config.json`）の形を検査し、機械で確かめていない決めごとを一覧する。入口からは `harness lint config`。

設定には 3 種類のことを書く。同じ決めごとを 2 か所に書かないために、種類ごとに書き方を分ける。

| 種類 | キー | 書くもの |
| --- | --- | --- |
| harness が直接使う事実 | `docs` / `source` / `tests` / `schema` / `contract` / `commands` / `git` など | 値そのもの。意味と検査は、読むツールの README が正本（`tools/trace-check/README.md` など） |
| ほかに正本がある決めごと | `rules` | 正本のファイルと、確かめる `commands` のキーだけ。決めごとの中身は書き写さない |
| ほかに置き場が無い決めごと | `conventions` | 決めごとを 1 文と、機械で確かめていない理由 |
| 人間が認めた例外 | `exceptions` | 何を認めたかを 1 文と、認めた日 |

```json
{
  "rules": {
    "layers": { "source": "eslint.config.mjs", "check": "lint" },
    "types": { "source": "tsconfig.base.json", "check": "typecheck" }
  },
  "conventions": [
    { "rule": "機能をまたぐ判断は features/relationships/ に置く", "unchecked_because": "どの判断が機能をまたぐかは、依存の向きでは表せない" }
  ],
  "exceptions": [
    { "what": "tests/support/avatar-unset.ts だけが DB の偽物を直接操作してよい", "approved": "2026-10-15" }
  ]
}
```

- `rules` の `check` は、`commands` にコマンドとして宣言されたキーを指す。確かめる手段が無い決めごとは `rules` に書けないので、`conventions` に書く。
- `conventions` の決めごとを機械で確かめられるようになったら（lint の規則を足した、など）、`conventions` から消して `rules` に移す。
- `conventions` は、違反が無くても毎回、件数と一覧を表示する。機械が見ていない範囲を、見えるままにしておくためである。
- 3 つとも省略できる。省略したものは「未宣言」と表示し、「0 件」とは区別する。

## 検査項目

| ID | 内容 |
| --- | --- |
| K1 | 最上位のキーは、ひな形（`templates/develop/harness.config.json`）にあるものだけ。名前の打ち間違いを通さない |
| K2 | `rules` は `{ <名前>: { "source", "check" } }`。`source` は実在するファイル。`check` は `commands` にコマンドの文字列で宣言されたキー（`none` の宣言と未宣言は不可） |
| K3 | `conventions` は `[{ "rule", "unchecked_because" }]`。どちらも 1 行の文。同じ `rule` を 2 回書かない |
| K4 | `exceptions` は `[{ "what", "approved" }]`。`what` は 1 行の文、`approved` は実在する日付（`YYYY-MM-DD`） |

検査するのは形だけである。次のことは確かめない。

- `rules` の `source` が、その決めごとを本当に定めているか。`check` のコマンドが、その決めごとを本当に確かめているか。
- `conventions` に書くべき決めごとが、書かれずに残っていないか。
- `exceptions` の日付に、人間が本当に認めたか。設定ファイルへの書き込みは、gate-hook が人間の承認を求める（ADR-0057）。
- `docs` / `source` / `tests` / `commands` などの値が正しいか。それぞれを読むツールが検査する。

monorepo（`git.units`）では、ルートの設定に続けて、設定ファイルを持つ unit を検査する。`rules` の `source` は、その設定ファイルがあるディレクトリから探す。

## 使い方

```bash
node tools/config-lint/config-lint.mjs [--root <プロジェクトのルート>] [--config harness.config.json]
```

終了コード: 0 = 違反なし / 1 = 違反あり / 2 = 使い方の誤り、設定ファイルが無い、JSON として読めない。

## テスト

```bash
node --test tools/config-lint/test/*.test.mjs < /dev/null
```
