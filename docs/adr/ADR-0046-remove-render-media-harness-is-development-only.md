---
id: ADR-0046
title: render-media も削除し、harness の用途を開発と各フレームワークの規約だけにする
status: accepted
date: 2026-10-11
supersedes: ADR-0045
---

# ADR-0046 render-media も削除し、harness の用途を開発と各フレームワークの規約だけにする

## Context

ADR-0045 は `produce-video` と `translate-manga` を削除し、`render-media` は企画側を差し替えられる設計なので残すと決めた。しかし企画側のパッケージがハーネスに存在しない以上、`render-media` の入力（`scenes.json`、`assets/*.json`、`timeline.json`、`script.md`）を作る規律はハーネスの外にあり、利用者はこの用途も使わないと判断した。ADR-0044 のプロンプト削減を残る全パッケージに適用する前に、対象を確定する必要がある。

## Decision

- `packages/render-media/` を削除する。ADR-0045 の残りの決定（`produce-video`、`translate-manga`、`tools/produce-video` の削除、過去 ADR の保持）はそのまま引き継ぐ。
- harness が持つパッケージは `develop-core`、`rules-*`、`grilling` だけになる。README と `docs/apm.md` の表、`tools/apm/migration-map.json` からメディア生成の項目を外し、移行対応表には「削除、移行先なし」と記す。
- `test_projection.py` の混入検査と縮小検査は `grilling` で行う。develop 以外に agent を持つパッケージがなくなるため、tier の既定値の検査は develop の 5 体だけに閉じる。

強制の所在: `test_projection.py` が `packages/` 配下を走査し、削除後に残る参照はリンク到達性検査で失敗する。

## Consequences

- 良: ADR-0044 の適用順が `develop-core` → `rules-*` に閉じ、メディア生成の agent と instruction を薄くする作業が不要になる。
- 良: harness の用途が「仕様と実装の紐づきを機械で検査する開発」に一本化され、README の説明が短くなる。
- 悪: メディア生成の工程（定義 → 実体、アダプター契約、再計時）は git の履歴にだけ残る。再び必要になれば削除前の版から取り出す。
- 悪: 旧 `.claude/` 配置からメディア生成を移行するホストは移行先を失う。

## 却下した選択肢

- **`render-media` を残す（ADR-0045）**: 入力を作る側がハーネスになく、利用者も使わない。保守する理由がない。
- **アーカイブ用のブランチやパッケージに退避する**: git の履歴とタグで十分であり、別の置き場は保守対象を増やすだけ。
