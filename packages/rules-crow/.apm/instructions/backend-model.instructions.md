---
description: "🧠 crow / バックエンド — model / service / presenter / util（Domain 側）"
applyTo: "**/crow3_*/app/classes/**"
---

# 🧠 crow / バックエンド — model / service / presenter / util（Domain 側）

> **読むタイミング：`app/classes/_common_/` 配下の PHP を作成・修正するとき**
> （`model_<table>` / `model_<table>_<table>_service` / `model_<table>_presenter` / `common_presenter` / model 以外の util）。
> action だけを変更するなら開かないでください。
>
> **責務境界は [coding.md](backend-coding.instructions.md) §1.1 を正とします**（矛盾時はこの規約より優先）。
> action 側は [action.md](backend-action.instructions.md) に従います。**raw フラグメントを使う定型クエリを書くなら、[query.md](backend-query.instructions.md) §3.9 も開いてください**。
> 共通の書式は [common/coding.md](common-coding.instructions.md) に従います。**共通規約やほかの規約を再記載しないでください。**
>
> 節番号はバックエンド規約全体で通し番号です（`coding.md` §1 → `action.md` §2 → この規約 §3、§4）。
>
> **コメントは日本語で書いてください。**

---

## 3. model（Domain）

### 3.1 役割

`model_<table>` の **手書き部分**が、そのテーブルの Domain の配置先です。
永続化（ORM・生成メンバー）はフレームワークの継承を通じて同居します。それで構いません。

> **その model が主語となるロジック（判定・導出・定型取得）は
> `model_<table>` のメソッドとして定義します。`module_*` 側に書かないでください。**

理由：module に置くと機能ごとに散らばり、同じ判定・取得が複数の `action_*` に重複します。
model に集約すれば、**そのテーブルの意味を知りたいときに読む場所が一つに定まります**。

### 3.2 crow の生成と拡張点

- crow は `db_design.txt` から **`model_<table>` を自動生成します**（配置と形式は [backend/db.md](backend-db.instructions.md)）。
  生成物はキャッシュです。手編集しないでください。
- 拡張点は **`app/classes/_common_/model_<table>.php`** です。
  crow はクラス宣言直後（最初の `{` の直後）に生成メンバーを注入してから読み込みます。
- ファイルがなければ標準の生成クラスがそのまま使われます。**拡張は後から追加できます。**

### 3.3 model に置くもの

| ロジックの性質 | 書き方 |
| --- | --- |
| 一行の状態から得られる導出値・判定（例：`is_owned_by()`） | **instance メソッド**（配列行だけを扱うなら同等の **static** でも可） |
| そのテーブルが **主語**となる検索条件・集計・定型クエリ（JOIN 可） | **static メソッド**（`sql_select_all()` を起点にするか、`raw` フラグメントを組み立てる） |
| 主語の行へ関連テーブル情報を付加する定型の合成（スキル一覧の添付など） | 主語 model の **static**（HTTP に触れない） |
| 保存前の値補完・整合性検査・削除後の後処理 | **拡張フック**（§3.7） |

表示整形（`display_name`、未設定日付の表現、アプリが追加する enum の表示）は **model に置きません**（→ §3.11、presenter）。

### 3.4 定型クエリの配置（JOIN を含む）

一覧・候補集合・件数付き検索を書くときは、**返す行集合の主語テーブル**の model に置きます。

| 判断方法 | 配置先 |
| --- | --- |
| pager の `rows` が何の一覧か | そのテーブルの `model_*` |
| JOIN やサブクエリで他のテーブルを参照する | 主語は上記のまま。他のテーブルは参照として記述 |
| 他の model 一つを参照するだけ（`xxx_row()` で親を取得するなど） | 参照元の model 内で完結してよい |

**取得（クエリ）の主語は常にテーブルです。** JOIN があっても返す行集合の主語は一意に決まるため、
**定型クエリを §3.12 の service へ逃がさないでください**（service は判定・導出の配置先であり、取得の配置先ではありません）。

**行順（契約上の取得順）**

- 一覧・候補集合の行順は **SQL の `ORDER BY`** を正とします（`sql_select_*` チェーン、または [query.md](backend-query.instructions.md) §3.9 のフラグメント）。
- **取得後に PHP で再ソートしないでください**（`usort`、`array_multisort` など。action・model・presenter・util のいずれでも禁止）。
- 同じ並び順を SQL の `ORDER BY` と PHP 側で二重に持たせないでください。
- 複数結果を合成した後に順序が必要でも、SQL / 取得クエリ側でその順序を決めます。
- FE が並べ替えてよいのは **契約上の行順を変えない範囲**だけです（一ページ内の一時的な UI グルーピングなど）。FE で一覧の正規順序を再構築しません。

**禁止事項**

- テーブル横断のクエリを集める **横断クエリファクトリークラス**を導入し、そこに定型取得をため込む。
- 「JOIN があるので model に置けない」と判断する（主語が一意なら model に置きます）。
- PHP でクエリ結果を再ソートする（行順は SQL 内で完結させます）。

**取得に関して action に残すもの**

- いつ、どのクエリを呼ぶかと、結果に応じた停止・返却。
- 一リクエスト内で複数の主語クエリを **順に**呼び出すこと（オーケストレーション）。
- 更新の Tx 境界。

### 3.5 行の補完と表示の配置

取得後に行へフィールドを追加したり表示向けに整えたりする処理は、その性質で分けます。

| 性質 | 配置先 |
| --- | --- |
| 一テーブル（主語の行）から得られる **業務上の導出値・判定** | その `model_*` |
| **複数テーブルの状態を同時に見なければ決まらない業務判定・導出** | `model_<table>_<table>_service`（§3.12） |
| 一テーブルから得られる **共通表示整形**（契約に載せる） | `model_*_presenter`（§3.11） |
| テーブル非依存の **汎用表示整形** | `common_presenter`（§3.11） |
| 主語の行へ関連テーブルのデータを定型的に付加する | 主語 `model_*` の static（または action が複数の model を順に呼ぶ） |
| 一画面専用の見出し・文言・要約・表現 | **FE** の feature / scene（action にため込まない） |
| テーブル非依存の **非表示**の共通処理（フィルター値の整備など） | **model 以外の util**（§4） |

「巨大な整形クラスへすべて追加する」ことはしないでください。迷ったら上の表で分けます。

### 3.6 拡張ファイルの書き方

```php
<?php

class model_user extends crow_db_table_model
{
	//--------------------------------------------------------------------------
	//	所有者かどうか（Domain 判定）
	//--------------------------------------------------------------------------
	public function is_owned_by($user_id)
	{
		return $this->owner_id === $user_id;
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

- クラス名は **`model_<table name>`**、継承元は **`crow_db_table_model`** です。
- **`__construct()` は書かないでください。** 初期化が必要なら **`construct()`** を使います
  （生成された constructor から呼ばれます）。
- **生成メンバーを再定義しないでください。** フィールド、`m_table_name` / `table_name` / `primary_key`、
  `sql_select_all()` / `sql_select_one()`、定数関連の `get_<field>_keys()` / `_map()` / `_symbols()` /
  `get_<field>_str()` / `<field>_str()`、参照先テーブルの `<refer>_row()` は crow が注入します。
  **`sql_select_all()` を上書きせず、別名で定型クエリを追加します。**

### 3.7 保存・validation フック

保存・削除に伴う処理は、action で前後に挟まず、**model の拡張フック**へ置きます。
crow が `check_and_save()` などから呼ぶため、どの入口から保存しても効きます。

| フック | 用途 |
| --- | --- |
| `validation_crow_ext()` | validation の追加。失敗時は `push_validation_error()` |
| `save_crow_ext()` | 保存の拡張。失敗時はエラーを積み、**`false` を返す** |
| `trash_crow_ext()` | 論理削除の拡張。失敗時は同様 |
| `delete_crow_ext()` | 物理削除の拡張。失敗時は同様 |

`save_ext()` / `validation_ext()` / `trash_ext()`（`_crow_` のない名前）は
crow 内部用です。**アプリ側では定義しないでください。**

### 3.8 model に持ち込まないもの

- **[coding.md](backend-coding.instructions.md) §1.1 のすべてのシステム責務**（I/O、**終了**、Tx 境界、`$hdb` の取得、認証、セッション、`crow_log::error()`）。
  「原則」ではなく **絶対**です。異常は戻り値・`push_validation_error()`・`get_last_error()` で返し、停止判断は action に委ねます。
- **表示メソッド**（`display_name` とアプリが追加する表示導出 → §3.11、presenter）
- **画面固有の関心**（表現・画面上の並べ方 → FE。契約レスポンスの組み立ては action）
- **テーブル非依存の共通フィルター値整備**（§4 — 各 model に複製しない）
- **PHP による一覧の再ソート**（行順は SQL の責務 — §3.4）

> 手書きメソッドは I/O から独立しているため、PHPUnit のユニットテスト対象です。
> 生成メンバーはテストしません（対象切り分けは [backend/testing.md](backend-testing.instructions.md)）。
> presenter の手書きメソッドも同様にユニットテスト対象です（§3.11）。

### 3.9 raw SQL とフラグメント

**この節は [query.md](backend-query.instructions.md) へ分離しています。**
`.sql` フラグメントで JOIN・複合フィルター・ページング一覧を組み立てるなら、そちらを開いてください。

---

### 3.10 SQL ビルダーチェーン（`sql_select_all()` 系）

単一テーブルで単純な条件の取得には、**`sql_select_all()` のチェーン**を使います。
複雑な検索は [query.md](backend-query.instructions.md) §3.9 の raw フラグメントにします。

| 状況 | 方法 |
| --- | --- |
| 一テーブル、おおむね単純な `and_where` | `model_*::sql_select_*()` のチェーン（別名の static から呼ぶ） |
| JOIN、複合フィルター、ページング一覧 | raw フラグメント、[query.md](backend-query.instructions.md) §3.9 |

**生成メンバー**

- `sql_select_all()` / `sql_select_one()` は **上書きしません**（§3.6）。
- 定型条件は **`sql_select_active()` など別名の static** として追加します。

**表記**

- チェーンの改行と **セミコロンを独立した行へ置くこと**は [common/coding.md](common-coding.instructions.md) に従います（backend 側では再記載しません）。

```php
public static function sql_select_active()
{
	return self::sql_select_all()
		->and_where("deleted", 0)
		;
}
```

### 3.11 presenter（共通表示値）

契約 payload に載せる **共通表示値**は model でなく presenter に置きます。
画面固有の表現は FE の責務です（[frontend/viewpart-components.md](frontend-viewpart-components.instructions.md) §9）。

#### 判断基準 — presenter に置く表示値

次の **すべて**を満たすものです。

1. テーブル（またはテーブル横断の共通形）の意味として安定している
2. **同じ文言・形が二つ以上の画面、または画面以外の経路（メールなど）で必要**
3. 契約 payload のフィールドとして載る（FE は再導出せず表示する）

満たさないもの（その画面の見出し、レイアウトのラベル、クラス名）→ FE。

#### `model_<table>_presenter`

| 項目 | 内容 |
| --- | --- |
| **配置先** | `app/classes/_common_/model_<table>_presenter.php`（クラス名も同名） |
| **入力** | 主語の `model_*` の行、または同等の配列行。HTTP・`$hdb`・認証に触れない |
| **出力** | 表示用のスカラーまたは小さな配列（契約フィールドの素材） |
| **呼び出し元** | 契約レスポンスを組み立てる action。必要なら内部で `common_presenter` を使ってよい |
| **置かないもの** | 業務判定、SQL、Tx、画面固有のレイアウト、一覧の再ソート |

presenter から model を読むこと（行のフィールド参照）は構いません。**model / service / util から presenter を呼ばないでください。**

生成 API（`get_<field>_str()` / `<field>_str()` など）は crow の生成物として model に残します。
**アプリが追加する表示導出**は presenter へ置きます（生成メンバーを presenter に複製しません）。

```php
<?php

class model_user_presenter
{
	//--------------------------------------------------------------------------
	//	表示用の氏名（契約・複数画面で共有）
	//--------------------------------------------------------------------------
	public static function display_name($user_row_)
	{
		$name = is_object($user_row_) ? $user_row_->name : ($user_row_['name'] ?? '');
		if( $name === '' ) return crow_msg::get('db.user.no_name');
		return $name;
	}
}

?>
```

#### `common_presenter`

| 項目 | 内容 |
| --- | --- |
| **配置先** | `app/classes/_common_/common_presenter.php` |
| **責務** | どのテーブルにも属さない表示整形の一元化（未設定日付の表現、null-safe な表示変換、enum マップを引く共通の **表示側**ヘルパーなど） |
| **置かないもの** | 特定テーブルの表示名の組み立て（→ `model_*_presenter`）、フィルター値の整備と Domain 判定（→ §4 の util / model）、クエリファクトリー |

[coding.md](backend-coding.instructions.md) §1 の「巨大な横断クラスを導入しない」は、**クエリや Domain ロジックの集約**を禁止するものとして維持します。
`common_presenter` は **薄い表示専用の共通窓口**に限定します。

日付や enum の共通表示形 → `common_presenter`。
フィルター値の整備など **非表示**の事項 → §4 の util。
両者で使う生のマップ参照は model の生成 API か util に残し、表示ラッパーだけを presenter に置きます。

### 3.12 ドメインサービス（複数テーブルにまたがる業務ロジック）

**単一テーブルを主語にできない業務ロジックは action に書きません。**
**そのロジックをまとめるクラス（対象テーブル名を連結して名付ける `model_*_service`）**を作成し、そこで完結させます。
§3 の Domain の拡張であり、業務を action（システム責務）へ漏らさないための唯一の逃がし先です。

#### 判断基準 — service を作るとき

次の **すべて**を満たす場合に作ります（一つでも欠ければ作りません）。

1. **二つ以上の `model_*`（テーブル）を同時に見なければ結論が出ない**業務判定・導出
2. **どちらも主語と定められない**（定められるなら主語 model の static — §3.3 / §3.4）
3. **業務規則である**（システムの手順ではない。手順 — 呼び出し順序・Tx・終了 — は action）

作らない場合の例：

| 見た目 | 実際の配置先 |
| --- | --- |
| JOIN で他のテーブルを参照する一覧・件数取得 | 主語 `model_*`（取得の主語は常に一意 — §3.4） |
| 他のテーブル一つを参照して判定するだけ（`xxx_row()` で親を取得して見る） | 参照元 `model_*` |
| 単に「複数の model を順に呼ぶ」 | `action_*`（オーケストレーション — [action.md](backend-action.instructions.md) §2.1） |
| 表示文言の組み立て | presenter（§3.11） |
| テーブル非依存の非表示純粋処理（フィルター値の整備など） | util（§4） |

#### 配置と形

| 項目 | 内容 |
| --- | --- |
| **配置先** | `app/classes/_common_/model_<table>_<table>_service.php`（クラス名も同名） |
| **命名** | **対象テーブル名を snake_case で連結し、末尾に `_service` を付けます。** `model_` + テーブル名 + … + `_service`（例：`model_project_progress_service`）。**業務概念名や造語は使わないでください**（`model_assignment_service` のような名前は禁止 — ファイル名から対象テーブルが分からなくなります） |
| **テーブル名の順序** | **アルファベット順**（同じ組み合わせに別名の service ができるのを防ぐ機械的規則）。読みやすさや主従を表すために並べ替えないでください。名前だけで順序が決まるため、**作成前に既存クラスの有無を名前で検索できます** |
| **継承** | **なし**（`crow_db_table_model` を継承しません。テーブルを持たない通常のクラス — `model_*_presenter` と同じ形） |
| **入力** | `model_*` の行、配列行、スカラー。`$hdb` が必要なら **引数で受け取ります**（[query.md](backend-query.instructions.md) §3.9） |
| **出力** | 判定結果（bool）、導出値、エラー文言、保存する値。**戻り値だけで伝えます** |
| **メソッド** | 原則として static の純粋関数。状態を持たせない |
| **置かないもの** | **[coding.md](backend-coding.instructions.md) §1.1 のすべてのシステム責務**（終了、Tx 境界、`crow::get_hdb()`、`crow_request`、`crow_auth`、`crow_log::error()`）、表示整形（→ presenter）、定型クエリ自体（→ 主語 model） |

**一クラス = 一つのテーブルの組み合わせ。** 名前がテーブルの集合を表すため：

- **同じ組み合わせの service が既にあれば、新規作成せず、そのクラスにメソッドを追加します**（`model_progress_project_service` があれば、progress × project の判定はすべてそこへ置きます）。
- テーブルの組み合わせが異なれば別クラスです（`model_progress_project_service` と `model_project_user_service` は別）。
- **既存メソッドが別のテーブルも見るようになったら、そのメソッドを正しい名前のクラスへ移します**
  （`model_progress_project_service::can_edit()` が user テーブルも見るようになったら、
  `model_progress_project_user_service` へ移します）。名前がテーブルの集合を表すため、これが唯一の整合した扱いです。
  **元のクラスに残したまま対象テーブルを増やさないでください**。名前と内容がずれた瞬間、配置の判断規則がすべて崩れます。
  移動が面倒だからと判定を action へ戻すこともしません。
- **テーブル名が四つ以上連なる場合、本当に一つの判定かを疑います。** 通常は二つ以上の判定が混在しているか、
  実は一テーブルが主語です（→ `model_*`）。短くするために業務概念名へ逃げず、**分割して再検討します**。

呼び出し方向は **action → service → model**（読み取り）です。
**model / presenter / util から service を呼ばないでください**（循環と、主語不明のコードを避けるため）。

#### 例

`project` × `assign` × `user` にまたがる判定（アルファベット順：assign → project → user）：

```php
<?php

class model_assign_project_user_service
{
	//--------------------------------------------------------------------------
	//	この担当者がこの案件の進捗を編集してよいか
	//	（案件・担当割当・ユーザ権限の 3 表にまたがる業務ルール）
	//--------------------------------------------------------------------------
	public static function can_edit_progress($project_row_, $assign_row_, $user_row_)
	{
		if( $project_row_ === false ) return false;
		if( $project_row_->is_closed() === true ) return false;
		if( $user_row_->is_admin() === true ) return true;

		return model_assign::is_active_assignee($assign_row_, $user_row_->id);
	}
}

?>
```

```php
//	action — 結果を受けて止めるのは action（[action.md](backend-action.instructions.md) §2.3 / [coding.md](backend-coding.instructions.md) §1.1）
if( model_assign_project_user_service::can_edit_progress
	(
		$project_row,
		$assign_row,
		$user_row
	) === false )
{
	app::exit_ng('担当外のため操作できません。');
}
```

#### 禁止事項

- **業務概念名や造語でクラスを作る**（`model_assignment_service`、`model_billing_service` など）。名前は必ず **対象テーブル名の連結**にする
- **service を「何でも受ける横断クラス」にする**（[coding.md](backend-coding.instructions.md) §1）。異なるテーブルの組み合わせの判定を同じクラスへ集めない
- 単一テーブルの判定を service へ昇格させる（主語 model が薄くなり、意味が散らばる）
- service に定型クエリ、SQL、Tx、終了を持ち込む
- **複数テーブルの判定を action にハードコードして済ませる**（この節の存在理由であり、最大の逸脱）

> service の手書きメソッドも **PHPUnit のユニットテスト対象**です（[backend/testing.md](backend-testing.instructions.md)）。
> [coding.md](backend-coding.instructions.md) §1.1 を守れば、行オブジェクト・配列を渡すだけでテストできます。

---

## 4. model 以外の util（共通・非表示・どのテーブルにも属さない）

**どの `model_<table>` の Domain にも属さず**、かつ **表示ではない**処理だけを、
`app/classes/_common_/` 配下の model 以外のクラスに置きます。

| 置いてよいもの | 置かないもの（と配置先） |
| --- | --- |
| 複数の種別・テーブルの検索で共通のフィルター値整備（型の確定、未指定を示す値の決定、キーワード LIKE の正規化など） | 特定テーブルを主語とする定型クエリ自体（→ 主語 model） |
| テーブル非依存の受理・parse で非表示のもの | **業務規則としての判定・導出**（一テーブルなら model、複数なら §3.12 の service）。util は業務を知らない |
| | テーブル非依存の **汎用表示整形**（→ `common_presenter`） |
| メール組み立ての送信側や外部 API クライアントなど、テーブルに結びつかないサービス（表示文言の素材は presenter から受け取る） | 一テーブルから得られる共通表示値（→ `model_*_presenter`） |
| | 画面固有の表現と画面上の並べ方（→ FE）。契約レスポンスの組み立て（→ action） |

**判定点を一つに保ちます。** 上記の共通整備処理を各 model へ複写しないでください
（重複すると入口ごとに挙動が分岐し、検索が一斉に壊れます）。

model 側は「自テーブルの許可キー・フラグメント名・WHERE の意味」を持ち、
共通の値整備が必要なときだけ util へ委譲します。

いずれかの model に無理に押し込まないでください。逆に、主語が一意の取得を util へ逃がさないでください。
util に表示整形を置かないでください（§3.11）。

---
