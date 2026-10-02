---
id: ADR-0040
title: モノレポでは UC: トレーラの UC を、コミットの scope が指す unit の docs で引く
status: proposed
date: 2026-10-02
---

# ADR-0040 モノレポでは UC: トレーラの UC を、コミットの scope が指す unit の docs で引く

## Context

`spec-lint gate --message` は、コミットメッセージの `UC: UC-nnn` トレーラを拾い、カレントディレクトリの `docs/goals` からその UC を探して、UC と REQ が `active`・契約が `fixed` であることを確かめる（draft のまま実装が進むのを止める）。再利用ワークフロー `.github/workflows/spec-gate.yml` は、これを PR の各コミットに対してホストのルートで実行する。

モノレポのホスト（`traceconfig.json` に `git.units` を宣言したホスト。ADR-0039）では、docs を unit のディレクトリごとに持ち、UC の番号も unit ごとに振る。同じ `UC-012` が複数の unit に存在し得るので、トレーラだけではどの unit の UC か決まらない。ルートには `docs/goals` が無いため、ルートで実行した gate は、正しいトレーラも「対応する UC が無い」で落とす。

一方、モノレポではコミット 1 行目の `scope` が宣言された unit か `repo` であることを git-lint がすでに検査している（ADR-0039 の M3）。`commit.md` は、ブランチの unit を「スライスのユーザー価値が現れるアプリ（UC のアクターが使うアプリ）」と定めており、UC はその unit の docs にある。

## Decision

- モノレポでは、`UC:` トレーラの UC を、そのコミットの `scope` が指す unit の docs（`<unit のディレクトリ>/docs`）で引く。トレーラの書式は変えない。
- `UC:` トレーラを持つコミットの `scope` が宣言された unit でないとき（`repo`、scope なし、未宣言の名前）、gate は違反として落とす。どの unit にも属さない変更は UC を名乗れない。
- トレーラを持たないコミットは、これまでどおり検査せずに通す（オプトイン）。`scope` も見ない。
- `gate --uc UC-nnn` は、モノレポのルートでは `--unit <名前>` で unit を指定する。指定が無ければ使い方の誤り（終了コード 2）とする。
- 強制の所在は `tools/spec-lint` の `gate` である。`traceconfig.json` の `git.units` があればモノレポとして動き、無ければ従来どおりカレントディレクトリの docs を見る。ワークフローの gate ステップは変えない。
- spec-lint が `git.units` から読むのは、名前とディレクトリの対応だけである。units の書式（名前の形、ディレクトリの実在、`repo` を宣言できないこと）の検査は git-lint が持つ。

## Consequences

- モノレポのホストで、`UC:` トレーラの検査がルートから実行できる。CI、commit-msg フック、orchestrator の手元確認が同じコマンドで済む。
- unit のディレクトリをカレントにして実行した場合は、そこに `git.units` が無いので従来どおり動く。
- 1 つのコミットが名乗れる UC は、1 つの unit のものに限られる。複数の unit の UC にまたがる変更は、unit ごとにコミットを分ける必要がある。
- spec-lint が初めて `traceconfig.json` を読む。`git.units` の読み手が git-lint と spec-lint の 2 つになり、宣言の形を変えるときは両方を直すことになる。コミット 1 行目から scope を取り出す正規表現も、git-lint と spec-lint の両方にある。
- UC が実際にその unit に属するかどうかは、その unit の docs に UC があるかで決まる。scope の選び方が正しいか（ユーザー価値が現れるアプリを選んだか）は、これまでどおり機械では決まらない。
- 再利用ワークフローの `spec-lint validate` と `trace-check` は、モノレポでもルートで 1 回走るだけで、unit ごとの docs は検査しない。この決定はそこを変えない。

## 却下した選択肢

- **トレーラに unit を書く（`UC: app-a/UC-012`）**: scope と同じ事実をコミットに 2 回書くことになり、食い違いを検査する規則がもう 1 つ要る。トレーラの書式も変わる。
- **全 unit の docs から UC を探す**: 同じ番号が複数の unit にあると決まらない。1 つしか無いときだけ通すと、別の unit に同じ番号ができた時点で過去と同じ書き方のコミットが落ちる。
- **UC の番号をリポジトリ全体で一意にする**: docs を unit ごとに持つホストで採番だけを共有することになる。採番（`trace-check --next`）と衝突の検査（C12）は docs ごとに行うので、unit をまたいで番号を振る仕組みを別に作る必要がある。
- **scope → unit の解決を git-lint に置く**: git-lint は名前と文面の書式だけを決めるツールで（ADR-0039）、UC の状態を見る gate とは責務が違う。解決だけを git-lint のサブコマンドにすると、呼び出し側（ワークフローやフック）に 2 つのツールをつなぐシェルが要る。
- **ワークフローのシェルで scope を読み、unit のディレクトリへ移動して gate を呼ぶ**: 解決の規則が YAML の中に入り、テストで固定できない。再利用ワークフローを呼べないホストは、同じシェルを写すことになる。
