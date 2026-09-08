---
id: ADR-0028
title: エージェントのモデル段を中立な x-model-tier メタデータで宣言する
status: accepted
date: 2026-09-08
supersedes: ADR-0024
---

# ADR-0028 エージェントのモデル段を中立な x-model-tier メタデータで宣言する

<!-- File name: docs/adr/ADR-0028-vendor-neutral-agent-model-tier.md (the prefix must equal id). One ADR, one decision. Never rewrite an accepted ADR — add a new one with supersedes: (R-802). Write the content in Japanese. -->

## Context

ADR-0024 は top / mid / light の3段とエージェントごとの割当を決めたが、割当の正本を Claude 固有の `model: opus | sonnet | haiku` に置いていた。ADR-0026 で正本を中立 APM package へ移したため、特定 provider の family 名を中立 agent に戻すとベンダー中立性が崩れる。一方、割当を adapter のエージェント名リストへ移すと二重管理になる。

## Decision

- 各 `.agent.md` は `x-model-tier: top | mid | light` を frontmatter に一度だけ持ち、これをエージェントごとの割当の唯一の正とする。`x-` 接頭辞は APM primitive の中立な拡張メタデータとして扱う。
- develop 16体の割当は ADR-0024 の意味を保つ。top 7体、mid 8体、light は `committer` 1体である。develop 以外の既存 scene は top を既定として全 agent に明示する。
- provider の adapter は agent 名を列挙せず、`x-model-tier` を tier 対応表へ写す。Claude は top / mid / light を opus / sonnet / haiku に写し、Cursor は起動時に同じ family を選ぶ。Grok Build は起動 API の制約を報告する。provider 固有の version slug は中立 source に書かない。
- native APM integrator がこの拡張を model 指定へ変換するとは仮定しない。install 後も元 package の `x-model-tier` を読み、起動 API が対応するときだけ適用する。互換 adapter は出力先に必要な model field を生成する。
- 回帰テストは全 source の tier 値、develop の割当、他 scene の top 既定、出力からの `x-model-tier` 除去、代表3段の provider mapping、mapping JSON に agent 名が無いことを検証する。

## Consequences

割当を一箇所に保ったまま、provider family と catalog の変更を adapter の対応表だけで吸収できる。APM が未知の拡張メタデータを出力へ残しても、互換 adapter は provider 出力から除去する。

代わりに、native APM の target integratorだけではモデル段を強制できない場合がある。その場合、orchestrator が package source を読み、起動 API へ指定する必要がある。Grok Build のように起動時モデル指定がない面では段を保証できず、制約を明示するだけになる。

## 却下した選択肢

- **Claude の `model:` を中立 source に戻す**: 他 provider が解釈できず、中立正本が Claude の語彙に依存する。
- **agent 名ごとの対応表を adapter に置く**: agent frontmatter と対応表の二箇所に割当が生まれる。
- **skill に割当表を書く**: orchestration と agent 属性を重複させ、変更時に不整合が起きる。
- **tier を持たず provider の既定へ任せる**: ADR-0024 が導入した費用と判断品質の配分を失う。
