---
id: ADR-0034
title: Grok Build の名前付き agent は workflow の agent_type で起動する
status: accepted
date: 2026-09-24
---

# ADR-0034 Grok Build の名前付き agent は workflow の agent_type で起動する

<!-- File name: docs/adr/ADR-0034-grok-named-agent-via-workflow.md (the prefix must equal id). One ADR, one decision. Never rewrite an accepted ADR — add a new one with supersedes: (R-802). Write the content in Japanese. -->

## Context

ADR-0008 は agent を `.grok/agents/<name>.md` へ flatten し、Grok の spawn API（`task` / `spawn_subagent`）が `subagent_type` にその `name:` を取ると書いた。現行の Grok Build では、モデルに見せる起動スキーマから `subagent_type` が外れ、省略は `general-purpose` になる。定義ファイルはホスト側の型として残り、名前を渡せるのは workflow の `agent()` / `parallel()` の `agent_type` だけである。ADR-0008 の射影決定は生きているので、本文は書き換えず、この記録も supersede しない。

## Decision

- Grok Build で専門エージェントを起動するとき、orchestrator は `workflow` ツールの都度の inline スクリプトで `agent_type` に frontmatter の `name:` を渡す。`fork_context` は付けない。同時バッチは `parallel()` の 1 回とし、人間ゲートは親に戻してから次を出す。スクリプトは `.grok/workflows/` に保存しない。
- `spawn_subagent` で専門エージェントを起動したことにしない。`workflow` または `agent_type` が無いときは `general-purpose` に落とさず、起動できなかったと報告して止める。
- 子のモデルは親を継承する。要求段を保証できないときはその制約を報告する。カタログ ID は中立ソースに書かない（ADR-0028）。
- 強制はスキル本文（develop の playbook、produce-video、translate-manga）だけである。機械検査は無い（R-901、persuasive control）。`.grok/agents/<name>.md` への射影は ADR-0008 のまま変えない。

## Consequences

**得られるもの**

- 名前付き agent を、型を渡せなくなった `spawn_subagent` ではなく、まだ `agent_type` を持つ経路で起動できる。
- 射影・親モデル継承・slug を中立ソースに書かないことは ADR-0008 / ADR-0028 のままなので、生成形式を変えない。

**代償と今後の制約**

- workflow は 1 体の spawn より重い。バックグラウンド実行、Rhai、子の呼び出し上限が付く。文法はセッションの `create-workflow` スキルに依存し、ホストが変わると台本が追従できない。
- モデルがスキルを無視すれば一般エージェントのまま動く。機械では止められない。
- ゲートをスクリプトに入れると、親が確認する前に次の段が走る。

## 却下した選択肢

- **`spawn_subagent` に `name:` を渡し続ける**: モデル向けスキーマにその欄が無く、省略は `general-purpose` になる。退けた。
- **ADR-0008 を supersede して射影をやめる、または persona / role に載せ替える**: 定義ファイルは workflow の `agent_type` が参照するホスト側の型としてまだ要る。退けた。
- **workflow の `model` で段をピンする**: カタログ ID を中立ソースに書くことになり、ADR-0028 を崩す。退けた。
- **保存済みの `.grok/workflows/` を正本にする**: スライスごとの入力は都度変わる。固定スクリプトはゲートと入力の受け渡しを親から奪う。退けた。
