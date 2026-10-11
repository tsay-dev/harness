---
description: "🧱 crow / frontend — コンポーネントの粒度と再利用"
applyTo: "**/crow3_*/app/viewparts/**,**/crow3_*/app/views/**,**/crow3_*/app/assets/css/**,**/crow3_*/app/assets/js/**"
---

# 🧱 crow / frontend — コンポーネントの粒度と再利用

パーツ群の分割と再利用。一つのパーツの書き方は [frontend-viewpart](frontend-viewpart.instructions.md)、状態と親子間の流れは [frontend-viewpart-dataflow](frontend-viewpart-dataflow.instructions.md)。到達状態は「同じ見た目が複数箇所で別々に定義されていない」こと。コメントとユーザー向けの文言は日本語で書く。

## 1. 層は責務、配置場所は共有範囲（独立した 2 軸）

| 層 | 責務 | 例 |
| --- | --- | --- |
| **ui**（最小部品） | これ以上分割しない見た目の最小単位。業務も通信も知らない | `ui_button` `ui_input` `ui_label` `ui_icon` |
| **parts**（複合部品） | ui パーツの再利用可能なまとまり。局所的な状態を持つが業務は知らない | `search_box` `pager` `modal` |
| **feature**（機能部品） | 業務を知るまとまり。契約に従った通信と `dbc` の操作をしてよい | `user_list` `order_form` |
| **scene / root**（画面） | ルーティングと組み立てだけ。見た目は下位層へ委譲する | `root` `scene_top` |

配置は層に関係なく、実際の利用範囲を覆う最も浅い階層。先回りして `_common_/` に置かない。

| 利用範囲 | 配置場所 |
| --- | --- |
| 1 つの action だけ | `[role]/[module]/[action]/` |
| 同じ module 内の複数 action | `[role]/[module]/_common_/` |
| 同じ role 内の複数 module | `[role]/_common_/` |
| 複数 role | `_common_/` |

フォルダ名が module 名になりパーツ名の接頭辞になる（`_common_/ui/button.php` → `ui_button`）。

| 層 | フォルダ / 命名 |
| --- | --- |
| **ui** | 必須: `ui/` 配下に置き、パーツ名に `ui_` を付ける（配置階層に関係なく） |
| **parts** | 推奨: `parts/` 配下。名前に業務の語彙を入れない |
| **feature** | 推奨: 機能が伝わる名前。`ui_` や見た目だけの名前にしない |
| **scene / root** | 推奨: `scene/` 配下、または `root` |

一方が他方の先頭に含まれるパーツ名（`ui_button` と `ui_button_group`）を作らない（`<style>` のスコープが部分一致）。

## 2. 依存は下向きの一方向

```
scene / root  ──▶  feature  ──▶  parts  ──▶  ui
```

上位層は下位層を使ってよく、下位層は上位層を知らない（`ui` が `[[user_list]]` を埋め込む、`parts` が feature のパーツ名を参照することは禁止）。同じ層内でも、明らかに下位の部品である場合以外は相互参照しない。下位層には、渡された値と渡されたクロージャ以外の外部依存を持たせない。

## 3. ui / parts は業務を知らない

`ui` と `parts` は次をすべて満たす: `dbc` を読み書きしない、グローバルの `g` を参照しない、通信（ajax）しない、`postup` を使わない（通知はクロージャ props で親へ返す）、props とクロージャ props だけで振る舞いが決まる。通信・`dbc`・業務上の判断が必要ならそれは feature 層であり、feature 側で包む。

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

未宣言の prop 名を `class=":name"` に書いてもバインドは成立せず、文字列がそのまま `class` 属性に残る（エラーも警告も出ない）。

## 4. props はその層の語彙で命名する

`ui` パーツの props は見た目の語彙（`label`、`variant`）で書き、業務の語彙（`user_name`、`is_admin`）を入れない。業務の語彙から見た目の語彙への変換（`[[ui_label label=:user_name]]`）は feature の責務。

## 5. 差分は複製せず props で受け取る

色やサイズの違いのためにファイルを複製しない（`button.php` / `button_red.php` / `button_small.php`）。`[[ui_button label="削除" variant="danger" size="small"]]` のように 1 ファイルで見た目の差を props で受け、class に反映して `<style>` に決めさせる。

## 6. 2 箇所目で共通化する

- 1 箇所でしか使わない間は切り出さず、使う場所に置く。2 箇所目が現れた時点で切り出し、コピーで作らない。新しい見た目を書く前に `app/viewparts/` 配下の `ui_` で始まるパーツ名を検索する。
- 共有範囲が広がったら配置を 1 階層上げる（層は変わらない）。走査順で後に見つかった同名パーツが先のものを上書きするため、上位階層へ移したら下位階層に残った同名ファイルを必ず削除する。

## 7. CSS の重複を作らない

- 2 つのパーツの `<style>` に同じ見た目の規則を書かない。重複している見た目は ui パーツである。
- 色・間隔・文字サイズなどのトークンは `app/assets/css/` 側の変数に置き、各パーツの `<style>` から参照する（解決順は `[role]/` → `[role]/_common_/` → `_common_/` → `engine/assets/css/`）。パーツの `<style>` に色の実値を埋め込まず、トークンがなければ先に追加する。
- レイアウト（配置・間隔）は利用側が持ち、ui パーツ自身に外側の `margin` を持たせない。
- `<style>` の宣言は自身のルート class の下に閉じる（[frontend-viewpart](frontend-viewpart.instructions.md) §7）。

## 8. scene / root は組み立てだけを持つ

`scene` の `<template>` は feature と parts を並べるだけ、`<style>` はレイアウト（グリッド・領域の分割）だけ。`<method>` に業務ロジックが蓄積したら feature パーツを切り出す。

## 9. バックエンドとの境界

サーバ側の正本は [backend-coding](backend-coding.instructions.md) §1.1、[backend-action](backend-action.instructions.md)、[backend-model](backend-model.instructions.md) §3.11。

| 関心事 | 担当 |
| --- | --- |
| 業務上の判断（権限、状態による制限、保存可否、競合） | サーバ（model が意味、action が流れ）。FE だけの制御は回避できるため正本にしない |
| UX のための事前確認（空欄、二重クリック防止、確認ダイアログ） | feature。最終判断は常にサーバ |
| 契約レスポンスの組み立て（`exit_ok` のペイロードの形） | action |
| 契約に載る共有表示ラベル・表示名 | サーバ（presenter → 契約）。FE は導出し直さず表示する |
| 画面固有の表現・画面内の並べ方 | feature / scene。契約上の一覧行順の正本はサーバ（SQL）で、FE はその順序を壊さない |
| 契約に従った通信、リクエスト本文の組み立て、`dbc` への反映 | feature。ui / parts は props 経由で値を上げるだけで契約キーを知らない |
| `exit_ng` などのエラー文言 | サーバを正本とし、feature がそのまま提示する。言い換えや握りつぶしをしない |

```
scene / root  ──条件付き──▶  feature  ──禁止──▶  parts  ──▶  ui
```

`scene` / `root` が ajax をしてよいのは、まだ feature がなく組み立てだけで足りる薄い画面、または root が全体として持つ横断的な状態の初回取得だけ。業務の一覧や更新は feature に切り出す。発行前のゲート、世代管理、成功時の反映は [frontend-viewpart-dataflow](frontend-viewpart-dataflow.instructions.md) §5。
