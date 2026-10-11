---
description: "🎨 crow / フロントエンド — コーディング規約（表層固有の差分）"
applyTo: "**/crow3_*/app/viewparts/**,**/crow3_*/app/views/**,**/crow3_*/app/assets/css/**,**/crow3_*/app/assets/js/**"
---

# 🎨 crow / フロントエンド — コーディング規約（表層固有の差分）

[common-coding](common-coding.instructions.md) に従ったうえで、view（HTML + 埋め込み PHP）、CSS、JS に適用する差分。viewpart 固有の事項は [frontend-viewpart](frontend-viewpart.instructions.md) / [frontend-viewpart-dataflow](frontend-viewpart-dataflow.instructions.md) / [frontend-viewpart-components](frontend-viewpart-components.instructions.md)。コメントは日本語で書く。

## HTML

- HTML 内のコメントは `<!-- … -->` でなく PHP コメント `<?php /**** … ****/ ?>` を使う（HTML コメントはクライアントへ出力される）。
- HTML タグの途中では折り返さない。80 文字を超えてもタグは一つの単位とする。
- CSS のトークン、重複の禁止、`<style>` のスコープは [frontend-viewpart-components](frontend-viewpart-components.instructions.md) §7 が正。

## JavaScript

- `var` は使わない。`let` / `const` を使い、再代入しない値は `const`。
- 文字列リテラルはダブルクォート `"..."` を既定とし、テンプレートリテラルは改行や式の埋め込みが必要な場合だけ。
- 配列・オブジェクトの最後の要素の行末にもカンマを付ける。

```javascript
let obj =
{
	key1 : "value1",
	key2 : "value2",
};
```

- 比較は対象を限定せず常に `===` / `!==`（JS の `==` は `"0" == 0`、`null == undefined` を成立させる）。`!` の禁止は JS にも適用する。
