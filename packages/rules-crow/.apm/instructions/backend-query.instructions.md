---
description: "🗃️ crow / backend — raw SQL and fragments"
applyTo: "**/crow3_*/app/assets/query/**"
---

# 🗃️ crow / backend — raw SQL and fragments

> **When to read this: when writing or fixing a `.sql` under `app/assets/query/**`.**
> Also open this leaf when writing a routine query on the model side that uses a raw fragment —
> it **always comes with a `.sql`**. You need not open it for a simple fetch that the
> `sql_select_all()` chain alone covers ([model.md](backend-model.instructions.md) §3.10).
>
> **The boundary is authoritative in [coding.md](backend-coding.instructions.md) §1.1** (it wins over this leaf on conflict).
> Deciding where something goes is [model.md](backend-model.instructions.md) §3.4; writing the execution is [action.md](backend-action.instructions.md).
> Indentation in SQL files (TAB) is [common/coding.md](common-coding.instructions.md).
>
> Section numbers run through the backend rules as a whole (this leaf is §3.9, carved out of `model.md` §3).
>
> **Write comments in Japanese.**

---

## 3.9 raw SQL and fragments

When the `sql_select_all()` builder alone does not suffice for a routine fetch (JOINs, composite
filters, a paginated list), use **a SQL fragment + assembly by the subject model**.

#### Division of labor

| Layer | Responsibility |
| --- | --- |
| **`app/assets/query/`** | SQL fragments in `@fragment_name` form (the SSOT). **`ORDER BY` belongs here too** |
| **the subject `model_*`** | the fragment name, the args, the meaning of the WHERE, the row order, `get_allowed_*_filter_keys()` |
| **[model.md](backend-model.instructions.md) §4 util** | cross-table filter hygiene (skip / coerce / keyword normalization) |
| **`action_*`** | when to execute, the `$hdb->raw*` / `raw_select*` calls, handing off to the pager |

The model assembles **meaning and args**; **obtaining `$hdb` is the action's job** (a system responsibility, [coding.md](backend-coding.instructions.md) §1.1).
**Never call `crow::get_hdb()` on the Domain side.** If execution needs `$hdb`, **receive it as an argument**
(as in `build_list_queries($hdb_, ...)`, passed by the caller).

#### Where SQL files go

- **`app/assets/query/_common_/`** … fragments shared by several modules
- **`app/assets/query/<module>/`** … module-specific fragments
- A fragment name such as **`@where_progress_status`** must match the PHP-side `$hdb->raw('where_progress_status', ...)` **exactly**.

#### The allow-list

- The **permitted keys** for filters are held by the subject model's **`get_allowed_*_filter_keys()`** (or an equivalent static).
- An action never passes filters straight into SQL.
- Do not centralize the allow-list into the cross-table util ([model.md](backend-model.instructions.md) §4 is hygiene only).

#### `raw` vs `raw_noencode`

| API | When to use it |
| --- | --- |
| `$hdb->raw($name, ...$args)` | passing values into placeholders **with `"%s"` quoted** inside a fragment (they get addslashes'd) |
| `$hdb->raw_noencode($name, ...$parts)` | **joining WHERE clauses**, an already-assembled condition string, embedding into an unquoted context |

- For values passed into an unquoted context (a `%s` without quotes, as in `= %s` / `in (%s)`), **the model flattens the type with `(int)` or similar**.
  Cross-table skip / coerce is delegated to the **[model.md](backend-model.instructions.md) §4 util** (never duplicated into each model).
- Never rely on `raw()`'s addslashes alone as the defense for an unquoted `%s`.

#### A paginated list (rows + count)

For a list with JOINs, **do not use the pager's automatic count generation** (putting user input into the WHERE can break the scan).

The subject model returns two queries over the **same FROM / JOIN / WHERE**:

```php
return
[
	'rows' => $hdb->raw_noencode('get_user_rows', $where_str),
	'count' => $hdb->raw_noencode('count_user_rows', $where_str),
];
```

The action passes this array to `crow_db_pager::create_with_query(...)` or `set_count_query()`.

#### The assembly flow (example)

```php
//  model — 意味と args
public static function build_search_where_fragments($i_filters_)
{
	//  allow-list → fragment name + args（非引用は (int) 等）
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

#### What not to do

- Hoard `@fragment` names and args assembly in a cross-cutting class.
- Hardcode long SQL strings inside PHP (put them in a `.sql`).
- Rely on automatic count generation alone for a list with JOINs.
- Re-sort rows in PHP after fetching them (`ORDER BY` is decided in the fragment or the routine query).
