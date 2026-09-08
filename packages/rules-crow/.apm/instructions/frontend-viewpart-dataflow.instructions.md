---
description: "🔀 crow / frontend — viewpart data flow and the declarative style"
applyTo: "**/crow3_*/app/viewparts/**,**/crow3_*/app/views/**,**/crow3_*/app/assets/css/**,**/crow3_*/app/assets/js/**"
---

# 🔀 crow / frontend — viewpart data flow and the declarative style

> The structural rules for a part are [viewpart.md](frontend-viewpart.instructions.md). This document defines **how state is held and how it flows**.
> The aim is "you can read it and know the behavior" — that the screen is determined by the state and the template, without tracing an order of procedures.
>
> **Write comments and user-facing text in Japanese.**

---

## 0. Defining the goal (what crow can and cannot do)

A crow viewpart **is not React**. There is no virtual DOM, no re-render, no diff application, and
no declarative directives for conditional rendering, list rendering, or events.
Reactivity is realized through fine-grained binding to props.

**So do not set "write it like React" as the goal.** Narrow the goal to these two:

1. Never break the relation that **state is the single truth and the screen is derived from it**
2. Fix the direction: **data flows parent to child, events flow child to parent**

crow's implementation already supports the first. Property binding via `:` is one-way, parent to child, with no return path.
The second is realized by **passing a closure as a prop and having the child merely call it** (§5).
**The rules exist to close the loopholes the mechanism leaves open.**

---

## 1. State is the single truth (never read state from the DOM)

**Never read the screen's current value from the DOM.** State always lives on the props side; the DOM is its projection.

```php
//	NG: DOM を状態源にしている
let name = self.jq('input_name').val();
if( name === "" ) { ... }

//	OK: props を状態源にする（bind_input で DOM → props が同期される）
if( self.prop('name') === "" ) { ... }
```

Tie input elements to props with `bind_input` / `bind_checked`. That is a local two-way binding **between the DOM and your own props**,
and it is permitted because form input needs it. **Never tie it to the parent's props.**

When you want to change the screen, **change the props, not the DOM**.

```php
//	NG: DOM を直接書き換える（次の再描画で失われ、状態と食い違う）
self.jq('label').text("完了");

//	OK: 状態を変える。テンプレートのバインドが画面を更新する
self.prop('status_label', "完了");
```

---

## 2. Whatever can be declared in the template is written in the template

Never assemble HTML in `<ready>` or `<method>`. **Assigning a string to `innerHTML` is forbidden** (details in [viewpart.md](frontend-viewpart.instructions.md) §5).

There are 4 things that can be declared. Whatever they can express is always written with them.

| Notation | Meaning |
| --- | --- |
| `{{ prop }}` | text interpolation (HTML-escaped) |
| `{{{ prop }}}` | text interpolation (unescaped). **Only for trusted values** |
| `attr=":prop"` / `attr="::"` | attribute binding (`::` binds the same name) |
| `[[part arg=:prop]]` | embedding a child part + property binding |

### Use `{{ }}` for "the text of that element alone"

Extraction for interpolation presupposes the shape "the tag's content is text".
**Interposing another tag drags in an unintended range and breaks it.**

```php
<!--  NG: 内側に別タグがある  -->
<p>こんにちは {{ name }} <b>さん</b></p>

<!--  OK: 補間する値を専用要素で包む  -->
<p>こんにちは <span>{{ name }}</span> <b>さん</b></p>
```

Remember it as: **always give an interpolated value its own dedicated element.**

---

## 3. Express display switching with a class binding

crow has no conditional-rendering directive. Show/hide and state differences are expressed by
**binding a class and letting `<style>` decide the appearance**.

Making it a single path "state → class → appearance" means the screen is determined by looking at the state and the CSS alone,
and display logic does not scatter into `<ready>`.

```php
<props>
{
	is_empty	: true,
	list_class	: "list is_empty"
}
</props>

<template>
 <div class=":list_class">
 </div>
</template>

<watch>
{
	//	真偽値の状態から、表示用の class 名を導出する
	is_empty(old_, new_)
	{
		self.prop('list_class', new_ === true ? "list is_empty" : "list");
	}
}
</watch>

<style>
.list
{
	&.is_empty { display : none; }
}
</style>
```

### The exception: boolean attributes with behavior are bound directly

The four `checked` / `required` / `disabled` / `readonly` carry **behavior that a class cannot substitute for**.
These alone may have a boolean prop bound directly.

```php
<template>
 <input type="checkbox" checked="::">
 <button disabled=":is_saving">保存</button>
</template>
```

**Never use any attribute other than these four for display control.** Every visual difference goes onto a class.

---

## 4. Consolidate a list into "state → a single render method"

crow has no list-rendering directive, so rendering becomes procedural — but
**fixing the place it is called from to exactly one keeps the declarative character.**

The principle: **never stack children onto the DOM directly from an event handler. An event only changes state.**
`<watch>` picks up the state change and calls exactly one render method.

```php
<props>
{
	rows : []
}
</props>

<template>
 <div class="list">
  <button ref="btn_reload">再読込</button>
  <div ref="list_body"></div>
 </div>
</template>

<ready>
{
	//	初回描画は ready で起こす。
	//	生成時に args_ で rows を受け取った場合は watch が発火しないため、
	//	これが無いと永久に描画されない
	self.render_rows();

	//	イベントは状態を変えるだけ。DOM には触らない
	self.jq('btn_reload').on('click', () => self.load_rows());
}
</ready>

<watch>
{
	//	状態が変わったら描画メソッドを呼ぶだけ
	rows(old_, new_)
	{
		self.render_rows();
	}
}
</watch>

<method>
{
	//	描画は必ずこの 1 メソッドに閉じる
	render_rows()
	{
		//	自分が作った子だけを消してから作り直す
		self.remove_pref("row");

		//	全行に同じ pref を付けることで、次回の remove_pref で一括破棄できる
		self.create_children_and_append("row", self.prop('rows'), "list_body", "row");
	}
}
</method>
```

- **Kick off the first render in `<ready>`.** `<watch>` runs only on change, so without this you get the accident that
  "data passed via `args_` at creation is never rendered"
- Dispose children with `remove_pref()`, giving **every row in the list the same pref** ([viewpart.md](frontend-viewpart.instructions.md) §2)
- If you mutate an array's contents, the reference does not change and watch does not fire — fire it explicitly with `self.update('rows')`
- Diff updates (reuse by key) do not exist in crow. **Only when the row count is high and full teardown-and-rebuild is heavy**,
  write a local diff update closed inside `<method>` (keeping the single call site)

---

## 5. One-way data flow (the parent/child contract)

```
        props (values)
   parent ───────────────▶ child
   parent ───────────────▶ child   props (closures)
   parent ◀─────────────── child   the child merely calls that closure
```

**Both down and up go through the single path of props.** Values and events travel the same road, so
looking only at the parent's template and creation code reveals the whole contract with that child.

### Down: parent → child is passed as props

```php
<!--  ":" は継続バインド（親の変更が子へ流れ続ける）。属性名が子の prop 名になる  -->
[[user_card name=:user_name]]

<!--  "@" は初回のみ。属性名と prop 名を必ず一致させる  -->
[[user_card user_name=@user_name]]

<!--  リテラルは直接渡す（"true" / "false" は真偽値に変換される）  -->
[[user_card editable="true"]]
```

> **`@` does not look at the attribute name.** The referenced prop name becomes the child's prop name directly, so
> `[[user_card name=@user_name]]` **does not set** the child's `name` — it injects a key called `user_name`.
> **Unless the names match, the value does not arrive.** Use `:` when you want to pass it under a different name.

For dynamically created children, pass values through `create_child*`'s `args_`. Use `bind_prop()` only when the parent wants to change the value later.

> **What you pass is a reference.** Both `:` binding and `args_` pass objects and arrays **as-is, without copying**.
> If the child mutates the contents destructively, **the parent's data is rewritten directly, and watch does not even fire** (see the prohibitions below).

### Up: child → parent calls a closure the parent passed down

**Do not use `postup` / `postdown` by default** (the exception is below).
The parent holds the substance of the processing, and **the child is passed a function to call it as a prop**.
The child only conveys "what happened to me"; it does not know what the parent does with that.

**Parent: the substance of the processing goes in `<method>`**

```php
<method>
{
	//	処理の実体は親が持つ
	on_row_selected(id_)
	{
		self.prop('selected_id', id_);
	}
}
</method>
```

**Parent: for dynamically created children, pass it in `args_` at creation**

```php
<ready>
{
	self.create_child_and_append
	(
		"row",
		{
			id			: 1,
			on_select	: (id_) => self.on_row_selected(id_)
		},
		"list_body"
	);
}
</ready>
```

**Parent: for children embedded in the template, pass it via a prop**

```php
<props>
{
	//	クロージャは <props> の中で定義しない。null で枠だけ宣言する
	on_select : null
}
</props>

<template>
 <div>
  [[row on_select=:on_select]]
 </div>
</template>

<init>
{
	//	self が使えるのは <init> 以降。ここで実体を入れる
	self.prop('on_select', (id_) => self.on_row_selected(id_));
}
</init>
```

> Children embedded in a template **are created before the parent's `<init>`**, so at the moment of creation `null` is in place.
> The `:` continuous binding carries the assignment made in `<init>` down to the child. Two constraints follow.
>
> - **A child must never call the closure inside its `<init>`** (it has not arrived yet)
> - **A parent must never `watch_stop()` in `<init>`.** While stopped, `:` binding propagation also stops, so
>   the closure never reaches the child ([viewpart.md](frontend-viewpart.instructions.md) §3)

**Child: receive it and just call it**

```php
<props>
{
	id			: 0,
	on_select	: null
}
</props>

<ready>
{
	self.jq('btn').on('click', () =>
	{
		//	渡されていない場合に落ちないよう存在を確認する
		if( self.prop('on_select') === null ) return;
		self.prop('on_select')(self.prop('id'));
	});
}
</ready>
```

### Rules for closure props

- **Name them `on_` + the fact that happened.** Name them for **what happened in the child**, as in `on_select` / `on_close_requested`.
  Never name them for **what the parent does**, as in `on_delete_user` (that makes the child know the parent's business)
- **Never define a closure inside `<props>`.** `self` does not exist in the props section, so
  a function written there cannot touch its own part. Declare the slot as `null` and put the substance in from `<init>`
- **The child only calls it. It never depends on the return value.** The child has no need to know how the parent handled it
- **Pass the minimum values as arguments.** Never pass DOM elements, event objects, or your own instance
- **Tolerate it being unset.** Check for `null` before calling, and do nothing if absent
- **Doubt the design once the bucket brigade exceeds 3 levels.** When closures that intermediate parts merely pass through start piling up,
  that state belongs in `dbc` rather than in a common ancestor

### The exception: use postup / `<recv>` only for cross-cutting notifications

Use `postup` only for a notification that **must be raisable from anywhere on the screen and has exactly one receiver at the root**.
The typical cases are the error dialog and message display, where threading a closure through every intermediate part is unreasonable.

**Only feature and above (feature / scene / root) may emit.**
`ui` / `parts` are forbidden from `postup` (they return to the parent via closure props —
[viewpart-components.md](frontend-viewpart-components.instructions.md) §3).

```php
//	feature 以上: 横断的な通知だけは postup を使う
self.postup('error', ["E001", "保存に失敗しました"]);
```

```php
//	ルート: <recv> で受ける
<recv>
{
	//	横断: 全パーツから上がるエラー表示。クロージャを全階層に通さないためここで受ける
	error(sender_, params_)
	{
		ui.dialog.popup_error("error", params_[0], params_[1]);

		//	処理しきったので伝播を止める
		return true;
	}
}
</recv>
```

The receive handler's first argument is **fixed as the emitting instance**; the second is the parameters passed to `postup`.
Once you have handled it fully, return `true` to stop the propagation (without it, it keeps climbing to the ancestors).

**When you use it, leave a comment on the `<recv>` side explaining why it is cross-cutting.**
If you cannot write the reason, it is an event that should have been passed as a closure.

### Prohibitions (mechanically possible, but they break one-way flow)

- **A child never rewrites the parent's state.** Never write `self.parent().prop(...)` / `self.parent().jq(...)`.
  `parent()` is public so the mechanism allows it, but doing so makes the source of a change untraceable.
  A child **only calls the closure it was passed**
- **A child never rewrites a prop it received from the parent.** Reassigning does not reach the parent and gets overwritten by the parent's next change.
  Worse, **objects and arrays share a reference**, so mutating the contents
  **quietly contaminates the parent's data without firing watch** (the hardest breakage to trace).
  When you want to transform something, **prepare a differently named prop and derive it in `<watch>`**
- **Never reference a sibling part directly.** Never grab a sibling with `viewpart_find_by_name()` / `viewpart_find_all_by_name()`
  and operate on it. Receive a closure at the common parent and have the parent reflect it onto the other child via `pref()`
- **Never grab a grandchild directly.** Never write a chained reference like `self.pref('a').pref('b')`. Delegate responsibility one level at a time

### State shared broadly goes in dbc

For state whose ancestor is distant, or that spans screens, use `dbc` (the data cache) rather than lifting it to a common ancestor.

```php
//	dbc の値をパーツの prop にバインドする
dbc.bind("user.list", user_id, self, "user_row");
```

- **`dbc.bind()` is one-way, dbc → prop** (changing the prop does not change dbc).
  Always update through `dbc.set()` / `dbc.set_list()` / `dbc.merge_list()`; never rewrite the prop directly
- **A binding is released automatically when the part is disposed.** Write an explicit `dbc.unbind(self, "prop name")`
  only when you want to detach early while it is still on screen
- **`set_list()` does not delete "keys absent from the new list".** When a row disappears in a full refresh,
  a bound prop **stays at its old value**. If a disappeared row must be reflected, use the `remove` family
  or re-pull the dbc list on the rendering side

### Communication and applying the response (ajax / the contract)

Who may communicate is in [viewpart-components.md](frontend-viewpart-components.instructions.md) §9 (feature and up).
Here we define **how to issue it and how to land the response**.

#### Fail closed before issuing

**Do not issue the ajax** until the required conditions (the assignee, the selected row, the contract's required keys) are in place.
While they are not, stay on an empty state or a skeleton, and **do not go fetch under looser conditions**
(never create a route where the server's population constraint or a permission quietly disappears).

Consolidate request assembly into a **single path** within the feature (e.g. `build_*_request_params`),
so that every UI operation — tabs, paging — goes through it.

#### How to land a success

| Nature of the data | Where it lands |
| --- | --- |
| A list or row shared by several parts within the screen | `dbc.set` / `dbc.set_list` / `dbc.merge_list`. Children use `dbc.bind` |
| Local state belonging to that feature alone | that part's own props |

- Never make DOM assembled directly in the success callback the source of state (§1, §4).
  Land the data first, then proceed to the existing single render method or child creation.
- Land it per the contract's response shape (key names are authoritative in the feature's contract;
  `rows` / `rows_with_id` / `pager` are **common examples**, not a list of required keys).

#### Never apply a stale response

`ajax.post` and the like do not return an abort handle, and a response already delivered sometimes cannot be stopped.
On rapid clicks and tab switches, carry a **request generation (seq)**, and:

- advance the seq on every issue
- decide, before applying a response, whether it belongs to the latest generation
- **never write anything but the latest into the list or the state** (fail closed)

Never let a stale response's failure crush the latest generation's list into an empty state.

#### On failure

- **Present** the message the server returned, as a toast or an on-screen error (rewording or swallowing is §9).
- Whether to empty the list or keep the previous display follows the feature spec. State one of the two; never leave it ambiguous.
- Never leave a skeleton up (fold it away on failure too).

```php
//  概形（名前は機能に合わせる）
let request_seq = self.next_list_request_seq(self.prop('list_request_seq'));
self.prop('list_request_seq', request_seq);

ajax_or_helper
(
	params,
	(data_) =>
	{
		if( self.should_apply_list_response(request_seq, self.prop('list_request_seq')) === false )
		{
			return;
		}
		//	data_ のキーは契約に従う（以下は例）
		dbc.set_list('example.list', data_.rows_with_id);
		self.prop('pager', data_.pager);
		self.render_list();
	},
	(code_, msg_) =>
	{
		if( self.should_apply_list_response(request_seq, self.prop('list_request_seq')) === false )
		{
			return;
		}
		dbc.set_list('example.list', null);
		self.render_empty();
		//	トースト API 名はプロジェクト側。サーバ文言 msg_ を提示する
		show_error(msg_);
	}
);
```

---

## 6. The only procedural code allowed is "event wiring"

crow has no declarative event directive, so wiring in `<ready>` is unavoidable.
**Recognize this as the sole entrance for procedural code, and never widen it.**

```php
<ready>
{
	//	OK: 配線して、自分の状態を変えるだけ
	self.jq('btn_save').on('click', () => self.prop('saving', true));

	//	OK: 親から渡されたクロージャを呼ぶだけ
	self.jq('btn_close').on('click', () =>
	{
		if( self.prop('on_close_requested') === null ) return;
		self.prop('on_close_requested')();
	});
}
</ready>
```

Screen assembly, branches, and loops accumulating in `<ready>` are a sign the state design has failed.
**First doubt it: "could that branch be a prop?"**

---

## ✅ Checking the data flow

- [ ] Are you reading a screen value from the DOM? (is `.val()` / `.text()` a source of state?)
- [ ] Are you assigning strings to `innerHTML` or assembling HTML?
- [ ] Is `{{ }}` wrapped in a dedicated element? (no other tag inside?)
- [ ] Is display control written with class bindings? (are you switching anything but the 4 boolean attributes?)
- [ ] Is the list's first render in `<ready>`?
- [ ] Is there exactly one render method for the list, with nothing stacked onto the DOM directly from an event handler?
- [ ] Is a child rewriting the parent via `self.parent()`?
- [ ] Is a child rewriting a prop it received from the parent (including an object's contents)?
- [ ] Are you referencing a sibling or a grandchild directly?
- [ ] With `@` binding, do the attribute name and the prop name match? (they must, or the value never arrives)
- [ ] Are child → parent notifications closure props? (are you using `postup` by default?)
- [ ] Are closure props named `on_` + the fact that happened?
- [ ] Are you defining a closure inside `<props>`? (is it a `null` declaration + assignment in `<init>`?)
- [ ] Does the child check for `null` before calling a closure, and does it avoid calling in `<init>`?
- [ ] Does every `postup` site carry a comment on why it is cross-cutting, and does it stop propagation with `true`?
- [ ] Is `postup` emitted only from feature and above? (not raised from ui / parts?)
- [ ] Does `<ready>` stay within event wiring?
- [ ] Is the pre-communication gate fail-closed? (are you issuing ajax with required conditions unmet?)
- [ ] Are successful shared-list results landed via `dbc` (or local props)?
- [ ] Are stale responses discarded by request generation? (is anything but the latest written into the list?)
- [ ] On failure, do you present the server's wording and fold the skeleton away?
