---
id: ADR-0059
title: Xserver VPS 向けスタックの DB を PostgreSQL に固定する
status: superseded
date: 2026-11-05
---

# ADR-0059 Xserver VPS 向けスタックの DB を PostgreSQL に固定する

## Context

Xserver VPS 向けルールの構成について、利用者が Hono、React SPA、Node.js、PostgreSQL を明示的に選択した。初期の規約では DB エンジンを案件ごとに選ぶ形だったため、方言と検証環境を確定する必要がある。

## Decision

`rules-xserver-vps-hono-react` のリレーショナル永続化は VPS 内の PostgreSQL と Drizzle に固定する。スキーマ、接続、マイグレーション、統合テストの規約を PostgreSQL に揃える。具体的な版と接続情報は消費プロジェクトの設定で管理する。

選択は規約とレビューによる説得的統制（R-901）であり、パッケージ導入だけで実 DB の種類を強制しない。消費プロジェクトの型検査と本番相当の PostgreSQL に対する統合テストでドライバーと SQL の整合を検証する。

## Consequences

DB 方言とトランザクションの前提が揃い、SQLite を代替にしたテストで差異を見落とすことを防げる。一方、このパッケージを別の DB エンジンへそのまま適用できず、VPS 内に PostgreSQL を運用する必要がある。

## 却下した選択肢

- **DB エンジンを案件ごとに選択する**: 利用者が PostgreSQL を明示したため、このスタックでは選択肢を残さない。
- **D1 を継承する**: VPS 内で完結する PostgreSQL 構成という指定を満たさない。
