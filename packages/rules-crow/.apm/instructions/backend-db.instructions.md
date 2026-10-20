---
description: "🗄️ crow / バックエンド — DB 設計（`db_design.txt`）の形式と配置"
applyTo: "**/crow3_*/**/db_design.txt"
---

# 🗄️ crow / バックエンド — DB 設計（`db_design.txt`）の形式と配置

crow の DB 設計の唯一の SSOT は crow 独自形式のテキストファイル `db_design.txt` であり、crow はこのファイルから直接マイグレーションと `model_<table>` を生成する。ファイル内のコメントと説明文は日本語で書く。

- DB 設計は `db_design.txt` 自体に書く。`docs/db/schema.md` などの草案や複製を作らない。
- 規則を強制する定義には `@implements BR-nnn` のコメントを付ける（`trace-check` C13 / C23 が読む。このファイルは `traceconfig.json` の `schema` に宣言する）。
- フィールド表記・型・リレーションの構文は対象プロジェクトの crow のバージョンに従う（そのプロジェクトの crow ドキュメントか既存の `db_design.txt`）。既存ファイルがあれば表記と命名を踏襲して差分で更新する。
- DB 設計の確定は人間の承認による。書く側は草案で停止し、人間の承認をもって `db_design.txt` を確定とする。ネイティブ形式に draft / fixed の status フィールドがなければ、無理に追加しない。
