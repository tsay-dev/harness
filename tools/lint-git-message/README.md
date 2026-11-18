# lint git message

develop skill の `commit.md` が定める書式（書式リファレンス）に従って、**コミットメッセージのヘッダー**を検査する（`harness lint git message`）。
判断不要なことだけを判定する（ADR-0039）。

設定の `git` ブロックの書き方（`units`、`exempt_branches`。宣言が無ければ未検査）と、実行する場所（CI、ローカルの hook）は、
ブランチ名の検査と共通で、`../lint-git-branch/README.md` が正本。

## 検査内容

| コード | 規則 |
| --- | --- |
| `M1` | ヘッダーは `<type>(<scope>): <subject>`。`type` は閉じた一覧（`feat` `fix` `docs` `refactor` `test` `perf` `style` `build` `ci` `chore`） |
| `M2` | subject の末尾にピリオド（`.` または `。`）がない |
| `M3` | モノレポでは `scope` が必須で、宣言済み単位か `repo` |

`Merge ` または `Revert "` で始まるヘッダーは git が書く文言なので、一覧に示すが検査しない。
`type` 一覧は `commit.md` の表と同じ。両者がずれるとテストスイートが失敗する。

## 使い方

```bash
harness lint git message (--file <path> | --range <base>..<head>) [--branch <name>] [--root <host root>] [--config harness.config.json]
```

| フラグ | 意味 |
| --- | --- |
| `--file` | commit-msg hook が渡すコミットメッセージファイル（`#` 行は無視） |
| `--range` | 範囲内の全コミット。merge コミットは除外 |
| `--branch` | `exempt_branches` と照合する名前。既定は現在のブランチ |

終了コード: `0` = 違反なし（「未宣言」と「除外」も含み、どちらも行に明示） / `1` = 違反 /
`2` = 設定または使用法エラー。ベースラインはない。メッセージはその場で直す。

回帰テスト: `node --test "tools/lint-git-message/test/*.test.mjs"`。

## 検査しないもの

- subject の長さ、文体、言語。本文と trailers（`UC:` は `harness lint git uc` の担当。`../lint-git-uc/README.md`）。
- pull request のタイトル。
