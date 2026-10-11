---
description: "🗄️ crow / バックエンド — DB 設計（`db_design.txt`）の形式と配置"
applyTo: "**/crow3_*/**/db_design.txt"
---

# 🗄️ crow / バックエンド — DB 設計（`db_design.txt`）の形式と配置

> crow の **DB 設計の唯一の SSOT** は、crow 独自形式のテキストファイル `db_design.txt` です。
> crow は **このファイルから直接マイグレーションを生成します**（TypeScript の Prisma における `schema.prisma` に相当）。
> したがって、develop の DB 設計成果物（`mode: schema` の `implementer` の出力）は **`db_design.txt` 自体に書き込みます**。
> 成果物の置き場と作成者は harness の `templates/develop/README.md`、フレームワーク規約の受け渡しは develop skill の `references/bundles.md` に従います。
>
> **内容を日本語で書いてください**（ファイル内のコメントと説明文）。

## 配置（どこに書くか）

- **`db_design.txt`**（crow プロジェクトが定めるパス。マイグレーションの生成元）。
- **docs の草案を作らないでください**（`docs/db/schema.md` など）。crow ではネイティブ形式が SSOT です。利用先は `traceconfig.json` の `schema.files: ["…/db_design.txt"]` にそのファイルを宣言し、`trace-check` C13 が規則を強制する定義の `@implements BR-nnn` コメントを読めるようにします。

## 形式（どう書くか）

- crow 独自形式で記述します。**具体的なフィールド表記・型・リレーションの書き方は、対象プロジェクトの crow のバージョンに従います**（この規約は記述先と SSOT の位置づけを定義します。構文自体はそのプロジェクトの crow ドキュメントか既存の `db_design.txt` を参照してください）。
- `db_design.txt` が既にある場合は、表記と命名を踏襲して **差分として更新します**（既存の慣例を壊さないでください）。

## SSOT を分裂させない（最重要）

- **`db_design.txt` を唯一の SSOT とし、`schema.md` などの別の複製へ転記しないでください。** 重複はマイグレーションと設計文書の不整合を静かに生みます。
- DB 設計の妥当性（正規化・境界・リレーション）は機械で反証できません → develop の **🙋 人間ゲート**に従います（schema implementer は草案で停止し、オーケストレーターが人間の確認を受けて確定します）。**確定するファイルは `db_design.txt` です。** ネイティブ形式に draft/fixed の status フィールドがなければ、オーケストレーターによる人間の承認をもって確定とします（ファイルに status フィールドを無理に追加しないでください）。
