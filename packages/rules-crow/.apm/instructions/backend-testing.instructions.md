---
description: "🧪 crow / バックエンド — テスト設計（PHPUnit）"
applyTo: "**/crow3_*/tests/**,**/crow3_*/phpunit.xml*"
---

# 🧪 crow / バックエンド — テスト設計（PHPUnit）

> **共通規約は [common/testing.md](common-testing.instructions.md) に従います**（ドメインだけをテスト、一テスト = 一振る舞い、
> 失敗経路を含む、モックは境界だけ、決定性、一コマンド実行、命名、カバレッジの扱い）。
> この文書は **その規約に従ったうえで**、PHPUnit 固有の書式と crow の生成部分の除外を扱います。共通規約は再記載しません。
>
> コードの書式は [common/coding.md](common-coding.instructions.md) に従います（Allman、snake_case、厳密比較、`!` 禁止）。
>
> **テスト名とコメントは日本語で書いてください。**

---

## Red にする対象（kernel と生成部分は除外）

共通規約「ドメイン（手書き）だけをテストする」をバックエンド向けに機械的に切り分けます。

**Red の対象（`app/` 配下の手書き）**

- `app/classes/_common_/model_<table>.php` に **自分で定義した** instance / static メソッド
- 拡張フック（`validation_crow_ext()` / `save_crow_ext()` / `trash_crow_ext()` / `delete_crow_ext()`）
- `app/classes/_common_/model_<table>_<table>_service.php`（複数テーブルにまたがる業務判定 — [backend/model.md](backend-model.instructions.md) §3.12）
  と `model_<table>_presenter.php` の手書きメソッド
- `module_*` 内の `action_*` と、どのテーブルにも属さない手書き util（例：`modifier` の独自ヘルパー）

> action から呼ばれるもの（model / service / presenter / util）は、[backend/coding.md](backend-coding.instructions.md) §1.1 に従い **リクエストを終了せず、
> `crow::get_hdb()` / `crow_request` を自分で呼ばない**ため、Red テストは
> 行オブジェクト・配列・必要ならモックした `$hdb` を **引数で渡すだけ**で書けます（下の「crow の境界の置換」を参照）。
> **グローバル状態やスーパーグローバルを置換しなければテストが書けない**、または
> **SUT が途中で終了してテストが完走できない**場合は、いずれも実装側の §1.1 違反です（[backend/coding.md](backend-coding.instructions.md)）。
> 通すためにテストをねじ曲げず、実装不備として報告してください。

**Red の対象外 (1) — `engine/kernel/**`**

crow 自体を SUT とするテストを作成しないでください。例えば：

- `crow_db_table_model::input_from_request()` が受け付ける日時キー形式の網羅・特性テスト
- kernel 自体の validation / CSRF / viewpart 解決 / mysqli 層の振る舞いを固定するテスト
- 「engine を直接修正しないので、実測して表を固定する」類の特性テスト（フレームワークの責務です。アプリのゲートを修正するなら **そのゲート**を Red にします）

**Red の対象外 (2) — crow が注入する生成メンバー**

[backend/model.md](backend-model.instructions.md) §3.6 の「生成メンバーを再定義しない」と同じ集合です。例えば：

- フィールド自体、`m_table_name` / `table_name` / `primary_key`
- `sql_select_all()` / `sql_select_one()`（別名で定型クエリを追加した手書きメソッドは対象です）
- 定数 / enum 群：`get_<field>_keys()` / `_map()` / `_symbols()` / `get_<field>_str()` / `<field>_str()`
- 参照先テーブルの `<refer>_row()`
- `db_design.txt` と生成キャッシュまたは `get_*_map()` の一致を値ごとに写経する同期テスト

```php
//  NG: kernel の入力形を特性化する（SUT が engine）
public function test_engine_resolves_split_date_keys()
{
    //  crow_db_table_model::input_from_request() を実測して固定する、など
}

//  NG: 生成された定数マップを値ごとに写経する（enum が増えるたびケースが増えるだけ）
public function test_status_map_contains_active()
{
    $this->assertArrayHasKey("active", model_user::get_status_map());
}

//  OK: 手書きドメイン／ゲートが、ある入力のときにどう振る舞うかを検証する
public function test_is_active_returns_false_when_status_is_banned()
{
    $row = new model_user();
    $row->status = "banned";
    $this->assertFalse($row->is_active());
}
```

**境界の判断（迷ったらここへ）**

| 質問 | はい → | いいえ → |
| --- | --- | --- |
| 失敗したときに修正するコードは `app/` 配下か？ | 対象にできる | 対象外（kernel / 生成部分） |
| 既存の `engine_*_characterization_*` または生成マップの同期テストへ追加しようとしているか？ | 止める | — |
---

## ツールと配置

- テストランナーは **PHPUnit**。設定は `phpunit.xml`（または `phpunit.xml.dist`）に集約します
- **既定スイート**は `tests/` 配下に置き、**テスト対象コードのディレクトリ構造を反映します**
- **integration スイート**（実 DB または実サービスへ接続するもの）は `tests/integration/` に分離します（「スイートの分離」を参照）
- テスト対象単位（クラスまたは関数）ごとに **一つのテストクラス**とし、ファイル名とクラス名を一致させます
- **`phpunit.xml` にファイル探索規則を明示します。** PHPUnit の既定は `*Test.php` の接尾辞なので、
  crow の snake_case 命名（`check_value_test.php`）では **一つも探索されません**。
  `<testsuite>` 内で `<directory suffix="_test.php">` を設定します
- **UC タグ**（共通規約の「範囲を指定した実行」）：テストクラスに `#[Group('UC-012')]` を付けます
  （PHPUnit 9 以前は `@group UC-012`）。`phpunit --group UC-012` で選択実行します
- **各テストメソッドの docblock に `@covers REQ-045#accept-standard`** を付けます（一テストにつき宣言済みの分割クラスを一つ。共通規約の「要件の網羅」）

## テストの構造（AAA = Given-When-Then）

各テストを **Arrange → Act → Assert** の三段階で書きます。
オーケストレーターが渡す GWT（Given-When-Then）の受け入れ条件に直接対応します。

```php
<?php

use PHPUnit\Framework\TestCase;

class check_value_test extends TestCase
{
    //  空文字は不正として false を返す
    public function test_returns_false_when_value_is_empty()
    {
        //  準備
        $value = "";

        //  実行
        $result = check_value($value);

        //  検証
        $this->assertFalse($result);
    }
}
```

> `i_` 接頭辞は **リクエストパラメーター由来の印**です。
> テスト内で組み立てるリテラルには付けないでください（印の意味が薄れます）。

## 命名

- テストクラス名は `<target>_test`（snake_case）とします
- テストメソッド名は **`test_` で始め、振る舞いを文として記述**し、snake_case とします

```php
public function test_rejects_name_when_it_exceeds_max_length()
public function test_returns_error_when_age_is_not_numeric()
```

## アサーション（厳密さを徹底する）

テストでも common/coding.md の「真偽値と null は型を含めて比較」「`!` 禁止」を守ります。

- 値の一致は **`assertSame()`**（型を含む厳密比較）とします。原則 `assertEquals()` は使いません
- 真偽値は **`assertTrue()` / `assertFalse()`**（`assertTrue( ! $x )` のような否定は書きません）
- null は **`assertNull()` / `assertNotNull()`**
- 件数・キーなどは専用のアサーション（`assertCount()`、`assertArrayHasKey()`、…）を使い、手動で数えて比較しません

```php
$this->assertSame(3, $count);          //  == ではなく型込みで一致
$this->assertFalse($is_valid);         //  ! を使わずに false を検証
$this->assertNull($record);
$this->assertCount(2, $rows);
```

## 入力の変種はデータプロバイダーへ

共通規約「正常系だけで終わらせない」を PHPUnit で実現する方法です。
同じ振る舞いの入力変種を **`@dataProvider`** にまとめ、各ケースに名前を付けます。

```php
/**
 * @dataProvider invalid_names
 */
public function test_rejects_invalid_name( $name_ )
{
    $this->assertFalse(check_value($name_));
}

public static function invalid_names(): array
{
    return
    [
        "empty"       => [""],
        "only_spaces" => ["   "],
        "too_long"    => [str_repeat("a", 256)],
    ];
}
```

## セットアップと後処理

- セットアップと後処理は `setUp()` / `tearDown()` に置きます（PHPUnit が camelCase を要求するため、この二つは snake_case 規約の例外です）
- グローバル・static 状態、スーパーグローバル（`$_GET` など）を変更したら、必ず復元します

## crow の境界の置換

モックは crow の **外部へ触れる部分**に限定します。DB ハンドル（`crow::get_hdb()` に相当）と `crow_request` です。
契約 operation に対してどの `module_*` / `action_*`（または `model_*` メソッド）を呼ぶかは [common/testing.md](common-testing.instructions.md) の「operation → entry」の慣例に従い、実装でなく契約から導出します。

```php
public function test_returns_empty_list_when_no_row_matches()
{
    //  DB 境界をモック（内部ロジックはモックしない）
    $hdb = $this->createMock(crow_hdb::class);
    $hdb->method("select")->willReturn([]);

    $result = list_users($hdb);

    $this->assertSame([], $result);
}
```

---

## スイートの分離（`phpunit.xml` で配置ごとに切り分ける）

実 DB または実サービスへ接続するテストは、共通規約
[「実行に必要なものによってスイートを分ける」](common-testing.instructions.md)に従って **フォルダーで**分離します。
**`@group integration` のようなタグでは分けないでください。** タグだと既定スイートの実行コマンドから
`--exclude-group` が抜けた瞬間に混入し、green のままなので気づけません。

PHPUnit の既定の探索は `tests` を再帰的に拾うため、**`<exclude>` がなければ integration テストが既定スイートへ混ざります**。

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

| スイート | 実行 | 実行タイミング |
| --- | --- | --- |
| 既定 | `phpunit --testsuite default` | red-green ループが選ぶスイート（ラウンド中は選択実行、境界では全体実行 — develop skill の `references/playbook.md`、*テスト実行の粒度* 節）。**DB のないマシンで green になる必要があります** |
| Integration | `phpunit --testsuite integration` | 境界だけ（返却前、コミット前、CI） |

`tests/` 直下（既定スイート）では、上の「crow の境界の置換」に従い DB ハンドルなどの境界を **必ずモックします**。
実接続したくなったら、そのテストは `tests/integration/` に属します。

---

## ✅ テスト作成前のチェックリスト

- [ ] 最初に対象の GWT 受け入れ条件（オーケストレーターから渡されるもの）を確認したか？
- [ ] **検証対象は手書きのドメインコード（`app/` 配下）か？**（`engine/kernel`、生成メンバー、enum アクセサーの網羅、engine 特性テストではない）
- [ ] `phpunit.xml` のファイル探索接尾辞は crow の命名と一致するか？
- [ ] これから書くテストは実 DB または実サービスへ接続するか？（するなら `tests/integration/`、しないなら `tests/` 直下）
- [ ] `phpunit.xml` の既定スイートは `tests/integration` を `<exclude>` しているか？
- [ ] `assertSame` / `assertTrue|False` / `assertNull` で厳密に検証し、`!` を使っていないか？
- [ ] 入力変種をデータプロバイダーにまとめ、ケースに名前を付けたか？（kernel や生成部分の値一覧を展開していないか）
- [ ] スーパーグローバルと static 状態を復元したか？
