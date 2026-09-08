---
id: ADR-0029
title: Codex のモデルピンを x-model-tier から provider 対応表へ写す
status: accepted
date: 2026-09-08
supersedes: ADR-0025
---

# ADR-0029 Codex のモデルピンを x-model-tier から provider 対応表へ写す

<!-- File name: docs/adr/ADR-0029-codex-tier-mapping-from-neutral-metadata.md (the prefix must equal id). One ADR, one decision. Never rewrite an accepted ADR — add a new one with supersedes: (R-802). Write the content in Japanese. -->

## Context

ADR-0025 は Codex の provider mapping とエージェントごとの段を分離したが、段の入力を Claude 固有の `model:` としていた。ADR-0028 が割当の正を `x-model-tier` へ移したため、Codex adapter も同じ中立メタデータから生成しなければならない。

## Decision

- `tools/codex-sync/models.json` は top / mid / light から Codex catalog ID と reasoning effort への対応だけを持つ。agent 名は持たない。
- 互換 projector は各 agent の `x-model-tier` を必須値として読み、対応する `model` と `model_reasoning_effort` を TOML に出す。未知・欠落 tier、欠けた対応表は明示エラーで停止する。
- 現行対応は top = `gpt-6-astra` / high、mid = `gpt-5.6-luna` / high、light = `gpt-5.6-luna` / low とする。version slug はこの JSON だけに置く。
- native APM が model pin を出さない面では、orchestrator が元 package の tier と同じ JSON を起動時に適用する。起動面が指定を無視する場合は親を継承し、段を保証したと報告しない。

## Consequences

Codex の catalog 更新と agent の重要度変更が独立し、エージェント名の二重管理がなくなる。3段の代表出力は回帰テストで固定される。

代わりに、JSON の tier が欠けると互換生成は全体を停止する。native APM と実行面の能力差は残り、ファイル生成の成功だけではモデル適用を証明できない。

## 却下した選択肢

- **旧 `model:` を読む**: 中立 agent source に provider 固有語彙を戻す必要がある。
- **agent 名の配列を JSON に置く**: tier の割当が frontmatter と二重になる。
- **Codex slug を agent source に置く**: catalog 更新が全 agent source を汚し、他 provider に無意味な値を配布する。
