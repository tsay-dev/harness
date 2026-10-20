# コミット（オーケストレーター自身が git を実行する）

スライスはあなたが git コミットとして記録します（人間の依頼があれば PR も作ります）。意図を把握しているあなたが分割を決め、メッセージを書きます。メッセージと PR の書式はこのファイル末尾の書式リファレンスが SSOT で、機械で決まる部分は `tools/git-lint` が検査します（ADR-0039）。コミットメッセージと PR 本文は日本語です（`type`、scope、trailer は英語）。

## ブランチを切る

最初の作成者が書く前に切ります。

- **幹は 1 本。** `git fetch origin` の後、`git switch -c <name> --no-track origin/<default>`（`<default>` は `git symbolic-ref --short refs/remotes/origin/HEAD`）。fetch できなければローカルのデフォルトから切り、基点が古い可能性を報告します。デフォルト以外の長寿命ブランチや単位別の幹は作りません。
- **1 スライスに 1 本の短命ブランチ。** 同じスライスの再開は同じブランチ、新しいスライスはデフォルトから新しく切ります。未マージの作業に依存するスライスは、積む前に人間に尋ねます。
- **名前は導出し、創作しない。** `<topic>` は小文字 ASCII の kebab-case、動詞を先頭に 2–5 語です。

| 利用プロジェクト | 名前 | 決め方 |
| --- | --- | --- |
| `traceconfig.json` に `git.units` がある（モノレポ） | `<unit>/<topic>` | `<unit>` は宣言済みの名前。スライスのユーザー価値が現れるアプリ → 変更が収まる共有パッケージ → どれでもなければ `repo` の順で選ぶ。`<unit>` 単独のブランチは禁止 |
| `git.units` がない | `<type>/<topic>` | `<type>` はスライスの主変更のコミット `type`。利用プロジェクトの `CLAUDE.md` / `AGENTS.md` に独自規約があればそれに従う |

単位をディレクトリ構成から推測しません。未宣言なら人間に尋ね、`git.units` に記録してから切ります。切った直後に `node "${HARNESS_ROOT}/tools/git-lint/git-lint.mjs" branch` を実行します（`git` ブロックがなければ「未検査」であり合格ではありません）。

## コミットしてよい条件

- 完了条件（[SKILL.md](../SKILL.md) §3）をすべて満たした後だけ。テスト成功だけでは足りません。
- Task が 1 つも実行中でないときだけ。git index は排他的資源です。
- 1 コミットに 1 論理変更。書式とロジック、2 つのスライスを混ぜません。どの周回がどのファイルを作ったか把握しているので、その境界で分割します。
- 1 PR は 1 スライス = 1 ユーザー価値。

## ガードレール（越えてはいけない）

- デフォルトブランチに直接コミットしない。
- push、PR 作成、マージは人間が明示的に依頼した場合だけ。マージ前に `gh pr checks <number>` を読み、失敗や保留があればマージしません。
- `--no-verify` を使わない。hook が失敗し、修正にコードや仕様の変更が要るなら、自ら直さず担当作成者に制約として渡し、完了条件を再実行してからコミットします。
- `reset --hard`、`push --force`、`clean -f` など破壊的・不可逆な操作をしない。
- 差分に秘密情報があればコミットせず停止して報告する。
- コミットはスライスの差分に限ります。stage 前に `git status` / `git diff` で確認し、このスライスのどの周回も作っていない変更は除外します（由来不明なら人間に尋ねる）。
- コミットの sha と subject を記録します。

---

# 書式リファレンス — Git 規約（コミットメッセージ / PR）

## コミットメッセージ規約（Conventional Commits）

```
<type>(<scope>): <subject>

<body>

<footer>
```

`type` と `subject` は必須、ほかは任意。`scope` は影響範囲で、モノレポでは必須（宣言済み単位名または `repo`。複数単位を変更するコミットはブランチの単位）。

### type 一覧

| type | 用途 |
| --- | --- |
| `feat` | 機能追加 |
| `fix` | バグ修正 |
| `docs` | 文書のみ |
| `refactor` | 振る舞いを変えない内部改善 |
| `test` | テスト追加・修正 |
| `perf` | 性能改善 |
| `style` | 書式のみ（ロジック不変） |
| `build` / `ci` | ビルドと CI 設定 |
| `chore` | その他の雑務（依存更新など） |

### subject（要約行）の規則

命令形・現在形、末尾のピリオドなし、約 50 文字。`traceconfig.json` の `policy.language`（未宣言なら日本語）で書くが `type` は英語のまま。

### body / footer

- **body**: 変更理由と背景（変更内容は差分で分かる）。約 72 文字で折り返す。
- **footer**: `Refs: #123` / `ADR-0007`、対応するユースケース `UC: UC-012`、破壊的変更 `BREAKING CHANGE: <説明>`。`UC:` trailer は `node "${HARNESS_ROOT}/tools/spec-lint/spec-lint.mjs" gate --message <file>` が UC と REQ の `active`、契約の `fixed` を検証します（モノレポではヘッダーの `scope` が示す単位の docs で引くため、`UC:` を持つコミットの scope を `repo` にしない）。`Co-Authored-By:` trailer は任意。

```
feat(reservation): 予約フォームの入力検証を追加

未入力・桁あふれ・不正文字を弾く。REQ-046（Unwanted behaviour）に対応。

Refs: #142
UC: UC-012
```

## Pull Request 規約

タイトルはコミットと同じ規則（`type(scope): summary`）。本文は次のテンプレートに従います（プロジェクトでは `.github/pull_request_template.md` に置く）。

```markdown
## 目的 / Why
<!-- この PR で達成すること。解決する課題。 -->

## 変更点 / What
-

## スライス
<!-- どのユーザー価値を縦貫させたか。縦に通る 1 本か。 -->

## テスト
- [ ] 追加/更新したテストと観点（失敗・空・境界・権限を含む）
- [ ] ローカルで緑（テスト緑は前提であって完成条件ではない）
- [ ] `trace-check` に新規違反なし（マージ条件 R-803）

## 関連
- Issue: #
- ADR: ADR-XXXX

## セルフレビュー
- [ ] 1 スライス（1 価値）に絞られている
- [ ] コーディング規約に沿っている
- [ ] 仕様変更は docs/goals（UC.md／REQ／contract.yaml）と docs/rules（BR）を正として更新した（逆流ルール R-801）
```
