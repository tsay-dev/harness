---
description: "🧩 crow / フロントエンド — viewpart の書き方"
applyTo: "**/crow3_*/app/viewparts/**,**/crow3_*/app/views/**,**/crow3_*/app/assets/css/**,**/crow3_*/app/assets/js/**"
---

# 🧩 crow / フロントエンド — viewpart の書き方

> 共通の書式は [common/coding.md](common-coding.instructions.md)、表層固有の差分は [coding.md](frontend-coding.instructions.md) に従います。
> この文書は **viewpart（`app/viewparts/**/*.php`）を記述するための構造規約**を定義します。
> データフロー・宣言的な書き方・親子関係は [viewpart-dataflow.md](frontend-viewpart-dataflow.instructions.md)、
> 粒度・再利用は [viewpart-components.md](frontend-viewpart-components.instructions.md) が扱います。
>
> **コメントとユーザー向けの文言は日本語で書いてください。**

---

## 1. part ファイルの骨格

一つの part = 一ファイルです。section タグで区切る crow 独自 DSL です。

**section タグは必ず独立した行に書きます。** parser が境界として扱うのは、インデントを取り除いて `<props>` などと完全一致する行だけです。
そのためインラインに書くと、**エラーにならず本文として黙って無視されます**（静かな事故）。

使う section は九つです。**それ以外は使わないでください。**

| section | 用途 |
| --- | --- |
| `<props>` | プロパティ定義（初期値）。**リアクティブ** |
| `<template>` | HTML。直下の要素はちょうど一つ |
| `<style>` | part 名でスコープを付けた ICSS（§7 の注意事項あり） |
| `<init>` | mount 時。part 自身の DOM は存在するが、まだ document に接続されていない |
| `<ready>` | document 接続後。イベント接続と初回描画はここ |
| `<watch>` | プロパティ変更のハンドラー |
| `<method>` | part のメソッド |
| `<recv>` | メッセージ受信ハンドラー（横断的な通知だけ） |
| `<depends>` | 依存する part の明示宣言（先読みの対象） |

**part ファイル内にテストを書かないでください。** harness では FE ユニットテストを作成しません。画面は UC のシナリオテスト（[system-testing.md](system-testing.instructions.md)）で端から端まで観察します。要素は用語集の文言と `data-testid="<operation>"` / `"<operation>.<field>"` で見つけます。契約 operation を発火するすべての操作要素と、すべての request 入力にそれらを出力し、表示文言を id へコピーしないでください（ADR-0037）。

### section の順序を固定する

上の表の順序で記述します。既存の part はすべてのファイルでこの順序と同じ罫線コメントに統一されているため、それを踏襲します。
**使わない section も空のまま残します**（後から追加する場所を常に同じにするため）。

```php
/*

	パーツの説明をここに書く（セクション外の行は捨てられるので自由に書ける）

*/
//------------------------------------------------------------------------------
//	プロパティ
//------------------------------------------------------------------------------
<props>
{
}
</props>

//------------------------------------------------------------------------------
//	HTML パーツ
//------------------------------------------------------------------------------
<template>
 <div class="xxx">
 </div>
</template>
```

### PHP を使える

ファイルは `eval("?>".file_get_contents())` を通して実行されます。サーバー側の値を埋め込みたい場合、PHP を使って構いません。
ただし、**埋め込む値はビルド時に確定します**（part は role/module/action/lang ごとにキャッシュされます）。
リクエストごとに変化する値を埋め込まないでください。

---

## 2. 配置と命名

part は次の四階層を **この順序で**探索して集め、**後の階層にある同名 part が前のものを上書きします**。

1. `app/viewparts/_common_`
2. `app/viewparts/[role]/_common_`
3. `app/viewparts/[role]/[module]/_common_`
4. `app/viewparts/[role]/[module]/[action]`

**共有範囲で配置を決めます。** 配置は [viewpart-components.md](frontend-viewpart-components.instructions.md) **§1** を正とし、
共通として切り出す判断は同文書の **§6** に従います。

### part 名はフォルダー構造から機械的に決まる

サブフォルダーが module となり、アンダースコアで連結して part 名を決めます。

| ファイル | module 名 | part 名 |
| --- | --- | --- |
| `_common_/footer.php` | なし | `footer` |
| `_common_/scene/top/_.php` | `scene_top` | `scene_top`（`_.php` はフォルダー名自体） |
| `_common_/scene/top/child.php` | `scene_top` | `scene_top_child` |

**ファイル名が module 名に前方一致すると、part 名を module 名まで縮める**分岐があります。
意図せず衝突するため、**module 名の一部と同じ名前をファイルに付けないでください**。

> **part 名の前方一致にも注意してください。** `<style>` のスコープは部分一致です（§7）。
> `ui_button` と `ui_button_group` のように **一方が他方の先頭に含まれる**名前を作ると、CSS が混ざります。

同じ module 内での埋め込みは module 名を省略できます（`[[child]]` = `[[scene_top_child]]`）。
一方、`viewpart_create()` に渡す名前では省略できないため、**子は `create_child*` 系で作成します**（こちらでは省略可能）。

### pref（子のハンドル）の付け方

`pref` を省略すると、「part 名から module 名の部分を取り除いたもの」が自動で付与されます。

| 状況 | pref の付け方 |
| --- | --- |
| **同じ part を個別に取得したい** | `[[child pref="left"]]` のように **それぞれ別名**を付ける。同名だと `pref()` は先頭だけを返す |
| **一覧としてまとめて扱いたい** | **全行に同じ pref** を付ける。`prefs()` で全部取得、`remove_pref()` で全部削除 |

一覧の描画は後者の正しい用途です（[viewpart-dataflow.md](frontend-viewpart-dataflow.instructions.md) §4）。

---

## 3. ライフサイクル

```
constructor        props を確定（<props> の既定値 ← args_ で上書き）
                   <method> を instance に直接付与
                   <template> を複製し、part 自身の DOM 部分木を構築
                   refs に uid を付与し、「:」属性を binding
       ↓
埋め込みの子       [[…]] の子 part を生成・mount（= 子の <init> はここで実行）
       ↓
mount              watch 開始 → <init> 本文
       ↓
document 接続      <ready>
```

**二つの順序を把握しておく必要があります。**

- **`<init>` は mount 時に実行されます**。構築直後ではありません。また、**template に埋め込んだ子は親の `<init>` より先に生成・初期化されます**
- **watch は `<init>` 本文より先に始まります。** 「init 完了後に watch が動き始める」のではありません

### `<init>` 時点で DOM は「存在する」が「未接続」

constructor が既に `<template>` を複製しているため、**`<init>` から `self.ref()` / `self.jq()` を使えます**。
足りないのは document への接続だけです。したがって `<init>` で動かないのは **接続を前提とする操作**に限られます。

- 要素のサイズ・位置の取得（`offsetWidth`、`getBoundingClientRect()` など）
- `focus()` とスクロール操作
- `window` を基準とする計算

これらは `<ready>` で行います。

### 各 section の責務

| section | 書いてよいもの | 書かないもの |
| --- | --- | --- |
| `<init>` | 内部状態（`self.v`）の初期化、クロージャー props の代入、グローバルイベントの登録 | サイズ取得・`focus()` など document 接続を前提とする操作 |
| `<ready>` | イベント接続、**初回描画の開始**、接続後だけ可能な操作 | 長い処理ロジック（`<method>` へ切り出す） |
| `<watch>` | 状態変化に応じた再描画の呼び出し | DOM の直接組み立て |
| `<method>` | part の振る舞い | — |
| `<recv>` | 横断的に受信したメッセージの処理 | — |

### 原則 `watch_stop()` を使わない

`watch_stop()` は `<watch>` だけを止めません。**`{{ }}` のテキスト更新と、親→子の `:` binding 伝播も同時に停止します。**
さらに `watch_start()` で再開しても、**停止中の変更は再実行されません**。

`<init>` 時点で part 自身の DOM は存在するため、「DOM がまだできていないので止める」という理由は成立しません。
本当に必要な場合だけ使い、**必ず `<ready>` で復帰し、`update_all()` で取りこぼした更新を回収します**。

---

## 4. 状態を props と `self.v` に分ける

| 配置先 | 性質 | 置くもの |
| --- | --- | --- |
| `<props>` のプロパティ | **リアクティブ**。変更すると binding と watch が発火 | 画面に出る値、親から受け取る値、クロージャー props |
| `self.v`（`<init>` で初期化） | **非リアクティブ**。内部制御用 | 画面に出ない制御データ：スタック、フラグ、ハンドラー参照 |

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

### 使う prop はすべて `<props>` に宣言する

**`prop()` は `<props>` にない名前を黙って無視します。** 例外も warning もありません。

```php
//	<props> に "conut" は無い（typo）→ 代入は何も起きず、読むと null が返る
self.prop('conut', 3);
```

props は後から追加できないため、**親から受け取る値・クロージャー props を含め、使うものはすべて `<props>` に書きます**。

### `<props>` 内に `self` はない

生成 JS は `props: function(){ return {...}; }` で、**props にだけは `let self = this;` が注入されません**
（init / ready / watch / method / recv には注入されます）。

ブラウザーの `self` はグローバルオブジェクトを指すため、**エラーを出さずに壊れます**。
`self.prop(...)` の呼び出しは例外になりますが、`self.v = {...}` などの代入は **黙って通り、グローバルを汚染します**。
`<props>` には静的な値だけを書き、動的な値は `<init>` 以降で入れます。

---

## 5. DOM の生成と操作

### DOM を生成してよいのは `<template>` だけ

**JS から DOM を組み立てないでください。** 新しい要素が必要なら、それは「一つの viewpart」です。

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

以下は禁止です。**例外はありません。**

- `$('<tag>…</tag>')` / `document.createElement()` / `cloneNode()` による要素生成
- **文字列から DOM を構築する**すべての経路：`.html()` / `.innerHTML` / `.append("<div>…")` など
- `.text()` / `.attr()` / `.addClass()` / `.css()` による表示内容の書き換え
  → props binding で表示を変更します（[viewpart-dataflow.md](frontend-viewpart-dataflow.instructions.md)）

理由は三つです。**①** 外観が `<template>` と JS に分裂し、画面を変えるための修正箇所が読み取れなくなります。
**②** JS で生成した要素には `<style>` のスコープ属性が付かず、CSS の所属先も分裂します。
**③** 文字列連結による構築は XSS の温床です。

### jQuery は「既存要素の操作」だけに使う

| 用途 | 許可するか | 代わりに使うもの |
| --- | --- | --- |
| イベント接続（`.on()`） | ✅ | — |
| `focus()`・スクロールなどの命令的操作 | ✅ | — |
| 要素の生成・追加・置換 | ❌ | viewpart として切り出す |
| テキスト・属性・class・style の変更 | ❌ | props binding（`{{ }}` / `attr=":prop"`） |

### 要素は必ず `self` 経由で取得する

`ref="btn"` は instance 構築時に `ref="btn<uid>"` に書き換えられます（同じ part の複数 instance が衝突しないため）。
そのため **`document.querySelector('[ref=btn]')` とグローバルの `$('[ref=btn]')` は動きません。**

- 要素の取得には **`self.ref()` / `self.refs()` / `self.jq()` だけ**を使います
- part の外の DOM に直接触れないでください。他の part の内部を書き換えないでください（その part の責務です）

### `<template>` 直下の要素はちょうど一つ

複数書くと warning が出て constructor が中断され、**初期化が途中で止まった instance がそのまま画面に出ます**
（何も表示されないとは限らず、壊れた部分描画が表示されます）。複数を横に並べたい場合は、ラッパー要素で包みます。

---

## 6. 生成と破棄

### 生成：遅延読み込みの非同期性

part は既定で遅延読み込みされます。**`create_child*` / `create_children*` は未読み込みの場合 `null` を返し、
実際の instance は後から `on_load_` コールバックへ届きます。**

戻り値に依存するコードは「たまたま読み込み済みのときだけ動く」時限爆弾です。

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

生成直後に何かしたい場合は、**生成時にすべてを `args_` で渡すのが最も安全**です。
それが不可能な場合だけ、コールバックまたは `on_preready()` / `on_ready()` を使います。

### 破棄：`on_remove()` に後処理を登録する

破棄用の section はありません。part が画面から消える際の処理は **`<init>` または `<ready>` で `on_remove()` に登録します**。

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

後処理が必要なのは **自分の外側に登録したものだけ**です。具体的には次の二つです。

- `window` / `document` のイベントリスナー
- `setInterval` / `setTimeout` のタイマー

自分の part の要素に `self.jq(...).on()` で付けたハンドラーは要素とともに消えるため、解除は不要です。
`dbc.bind()` も `on_remove` で自動解放されるため、通常、明示的な `unbind` は不要です
（消える前に早期解除したい場合だけ書きます）。

---

## 7. スタイル

`<style>` は配信前に `[viewpart*=":part name"] { … }` の形で包まれます。

### スコープは「部分一致」であり、完全な隔離ではない

セレクターが `*=`（部分一致）であるため、**自分の名前を接頭辞として含む別の part にも当たります**。
さらに **子の mount 先となる親側の要素にも子の part 名が付きます**。そのため、
子の `<style>` のトップレベル宣言が **親のコンテナ要素自体**にも当たる場合があります。

「スコープ付きなので何でもよい」と考えず、以下を守ってください。

- **`<style>` の宣言は必ず自分のルート要素のクラス配下に書きます。** トップレベルに素の宣言を置かないでください

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

- **前方一致する part 名を作らないでください**（§2）。`ui_button` があるなら、`ui_button_group` でなく `ui_buttons` と名付けます
- **セレクターを part の外へ広げないでください。** `<style>` から `body` や他の part のクラスを狙わないでください
- 共有したい変数・mixin は `app/assets/css/` 側へ置きます
  （`[role]/` → `[role]/_common_/` → `_common_/` → `engine/assets/css/` の順で解決）

---

## ✅ part の記述後に確認すること

- [ ] すべての section タグは独立した行か？
- [ ] `<template>` 直下の要素はちょうど一つか？
- [ ] 使う prop はすべて `<props>` に宣言されているか？（`prop()` の typo は黙って消える）
- [ ] `<props>` 内に `self` を書いていないか？
- [ ] `<init>` 内でサイズ取得・`focus()` など document 接続を前提とする操作をしていないか？
- [ ] 初回描画は `<ready>` から開始しているか？
- [ ] `watch_stop()` を気軽に使っていないか？（使うなら `<ready>` で復帰し、取りこぼした更新を回収したか？）
- [ ] DOM アクセスは `self.ref()` / `refs()` / `jq()` だけか？
- [ ] JS から DOM を生成していないか？（`$('<tag>')` / `createElement` / `.html()` / 文字列連結）
- [ ] jQuery の用途はイベント接続と命令的操作に限定しているか？
- [ ] `create_child*` の戻り値を直接使っていないか？
- [ ] pref の付け方は用途（個別取得 / まとめて扱う）に合っているか？
- [ ] `window` / `document` のリスナーとタイマーを `on_remove()` で解除しているか？
- [ ] 画面に出ない制御データを props に入れていないか？
- [ ] `<style>` の宣言は自分のルートクラスの配下で完結しているか？
- [ ] 前方一致する part 名を作っていないか？
