---
id: ADR-0037
title: シナリオテストのロケータは glossary と contract から導出し、ズレたときは appearance が動く
status: accepted
date: 2026-09-28
---

# ADR-0037 シナリオテストのロケータは glossary と contract から導出し、ズレたときは appearance が動く

## Context

ADR-0035 / 0036 により、`test-author (track: scenario)` と `implementer (mode: appearance)` は同時に起動される。BE 側では「operation → entry」規約（各 rules-* の testing 葉 §2）があるため、test-author と implementer が互いを読まずに同じ入口へ着地する。UI 側にはその対応物が無く、規約無しに同時に走らせると、テストは `getByRole('button', { name: '登録' })` と書き、appearance は「保存」というボタンを作る、というズレが必ず起きる。ズレを埋めるためにどちらかが相手の成果物を読めば、「実装を読まない」独立性が失われる。

逐次（テスト → appearance）にすれば規約は不要になるが、appearance がテストを待ち、テストを読んで作るので UI の SSOT がテストコードへ移る（ADR-0035 が却下した形）。

## Decision

- **表示文言**（`getByRole` の `name`、`getByLabel`、XCUITest の label）は **`docs/01-glossary.md` の用語**から導く。用語は語彙の SSOT で禁止同義語も持つので、両者とも用語以外を書けない。
- **機能名の識別子**（`data-testid` / `testID` / `accessibilityIdentifier`）は **`contract.yaml` の operation 名と request のフィールド名**から導く: operation を起動するコントロールは operation 名そのもの（`renameUser`）、入力欄は `<operation>.<field>`（`renameUser.name`）。表示文言をコピーした識別子は禁止（既存の frontend-coding 葉の規則を維持）。
- **到達確認**は主シナリオの「システムが…を表示する」ステップと事後条件から導く。用語どおりのテキストが可視である、role を持つ要素が存在する、といった観測だけを断言し、DOM / View 階層は断言しない。
- **ズレたときに動くのは appearance であり、テストは動かない**（R-801 の適用。契約由来の名前を実装が間違えている）。手順は BE の closing rule と同型: appearance とシナリオテストが両方返ったら orchestrator が識別子の照合を inline で行い、ズレていれば **目視ゲートの前に** appearance をシナリオテスト付きで 1 回だけ再起動する。人間が見る時点で識別子は確定している。
- 規約の置き場は各 rules-* の `system-testing.instructions.md`（テスト側）と `frontend-coding.instructions.md`（appearance 側）。skill は葉の本文を要約しない（references は一方向）。

強制の所在: 識別子の由来は葉（説得的）。ズレの検知は目視ゲート前の照合と、境界でのシナリオテスト実行（機械）。

## Consequences

- test-author と appearance は互いを見ずに同じロケータへ着地し、並列起動を維持できる。
- glossary と契約に無い文言・名前は UI に現れない。UI に新しい文言が要るなら glossary（`spec-author` 🙋）へ、新しい操作が要るなら契約（`spec-author`）へ戻る。UI の語彙が SSOT で閉じる代わりに、appearance が「見栄えのために勝手な文言を置く」自由は無くなる。
- appearance の再起動が最大 1 回増えることがある。
- 目視ゲートでの変更（レイアウト・装飾）はロケータに触れないので、テストは壊れない。

## 却下した選択肢

- **逐次（シナリオテスト → appearance）**: 規約が不要になる代わりに、appearance が待つこと、UI の SSOT がテストへ移ることの 2 つを払う。得られるのは識別子の一致だけで、それは本規約で同じものが手に入る。
- **appearance → シナリオテストの順で、テストが実装を読んで書く**: テストが DOM を固定し、実装変更のたびに壊れる。ADR-0035 の Context で退けた形。
- **識別子を UC.md に書く**: UC に画面構造・技術を書かないという規則（`spec-author` の「書いてはいけないもの」）に反し、SSOT が増える。glossary と契約は既にある。
