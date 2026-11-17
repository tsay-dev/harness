---
id: ADR-0063
title: 同梱ツールの入口を harness コマンド 1 つにし、何をするかで選ぶ名前にそろえる
status: proposed
date: 2026-11-17
---

# ADR-0063 同梱ツールの入口を harness コマンド 1 つにし、何をするかで選ぶ名前にそろえる

## Context

同梱ツールは、ツールごとに別のファイルを直接呼ぶ形になっている（`tools/spec-lint/spec-lint.mjs validate`、`tools/trace-check/trace-check.mjs`、`tools/gate-hook/stop-gate.mjs` など）。この形には次の問題がある。

- 名前から何をするかが分からない。`spec-lint gate` はコミットが指す UC の状態を調べる検査で、`gate-hook` は書き込みの前に動くフック、`stop-gate` は完了の判定である。3 つとも「gate」だが役目が違う。
- 読むだけの検査と、利用プロジェクトのコマンドを実行するものが、名前で区別できない。`trace-check` は読むだけで、`contract-run` と `stop-gate` はテストなどを実行する。
- 同じツールに別の役目が入っている。次の空き ID の予約と索引の出力は、検査ではないのに `trace-check` のオプションになっている。
- 利用プロジェクトのフック、CI、手順の文書が、ツールのファイルのパスを直接持つ。ツールの置き場や分け方を変えると、利用プロジェクトの側も直すことになる。

## Decision

- 入口を `bin/harness.mjs` の 1 つにする。利用プロジェクトは `node <harness のルート>/bin/harness.mjs <コマンド>` で呼ぶ。
- コマンドの名前は、次の 3 つに分ける。

  | 分け方 | コマンド | 行き先 |
  | --- | --- | --- |
  | 読むだけ | `lint spec` | `spec-lint validate` |
  | 読むだけ | `lint refs` | `trace-check` |
  | 読むだけ | `lint git branch` / `lint git message` | `git-lint branch` / `git-lint message` |
  | 読むだけ | `lint git uc` | `spec-lint gate` |
  | 実行する | `run cases` | `contract-run` |
  | 実行する | `verify` | `stop-gate` |
  | 実行する | `guard` | `gate-hook` |
  | 補助 | `next-id <種類>` | `trace-check --next` |
  | 補助 | `index` | `trace-check --index` |
  | 補助 | `convert` | `spec-lint convert` |

  ファイルを書き換えず、利用プロジェクトのコマンドも実行しない検査は、すべて `lint` の下に置く。`lint` だけで呼ぶと、引数なしで意味が決まる 3 つ（`lint spec`、`lint refs`、`lint git branch`）を続けて実行する。
- 入口は、名前から同梱ツールを選んで引数をそのまま渡すだけにする。検査の中身、引数の解釈、終了コードは、渡した先のツールのものをそのまま使う。入口に検査を書かない。入口が SIGINT / SIGTERM / SIGHUP で止められたら、渡した先にも同じシグナルを送る。行き先のファイルが無ければ 2 で終わる。
- 名前と行き先の対応は、`bin/harness.mjs` の表 1 つを正本にする。引数なしで呼んだときの一覧も、この表から作る。
- npm のパッケージとしては配らない。利用プロジェクトは、これまでどおり harness の checkout を `.harness/` に置いて版を固定する。npm で配る形は、checkout では足りない事情が出たときに改めて決める。
- 強制の所在: `bin/test/harness.test.mjs` が、表にあるツールが `tools/` に実在すること、各コマンドが決めた行き先に引数をそのまま渡すこと、実行するディレクトリ、終了コード、標準入力、標準エラー出力がそのまま届くこと、差し替えなしで `tools/` の実物が呼ばれること、入口だけを止めても渡した先が動き続けないこと、無い名前では何も実行せず 2 で終わることを確かめる。

## Consequences

**得られるもの**

- 名前から、読むだけの検査か、何かを実行するものかが分かる。
- 利用プロジェクトが持つのは入口のパスとコマンドの名前だけになる。ツールの置き場や分け方を変えても、利用プロジェクトの側は直さなくてよい。
- 引数なしで呼べば、使えるコマンドの一覧と 1 行の説明が出る。

**代償と今後の制約**

- この変更の時点では、呼び出し方が 2 通りある。`packages/` 配下の skill・agent・instruction、`templates/`、ツールの README、再利用ワークフロー、`README.md`・`CLAUDE.md`・`docs/apm.md` の一部は、まだツールのファイルを直接指している。どちらで呼んでも検査の結果と終了コードは同じ。違いは、行き先のファイルが無いときの終了コードだけである（入口は 2、Node にファイルを直接渡すと 1）。これらを新しい名前へ直すのは、設定ファイルを 1 つにまとめる変更と、`verify` を作り直す変更のときに行う。それまで、新しい検査を足すときは `bin/harness.mjs` の表にも足す。
- `verify` と `guard` の中身は、いまの `stop-gate` と `gate-hook` のままである。`stop-gate` の既知の不具合（monorepo でユニットの `commands` を実行しない、失敗が減らないことの判定が既定の上限では働かない）は、この変更では直らない。
- `lint` をまとめて実行する形は、いまいるディレクトリを 1 つの単位として検査する。monorepo のルートでユニットごとに回す動きは持たない（`verify` が担う）。
- 入口を通すと、Node のプロセスが 1 つ増える。起動の時間は 1 回あたり数十ミリ秒である。
- 実行可能な資産の置き場に `bin/` が加わる。`tools/` と同じく APM パッケージの外に置き、checkout と一緒に配る。

## 却下した選択肢

- **ツールのファイルの名前を直接変える**: 利用プロジェクトのフックと CI が古いパスを持っているので、版を上げたとたんに動かなくなる。入口を先に置けば、利用プロジェクトは入口へ移ってから、中の名前を安全に変えられる。
- **`package.json` の `scripts` に並べる**: harness は利用プロジェクトの `node_modules` に入らないので、利用プロジェクトから `npm run` では呼べない。Node 以外のスタックの利用プロジェクトに `package.json` を求めることにもなる。
- **npm のパッケージとして配り、`npx harness` で呼ぶ**: 配る経路が checkout と npm の 2 本になる。テンプレートとモデルの対応表は checkout から読むので、checkout は無くせない。
- **検査と実行を区別せず、ツールの名前のまま並べる（`harness spec-lint` など）**: 入口は 1 つになるが、名前から役目が分からない問題が残る。
