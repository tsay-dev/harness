---
description: "🎨 crow / フロントエンド — コーディング規約（表層固有の差分）"
applyTo: "**/crow3_*/app/viewparts/**,**/crow3_*/app/views/**,**/crow3_*/app/assets/css/**,**/crow3_*/app/assets/js/**"
---

# 🎨 crow / フロントエンド — コーディング規約（表層固有の差分）

> **共通の書式は [common/coding.md](common-coding.instructions.md) に従います**（インデント表、Allman、snake_case、
> `i_` 接頭辞、`===` / `!` の禁止、`//<TAB>` コメント、80 桁、PHP の閉じタグ、末尾改行）。
> この文書は **その規約に従ったうえで**、表層（HTML / CSS / JS）に適用する差分だけを定義します。
> 共通規約は再記載しません。
>
> crow の view（HTML + 埋め込み PHP）、CSS、JS を作成・修正するときに適用します。
> **Viewpart 固有の事項**（section DSL、binding、親子、dbc/ajax）は
> [viewpart.md](frontend-viewpart.instructions.md) / [viewpart-dataflow.md](frontend-viewpart-dataflow.instructions.md) /
> [viewpart-components.md](frontend-viewpart-components.instructions.md) を正とします。ここへ複写しないでください。
>
> **コメントは日本語で書いてください。**

## HTML 内のコメント

HTML 内では **`<!-- … -->` を使わず**、PHP コメントを使ってください。
HTML コメントはそのままクライアントへ出力されるためです。

```php
<!-- こうではなくて -->
<div></div>

<?php /**** こうする ****/ ?>
<div></div>
```

## 折り返しの例外（HTML）

[common/coding.md](common-coding.instructions.md) の「半角 80 文字を基準に折り返す」に従いますが、
**HTML タグの途中では折り返さないでください**。80 文字を超えてもタグは一つの単位として扱います。

## CSS

トークン、重複の禁止、`<style>` のスコープは
[viewpart-components.md](frontend-viewpart-components.instructions.md) §7 を正とします。
この文書では再記載しません。「part の `<style>` に生の色をハードコードしない」も同節にあります。

## JavaScript の変数宣言

**`var` は使わないでください。** `let` / `const` を使います。再代入しない値は `const` とします。

```javascript
//  NG
var count = 0;

//  OK
let count = 0;
const max_page = 10;
```

## JavaScript の文字列

文字列リテラルは **ダブルクォート `"..."` を既定**とします
（既存コードと PHP 側の慣例に合わせます）。テンプレートリテラル `` `...` `` は
改行や式の埋め込みが必要な場合だけ使います。

## JavaScript の配列・オブジェクトの末尾カンマ

JavaScript の配列とオブジェクトでは、**最後の要素の行末にもカンマを付けます**（2024/12/23）。

```javascript
let obj =
{
	key1 : "value1",
	key2 : "value2",
};
```

## JavaScript の比較はすべて型を含む

common/coding.md は真偽値と null の比較に型を含めることを定義していますが、
**JavaScript では対象を限定せず、常に `===` / `!==` を使います。**

PHP と異なり、JS の `==` は文字列と数値、`null` と `undefined` の間で型変換するため、
`"0" == 0` と `null == undefined` はどちらも成立します。比較対象によらず型を含む比較を使ってください。

```javascript
//  NG
if( id == "1" )

//  OK
if( id === "1" )
```

common/coding.md の `!` 禁止は JS にも適用します（`=== false` / `!== true` と書きます）。
