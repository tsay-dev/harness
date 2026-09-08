---
id: ADR-0026
title: ベンダー中立の APM パッケージを正本にし用途と技術スタックを分離する
status: accepted
date: 2026-09-08
supersedes: ADR-0021
---

# ADR-0026 ベンダー中立の APM パッケージを正本にし用途と技術スタックを分離する

<!-- File name: docs/adr/ADR-0026-vendor-neutral-apm-package-monorepo.md (the prefix must equal id). One ADR, one decision. Never rewrite an accepted ADR — add a new one with supersedes: (R-802). Write the content in Japanese. -->

## Context

従来は `.claude/` を正本として Claude / Grok / Codex / Cursor 向けの生成物を射影していた。この構造では、Claude 固有の配置が共有ソースを規定し、消費プロジェクトが必要としない用途や技術スタックまで取り込みやすい。特に Next.js のプロジェクトへ Expo や漫画翻訳のルールが混入すると、関係のないコンテキストを常時消費する。

Microsoft APM 0.30 のパッケージ認識を実機で確認した結果、マニフェストと Agent Skills に寄せたパッケージをモノレポ内に置き、消費側が依存パッケージを選んで install できる。検証で認識された instruction の配置は `.apm/instructions/` 直下である。目的は、エージェント全般の skill / agent / rules を GitHub 上の一つの正本から必要な単位だけ配布することである。

## Decision

正本を `.claude/` から `packages/` へ移し、APM パッケージを用途と技術スタックの境界として管理する。各パッケージは `apm.yml` と `.apm/` を持ち、`.apm/skills/`、`.apm/agents/`、および必要な `.apm/instructions/` に中立ソースを置く。

- `develop-core` は develop の skill / agents と、docs・comments などの共通則を含む。
- `rules-next`、`rules-crow`、`rules-expo`、`rules-swiftui` はそれぞれ対応する技術スタックの葉だけを含む。
- `translate-manga` は翻訳の skill / agents / rules を含み、develop から独立させる。
- root に全パッケージを束ねる既定の APM パッケージは作らない。消費側は `apm.yml` の dependencies または `apm install` で必要なパッケージを明示する。
- `tools/` と `templates/` は APM primitive にせず、リポジトリの別管理資産として残す。
- `applyTo` は中立な対象ファイルのメタデータとして instruction に持たせる。Claude の `paths:` は生成アダプターでだけ導出する。
- `.claude/`、`.agents/`、`.codex/`、`.cursor/`、`.grok/` は生成物として扱い、選択した中立ソースから各ターゲットへ出す。手編集はしない。
- 常駐ゼロを維持する。Codex の compile で全 instruction を常駐文書へまとめず、install 済みの `apm_modules` にある葉を invoke 時に手渡す。APM の install と旧 `init.sh` 系の生成経路を一つの消費プロジェクトで混在させない。
- エージェントの model hint などベンダー固有の指定は中立パッケージから切り離し、各 provider adapter の責任にする。

パッケージの独立認識、依存しないパッケージの不在、tools / templates の非同梱、生成マーカーと手編集禁止は APM 検証および既存の sync / lint 手順で確認する。配置規約は `apm.yml` と `.apm/` の構造、`applyTo` の形式、アダプターの入力境界として強制し、残る「生成物を編集しない」「常駐させない」は文書規約による統制である。

## Consequences

パッケージを選んで install できるため、Next.js だけの消費側に Expo・crow・SwiftUI・漫画翻訳を出さず、develop と翻訳も独立して導入できる。複数プロバイダーの出力を同じ中立ソースから再生成でき、`.claude/` の配置や Claude の `paths:` が正本を拘束しなくなる。既存の develop の段階、agent の役割分離、常駐ゼロの意味もパッケージ分割後に維持できる。

一方、移行期間には既存 `.claude/` の生成物を更新し直す作業が必要で、旧 `init.sh` と APM install の所有範囲を誤ると重複や上書きが起きる。プロバイダーごとの遅延ロード能力には差があるため、Claude 以外では install 後の invoke 時に instruction を選ぶ責任が orchestrator 側へ移る。パッケージを分けることで依存指定は増え、利用者が必要なパッケージを選び忘れる可能性もある。model hint を adapter 外へ出すため、同じ agent でも provider ごとに設定と検証が必要になる。

## 却下した選択肢

- **`.claude/` を SSOT のまま他プロバイダーへ射影する**: Claude 固有の配置が中立ソースになり、APM の install 単位と責任境界を作れないため却下した。
- **全用途・全スタックを一つの APM パッケージにする**: Next.js の消費側へ Expo や漫画翻訳まで入り、不要なコンテキストを取り込むため却下した。
- **独自の方言ツリーを作る**: APM が理解できない primitive や配置を発明すると、公式の install / compile と互換性を失うため却下した。
- **`tools/` と `templates/` を APM パッケージに含める**: 実行資産と文書テンプレートの管理責任を APM の配布単位へ混ぜ、必要なプロンプトだけを取り込む境界を曖昧にするため却下した。
- **全 instruction を常時コンパイルして配置する**: 常駐ゼロを壊し、対象ファイルに関係のないルールまでコンテキストを消費するため却下した。
- **model hint を中立パッケージに残す**: provider のカタログや実行面を共有ソースが拘束し、別プロバイダーで解釈できない指定が混入するため却下した。
- **APM と旧 `init.sh` を同じ消費プロジェクトで併用する**: 同じ生成先の所有者が二重になり、生成結果の衝突と手編集禁止の境界が不明確になるため却下した。
