---
description: "🧪 crow / バックエンド — テスト設計（PHPUnit）"
applyTo: "**/crow3_*/tests/**,**/crow3_*/phpunit.xml*"
---

# 🧪 crow / バックエンド — テスト設計（PHPUnit）

共通規約は [common-testing](common-testing.instructions.md)。この文書は PHPUnit 固有の書式と、crow の生成部分の除外を扱う。書式は [common-coding](common-coding.instructions.md) に従う。テスト名とコメントは日本語で書く。

## Red にする対象

**対象（`app/` 配下の手書き）**

- `app/classes/_common_/model_<table>.php` に自分で定義した instance / static メソッド
- 拡張フック（`validation_crow_ext()` / `save_crow_ext()` / `trash_crow_ext()` / `delete_crow_ext()`）
- `model_<table>_<table>_service.php` と `model_<table>_presenter.php` の手書きメソッド
- `module_*` 内の `action_*` と、どのテーブルにも属さない手書き util

action から呼ばれるもの（model / service / presenter / util）はリクエストを終了せず `crow::get_hdb()` / `crow_request` を自分で呼ばないため、Red テストは行オブジェクト・配列・必要ならモックした `$hdb` を引数で渡すだけで書ける。グローバル状態やスーパーグローバルを置換しなければ書けない、または SUT が途中で終了して完走できない場合は実装側の §1.1 違反であり、テストをねじ曲げず実装不備として報告する。

**対象外 (1) — `engine/kernel/**`**: crow 自体を SUT にしない（`crow_db_table_model::input_from_request()` が受け付ける日時キー形式の網羅、kernel の validation / CSRF / viewpart 解決 / mysqli 層の特性テストなど）。アプリのゲートを修正するならそのゲートを Red にする。

**対象外 (2) — crow が注入する生成メンバー**: フィールド、`m_table_name` / `table_name` / `primary_key`、`sql_select_all()` / `sql_select_one()`（別名で追加した手書きの定型クエリは対象）、`get_<field>_keys()` / `_map()` / `_symbols()` / `get_<field>_str()` / `<field>_str()`、`<refer>_row()`、`db_design.txt` と生成キャッシュや `get_*_map()` の一致を値ごとに写経する同期テスト。

判断基準: 失敗したときに修正するコードが `app/` 配下なら対象、kernel / 生成部分なら対象外。既存の `engine_*_characterization_*` や生成マップの同期テストへ追加しない。

## ツールと配置

- ランナーは PHPUnit。設定は `phpunit.xml`（または `phpunit.xml.dist`）。
- 既定スイートは `tests/` 配下に置き、テスト対象コードのディレクトリ構造を反映する。テスト対象単位（クラスまたは関数）ごとに一つのテストクラスとし、ファイル名とクラス名を一致させる。
- PHPUnit の既定の探索は `*Test.php` 接尾辞であり、crow の snake_case 命名（`check_value_test.php`）は一つも探索されない。`<testsuite>` 内で `<directory suffix="_test.php">` を設定する。
- UC タグはテストクラスの `#[Group('UC-012')]`（PHPUnit 9 以前は `@group UC-012`）。選択実行は `phpunit --group UC-012`。
- 各テストメソッドの docblock に `@covers REQ-045#accept-standard`（一テストにつき宣言済みの分割クラスを一つ）。

## スイートの分離

実 DB または実サービスへ接続するテストは `tests/integration/` に置く。PHPUnit は `tests` を再帰的に拾うため、`<exclude>` がなければ既定スイートに混ざる。`@group integration` のようなタグでは分けない。

```xml
<testsuites>
	<testsuite name="default">
		<directory suffix="_test.php">tests</directory>
		<exclude>tests/integration</exclude>
	</testsuite>
	<testsuite name="integration">
		<directory suffix="_test.php">tests/integration</directory>
	</testsuite>
</testsuites>
```

| スイート | 実行 | 時点 |
| --- | --- | --- |
| 既定 | `phpunit --testsuite default` | 修正ラウンドでは選択実行、全件は完了条件と CI だけ。DB のないマシンで green になる |
| Integration | `phpunit --testsuite integration` | 返却前、コミット前、CI |

`tests/` 直下では DB ハンドルなどの境界を必ずモックする。実接続したくなったら、そのテストは `tests/integration/` に属する。

## 書き方

- テストクラス名は `<target>_test`、メソッド名は `test_` で始め振る舞いを文として snake_case で書く（`test_rejects_name_when_it_exceeds_max_length`）。
- `setUp()` / `tearDown()` は PHPUnit が camelCase を要求するため snake_case の例外。変更したグローバル・static 状態・スーパーグローバルは必ず復元する。
- `i_` 接頭辞はリクエストパラメーター由来の印であり、テスト内で組み立てるリテラルには付けない。
- 値の一致は `assertSame()`（`assertEquals()` は原則使わない）、真偽値は `assertTrue()` / `assertFalse()`（`assertTrue( ! $x )` と書かない）、null は `assertNull()` / `assertNotNull()`、件数・キーは `assertCount()` / `assertArrayHasKey()` などの専用アサーション。
- 同じ振る舞いの入力変種は `@dataProvider` にまとめ、各ケースに名前を付ける。kernel や生成部分の値一覧をケースへ展開しない。
- モックは crow の境界だけ: DB ハンドル（`crow::get_hdb()` に相当）と `crow_request`。operation に対して呼ぶ `module_*` / `action_*` / `model_*` は [common-testing](common-testing.instructions.md) の operation → entry から導出する。

```php
public function test_returns_empty_list_when_no_row_matches()
{
	//	DB 境界をモック（内部ロジックはモックしない）
	$hdb = $this->createMock(crow_hdb::class);
	$hdb->method("select")->willReturn([]);

	$result = list_users($hdb);

	$this->assertSame([], $result);
}
```
