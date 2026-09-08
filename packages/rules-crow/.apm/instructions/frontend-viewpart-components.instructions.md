---
description: "🧱 crow / frontend — component granularity and reuse"
applyTo: "**/crow3_*/app/viewparts/**,**/crow3_*/app/views/**,**/crow3_*/app/assets/css/**,**/crow3_*/app/assets/js/**"
---

# 🧱 crow / frontend — component granularity and reuse

> How to write one part is [viewpart.md](frontend-viewpart.instructions.md); state and the parent/child flow is [viewpart-dataflow.md](frontend-viewpart-dataflow.instructions.md).
> This document defines **how to split a set of parts and how to reuse them**.
>
> The aim is to never create a state where "the same appearance is defined separately in several places" —
> never to incur, from the outset, the maintenance cost of fixing 7 files to change a button's corner radius.
>
> **Write comments and user-facing text in Japanese.**

---

## 1. The layer is the responsibility; the location is the scope of sharing (two separate axes)

**Never conflate the layer (what it may know) with the location (how widely it is shared).**
The layer is determined by responsibility; the location by "how many places use it right now".
Even a part in the `ui` layer may sit under an action while only one screen uses it.

### Layer = responsibility

| Layer | Responsibility | Examples (part names) |
| --- | --- | --- |
| **ui** (atoms) | the smallest unit of appearance, decomposed no further. Knows neither business nor communication | `ui_button` `ui_input` `ui_label` `ui_icon` |
| **parts** (molecules) | a reusable grouping of ui parts. Holds local state but knows no business | `search_box` `pager` `modal` |
| **feature** (organisms) | a grouping that knows the business. May do contract-conformant communication and touch `dbc` | `user_list` `order_form` |
| **scene / root** (screens) | routing and composition only. Appearance is delegated to the lower layers | `root` `scene_top` |

### Location = the scope of sharing

crow collects parts by scanning 4 levels in order, so **the depth of the placement is exactly the scope of sharing**.
Regardless of layer, put it at **the shallowest level that covers the range actually in use**.

| Range in use | Where it goes |
| --- | --- |
| One action only | `[role]/[module]/[action]/` |
| Several actions in the same module | `[role]/[module]/_common_/` |
| Several modules in the same role | `[role]/_common_/` |
| Several roles | `_common_/` |

That `ui` often ends up in `_common_/ui/` and `feature` in `[role]/[module]/_common_/` is
**an outcome**, not a rule. A `feature` used across a whole role may sit in `[role]/_common_/`.

### The layer is shown by the name

A folder name becomes a module name and is prefixed onto the part name
(`_common_/ui/button.php` → part name `ui_button`).
With that, the layer is readable from the name and the scope of sharing from the placement.

| Layer | Folder / naming (recommended; mandatory for ui only) |
| --- | --- |
| **ui** | **Mandatory:** under `ui/`, with the part name prefixed `ui_` (wherever it is located) |
| **parts** | Recommended: under `parts/`. Never put business vocabulary in the name (`search_box`, `pager`) |
| **feature** | Recommended: a name that conveys the feature (`user_list`, `order_form`). Never `ui_` or a purely visual name |
| **scene / root** | Recommended: under `scene/`, or `root`. The name must make its compositional role clear |

> **Never create prefix-matching part names.** `<style>` scoping is a partial match
> ([viewpart.md](frontend-viewpart.instructions.md) §7), so putting `ui_button` and `ui_button_group` side by side mixes the CSS.
> Name the latter something like `ui_buttons` — **names that do not contain each other at the head**.

---

## 2. Dependencies run one way, downward

```
scene / root  ──▶  feature  ──▶  parts  ──▶  ui
```

- **An upper layer may use a lower layer. A lower layer does not know the upper.**
  A `ui` part embedding `[[user_list]]`, or a `parts` referencing a feature's part name — both are forbidden
- **Avoid mutual references within the same layer too.** `ui_a` embedding `ui_b` is fine only when `ui_b` is clearly a lower-level component
- Give a lower layer no external dependency beyond "the values passed down and the closures passed down"

While this direction holds, **ui and parts can be pasted onto any screen**. The moment it breaks, reusability is gone.

---

## 3. The test for reusability is "it knows no business"

`ui` and `parts` must satisfy all of the following. **This is the practical test of whether something is reusable.**

- It neither reads nor writes `dbc`
- It never references the global `g`
- It performs no communication (ajax)
- It never uses `postup` (per [viewpart-dataflow.md](frontend-viewpart-dataflow.instructions.md), notifications are received via closure props)
- Its behavior is determined by props and closure props alone

```php
//	ui_button — 何のボタンかを知らない。押されたことを親へ渡すだけ
<props>
{
	label			: "",
	variant			: "primary",
	disabled		: false,
	on_click		: null,

	//	表示用に導出する class 名。バインド先は必ず <props> に宣言する
	button_class	: "ui_button primary"
}
</props>

<template>
 <button class=":button_class" disabled="::">
  <span>{{ label }}</span>
 </button>
</template>

<watch>
{
	//	見た目の指定を class 名へ導出する
	variant(old_, new_)
	{
		self.prop('button_class', "ui_button " + new_);
	}
}
</watch>

<ready>
{
	self.jq().on('click', () =>
	{
		if( self.prop('on_click') === null ) return;
		self.prop('on_click')();
	});
}
</ready>
```

> The bind target of `class=":button_class"` **must be declared in `<props>`**.
> Writing an undeclared prop name does not establish a binding, and the string stays in the `class` attribute as-is
> (no error, no warning). `disabled` is a boolean attribute with behavior, so it may be bound directly
> ([viewpart-dataflow.md](frontend-viewpart-dataflow.instructions.md) §3).

If communication, `dbc`, or a business judgment is needed, that is the `feature` layer. **Never bring business into ui — wrap it on the feature side.**

---

## 4. Name props in the layer's vocabulary

A `ui` part's props use **the vocabulary of appearance**. The moment business vocabulary enters, it stops being reusable.

```php
//	NG: ui が業務を知ってしまっている
<props>
{
	user_name	: "",
	is_admin	: false
}
</props>

//	OK: 見た目の語彙だけで書く
<props>
{
	label		: "",
	variant		: "primary"
}
</props>
```

**Translate business vocabulary into appearance vocabulary** in the `feature` layer, as in `[[ui_label label=:user_name]]`.
Performing that translation is the feature's responsibility.

---

## 5. Take variants as props rather than duplicating

**Never duplicate a file for a color or size variant.**

```php
//	NG: 複製する
//	  _common_/ui/button.php
//	  _common_/ui/button_red.php
//	  _common_/ui/button_small.php

//	OK: 1 ファイルで、見た目の差を props で受ける
[[ui_button label="保存" variant="primary"]]
[[ui_button label="削除" variant="danger" size="small"]]
```

Land the received value on a class and let `<style>` decide the appearance ([viewpart-dataflow.md](frontend-viewpart-dataflow.instructions.md) §3).
`<style>` is auto-scoped by part name, so **consolidating into one file closes the CSS in one place too**.

---

## 6. When to carve out: share it at the second site

- **Do not carve it out while only one place uses it.** Sharing something when you know only one way it is used swells the props on the second demand and makes it less readable, not more
- **Carve it out the moment a second site appears.** Never copy to make the second one — that is the origin of "the same thing defined separately"
- **Always search for an existing one before you start writing.** Before starting on a new appearance, search under `app/viewparts/` for `ui_`-prefixed part names and check nothing equivalent exists. Starting to write without searching is itself the origin of duplicate definitions

Put a part's first appearance **where it is used** (the location table in §1). Do not put it in `_common_/` preemptively.
Putting something used in one place at the widest level makes the scope of sharing unreadable.

### When you promote it, raise the location too

When the scope of sharing widens, raise it one level. **The layer does not change; only the location does.**

```
[role]/[module]/[action]/  →  [role]/[module]/_common_/  →  [role]/_common_/  →  _common_/
```

> **A same-named part later in the scan order overwrites the earlier.** Once you promote to an upper level, **always delete** the same-named file left at the lower level.
> Leaving it causes the accident of fixing only one of them while it is unreadable which is in effect.

---

## 7. Never create duplicate CSS

- **Never write the same appearance rule in two parts' `<style>`.** When you find a duplicate, that appearance is a ui part
- Put **tokens** — colors, spacing, font sizes — in variables on the `app/assets/css/` side and reference them from each part's `<style>`
  (resolution order is `[role]/` → `[role]/_common_/` → `_common_/` → `engine/assets/css/`)
- Never hardcode a raw color into a part's `<style>`. If there is no token, add the token first
- Layout (placement, spacing) is held by **the user**, and a ui part carries no outer margin of its own.
  Give a ui part a `margin` and every placement needs an override, and it stops being reusable
- **Close `<style>` declarations beneath your own root class.** The scope is a partial match, and
  the parent element you mount into also receives your part name, so a bare top-level declaration leaks to the parent and siblings
  ([viewpart.md](frontend-viewpart.instructions.md) §7). The more reusable the ui / parts, the wider the damage

---

## 8. scene / root hold composition only

Never let appearance accumulate in a screen part.

- A `scene`'s `<template>` stays a composition that merely lines up features and parts
- A `scene`'s `<style>` is layout only (grids, region division). Component appearance goes to the lower layers
- Business logic accumulating in `<method>` is the signal to carve out a feature part

---

## 9. The boundary with the backend (action / model)

On top of the FE's internal layering (§1–§3), hold the line against **the server side's responsibilities**.
The backend is authoritative in [backend/coding.md](backend-coding.instructions.md) §1.1 (the boundary), [backend/action.md](backend-action.instructions.md) (the action = the use case), and [backend/model.md](backend-model.instructions.md) (the model = Domain).

### 9.1 Who holds what

| Concern | Where it goes | Note |
| --- | --- | --- |
| **Business decisions** — permissions, state gates, whether a save is allowed, conflicts | **the server** (the model holds the meaning, the action the flow) | the FE alone can be bypassed, so never make it authoritative |
| Pre-checks for UX (empty fields, double-click prevention, confirmation dialogs) | **feature** | the final decision is always the server's |
| **Assembling the contract response** (the shape of `exit_ok`'s payload) | **the action** | not Domain. Never put screen-only concerns in a model |
| **Shared display labels and display names** (going on the contract) | **the server** (presenter → contract) | the FE presents without re-deriving. Details in backend §3.11 |
| **Screen-specific presentation and on-screen ordering** | **feature / scene** | the contractual list row order is authoritative on the server (SQL). The FE only presents in ways that do not break that order |
| Contract-conformant communication and reflecting into `dbc` | **feature** (as a rule) | ui / parts never communicate (§3). scene is §9.2 |
| Assembling the request body | **feature** | conform to the contract's keys and types. ui / parts only lift values up via props |
| Error wording such as from `exit_ng` | **the server is authoritative; the feature presents it** | never let the FE reword or swallow a business meaning |

The backend is authoritative in [backend/coding.md](backend-coding.instructions.md) §1, [backend/action.md](backend-action.instructions.md) §2, and [backend/model.md](backend-model.instructions.md) §3.11.
**A shared display value that went on the contract is used by the FE, not re-derived. Only the screen-specific labels and presentation that do not go on it are the FE's.**

### 9.2 Which layers may communicate

```
scene / root  ──conditionally──▶  feature  ──never──▶  parts  ──▶  ui
```

- **Communication (ajax) and reading/writing `dbc` belong to the feature as a rule.** ui / parts are forbidden (§3).
- **`scene` / `root` may do ajax only** on a thin screen that has no feature yet and where composition alone suffices, or for the initial fetch of cross-cutting state the root holds as a whole. Business lists and updates get carved out into a feature.
- Calls for fetching, updating, and deleting a list, the `dbc.set*` of the response, and error display are basically closed inside the feature.
- Pre-issue gates, generation management, and how to land a success are in [viewpart-dataflow.md](frontend-viewpart-dataflow.instructions.md), "Communication and applying the response".

### 9.3 Request and response

```php
//  ui / parts — 値を上げるだけ（契約キーを知らない）
self.prop('on_submit')(self.prop('name'));

//  feature — 契約に沿って組み立てて送る
let request =
{
	name: name_,
	page_no: self.prop('page_no'),
};
//  … ajax → 成功なら dbc / props を更新、失敗ならサーバ文言を表示
```

- On success: land the contract's payload onto props / `dbc`.
  A shared display value that went on the contract is used, not re-derived. Only screen-specific presentation and ordering are the feature's.
- On failure: **display the message the server returned as-is (or per the contract)**.
  Never let the FE invent different wording for "out of scope".

### 9.4 What not to do

- Reimplement, in a feature, a business decision "the same as the server's" as authoritative (a UX pre-check is fine).
- Do ajax / `dbc` / contract-key assembly from ui / parts.
- Swallow an `exit_ng` message and treat it as a success.
- Keep the authority on one table's meaning or permissions in the FE's props alone.

---

## ✅ Checking a component design

- [ ] Did you search the existing ui / parts before writing a new appearance?
- [ ] Are you making the second one by copying? (share it at the second site)
- [ ] Is the location "the shallowest level covering the range actually in use"? (did you put it in `_common_/` preemptively?)
- [ ] Is the layer readable from the part name? (`ui` requires `ui/` and `ui_`; parts/feature follow §1's recommended naming)
- [ ] Have you created prefix-matching part names? (`ui_button` and `ui_button_group`)
- [ ] Do `ui` / `parts` touch `dbc` / `g` / communication / `postup`?
- [ ] Are `ui`'s props in the vocabulary of appearance? (has business vocabulary leaked in?)
- [ ] Is every bound prop declared in `<props>`?
- [ ] Are you making color or size variants by duplicating files?
- [ ] Does a lower layer reference an upper layer's part name?
- [ ] Is the same CSS rule duplicated across several parts' `<style>`?
- [ ] Are `<style>` declarations closed beneath your own root class?
- [ ] Have you hardcoded a raw color into `<style>`?
- [ ] Does a ui part carry an outer margin?
- [ ] After promoting a level, is a same-named file left at the lower level?
- [ ] Does the `scene`'s `<template>` stay within composition?
- [ ] Is the authority on business decisions on the server, with the feature confined to UX pre-checks?
- [ ] Are communication, request assembly, and `dbc` reflection closed inside the feature (or the scene)?
- [ ] Have you reworded or swallowed a server error message?
