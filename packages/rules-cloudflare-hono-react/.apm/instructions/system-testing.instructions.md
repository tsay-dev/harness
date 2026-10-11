---
description: "React SPA / Workers — 実アプリケーションに対する Playwright ユースケースシナリオ"
applyTo: "**/e2e/**,**/playwright.config.*"
---

# React SPA / Workers — システムテスト

UC ごとに主シナリオ 1 つのシナリオテストを Playwright で書く。第二のフロントエンド単体スイートは導入しない。

## 環境

- `e2e/` に `@playwright/test` と `playwright.config.ts`。配置を変えるなら `traceconfig.json` の `tests.system.dirs` も合わせ、`tests.dirs` と重複させず Vitest の探索から除外する。
- 使い捨てのローカル / シナリオバインディングで実 SPA と Hono Worker を同一オリジンで実行する。`webServer`、投入済み fixture、起動コマンドは利用プロジェクトが宣言する。モックした API で代替しない。
- 全スイートコマンドは最終ゲートに含めるなら `commands.system` に宣言する。UC 選択は `playwright test --grep "UC-nnn"`。

## シナリオの形

- UC ごとに 1 ファイル 1 `test`、タイトルは `UC-nnn <UC title>`。テスト宣言の直前に `// @scenario UC-nnn` を置き、`@covers` は付けない。
- 操作は `UC.md` の `## 主シナリオ` から、最終アサーションは `成功時` から導出する。失敗の分割や実装から見つけたナビゲーションを加えない。
- フロントエンド接続前は `test.fixme` で作成し、フロントエンド実装者が `test` に置き換えて成功させる。`test.fixme` を `test.fail` で隠さない。
- ロケーターは[外観 / シナリオの共有契約](frontend-routing.instructions.md)から導出する。Playwright の自動待機と web-first アサーションを使い、`waitForTimeout` は禁止。シナリオは使い捨てデータで独立させ、時刻依存は制御する。再試行で通る成功は欠陥として扱う。
- タイトルとコメントは日本語。
