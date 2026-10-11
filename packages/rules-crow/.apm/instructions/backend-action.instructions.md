---
description: "🚦 crow / バックエンド — action（ユースケース）"
applyTo: "**/crow3_*/**/module_*.php"
---

# 🚦 crow / バックエンド — action（ユースケース）

責務境界は [backend-coding](backend-coding.instructions.md) §1.1 が正（矛盾時はそちらが優先）。コメントは日本語で書く。

## 2. action

### 2.1 役割

`module_*` 内の `action_*` は一リクエストの手順だけを持つ。crow に Interactor 層は導入せず、Domain は `model_*` に置く。`action_*` を上から下へ読むと、本文のローカル変数と本文から直接見える `exit_*` だけで次の三つが分かる状態にする。

1. 何を入力として受けたか — リクエスト由来の `$i_*` と、認証などサーバーが補う値
2. 何を出力するか — `exit_ok` / `exit_ng` に渡す契約上のキーと形
3. その間に何を頼んだか — 判定は `model_*` / service、取得順は SQL、表示値は presenter。action 自身は判定の実質も表示整形も持たない

```php
public function action_get_xxx_rows()
{
	//	入力を開く
	$i_scope = crow_request::get('assignment_scope', '');
	$i_page_no = crow_request::get_int('page_no', 1);

	//	受理をゲートする（判定は委譲、exit は本文）
	$message = model_xxx::validate_list_request($i_scope);
	if( $message !== '' ) app::exit_ng($message);

	//	取得を頼む
	$login_user_id = (int) crow_auth::get_logined_id();
	$queries = model_xxx::build_list_queries($login_user_id, $i_scope);
	$pager = crow_db_pager::create_with_query($queries['rows'])
		->set_count_query($queries['count'])
		->set_page_no($i_page_no)
		->build()
		;

	//	表示値を頼む
	$rows = model_xxx_presenter::present_list_rows($pager->get_rows());

	//	出力を閉じる（契約キーを明示）
	app::exit_ok(
	[
		'rows' => $rows,
		'pager' => modifier::create_pager_info_for_view($pager),
	]);
}
```

### 2.2 置くもの / 置かないもの

| 置くもの | 置かないもの（→ 配置先） |
| --- | --- |
| リクエストの読み取り（冒頭に直接記述）とレスポンス | 一行 / 一テーブルから得られる判定・導出値（→ model） |
| §1.1 のすべてのシステム責務（終了、Tx 境界、`$hdb` の取得、認証、致命的ログ） | 複数テーブルにまたがる業務判定・導出（→ `model_*_service`） |
| 認証・権限チェックの進行制御（結果に応じて本文で停止・継続） | 一覧・候補集合の定型クエリの組み立て（→ 主語 model） |
| model 間の更新順序とトランザクション | 保存前の値補完・整合性・削除後の後処理（→ model フック） |
| 契約レスポンスの組み立て（`exit_ok` のキーを明示） | 共通表示値の導出（→ presenter）。画面固有の表現・並べ方（→ FE） |
| | `crow_request` を隠すだけの薄い集約ヘルパー |

判定は Domain が bool やメッセージで返し、`exit_*` は action 本文に残す。複数の action で共有する「結果を見て停止する」形を module 内の薄いヘルパーにまとめてよいが、ヘルパーは判定結果だけを返し `exit_*` を呼ばない。

### 2.4 命名

`action_<verb>_<resource>`。動詞は `get`（一覧・一行・件数）/ `create` / `update`（部分更新も同じ）/ `delete`。例: `action_get_progress_rows`、`action_update_progress`。

### 2.5 リクエストの受け取り

| 読み取り | 用途 |
| --- | --- |
| `crow_request::get_int($key, $default)` | ID・`page_no` などの数値。既定値を明示する |
| `crow_request::get($key, $default)` | 配列、文字列、構造体 |

- action 冒頭に直接書き、`i_` 接頭辞を付ける。同じキーを別の場所で再度読まない。
- 意味のある validate / parse（引数 → 受理した値またはエラーメッセージ）はテーブルの意味なら `model_*`、テーブル非依存なら util に置く。読み取り自体は action に残す。

### 2.6 レスポンス

- Ajax / API action は `app::exit_ok($payload)` / `app::exit_ok()` / `app::exit_ng($message)` で終了する。`exit_*` の後には何も書かない。例外を主経路にしない。
- 画面遷移用の action は `return` や redirect も使えるが、一つの action 内で `exit_*` と `return` を混在させない。
- `exit_ok` の payload には契約フィールドをその場で並べる。巨大な共通 `to_rows` の結果をそのまま返して契約キーを隠さない。

### 2.7 エラーメッセージ

| 種類 | 配置先 |
| --- | --- |
| 業務規則に由来する文言（競合、不正状態、保存失敗の理由） | model（`build_*_message()` または行の `get_last_error()`）。action は `app::exit_ng($row->get_last_error())` のように受け取って渡すだけ |
| 入口で分かる取得失敗の短い定型文（行が取得できない、ID が 0） | action に置いてよい |
| 権限 / 担当外 | action または model のメッセージビルダーのどちらか一方に統一 |

同じ意味の文言を model と action で二重に保守しない。

### 2.8 トランザクション

- `begin()` を開くのは一リクエスト内で複数の model を保存・更新するときだけ。単一 model の `check_and_save()` だけなら不要。
- `$hdb->begin()` / `commit()` / `rollback()` は action だけ。model フック内で呼ばない。
- `begin()` の後、`exit_ng` の前には必ず `rollback()`。Tx 外の後処理（デバイス解放など）も action 内で行う。
- 複数の副作用（成功、0 行、false）を突き合わせる成功判定は `can_commit_*` の純粋関数として Domain に置く（一テーブルが主語なら `model_*`、決まらなければ `model_*_service`）。「0 行は成功か」の判定も Domain の責務。

```php
$hdb = crow::get_hdb();
$hdb->begin();

$trash_result = $progress_row->trash();
$release_result = ...;

if( model_match_suggestion::can_commit_delete($trash_result, $release_result) === false )
{
	$hdb->rollback();
	model_progress::release_pair_write_serializer();
	app::exit_ng('進捗情報の削除に失敗しました。');
}

$hdb->commit();
model_progress::release_pair_write_serializer();
app::exit_ok();
```

### 2.9 認証・権限のゲート

- ログイン済みかは `module_*` 基底の `preload()` で確認する。各 `action_*` に `crow_auth::is_logined()` を繰り返さない。未ログイン + 通常リクエストはログイン画面へ redirect（`preload` は `false` を返す）、未ログイン + Ajax は `app::exit_unauthorized()` など（401 + JSON）。セッション延長や配列入力ガードも `preload()` に置ける。
- 個別リソースの担当スコープの意味（`is_in_assigned_scope($row, $user_id)` など）は model。action は結果を見て `exit_ng` する。module 基底に model を呼ぶ薄いラッパー（`$this->is_*`）を置いてよいが、判定ロジックは書かない。

### 2.10 ログ

| レベル | 用途 | 配置先 |
| --- | --- | --- |
| `crow_log::warning()` | 業務上の不一致、想定外入力、回復可能な異常（enum の不一致、マップにない DB 値） | model / service / presenter / util（Domain が出してよい唯一の記録） |
| `crow_log::error()` | 継続不能、設定不備、起こるべきでない致命的異常 | action の入口 / `preload()` だけ。Domain からは禁止（終了し得る） |

- マップにない DB 値は presenter で既定値へフォールバックしつつ、一か所で一度だけ warning を記録する。ログなしで握りつぶさない。
- 成功経路の細部を action でログ出力しない。
