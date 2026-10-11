---
description: "🧪 Next.js / backend — テスト設計"
applyTo: "**/*.test.ts,**/*.spec.ts,**/__tests__/**,**/vitest.config.*,**/jest.config.*"
---

# 🧪 Next.js / backend — テスト設計

Next.js（App Router）のサーバー側処理が対象。対象外なら破棄する。共通規約（runner、決定性、スイート分離、`UC-nnn` / `@covers`、operation → 入口）は [common-testing](common-testing.instructions.md)、責務分離は [backend-coding](backend-coding.instructions.md)。読み取り配線（RSC page）の単体テストは作らず、page は UC のシナリオテスト（[system-testing](system-testing.instructions.md)）で端から端まで観測する。テスト名とコメントは日本語。

| 役割 | 既定スイートでの扱い |
| --- | --- |
| Domain | 主戦場。副作用も mock も不要な単体テスト。`next/*`、DB、時計に触れない。失敗・空・権限・境界を扱う |
| Use case | 書く。infrastructure は引数注入の境界 mock または fake に限り、domain の内部まで mock にしない。シナリオ結果（`ok` / `reason` など）を検証する |
| Infrastructure | 既定では実 DB や実外部 API を要求せず、in-memory fake または mock で境界の入出力だけを扱う。実 DB のテストは結合スイートに置く |
| ミューテーション・コントローラー（Actions / Route Handlers）| 薄く書く。不正入力ではユースケースを呼ばず失敗を区別できること、正しい入力では期待する引数でユースケースを呼び、シナリオ結果が呼び出し側向けの形（Actions = Result、RH = status + body が契約と一致）に収まること。`revalidatePath` など Next 固有 API は mock にし、cache key を総当たりしない |

肥大化した Server Action にテストを集めない。テストが呼ぶファイルと export は契約から導出する（operation → 入口）。
