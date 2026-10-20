---
description: "📱 Expo — システムスイート（simulator または実機を起動するシナリオテスト）"
applyTo: "**/e2e/**,**/.maestro/**"
---

# Expo — システムテスト

UC ごとに主シナリオ 1 つのシナリオテスト（R-1106–R-1108）を simulator / 実機で書く。既定スイートは[共通テスト](common-testing.instructions.md)。Expo でなければ適用外として破棄する。flow 名とコメントは日本語。

## 環境

- 既定 runner は Maestro（`.maestro/`、または利用先が選ぶなら `e2e/` 配下の YAML flow）。利用先が既に採用していれば Detox でもよく、その場合は以下に相当する規約を `CLAUDE.md` に宣言する。harness はこれ以上 runner を固定しない。
- フォルダーは `traceconfig.json` の `tests.system.dirs` に宣言し、`tests.dirs` と重ねず、Jest の `testPathIgnorePatterns` に入れる。
- 全スイートは単一コマンド（`maestro test .maestro/`）。`traceconfig.json` の `commands.system` に宣言する。CI では宣言の有無にかかわらず実行する。UC 選択は `maestro test --include-tags UC-nnn .maestro/`。
- 対象アプリは利用先の `CLAUDE.md` が宣言するシナリオ環境（backend の種類、base URL の切替、投入済みデータ、使い捨てアカウント、権限 dialog を事前許可する起動引数）へ接続する。producer が発明しない。アプリ内 mock は使わない。

## シナリオ flow の形

```yaml
# @scenario UC-012
name: UC-012 案件を登録する
appId: com.example.app
tags:
  - UC-012
  - pending
---
- launchApp:
    clearState: true
- tapOn: "新規案件"
- tapOn:
    id: "createProject.title"
- inputText: "案件A"
- tapOn: "保存"
- assertVisible: "案件A"
```

- UC ごとに 1 flow。1 行目の YAML コメントに `# @scenario UC-nnn`、その直下の行に `name:` を置き（`trace-check` がこの行をテストの印として読む）、UC ID を `name` の接頭辞と `tags` の両方に置く。`@covers` は付けない。
- 各ステップは `UC.md` の `## 主シナリオ` の番号付きステップ 1 つに、最後の `assertVisible` は `成功時` の事後条件に対応する。シナリオにないことは書かない。
- 保留マーカーは `pending` tag。FE 配線の実装者が外すまで、全体実行（`commands.system`、CI）は `--exclude-tags pending` で除外する。`pending` tag の flow は保留として C15 の被覆に数えられない。
- 固定の `waitFor` / sleep を使わず Maestro の待機に任せる。animation を待たず最終状態を検証し、画面の見えている範囲より下を検証する前に `hideKeyboard`。前回実行の状態は `clearState: true` か実行ごとの使い捨てアカウントで消す。

## locator（探索せず導出する）

| 優先順 | selector | 導出元 |
| --- | --- | --- |
| 1 | `tapOn: "<text>"`、`assertVisible: "<text>"` | 用語集（`docs/01-glossary.md`）の用語そのもの。`accessibilityLabel` と見える text に一致する |
| 2 | `id: "<testID>"` | 契約。operation `createProject` を実行する control → `createProject`、request field `title` → `createProject.title`（[表層コーディング](frontend-coding.instructions.md)が出力する） |
| 禁止 | 座標、index、表示文言をコピーした `testID`、画面名・コンポーネント名 | — |

外観が不一致なら外観側を動かす（ADR-0037）。実装に合わせて flow を変えない。

## simulator は排他資源

- 並行起動された producer は flow を実行しない（simulator 起動、`maestro test`）。編集と静的検査までで止め、flow が未実行であることと実行が必要な UC tag を報告に明記する。例外は新しい 1 flow の作成直後の選択実行と、外観の目視起動（人間ゲート）。
- 並行区間終了後のまとめた実行は、`CLAUDE.md` に宣言した 1 端末に固定し、起動済み simulator を再利用して UC tag で選択実行する。
