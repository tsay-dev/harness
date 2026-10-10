---
description: "🗃️ crow / バックエンド — raw SQL とフラグメント"
applyTo: "**/crow3_*/app/assets/query/**"
---

# 🗃️ crow / バックエンド — raw SQL とフラグメント

> **読むタイミング：`app/assets/query/**` 配下の `.sql` を作成・修正するとき。**
> raw フラグメントを使う定型クエリを model 側に書くときにも、この規約を開いてください。
> その場合は **必ず `.sql` が伴います**。単純な取得で
> `sql_select_all()` のチェーンだけで足りる場合には読む必要はありません（[model.md](backend-model.instructions.md) §3.10）。
>
> **責務境界は [coding.md](backend-coding.instructions.md) §1.1 を正とします**（矛盾時はこの規約より優先）。
> 配置先の判断は [model.md](backend-model.instructions.md) §3.4、実行の記述は [action.md](backend-action.instructions.md) に従います。
> SQL ファイルのインデント（TAB）は [common/coding.md](common-coding.instructions.md) に従います。
>
> 節番号はバックエンド規約全体で通し番号です（この規約は `model.md` §3 から分離した §3.9）。
>
> **コメントは日本語で書いてください。**

---

## 3.9 raw SQL とフラグメント

`sql_select_all()` のビルダーだけでは定型取得に足りない場合（JOIN、複合
フィルター、ページング一覧）は、**SQL フラグメント + 主語となる model による組み立て**を使います。

#### 役割分担

| 層 | 責務 |
| --- | --- |
| **`app/assets/query/`** | `@fragment_name` 形式の SQL フラグメント（SSOT）。**`ORDER BY` もここに置く** |
| **主語となる `model_*`** | フラグメント名、引数、WHERE の意味、行順、`get_allowed_*_filter_keys()` |
| **[model.md](backend-model.instructions.md) §4 の util** | 複数テーブル共通のフィルター値の整備（skip / 型変換 / キーワード正規化） |
| **`action_*`** | 実行タイミング、`$hdb->raw*` / `raw_select*` の呼び出し、pager への受け渡し |

model は **意味と引数**を組み立てます。**`$hdb` の取得は action の仕事**です（システム責務、[coding.md](backend-coding.instructions.md) §1.1）。
**Domain 側で `crow::get_hdb()` を呼ばないでください。** 実行に `$hdb` が必要なら **引数で受け取ります**
（呼び出し側から渡す `build_list_queries($hdb_, ...)` など）。

#### SQL ファイルの配置

- **`app/assets/query/_common_/`** … 複数 module 共通のフラグメント
- **`app/assets/query/<module>/`** … module 固有のフラグメント
- **`@where_progress_status`** などのフラグメント名は、PHP 側の `$hdb->raw('where_progress_status', ...)` と **完全に一致**させます。

#### 許可リスト

- フィルターの **許可キー**は、主語 model の **`get_allowed_*_filter_keys()`**（または同等の static）に持たせます。
- action からフィルターを直接 SQL へ渡しません。
- 許可リストを複数テーブル共通の util に集約しないでください（[model.md](backend-model.instructions.md) §4 は値の整備だけ）。

#### `raw` と `raw_noencode`

| API | 使用場面 |
| --- | --- |
| `$hdb->raw($name, ...$args)` | フラグメント内で **引用符を付けた `"%s"`** のプレースホルダーへ値を渡す（addslashes が適用される） |
| `$hdb->raw_noencode($name, ...$parts)` | **WHERE 句の連結**、組み立て済みの条件文字列、引用符のない文脈への埋め込み |

- 引用符のない文脈へ渡す値（`= %s` / `in (%s)` のような引用符なしの `%s`）は、**model が `(int)` などで型を確定します**。
  複数テーブル共通の skip / 型変換は **[model.md](backend-model.instructions.md) §4 の util** に委譲します（各 model に複製しません）。
- 引用符なしの `%s` の防御を、`raw()` の addslashes だけに頼らないでください。

#### ページング一覧（rows + count）

JOIN を伴う一覧では、**pager の自動 count 生成を使わないでください**（WHERE にユーザー入力を入れると解析が壊れる場合があります）。

主語 model は **同じ FROM / JOIN / WHERE** に対する二つのクエリを返します。

```php
return
[
	'rows' => $hdb->raw_noencode('get_user_rows', $where_str),
	'count' => $hdb->raw_noencode('count_user_rows', $where_str),
];
```

action はこの配列を `crow_db_pager::create_with_query(...)` または `set_count_query()` へ渡します。

#### 組み立ての流れ（例）

```php
//  model — 意味と引数
public static function build_search_where_fragments($i_filters_)
{
	//  許可リスト → フラグメント名 + 引数（非引用は (int) 等）
}

//  action — 実行
$hdb = crow::get_hdb();
$fragments = model_user::build_search_where_fragments($i_filters);
$where = [];
foreach($fragments as $f)
{
	$where[] = $hdb->raw($f['name'], ...$f['args']);
}
$where_str = (count($where) > 0) ? implode(' and ', $where) : true;
$queries = model_user::build_list_queries($hdb, $where_str);
```

#### 禁止事項

- フラグメントの `@fragment` 名と引数の組み立てを横断クラスに集める。
- 長い SQL 文字列を PHP 内にハードコードする（`.sql` に置く）。
- JOIN を伴う一覧で自動 count 生成だけに頼る。
- 取得後に PHP で行を再ソートする（`ORDER BY` はフラグメントまたは定型クエリで決める）。
