---
description: "🗄️ crow / バックエンド — DB 設計（`db_design.txt`）の形式と配置"
applyTo: "**/crow3_*/**/db_design.txt"
---

# 🗄️ crow / バックエンド — DB 設計（`db_design.txt`）の形式と配置

crow の DB 設計の唯一の SSOT は crow 独自形式のテキストファイル `db_design.txt` であり、crow はこのファイルから直接マイグレーションと `model_<table>` を生成する。ファイル内のコメントと説明文は日本語で書く。

- DB 設計成果物（`mode: schema` の implementer の出力）は `db_design.txt` 自体に書く。`docs/db/schema.md` などの草案や複製を作らない。
- 利用先は `traceconfig.json` の `schema.files: ["…/db_design.txt"]` にこのファイルを宣言する（`trace-check` C13 が規則を強制する定義の `@implements BR-nnn` コメントを読む）。
- フィールド表記・型・リレーションの構文は対象プロジェクトの crow のバージョンに従う（そのプロジェクトの crow ドキュメントか既存の `db_design.txt`）。既存ファイルがあれば表記と命名を踏襲して差分で更新する。
- DB 設計の確定は人間ゲート。schema implementer は草案で停止し、人間の承認をもって `db_design.txt` を確定とする。ネイティブ形式に draft / fixed の status フィールドがなければ、無理に追加しない。
