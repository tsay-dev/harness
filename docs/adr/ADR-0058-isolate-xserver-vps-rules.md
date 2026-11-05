---
id: ADR-0058
title: Xserver VPS 向け規約を独立した選択パッケージにする
status: proposed
date: 2026-11-05
---

# ADR-0058 Xserver VPS 向け規約を独立した選択パッケージにする

## Context

Xserver VPS 内で動かすプロジェクトに、Cloudflare 向けとほぼ同様の開発規約が必要になった。既存の Cloudflare パッケージは Hono と React SPA に加えて Workers の実行モデル、D1、R2、Durable Objects の性質を前提としており、そのまま VPS に適用できない。

## Decision

`rules-xserver-vps-hono-react` を独立して選択できる APM パッケージとする。Hono と React SPA の開発方針を引き継ぎ、実行基盤に依存する規約を VPS 向けに置く。個別ホストの接続先、資格情報、リソース識別子は消費プロジェクトが持つ。

パッケージ選択、出力の隔離と再生成の安定性は `tools/apm/test_projection.py` で検査する。運用時の規約適用は文書とレビューによる説得的統制（R-901）であり、パッケージの生成成功だけで VPS の設定や稼働を保証しない。

## Consequences

Cloudflare を使わない VPS プロジェクトへ必要な規約だけを導入でき、既存利用者の選択や挙動を変えない。一方、共通する開発方針を変更するときは両パッケージの整合性を確認する必要がある。実際の VPS の構築・配備は、このルール追加とは別に検証する。

## 却下した選択肢

- **Cloudflare パッケージに VPS の条件分岐を追加する**: 異なるランタイムの規約が同時に導入され、対象外の前提を読み込むため採用しない。
- **Cloudflare パッケージをそのままコピーする**: Workers と VPS の実行・永続化・配信の違いを隠してしまうため採用しない。
