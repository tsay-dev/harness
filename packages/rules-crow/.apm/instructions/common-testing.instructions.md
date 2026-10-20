---
description: "🧪 crow — 共通テスト規約（全層）"
applyTo: "**/crow3_*/tests/**,**/crow3_*/phpunit.xml*"
---

# 🧪 crow — 共通テスト規約（全層）

crow でテストを書くときに全層で成り立つ事項。PHPUnit 固有の書式は [backend-testing](backend-testing.instructions.md)、ブラウザーを起動するシナリオテストは [system-testing](system-testing.instructions.md)。FE のユニットテスト規約は置かない（develop では FE ユニットテストを作成しない）。テスト名とコメントは日本語で書く。

## テスト対象は手書きの Domain だけ

crow には (A) `engine/kernel/` のフレームワーク本体と (B) `db_design.txt` から注入される生成メンバーがあり、どちらもフレームワークの責務として信頼する。

| 作成する | 作成しない |
| --- | --- |
| `app/` 配下で手書きした Domain メソッド、拡張フック、`action_*` の振る舞い。GWT や契約が要求するアプリ固有の判定・導出・失敗経路 | `engine/kernel/**` 自体の振る舞い（入力キー形式の網羅、validation、viewpart 解決、CSRF など） |
| | crow が注入する生成メンバー（定数マップ、`_*_str()`、`sql_select_all()` など）と、enum や定数が増えるたび膨らむ生成 API・kernel API の網羅や特性テスト |

- GWT が enum 値や日時入力を扱う場合でも、SUT はその入力を受け取る手書きロジックやゲートであり、`get_<field>_map()` や `crow_db_table_model::input_from_request()` ではない。
- 既存スイートに kernel や生成部分のテストがあっても手本にしない。

## 実行に必要なものでスイートを分ける

テストレベル名でなく、実行に何を起動する必要があるかで分け、フォルダーで分離する（タグやアノテーションでは分けない）。

| スイート | 判定基準 | 実行 |
| --- | --- | --- |
| 既定（unit） | 外部環境を起動しない（境界だけをモック）。DB もブラウザーもないマシンで green になる | red-green ループ。UC による選択実行ができる |
| Integration | 実 DB または実サービスへ接続する | 境界だけ（返却前、コミット前、CI） |
| System | ブラウザーまたは実機を起動する。UC ごとに一つのシナリオテストだけを置く（`tests/` の外の `e2e/`） | UC で選択実行、全件は `commands.system` と CI |

- 「一つのコマンドで実行し終了コードで red / green を決める」はスイートごとに一つのコマンドという意味。integration や system を既定スイートのコマンドに混ぜない。
- バックエンドの契約適合テスト（入出力・純粋関数）は外部環境を起動しないため既定スイートに属し、integration へ移さない。Phase4 の red-green ループを担うのは BE テストである。
- `e2e/` が空フォルダーなら、人が利用するすべての active UC に対する C15 違反。

## テストから操作を呼び出す（operation → entry）

契約適合テストは実装から知った識別子でなく契約が示す入口から operation を呼ぶ。テストを書く側と実装を書く側はそれぞれ `contract.yaml` と下の表から入口を導出し、互いの成果物からは導出しない。実装が入口を別の場所へ置いた場合は実装を移す（R-801）。

| 契約（`contract.yaml`） | テストが読み込むファイル | 呼び出す入口 |
| --- | --- | --- |
| `transport: http`、operation `getProgressRows`、`wire.path: /progress/get_progress_rows` | `app/.../module_progress.php` — `wire.path` の先頭セグメントに対応する `module_<resource>`（ルーティングが異なる場合は利用先の `CLAUDE.md` に対応を宣言） | `action_get_progress_rows` — `action_` + operation 名の snake_case。`crow_request` と `$hdb` を置換し、`exit_ok` / `exit_ng` の payload を読む |
| その action の背後の判定（validation・権限・導出） | `app/classes/_common_/model_<table>.php` | action が委譲する手書きの `model_*` メソッド — 推奨 SUT。行オブジェクト・配列を引数として呼ぶ |
| 利用先の `commands.contract_adapter`（`traceconfig.json`）を介する任意の operation | なし — operation 名と example でアダプターをプロセス内実行 | — |

## UC タグと `@covers`

- すべてのテストに UC ID（`UC-nnn` — `docs/goals/` 配下の UC ディレクトリ名と同じキー）を機械で選択できる形式で付ける（構文は層別の規約）。タグのないテストは選択実行から脱落する。
- 各テストは宣言済みの分割クラスを一つだけ、テストメソッドの直上の行コメント `//<TAB>@covers REQ-nnn#class` で示す（`trace-check` C10 / C11 が読む。クラスは先に REQ の `## 検証方針` で宣言する）。docblock には書かない（PHPUnit が `@covers` をカバレッジ対象の指定として解釈する）。

## 命名

識別子は snake_case。ただしテストフレームワークが必須とする識別子（PHPUnit の `setUp()` など）を優先する。テスト名だけで「何をしたら何が起きるか」が分かること。
