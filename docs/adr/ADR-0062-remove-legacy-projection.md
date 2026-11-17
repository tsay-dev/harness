---
id: ADR-0062
title: APM を使わない互換展開（init.sh と projector）を廃止し、プロバイダー向けの展開を APM だけにする
status: accepted
date: 2026-11-17
supersedes: ADR-0008
---

# ADR-0062 APM を使わない互換展開（init.sh と projector）を廃止し、プロバイダー向けの展開を APM だけにする

## Context

中立パッケージからプロバイダー向けの出力を作る経路が 2 本あった。APM の install と、APM を使わない環境のための互換展開（`init.sh`、`tools/apm/project.py`、`tools/{codex,cursor,grok}-sync/sync.sh`）である。

互換展開は、所有権の記録（`.harness-legacy.json`）、手書きファイルの保護、symlink の拒否、複数 target の選択の一致を自前で持ち、`tools/apm/test_projection.py` の 16 件のうち 11 件が、互換展開を実行して確かめる検査だった。一方、利用プロジェクトは APM だけで 4 つの target（Claude、Cursor、Grok Build、Codex）へ展開している。Claude の `paths:` と Cursor の `globs` は APM が `applyTo` から出力し、互換展開を通らない。移行対応表 `tools/apm/migration-map.json` は、どのツールからも読まれていなかった。

経路が 2 本あると、「APM と互換展開を同じ消費プロジェクトで混ぜない」という決まりを文書と検査の両方で守り続ける必要がある。使われていない経路のために、その負担を持ち続けている。

## Decision

- 互換展開を廃止する。`init.sh`、`tools/apm/project.py`、`tools/codex-sync/sync.sh`、`tools/cursor-sync/sync.sh`、`tools/grok-sync/sync.sh`、`tools/apm/migration-map.json` を削除する。プロバイダー向けの展開の経路は APM の install だけにする。
- モデルの対応表（`tools/apm/claude-models.json`、`tools/codex-sync/models.json`）は残す。APM は `x-model-tier` をプロバイダーのモデル指定に変換しないので、オーケストレーターが起動時に tier からこの表を引く（ADR-0029 の、native APM の面についての決定をそのまま使う）。置き場も変えない。
- 互換展開を前提にしたほかの有効な ADR の記述は、対象の経路が無くなる。それぞれのほかの決定は変えない。
  - ADR-0026: 「APM の install と旧 `init.sh` 系の生成経路を混在させない」「生成マーカーを既存の sync / lint 手順で確認する」。APM の出力に生成マーカーは無い。
  - ADR-0028: 「互換 adapter が provider の model field を生成し、`x-model-tier` を provider 出力から除去する」。APM の出力には `x-model-tier` がそのまま残り、model field は書かれない。
  - ADR-0029: 「互換 projector が TOML にモデルを書き出す」。
  - ADR-0033: 「legacy 射影も補助ファイルを出力する」。
  - ADR-0034: 「ADR-0008 の射影決定は生きている」。
- Grok Build 向けに agent を `.grok/agents` へ写す仕組み（ADR-0008）は、APM の `grok-build` target が担う。ADR-0008 を置き換える。ADR-0008 の「skills は写さない」「rules は写さない」は引き継がない。APM の `grok-build` target は `.grok/skills/` と `.grok/rules/` も展開する。
- オーケストレーターが対応表を引けるよう、develop skill の指示文に対応表の場所を書く。
- 強制の所在: `tools/apm/test_projection.py` から互換展開を実行する検査 11 件を外し、モデルの対応表が tier の 3 段だけを持ち agent 名を持たないことの検査を足す。中立ソースの側の検査（パッケージに tools / templates を含めない、`applyTo` の形、参照の向き、リンクの到達、行数上限）は変えない。

## Consequences

**得られるもの**

- 展開の経路が 1 本になり、2 本の経路の所有権が重ならないように守る決まりと検査が要らなくなる。
- `tools/` から、プロバイダーごとの sync の入口が無くなり、何が検査ツールで何が展開の道具かが分かりやすくなる。

**代償と今後の制約**

- APM を入れられない環境へは展開できなくなる。必要になったら、APM の出力を別の場所で作って持ち込むことになる。
- tier からモデルへの変換を機械で確かめる経路が無くなる。互換展開は agent ごとにモデルを書き出し、代表の出力をテストで固定していた。今後は、対応表の形だけをテストで確かめ、実際にどのモデルで起動されたかはオーケストレーターの実行に依存する。
- 展開の出力を確かめる自動の検査が無くなる。互換展開の検査は、出力について次を確かめていた。APM の出力については、どれも機械で確かめていない。`docs/apm.md` の確認項目を、新しい consumer で手で確かめる。
  - 選択していないパッケージ、ルートの `AGENTS.md`、`settings.json`、tools / templates が出ないこと。
  - Claude の `paths` と Cursor の `globs` が `applyTo` と同じ対象を表すこと。
  - agent の名前が重複しないこと。
- 互換展開が出力に付けていたものが、APM の出力には無い。
  - Cursor の規約の `alwaysApply: false`。
  - 規約をパッケージごとのディレクトリに分ける配置。APM は 1 つのディレクトリに並べるので、複数の `rules-*` を同時に選ぶと、同じ名前の規約（`common-testing` など）が重なる。
  - Codex で、モデルからの暗黙の起動を禁じた skill に付ける `agents/openai.yaml`。
  - 生成物であることを示すマーカー。
- Grok Build では、規約が `.grok/rules/` に展開される。ADR-0008 は、全文で読まれる規約の展開は常駐ゼロを壊すとして写さなかった。Grok Build がこの規約をいつ読むかは確かめていない。
- `tools/codex-sync/` には対応表だけが残り、ディレクトリの名前が役目を表さなくなる。名前の整理は、検査ツールの入口をまとめるときに行う。
- 旧方式の利用プロジェクトは、`docs/apm.md` の移行手順で APM へ移る必要がある。自動では移行されない。

## 却下した選択肢

- **互換展開を残し、使われていないことを文書に書く**: 経路が 2 本ある負担（混在を防ぐ決まり、所有権の検査 10 件）がそのまま残るため。
- **モデルの対応表も削除する**: APM がモデルを書き出さない面で、オーケストレーターが tier をモデルに変える根拠が無くなる。Codex のカタログ ID は名前から推測できない。
- **対応表を `tools/models/` に移す**: 役目に合う名前になるが、ADR-0029 と複数の文書が今の場所を名指ししている。入口の整理と同時に行うほうが、参照の直し漏れが少ない。
