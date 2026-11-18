---
id: ADR-0071
title: 同梱ツールのファイルの名前を、コマンドの名前と 1 つにする
status: accepted
date: 2026-11-18
supersedes: ADR-0063
---

# ADR-0071 同梱ツールのファイルの名前を、コマンドの名前と 1 つにする

## Context

ADR-0063 で、同梱ツールの入口を `harness <コマンド>` の 1 つにし、コマンドの名前を「何をするか」で選べるようにした。ただし、ツールのファイルと置き場の名前は古いままで、入口が「コマンドの名前 → ファイル → 前に付ける引数」の対応表を持っていた。その結果、同じものに名前が 2 つある状態が残った。

- 利用プロジェクトと手順は `harness lint spec` と呼ぶのに、出力の頭には `spec-lint:` と出る。違反を読んだ人は、出力の名前から、どのコマンドの結果かを対応表で引き直すことになる。
- 文書（README、skill、agent、テンプレート）が、コマンドの名前と、ファイルの名前と、ツールの名前（`spec-lint gate` など）を混ぜて書いていた。同じ検査を指す言い方が 3 通りあった。
- 1 つのファイルに複数の役目が入ったままだった。仕様の文書の検査と、コミットが指す UC の状態の検査と、OpenAPI の変換が 1 つのファイルにあり、紐づきの検査と、採番と、索引が 1 つのファイルにあった。入口の表は、ファイルの中のどの役目を選ぶかを、前に付ける引数（`validate`、`gate`、`--next`）で表していた。
- 完了の判定は、1 回の実行と Stop フックで、入口のファイルが別だった。

依頼主の判断は、「コマンドの名前」と「ファイルの名前」が別にあるのをやめ、事実を 1 つにすること。

## Decision

- **1 つのコマンドに 1 つのファイル。場所はコマンドの語から決まる。** コマンドの語を `-` でつないだものが、置き場の名前とファイルの名前になる（`tools/<名前>/<名前>.mjs`）。`harness lint git branch` は `tools/lint-git-branch/lint-git-branch.mjs`。決め方は `tools/_shared/command-file.mjs` の 1 か所に置き、入口と、検査の並び（完了の判定）が同じ関数を使う。
- **入口は、名前とファイルの対応表を持たない。** `bin/harness.mjs` が持つのは、コマンドの一覧（語、分類、1 行の説明）だけ。前に付ける引数も持たない（ファイルが 1 つの役目だけを持つので、要らない）。一覧に無い名前は、これまでどおり使い方エラー。`harness lint`（まとめて実行）は残す。
- **ADR-0063 から引き継ぐこと。** 入口は `bin/harness.mjs` の 1 つ。コマンドの名前は、読むだけ（`lint …`）、実行する（`run cases`、`verify`、`guard`）、補助（`next-id`、`index`、`migrate reqs`、`convert`）に分ける。入口は引数をそのまま渡し、検査の中身を持たない。止められたときのシグナルの扱い、`lint` をまとめて実行するときの決まり、npm のパッケージとしては配らないことも、ADR-0063 のとおり。
- **複数のコマンドが使う処理は `tools/_shared/` に置く。** 仕様の木の読み方、契約の語彙、紐づきの読み方（検査・採番・索引が共有する）、検査の並び、フックの記録など。コマンドのファイルは、引数の解釈と出力と、そのコマンドだけが使う検査の中身を持つ。コマンドのファイルが、別のコマンドのファイルを読むことはしない。
- **Stop フックは `harness verify --hook`、書き込み前の関門は `harness guard`。** 完了の判定の 2 つの動かし方（1 回の実行、Stop フック）は、`tools/verify/verify.mjs` の 1 つのファイルに置く。
- **出力の頭に付く名前、文書、コメントは、コマンドの名前で書く。** 文中では「lint spec」、実行する形は `harness lint spec`。古い呼び名は使わない。
- **説明（README）は、コマンドごとに 1 つ**（`tools/<コマンド>/README.md`）。複数のコマンドにまたがる説明は、どれか 1 つを正本にして、ほかはそこを指す（設定の宣言と義務表は lint refs、フックの設定例と拒否ログは guard、検査の並びは verify、`git` ブロックは lint git branch）。
- **CI の再利用ワークフローは `.github/workflows/verify.yml`**（実行するコマンドの名前）。入力 `spec_lint_args` は `ignore_legacy_layout`（真偽値）にした。
- **検査の動きは変えない。** 判定の条件、違反の文（頭に付く名前を除く）、終了コード、検査の番号（C・X・V・E・K・B・M）、設定のキー、フックの記録の置き場（`.harness-gate/`）、採番の予約のファイル（`.trace-reservations.json`）は、この変更の前と同じ。

改名の対応（古い呼び名は、この表と、`docs/apm.md` の移行の節にだけ書く）:

| これまでのファイル（と、選んでいた役目） | コマンド | これからのファイル |
| --- | --- | --- |
| `tools/config-lint/config-lint.mjs` | `lint config` | `tools/lint-config/lint-config.mjs` |
| `tools/spec-lint/spec-lint.mjs validate` | `lint spec` | `tools/lint-spec/lint-spec.mjs` |
| `tools/spec-lint/spec-lint.mjs gate` | `lint git uc` | `tools/lint-git-uc/lint-git-uc.mjs` |
| `tools/spec-lint/spec-lint.mjs convert` | `convert` | `tools/convert/convert.mjs` |
| `tools/trace-check/trace-check.mjs` | `lint refs` | `tools/lint-refs/lint-refs.mjs` |
| `tools/trace-check/trace-check.mjs --next` | `next-id` | `tools/next-id/next-id.mjs` |
| `tools/trace-check/trace-check.mjs --index` | `index` | `tools/index/index.mjs` |
| `tools/exec-check/exec-check.mjs entry` | `lint entry` | `tools/lint-entry/lint-entry.mjs` |
| `tools/exec-check/exec-check.mjs coverage` | `lint coverage` | `tools/lint-coverage/lint-coverage.mjs` |
| `tools/exec-check/exec-check.mjs entries` | `lint entries` | `tools/lint-entries/lint-entries.mjs` |
| `tools/git-lint/git-lint.mjs branch` | `lint git branch` | `tools/lint-git-branch/lint-git-branch.mjs` |
| `tools/git-lint/git-lint.mjs message` | `lint git message` | `tools/lint-git-message/lint-git-message.mjs` |
| `tools/contract-run/contract-run.mjs` | `run cases` | `tools/run-cases/run-cases.mjs` |
| `tools/gate-hook/verify.mjs` | `verify` | `tools/verify/verify.mjs` |
| `tools/gate-hook/stop-gate.mjs` | `verify --hook` | `tools/verify/verify.mjs` |
| `tools/gate-hook/gate-hook.mjs` | `guard` | `tools/guard/guard.mjs` |
| `tools/docs-migrate/merge-reqs.mjs` | `migrate reqs` | `tools/migrate-reqs/migrate-reqs.mjs` |
| `tools/gate-hook/suite.mjs`、`tools/gate-hook/gate-log.mjs` | （共有の処理） | `tools/_shared/suite.mjs`、`tools/_shared/gate-log.mjs` |
| `tools/_shared/goals-tree.mjs` | （共有の処理） | `tools/_shared/spec-tree.mjs`（仕様の木）、`tools/_shared/contract-vocab.mjs`（契約の語彙） |
| `.github/workflows/spec-gate.yml` | | `.github/workflows/verify.yml` |

強制の所在:

- `bin/test/harness.test.mjs` が、入口の一覧にあるコマンドのすべてに、決まった場所のファイルがあること、各コマンドが引数をそのまま受け取ること、`tools/` の直下に、コマンドの置き場と `_shared` と、理由を書いて認めたもの（`apm`、`codex-sync`）しか無いこと、コマンドの置き場に実行するファイルが 1 つだけであることを確かめる。
- `bin/test/names.test.mjs` が、追跡しているファイルの中身と名前に、古い呼び名が残っていないことを確かめる。認めるのは、`docs/adr/` と、`docs/apm.md` の移行の節と、凍結済みの保留の一覧の「昇格先」の語彙（下記）だけ。
- 「検査の動きを変えない」は、機械で守り続ける仕組みを持たない。この変更のときに、変更の前の入口と後の入口に同じ入力を与えて、終了コードと出力を比べて確かめた。以後は、各コマンドのテストが守る。

## Consequences

**得られるもの**

- コマンドの名前が分かれば、ファイルの場所、README の場所、テストの場所、出力の頭の名前が、対応表なしで分かる。
- コマンドを足すときに書く場所が、入口の一覧の 1 行と、決まった場所のファイルだけになる。入口の表と、テストの行き先の一覧を合わせる作業が無くなる。
- 1 つのファイルが 1 つの役目だけを持つので、あるコマンドに、別のコマンドの引数を渡せなくなる。

**代償と今後の制約**

- **ツールのファイルを直接実行していた利用プロジェクトは、版を上げると動かなくなる。** フックの設定、CI、手順書が古いパスを持っていれば、入口のコマンドに書き換える。Claude Code のフックは、終了コードが 2 でない失敗では止めないので、直し忘れると関門が黙って外れる。再利用ワークフローを `uses:` で呼んでいるプロジェクトは、名前と入力を直す。ブランチ保護の必須チェックの名前も変わる。移し方は `docs/apm.md` に書いた。入口のコマンドで呼んでいるプロジェクトは、コマンドの名前も引数も変わらない。
- 出力の頭の名前と、完了の判定が出す検査の名前（`lint spec`、`lint refs`、`lint config`、`run cases`）が変わる。出力を文字で照合しているスクリプトは直す。完了の判定が出す `entry`・`entries`・`coverage` は、コマンドの名前（`lint entry` など）にそろえていない。この変更では、古い呼び名を消すことまでを範囲にした。
- 拒否ログの `hook` の値が変わる（`guard`、`verify`）。集計は新しい値だけを数えるので、版を上げる前の行は、集計に入らなくなる。
- **凍結済みの保留の一覧（`DEFERRED.md`）の「昇格先」の語は、古い呼び名のまま残る。** 利用プロジェクトの凍結済みの行が持っている値で、行は書き換えない（ADR-0068）。語彙を変えると、既存の行がすべて違反になり、検査の動きが変わる。古い呼び名が残る、ただ 1 つの場所になる。
- 1 つのファイルがオプションで別の役目を受けていた呼び方は、使い方エラーになる（`harness lint refs --next adr`、`harness lint refs --index`、`harness index --only C9`、種類を渡さない `harness next-id` など）。意味のある呼び方（`harness next-id adr`、`harness index`）は変わらない。
- 共有の処理の置き場（`tools/_shared/`）が大きくなる。役目ごとにファイルを分け、何を持ち、どのコマンドが使うかを `tools/_shared/README.md` の表に書く。この表は手で保つ。
- 拒否ログの集計（`tools/_shared/gate-log.mjs --summary`）だけは、入口にコマンドが無く、ファイルを直接実行する。コマンドを足すと検査の一覧が変わるので、この変更には入れなかった。
- コマンドの語に `-` を含むもの（`next-id`）と、語をつないだもの（`lint-refs`）が、置き場の名前では同じ形になる。語の並びが違う 2 つのコマンドが同じ置き場を指す名前（`a b-c` と `a-b c`）は付けない。

## 却下した選択肢

- **入口の対応表を残し、ファイルの名前は変えない（ADR-0063 のまま）**: 利用プロジェクトへの影響は無いが、同じものに名前が 2 つある状態が続く。文書と出力が 2 つの名前を混ぜる原因が残る。
- **ファイルは移すが、古いパスに、新しいファイルを呼ぶだけの薄いファイルを残す**: ツールを直接実行している利用プロジェクトは動き続けるが、古い呼び名のファイルが残り、どちらが正本かが分からなくなる。古い呼び名が残っていないことを機械で守れなくなる。
- **置き場を入れ子にする（`tools/lint/git/branch.mjs`）**: 語と階層が対応して読みやすいが、同じ階層に、コマンドのファイルと、下の階層の置き場と、テストが混ざる。`tools/` の直下を見て、コマンドの一覧と突き合わせる検査が書きにくくなる。
- **コマンドのファイルには引数の解釈と出力だけを置き、検査の中身はすべて `tools/_shared/` に置く**: 置き場の決まりは単純になるが、1 つのコマンドしか使わない検査の中身（仕様の文書の書式の検査、紐づきの検査の本体など）まで共有の置き場に入り、「共有」が何を指すかが分からなくなる。共有の置き場には、2 つ以上のコマンドが使うものだけを置く。
- **凍結済みの保留の一覧の「昇格先」の語も、新しい名前に変える**: 古い呼び名が完全に無くなるが、利用プロジェクトの凍結済みの行を書き換えさせることになり、検査の動きを変えないという範囲から外れる。
- **再利用ワークフローの名前を変えない**: 利用プロジェクトの `uses:` を直さずに済むが、ワークフローの名前だけが、実行するコマンドと別の名前のまま残る。ツールを直接呼んでいる箇所の書き換えと同じときに直すほうが、移行が 1 回で済む。
