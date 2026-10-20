---
id: ADR-0054
title: active な NFR は保留でないテストの @covers NFR-nnn か、ID を含む docs の外のファイルを指す measured_by で検証の所在を持ち、trace-check が検査する
status: proposed
date: 2026-10-20
---

# ADR-0054 active な NFR は保留でないテストの @covers NFR-nnn か、ID を含む docs の外のファイルを指す measured_by で検証の所在を持ち、trace-check が検査する

## Context

NFR には spec-lint の書式検査と、ID の重複（C12）しか掛かっていなかった。`@covers` は REQ だけ、`@implements` は REQ・BR・UC だけを指せるので、NFR を指す注釈の書き方そのものが無い。承認済みの NFR を検証するテストや計測が無くても、完了判定を通る。

R-104 は「検証手段の無い文を要件にしない」と定め、NFR テンプレートは「閾値 + 計測方法」を求める。計測が既定のテストスイートの外にある場合、テンプレートは実施箇所を `docs/verification/GLOBAL.md` に列挙するよう案内していた。しかし GLOBAL.md の役割は「プロジェクト全体で検証しない範囲」であり、NFR の計測の所在まで持たせると、1 つの NFR の情報が NFR ファイルと GLOBAL.md の 2 か所に分かれる。REQ の検証方針を REQ ファイルの中に置く規則（R-1002）とも揃わない。

最初の案は `measured_by` のパスが実在すれば通した。レビューで、任意のファイルやディレクトリ（`README.md`、`src/`、NFR ファイル自身）を書けば満たせること、URL を書けば何も確かめられないことが分かった。また skip 中のテストの `@covers NFR-nnn` でも通った。

## Decision

- active な NFR は、次のどちらかで検証の所在を持つ。
  - テスト（`tests` と `tests.system`）の `@covers NFR-nnn`。保留（`pending_pattern` に一致。ADR-0056）のテストは数えない。分割クラスは持たない。
  - NFR ファイルの frontmatter の `measured_by:`（テスト以外の計測の所在。複数はカンマ区切り）。各パスは次をすべて満たす。
    - リポジトリ直下からの相対パスで、リポジトリ内の**ファイル**。URL、絶対パス、リポジトリの外、ディレクトリは違反。
    - docs の `goals_dir` / `rules_dir` / `nfr_dir` / `adr_dir` の外にある（NFR ファイル自身や ADR で自己充足させない）。
    - 中にその NFR の ID が現れる（計測のスクリプト、CI ジョブの定義、runbook のどれが何を測るかを ID で辿れる）。
  - 外部の SaaS やダッシュボードで測る NFR は、リポジトリ内の runbook に NFR の ID と計測先を書き、その runbook を `measured_by` に書く。
- **C20**: active な NFR がどちらも持たない場合、`measured_by` が上の条件を満たさない場合、テストが未定義または撤回済みの NFR を `@covers` する場合、どのシナリオテストにも属さない `@covers NFR-nnn` を違反にする。テストが保留のものしか無いときは「skip を外す」と案内する。
- NFR を指す注釈の形は `traceconfig.json` の `nfr_pattern`（既定 `@covers\s+(NFR-\d{3})(?!\d)`。省略時も同じ）。C11 は NFR だけを `@covers` するテストも注釈済みと数える。
- GLOBAL.md は「検証しない範囲（全体）」だけに戻し、NFR テンプレートの「GLOBAL.md に列挙する」という案内を削る。
- trace-check のレポートに「NFR -> 検証」の一覧（保留でないテストと、条件を満たす `measured_by`）を出す。
- 強制は trace-check で、develop の完了条件、stop-gate、CI を通じて効く。テストや計測が閾値を本当に検証しているかは reviewer の確認で、説得による統制（R-901）。

## Consequences

- 良: 承認済みの NFR が、検証の所在を持たないまま完了判定を通らなくなる。
- 良: NFR の情報が NFR ファイルの 1 か所に集まり、GLOBAL.md の役割が 1 つに戻る。計測の所在からも ID で NFR に戻れる。
- 悪: 既存の利用プロジェクトでは、active な NFR が違反になりうる。baseline は無い（ADR-0056）ので、計測の所在を書くか、揃うまで NFR を `draft` に戻す。ディレクトリや docs を指していた `measured_by` も直す必要がある。
- 悪: `measured_by` が見るのは、ファイルの実在と ID の出現まで。そのファイルが閾値を計測しているか、CI で実際に動いているか、外部の計測先が生きているかは見ない（テストが実際に実行されたかの突き合わせは主張の外。ADR-0056 の M9）。ID をコメントに 1 行書けば通る。
- 悪: 外部の計測は runbook を 1 枚書く手間が増える。
- 悪: NFR を検証するテストは分割クラスを持たないので、C10 / C11 のような上限・下限の締め付けが無い。

## 却下した選択肢

- **テストの `@covers NFR-nnn` だけを認める**: 負荷・可用性など、既定のテストスイートで測れない NFR もテストとして書く必要が出る。計測の手段は NFR ごとに違う。
- **計測の所在を GLOBAL.md に列挙させる**: GLOBAL.md の役割（検証しない範囲）と混ざり、NFR の情報が 2 か所に分かれる。R-1002（検証方針は REQ ファイルに同居）とも揃わない。
- **`measured_by` のパスの実在だけを見る**（最初の案）: README やディレクトリ、NFR ファイル自身を書けば通り、計測の所在が実在するかを確かめられない。
- **`measured_by` に URL を許す**: 機械が実在を確かめられず、リンクが切れても通る。計測先は runbook に書き、runbook の実在と ID を検査する。
- **docs の中のファイル（ADR など）も `measured_by` に許す**: NFR ファイル自身や ADR は ID を必ず含むので、条件が自己充足する。
- **NFR にも分割クラスを宣言させる**: 閾値 1 つの NFR に同値分割は合わないことが多く、書式が重くなる。必要なら NFR を REQ（`Ubiquitous` や `Unwanted behaviour`）として書ける。
