---
id: ADR-0045
title: produce-video と translate-manga のパッケージと実行資産を削除する
status: accepted
date: 2026-10-11
---

# ADR-0045 produce-video と translate-manga のパッケージと実行資産を削除する

## Context

harness は開発（`develop-core` と `rules-*`）、動画制作定義（`produce-video`）、メディア生成（`render-media`）、韓日漫画翻訳（`translate-manga`）、計画インタビュー（`grilling`）を独立パッケージとして持っていた。利用者は動画制作定義と漫画翻訳を今後使わないと判断した。ADR-0044 のプロンプト削減を全パッケージに適用する前に、対象外の用途を外して作業範囲を確定する必要がある。

`produce-video` は 1,929 行、`translate-manga` は 364 行、`tools/produce-video` は 797 行で、合計 3,090 行が削減対象から外れる。`render-media` は制作定義（`scenes.json`、`assets/*.json`、`timeline.json`、`script.md`）を入力に取り、企画側を差し替えられる設計である。

## Decision

- `packages/produce-video/`、`packages/translate-manga/`、`tools/produce-video/` を削除する。
- `render-media` は残す。企画側のパッケージはこのハーネスに存在しないため、制作定義は利用者が別途用意する。`render-media` の本文から `produce-video` への言及を外す。
- `tools/apm/migration-map.json` から削除先を失う項目を外し、`docs/apm.md` の移行対応表には「削除、移行先なし」と記す。`test_projection.py` の tier 検査と混入検査は残るパッケージで行う。
- 動画・翻訳に関する過去の ADR（ADR-0009 から ADR-0018、ADR-0034 の該当部分）は履歴として残し、書き換えない（R-802）。

強制の所在: `test_projection.py` が `packages/` 配下の全パッケージを走査するため、削除後に残る参照はリンク到達性検査で失敗する。

## Consequences

- 良: プロンプト削減の対象が開発とメディア生成に閉じ、ADR-0044 の適用順が短くなる。
- 良: 利用プロジェクトの選択肢から使われない用途が消え、README と導入ガイドが短くなる。
- 悪: `render-media` の入力を生成する手段がハーネス内になくなる。入力の形は `render-media` の instruction が定めるが、作る側の規律は利用者の責任になる。
- 悪: 旧 `.claude/` 配置からこれらの用途を移行するホストは移行先を失う。必要なら削除前の版を固定して使う。

## 却下した選択肢

- **パッケージを残して ADR-0044 の削減対象外にする**: 使わない正本を保守し続ける理由がない。
- **`render-media` も同時に削除する**: 利用者の指示に含まれない。入力の形は `render-media` 自身の instruction が持ち、企画側に依存しない設計のため単独で成立する。
- **`tools/produce-video` だけ残す**: 対応するパッケージがなく、呼び出す skill もない。
