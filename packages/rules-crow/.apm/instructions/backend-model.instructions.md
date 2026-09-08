---
description: "🧠 crow / backend — model / service / presenter / util (the Domain side)"
applyTo: "**/crow3_*/app/classes/**"
---

# 🧠 crow / backend — model / service / presenter / util (the Domain side)

> **When to read this: when writing or fixing PHP under `app/classes/_common_/`**
> (`model_<table>` / `model_<table>_<table>_service` / `model_<table>_presenter` / `common_presenter` / non-model utils).
> Do not open it if you are only touching an action.
>
> **The boundary is authoritative in [coding.md](backend-coding.instructions.md) §1.1** (it wins over this leaf on conflict).
> The action side is [action.md](backend-action.instructions.md); **if you are writing a routine query that uses a raw fragment, also open [query.md](backend-query.instructions.md) §3.9**;
> the common style is [common/coding.md](common-coding.instructions.md). **Never restate the common side or another leaf.**
>
> Section numbers run through the backend rules as a whole (`coding.md` §1 → `action.md` §2 → this leaf §3, §4).
>
> **Write comments in Japanese.**

---

## 3. The model (Domain)

### 3.1 Its role

**The hand-written part** of `model_<table>` is that table's Domain address.
Persistence (the ORM, generated members) lives alongside it through framework inheritance. That is fine.

> **Logic whose subject is that model (decisions, derivations, routine fetches) is defined
> as a method on `model_<table>`. Never write it on the `module_*` side.**

Why: put in a module, it scatters per feature, and the same decision and the same fetch get duplicated across several `action_*`.
Gathered onto the model, **there is exactly one place to read when you want to know that table's meaning**.

### 3.2 crow's generation and its extension points

- crow **auto-generates `model_<table>`** from `db_design.txt` (its location and format are in [backend/db.md](backend-db.instructions.md)).
  The generated output is a cache; never edit it by hand.
- The extension point is **`app/classes/_common_/model_<table>.php`**.
  crow injects the generated members right after the class declaration (right after the first `{`) and then loads it.
- With no file, the standard generated class stands as-is. **An extension can be added later.**

### 3.3 What goes in a model

| The nature of the logic | How to write it |
| --- | --- |
| A derived value or decision obtained from one row's state (e.g. `is_owned_by()`) | **an instance method** (a **static** to the same effect is fine if it only handles array rows) |
| Search conditions, aggregates, and routine queries whose **subject** is that table (JOINs allowed) | **a static method** (starting from `sql_select_all()`, or assembling a `raw` fragment) |
| A routine composition that appends related-table information onto the subject rows (attaching a skill list, and so on) | a **static** on the subject model (it never touches HTTP) |
| Pre-save completion of values, consistency checks, post-delete cleanup | **an extension hook** (§3.7) |

Display formatting (`display_name`, how an unset date is rendered, enum displays the app adds) does **not go in a model** (→ §3.11, the presenter).

### 3.4 Where routine queries go (including JOINs)

When writing a list, a candidate set, or a search with a count, put it on the model of **the subject table of the row set returned**.

| How to decide | Where it goes |
| --- | --- |
| What the pager's `rows` is a list of | that table's `model_*` |
| It references other tables via a JOIN or a subquery | the subject is still the above. The other tables are written as references |
| It merely references one other model (pulling the parent with `xxx_row()`, and so on) | it may close within the referencing model |

**The subject of a fetch (a query) is always a table.** Even with a JOIN, the subject of the returned row set is uniquely determined, so
**never let a routine query escape into a §3.12 service** (a service is the address for decisions and derivations, not fetches).

**Row order (the fetch order per the contract)**

- The row order of a list or a candidate set is authoritative in **SQL's `ORDER BY`** (the `sql_select_*` chain, or a [query.md](backend-query.instructions.md) §3.9 fragment).
- **Never re-sort in PHP after fetching** (`usort`, `array_multisort`, and so on — in an action, a model, a presenter, or a util alike).
- Never hold the same ordering twice, in SQL's `ORDER BY` and again on the PHP side.
- If an order is needed after composing several results, decide that order on the SQL / fetch-query side too.
- The FE may only reorder **in ways that do not change the contractual row order** (temporary UI grouping within one page, and the like). The FE never rebuilds the list's canonical order.

**What must not be done**

- Introduce a **cross-cutting query factory class** that gathers queries across tables and hoard routine fetches there.
- Conclude "there's a JOIN, so it can't go in a model" (if the subject is unique, it goes in the model).
- Re-sort query results in PHP (row order stays closed inside SQL).

**What stays in the action, fetch-wise**

- When to call which query, and whether to stop or return given the result.
- Calling several subject queries **in order** within one request (orchestration).
- The Tx boundary for updates.

### 3.5 Where row augmentation and display go

Processing that adds fields to a row after fetching, or fixes it up for display, is split by what it is.

| What it is | Where it goes |
| --- | --- |
| A **business derived value or decision** obtainable from one table (the subject row) | that `model_*` |
| **A business decision or derivation that cannot be settled without looking at several tables' state at once** | `model_<table>_<table>_service` (§3.12) |
| **Shared display formatting** obtainable from one table (going on the contract) | `model_*_presenter` (§3.11) |
| **Generic display formatting**, table-independent | `common_presenter` (§3.11) |
| Routinely appending related-table data onto the subject rows | a static on the subject `model_*` (or an action calling several models in order) |
| A heading, wording, summary, or presentation for one screen only | **the FE** feature / scene (never let it accumulate in the action) |
| **Non-display** shared processing, table-independent (filter hygiene and the like) | **a non-model util** (§4) |

Never "add everything to a giant formatting class". When unsure, split with the table above.

### 3.6 How to write an extension file

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

- The class name is **`model_<table name>`**, inheriting **`crow_db_table_model`**.
- **Never write `__construct()`.** When initialization is needed, use **`construct()`**
  (called from the generated constructor).
- **Never redefine a generated member.** Fields, `m_table_name` / `table_name` / `primary_key`,
  `sql_select_all()` / `sql_select_one()`, the constant-related `get_<field>_keys()` / `_map()` / `_symbols()` /
  `get_<field>_str()` / `<field>_str()`, and referenced tables' `<refer>_row()` are injected by crow.
  **Grow a routine query under a different name rather than overriding `sql_select_all()`.**

### 3.7 Save and validation hooks

Processing tied to a save or a delete does not get sandwiched around it in the action — it goes into **the model's extension hooks**.
crow calls them from `check_and_save()` and the like, so they take effect no matter which route did the saving.

| Hook | Use |
| --- | --- |
| `validation_crow_ext()` | additional validation. On failure, `push_validation_error()` |
| `save_crow_ext()` | extending the save. On failure, stack the error and **return `false`** |
| `trash_crow_ext()` | extending the logical delete. Same on failure |
| `delete_crow_ext()` | extending the physical delete. Same on failure |

`save_ext()` / `validation_ext()` / `trash_ext()` (the names without `_crow_`) are
for crow's internal use. **Never define them on the app side.**

### 3.8 What must not be brought into a model

- **Every system responsibility from [coding.md](backend-coding.instructions.md) §1.1** (I/O, **termination**, Tx boundaries, obtaining `$hdb`, auth, the session, `crow_log::error()`).
  This is not "a principle" but **absolute**. Return abnormalities via a return value, `push_validation_error()`, or `get_last_error()`, and leave the decision to stop to the action.
- **Display methods** (`display_name` and display derivations the app adds → §3.11, the presenter)
- **Screen-specific concerns** (presentation, on-screen ordering → the FE. Assembling the contract response is the action's)
- **Table-independent shared filter hygiene** (§4 — never duplicate it into each model)
- **Re-sorting a list in PHP** (row order belongs to SQL — §3.4)

> Because hand-written methods are independent of I/O, they are targets for PHPUnit unit tests.
> Generated members are not tested (the carving is in [backend/testing.md](backend-testing.instructions.md)).
> A presenter's hand-written methods are likewise unit-test targets (§3.11).

### 3.9 raw SQL and fragments

**This section has been carved out into [query.md](backend-query.instructions.md).**
If you are building a JOIN, composite filters, or a paginated list with a `.sql` fragment, open that.

---

### 3.10 The SQL builder chain (the `sql_select_all()` family)

For a simple single-table fetch with simple conditions, use the **`sql_select_all()` chain**.
Complex searches go to the raw fragments in [query.md](backend-query.instructions.md) §3.9.

| Situation | Means |
| --- | --- |
| One table, roughly a simple `and_where` | the `model_*::sql_select_*()` chain (called from an aliased static) |
| A JOIN, composite filters, a paginated list | raw fragments, [query.md](backend-query.instructions.md) §3.9 |

**Generated members**

- `sql_select_all()` / `sql_select_one()` are **never overridden** (§3.6).
- Grow routine conditions as **an aliased static such as `sql_select_active()`**.

**Notation**

- Line breaks in a chain and the **semicolon on its own line** follow [common/coding.md](common-coding.instructions.md) (not restated on the backend side).

```php
public static function sql_select_active()
{
	return self::sql_select_all()
		->and_where("deleted", 0)
		;
}
```

### 3.11 The presenter (shared display values)

**Shared display values** that go on the contract payload live in a presenter, not a model.
Screen-specific presentation is the FE's ([frontend/viewpart-components.md](frontend-viewpart-components.instructions.md) §9).

#### The test — display values that go on a presenter

Something satisfying **all** of the following:

1. It is stable as the meaning of a table (or of a table-crossing common shape)
2. **The same wording or shape is needed on 2+ screens, or on a channel other than a screen (email, and so on)**
3. It goes on the contract payload as a field (the FE presents it without re-deriving it)

What does not satisfy these (that screen's heading, a layout label, a class name) → the FE.

#### `model_<table>_presenter`

| Item | Content |
| --- | --- |
| **Address** | `app/classes/_common_/model_<table>_presenter.php` (the class has the same name) |
| **Input** | a `model_*` row of the subject, or an array row to the same effect. It touches no HTTP, no `$hdb`, no auth |
| **Output** | display scalars or small arrays (the material for contract fields) |
| **Caller** | the action, when assembling the contract response. It may use `common_presenter` internally if needed |
| **What stays out** | business decisions, SQL, Tx, screen-specific layout, re-sorting a list |

A presenter reading from a model (referencing row fields) is fine. **Never call a presenter from a model / service / util.**

Generated APIs (`get_<field>_str()` / `<field>_str()` and the like) stay on the model as crow's generated output.
**Display derivations the app adds** go to the presenter (never duplicate a generated member into a presenter).

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

| Item | Content |
| --- | --- |
| **Address** | `app/classes/_common_/common_presenter.php` |
| **Responsibility** | the single point for display formatting that belongs to no table (how an unset date is rendered, null-safe display conversion, a common **display-side** helper for looking up an enum map, and so on) |
| **What stays out** | assembling a specific table's display name (→ `model_*_presenter`), filter hygiene and Domain decisions (→ §4 util / the model), a query factory |

[coding.md](backend-coding.instructions.md) §1's "never introduce a giant cross-cutting class" stands as a prohibition on **gathering queries or Domain logic**.
`common_presenter` is limited to **a thin, display-only shared surface**.

Common display shapes for dates and enums → `common_presenter`.
**Non-display** matters such as the hygiene of filter values → §4 util.
A raw map lookup used by both stays in the model's generated API or in a util; only the display wrapper goes to the presenter.

### 3.12 Domain services (business logic spanning several tables)

**Business logic that cannot take a single table as its subject is never written in an action.**
Create **a class that gathers that logic (a `model_*_service` named by concatenating the tables it spans)** and close it there.
This is an extension of §3's Domain, and the only escape hatch that keeps business from leaking into the action (system responsibility).

#### The test — when to create a service

Create a service when **all** of the following hold (if even one is missing, do not).

1. It is a business decision or derivation that **cannot be concluded without looking at 2+ `model_*` (tables) at once**
2. **Neither can be declared the subject** (if one can, it is a static on the subject model — §3.3 / §3.4)
3. **It is a business rule** (not a system procedure; the procedure — call order, Tx, termination — is the action's)

Examples of when not to create one:

| What it looks like | Its actual address |
| --- | --- |
| A list or count that pulls other tables via a JOIN | the subject `model_*` (the subject of a fetch is always unique — §3.4) |
| Merely referencing one other table to decide (pulling the parent with `xxx_row()` and looking at it) | the referencing `model_*` |
| Merely "calling several models in order" | `action_*` (orchestration — [action.md](backend-action.instructions.md) §2.1) |
| Assembling display wording | the presenter (§3.11) |
| Table-independent, non-display pure processing (filter hygiene, and so on) | a util (§4) |

#### Address and shape

| Item | Content |
| --- | --- |
| **Address** | `app/classes/_common_/model_<table>_<table>_service.php` (the class has the same name) |
| **Naming** | **Concatenate the names of the tables it spans in snake_case and append `_service`.** `model_` + table name + … + `_service` (e.g. `model_project_progress_service`). **Never use a business-concept name or a coinage** (a name like `model_assignment_service` is not allowed — the file name would no longer tell you which tables it binds) |
| **Order of table names** | **Alphabetical** (a mechanical rule preventing two differently-named services for the same combination). Never reorder them for readability or to express primacy. Because the order is determined by the name alone, **you can look up whether one already exists by name before creating it** |
| **Inheritance** | **None** (it does not inherit `crow_db_table_model`. A plain class with no table — the same shape as `model_*_presenter`) |
| **Input** | `model_*` rows, array rows, scalars. If it needs `$hdb`, **receive it as an argument** ([query.md](backend-query.instructions.md) §3.9) |
| **Output** | the decision result (bool), a derived value, error wording, values to save. **It speaks only through return values** |
| **Methods** | static pure functions as a rule. Never give it state |
| **What stays out** | **every system responsibility from [coding.md](backend-coding.instructions.md) §1.1** (termination, Tx boundaries, `crow::get_hdb()`, `crow_request`, `crow_auth`, `crow_log::error()`), display formatting (→ the presenter), the routine query itself (→ the subject model) |

**One class = one combination of tables.** Since the name expresses the set of tables:

- **If a service for the same combination already exists, do not create one — add the method there** (if `model_progress_project_service` exists, every progress × project decision goes there).
- A different combination of tables means a different class (`model_progress_project_service` and `model_project_user_service` are separate things).
- **When an existing method starts looking at another table, move that method to the correctly named class**
  (when `model_progress_project_service::can_edit()` starts looking at the user table too, move it to
  `model_progress_project_user_service`). Since the name expresses the set of tables, this is the only consistent handling.
  **Never grow the tables while leaving it in the original class** — the moment the name diverges from the content, the rule for deciding where things go stops working entirely.
  And never push the decision back into the action because moving it is tedious.
- **When 4 or more table names string together, doubt that it is really one decision.** Usually two or more decisions are mixed in, or
  the subject is really one table (→ `model_*`). Never escape into a business-concept name to shorten it — **split it and rethink**.

The call direction is **action → service → model** (reading).
**Never call a service from a model / presenter / util** (avoiding cycles and code where the subject is unclear).

#### Example

A decision spanning `project` × `assign` × `user` (alphabetically: assign → project → user):

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

#### What not to do

- **Stand a class up under a business-concept name or a coinage** (`model_assignment_service`, `model_billing_service`, and so on). The name must be **the concatenation of the tables it spans**
- **Turn a service into "a cross-cutting class that takes anything"** ([coding.md](backend-coding.instructions.md) §1). Never gather decisions over different table combinations into the same class
- Promote a single-table decision into a service (the subject model thins out and the meaning scatters)
- Bring routine queries, SQL, Tx, or termination into a service
- **Settle for hardcoding a multi-table decision into the action** (the reason this section exists; this is the biggest deviation)

> A service's hand-written methods are also **PHPUnit unit-test targets** ([backend/testing.md](backend-testing.instructions.md)).
> As long as [coding.md](backend-coding.instructions.md) §1.1 is observed, they can be tested just by passing row objects or arrays.

---

## 4. Non-model utils (shared, non-display, belonging to no table)

Only processing that **belongs to no `model_<table>`'s Domain** and that **is not display**
goes into a non-model class under `app/classes/_common_/`.

| May go here | Stays out (and where it goes) |
| --- | --- |
| Hygiene of filter values shared across searches over several types or tables (forcing types, deciding the unspecified sentinel, normalizing for a keyword LIKE, and so on) | The routine query itself, whose subject is a specific table (→ the subject model) |
| Table-independent acceptance / parsing, where it is non-display | **Decisions and derivations that are business rules** (a model for one table, a §3.12 service for several). A util does not know the business |
| | **Generic display formatting**, table-independent (→ `common_presenter`) |
| Services not tied to a table, such as the sending side of email assembly or an external API client (the material for display wording comes from the presenter) | Shared display values obtainable from one table (→ `model_*_presenter`) |
| | Screen-specific presentation and on-screen ordering (→ the FE). Assembling the contract response (→ the action) |

**Keep a single decision point.** Never copy the shared hygiene above into each model
(duplicated, behavior diverges per route and search breaks all at once).

The model side holds "its own table's permitted keys, fragment names, and the meaning of the WHERE",
and delegates to the util only when shared hygiene is needed.

Do not force something into one of the models. Conversely, do not let a fetch with a unique subject escape into a util.
Do not put display formatting into a util (§3.11).

---
