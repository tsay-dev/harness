---
description: "🧠 crow / バックエンド — model / service / presenter / util（Domain 側）"
applyTo: "**/crow3_*/app/classes/**"
---

# 🧠 crow / バックエンド — model / service / presenter / util（Domain 側）

`app/classes/_common_/` 配下の `model_<table>` / `model_<table>_<table>_service` / `model_<table>_presenter` / `common_presenter` / model 以外の util に適用する。責務境界は [backend-coding](backend-coding.instructions.md) §1.1 が正。raw フラグメントを使う定型クエリは [backend-query](backend-query.instructions.md) §3.9。コメントは日本語で書く。

## 3. model（Domain）

### 3.1 役割と生成

- `model_<table>` の手書き部分がそのテーブルの Domain の配置先。永続化（ORM・生成メンバー）は継承を通じて同居する。その model が主語となる判定・導出・定型取得は `model_<table>` のメソッドにし、`module_*` 側に書かない。
- crow は `db_design.txt` から `model_<table>` を自動生成する。生成物はキャッシュであり手編集しない。
- 拡張点は `app/classes/_common_/model_<table>.php`。crow はクラス宣言直後（最初の `{` の直後）に生成メンバーを注入してから読み込む。ファイルがなければ生成クラスがそのまま使われる。

### 3.3 model に置くもの

| ロジックの性質 | 書き方 |
| --- | --- |
| 一行の状態から得られる導出値・判定（`is_owned_by()` など） | instance メソッド（配列行だけを扱うなら static でも可） |
| そのテーブルが主語となる検索条件・集計・定型クエリ（JOIN 可） | static メソッド（`sql_select_all()` 起点、または `raw` フラグメントの組み立て） |
| 主語の行へ関連テーブル情報を付加する定型の合成 | 主語 model の static |
| 保存前の値補完・整合性検査・削除後の後処理 | 拡張フック（§3.7） |

置かないもの: §1.1 のシステム責務、表示整形（`display_name`、未設定日付の表現、アプリが追加する enum 表示 → presenter）、画面固有の関心（→ FE）、テーブル非依存の共通フィルター値整備（→ §4）、PHP による一覧の再ソート。

### 3.4 定型クエリの配置

- 一覧・候補集合・件数付き検索は、返す行集合の主語テーブル（pager の `rows` が何の一覧か）の model に置く。JOIN やサブクエリで他テーブルを参照しても主語は変わらない。他の model 一つを `xxx_row()` で参照して見るだけなら参照元の model 内で完結してよい。
- 取得の主語は常にテーブルであり、定型クエリを service へ逃がさない（service は判定・導出の配置先）。
- 行順は SQL の `ORDER BY` が正。`usort` / `array_multisort` などで再ソートせず、同じ並び順を SQL と PHP で二重に持たない。
- action に残るのは、いつどのクエリを呼ぶか、複数の主語クエリを順に呼ぶこと、Tx 境界。

### 3.6 拡張ファイルの書き方

```php
<?php

class model_user extends crow_db_table_model
{
	//--------------------------------------------------------------------------
	//	所有者かどうか（Domain 判定）
	//--------------------------------------------------------------------------
	public function is_owned_by($user_id_)
	{
		return $this->owner_id === $user_id_;
	}

	//--------------------------------------------------------------------------
	//	有効なユーザだけを引くクエリ
	//--------------------------------------------------------------------------
	public static function sql_select_active()
	{
		return self::sql_select_all()
			->and_where("deleted", 0)
			;
	}
}

?>
```

- クラス名は `model_<table name>`、継承元は `crow_db_table_model`。
- `__construct()` は書かない。初期化は `construct()`（生成された constructor から呼ばれる）。
- 生成メンバーを再定義しない: フィールド、`m_table_name` / `table_name` / `primary_key`、`sql_select_all()` / `sql_select_one()`、`get_<field>_keys()` / `_map()` / `_symbols()` / `get_<field>_str()` / `<field>_str()`、参照先テーブルの `<refer>_row()`。定型条件は `sql_select_active()` など別名の static で追加する。

### 3.7 保存・validation フック

保存・削除に伴う処理は action で前後に挟まず、model のフックに置く（`check_and_save()` などから呼ばれ、どの入口から保存しても効く）。

| フック | 用途 |
| --- | --- |
| `validation_crow_ext()` | validation の追加。失敗時は `push_validation_error()` |
| `save_crow_ext()` | 保存の拡張。失敗時はエラーを積み `false` を返す |
| `trash_crow_ext()` | 論理削除の拡張。失敗時は同様 |
| `delete_crow_ext()` | 物理削除の拡張。失敗時は同様 |

`save_ext()` / `validation_ext()` / `trash_ext()`（`_crow_` のない名前）は crow 内部用であり、アプリ側で定義しない。フック内で Tx を開かない。

### 3.10 SQL ビルダーチェーン

一テーブルでおおむね単純な `and_where` の取得は `model_*::sql_select_*()` のチェーン。JOIN、複合フィルター、ページング一覧は raw フラグメント（§3.9）。

### 3.11 presenter（共通表示値）

presenter に置く表示値は次をすべて満たすもの: テーブル（またはテーブル横断の共通形）の意味として安定している、同じ文言・形が二つ以上の画面または画面以外の経路（メールなど）で必要、契約 payload のフィールドとして載る（FE は再導出せず表示する）。満たさない画面の見出し・レイアウトのラベル・クラス名は FE。

| 項目 | `model_<table>_presenter` | `common_presenter` |
| --- | --- | --- |
| 配置先 | `app/classes/_common_/model_<table>_presenter.php`（クラス名も同名） | `app/classes/_common_/common_presenter.php` |
| 責務 | 主語テーブルの共通表示値 | どのテーブルにも属さない表示整形（未設定日付の表現、null-safe 変換、enum マップを引く表示側ヘルパー） |
| 入力 | 主語の `model_*` の行または同等の配列行。HTTP・`$hdb`・認証に触れない | 同じ |
| 出力 | 表示用のスカラーまたは小さな配列（契約フィールドの素材） | 同じ |
| 置かないもの | 業務判定、SQL、Tx、画面固有のレイアウト、一覧の再ソート | 特定テーブルの表示名、フィルター値の整備、Domain 判定、クエリ |

- 呼び出し元は契約レスポンスを組み立てる action。presenter から model の行フィールドを読んでよく、内部で `common_presenter` を使ってよい。model / service / util から presenter を呼ばない。
- 生成 API（`get_<field>_str()` / `<field>_str()`）は model に残し、アプリが追加する表示導出だけを presenter に置く。
- 両者で使う生のマップ参照は model の生成 API か util に残し、表示ラッパーだけを presenter に置く。

```php
class model_user_presenter
{
	public static function display_name($user_row_)
	{
		$name = is_object($user_row_) ? $user_row_->name : ($user_row_['name'] ?? '');
		if( $name === '' ) return crow_msg::get('db.user.no_name');
		return $name;
	}
}
```

### 3.12 ドメインサービス（複数テーブルにまたがる業務ロジック）

次をすべて満たす業務判定・導出だけを service に置く: 二つ以上の `model_*` を同時に見なければ結論が出ない、どちらも主語と定められない、業務規則である（呼び出し順序・Tx・終了は action）。JOIN を伴う一覧取得（→ 主語 model）、親を一つ参照して判定するだけ（→ 参照元 model）、複数 model を順に呼ぶだけ（→ action）、表示文言（→ presenter）、テーブル非依存の非表示処理（→ util）は service にしない。

| 項目 | 内容 |
| --- | --- |
| 配置先 | `app/classes/_common_/model_<table>_<table>_service.php`（クラス名も同名） |
| 命名 | 対象テーブル名を snake_case で**アルファベット順**に連結し、末尾に `_service`（例: `model_assign_project_user_service`）。業務概念名や造語（`model_assignment_service`）は禁止 |
| 継承 | なし（`crow_db_table_model` を継承しない通常のクラス） |
| 入力 | `model_*` の行、配列行、スカラー。`$hdb` が必要なら引数で受け取る |
| 出力 | 判定結果（bool）、導出値、エラー文言、保存する値。戻り値だけで伝える |
| メソッド | 原則 static の純粋関数。状態を持たない |
| 置かないもの | §1.1 のシステム責務、表示整形、定型クエリ自体 |

- 一クラス = 一つのテーブルの組み合わせ。同じ組み合わせの service が既にあれば新規作成せずメソッドを追加する。組み合わせが異なれば別クラス。
- 既存メソッドが別のテーブルも見るようになったら、正しい名前のクラスへ移す（`model_progress_project_service::can_edit()` が user も見るなら `model_progress_project_user_service` へ）。名前と内容をずらさない。
- テーブル名が四つ以上連なるなら、複数の判定が混在しているか一テーブルが主語である可能性が高く、分割して再検討する。
- 呼び出し方向は action → service → model（読み取り）。model / presenter / util から service を呼ばない。

```php
class model_assign_project_user_service
{
	public static function can_edit_progress($project_row_, $assign_row_, $user_row_)
	{
		if( $project_row_ === false ) return false;
		if( $project_row_->is_closed() === true ) return false;
		if( $user_row_->is_admin() === true ) return true;

		return model_assign::is_active_assignee($assign_row_, $user_row_->id);
	}
}
```

## 4. model 以外の util（共通・非表示・どのテーブルにも属さない）

| 置いてよいもの | 置かないもの（→ 配置先） |
| --- | --- |
| 複数の種別・テーブルの検索で共通のフィルター値整備（型の確定、未指定を示す値の決定、キーワード LIKE の正規化） | 特定テーブルを主語とする定型クエリ（→ 主語 model） |
| テーブル非依存の受理・parse で非表示のもの | 業務規則としての判定・導出（→ model / service） |
| メール送信側や外部 API クライアントなど、テーブルに結びつかないサービス（表示文言の素材は presenter から受け取る） | 汎用表示整形（→ `common_presenter`）、一テーブルの共通表示値（→ `model_*_presenter`） |

- 共通の値整備は一か所に保ち、各 model へ複写しない。model 側は自テーブルの許可キー・フラグメント名・WHERE の意味を持ち、必要なときだけ util へ委譲する。
- 手書きの model / service / presenter / util メソッドはすべて PHPUnit のユニットテスト対象。生成メンバーはテストしない（[backend-testing](backend-testing.instructions.md)）。
