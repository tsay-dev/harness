# lint git branch

develop skill の `commit.md` が定める書式（*ブランチを切る*）に従って、**ブランチ名**を検査する（`harness lint git branch`）。
判断不要なことだけを判定する。スライスの所属単位、分岐元、差分と名前の一致は
orchestrator と reviewer が判断する（ADR-0039）。

設定の `git` ブロックの書き方と、実行する場所は、コミットメッセージの検査（`harness lint git message`。`../lint-git-message/README.md`）と共通で、このファイルが正本。

## 利用プロジェクトが宣言するもの

利用プロジェクトの `harness.config.json` に `git` ブロックがある場合だけ検査する。
なければ未検査と表示して `0` で終了する。スキップであり、成功ではない。

```jsonc
"git": {}                                             // 単一単位: ブランチは <type>/<topic>
"git": { "units": { "app-a": "apps/a", "ui": "packages/ui" } }   // モノレポ: <unit>/<topic>。scope は単位
"git": { "exempt_branches": ["dependabot/**"] }        // 検査しないブランチ（glob: ** / * / ?）
```

- `units` は単位名（小文字 ASCII の kebab-case）とディレクトリの対応。orchestrator はここから単位を読み、
  `harness lint git uc` はコミットの `scope` が指定する単位の docs をここから見つける（ADR-0040）。
  配置から推測しない。`repo` は単位に属さない変更用の予約名で、宣言できない。
  単位のディレクトリが存在しない場合は設定エラー（宣言が古い）。
- `exempt_branches` はプロジェクトの agent や人間が命名しないブランチ（bot）向け。
  一致したブランチは両検査をスキップし、「未検査」と報告する。

## 検査内容

| コード | 規則 |
| --- | --- |
| `B1` | ブランチは `<prefix>/<topic>`。スラッシュはちょうど一つ。既定ブランチや単位名だけは失敗 |
| `B2` | `<prefix>` は宣言済み単位か `repo`（モノレポ）、またはコミット `type`（単一単位） |
| `B3` | `<topic>` は小文字 ASCII の kebab-case、二〜五単語 |

## 使い方

```bash
harness lint git branch [--name <branch>] [--root <host root>] [--config harness.config.json]
```

| フラグ | 意味 |
| --- | --- |
| `--name` | 検査する名前。既定は現在のブランチ。detached HEAD（CI checkout）では必須 |

終了コード: `0` = 違反なし（「未宣言」と「除外」も含み、どちらも行に明示） / `1` = 違反 /
`2` = 設定または使用法エラー。ベースラインはない。名前はその場で直す。

回帰テスト: `node --test "tools/lint-git-branch/test/*.test.mjs"`（ケースごとに一時ディレクトリへ最小構成の利用プロジェクトを書く）。

## 実行する場所

- **CI — 回避できない検査。** 再利用 workflow `.github/workflows/verify.yml` が全 pull request で
  `lint git branch` と `lint git message` を実行する（head ブランチ名と base〜head の各コミット）。既にその workflow を呼ぶ
  利用プロジェクトは `git` ブロックだけ追加すればよい。失敗で merge を阻止するには、既定ブランチを
  保護し、workflow の報告する status check を必須にする（呼び出し job が `verify` の場合は
  `verify / verify` と表示）。ブランチ保護は利用プロジェクトの設定であり、harness は設定しない。
  プラン上その repository のブランチを保護できない場合、検査は実行され pull request に赤を示すが、
  merge を阻止するものはない。その場合の阻止は `commit.md` の「すべての検査が正常でない pull request を
  merge してはならない」という規則であり、orchestrator と合意した人間を拘束する。
- **orchestrator** はブランチを切った直後に実行する（`commit.md`）。誤った名前を低コストで検出できる。
  CI で直す場合は新しいブランチと pull request が必要。
- **ローカル hooks** は任意で clone ごとに設定:

  ```bash
  # .git/hooks/commit-msg
  node .harness/bin/harness.mjs lint git message --file "$1"
  # .git/hooks/pre-push
  node .harness/bin/harness.mjs lint git branch
  ```

## 検査しないもの

- prefix が*正しい*単位（スライスのユーザー価値が現れるアプリ）かどうか。`repo/…` ブランチで
  `apps/a` を触る差分も正当になり得る（全 repository の依存更新）。パス規則では判定しない。
- 既定ブランチから分岐し、別のブランチに積んでいないか。
- pull request のタイトル。
