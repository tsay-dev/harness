---
description: "⚙️ crow / backend — the boundary of responsibilities (the server-side core)"
applyTo: "**/crow3_*/app/classes/**,**/crow3_*/app/assets/query/**,**/crow3_*/**/module_*.php"
---

# ⚙️ crow / backend — the boundary of responsibilities (the server-side core)

> **When to read this: always first, when writing or fixing crow's server-side PHP (action / model / service / presenter / util / SQL).**
> This leaf holds only **the invariants that bind whichever address you touch**. For how to write at a given address, open only the leaves you need from the index in §1.2.
>
> **The common style is [common/coding.md](common-coding.instructions.md)** (the indentation table, Allman, snake_case,
> the `i_` prefix, the ban on `===` / `!`, `//<TAB>` comments, 80 columns, the PHP closing tag, the trailing newline).
> This document defines, **on top of following that**, only the delta that binds the server side.
> It never restates the common side. Follow common for notation, and do not copy things over here to fill a rule that is absent.
>
> What follows defines not notation but **"where server-side logic goes"**.
> Even implementing from scratch, write so that it falls naturally into these divisions.
>
> **Write comments in Japanese.**

---

## 1. Overview

Do not reproduce a strict 4-layer architecture on top of crow. What you do is **be rigorous about where action / model / presenter / non-model utils go**.

| The usual layer name | What it actually is in crow | In a phrase |
| --- | --- | --- |
| Presentation (screens) | view / viewpart / frontend JS | screen-specific presentation |
| Presentation (shared display values) | `model_*_presenter` / `common_presenter` | display derivations that go on the contract |
| Application (use cases) | `action_*` in `module_*` | open the input, ask, close the output |
| Domain (one table as the subject) | **hand-written** methods and hooks on `model_<table>` | that table's meaning, decisions, and routine fetches |
| Domain (spanning several tables) | `model_<table>_<table>_service` | business decisions and derivations no single table can be the subject of ([model.md](backend-model.instructions.md) §3.12) |
| Infrastructure | the crow ORM / generated members / `raw` SQL / external APIs | **may live alongside** the model's inheriting side |
| (shared, non-display, belonging to no table) | non-model utils under `app/classes/_common_/` | filter hygiene and the like |

**The core (mandatory)**

1. **A table's meaning, decisions, and routine queries (including a fetch that is the subject of a list) → `model_*`**
   **A business decision or derivation spanning several tables with no determinable subject → `model_<table>_<table>_service` ([model.md](backend-model.instructions.md) §3.12)**
2. **Receiving the request, deciding how to respond given the result, the update order across models, and Tx → `action_*`**
   (**an action opens the input, asks the model / presenter, and closes the output.** Details in [action.md](backend-action.instructions.md) §2.1)
3. **Shared pure processing (non-display) that belongs to no table's Domain → a non-model util ([model.md](backend-model.instructions.md) §4)**
4. **Assembling the contract response → the action. Deriving shared display values → the presenter ([model.md](backend-model.instructions.md) §3.11). Screen-specific presentation and on-screen ordering → the frontend (feature / scene)**
   (never put display-only or screen-only concerns in a model. The FE side is authoritative in [frontend/viewpart-components.md](frontend-viewpart-components.instructions.md) §9)
5. **The row order of a list or a candidate set (the fetch order per the contract) → SQL's `ORDER BY` (in the routine query or the fragment). Never re-sort in PHP after fetching.**
   The FE may only reorder in ways that do not change the contractual row order ([model.md](backend-model.instructions.md) §3.4)

Notes:

- Do not create a separate Domain directory.
- A model housing Domain and persistence together is not a compromise — it is **Domain's legitimate address in crow**.
- Do not try to separate Domain from Infrastructure outside the model.
- **Never introduce a giant cross-cutting class for assembling queries.**
  `common_presenter` is limited to **a thin, display-only shared surface** ([model.md](backend-model.instructions.md) §3.11). When unsure where something goes, allocate it with the decision tables in [model.md](backend-model.instructions.md) §3 / §3.11 / §3.12 / §4.
  What is forbidden here is **a catch-all query factory or a cross-cutting junk drawer** — a
  **domain service named for a business concept and narrowed to one concern ([model.md](backend-model.instructions.md) §3.12) is not forbidden**.

The shape of the flow:

```
action:     open the input → ask the model / service / presenter → close the output per the contract
model:      the subject table's meaning, decisions, routine queries, and save hooks
service:    business decisions and derivations spanning several tables with no determinable subject (Domain)
presenter:  shared display values that go on the contract (per table / in a table-independent common shape)
util:       only shared pure processing (non-display) that belongs to no table
FE:         receives the contract payload and assembles the screen-specific presentation and ordering
```

### 1.1 The boundary between system responsibility and business responsibility (the highest-priority invariant across all backend leaves)

**This section takes precedence over every backend leaf and every section.** If a reading conflicts with the below, this section wins.

| | System responsibility | Business (Domain) responsibility |
| --- | --- | --- |
| **Address** | `action_*` (and `preload()` in `module_*`) | `model_<table>` / `model_<table>_<table>_service` |
| **What it owns** | input, output, **termination**, Tx boundaries, the DB handle, auth, the session, fatal logging | the meaning, decisions, derivations, and consistency of a table or business concept, and the wording of business messages |
| **What it may know** | "who to ask, how, and how to respond given the result" | **only its own business.** It does not know what the request is, how it returns, or when it ends |

> **When this section says "the Domain side"**, it means **every file called from an action** —
> `model_*` / `model_*_service` / `model_*_presenter` / non-model utils (addresses and style in [model.md](backend-model.instructions.md) §3, §4).
> Presenters and utils are not Domain as a layer, but **they equally hold no system responsibility**, so
> all four are bound by the prohibitions below with the same force.

**Symbols of system responsibility (never write a single one of them in a Domain-side file)**

| Kind | Symbol |
| --- | --- |
| I/O | `crow_request::*` / `crow_response::*` |
| **Terminating the program** | `app::exit_ok()` / `app::exit_ng()` / `app::exit_*()` / `exit` / `die` / `header()` / redirect |
| Transaction boundaries | `$hdb->begin()` / `commit()` / `rollback()` |
| Obtaining the DB handle | `crow::get_hdb()` (**receive it as an argument** where needed — [query.md](backend-query.instructions.md) §3.9) |
| Auth and flow control | `crow_auth::*` |
| Session, cookies, superglobals | `$_GET` / `$_POST` / `$_SESSION`, and so on |
| Fatal logging | `crow_log::error()` (depending on crow's configuration it **exits the request** — the same as terminating. [action.md](backend-action.instructions.md) §2.10) |

**Two absolute rules**

> **1. The Domain never ends the program.**
> Never write **a single** call that could terminate the request inside `model_*` / `model_*_service` / `model_*_presenter` / a util.
> Return an abnormality to the caller as **a return value (`false` / `''` / an error array)** or via **`push_validation_error()` / `get_last_error()`**,
> and **let the action decide whether to stop or continue** ([action.md](backend-action.instructions.md) §2.3).
>
> **2. The Domain does not know the system's business.**
> A symbol from the table above appearing on the Domain side is not "an optimization permitted as an exception" — it is **a design error**.

**Why they are absolute** (make one exception and it all breaks)

1. When the Domain exits, **the unit test dies with the process and cannot be written** (the Red targets in [backend/testing.md](backend-testing.instructions.md) are hand-written Domain).
2. The same decision **cannot be reused from another route** (another action, a batch, a CLI).
3. **Termination mid-Tx leaves intermediate state behind** (a rollback can only be written in the action — [action.md](backend-action.instructions.md) §2.8).

**The only record the Domain may emit is `crow_log::warning()`** (which does not terminate). Follow [action.md](backend-action.instructions.md) §2.10.

The self-check grep is §6.

---

### 1.2 Leaf index (the address you write → the leaf you open)

The backend rules **are split per address**. Always read this leaf (the core of the boundary), and **on top of that open only the leaf for the address you write**.

| Address you write / fix | Leaf to open | Content |
| --- | --- | --- |
| `action_*` and `preload()` in `module_*.php` | [action.md](backend-action.instructions.md) | §2. The skeleton of a use case, request/response, Tx, the auth gate, logging |
| PHP under `app/classes/_common_/`<br/>(`model_*` / `model_*_*_service` / `model_*_presenter` / non-model utils) | [model.md](backend-model.instructions.md) | §3, §4. Domain addresses, extension hooks, presenters, domain services, utils |
| `.sql` under `app/assets/query/**` (and the model methods that assemble it) | [query.md](backend-query.instructions.md) | §3.9. Raw fragments, the allow-list, paginated lists |
| `db_design.txt` | [db.md](backend-db.instructions.md) | The format and location of the DB design |
| Test code | [testing.md](backend-testing.instructions.md) | PHPUnit; what is and is not a Red target |

- **If one slice has you writing both an action and a model, open both leaves.** Do not open leaves for addresses you do not touch.
- **Section numbers run through the backend rules as a whole** (this leaf §1 → `action.md` §2 → `model.md` §3, §4 / `query.md` §3.9 → this leaf §5, §6, §7).
  Do not renumber after a split — that would break references from other leaves and other rules.
- When unsure, return to the decision table in §1 and the boundary in §1.1. **Never write on instinct without opening a leaf.**

---

## 5. When you touch existing code

- If an `action_*` has a decision or routine query with a single determinable subject hardcoded into it,
  move it to the subject model, **only within the implementation scope of that feature**.
- If an `action_*` has a **business decision spanning several tables** hardcoded into it,
  move it to a service per [model.md](backend-model.instructions.md) §3.12, **only within the implementation scope of that feature** (creating one is fine).
- If `exit_*` / Tx / `crow_request` / `crow::get_hdb()` are mixed into the Domain (model / service / presenter / util),
  fix them into the §1.1 shape (the Domain returns a value; the action stops), **only within the scope of the feature you touch**.
  **This does not license "matching the existing code"** — never follow that shape in code you write anew.
- If display formatting has accumulated in a model or a module,
  move it to a presenter by the [model.md](backend-model.instructions.md) §3.11 decision, **only within the scope of the feature you touch**.
- If you find routine fetches or row formatting accumulated in a cross-cutting class,
  allocate them with the decision tables in [model.md](backend-model.instructions.md) §3 / §3.11 / §4, **only within the scope of the feature you touch** (do not dismantle it wholesale).
- **Never do a bulk rewrite.**
- If domain logic lands on a table with no extension yet, grow
  `app/classes/_common_/model_<table>.php` within that scope.

---

## 6. Self-checking responsibilities (always, after writing server-side code, before returning)

**Do not rely on §1.1 by eye alone.** When you have finished writing, run the following.

```bash
#	Domain 側（model / service / presenter / util）にシステム責務が漏れていないか
#	→ ヒット 0 が正
grep -rnE "crow_request|crow_response|app::exit_|crow_auth::|crow::get_hdb|crow_log::error|->begin\(|->commit\(|->rollback\(|\bdie\b|\bexit\b|\bheader\(|\\\$_(GET|POST|SESSION|COOKIE)" \
	app/classes/_common_/
```

**If it hits, judge against §1.1.**
If it is a line you wrote this round, **fix it before returning**. If it is an existing line, follow §5 (fix only within the scope of the feature you touch),
and **leave what you did not fix out of scope in your report** (never let it pass silently).
An incidental match inside a comment or a string literal may be passed over once confirmed as such —
**but never settle for "it's probably a comment": always open the line and check.**

Then read and confirm what grep cannot catch.

- [ ] Reading `action_*` top to bottom, is it only the 3 stages of **input → delegation → output** ([action.md](backend-action.instructions.md) §2.1)?
- [ ] Does any **business conditional** remain inside `action_*` (a business rule or a state-transition decision built from `&&` / `||`)?
      Move it to a model for one table, or to a **[model.md](backend-model.instructions.md) §3.12 service for several tables**
- [ ] Does the Domain **return abnormalities as return values**, leaving the decision to stop to the action (§1.1 absolute rule 1)?
- [ ] On every route that called `begin()`, is there a `rollback()` before `exit_ng` ([action.md](backend-action.instructions.md) §2.8)?
- [ ] Is a newly created service named as **the concatenation of the table names it spans (alphabetical) + `_service`**?
      Is it named for a business concept instead? **Did you miss an existing service for the same combination and create a duplicate?**
      (check with `ls app/classes/_common_/model_*_service.php`).
      If an existing method grew to look at more tables, did the class name follow ([model.md](backend-model.instructions.md) §3.12)?
- [ ] Can a method you wrote in the Domain **be unit-tested just by passing a row object or an array**?
      (if not, the system's business is still mixed in)

---

## 7. What goes here (how this grows)

When a rule emerges that binds only the server side, add it to **the leaf for the address that rule binds** (the same split as the §1.2 index).

| What you want to add | Where it goes | `applyTo` (the load trigger) |
| --- | --- | --- |
| An invariant spanning addresses, a layer boundary, a self-check | this leaf, `coding.md` | every server-side address |
| How to write an action | [action.md](backend-action.instructions.md) | `module_*.php` |
| How to write a model / service / presenter / util | [model.md](backend-model.instructions.md) | `app/classes/**` |
| How to write a `.sql` fragment | [query.md](backend-query.instructions.md) | `app/assets/query/**` |

- **Do not let this leaf grow fat.** Fat here means it is loaded at every address. Address-specific matters always go to that address's leaf.
- **Always narrow `applyTo` when adding a leaf** (if you cannot pin an address, it is not an address-specific rule — first decide whether it is an invariant that belongs in this leaf, or belongs in [common/coding.md](common-coding.instructions.md) altogether).
- **The boundary of responsibilities is authoritative in §1.1**, and other leaves reference it (never transcribe the prohibitions into each leaf).
- **Keep the section numbers running** (§1.2). They are referenced across leaves, so do not renumber.
- **The moment something also binds the frontend, promote it out of backend into [common/coding.md](common-coding.instructions.md).**
