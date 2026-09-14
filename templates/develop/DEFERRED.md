---
id: VERIFICATION_DEFERRED
status: living         # living only — a ledger is always in the present tense
---

# 保留台帳（機械判定できない指摘）

reviewer の指摘のうち、機械検査（spec-lint / trace-check / contract-run / テスト / 型 / lint / hook）に落とせないものだけを 1 行 1 件で持つ。
解消したら行を消す。機械検査へ昇格したら行を消す（縮む方向にしか動かない）。書くのは orchestrator だけ。
機械判定できる指摘はここに書かない — テストか lint に変換して機械側で赤にする。

## 保留中の指摘

| ID | 起票日 | 出所 | 対象 | 指摘 | 機械判定できない理由（反例） | 昇格先 |
| --- | --- | --- | --- | --- | --- | --- |

<!--
1 行 1 件。対象はホスト直下からの相対パス。昇格先は spec-lint | trace-check | contract-run | test | typecheck | lint | hook | 未定。
例:
| DEF-001 | 2026-09-14 | reviewer | docs/goals/GOAL-01-x/UC-003-y/REQ-031.md | 「速やかに」の観測基準が文にない | 閾値が NFR に無く、テストの期待値を決められない | 未定 |
Placement: docs/verification/DEFERRED.md. Write the content in Japanese. Rows only; no prose findings.
-->
