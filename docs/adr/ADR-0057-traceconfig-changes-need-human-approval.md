---
id: ADR-0057
title: 検査の範囲を決める traceconfig.json の変更は人間が承認し、gate-hook が書き込みごとに承認を求める
status: proposed
date: 2026-10-20
---

# ADR-0057 検査の範囲を決める traceconfig.json の変更は人間が承認し、gate-hook が書き込みごとに承認を求める

## Context

ADR-0056 で紐づきの例外を廃止し、対象が本当に無い範囲だけを `traceconfig.json` に `{ "none": "<理由>" }` と宣言させた。検査を外せる経路はこの宣言だけになったが、`traceconfig.json` は誰でも書き換えられた。

- gate-hook は `traceconfig.json` への書き込みを、`docs/` と同じく常に許可していた。
- develop のオーケストレーターが自ら書くものの一覧に `traceconfig.json` は無いが、それを止める仕組みは無い。
- 子 agent が検査の失敗を通すために none を書く、`unit_dirs` や `tests.dirs` を狭める、`commands.test` を `exit 0` にする、といった変更は、作成者が自分の成果物の判定を緩めることになり、作成者 ≠ 判定者に反する。

none の理由が正しいか、宣言の範囲が妥当かは、機械では判定できない。判定できないものは人間ゲートで扱う（3 つの人間ゲートの考え方）。

## Decision

- `traceconfig.json` の変更は、`docs/` の SSOT の人間ゲートに含める。人間ゲートは 3 つのまま（docs の SSOT、UI の見た目、DB スキーマ）で、`traceconfig.json` は「検査の範囲を決める SSOT」として 1 つ目に入る。
- gate-hook（PreToolUse）は `traceconfig.json` への Write / Edit を止めず、`permissionDecision: "ask"` で人間に承認を求める。承認するかどうかは人間が差分を見て決める。判定は拒否ログに `ask` / `traceconfig` として残し、`gate-log --summary` が件数を出す。
- 対象は `traceconfig.json` の全体（none の宣言、注釈の正規表現、宣言の範囲、`commands`）とする。どのキーも検査の範囲を変えられるため。
- 強制は gate-hook で、利用プロジェクトが有効にしたときだけ効く。無効なら develop の不変条件（人間ゲート）として orchestrator が守る説得による統制（R-901）になる。

## Consequences

- 良: agent が検査を外すために `traceconfig.json` を書き換える経路が、人間の承認を通らない限り無くなる。
- 良: 承認の件数がログに残り、検査の範囲がどれだけ動いているかを人間が追える。
- 悪: 初めてひな形を置くときや、移行で宣言の範囲を広げるたびに承認が必要になり、作業が止まる。
- 悪: gate-hook が見るのは Write / Edit / NotebookEdit だけで、Bash のコマンド（`sed`、リダイレクトなど）による書き換えは止められない。これは実装コードへの書き込みゲートと同じ制約。
- 悪: PreToolUse の承認を求める仕組みは Claude Code の hook の機能で、ほかのプロバイダーでは同じ強制が無い。その場合は人間ゲートの説得による統制だけになる。
- 悪: 人間が差分を読まずに承認すれば、検査は外れる。承認の質は機械では担保できない。

## 却下した選択肢

- **`traceconfig.json` への書き込みを止める（exit 2）**: 人間ゲートを通した正当な変更も agent が書けなくなり、人間が手で編集するしかなくなる。承認を求めれば、差分を見たうえで agent に書かせられる。
- **none の宣言ごとに accepted の ADR の参照を求める**: ADR を `accepted` にするのもオーケストレーターで、承認の主体が人間であることを機械は確かめられない。none 以外のキー（`commands`、宣言の範囲）の書き換えも防げない。
- **none の数を台帳で縛る**: 台帳の更新がもう 1 つの例外の経路になる（ADR-0056 で廃止した baseline と同じ問題）。
- **4 つ目の人間ゲートとして独立させる**: 人間ゲートを増やさないという不変条件を変えることになる。`traceconfig.json` は検査の範囲を決める SSOT なので、docs の SSOT ゲートに含めれば足りる。
