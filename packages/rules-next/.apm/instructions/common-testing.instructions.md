---
description: "🧪 Next.js — 共通テスト規約（全レイヤー）"
applyTo: "**/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx,**/__tests__/**,**/vitest.config.*,**/jest.config.*,**/playwright.config.*"
---

# 🧪 Next.js — 共通テスト規約（全レイヤー）

Next.js（App Router）でなければ適用外として破棄する。この文書は Next.js でテストを置く場所、入口、注釈だけを持つ。フロントエンド単体テストの末端文書はなく、FE 単体テストは作らない。テスト名とコメントは日本語。

## runner

harness は runner を固定しない。選択と設定、既定スイート全体を実行する単一コマンド（終了コードで Red / Green が決まる）を利用先の `CLAUDE.md` に記録する。runner が未導入なら先に導入する。

## operation → 入口（実装を読まずに導出）

契約適合テストは契約が示す入口で operation を呼び、実装から知った symbol を使わない。テストを書く側と実装を書く側は `contract.yaml` と下表から入口を導出し、互いの成果物からは導出しない。`app/` の場所は利用先の `CLAUDE.md` が定める。

| 契約（`contract.yaml`）| テストが import するファイル | 呼ぶ export |
| --- | --- | --- |
| `transport: http`、`wire.path: /api/users`、`wire.method: POST` | `app/api/users/route.ts`（`wire.path` を `app/` 配下に置き、その下の `route.ts`）| `wire.method` と同名の export（`POST`）。`examples.*.request` から作った `Request` で呼ぶ |
| Server Action（プロジェクト ADR による `transport: internal`、または利用先が Actions に対応付ける同一アプリ内の更新）| feature の `actions.ts`（`CLAUDE.md` で宣言したミューテーション・コントローラーの場所）| operation と完全に同名の export（`renameUser` なら `renameUser`）。`examples.*.request` を引数に呼ぶ |
| `commands.contract_adapter`（`traceconfig.json`）経由 | なし。operation 名と example で adapter を駆動し、テストコードに実装 symbol は登場しない | — |

実装が別の場所に入口を置いたなら実装を移す（R-801）。

## 注釈と選択実行

- 最外グループ（多くは `describe`）は `UC-012 <UC の題名>`。UC ID は `docs/goals/` 配下の UC ディレクトリ名と同じキー。タグのない新規テストを作らない。
- 各テストは宣言済み分割クラスをちょうど 1 つ示し、`it` / `test` 本体の先頭行に `// @covers REQ-045#accept-standard` を置く（`trace-check` C10 / C11）。
- runner に合わせた UC 選択コマンドを `CLAUDE.md` に書く。

## 決定性

実時間、乱数、ネットワーク、実 DB に暗黙に依存しない。`Date.now` / timer は固定するか fake timer で進め、実時間の `sleep` は使わない。`next/cache`、`cookies`、`headers` はミューテーション・コントローラーのテストで触れるなら mock にする。テストは実行順序に依存せず、共有された可変 global を変えたら元に戻す。

## スイートは実行に必要なもので分ける

| スイート | 判定基準 | 場所（既定）| 実行時点 |
| --- | --- | --- | --- |
| 既定 | 外部環境を起動しない（mock は境界のみ）| 対象構造を反映した配置、`__tests__/` など | Red-Green ループ。UC による選択実行ができる |
| 結合 | 実 DB または実サービスに接続する | `tests/integration/` | 返却前、commit 前、CI |
| システム | ブラウザーを起動する。シナリオテスト（UC ごと 1 本）だけを持つ | `e2e/` | UC で選択実行、全件は `commands.system` と CI。[system-testing](system-testing.instructions.md) |

- フォルダーで分け、結合・システムの配置を既定スイートの探索から除外する（runner 設定で ignore）。DB もブラウザーも利用できないマシンで既定スイートが Green になること。場所を変えるプロジェクトは `CLAUDE.md` に宣言する。
- バックエンドの契約適合テスト（[backend-testing](backend-testing.instructions.md)）は外部環境を起動しないので既定スイートに属し、結合へ移さない。Red-Green ループは BE テストが担う。
- Green は前提条件であり完了の定義ではない。coverage は手掛かりであり目標ではない。
