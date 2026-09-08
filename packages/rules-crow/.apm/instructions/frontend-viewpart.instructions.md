---
description: "🧩 crow / frontend — how to write a viewpart"
applyTo: "**/crow3_*/app/viewparts/**,**/crow3_*/app/views/**,**/crow3_*/app/assets/css/**,**/crow3_*/app/assets/js/**"
---

# 🧩 crow / frontend — how to write a viewpart

> The common style is [common/coding.md](common-coding.instructions.md); the surface-layer delta is [coding.md](frontend-coding.instructions.md).
> This document defines **the structural rules for writing a viewpart (`app/viewparts/**/*.php`)**.
> Data flow, the declarative style, and parent/child relationships are covered by [viewpart-dataflow.md](frontend-viewpart-dataflow.instructions.md);
> granularity and reuse by [viewpart-components.md](frontend-viewpart-components.instructions.md).
>
> **Write comments and user-facing text in Japanese.**

---

## 1. The skeleton of a part file

One part = one file. It is crow's own DSL, delimited by section tags.

**Always write a section tag on a line of its own.** The parser treats as a boundary only a line that, with indentation stripped, matches `<props>` and the like exactly — so
written inline, it **is silently ignored as body text rather than raising an error** (a silent accident).

There are 9 sections in use. **Never use anything else.**

| Section | Use |
| --- | --- |
| `<props>` | property definitions (initial values). **Reactive** |
| `<template>` | the HTML. Exactly one element directly beneath it |
| `<style>` | ICSS, scoped by the part name (with the caveats in §7) |
| `<init>` | on mount. The part's own DOM exists but is not yet connected to the document |
| `<ready>` | after connection to the document. Event wiring and the first render go here |
| `<watch>` | property-change handlers |
| `<method>` | the part's methods |
| `<recv>` | message-receipt handlers (cross-cutting notifications only) |
| `<depends>` | explicitly declared dependent parts (prefetch targets) |

**Never write tests inside a part file.** **The harness does not file FE tests for now** (no frontend testing leaf is placed).

### Fix the order of the sections

Write them in the order of the table above. Existing parts are uniform across every file in this order with the same ruled comments, so imitate that.
**Leave even the sections you do not use, empty** (so the place to add later is always the same).

```php
/*

	パーツの説明をここに書く（セクション外の行は捨てられるので自由に書ける）

*/
//------------------------------------------------------------------------------
//	properties
//------------------------------------------------------------------------------
<props>
{
}
</props>

//------------------------------------------------------------------------------
//	html part
//------------------------------------------------------------------------------
<template>
 <div class="xxx">
 </div>
</template>
```

### PHP is available

The file is run through `eval("?>".file_get_contents())`. When you want to bake in a server-side value, PHP is fine.
But **what is baked in is settled at build time** (parts are cached per role/module/action/lang).
Never bake in a value that changes per request.

---

## 2. Placement and naming

Parts are collected by scanning the following 4 levels **in this order**, and **a same-named part later in the order overwrites the earlier**.

1. `app/viewparts/_common_`
2. `app/viewparts/[role]/_common_`
3. `app/viewparts/[role]/[module]/_common_`
4. `app/viewparts/[role]/[module]/[action]`

**Placement is decided by the scope of sharing.** Locations are authoritative in [viewpart-components.md](frontend-viewpart-components.instructions.md) **§1**,
and the decision to carve something out as shared follows **§6** of that same document.

### A part's name is determined mechanically from the folder structure

A subfolder becomes a module, and the part name is determined by underscore concatenation.

| File | Module name | Part name |
| --- | --- | --- |
| `_common_/footer.php` | none | `footer` |
| `_common_/scene/top/_.php` | `scene_top` | `scene_top` (`_.php` is the folder name itself) |
| `_common_/scene/top/child.php` | `scene_top` | `scene_top_child` |

There is a branch where **a file name that prefix-matches the module name shrinks the part name down to the module name**.
That collides unintentionally, so **never give a file the same name as a part of the module name**.

> **Watch prefix matching in part names too.** `<style>` scoping is a partial match (§7), so
> creating names where **one is contained at the head of the other**, like `ui_button` and `ui_button_group`, mixes the CSS together.

Embedding within the same module may omit the module name (`[[child]]` = `[[scene_top_child]]`).
The name passed to `viewpart_create()`, on the other hand, cannot be omitted, so **create children with the `create_child*` family** (where it can).

### How to assign a pref (the child handle)

Omitting `pref` auto-assigns "the part name with the module-name portion removed".

| Situation | How to assign pref |
| --- | --- |
| You want to **grab the same part individually** | give **a distinct name to each one**, as in `[[child pref="left"]]`. With the same name, `pref()` returns only the first |
| You want to **handle them together as a list** | give **every row the same pref**. `prefs()` gets them all; `remove_pref()` removes them all |

Rendering a list is the correct use of the latter ([viewpart-dataflow.md](frontend-viewpart-dataflow.instructions.md) §4).

---

## 3. The lifecycle

```
constructor        props settled (the <props> defaults ← overridden by args_)
                   <method> attached directly onto the instance
                   <template> cloned to build the part's own DOM subtree
                   uids assigned to refs, ":" attributes bound
       ↓
embedded children  the [[…]] child parts are created and mounted (= a child's <init> runs here)
       ↓
mount              watch starts → the <init> body
       ↓
connected to doc   <ready>
```

**Two orderings must be held in mind.**

- **`<init>` runs on mount**, not right after construction. And **children embedded in the template are created and initialized before the parent's `<init>`**
- **watch starts before the `<init>` body.** It is not that "watch begins running once init finishes"

### At `<init>`, the DOM "exists" but is "not connected"

Because the constructor has already cloned `<template>`, **`self.ref()` / `self.jq()` are usable from `<init>`**.
All that is missing is the connection to the document. So what does not work in `<init>` is limited to **operations that presuppose that connection**:

- Getting an element's size or position (`offsetWidth`, `getBoundingClientRect()`, and so on)
- `focus()` and scroll operations
- Calculations relative to `window`

Do those in `<ready>`.

### Each section's responsibility

| Section | May be written | Must not be written |
| --- | --- | --- |
| `<init>` | initializing internal state (`self.v`), assigning closure props, registering global events | operations presupposing document connection, such as getting sizes or `focus()` |
| `<ready>` | event wiring, **kicking off the first render**, operations only possible after connection | long processing logic (carve it into `<method>`) |
| `<watch>` | invoking a re-render in response to a state change | assembling DOM directly |
| `<method>` | the part's behavior | — |
| `<recv>` | handling cross-cutting received messages | — |

### As a rule, do not use `watch_stop()`

`watch_stop()` does not stop `<watch>` alone. **It simultaneously stops `{{ }}` text updates and the parent→child `:` binding propagation.**
Worse, resuming with `watch_start()` **does not replay the changes that happened while it was stopped**.

Since the part's own DOM already exists at `<init>`, the reason "the DOM isn't built yet, so stop it" does not hold.
Use it only when truly necessary, and **always restore it in `<ready>` and pick the dropped updates back up with `update_all()`**.

---

## 4. Split state between props and `self.v`

| Where it goes | Nature | What goes there |
| --- | --- | --- |
| A property in `<props>` | **Reactive**. A change fires the binds and the watches | values that appear on screen, values received from the parent, closure props |
| `self.v` (initialized in `<init>`) | **Non-reactive**, for internal control | control data that never appears on screen: stacks, flags, handler references |

```php
<init>
{
	//	画面に出ない制御データは self.v へ
	self.v =
	{
		stack : [],
		index : -1
	};
}
</init>
```

### Declare in `<props>` every prop you use

**`prop()` silently ignores a name that is not in `<props>`.** No exception, no warning.

```php
//	<props> に "conut" は無い（typo）→ 代入は何も起きず、読むと null が返る
self.prop('conut', 3);
```

Props cannot be added later, so **write everything you use in `<props>`, including values received from the parent and closure props**.

### There is no `self` inside `<props>`

The generated JS is `props: function(){ return {...}; }`, and **`let self = this;` is not injected into props alone**
(it is injected into init / ready / watch / method / recv).

In a browser, `self` refers to the global object, so **it breaks without raising an error**.
A call to `self.prop(...)` throws, but an assignment such as `self.v = {...}` **passes silently while polluting the global**.
Write only static values in `<props>`; put dynamic ones in from `<init>` onward.

---

## 5. Creating and manipulating DOM

### Only `<template>` may create DOM

**Never assemble DOM from JS.** When you need a new element, that is "one viewpart".

```php
//	NG: jQuery で組み立てる
$('<li class="row">' + name + '</li>').appendTo(self.jq('list'));

//	NG: DOM API で組み立てる
let li = document.createElement('li');
li.textContent = name;
self.ref('list').appendChild(li);

//	NG: HTML 文字列を流し込む
self.jq('list').html(rows_html);

//	OK: パーツとして切り出し、子として作る
self.create_children_and_append("row", rows, "list");
```

The following are forbidden. **There are no exceptions.**

- Creating elements via `$('<tag>…</tag>')` / `document.createElement()` / `cloneNode()`
- Every route that **builds DOM from a string**: `.html()` / `.innerHTML` / `.append("<div>…")`, and so on
- Rewriting displayed content via `.text()` / `.attr()` / `.addClass()` / `.css()`
  → change the display through props binding ([viewpart-dataflow.md](frontend-viewpart-dataflow.instructions.md))

There are 3 reasons. **①** The appearance splits between `<template>` and JS, and it becomes unreadable where to fix something to change the screen.
**②** Elements created in JS carry no `<style>` scope attribute, so where the CSS belongs splits.
**③** Building from string concatenation is a breeding ground for XSS.

### jQuery is allowed only for "operating on elements that already exist"

| Use | Allowed? | What to use instead |
| --- | --- | --- |
| Event wiring (`.on()`) | ✅ | — |
| Imperative operations such as `focus()` and scrolling | ✅ | — |
| Creating, appending, or replacing elements | ❌ | carve it out as a viewpart |
| Changing text, attributes, class, or style | ❌ | props binding (`{{ }}` / `attr=":prop"`) |

### Always obtain elements through `self`

`ref="btn"` is rewritten to `ref="btn<uid>"` at instance construction (so several instances of the same part do not collide).
Therefore **`document.querySelector('[ref=btn]')` and a global `$('[ref=btn]')` do not work.**

- Use **only `self.ref()` / `self.refs()` / `self.jq()`** to obtain elements
- Never touch DOM outside the part directly. Never rewrite the inside of another part (that is that part's responsibility)

### Exactly one element directly beneath `<template>`

Writing several raises a warning and aborts the constructor, and **an instance whose initialization stopped halfway goes onto the screen as-is**
(it does not necessarily show nothing; it shows a broken partial render). When you want several side by side, wrap them in a wrapper element.

---

## 6. Creation and disposal

### Creation: the asynchrony of lazy loading

Parts are lazy-loaded by default. **`create_child*` / `create_children*` return `null` when not yet loaded,
and the real instance arrives later via the `on_load_` callback.**

Code that relies on the return value is a time bomb that "works only when it happens to be already loaded".

```php
//	NG: 戻り値を使う（未ロードなら null）
let child = self.create_child_and_append("row", {id : 1});
child.prop("name", "abc");

//	OK: コールバックで受ける
self.create_child_and_append("row", {id : 1}, null, null, function(child_)
{
	if( child_ === null ) return;
	child_.prop("name", "abc");
});
```

When you want to do something right after creation, **passing everything through `args_` at creation time is the safest**.
Use the callback, or `on_preready()` / `on_ready()`, only when that is impossible.

### Disposal: register cleanup on `on_remove()`

There is no section for disposal. Processing for when a part leaves the screen is **registered on `on_remove()` in `<init>` or `<ready>`**.

```php
<init>
{
	//	自分の外側に登録したものは、自分で外す
	self.v.on_resize = () => self.prop('width', window.innerWidth);
	window.addEventListener("resize", self.v.on_resize);

	self.on_remove(function(part_)
	{
		window.removeEventListener("resize", part_.v.on_resize);
	});
}
</init>
```

**Only what you registered outside yourself** needs cleanup. Specifically, these two:

- Event listeners on `window` / `document`
- `setInterval` / `setTimeout` timers

A handler attached to your own part's element with `self.jq(...).on()` disappears with the element and needs no removal.
`dbc.bind()` is also released automatically on `on_remove`, so an explicit `unbind` is generally unnecessary
(write one only when you want to detach early, before it disappears).

---

## 7. Styles

`<style>` is wrapped as `[viewpart*=":part name"] { … }` before being served.

### The scope is a "partial match", not full isolation

Because the selector is `*=` (a partial match), **it also hits another part whose name contains yours as a prefix**.
Furthermore, **the parent-side element a child was mounted into also receives the child's part name**, so
a top-level declaration in a child's `<style>` can hit **the parent's container element itself**.

So never think "it's scoped, so anything goes". Observe the following.

- **Always write `<style>` declarations beneath your own root element's class.** Never put a bare declaration at the top level

```css
/*  NG: トップレベルに素の宣言（親のコンテナにも当たる）  */
padding : 10px;

/*  OK: 自分のルート class の配下に閉じる  */
.row
{
	padding : 10px;

	> .label { color : #333; }
}
```

- **Never create prefix-matching part names** (§2). If `ui_button` exists, name it `ui_buttons`, not `ui_button_group`
- **Never widen a selector outside the part.** Never aim at `body` or another part's classes from `<style>`
- Variables and mixins you want to share go on the `app/assets/css/` side
  (resolved in the order `[role]/` → `[role]/_common_/` → `_common_/` → `engine/assets/css/`)

---

## ✅ After you finish writing a part

- [ ] Is every section tag on a line of its own?
- [ ] Is there exactly one element directly beneath `<template>`?
- [ ] Is every prop you use declared in `<props>`? (a typo in `prop()` vanishes silently)
- [ ] Have you written `self` inside `<props>`?
- [ ] Are you doing anything in `<init>` that presupposes document connection, such as getting sizes or `focus()`?
- [ ] Is the first render kicked off in `<ready>`?
- [ ] Are you using `watch_stop()` casually? (if you use it, did you restore it in `<ready>` and pick the dropped updates back up?)
- [ ] Is DOM access limited to `self.ref()` / `refs()` / `jq()`?
- [ ] Are you creating DOM from JS? (`$('<tag>')` / `createElement` / `.html()` / string concatenation)
- [ ] Is jQuery's use confined to event wiring and imperative operations?
- [ ] Are you using the return value of `create_child*` directly?
- [ ] Does the way you assigned prefs match the use (grabbing individually / handling together)?
- [ ] Are `window` / `document` listeners and timers removed in `on_remove()`?
- [ ] Have you put control data that never appears on screen into props?
- [ ] Are `<style>` declarations closed beneath your own root class?
- [ ] Have you created prefix-matching part names?
