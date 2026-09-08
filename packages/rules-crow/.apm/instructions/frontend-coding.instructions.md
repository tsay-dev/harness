---
description: "🎨 crow / frontend — coding rules (the surface-layer delta)"
applyTo: "**/crow3_*/app/viewparts/**,**/crow3_*/app/views/**,**/crow3_*/app/assets/css/**,**/crow3_*/app/assets/js/**"
---

# 🎨 crow / frontend — coding rules (the surface-layer delta)

> **The common style is [common/coding.md](common-coding.instructions.md)** (the indentation table, Allman, snake_case,
> the `i_` prefix, the ban on `===` / `!`, `//<TAB>` comments, 80 columns, the PHP closing tag, the trailing newline).
> This document defines, **on top of following that**, only the delta that binds the surface (HTML / CSS / JS).
> It never restates the common side.
>
> It applies when writing or fixing crow views (HTML + embedded PHP), CSS, and JS.
> **Viewpart-specific matters** (the section DSL, binding, parent/child, dbc/ajax) are authoritative in
> [viewpart.md](frontend-viewpart.instructions.md) / [viewpart-dataflow.md](frontend-viewpart-dataflow.instructions.md) /
> [viewpart-components.md](frontend-viewpart-components.instructions.md). Do not copy them here.
>
> **Write comments in Japanese.**

## Comments inside HTML

Inside HTML, **do not use `<!-- … -->`** — use a PHP comment,
because an HTML comment is emitted to the client as-is.

```php
<!-- こうではなくて -->
<div></div>

<?php /**** こうする ****/ ?>
<div></div>
```

## The wrapping exception (HTML)

Follow [common/coding.md](common-coding.instructions.md)'s "wrap at a baseline of 80 half-width characters", but
**never wrap in the middle of an HTML tag**. A tag stays one unit even past 80 characters.

## CSS

Tokens, the ban on duplication, and the scope of `<style>` are authoritative in
[viewpart-components.md](frontend-viewpart-components.instructions.md) §7.
This document does not restate them. "Never hardcode a raw color into a part's `<style>`" is in that same section.

## Variable declarations in JavaScript

**Never use `var`.** Use `let` / `const`. A value that is not reassigned is `const`.

```javascript
//  NG
var count = 0;

//  OK
let count = 0;
const max_page = 10;
```

## Strings in JavaScript

String literals are **double-quoted `"..."` by default**
(matching existing code and the PHP-side convention). Template literals `` `...` `` are used only
where a newline or an embedded expression is needed.

## Trailing commas in JavaScript arrays and objects

In JavaScript, **end the last element's line with a comma** in arrays and objects (2024/12/23).

```javascript
let obj =
{
	key1 : "value1",
	key2 : "value2",
};
```

## Every comparison in JavaScript is typed

common/coding.md defines typed comparison for booleans and null, but
**in JavaScript the scope is unrestricted: always use `===` / `!==`.**

Unlike PHP, JS's `==` coerces between strings and numbers and between `null` and `undefined`, so
`"0" == 0` and `null == undefined` both hold. Use typed comparison regardless of what is being compared.

```javascript
//  NG
if( id == "1" )

//  OK
if( id === "1" )
```

The ban on `!` from common/coding.md holds in JS too (write `=== false` / `!== true`).
