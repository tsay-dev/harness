---
description: "📦 crow — コーディング規約（全層共通 / 独自 PHP フレームワーク）"
applyTo: "**/crow3_*/**"
---

# 📦 crow — コーディング規約（全層共通 / 独自 PHP フレームワーク）

> crow で新しいシステムを構築するための **最低限のコーディング規約**です。
> 進め方の基盤は develop の開発プロセス（反証駆動・縦断スライス）です。
> 目的：一貫した規約でコードを書くことで、後から担当する人の保守を容易にします。
>
> この文書は **PHP・JS・CSS・HTML のすべてに適用する共通の書式**を扱い、
> フロントエンド・バックエンドのどちらを書く場合にも適用します。層固有の差分は
> [frontend/coding.md](frontend-coding.instructions.md) とバックエンドの各規約（[coding.md](backend-coding.instructions.md) = 責務境界の核、[action.md](backend-action.instructions.md)、[model.md](backend-model.instructions.md)、[query.md](backend-query.instructions.md)）にあります。
> **共通規約を層別の規約へ複写しないでください**（SSOT はこの一か所です）。
>
> **コメントは日本語で書いてください。**

> **注：** 以下のコード例は構造（ブロックの並び方）を示します。実際のインデントは次の表に従い **TAB** を使います（例は読みやすさのために整形しています）。

## インデント

| 対象 | インデント |
| --- | --- |
| PHP | TAB |
| HTML | 半角スペース 1 個 |
| HTML 内の PHP | TAB |
| CSS | TAB |
| JS | TAB |
| SQL ファイル | TAB |

## 文字コードと改行

- **UTF-8**、改行は **LF**、**BOM なし**に統一します。

## ブロック配置

`{` と `}` を縦に揃えます（Allman スタイル）。

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

## 命名

- php / js / css の識別子は基本的にすべて **snake_case** とします。
- ただし、**メソッドの引数には末尾にアンダースコア `_` を付けます**。

```php
function test_func( $arg1_, $arg2_ )
{
    $local_val = "val";
    return $arg1_.$local_val.$arg2_;
}
```

## 命名（ローカル変数）

Web では、リクエストパラメーターとして受け取った内容を一時変数へ格納することがあります。
**リクエストパラメーター由来か、内部で生まれた値か**を判別できるよう、
変数名の先頭に **`i_`（input）**を付けます。

```php
function action_test()
{
    $i_name = crow_request::get("name");
    $i_age  = crow_request::get("age");

    if( check_value($i_name) === false ) return エラー;
}
```

## コードをコピー＆ペーストするとき

ブラウザーからコードをコピーすると、TAB の位置にスペースが貼り付く場合があります。
**貼り付け後は必ず書式を確認してください。**

## 制御構造

- 演算子の前後にスペースを入れます。
- `else if` を使います。

```php
if( $value=="abc" )
{
}
else if( $key == "0" && $value == "1" )
{
    //  演算子の前後でブランクをあける
}
```

`switch` の `case` ブロックはインデントします。`break` は内側・外側のどちらでも構いません。

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

## 文字列内の変数

文字列へ変数を直接埋め込まないでください（代わりに連結します）。

```php
$value = "123";

//  こうではなく、
$data = "値は、$value です";

//  こうする
$data = "値は、".$value." です";
```

目視での見落としを防ぐためです。エディターのハイライトによっては、文字列内の変数が文字列に溶け込み、見えにくくなります。

## 複数行にまたがる文

式が複数行になるとき、最後のセミコロン `;` は最終行に置かず、**独立した行**に置き、
直前の行のインデントに揃えます。

```php
$sql = model_xxx::sql_select_all()
    ->and_where("aa", "bb")
    ->and_where("cc", "dd")
    ;
```

後からの追加を容易にし、付け忘れを防ぎます。

## 複数行にまたがる関数呼び出し

引数が長くなって折り返す場合、`(` と `)` を縦に揃えます。

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

## 複数行にまたがる複雑な文

引数の区切りは行末のカンマ `,` とし、`{}` や `()` などのブロックは改行します。

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

## コメント

php / js のコード内コメントは **`//<TAB>コメント`** の形式にします。3 行以上になる場合は **`/* … */`** を使います。

### コメントの前に空行を入れる

コメントの前に空行を入れます。

```php
//  処理です
self::exec_func();

//  処理２です
self::exec_func2();
```

ただし、ブロックを開いた直後の行には空行は不要です。

```php
if( xxxxxx )
{
    //  ここは前に空行不要
    self::exec_func();
}
```

## 行幅と折り返し位置

- 各プログラムファイルは **半角 80 文字**を基準に折り返しを検討します。
- 80 文字を超えたら、式の自然な切れ目か括弧の位置で折り返します。
- ただし、`// ------略-----` のコメントは **先頭のインデントを含めて** 80 文字に揃えます。

## 型を含む比較演算子

- 真偽値と null の比較は **常に型を含めます（`===` / `!==`）**。
- **NOT 演算子 `!` は禁止です。**

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

## PHP の閉じタグ

当面、ファイル末尾の閉じタグ `?>` は **残します**。
多少のオーバーヘッドはありますが、気にするほどではなく、開始に対して終端を明示する方がよいと考えます。

```php
<?php
～
?>
```

## 末尾の改行

PHP に限らず、**すべてのファイルは改行で終わります**。
