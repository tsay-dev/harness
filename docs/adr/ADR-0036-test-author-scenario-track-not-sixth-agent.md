---
id: ADR-0036
title: シナリオテストの執筆は test-author の `track: scenario` で担い、6 体目の agent を作らない
status: accepted
date: 2026-09-28
---

# ADR-0036 シナリオテストの執筆は test-author の `track: scenario` で担い、6 体目の agent を作らない

## Context

ADR-0035 でシナリオテストを Phase 4 の並列起動に入れることにした。誰が書くかを決める必要がある。ADR-0033 は develop の agent を「別コンテキストが必要か」（隔離・並列・独立性）でだけ 5 体に絞り、`tools/apm/test_projection.py` が tier の期待集合として固定している。

シナリオテストに要る独立性は「実装を読まない」であり、これは `test-author` が BE テストのために既に持っている性質と同一である。異なるのは craft（主シナリオを操作とアサーションに写す、ロケータの序列、pending マーカー）であって、コンテキストの分離条件ではない。

## Decision

- `test-author` に入力 `track: backend-logic | scenario` を追加する（既定は `backend-logic`）。`scenario` は UC ディレクトリ（`UC.md` の主シナリオ・事後条件、`contract.yaml` の `examples`）と system-testing 葉だけを入力とし、実装パスを渡されたら拒否して報告する（`backend-logic` と同じ規則）。
- 出力は「シナリオテスト 1 本（`@scenario UC-nnn`、UC タグ、pending マーカー付き）」と、選択実行での Red / pending 確認、`trace-check --only C15` の結果。分割クラスの宣言（`## 検証方針`）は `backend-logic` のみの責務で、`scenario` は REQ ファイルを書かない。
- `x-model-tier` は `test-author` のまま `mid`。`test_projection.py` の期待集合は変えない。
- bundle の配布は通常手順に統一する: `track: scenario` が書くパス（`e2e/**`、`UITests/**` 等）に `applyTo:` が一致する葉を渡す。`bundles.md` の「UI / FE テストの bundle は組まない」は撤回する。

強制の所在: agent の集合は `test_projection.py`。track の入力契約は `test-author.agent.md`。

## Consequences

- agent 数は 5 体のまま。orchestrator は同じ agent を track 違いで 2 Task 起動する（書込先が `tests/` と `e2e/` で互いに素なので並列条件 2 を満たす）。
- `test-author.agent.md` が長くなる。BE と scenario の共通部分（実装を読まない、UC タグ、選択実行）を 1 度だけ書き、差分だけを track の delta として書く必要がある。
- `scenario` track は `@covers` を書かない。system suite のディレクトリは `tests.dirs` と互いに素でなければ C11 が「`@covers` の無いテスト」として誤検知する（`traceconfig.json` のコメントと testing 葉で明記）。

## 却下した選択肢

- **`scenario-author` を 6 体目として追加する**: 分離条件が test-author と同じで、判定文（ADR-0033）「別コンテキストにする理由があるか」を満たさない。tier 期待集合と各 provider の射影を増やすだけ。
- **`implementer (appearance)` がシナリオテストも書く**: producer が自分の成果物のテストを書くことになり、「実装を読まない」独立性が失われる。
- **orchestrator が書く**: 「orchestrator は実装とテストを書かない」の不変条件に反する。
