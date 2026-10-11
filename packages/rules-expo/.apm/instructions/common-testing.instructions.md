---
description: "🧪 Expo — 共通テスト規約（全レイヤー）"
applyTo: "**/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx,**/__tests__/**,**/jest.config.*"
---

# Expo — テストの接続

このスタックでテストを置く場所、入口、注釈を定める。フロントエンド単体テストのリーフはなく、フロントエンド単体テストは作らない。Expo でなければ適用外として破棄する。テスト名とコメントは日本語。

## スイート（実行に必要なもので分ける）

| スイート | 判定基準 | 既定の配置 | 実行 |
| --- | --- | --- | --- |
| 既定 | 外部環境を起動しない（mock は境界のみ）。契約適合テストもここ | 対象構造を反映した `__tests__/` または同じ場所の `*.test.ts(x)` | Red-Green ループ。UC による選択実行ができる |
| 結合 | 実 API または実サービスに接続する | `tests/integration/` | 境界のみ（返却前、commit 前、CI） |
| システム | simulator、実機、browser を起動する。シナリオ flow だけを持つ | `.maestro/` または `e2e/` | [システムテスト](system-testing.instructions.md) |

- runner は Jest と `jest-expo` preset。素の `react-native` preset や独自の ts-jest 設定を作らない。
- 単一コマンドで実行でき、終了コードで Red / Green が決まる。未導入なら先に導入する。選択、設定、コマンドはプロジェクトの `CLAUDE.md` に記録し、`traceconfig.json` に `commands.test`、`commands.system` を宣言する。
- フォルダーで分離し、`tests/integration` と `e2e` / `.maestro` を `testPathIgnorePatterns` に入れる。simulator も server もないマシンで既定スイートが Green になること。
- 外部環境を起動しない契約適合テストは既定スイートに属し、結合スイートへ移さない。

## 操作 → 入口（実装を読まずに導出）

テストを書く側と実装を書く側はそれぞれ `contract.yaml` と下表から入口を導出し、互いの成果物からは導出しない。レイヤーは[データフロー](frontend-dataflow.instructions.md)、module の配置は利用プロジェクトの `CLAUDE.md` が定める。

| 契約の transport | テストが import するファイル | 呼ぶ export |
| --- | --- | --- |
| `http` / `sdk`（送信側） | feature の API module（query 層の `queryFn` / `mutationFn` が import するファイル） | operation と完全に同名の関数（operation `fetchUser` → `fetchUser`）。`examples.*.request` で呼び、network は境界で fake にする |
| `local-store` | feature の永続化 module | operation と完全に同名の関数（`saveAppearance`）。storage adapter を fake にする |
| `device` / `deeplink` / `push` | OS 機能または受信入口を包む module | operation と完全に同名の関数。native module を mock にする |
| `commands.contract_adapter`（`traceconfig.json`）経由 | なし | テストは operation 名と example で adapter をプロセス内で駆動する。実装 symbol は登場しない |

実装が別の場所に入口を置いたなら実装を移す。テストは契約から導出される（R-801）。

## 注釈と決定性

- 最外 `describe` を `UC-nnn <UC の題名>`（`docs/goals/` の UC ディレクトリ名と同じキー）とし、選択実行は `jest -t "UC-nnn"`。各テスト本体の先頭行に `// @covers REQ-nnn#class` を置く（`trace-check` C10 / C11。クラスは先に REQ の `## 検証方針` で宣言する）。シナリオテストは[システムテスト](system-testing.instructions.md)の注釈を使う。
- 実時間の sleep で待たない。animation の完了を待たず検証対象にしない。`InteractionManager` は fake timer で進める。`onLayout` の寸法に依存する分岐を検証しない。native bridge をまたぐ非同期応答は mock で直ちに解決する。
