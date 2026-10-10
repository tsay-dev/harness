---
description: "React SPA / Workers — 実アプリケーションに対する Playwright ユースケースシナリオ"
applyTo: "**/e2e/**,**/playwright.config.*"
---

# React SPA / Workers — システムテスト

[共通テスト](common-testing.instructions.md)に従う。このリーフは develop の UC ごとに主シナリオ一つの規則を Playwright に接続するもので、第二のフロントエンド単体スイートは導入しない。

## 環境と探索

- `e2e/` に `@playwright/test` と `playwright.config.ts` を使う。利用プロジェクトによる変更は配送対応と `traceconfig.json` の `tests.system.dirs` の両方に反映する。
- 使い捨てのローカル / シナリオバインディングを備え、設定した同一オリジンで実 SPA と Hono Worker を実行する。`webServer`、投入済み fixture、起動コマンドを利用プロジェクトで宣言する。モックした API レスポンスで代替しない。
- `tests.system.dirs` と `tests.dirs` を重複させず、Vitest の既定探索から除外する。
- 最終ゲートに含める場合、全スイートコマンドを `commands.system` に宣言する。CI でスイートを実行する。UC 選択コマンドを宣言し、通常は利用プロジェクトのパッケージランナー経由の `playwright test --grep "UC-nnn"` を使う。

## シナリオの形

- UC ごとに一ファイル・一 `test` とし、タイトルは `UC-nnn <UC title>`。テスト宣言の直前に `// @scenario UC-nnn` を置く。シナリオテストに `@covers` タグは付けない。
- `UC.md` の `## 主シナリオ` の番号付き手順から操作を導出し、`成功時` から最終アサーションを導出する。失敗の同値分割や実装から見つけたナビゲーションをシナリオに追加しない。
- フロントエンド接続前は `test.fixme` として作成する。フロントエンド実装者がその印を `test` に置換して成功させる。未完成シナリオを隠すために `test.fail` を使ってはならない。
- プロトコルの境界ケースの追加ブラウザテストをこのスイートに加えない。それらは[バックエンドテスト](backend-testing.instructions.md)に置く。

## ロケーターと決定性

- 両作成者に配送される[外観 / シナリオの共有契約](frontend-routing.instructions.md)でロケーターを導出する。そのリーフを意味的ラベル、テスト ID、独立導出の唯一の正本とする。
- Playwright の自動待機と web-first アサーションを使い、`waitForTimeout` は使ってはならない。使い捨てアカウント / データを独立に用意し、シナリオを実行順序に依存させない。
- シナリオが時刻に依存する場合は制御する。再試行を必要とする成功は修正ではなく指摘として扱う。
- タイトルとコメントは日本語で書く。ディープリンク動作は[アセットルーティング](platform-routing.instructions.md)、描画状態は[フロントエンドのデータフロー](frontend-dataflow.instructions.md)に従う。
