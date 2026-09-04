---
id: ADR-0024
title: 共有リポジトリを harness に改名し、ホストの submodule パスは新設を .harness・既存は .claude-harness のまま更新する
status: accepted
date: 2026-09-04
---

# ADR-0024 共有リポジトリを harness に改名し、ホストの submodule パスは新設を .harness・既存は .claude-harness のまま更新する

<!-- File name: docs/adr/ADR-0024-rename-to-harness.md (the prefix must equal id). One ADR, one decision. Never rewrite an accepted ADR — add a new one with supersedes: (R-802). Write the content in Japanese. -->

## Context

リポジトリ名 `claude-harness` とホストへの配置パス `.claude-harness` が、Claude Code 以外（Cursor / Grok / Codex）への射影と食い違う。名前はランタイムではなく「オンデマンド・ルーティングの共有プロンプト」である。GitHub 上のリポジトリと、開発マシンのフォルダを `harness` に揃える。

既存ホストは `.gitmodules` と gitlink が `.claude-harness` を指している。`init.sh update` はディレクトリ名を書き換えない（gitlink の SHA だけ進める）。パスを一方的に `.harness` へ変えると、既存ホストの update が「submodule が無い」で止まる。

## Decision

- GitHub リポジトリ名と、このチェックアウトのフォルダ名は **`harness`**。リモートは `tsay-dev/harness`。旧 URL は GitHub のリダイレクトに任せる。
- **新規 install** の submodule パスは `.harness`。`.claude` は `.harness/.claude` への相対リンクのまま。
- **`init.sh update` は `.harness` があればそれを使い、無ければレガシーの `.claude-harness` を使う。** 既存ホストのディレクトリは自動ではリネームしない。
- ログとホスト側の bump コミットメッセージは `harness` に揃える。
- 生成マーカ（cursor-sync / grok-sync / codex-sync）も `harness` に揃える。掃除は旧マーカ `claude-harness` も消す。

## Consequences

**得られるもの**

- 名前がランタイム非依存になる。新規ホストは `.harness` で揃う。
- 既存ホストは `init.sh update` のままタグを取り込める。ディレクトリ名は変わらない。

**代償と今後の制約**

- 既存ホストのフォルダは `.claude-harness` のまま残る。`.harness` にしたいホストは自分で submodule を移す（この決定は自動移行を提供しない）。
- GitHub リネーム後、CI の `uses: …/claude-harness/…` はリダイレクトに頼るか、呼び出し側が `harness` に直す。
- 旧マーカの生成物は次の sync で消える。手書きで旧マーカを含むファイルは誤って消える（生成物だけが対象、という従来どおり）。

## 却下した選択肢

- **既存ホストの `.claude-harness` を update 時に `.harness` へ `git mv` する**: submodule の gitlink / `.gitmodules` / `.claude` リンクをホストごとに書き換える副作用が大きく、失敗すると `.claude` が切れる。退けた。
- **パスは `.claude-harness` のままリポジトリ名だけ変える**: フォルダ名の食い違いが残る。退けた。
- **レガシーパスを即廃止する**: 既存ホストの update が全滅する。退けた。
