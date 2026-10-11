---
id: ADR-0047
title: agent 本文は相対リンクを持たず、規約の末端ファイルと HARNESS_ROOT はオーケストレーターが Task 入力で渡す
status: accepted
date: 2026-10-11
---

# ADR-0047 agent 本文は相対リンクを持たず、規約の末端ファイルと HARNESS_ROOT はオーケストレーターが Task 入力で渡す

## Context

各 agent 正本の冒頭に「パッケージ正本の解決」と「外部の実行資産」の定型 2 ブロックがあった。前者は、APM 0.30.0 が Codex の TOML に埋め込む agent 本文の相対リンクを書き換えないため、agent 自身に `apm_modules/` のマニフェストから正本を探させてリンクを解決させる規約で、`docs/apm.md` と `test_projection.py` がその存在を要求していた。後者は `HARNESS_ROOT` の意味を各 agent に説明していた。

ADR-0044 の削減後、相対リンクを持つ agent は `spec-author` と `test-author` の 2 体だけで、どちらも `docs.instructions.md` を指す。この末端ファイルは `applyTo` と `references/bundles.md` の配送契約でオーケストレーターがパスで渡すものであり、agent が自分で探す必要はない。定型ブロックは配布機構（`apm_modules/`、マニフェスト名、`.harness-legacy.json`）の都合を中立のプロンプトに持ち込んでおり、到達状態でも入出力契約でもない。

## Decision

- agent 本文は相対 Markdown リンクを持たない。規約の末端ファイルはオーケストレーターが Task 入力でパスとして渡し、agent 本文は末端ファイルをファイル名で言及するだけにする。
- `HARNESS_ROOT` は各 agent の入力契約の 1 項目とし、オーケストレーターが解決した絶対パスを Task 入力で渡す。未受領の agent は停止する。解決の責任は develop と docs-migrate の `SKILL.md` 冒頭に残す。
- 定型 2 ブロックを 5 体から削除し、`docs.instructions.md` の同じ注記も外す。`docs/apm.md` の「Codex agent の参照解決」はこの決定を記す。

強制の所在: `test_projection.py` が「agent 本文に相対リンクがない」を検査する（従来の「ブロックが存在する」検査を置き換える）。パスを渡す義務は develop `SKILL.md` §2 の説得的統制（R-901）。

## Consequences

- 良: agent 本文から配布機構への依存が消え、APM の native install、互換展開、将来の別プロバイダーで同じ本文が使える。
- 良: 5 体で 10 行減り、`HARNESS_ROOT` が入力契約として明示される。
- 悪: オーケストレーターが `HARNESS_ROOT` や末端ファイルのパスを渡し忘れると agent は停止する。機械検査はない。
- 悪: agent 本文から末端ファイルへ直接辿る経路がなくなり、agent は渡されたパスだけを読む。

## 却下した選択肢

- **定型ブロックを短くして残す**: 短くしても配布機構への依存は残る。リンクがない以上、解決手順そのものが不要。
- **Codex 向けだけアダプターがリンクを書き換える**: APM の native install は `project.py` を通らず、Codex TOML の扱いは APM 側の挙動。本文からリンクを無くす方が対象を問わない。
- **`HARNESS_ROOT` を環境変数として各プロバイダーで設定させる**: セッションごとの設定をホストに要求し、未設定を検出できない。Task 入力に含める方が契約として扱える。
