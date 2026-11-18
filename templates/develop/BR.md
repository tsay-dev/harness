---
id: BR-000
title: <規則名>
enforced_at: <domain | database | usecase | …> 層
status: draft          # draft | active | withdrawn（active = 人間承認済み）
---

# BR-000 <title>

<規則の内容。ただし——>

<!--
R-102 の確認: この規則の値（閾値、上限、列挙）を機械可読にできるか。
- はい → 値の SSOT をコード定数 / DB 制約 / スキーマへ移し、ここには
  「値の SSOT は <path>」と存在・意図だけを書く。
- 保証箇所が複数 → 非対称性（どれを除くと正しさが壊れるか）で SSOT を特定し、ADR に記録する。
enforced_at が database のとき: 制約が効くことを、テストで確かめる。アプリの入口を通さずに、この規則に反する行を DB に直接入れて、
  断られることを確かめるテストを書き、テストに @covers BR-000 を付ける（trace-check C13。スキーマの制約に注釈は書かない）。
参照元を列挙してはならない（R-103。trace-check C4 が導出する）。配置: docs/rules/BR-000.md。 本文は日本語で書く。
-->

**意図**: <なぜ存在するか。KPI / GOAL との接続>
