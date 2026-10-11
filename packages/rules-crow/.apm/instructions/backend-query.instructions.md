---
description: "🗃️ crow / バックエンド — raw SQL とフラグメント"
applyTo: "**/crow3_*/app/assets/query/**"
---

# 🗃️ crow / バックエンド — raw SQL とフラグメント

`app/assets/query/**` の `.sql` と、それを組み立てる model メソッドに適用する。責務境界は [backend-coding](backend-coding.instructions.md) §1.1 が正。SQL ファイルのインデントは TAB。コメントは日本語で書く。

## 3.9 raw SQL とフラグメント

`sql_select_all()` のビルダーで足りない定型取得（JOIN、複合フィルター、ページング一覧）は、SQL フラグメント + 主語 model による組み立てで書く。

| 層 | 責務 |
| --- | --- |
| `app/assets/query/` | `@fragment_name` 形式の SQL フラグメント（SSOT）。`ORDER BY` もここに置く |
| 主語となる `model_*` | フラグメント名、引数、WHERE の意味、行順、`get_allowed_*_filter_keys()` |
| util（[backend-model](backend-model.instructions.md) §4） | 複数テーブル共通のフィルター値の整備（skip / 型変換 / キーワード正規化） |
| `action_*` | 実行タイミング、`$hdb->raw*` / `raw_select*` の呼び出し、pager への受け渡し |

- `$hdb` の取得は action の仕事。model が実行に `$hdb` を必要とするなら引数で受け取る（`build_list_queries($hdb_, ...)`）。
- 配置は `app/assets/query/_common_/`（複数 module 共通）と `app/assets/query/<module>/`（module 固有）。フラグメント名（`@where_progress_status`）は PHP 側の `$hdb->raw('where_progress_status', ...)` と完全に一致させる。
- フィルターの許可キーは主語 model の `get_allowed_*_filter_keys()`（または同等の static）に持たせる。action からフィルターを直接 SQL へ渡さない。許可リストを util に集約しない。
- 長い SQL 文字列を PHP にハードコードしない。`@fragment` 名と引数の組み立てを横断クラスに集めない。取得後に PHP で再ソートしない。

| API | 使用場面 |
| --- | --- |
| `$hdb->raw($name, ...$args)` | フラグメント内の引用符付き `"%s"` へ値を渡す（addslashes が適用される） |
| `$hdb->raw_noencode($name, ...$parts)` | WHERE 句の連結、組み立て済みの条件文字列、引用符のない文脈への埋め込み |

引用符なしの `%s`（`= %s` / `in (%s)`）へ渡す値は model が `(int)` などで型を確定する。`raw()` の addslashes だけに防御を頼らない。

### ページング一覧（rows + count）

JOIN を伴う一覧では pager の自動 count 生成を使わない（WHERE にユーザー入力が入ると解析が壊れる場合がある）。主語 model が同じ FROM / JOIN / WHERE に対する二つのクエリを返し、action が `crow_db_pager::create_with_query(...)` / `set_count_query()` へ渡す。

```php
//	model — 意味と引数
public static function build_list_queries($hdb_, $where_str_)
{
	return
	[
		'rows' => $hdb_->raw_noencode('get_user_rows', $where_str_),
		'count' => $hdb_->raw_noencode('count_user_rows', $where_str_),
	];
}

//	action — 実行
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
