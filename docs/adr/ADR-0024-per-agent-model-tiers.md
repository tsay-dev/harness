---
id: ADR-0024
title: サブエージェントのモデルをエージェント単位の 3 段（top / mid / light）で割り当て、frontmatter を段の唯一の正とする
status: superseded
date: 2026-09-06
supersedes: ADR-0020
---

# ADR-0024 サブエージェントのモデルをエージェント単位の 3 段（top / mid / light）で割り当て、frontmatter を段の唯一の正とする

<!-- File name: docs/adr/ADR-0024-per-agent-model-tiers.md (the prefix must equal id). One ADR, one decision. Never rewrite an accepted ADR — add a new one with supersedes: (R-802). Write the content in Japanese. -->

## Context

これまでの割当は**ゾーン 2 分＋例外 1 件**だった。判断ゾーン（機械が反駁できない成果物）は `opus`、決定論ゾーン（機械オラクルがある）は `inherit`、そして完成ゲートの `slice-reviewer` だけ Cursor で fable 系統必須（[ADR-0020](ADR-0020-slice-reviewer-fable-family.md)）。この形には四つの穴がある。

- **判断ゾーンが一枚岩すぎる。** 「そこが崩れると全部が崩れる」もの（ドメイン定義・UC・DB 設計・構造オラクル・完成ゲート・攻撃）と、「上流で確定した成果物か機械オラクルに縛られた導出」（REQ・契約・テスト設計・ADR 起票）が同じ段にいる。後者まで最上位を払うのは、切りが無いのと同じである。
- **`inherit` が親の既定を子へ漏らす。** 決定論ゾーンの既定が `inherit` である限り、master を強いモデルで走らせた瞬間に実装体まで同じコストになる。逆に master が廉価なら実装体も落ちる。どちらも意図した配分ではない。
- **段が Claude の語彙でしか言えない。** `opus` / `fable` は Claude / Cursor の系統名で、Grok Build や Codex では意味を持たない。ホストがそれらで走らせるとき「どの段で走らせるべきか」が harness のどこにも書かれていなかった。
- **`slice-reviewer` だけ最上位、という例外の前提が変わった。** ADR-0020 は「親が廉価なとき reviewer が落ちる」ことを止めるためのものだった。段をエージェント単位で明示するなら、例外ではなく表の一行で足りる。

## Decision

- **割当の単位をゾーンからエージェントに下ろす。** 段は 3 つ（**top** / **mid** / **light**）。develop の 16 体の配置は次のとおり。

  | 段 | エージェント |
  | --- | --- |
  | **top** | `domain-definer` / `usecase-definer` / `db-designer` / `structure-oracle` / `slice-reviewer` / `slice-attacker` / `system-attacker` |
  | **mid** | `requirement-definer` / `contract-author` / `test-designer` / `adr-writer` / `backend-logic-implementer` / `frontend-logic-implementer` / `frontend-ui-implementer` / `skeleton-runner` |
  | **light** | `committer` |

- **段の SSOT は agent frontmatter の `model:`。** `opus` = top、`sonnet` = mid、`haiku` = light。skill も射影も「どの agent がどの段か」を書き写さず、frontmatter を読む（CLAUDE.md §0「同じ知識を二重に持たない」）。**`develop` から `inherit` は無くす。**
- **段はランタイムごとに同段の系統へ写す。**

  | 段 | Claude Code | Cursor | Grok Build | Codex |
  | --- | --- | --- | --- | --- |
  | **top** | `opus` | opus 系統 | 旗艦 grok 系統（`fast` でない方） | `models.json` の `tiers.top` |
  | **mid** | `sonnet` | sonnet 系統 | grok … fast 系統 | `tiers.mid` |
  | **light** | `haiku` | haiku 系統 | 最小の grok 系統 | `tiers.light` |

- **Cursor は起動時に段の系統を選ぶ。** 射影が `model:` を `inherit` に正規化するため、選択は Task 起動時にしかできない。`inherit` は禁止。段の系統が候補に無ければ黙って落とさず、揃っていたモデルを人間に示して止まる（人間が代替を名指ししたときだけ従う）。ADR-0020 が `slice-reviewer` にだけ課していた規律を、全段に一般化する。
- **master / orchestrator セッション**（スキルを起動した本人。Task ではない）は、そのランタイムが持つ最強の系統。Cursor では **fable**。Task には渡さない。
- **Grok Build は spawn API に per-launch model が無い**（[ADR-0008](ADR-0008-grok-agent-flatten-projection.md)）。射影は `model:` を落とし、子は親セッションを継承する。そこでは段の表は「その回をどの段のセッションで走らせる必要があるか」の宣言として読む。top の段が走る回でセッションがそれより下なら、黙って続けずにそう言う。Codex のピンの持ち方は [ADR-0025](ADR-0025-codex-model-pins-by-tier.md)。
- **バージョン付きカタログ ID は agent markdown にも skill 本文にも書かない**（Codex の `models.json` だけが例外。ADR-0022 / ADR-0025）。段の SSOT は develop skill §5、要約は CLAUDE.md §3.3。
- **develop 以外**（`produce-video` / `render-media` / `translate-manga-ko-ja`）の既定は **top**。各 agent の frontmatter が正であることは同じ。

## Consequences

- 「判断ゾーンだから最上位」ではなく、**崩れたときに何が壊れるか**でコストを払う場所が決まる。top は 7 体に絞られ、REQ・契約・テスト設計・実装体は mid へ落ちる。
- `inherit` が develop から消え、親セッションの既定が子に漏れなくなる。master を強くしても実装体は mid のままである。
- 段が Claude 以外の語彙でも言えるようになる。ただし Grok では**強制できない**（spawn に model 引数が無い）。宣言と、段が足りないときに止まる規律までが限界である。
- ADR-0020 の「fable 必須」は消える。Cursor の `slice-reviewer` は top＝opus 系統になる。fable は master だけのものになり、完成ゲートのコストは一段下がる。**その分、偽の空リスト（見逃しによる偽緑）のリスクは上がる**。上がったと観測されたら `slice-reviewer` だけ段を上げる（この ADR を supersede する）。
- 段を下げたエージェント（`contract-author` / `test-designer` / `requirement-definer` / `adr-writer`）の出力品質が落ちる可能性は残る。落ちたときに現れるのは structure-oracle の不整合リストと slice-reviewer の欠陥リストで、いずれも top が受ける。
- 系統名はカタログの呼び方が変われば表の更新が要る。バージョン ID をピン止めするよりは遅いが、ゼロではない。

## 却下した選択肢

- **ADR-0020 のゾーン 2 分＋例外を維持する**: 判断ゾーンの中に切りが無く、`inherit` が親の既定を漏らし、Claude 以外のランタイムで段を言えない。今回直す対象そのものである。
- **全エージェントを top にする**: 一貫はするが、機械オラクル（テスト・型・契約チェッカ）に縛られた工程にまで最上位を払う。ゾーン分けを導入した理由そのものを捨てる。
- **段の表を skill 本文に持つ（frontmatter は据え置き）**: どの agent がどの段かが skill と frontmatter の二箇所に載る。片方だけ動いたとき、どちらが正か決められない。§0 の「二重に持たない」に反する。
- **`model:` にバージョン付き slug を書く**（`claude-opus-5-thinking-high` / `grok-4.6`）: ホストのカタログと予算を拘束し、世代が変わった瞬間に腐る（§0）。段は系統名で持つ。
- **決定論ゾーンに `inherit` を残す**: 親が最上位なら実装体も最上位になり、親が廉価なら実装体も落ちる。配分を宣言する意味が消える。
- **ランタイムごとに別の割当表を持つ**: 同じエージェントの重要度がランタイムで変わるわけではない。段はエージェントの属性、系統名はランタイムへの写像、と分ければ表は一つで済む。
