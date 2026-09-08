---
description: "📦 crow — coding rules (common to all layers / a bespoke PHP framework)"
applyTo: "**/crow3_*/**"
---

# 📦 crow — coding rules (common to all layers / a bespoke PHP framework)

> The **minimum coding rules** for building a new system in crow.
> The foundation for how to proceed is develop's development process (refutation-driven, vertical slices).
> Purpose: writing code to a consistent set of rules makes maintenance easier for whoever comes next.
>
> This document covers **the common style that binds PHP, JS, CSS, and HTML alike**, and applies
> whether you are writing frontend or backend. The layer-specific deltas live in
> [frontend/coding.md](frontend-coding.instructions.md) and the backend leaves ([coding.md](backend-coding.instructions.md) = the core of the boundary, [action.md](backend-action.instructions.md), [model.md](backend-model.instructions.md), [query.md](backend-query.instructions.md)).
> **Never copy the common rules into a layer leaf** (the SSOT is here, in one place).
>
> **Write comments in Japanese.**

> **Note:** the code examples below show structure (how blocks line up). Real indentation uses **TAB** per the table below (the examples are formatted for readability).

## Indentation

| Target | Indentation |
| --- | --- |
| PHP | TAB |
| HTML | 1 half-width space |
| PHP inside HTML | TAB |
| CSS | TAB |
| JS | TAB |
| SQL files | TAB |

## Encoding and line endings

- Standardize on **UTF-8**, **LF** line endings, and **no BOM**.

## Block layout

Line up `{` and `}` vertically (Allman style).

```php
function func()
{
    $value = "abc";
    if( $value == "abc" )
    {
        return $value;
    }
}
```

## Naming

- Symbols in php / js / css are basically all **snake_case**.
- However, **method parameters carry a trailing underscore `_`**.

```php
function test_func( $arg1_, $arg2_ )
{
    $local_val = "val";
    return $arg1_.$local_val.$arg2_;
}
```

## Naming (local variables)

On the web, the content received as a request parameter is sometimes stored in a temporary variable.
So that you can tell **whether it came from a request parameter or was born internally**,
prefix the variable name with **`i_` (for input)**.

```php
function action_test()
{
    $i_name = crow_request::get("name");
    $i_age  = crow_request::get("age");

    if( check_value($i_name) === false ) return エラー;
}
```

## When you copy-paste code

Copying code from a browser can paste spaces where a TAB belongs.
**After pasting, always check the formatting.**

## Control structures

- Put a blank space on both sides of an operator.
- Use `else if`.

```php
if( $value=="abc" )
{
}
else if( $key == "0" && $value == "1" )
{
    //  演算子の前後でブランクをあける
}
```

Indent the `case` blocks of a `switch`. `break` may go inside or outside.

```php
switch( $option )
{
    case "pattern1":
    {
        break;
    }

    case "pattern2":
    {
    }
    break;
}
```

## Variables inside strings

Do not interpolate variables into a string (concatenate instead).

```php
$value = "123";

//  こうではなく、
$data = "値は、$value です";

//  こうする
$data = "値は、".$value." です";
```

This prevents things being missed on visual inspection: with some editor highlighters, a variable inside a string blends into the string and becomes hard to see.

## Statements spanning several lines

When an expression spans several lines, do not put the final semicolon `;` on the last line — put it on **a line of its own**,
aligned with the preceding line's indentation.

```php
$sql = model_xxx::sql_select_all()
    ->and_where("aa", "bb")
    ->and_where("cc", "dd")
    ;
```

This makes later additions easy and prevents omissions.

## Function calls spanning several lines

When arguments grow long enough to wrap, line up `(` and `)` vertically.

```php
{
    exec_function
    (
        "arg1arg1arg1",
        "arg2arg2arg2",
        "arg2arg2arg2",
    );
}
```

## Complex statements spanning several lines

Keep argument separators as trailing commas `,`, and break lines for blocks such as `{}` and `()`.

```php
{
    test_func
    (
        get_status(crow::get_hdb(), "test_table", "format"),
        simulate
        (
            first_param("abc", "def", "ghi"),
            long_expression
            (
                "abcdefghijklmn",
                "true or false",
                12345
            ),
            "last parameter"
        )
    );
}
```

## Comments

In-code comments in php / js take the form **`//<TAB>comment`**. Use **`/* … */`** when they run to 3 lines or more.

### Put a blank line before a comment

Leave a blank line before a comment.

```php
//  処理です
self::exec_func();

//  処理２です
self::exec_func2();
```

No blank line is needed on the line right after a block opens, though.

```php
if( xxxxxx )
{
    //  ここは前に空行不要
    self::exec_func();
}
```

## Line width and where to wrap

- Consider wrapping each program file at a baseline width of **80 half-width characters**.
- Past 80 characters, wrap at a natural break in the expression or at a bracket.
- A `// ------略-----` comment, however, is sized to 80 characters **including its leading indentation**.

## Typed comparison operators

- Comparisons against booleans and null are **always typed (`===` / `!==`)**.
- **The NOT operator `!` is forbidden.**

```php
$target = true;
if( $target === true )
{
    //  処理
}
```

```php
$target = false;

//  ↓ のような「!」は使わない
if( ! $target )
{
}

//  "===" で false チェックする。
//  場合によっては "!==" で true チェックとする。
//  "=== false" と "!== true" のどちらが適切かはロジックや文脈で異なる。
if( $target === false )
{
}
```

## The PHP closing tag

For now, **keep** the closing tag `?>` at the end of a file.
There is some overhead, but not enough to worry about, and making the end explicit against the start is considered better.

```php
<?php
～
?>
```

## The trailing newline

Not only in PHP: **every file ends with a newline**.
