---
id: VERIFICATION_GLOBAL
status: draft          # draft | living
---

# 検証方針（全体）

各要件の検証方針は、要件と同じ場所（`docs/goals/**/UC.md` の「要件」の節の、各 REQ の `#### 検証方針`）に書く（R-1002）。
この文書はプロジェクト**全体**で検証しない範囲のみを持つ。NFR の計測の所在は各 NFR ファイル（テストの `@covers NFR-nnn` か `measured_by:`）が持つ。

## 検証しない範囲（全体）

| 範囲 | 理由 |
| --- | --- |
| <外部 SDK の内部など> | <他者の責務 / 別手段で保証済み> |

<!-- 配置: docs/verification/GLOBAL.md。 本文は日本語で書く。 -->
