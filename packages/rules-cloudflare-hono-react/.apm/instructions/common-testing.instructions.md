---
description: "Cloudflare / Hono / React — テストスイート、契約入口の対応付け、develop の接続"
applyTo: "**/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx,**/__tests__/**,**/tests/**,**/e2e/**,**/vitest.config.*,**/playwright.config.*,apps/api/src/index.ts,apps/api/src/features/**/*.routes.ts"
---

# Cloudflare / Hono / React — テストの接続

このパッケージは `develop-core` のテスト手順を具体化し、ゲートや作成者 / 判定者の責任は変更しない。
[共通コーディング](common-coding.instructions.md)に従う。バックエンドケースは[バックエンドテスト](backend-testing.instructions.md)、ブラウザシナリオは[システムテスト](system-testing.instructions.md)にある。
フロントエンド単体テストのリーフは提供しない。develop はフロントエンド単体テストを作成しない。

## スイートとコマンド

| スイート | ランタイムと境界 | 既定の配置 |
| --- | --- | --- |
| 既定 | Vitest、純粋な業務関数 / services / 境界フェイクを注入した Hono HTTP。実バインディングやブラウザなし | `tests/backend/` または同じ場所の `*.test.ts` |
| 統合 | ローカル D1 / DO / R2 バインディングを備えた workerd 上の Cloudflare Workers Vitest 統合。本番リソースなし | `tests/integration/` |
| システム | 実際の SPA + Worker シナリオ環境に対する Playwright | `e2e/` |

- フォルダー / ランナー設定でスイート探索を分離する。統合とシステムの配置を既定スイートから除外し、既定テストは workerd、DB、ブラウザを起動せずに成功するようにする。
- 全体と UC 絞り込みのコマンドを利用プロジェクトのガイドに記録する。`traceconfig.json` に `commands.test` と、最終ゲートで使う場合は `commands.system` を宣言する。独立した統合コマンドを記録し、関連する境界 / CI で実行する。
- 固定したツールチェーンに適合する Cloudflare 対応 Vitest 統合を使う。バインディングの Node モックは workerd 統合確認ではない。
- 宣言済みコマンドを使い、契約アダプターのコマンドを創作しない。`commands.contract_adapter` は利用プロジェクトの明示的な機能であり、Hono RPC が自動で提供するものではない。
- ディレクトリ構成変更には[共通コーディング](common-coding.instructions.md)の利用プロジェクト配送対応と、一致する `traceconfig.json` のテスト探索が必要。

## 操作 → 入口（実装を読まずに導出）

独立したテスト / 実装作業の開始前に、各操作の機能、ルートのマウント接頭辞、ランタイム非依存の route factory のパス / export、依存形状、テスト fixture 提供元を利用プロジェクトが宣言する。
既定ファイルは `apps/api/src/features/<feature>/<feature>.routes.ts`。factory の export（例: `createChatRoutes`）と注入する repository / service 境界をその宣言で固定する。factory は本番の組み立てと同じチェーン化 routes を返してよいが、Object クラスを import したり、import 時に実バインディングを要求したりしてはならない。
テストは宣言済みマウント接頭辞で route factory を組み立て、契約から完全な URL を導出する。既定の Node スイートに `apps/api/src/index.ts` の import を要求してはならない。その Durable Object の export が `cloudflare:workers` を読み込む場合がある。
アプリの組み立て、middleware の設定、マウント接頭辞、実バインディングは workerd 統合で別途検証する。利用プロジェクトは実際のソース / スキーマ / テスト配置とコマンドも対応する trace 設定に登録する。ディレクトリ構成は develop のゲートや役割を変更しない。

| 契約の transport | テストの入口 | 呼び出し |
| --- | --- | --- |
| `http` | 境界フェイクを注入した宣言済み機能 route factory | 宣言済み接頭辞でテスト Hono app に factory の結果をマウントする。`wire.method`、`wire.path`、契約例から `Request` を構築し、`app.request(request)` を呼ぶ。公開 HTTP ステータス / ヘッダー / body を検証する。 |
| `internal` | 利用プロジェクトが宣言する操作からポートへのモジュール / export と引数の対応 | 実装を調べて見つけたシンボルではなく、その対応と操作名から導出したシンボルを呼ぶ。 |
| WebSocket / ストリーミング通信 | 利用プロジェクトが宣言する handshake の配置、フレーム対応、ローカルランタイムのクライアントまたはアダプター | 契約から upgrade とフレームを導出する。既定テストは注入されたメッセージ処理、統合テストは実際の通信を網羅する。 |
| `commands.contract_adapter` 経由の任意の対応操作 | 利用プロジェクトが宣言するアダプター | アダプタープロトコルで操作名と例を渡す。実装から見つけたシンボルを import しない。 |

欠落した対応付けは利用プロジェクト / 契約作成者と埋める前提条件。ルート文字列から API ファイル名を推測したり、誤った場所の実装に合わせてテストを変更したりしない。

## タグと決定性

- 既定 / 統合ケースは外側のグループを `UC-nnn <title>` とし、各テスト本文の先頭行に `// @covers REQ-nnn#class` を置く。そのクラスは REQ に宣言済みでなければならない。シナリオテストは下記の別の注釈を使う。
- 時刻と乱数を注入 / 固定し、外部境界だけをフェイク化して、共有状態を片付ける。テスト同期に実時間の sleep を使ってはならない。
- テストタイトルとコメントは日本語で書く。一テスト一動作とし、develop 手順の失敗 / 空 / 権限 / 境界の分割を維持する。
- 範囲を絞った実行と全スイート計測は develop の手引きに従う。カバレッジ率は手掛かりであり、完了条件ではない。
