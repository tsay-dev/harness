---
description: "🧩 crow / フロントエンド — viewpart の書き方"
applyTo: "**/crow3_*/app/viewparts/**,**/crow3_*/app/views/**,**/crow3_*/app/assets/css/**,**/crow3_*/app/assets/js/**"
---

# 🧩 crow / フロントエンド — viewpart の書き方

viewpart（`app/viewparts/**/*.php`）一つの構造規約。データフローと親子関係は [frontend-viewpart-dataflow](frontend-viewpart-dataflow.instructions.md)、粒度と再利用は [frontend-viewpart-components](frontend-viewpart-components.instructions.md)。コメントとユーザー向けの文言は日本語で書く。

## 1. part ファイルの骨格

一つの part = 一ファイル。section タグで区切る crow 独自 DSL で、section は次の九つだけ。この順序で記述し、使わない section も空のまま残す。

| section | 用途 |
| --- | --- |
| `<props>` | プロパティ定義（初期値）。リアクティブ |
| `<template>` | HTML。直下の要素はちょうど一つ |
| `<style>` | part 名でスコープを付けた ICSS（§7） |
| `<init>` | mount 時。part 自身の DOM は存在するが、まだ document に接続されていない |
| `<ready>` | document 接続後。イベント接続と初回描画はここ |
| `<watch>` | プロパティ変更のハンドラー |
| `<method>` | part のメソッド |
| `<recv>` | メッセージ受信ハンドラー（横断的な通知だけ） |
| `<depends>` | 依存する part の明示宣言（先読みの対象） |

- section タグは独立した行に書く。parser が境界として扱うのは、インデントを除いて `<props>` などと完全一致する行だけで、インラインに書くとエラーにならず本文として黙って無視される。
- section 外の行は捨てられる（ファイル冒頭の説明コメントに使える）。既存 part と同じ罫線コメントで区切る。

```php
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

- ファイルは `eval("?>".file_get_contents())` で実行されるため PHP を使えるが、埋め込む値はビルド時に確定し、part は role / module / action / lang ごとにキャッシュされる。リクエストごとに変化する値を埋め込まない。
- part ファイル内にテストを書かない。画面は UC のシナリオテスト（[system-testing](system-testing.instructions.md)）が観察する。契約 operation を発火するすべての操作要素とすべての request 入力に `data-testid="<operation>"` / `"<operation>.<field>"` を出力し、表示文言を id へコピーしない（ADR-0037）。

## 2. 配置と命名

part は次の四階層をこの順序で探索して集め、後の階層にある同名 part が前のものを上書きする。配置の判断は [frontend-viewpart-components](frontend-viewpart-components.instructions.md) §1。

1. `app/viewparts/_common_`
2. `app/viewparts/[role]/_common_`
3. `app/viewparts/[role]/[module]/_common_`
4. `app/viewparts/[role]/[module]/[action]`

part 名はフォルダー構造から決まる。サブフォルダーが module となり、アンダースコアで連結する。

| ファイル | module 名 | part 名 |
| --- | --- | --- |
| `_common_/footer.php` | なし | `footer` |
| `_common_/scene/top/_.php` | `scene_top` | `scene_top`（`_.php` はフォルダー名自体） |
| `_common_/scene/top/child.php` | `scene_top` | `scene_top_child` |

- ファイル名が module 名に前方一致すると part 名を module 名まで縮める分岐があるため、module 名の一部と同じ名前をファイルに付けない。
- 一方が他方の先頭に含まれる part 名（`ui_button` と `ui_button_group`）を作らない。`<style>` のスコープが部分一致のため CSS が混ざる（`ui_buttons` などにする）。
- 同じ module 内の埋め込みは module 名を省略できる（`[[child]]` = `[[scene_top_child]]`）。`viewpart_create()` に渡す名前では省略できないため、子は `create_child*` 系で作成する（こちらは省略可）。
- `pref` を省略すると「part 名から module 名の部分を取り除いたもの」が付く。同じ part を個別に取得するなら `[[child pref="left"]]` のようにそれぞれ別名を付ける（同名だと `pref()` は先頭だけを返す）。一覧としてまとめて扱うなら全行に同じ pref を付け、`prefs()` で全部取得、`remove_pref()` で全部削除する。

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

- template に埋め込んだ子は親の `<init>` より先に生成・初期化される。watch は `<init>` 本文より先に始まる。
- `<init>` 時点で part 自身の DOM は存在し `self.ref()` / `self.jq()` を使えるが、document に未接続。要素のサイズ・位置の取得（`offsetWidth`、`getBoundingClientRect()`）、`focus()`、スクロール、`window` 基準の計算は `<ready>` で行う。

| section | 書くもの | 書かないもの |
| --- | --- | --- |
| `<init>` | 内部状態（`self.v`）の初期化、クロージャー props の代入、グローバルイベントの登録 | document 接続を前提とする操作 |
| `<ready>` | イベント接続、初回描画の開始、接続後だけ可能な操作 | 長い処理ロジック（`<method>` へ） |
| `<watch>` | 状態変化に応じた再描画の呼び出し | DOM の直接組み立て |
| `<recv>` | 横断的に受信したメッセージの処理 | — |

- `watch_stop()` は `<watch>` だけでなく `{{ }}` のテキスト更新と親→子の `:` binding 伝播も停止し、`watch_start()` で再開しても停止中の変更は再実行されない。原則使わず、使う場合は `<ready>` で復帰し `update_all()` で取りこぼした更新を回収する。

## 4. 状態は props と `self.v` に分ける

| 配置先 | 性質 | 置くもの |
| --- | --- | --- |
| `<props>` のプロパティ | リアクティブ。変更すると binding と watch が発火 | 画面に出る値、親から受け取る値、クロージャー props |
| `self.v`（`<init>` で初期化） | 非リアクティブ | 画面に出ない制御データ: スタック、フラグ、ハンドラー参照 |

- `prop()` は `<props>` にない名前を例外も warning もなく黙って無視し、読むと null を返す。props は後から追加できないため、親から受け取る値・クロージャー props を含め、使うものはすべて `<props>` に宣言する。
- `<props>` にだけは `let self = this;` が注入されない（`props: function(){ return {...}; }` として生成される）。`<props>` 内の `self` はブラウザーのグローバルを指し、`self.v = {...}` などの代入はエラーなくグローバルを汚染する。`<props>` には静的な値だけを書く。

## 5. DOM の生成と操作

- DOM を生成してよいのは `<template>` だけ。JS から DOM を組み立てない: `$('<tag>…</tag>')` / `document.createElement()` / `cloneNode()`、文字列から DOM を構築する `.html()` / `.innerHTML` / `.append("<div>…")`、`.text()` / `.attr()` / `.addClass()` / `.css()` による表示内容の書き換え。新しい要素が必要なら一つの viewpart として切り出し、表示変更は props binding で行う。JS で生成した要素には `<style>` のスコープ属性が付かない。

```php
//	NG
self.jq('list').html(rows_html);

//	OK: パーツとして切り出し、子として作る
self.create_children_and_append("row", rows, "list");
```

- jQuery はイベント接続（`.on()`）と `focus()`・スクロールなどの命令的操作だけに使う。
- `ref="btn"` は instance 構築時に `ref="btn<uid>"` へ書き換えられるため、`document.querySelector('[ref=btn]')` やグローバルの `$('[ref=btn]')` は動かない。要素の取得は `self.ref()` / `self.refs()` / `self.jq()` だけ。part の外の DOM や他の part の内部に触れない。
- `<template>` 直下の要素が複数あると warning が出て constructor が中断され、初期化が途中で止まった instance が壊れた部分描画として画面に出る。複数並べるならラッパー要素で包む。

## 6. 生成と破棄

- part は既定で遅延読み込みされる。`create_child*` / `create_children*` は未読み込みの場合 `null` を返し、実際の instance は後から `on_load_` コールバックへ届く。戻り値に依存せず、生成時に必要な値をすべて `args_` で渡す。それが不可能な場合だけコールバックまたは `on_preready()` / `on_ready()` を使う。

```php
self.create_child_and_append("row", {id : 1}, null, null, function(child_)
{
	if( child_ === null ) return;
	child_.prop("name", "abc");
});
```

- 破棄用の section はない。`window` / `document` のイベントリスナーと `setInterval` / `setTimeout` は `<init>` または `<ready>` で `self.on_remove(function(part_){ ... })` に解除を登録する。自分の要素に `self.jq(...).on()` で付けたハンドラーと `dbc.bind()` は自動で解放される。

## 7. スタイル

`<style>` は配信前に `[viewpart*=":part name"] { … }` の形で包まれる。セレクターが `*=`（部分一致）のため自分の名前を接頭辞として含む別の part にも当たり、子の mount 先となる親側の要素にも子の part 名が付くため、トップレベルの宣言は親のコンテナ要素にも当たる。

- `<style>` の宣言は必ず自分のルート要素のクラス配下に書き、トップレベルに素の宣言を置かない。

```css
.row
{
	padding : 10px;

	> .label { color : #333; }
}
```

- セレクターを part の外へ広げない（`body` や他の part のクラスを狙わない）。
- 共有する変数・mixin は `app/assets/css/` 側に置く（`[role]/` → `[role]/_common_/` → `_common_/` → `engine/assets/css/` の順で解決）。
