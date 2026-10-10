---
id: REQ-000
pattern: <Ubiquitous | Event-driven | State-driven | Unwanted behaviour | Optional>
uc: UC-000
br: BR-000             # optional（任意）— 業務規則が適用される場合のみ。それ以外は行を削除する
status: draft          # draft | active | withdrawn（active = 人間承認済み）
---

# REQ-000

> <EARS で 1 文。外部から観測可能な振る舞いのみ（R-401）。自己検査: 実装を全部差し替えてもこの文は真か>

## 検証方針

<!--
要件作成者ではなくテスト設計者が所有する（要件作成者は以下のひな形のまま残す）。
テストコードから再構築できないことだけを書く（R-604）。ケースの準備 / 操作 / 期待値を書いてはならない（R-601）。
クラス一覧 = 作成すべき全テスト集合の SSOT（R-1101）。各テストは @covers REQ-000#class で一クラスを指す（R-1102）。
配置: docs/goals/<GOAL-nn-slug>/<UC-000-slug>/REQ-000.md — uc: が指定する UC の直下（trace-check C9）。
本文は日本語で書く。
-->

- **分割クラス**:
  - `#<class-1>` — <この同値クラスの 1 行の意図>
  - `#<class-2>` — <…>
- **尽きている根拠**: <なぜこの分割で入力空間が尽きるか>
- **境界の扱い**: <該当時のみ>
- **検証しない**: <クラス化しない入力領域と理由（R-1104）>
- **参照先**: `<tests/ファイル>::<クラスまたは describe>`
