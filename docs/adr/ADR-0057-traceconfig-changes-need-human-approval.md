---
id: ADR-0057
title: 検査の範囲・検査器・承認状態を変える書き込みは人間が承認し、gate-hook が書き込みごとに承認を求め、CI は固定した版の検査器を使う
status: proposed
date: 2026-10-20
---

# ADR-0057 検査の範囲・検査器・承認状態を変える書き込みは人間が承認し、gate-hook が書き込みごとに承認を求め、CI は固定した版の検査器を使う

## Context

ADR-0056 で紐づきの例外を廃止し、対象が本当に無い範囲だけを `traceconfig.json` に `{ "none": "<理由>" }` と宣言させ、active な文書が求める範囲は none にできないとした（義務表 C26）。検査を外せる経路はこの宣言だけになったが、次の書き込みは誰でもできた。

- `traceconfig.json`（none の宣言、範囲、注釈の正規表現、`commands`）。gate-hook は `docs/` と同じく常に許可していた。完全一致の `traceconfig.json` しか見ないので、大文字小文字を変えたパスや unit の `traceconfig.json` も漏れた。
- 検査器そのもの（`.harness/**`）、hook の設定（`.claude/settings.json`）、CI のワークフロー（`.github/workflows/**`）。spec-gate.yml は利用プロジェクトの `.harness` を実行したので、PR で書き換えた検査器を CI が実行しえた。
- docs の status。active を draft に戻せば義務表の義務が消え、UC を active・契約を fixed にすれば、人間が承認する前に実装着手ゲートが開く。
- stop-gate の状態（`.harness-gate/state.json`）。偽造すれば「変更なし」として検査を飛ばせた。stop-gate は stdin を読めた後の例外で終了を許し、gate-hook は実装コードの判定中の例外で書き込みを止めなかった。

子 agent が検査の失敗を通すために none を書く、範囲を狭める、`commands.test` を `exit 0` にする、status を戻すといった変更は、作成者が自分の成果物の判定を緩めることになり、作成者 ≠ 判定者に反する。none の理由や範囲の妥当性は機械では判定できないので、人間ゲートで扱う。

## Decision

- 検査の範囲・検査器・承認状態の変更は、`docs/` の SSOT の人間ゲートに含める。人間ゲートは 3 つのまま（docs の SSOT、UI の見た目、DB スキーマ）。
- gate-hook（PreToolUse）は次の Write / Edit を止めず、`permissionDecision: "ask"` で人間に承認を求め、拒否ログに `ask` / 理由を残す（`gate-log --summary` が件数を出す）。

  | 書き込み | 理由（ログ） |
  | --- | --- |
  | `**/traceconfig.json`（大文字小文字を無視。unit のものも） | `traceconfig` |
  | `.harness/**`（検査器） | `harness` |
  | `.claude/settings*.json`、`.codex/` `.cursor/` `.grok/` `.agents/` 直下の設定、プロジェクト外のユーザー設定（hook の設定） | `hook-settings` |
  | `.github/workflows/**` | `workflow` |
  | docs の status の降格（`active` / `fixed` / `living` / `frozen` から、それ以外の値・status 行の削除・語彙の外の値へ）と、判定中の例外 | `status-down` |
  | アクター表で人間のアクターを削除する・種別を「システム」に変える、active な `UC.md` の `actor:` を変える（C15 の義務が減る） | `actor-kind` |
  | `UC.md` の `active` と契約の `fixed` への昇格（新規作成で書く場合も） | `status-up-gate` |

  それ以外の昇格（REQ / BR / NFR / GOAL の `active`、単一文書の `living` / `frozen`）と status を持つ新規作成は止めず、`pass` / `status-up` と記録する。義務を増やす向きで、検査を緩めないため。`phase:` は agent の進捗なので対象外。パスは大文字小文字を無視して比べ、契約の `x-status` と frontmatter は `tools/_shared/` の共有パーサーで読む（ツールごとに別の値に読むと、承認を通らない昇格が生じる）。
- **ゲート自身を守る。** `.harness-gate/` への書き込みは止める（ログと状態はフックだけが書く）。gate-hook は `--code` に一致した後の例外で書き込みを止める（fail-closed）。stop-gate は stdin を読めた後の例外で終了を止め（`stop_hook_active` でラウンド上限なら解放）、変更の検出の指紋に未追跡ファイルの中身、`traceconfig.json`、使う harness ツールと `tools/_shared/` のハッシュを入れる。阻止の文言は「`traceconfig.json` を緩めて通さない。人間ゲート待ちや後続の担当の成果物でしか直せない失敗は未達として報告して終える」と書き、解放したときは `systemMessage` で利用者に知らせる。
- **CI は固定した版の検査器を使う。** spec-gate.yml は必須入力 `harness_ref` を取り、その ref の tsay-dev/harness を `$RUNNER_TEMP` に checkout して実行する。利用者の `.harness` は検査に使わず、HEAD が `harness_ref` と違えば警告するだけ。呼び出し例では `uses: …@vX` と `harness_ref: vX` を同じ値で示す。monorepo では unit ごとに実行する。PR では、変わった `traceconfig.json`、docs の `status:` / 契約の `x-status:` の行、`.github/workflows/` をジョブ要約に出す（止めない）。
- merge 時の強制として、`traceconfig.json`、`docs/**`、`.github/workflows/**` を CODEOWNERS とブランチ保護で必須レビューにすることを README で推奨する（テンプレートは置かない）。
- 強制は gate-hook と stop-gate で、利用プロジェクトが有効にしたときだけ効く。無効なら develop の不変条件（人間ゲート）として orchestrator が守る説得による統制（R-901）になる。

## Consequences

- 良: agent が検査を外すために `traceconfig.json`・検査器・hook の設定・ワークフローを書き換える経路と、status を戻して義務を消す経路が、Claude Code の Write / Edit では人間の承認を通らない限り無くなる。
- 良: 実装着手ゲート（UC の active と契約の fixed）を agent が自力で開けない。1 スライスにつき 2 回の承認で済む。
- 良: 承認の件数がログに残り、PR のジョブ要約にも変更が出るので、検査の範囲がどれだけ動いているかを人間が追える。
- 悪: Bash（`sed`、リダイレクトなど）と Claude Code 以外のプロバイダーでは、`traceconfig.json` と status の変更は、merge 時のブランチ保護（CODEOWNERS）を設定しない限り機械では止まらない。gate-hook が見るのは Write / Edit / MultiEdit / NotebookEdit だけで、PreToolUse の承認は Claude Code の hook の機能。
- 悪: 呼び出し側のワークフロー（`uses:` と `harness_ref`）も PR で書き換えられるので、`.github/workflows/**` を必須レビューにしない限り、CI の検査器の固定も破れる。
- 悪: 初めてひな形を置くとき、移行で宣言の範囲を広げるたびに承認が必要になり、作業が止まる。docs-migrate のフェーズ 6 では UC ごとに 2 回（UC の active と契約の fixed）の ask が出て、件数が多い。
- 悪: docs の status の判定は gate-hook の `--docs` の 1 か所だけを見る。monorepo の unit の docs（`apps/a/docs` など）の status の変更は ask しない。
- 悪: 書き込み後の内容が分からないもの（NotebookEdit、`old_string` が見つからない Edit）は status を判定せずに許可する。
- 悪: ask するのは検査の範囲と検査器と status / アクターだけ。テストランナーの設定（`vitest.config.ts` の `include`）や `package.json` の `scripts.test` を書き換えれば、`commands.test` / `commands.system` を空振りにできる。これらはホストの設定で、harness は対象にしない（CODEOWNERS とブランチ保護で守る）。
- 悪: 人間が差分を読まずに承認すれば、検査は外れる。承認の質は機械では担保できない。
- 悪: `harness_ref` を必須にしたので、既存の呼び出し側ワークフローは入力を足すまで落ちる（破壊的変更）。

## 却下した選択肢

- **`traceconfig.json` への書き込みを止める（exit 2）**: 人間ゲートを通した正当な変更も agent が書けなくなり、人間が手で編集するしかなくなる。承認を求めれば、差分を見たうえで agent に書かせられる。
- **none の宣言ごとに accepted の ADR の参照を求める**: ADR を `accepted` にするのもオーケストレーターで、承認の主体が人間であることを機械は確かめられない。none 以外のキー（`commands`、宣言の範囲）の書き換えも防げない。
- **none の数を台帳で縛る**: 台帳の更新がもう 1 つの例外の経路になる（ADR-0056 で廃止した baseline と同じ問題）。
- **4 つ目の人間ゲートとして独立させる**: 人間ゲートを増やさないという不変条件を変えることになる。検査の範囲と承認状態は docs の SSOT の一部として扱えば足りる。
- **status の値が変わるたびに ask する**: REQ や BR の承認のたびに止まり、件数が増えて差分を読まない承認を招く。昇格は義務を増やす向きなので、実装着手ゲートを開ける UC と契約だけに絞る。
- **降格だけ ask する**: UC の active と契約の fixed を agent が書けば、人間の承認を経ずに実装着手ゲートが開く。
- **Bash の書き込みも止める**: ビルドとテストの書き込みまで止まり、誤検出が多すぎる。merge 時のブランチ保護と PR のジョブ要約で補う。
- **CI は利用プロジェクトの `.harness` を使う**: PR で書き換えた検査器を CI が実行する。
- **CODEOWNERS とブランチ保護のテンプレートを harness が置く**: レビュアーの割り当てとリポジトリの設定は利用プロジェクトごとに違う。README で推奨するに留める。
