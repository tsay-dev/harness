---
description: "🚦 crow / backend — the action (use case)"
applyTo: "**/crow3_*/**/module_*.php"
---

# 🚦 crow / backend — the action (use case)

> **When to read this: when writing or fixing `action_*` / `preload()` in a `module_*`.**
> Do not open it if you are only touching other addresses.
>
> **The boundary is authoritative in [coding.md](backend-coding.instructions.md) §1.1** (it wins over this leaf on conflict).
> How to write the Domain side is [model.md](backend-model.instructions.md); raw SQL fragments are [query.md](backend-query.instructions.md);
> the common style is [common/coding.md](common-coding.instructions.md). **Never restate the common side or another leaf.**
>
> Section numbers run through the backend rules as a whole (`coding.md` §1 → this leaf §2 → `model.md` §3, §4).
>
> **Write comments in Japanese.**

---

## 2. The action (use case)

### 2.1 Its role

An `action_*` in a `module_*` holds only **the procedure for one request**.
The role corresponds to Clean Architecture's Use Case / Interactor and DDD's Application Service, but
**no Interactor layer is introduced into crow**. Domain's address remains `model_*`.

**An action writes only "state the input → delegate → state the output".**
An action is a use-case orchestrator, **not a workshop**.

Reading an `action_*` top to bottom, the following three must be visible from **the action body's local variables and the `exit_*` calls directly visible in the body**.

1. **What it took as input** — the `$i_*` from the request, plus values the server adds such as auth
2. **What it outputs** — the contractual keys and shapes passed to the body's `exit_ok` / `exit_ng`
3. **What it did in between** — business goes to `model_*` or the routine query; display goes to the presenter. The action itself holds neither the substance of a decision nor display formatting

The skeleton (the mandatory reading order):

1. **Open the input** — write `crow_request::*` directly at the top of the action and line up the `$i_*` you use
2. **Gate acceptance** — ask `model_*` (or a [model.md](backend-model.instructions.md) §4 util if table-independent) for validation and permissions, and **on NG call `exit_ng` in the action body**
3. **Ask for the fetch or update** — the subject `model_*`'s routine query or save. With several, the action holds only the ordering and the Tx
4. **Ask for display values** — shared display values that go on the contract come from `model_*_presenter` / `common_presenter` ([model.md](backend-model.instructions.md) §3.11)
5. **Close the output** — line the contractual keys up on the spot in the body's `exit_ok`

The delegation in one sentence:

> All an action may keep is **choosing whom to call and in what order, and deciding from the result whether to stop or return.**
> "How to decide", "how to order", and "how to turn it into a display string" are each asked of `model_*`, SQL, and the presenter.

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

### 2.2 What goes in an action

| Goes in | Stays out |
| --- | --- |
| Reading the request (written directly at the top) and the response | A decision or derived value obtainable from one row / one table (→ the model) |
| **Every system responsibility from [coding.md](backend-coding.instructions.md) §1.1** (termination, Tx boundaries, obtaining `$hdb`, auth, fatal logging) | **A business decision or derivation spanning several tables** (→ a [model.md](backend-model.instructions.md) §3.12 service) |
| **Flow control** for auth and permission checks (stopping or continuing in the body given the result) | Assembling routine queries for lists and candidate sets (→ the subject model) |
| The update order across models, and transactions | Pre-save completion, consistency, and post-delete cleanup (→ model hooks) |
| Assembling **the contract response** (the keys of `exit_ok` stated explicitly) | Deriving shared display values (→ the presenter). Screen-specific presentation and ordering (→ the FE) |
| Lining up calls to several models / presenters **in order, as one request** | Table-independent shared pure processing (→ a [model.md](backend-model.instructions.md) §4 util) |
| | A thin bundling helper that merely hides `crow_request`; a decorative helper that only copies things through |

### 2.3 The model decides; the action handles the result

**A decision itself — "is this the owner?" — is Domain (model / service).**
The action **takes that bool or result** and decides in its body whether to `exit_ng`.
This is the concrete form of [coding.md](backend-coding.instructions.md) §1.1's absolute rule 1 — **the Domain returns a truth value; it does not stop.**

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

Only when several actions want to share the same "look at the result and stop" shape may you
collect it into a thin helper inside the module.
The helper **returns only the decision result (a bool, a message, and so on)**, and **`exit_*` stays in the action body**
(so the exits are traceable from the body). Never hardcode decision logic into a helper or an action.

Never put `crow_request` / `app::exit_*` / auth into a model
(it kills unit testing and reuse).

### 2.4 Naming

An `action_*` takes the form **`action_<verb>_<resource>`**.

| Verb | Example use |
| --- | --- |
| `get` | fetching a list, a single row, a count |
| `create` | creating something new |
| `update` | updating (a partial update uses the same verb) |
| `delete` | deleting |

Examples: `action_get_progress_rows` / `action_update_progress` / `action_create_project` / `action_delete_progress`

### 2.5 How to receive the request

Follow the **`i_` prefix** from [common/coding.md](common-coding.instructions.md).
Always prefix a variable derived from a request parameter with `i_`.

| How to read it | When to use it |
| --- | --- |
| `crow_request::get_int($key, $default)` | numbers such as IDs and `page_no`. State the default explicitly |
| `crow_request::get($key, $default)` | a `filters` array, a string, a structure |

```php
$i_page_no = crow_request::get_int('page_no', 1);
$i_filters = crow_request::get('filters', []);
$i_progress_id = crow_request::get_int('progress_id', 0);
```

- Reading the input is **written directly at the top of the action**.
- **Do not place a thin bundling helper that merely hides `crow_request`** (e.g. a `*_list_request()` that only groups the gets).
- Never **re-read** a key you already read from `crow_request` somewhere else (use only the `$i_*` from the top).
- If validation needs an array, assemble it on the spot inside the action and pass it to validate, or pass individual arguments to validate.
- A meaningful validate / parse (arguments → an accepted value or an error message) may remain.
  If it is the table's meaning, `model_*`; if table-independent, a [model.md](backend-model.instructions.md) §4 util. **Reading the request itself stays in the action.**

### 2.6 How to return the response

**Ajax / API actions** basically **terminate with `app::exit_ok` / `app::exit_ng`** on both success and failure.

| Result | How to return it |
| --- | --- |
| Success (with data) | `app::exit_ok($payload)` |
| Success (no data) | `app::exit_ok()` |
| Failure | `app::exit_ng($message)` |

**Actions for screen transitions** may also use `return` or a redirect.
Mixing them across purposes is fine, but **never mix exit_* and return within one action**
(so a reader can trace that action's exits).

- Write nothing after `exit_ok` / `exit_ng` (unreachable).
- Do not make exceptions the main path of an action (crow's convention centers on exit_*).
- **State and line up the contract fields on the spot in the `exit_ok` payload.**
  Never return by dumping a giant shared `to_rows` result in a way that hides the contractual keys.
  Shared display values are put onto contractual keys from the presenter's output ([model.md](backend-model.instructions.md) §3.11).

### 2.7 Layering error messages

User-facing wording **splits its role between the model and the action**.

| Kind | Where it goes | How the action uses it |
| --- | --- | --- |
| Derived from a business rule (conflicts, invalid state, the reason a save failed) | **the model** (`build_*_message()` or a row's `get_last_error()`) | `app::exit_ng($row->get_last_error())` and the like — **just receive it from the model and pass it on** |
| A generic boilerplate for a failed fetch ("the target was not found") | a short boilerplate may live in the action | a row that cannot be fetched, an ID of 0 — **failures visible at the action's entrance** |
| Permission / out-of-scope | unify the wording in either the action or the model's message builder | the model decides, the action stops (§2.3) |

**What not to do**

- Hardcode a business message into the action and end up maintaining the same meaning twice, in the model and here.
- Invent different wording in the action when the model is already returning `get_last_error()`.

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

### 2.8 Transactions

Open a Tx **only when several models are saved or updated within one request**.
A single model's `check_and_save()` alone needs **no begin**.

| Operation | Where it goes |
| --- | --- |
| `$hdb->begin()` / `commit()` / `rollback()` | **the action only** (a system responsibility, [coding.md](backend-coding.instructions.md) §1.1) |
| Deciding success across several side effects (`can_commit_*`) | **the Domain** (a pure function; it touches no DB). If the subject is one table, `model_*`; **if no subject can be determined, `model_<table>_<table>_service` ([model.md](backend-model.instructions.md) §3.12)** |
| The save itself and its hooks | the model (never open a Tx inside a hook) |

**The flow**

1. Entrance gates (fetch, permissions) may come **before begin**.
2. If several saves are needed, `$hdb = crow::get_hdb();` → `$hdb->begin();`
3. Save each model. On failure: **`rollback()` → cleanup → `exit_ng`**
4. With several side effects, decide before commit whether all succeeded via **`model_*::can_commit_*()`**
5. On NG, `rollback()` → cleanup → `exit_ng`
6. On OK, `$hdb->commit();` → `exit_ok`

**rollback (mandatory)**

After `begin()`, **always `rollback()`** before an `exit_ng`.
Cleanup outside the Tx (releasing a device, and so on) also happens **in the action**.

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

**The role of `can_commit_*`**

- A pure decision that **cross-checks several save / side-effect results (success, zero rows, false) in one place**.
- It lives in the model so that if-chains are not scattered through the action and **no intermediate state (only one side succeeded) is created**.
- The decision logic itself ("is zero rows a success?") is also the model's.

**What not to do**

- Call `begin` / `commit` / `rollback` inside a model hook.
- `exit_ng` after `begin` without rolling back.
- Call `begin` out of habit every time when there is only a single save.

### 2.9 Auth and permission gates

#### Login required (the module entrance)

**Whether the user is logged in** is confirmed in the `module_*` base's **`preload()`**.
Do not repeat `crow_auth::is_logined()` in each `action_*`.

| Situation | How to return |
| --- | --- |
| Not logged in + a normal request | `redirect` to the login screen (`preload` returns `false`) |
| Not logged in + Ajax | `app::exit_unauthorized()` and the like (401 + JSON) |

`preload()` is **the entrance gate for the whole module** (session extension, array-input guards, and the like may live here too).
**The assignment scope for an individual resource** ("may this row be touched?") is decided by the action + the model (below).

#### Assignment scope and permissions (per resource)

| Layer | Responsibility |
| --- | --- |
| **model** | the **meaning** of the scope (`is_in_assigned_scope($row, $user_id)` and the like) |
| **action** | **stopping** based on the model's result (`exit_ng`) |
| **module base** | a **thin wrapper** calling the model (`$this->is_*`) is fine. Never write decision logic here |

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

#### Error messages

Unify the wording for a permission NG **in either the action or the model's `build_*_message()`**
(e.g. "担当外のため操作できません。").
Do not invent different wording per action.

#### What not to do

- `exit_ng` / `redirect` inside a model.
- Copy-paste the login check into each action (duplicating it when `preload` exists).
- Hardcode the scope decision into the action (the meaning goes to the model).

### 2.10 Logging (warning / error)

Depending on crow's error-handler configuration, **`crow_log::error` can exit the request**.
Split by log level and location, and do not let the domain layer fire fatal logs freely.

| Level | Use | Where it goes |
| --- | --- | --- |
| **warning** | business divergence, unexpected input, a recoverable abnormality (an enum divergence, a row of an unexpected type) | **model / service / presenter / util** (the only record the Domain may emit) |
| **error** | cannot continue, a misconfiguration, a fatal that should never happen | **the action's entrance / preload only.** **Never call it** from the Domain (model / service / presenter / util) — `crow_log::error()` can exit, so it violates [coding.md](backend-coding.instructions.md) §1.1's absolute rule 1 |

**Enum divergence, a DB value absent from a map**

- Fall back to a default on the presenter side for display, while **recording the divergence with `crow_log::warning()`** (in exactly one of model / util / presenter).
- **Never warn about the same divergence repeatedly within one request** (record it once).

**What not to do**

- Call `crow_log::error()` from the Domain (model / service / presenter / util) (an exit risk — [coding.md](backend-coding.instructions.md) §1.1).
- Swallow it (returning a default with no log at all) — record a divergence as a warning.
- Have the action log the fine details of the success path (it becomes noise).

---
