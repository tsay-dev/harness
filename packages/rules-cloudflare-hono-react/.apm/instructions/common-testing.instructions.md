---
description: "Cloudflare / Hono / React — テストスイート、契約入口の対応付け、注釈"
applyTo: "**/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx,**/__tests__/**,**/tests/**,**/e2e/**,**/vitest.config.*,**/playwright.config.*,**/apps/api/src/index.ts,**/apps/api/src/features/**/*.routes.ts"
---

# Cloudflare / Hono / React — テストの接続

このスタックでテストを置く場所、入口、注釈を定める。フロントエンド単体テストのリーフはなく、フロントエンド単体テストは作らない。

## スイート

| スイート | ランタイムと境界 | 既定の配置 |
| --- | --- | --- |
| 既定 | Vitest。純粋な業務関数、services、境界フェイクを注入した Hono HTTP。実バインディングとブラウザなし | `tests/backend/` または同じ場所の `*.test.ts` |
| 統合 | workerd 上の Cloudflare Workers Vitest 統合。ローカル D1 / DO / R2 バインディング、本番リソースなし | `tests/integration/` |
| システム | 実 SPA + Worker のシナリオ環境に対する Playwright | `e2e/` |

- 探索はフォルダーとランナー設定で分離し、既定テストが workerd、DB、ブラウザなしで成功するようにする。`traceconfig.json` に `commands.test`、最終ゲートで使うなら `commands.system` を宣言し、統合コマンドは別に記録する。
- `commands.contract_adapter` は利用プロジェクトが明示的に書くもので、Hono RPC が自動で提供しない。宣言済みコマンドだけを使う。

## 操作 → 入口（実装を読まずに導出）

テストと実装を並行で始める前に入口を決める。既定の命名では、機能 `<feature>` の操作はランタイム非依存の route factory `apps/api/src/features/<feature>/<feature>.routes.ts` の `create<Feature>Routes`（`<Feature>` は PascalCase。例: `createChatRoutes`）が受け、全機能を同じ接頭辞にマウントする。利用プロジェクトが作業指針に宣言するのは、UC または操作 → 機能の対応、接頭辞、既定の命名に従わない入口だけで、操作ごとの表、注入する依存、フェイクの使い方は写さない（依存の型は各機能の `*.deps.ts`、フェイクと fixture はテストの足場のコードとコメントが正本。R-1204・R-1010）。factory は本番と同じチェーン化 routes を返してよいが、Object クラスを import したり import 時に実バインディングを要求したりしない。既定スイートに `apps/api/src/index.ts` の import を要求しない。

| 契約の transport | テストの入口 | 呼び出し |
| --- | --- | --- |
| `http` | 境界フェイクを注入した宣言済み route factory | 宣言済み接頭辞でテスト app にマウントし、`wire.method`、`wire.path`、契約例から `Request` を構築して `app.request(request)`。公開ステータス / ヘッダー / body を検証 |
| `internal` | 利用プロジェクトが宣言する操作 → ポートの対応 | 対応と操作名から導出したシンボルを呼ぶ |
| WebSocket / ストリーミング | 利用プロジェクトが宣言する handshake の配置、フレーム対応、ローカルクライアントまたはアダプター | 契約から upgrade とフレームを導出。既定は注入したメッセージ処理、統合は実通信 |
| `commands.contract_adapter` 経由 | 利用プロジェクトのアダプター | アダプタープロトコルで操作名と例を渡す |

対応付けの欠落は埋めるべき前提条件で、ルート文字列からファイル名を推測したり、実装の場所に合わせてテストを変えたりしない。

## 注釈と決定性

- 既定 / 統合ケースは外側のグループを `UC-nnn <title>` とし、各テスト本文の先頭行に `// @covers REQ-nnn#class` を置く（`tests.covers_placement: after`）。シナリオテストは[システムテスト](system-testing.instructions.md)の注釈を使う。
- 時刻と乱数を注入し、外部境界だけをフェイクにし、共有状態を片付ける。実時間の sleep で同期しない。
- タイトルとコメントは `traceconfig.json` の `policy.language`（未宣言なら日本語）。
