---
id: ADR-0060
title: Righthub 規約として PostgreSQL と Prisma を採用する
status: accepted
date: 2026-11-05
supersedes: ADR-0059
---

# ADR-0060 Righthub 規約として PostgreSQL と Prisma を採用する

## Context

利用者がルール名を Righthub にし、データアクセスに Prisma を使うよう指定した。Hono、React SPA、Node.js、VPS 内の PostgreSQL という構成は維持する。

## Decision

表示名を Righthub、選択するパッケージ名を `rules-righthub` とする。PostgreSQL の ORM は Prisma とし、スキーマ、生成クライアント、マイグレーション、トランザクション、トレーサビリティの設定を揃える。旧パッケージ名の互換別名は設けない。

パッケージ選択と配送は `tools/apm/test_projection.py` で検査する。Prisma の実利用は消費プロジェクトの型検査と PostgreSQL 統合テストで確認し、規約だけで採用を強制する部分は説得的統制（R-901）とする。

## Consequences

利用者の名称と ORM 選択に一致する独立した規約になる。一方、旧名を指定した導入設定は更新が必要で、Drizzle 用のスキーマや生成物をそのまま Prisma に流用できない。実アプリケーションの DB 移行はこの規約変更では実行しない。

## 却下した選択肢

- **Drizzle を残す**: Prisma を使うという利用者の指定を満たさない。
- **表示名だけを変えて旧パッケージ名を維持する**: 導入時の名称とルール名が食い違うため、選択名も Righthub に揃える。
