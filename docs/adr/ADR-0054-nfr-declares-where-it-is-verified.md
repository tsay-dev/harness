---
id: ADR-0054
title: active な NFR はテストの @covers NFR-nnn か measured_by で検証の所在を持ち、trace-check が検査する
status: proposed
date: 2026-10-20
---

# ADR-0054 active な NFR はテストの @covers NFR-nnn か measured_by で検証の所在を持ち、trace-check が検査する

## Context

NFR には spec-lint の書式検査と、ID の重複（C12）しか掛かっていなかった。`@covers` は REQ だけ、`@implements` は REQ・BR・UC だけを指せるので、NFR を指す注釈の書き方そのものが無い。承認済みの NFR を検証するテストや計測が無くても、完了判定を通る。

R-104 は「検証手段の無い文を要件にしない」と定め、NFR テンプレートは「閾値 + 計測方法」を求める。計測が既定のテストスイートの外にある場合、テンプレートは実施箇所を `docs/verification/GLOBAL.md` に列挙するよう案内していた。しかし GLOBAL.md の役割は「プロジェクト全体で検証しない範囲」であり、NFR の計測の所在まで持たせると、1 つの NFR の情報が NFR ファイルと GLOBAL.md の 2 か所に分かれる。REQ の検証方針を REQ ファイルの中に置く規則（R-1002）とも揃わない。

## Decision

- active な NFR は、次のどちらかで検証の所在を持つ。
  - テスト（`tests` と `tests.system`）の `@covers NFR-nnn`。分割クラスは持たない。
  - NFR ファイルの frontmatter の `measured_by:`（テスト以外の計測の所在。負荷試験のスクリプト、CI ジョブの定義など、リポジトリ直下からの相対パス。複数はカンマ区切り）。テンプレートでは任意キー。
- **C20**: active な NFR がどちらも持たない場合、`measured_by` のパスが実在しない場合、テストが未定義の NFR を `@covers` する場合を違反にする。
- NFR を指す注釈の形は `traceconfig.json` の `nfr_pattern`（既定 `@covers\s+(NFR-\d{3})`。省略時も同じ）。C11 は NFR だけを `@covers` するテストも注釈済みと数える。
- GLOBAL.md は「検証しない範囲（全体）」だけに戻し、NFR テンプレートの「GLOBAL.md に列挙する」という案内を削る。
- trace-check のレポートに「NFR -> 検証」の一覧を出す。
- 強制は trace-check で、develop の完了条件、stop-gate、CI を通じて効く。テストや計測が閾値を本当に検証しているかは reviewer の確認で、説得による統制（R-901）。

## Consequences

- 良: 承認済みの NFR が、検証の所在を持たないまま完了判定を通らなくなる。
- 良: NFR の情報が NFR ファイルの 1 か所に集まり、GLOBAL.md の役割が 1 つに戻る。
- 悪: 既存の利用プロジェクトでは、active な NFR が新規違反になりうる。R-804 に従い、初回だけ `--update-baseline` で既知にする。
- 悪: `measured_by` が見るのはパスの実在だけで、そのファイルが NFR の閾値を計測しているか、CI で実際に動いているかは見ない。
- 悪: テスト以外の計測は、パスを書けば検査を通る。計測の中身は reviewer に残る。
- 悪: NFR を検証するテストは分割クラスを持たないので、C10 / C11 のような上限・下限の締め付けが無い。

## 却下した選択肢

- **テストの `@covers NFR-nnn` だけを認める**: 負荷・可用性など、既定のテストスイートで測れない NFR もテストとして書く必要が出る。計測の手段は NFR ごとに違う。
- **計測の所在を GLOBAL.md に列挙させる**: GLOBAL.md の役割（検証しない範囲）と混ざり、NFR の情報が 2 か所に分かれる。R-1002（検証方針は REQ ファイルに同居）とも揃わない。
- **GLOBAL.md かテストのどちらかに ID が現れればよいとする**: ID が書かれていれば通るので、計測の所在が実在するかを確かめられない。
- **NFR にも分割クラスを宣言させる**: 閾値 1 つの NFR に同値分割は合わないことが多く、書式が重くなる。必要なら NFR を REQ（`Ubiquitous` や `Unwanted behaviour`）として書ける。
