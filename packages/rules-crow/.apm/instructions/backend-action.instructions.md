---
description: "🚦 crow / バックエンド — action（ユースケース）"
applyTo: "**/crow3_*/**/module_*.php"
---

# 🚦 crow / バックエンド — action（ユースケース）

> **読むタイミング：`module_*` 内の `action_*` / `preload()` を作成・修正するとき。**
> ほかの配置だけを変更するなら開かないでください。
>
> **責務境界は [coding.md](backend-coding.instructions.md) §1.1 を正とします**（矛盾時はこの規約より優先）。
> Domain 側の書き方は [model.md](backend-model.instructions.md)、raw SQL フラグメントは [query.md](backend-query.instructions.md)、
> 共通の書式は [common/coding.md](common-coding.instructions.md) に従います。**共通規約やほかの規約を再記載しないでください。**
>
> 節番号はバックエンド規約全体で通し番号です（`coding.md` §1 → この規約 §2 → `model.md` §3、§4）。
>
> **コメントは日本語で書いてください。**

---

## 2. action（ユースケース）

### 2.1 役割

`module_*` 内の `action_*` は **一リクエストの手順だけ**を持ちます。
Clean Architecture の Use Case / Interactor、DDD の Application Service に相当しますが、
**crow に Interactor 層は導入しません**。Domain の配置先は `model_*` のままです。

**action が書くのは「入力を明示 → 委譲 → 出力を明示」だけです。**
action はユースケースのオーケストレーターであり、**加工場ではありません**。

`action_*` を上から下へ読むとき、次の三つが **action 本文のローカル変数と、本文から直接見える `exit_*` 呼び出し**から分かる必要があります。

1. **何を入力として受けたか** — リクエスト由来の `$i_*` と、認証などサーバーが補う値
2. **何を出力するか** — 本文の `exit_ok` / `exit_ng` に渡す契約上のキーと形
3. **その間に何をしたか** — 業務は `model_*` または定型クエリへ、表示は presenter へ。action 自身には判定の実質も表示整形も持たせません

骨格（必須の読み順）：

1. **入力を開く** — action 冒頭に `crow_request::*` を直接書き、使う `$i_*` を並べます
2. **受理をゲートする** — validation と権限は `model_*`（テーブル非依存なら [model.md](backend-model.instructions.md) §4 の util）へ問い、**NG 時は action 本文で `exit_ng` を呼びます**
3. **取得・更新を頼む** — 主語となる `model_*` の定型クエリまたは保存。複数なら action は順序と Tx だけを持ちます
4. **表示値を頼む** — 契約に載せる共通表示値は `model_*_presenter` / `common_presenter` から取得します（[model.md](backend-model.instructions.md) §3.11）
5. **出力を閉じる** — 本文の `exit_ok` に契約キーをその場で並べます

委譲を一文で表すと：

> action に残してよいのは **誰をどの順序で呼ぶかの選択と、結果を受けて停止・返却を決めることだけです。**
> 「どう判定するか」「どう並べるか」「どう表示文字列へ変換するか」は、それぞれ `model_*`、SQL、presenter に頼みます。

```php
public function action_get_xxx_rows()
{
	//  入力を開く
	$i_scope = crow_request::get('assignment_scope', '');
	$i_page_no = crow_request::get_int('page_no', 1);

	//  受理をゲートする（判定は委譲、exit は本文）
	$message = model_xxx::validate_list_request($i_scope);
	if( $message !== '' ) app::exit_ng($message);

	//  取得を頼む
	$login_user_id = (int) crow_auth::get_logined_id();
	$queries = model_xxx::build_list_queries($login_user_id, $i_scope);
	$pager = crow_db_pager::create_with_query($queries['rows'])
		->set_count_query($queries['count'])
		->set_page_no($i_page_no)
		->build()
		;

	//  表示値を頼む
	$rows = model_xxx_presenter::present_list_rows($pager->get_rows());

	//  出力を閉じる（契約キーを明示）
	app::exit_ok(
	[
		'rows' => $rows,
		'pager' => modifier::create_pager_info_for_view($pager),
	]);
}
```

### 2.2 action に置くもの

| 置くもの | 置かないもの |
| --- | --- |
| リクエストの読み取り（冒頭に直接記述）とレスポンス | 一行 / 一テーブルから得られる判定・導出値（→ model） |
| **[coding.md](backend-coding.instructions.md) §1.1 のすべてのシステム責務**（終了、Tx 境界、`$hdb` の取得、認証、致命的ログ） | **複数テーブルにまたがる業務判定・導出**（→ [model.md](backend-model.instructions.md) §3.12 の service） |
| 認証・権限チェックの **進行制御**（結果に応じて本文で停止・継続） | 一覧・候補集合の定型クエリの組み立て（→ 主語 model） |
| model 間の更新順序とトランザクション | 保存前の値補完・整合性・削除後の後処理（→ model フック） |
| **契約レスポンス**の組み立て（`exit_ok` のキーを明示） | 共通表示値の導出（→ presenter）。画面固有の表現・並べ方（→ FE） |
| 複数の model / presenter 呼び出しを **一リクエストとして順に**並べること | テーブル非依存の共通純粋処理（→ [model.md](backend-model.instructions.md) §4 の util） |
| | `crow_request` を隠すだけの薄い集約ヘルパー。単に値を通すだけの飾りのヘルパー |

### 2.3 model が判定し、action が結果を扱う

**「所有者か？」という判定そのものは Domain（model / service）の責務です。**
action は **その bool または結果を受け取り**、本文で `exit_ng` するかを決めます。
これは [coding.md](backend-coding.instructions.md) §1.1 の絶対規則 1 の具体形です。**Domain は真偽値を返し、停止しません。**

```php
//  model（Domain）— 判定
public function is_owned_by($user_id)
{
	return $this->owner_id === $user_id;
}

//  action（ユースケース）— 結果を受けて進行を決める
if( ! $row->is_owned_by($user_id) )
{
	app::exit_ng('forbidden');
}
```

同じ「結果を見て停止する」形を複数の action で共有したい場合に限り、
module 内の薄いヘルパーへまとめても構いません。
ヘルパーは **判定結果（bool、メッセージなど）だけを返し**、**`exit_*` は action 本文に残します**
（本文から終了経路を追えるようにするため）。ヘルパーや action に判定ロジックをハードコードしないでください。

model に `crow_request` / `app::exit_*` / 認証を入れないでください
（ユニットテストと再利用を壊します）。

### 2.4 命名

`action_*` は **`action_<verb>_<resource>`** の形式にします。

| 動詞 | 使用例 |
| --- | --- |
| `get` | 一覧・一行・件数の取得 |
| `create` | 新規作成 |
| `update` | 更新（部分更新も同じ動詞） |
| `delete` | 削除 |

例：`action_get_progress_rows` / `action_update_progress` / `action_create_project` / `action_delete_progress`

### 2.5 リクエストの受け取り方

[common/coding.md](common-coding.instructions.md) の **`i_` 接頭辞**に従います。
リクエストパラメーター由来の変数には必ず `i_` を付けます。

| 読み取り方法 | 使用場面 |
| --- | --- |
| `crow_request::get_int($key, $default)` | ID・`page_no` などの数値。既定値を明示する |
| `crow_request::get($key, $default)` | `filters` 配列、文字列、構造体 |

```php
$i_page_no = crow_request::get_int('page_no', 1);
$i_filters = crow_request::get('filters', []);
$i_progress_id = crow_request::get_int('progress_id', 0);
```

- 入力の読み取りは **action 冒頭に直接書きます**。
- **`crow_request` を隠すだけの薄い集約ヘルパーを置かないでください**（get をまとめるだけの `*_list_request()` など）。
- `crow_request` から読んだキーを別の場所で **再度読み取らないでください**（冒頭の `$i_*` だけを使います）。
- validation に配列が必要なら、action 内でその場で組み立てて validate に渡すか、個別の引数を渡します。
- 意味のある validate / parse（引数 → 受理した値またはエラーメッセージ）は残して構いません。
  テーブルの意味なら `model_*`、テーブル非依存なら [model.md](backend-model.instructions.md) §4 の util に置きます。**リクエストの読み取り自体は action に残します。**

### 2.6 レスポンスの返し方

**Ajax / API action** は、原則として成功・失敗ともに **`app::exit_ok` / `app::exit_ng` で終了します**。

| 結果 | 返し方 |
| --- | --- |
| 成功（データあり） | `app::exit_ok($payload)` |
| 成功（データなし） | `app::exit_ok()` |
| 失敗 | `app::exit_ng($message)` |

**画面遷移用の action** は `return` や redirect も使えます。
用途によって使い分けて構いませんが、**一つの action 内で exit_* と return を混在させないでください**
（その action の終了経路を読者が追えるようにするため）。

- `exit_ok` / `exit_ng` の後には何も書きません（到達不能）。
- 例外を action の主経路にしないでください（crow の慣例は exit_* を中心とします）。
- **`exit_ok` の payload に、その場で契約フィールドを明示して並べます。**
  巨大な共通 `to_rows` の結果をそのまま返して契約キーを隠さないでください。
  共通表示値は presenter の出力から契約キーへ載せます（[model.md](backend-model.instructions.md) §3.11）。

### 2.7 エラーメッセージの層分け

ユーザー向けの文言は **model と action の間で役割を分けます**。

| 種類 | 配置先 | action での使い方 |
| --- | --- | --- |
| 業務規則に由来するもの（競合、不正状態、保存失敗の理由） | **model**（`build_*_message()` または行の `get_last_error()`） | `app::exit_ng($row->get_last_error())` など — **model から受け取り、そのまま渡すだけ** |
| 取得失敗の汎用定型文（「対象が見つからない」） | 短い定型文なら action に置いてよい | 行が取得できない、ID が 0 など — **action の入口で分かる失敗** |
| 権限 / 担当外 | action または model のメッセージビルダーのどちらかに文言を統一 | model が判定し、action が停止する（§2.3） |

**禁止事項**

- 業務メッセージを action にハードコードし、同じ意味を model とここで二重に保守する。
- model が既に `get_last_error()` を返しているのに、action で別の文言を作る。

```php
//  保存失敗 — model のエラーをそのまま返す
if( $progress_row->check_and_save() === false )
{
	app::exit_ng($progress_row->get_last_error());
}

//  業務競合 — model のメッセージビルダ
if( model_progress::is_pair_write_congested(...) === true )
{
	app::exit_ng(model_progress::build_pair_write_congestion_message());
}

//  入口で分かる取得失敗 — action の短い定型文でよい
if( $progress_row === false )
{
	app::exit_ng('進捗情報の取得に失敗しました。');
}
```

### 2.8 トランザクション

Tx を開くのは **一リクエスト内で複数の model を保存・更新するときだけ**です。
単一 model の `check_and_save()` だけなら **begin は不要**です。

| 操作 | 配置先 |
| --- | --- |
| `$hdb->begin()` / `commit()` / `rollback()` | **action だけ**（システム責務、[coding.md](backend-coding.instructions.md) §1.1） |
| 複数の副作用をまたぐ成功判定（`can_commit_*`） | **Domain**（純粋関数。DB に触れない）。主語が一テーブルなら `model_*`、**主語が決まらなければ `model_<table>_<table>_service`（[model.md](backend-model.instructions.md) §3.12）** |
| 保存自体とフック | model（フック内で Tx を開かない） |

**流れ**

1. 入口のゲート（取得・権限）は **begin の前**に置いて構いません。
2. 複数の保存が必要なら `$hdb = crow::get_hdb();` → `$hdb->begin();`
3. 各 model を保存します。失敗時は **`rollback()` → 後処理 → `exit_ng`**
4. 複数の副作用がある場合、commit の前に **`model_*::can_commit_*()`** で全成功を判定します
5. NG なら `rollback()` → 後処理 → `exit_ng`
6. OK なら `$hdb->commit();` → `exit_ok`

**rollback（必須）**

`begin()` の後は、`exit_ng` の前に **必ず `rollback()`** します。
Tx 外の後処理（デバイス解放など）も **action 内**で行います。

```php
$hdb = crow::get_hdb();
$hdb->begin();

$trash_result = $progress_row->trash();
$release_result = ...;
$expire_result = ...;

if( model_match_suggestion::can_commit_delete(
	$trash_result,
	$release_result,
	$expire_result
) === false )
{
	$hdb->rollback();
	model_progress::release_pair_write_serializer();
	app::exit_ng('進捗情報の削除に失敗しました。');
}

$hdb->commit();
model_progress::release_pair_write_serializer();
app::exit_ok();
```

**`can_commit_*` の役割**

- **複数の保存・副作用の結果（成功、0 行、false）を一か所で突き合わせる**純粋判定です。
- action に if の連鎖を散在させず、**中間状態（片側だけ成功）を作らない**ために model に置きます。
- 判定ロジック自体（「0 行は成功か？」）も model の責務です。

**禁止事項**

- model フック内で `begin` / `commit` / `rollback` を呼ぶ。
- `begin` の後、rollback せずに `exit_ng` する。
- 単一保存だけなのに、習慣で毎回 `begin` する。

### 2.9 認証・権限のゲート

#### ログイン必須（module の入口）

**ログイン済みか**は `module_*` の基底の **`preload()`** で確認します。
各 `action_*` で `crow_auth::is_logined()` を繰り返さないでください。

| 状況 | 返し方 |
| --- | --- |
| 未ログイン + 通常リクエスト | ログイン画面へ `redirect`（`preload` は `false` を返す） |
| 未ログイン + Ajax | `app::exit_unauthorized()` など（401 + JSON） |

`preload()` は **module 全体の入口ゲート**です（セッション延長、配列入力ガードなどもここに置けます）。
**個別リソースの担当スコープ**（「この行に触れてよいか？」）は action + model で判定します（下記）。

#### 担当スコープと権限（リソース単位）

| 層 | 責務 |
| --- | --- |
| **model** | スコープの **意味**（`is_in_assigned_scope($row, $user_id)` など） |
| **action** | model の結果に基づく **停止**（`exit_ng`） |
| **module 基底** | model を呼ぶ **薄いラッパー**（`$this->is_*`）は可。判定ロジックは書かない |

```php
//  model — 担当スコープの意味
public static function is_in_assigned_scope($i_row_, $i_user_id_)
{
	//  案件担当・企業担当・… の業務ルール
}

//  action — 結果を見て止める
if( model_progress::is_in_assigned_scope($org_row, crow_auth::get_logined_id()) === false )
{
	app::exit_ng('担当外のため操作できません。');
}
```

#### エラーメッセージ

権限 NG の文言は **action または model の `build_*_message()` のどちらかに**統一します
（例：「担当外のため操作できません。」）。
action ごとに別の文言を作らないでください。

#### 禁止事項

- model 内で `exit_ng` / `redirect` する。
- 各 action にログインチェックをコピーする（`preload` があるのに重複させる）。
- スコープ判定を action にハードコードする（意味は model に置く）。

### 2.10 ログ（warning / error）

crow のエラーハンドラー設定によって、**`crow_log::error` はリクエストを終了し得ます**。
レベルと配置先で分け、ドメイン層に致命的ログを自由に出させないでください。

| レベル | 用途 | 配置先 |
| --- | --- | --- |
| **warning** | 業務上の不一致、想定外入力、回復可能な異常（enum の不一致、想定外の型の行） | **model / service / presenter / util**（Domain が出してよい唯一の記録） |
| **error** | 継続不能、設定不備、起こるべきでない致命的異常 | **action の入口 / preload だけ。** Domain（model / service / presenter / util）からは **呼び出し禁止** — `crow_log::error()` は終了し得るため、[coding.md](backend-coding.instructions.md) §1.1 の絶対規則 1 に違反 |

**enum の不一致、マップにない DB 値**

- 表示は presenter 側で既定値へフォールバックしつつ、**`crow_log::warning()` で不一致を記録します**（model / util / presenter のどれか一か所）。
- **同一リクエスト内で同じ不一致を繰り返し warning にしないでください**（一度だけ記録）。

**禁止事項**

- Domain（model / service / presenter / util）から `crow_log::error()` を呼ぶ（終了の危険 — [coding.md](backend-coding.instructions.md) §1.1）。
- 握りつぶす（ログなしで既定値を返す）— 不一致は warning で記録します。
- action に成功経路の細部をログ出力させる（ノイズになります）。

---
