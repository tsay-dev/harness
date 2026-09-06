---
id: ADR-0025
title: Codex のモデルピンを段（tier）→ カタログの対応表にし、どの agent がどの段かは frontmatter から引く
status: accepted
date: 2026-09-06
supersedes: ADR-0022
---

# ADR-0025 Codex のモデルピンを段（tier）→ カタログの対応表にし、どの agent がどの段かは frontmatter から引く

<!-- File name: docs/adr/ADR-0025-codex-model-pins-by-tier.md (the prefix must equal id). One ADR, one decision. Never rewrite an accepted ADR — add a new one with supersedes: (R-802). Write the content in Japanese. -->

## Context

[ADR-0022](ADR-0022-codex-model-pins.md) は、Codex のカタログ ID を `.claude/tools/codex-sync/models.json` 一ファイルに集め、生成される `.codex/agents/*.toml` に `model` / `model_reasoning_effort` を書く形を決めた。配分は **`latest_agents`（当時は `slice-reviewer` のみ）が latest、それ以外は全部 lite** の 2 値である。

[ADR-0024](ADR-0024-per-agent-model-tiers.md) が割当をエージェント単位の 3 段（top / mid / light）に置き換えたため、この 2 値では表現できない段が出た（mid）。さらに `latest_agents` は「どの agent がどの段か」という**割当そのもの**を JSON 側にも持たせており、agent frontmatter の `model:` と二箇所に同じ知識が載る。片方だけ動いたとき、どちらが正か決められない（CLAUDE.md §0）。

## Decision

- ADR-0022 の射影先と「カタログ ID の SSOT は `models.json` だけ」は変えない。**置き換えるのは JSON の形と、段の決め方の二点だけ。**
- `models.json` は **段 → カタログの対応表**だけを持つ。`latest_model` / `lite_model` / `latest_effort` / `lite_effort` / `latest_agents` は廃止する。

  ```json
  {
    "tiers": {
      "top":   { "model": "<catalog id>", "reasoning_effort": "high" },
      "mid":   { "model": "<catalog id>", "reasoning_effort": "high" },
      "light": { "model": "<catalog id>", "reasoning_effort": "low" }
    },
    "default_tier": "top"
  }
  ```

- **どの agent がどの段かは JSON に書かない。** 生成器が agent frontmatter の `model:` から引く（`opus` → `top`、`sonnet` → `mid`、`haiku` → `light`、それ以外・`inherit` を含む → `default_tier`）。割当の正は frontmatter ただ一つ（ADR-0024）。
- 段が違ってもカタログ側に別 ID が無いときは、**同じ `model` で `reasoning_effort` を変えて段を作ってよい**（現行ピンの mid と light がその形）。ホストが 3 つ目の ID を選べるようになったら JSON を書き換える。
- 現行ピン（2026-09-06）: top = `gpt-6-astra` / high、mid = `gpt-5.6-luna` / high、light = `gpt-5.6-luna` / low。カタログが動いたら **この JSON を書き換え、`./init.sh codex` を再実行する**。それが追従手順であることは ADR-0022 のまま。
- 親セッションのモデルを人間が選ぶこと（[ADR-0023](ADR-0023-codex-parent-session-is-human-chosen.md)）、`sandbox_mode` を射影しないことは変えない。

## Consequences

**得られるもの**

- 3 段が Codex でもそのまま表現できる。`slice-reviewer` だけ特別扱いする配列が要らなくなり、top の 7 体が自動で top のピンを受ける。
- 割当が frontmatter 一箇所になる。agent を段ごと移すときに編集するファイルは 1 つで、JSON は触らない。
- 段とカタログが分離したので、カタログの入れ替えは JSON の 3 行だけで済む。

**代償と今後の制約**

- 共有ハーネスが Codex ホストのカタログを縛る点は ADR-0022 のまま。JSON のピンが死ぬと、その段の agent の spawn が失敗しうる。
- 旧い形の `models.json` を持つホストは生成が失敗する（`tiers` が無いと明示エラーで止まる）。移行は JSON を新しい形に書き換えて `./init.sh codex` を再実行するだけだが、黙って動き続けはしない。
- mid と light が同じカタログ ID を指す間は、両者の差は reasoning effort だけである。effort が実行面で無視されると 2 段が同じ挙動になる。
- TOML の `model` を実行が無視する面では、配分は親 inherit に落ちる（ADR-0022 / ADR-0023 のまま）。

## 却下した選択肢

- **`latest_agents` に `mid_agents` / `light_agents` を足して 3 配列にする**: 段は表現できるが、割当が frontmatter と JSON の二箇所に載る問題が残る。今回直す対象の半分である。
- **frontmatter に GPT slug を書く**: Claude Code が解決できず、Cursor 射影の `inherit` 正規化とも衝突する（ADR-0022 で退けたまま）。
- **`default_tier` を持たず、未知の `model:` で失敗させる**: `model: inherit` の agent（develop 外に現存する）が全部止まる。既定を top に置いて、落ちるより高く出る方を取った。
- **段を JSON ではなく生成器にハードコードする**: カタログが動くたびにシェルスクリプトを編集することになる。ADR-0022 が JSON を作った理由に反する。
