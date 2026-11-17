---
id: ADR-0065
title: 完了の判定を Stop フックと CI で同じ検査の並びにし、どこまで実行するかを level で選ぶ
status: proposed
date: 2026-11-17
---

# ADR-0065 完了の判定を Stop フックと CI で同じ検査の並びにし、どこまで実行するかを level で選ぶ

## Context

完了を機械で判定する場所が 2 つあり、検査の並びを別々に持っていた。

- Stop フック（`tools/gate-hook/stop-gate.mjs`）: spec-lint → trace-check → contract-run → 利用プロジェクトのコマンド（typecheck / lint / test / system）。
- CI の再利用ワークフロー（`.github/workflows/spec-gate.yml`）: spec-lint と trace-check だけを、シェルで書いた unit ごとの繰り返しで実行する。契約の実例の実行とテストは実行しない。

この形には次の問題があった。

- フックで通っても CI では別の検査しか実行されない。CI でテストを実行したい利用プロジェクトは、同じ並びを自前のワークフローに書き直している。unit ごとの規則（docs を持つのに設定が無ければ失敗、など）も、フックとワークフローの 2 か所に書かれていた。
- monorepo では、フックがルートの設定の `commands` しか読まない。利用プロジェクトは unit ごとにコマンドを宣言しているので、unit のテストがフックで実行されない。
- 「失敗が減っていなければ人間へ渡す」の判定が、3 ラウンドの履歴を要るのに、既定の上限が 2 ラウンドなので働かない。
- 制限時間でコマンドを止めると、止まるのはシェルだけで、シェルの子として動くテストランナーが残る。
- 設定の形の検査（`lint config`）が、フックでも CI でも実行されない（ADR-0064 の代償）。
- harness 自身のテストを、まとめて実行する入口が無い。

## Decision

- 検査の並びを `tools/gate-hook/suite.mjs` の 1 か所に置く。Stop フック（`stop-gate.mjs`）と、CI・手元から呼ぶ `verify.mjs`（入口からは `harness verify`）が、同じ並びを実行する。`harness verify --hook` は Stop フックとして動く。
- 並びは、config-lint → spec-lint → trace-check → contract-run → `commands.typecheck` → `lint` → `test` → `commands.extra` の各コマンド → `commands.system`。
- どこまで実行するかを `--level` で選ぶ。既定は `full`。

  | level | 実行するもの |
  | --- | --- |
  | `lint` | config-lint、spec-lint、trace-check（読むだけ。利用プロジェクトのコマンドは実行しない） |
  | `fast` | `lint` に加えて、contract-run と `commands.typecheck` / `lint` / `test` / `extra` |
  | `full` | `fast` に加えて、`commands.system`（シナリオテスト） |

  level で実行しなかった検査は、skip として理由と一緒に表示する。`commands` の宣言の欠落は、どの level でも失敗にする。フックと CI のそれぞれでどの level を使うかは、利用プロジェクトが選ぶ。
- monorepo では、unit ごとに、unit の設定の `commands` を unit のディレクトリで実行する。ルートの設定の `commands` は、あれば unit の後に実行し、無くてもよい。`--unit <名前>` で検査する unit を絞れる。
- `commands.extra`（`{ "<名前>": "<コマンド>" }`）を足す。4 つのキーのほかに実行するコマンドを、`test` の後、`system` の前に、書いた順で実行する。
- 「失敗が減っていない」の判定を、直前のラウンドと同じ検査が落ちているか、にする（2 ラウンドの履歴で働く）。件数では比べない。型検査を直して次の lint で落ちた場合、件数は 1 件のままでも前へ進んでいるためである。
- 制限時間を過ぎたコマンドと、`verify` が止められたときに実行中のコマンドは、プロセスグループごと止める。止めたコマンドが、グループを抜けた孫のプロセスを残していても、コマンド自身の終了で打ち切る。`--timeout 0` は制限なし（これまでと同じ）。
- 再利用ワークフローは、spec-lint と trace-check を直接呼ぶのをやめ、`harness verify` を呼ぶ。入力 `level`（既定 `lint`）、`setup_command`、`timeout` を足す。既定の動きは、これまで実行していた spec-lint と trace-check に、config-lint と `commands` の宣言の検査が加わる。ワークフローは `verify --verbose` を呼び、通った検査の出力（警告など）もログに残す。入力 `spec_lint_args` が受けるのは `--ignore-legacy-layout` だけにする。
- harness 自身の設定に `commands.test` を宣言し、`harness verify` で harness 自身の検査とテストをまとめて実行できるようにする。
- 強制の所在: `tools/gate-hook/test/stop-gate.test.mjs` が、検査の並び、level ごとに実行するもの、unit ごとの実行、`commands.extra`、制限時間でプロセスを残さないこと、同じ検査が続けて落ちたときの解除、level と unit の指定で合格を使い回さないことを確かめる。`tools/gate-hook/test/verify.test.mjs` が、`verify` の終了コード、`--hook`、止められたときにプロセスを残さないことを確かめる。

## Consequences

**得られるもの**

- フックと CI が同じ検査を実行する。利用プロジェクトが、検査の並びと unit ごとの規則を自前のワークフローに書き直さなくてよい。
- monorepo で、unit のテストが完了の判定で実行される。
- シナリオテストが遅いプロジェクトは、フックを `fast`、CI を `full` にするなど、場所ごとに重さを選べる。選んだ結果は skip の行に出る。

**代償と今後の制約**

- 利用プロジェクトにとって、動きが変わる。版を上げるときに確かめる点は次のとおり。
  - monorepo では、設定を持つ unit のそれぞれに `commands` の 4 キーの宣言が要る。足りないと失敗する。これまではルートの `commands` だけを見ていた。
  - monorepo のフックが、全 unit のコマンドを実行するようになる。ターンの終わりごとには重すぎるなら、フックの `--level` を `lint` にするか、`--unit` で絞る。
  - 完了の判定に config-lint が加わる。設定の最上位に、ひな形に無いキーがあると失敗する。
  - `commands` に 4 キーと `extra`、`contract_adapter` 以外のキー（`test_workers` など）を書いていても、実行されない。実行するなら `extra` に移す。黙って無視される点は変わっていない（`commands` の中のキーの名前は検査していない）。
- level を `lint` や `fast` にしたフックは、実行しなかった検査を保証しない。その分を CI の level で補うかどうかは、利用プロジェクトの設定に任せている。フックも CI も低い level のままなら、テストはどこでも実行されない。これを機械では確かめていない。
- monorepo で、ある unit の変更が別の unit に効くか（共有パッケージを変えた、など）は判断しない。`--unit` で絞るかどうかは呼ぶ側が決める。変えたファイルから unit を選ぶ仕組みは、この変更に含まない。
- 再利用ワークフローで `fast` / `full` を使うには、依存の導入を `setup_command` に書く必要がある。Node のバージョンの選択、キャッシュ、ブラウザの導入など、それ以上の準備が要る利用プロジェクトは、自前のワークフローから `harness verify` を呼ぶ。
- フックの skip の行の先頭が `[stop-gate]` から `[verify]` に変わる。フックの出力を文字列で探している利用プロジェクトは、直す必要がある。
- Stop フックが検査の途中で止められた場合（フックの設定の `timeout` を過ぎた、など）、ラウンドも拒否ログも記録されない。これまでも同じだが、monorepo で全 unit のコマンドを実行するようになり、起きやすくなった。フックの `timeout` を、実行する level の合計より長くする。
- グループを抜けた孫のプロセスそのものは止めない（止める手段が無い）。
- 再利用ワークフローの変更は、GitHub Actions では実行して確かめていない。
- プロセスグループごと止める動きは POSIX だけである。Windows では、これまでどおりシェルだけを止める。
- 4 つ以外のシグナル（SIGKILL など）で `verify` だけが止められると、実行中のコマンドは残る。
- `tools/gate-hook/` に、フックではない `verify.mjs` と `suite.mjs` が入り、ディレクトリの名前が中身より狭くなった。置き場の整理は、ツールのファイルの名前を見直すときに行う。

## 却下した選択肢

- **CI では必ずシナリオテストまで実行する**: 確実だが、CI の時間と利用時間が増える。どこまで実行するかは、プロジェクトの大きさと CI の予算で変わるので、利用プロジェクトが選べるようにした。
- **再利用ワークフローの側に、テストまでの手順を書く**: 検査の並びがフックとワークフローの 2 か所に残る。ワークフローは `harness verify` を呼ぶだけにする。
- **monorepo で、変えたファイルから検査する unit を自動で選ぶ**: 共有パッケージのように、変更がほかの unit に効く置き場は、プロジェクトごとに違う。選び方を誤ると、検査されないまま通る。呼ぶ側が `--unit` で明示する形にとどめる。
- **level を設定ファイルに書く**: フックと CI で別の level を使うので、1 つの値にならない。呼ぶ側の引数にする。
- **`stop-gate.mjs` を消して `verify.mjs` だけにする**: 利用プロジェクトのフックの設定が、いまのファイルを直接指している。入口（`harness verify --hook`）へ移ってから消す。
