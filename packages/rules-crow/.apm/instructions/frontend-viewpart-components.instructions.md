---
description: "🧱 crow / frontend — コンポーネントの粒度と再利用"
applyTo: "**/crow3_*/app/viewparts/**,**/crow3_*/app/views/**,**/crow3_*/app/assets/css/**,**/crow3_*/app/assets/js/**"
---

# 🧱 crow / frontend — コンポーネントの粒度と再利用

> 1つのパーツの書き方は [viewpart.md](frontend-viewpart.instructions.md)、状態と親子間の流れは [viewpart-dataflow.md](frontend-viewpart-dataflow.instructions.md) を参照する。
> 本書では、**パーツ群をどう分割し、どう再利用するか**を定める。
>
> 目指すのは、「同じ見た目が複数箇所で別々に定義されている」状態を作らないこと——
> ボタンの角丸を変えるために7ファイルを直すような保守コストを、最初から生じさせないこと。
>
> **コメントとユーザー向けの文言は日本語で書く。**

---

## 1. 層は責務、配置場所は共有範囲（独立した2つの軸）

**層（何を知ってよいか）と配置場所（どこまで共有するか）を混同しない。**
層は責務で決め、配置場所は「現時点で何箇所から使われているか」で決める。
`ui` 層のパーツでも、1画面でしか使われない間は action 配下に置いてよい。

### 層 = 責務

| 層 | 責務 | 例（パーツ名） |
| --- | --- | --- |
| **ui**（最小部品） | これ以上分割しない、見た目の最小単位。業務も通信も知らない | `ui_button` `ui_input` `ui_label` `ui_icon` |
| **parts**（複合部品） | ui パーツの再利用可能なまとまり。局所的な状態を持つが業務は知らない | `search_box` `pager` `modal` |
| **feature**（機能部品） | 業務を知るまとまり。契約に従った通信と `dbc` の操作をしてよい | `user_list` `order_form` |
| **scene / root**（画面） | ルーティングと組み立てだけ。見た目は下位層へ委譲する | `root` `scene_top` |

### 配置場所 = 共有範囲

crow は4階層を順に走査してパーツを収集するため、**配置の深さがそのまま共有範囲になる**。
層に関係なく、**実際の利用範囲を覆う最も浅い階層**に置く。

| 利用範囲 | 配置場所 |
| --- | --- |
| 1つの action だけ | `[role]/[module]/[action]/` |
| 同じ module 内の複数 action | `[role]/[module]/_common_/` |
| 同じ role 内の複数 module | `[role]/_common_/` |
| 複数 role | `_common_/` |

`ui` が `_common_/ui/`、`feature` が `[role]/[module]/_common_/` に置かれることが多いのは
**結果**であって規則ではない。role 全体から使う `feature` は `[role]/_common_/` に置いてよい。

### 層は名前で示す

フォルダ名は module 名になり、パーツ名の接頭辞になる
（`_common_/ui/button.php` → パーツ名 `ui_button`）。
これにより、名前から層を、配置場所から共有範囲を読み取れる。

| 層 | フォルダ / 命名（推奨。ui だけは必須） |
| --- | --- |
| **ui** | **必須:** `ui/` 配下に置き、パーツ名に `ui_` を付ける（配置階層に関係なく） |
| **parts** | 推奨: `parts/` 配下に置く。名前に業務の語彙を入れない（`search_box`、`pager`） |
| **feature** | 推奨: 機能が伝わる名前（`user_list`、`order_form`）。`ui_` や見た目だけの名前にしない |
| **scene / root** | 推奨: `scene/` 配下、または `root`。名前から組み立ての役割が明確に分かるようにする |

> **接頭辞が一致するパーツ名を作らない。** `<style>` のスコープは部分一致
> （[viewpart.md](frontend-viewpart.instructions.md) §7）なので、`ui_button` と `ui_button_group` を並べると CSS が混ざる。
> 後者は `ui_buttons` など、**一方が他方の先頭に含まれない名前**にする。

---

## 2. 依存は下向きの一方向

```
scene / root  ──▶  feature  ──▶  parts  ──▶  ui
```

- **上位層は下位層を使ってよい。下位層は上位層を知らない。**
  `ui` パーツが `[[user_list]]` を埋め込むことも、`parts` が feature のパーツ名を参照することも禁止する
- **同じ層の中でも相互参照を避ける。** `ui_a` が `ui_b` を埋め込んでよいのは、`ui_b` が明らかに下位の部品である場合だけ
- 下位層には、「渡された値と渡されたクロージャ」以外の外部依存を持たせない

この方向を守る限り、**ui と parts はどの画面にも貼り付けられる**。方向を破った瞬間に、再利用性が失われる。

---

## 3. 再利用できるかの判定基準は「業務を知らないこと」

`ui` と `parts` は、以下をすべて満たさなければならない。**これが、再利用できるかを実際に判定する基準である。**

- `dbc` を読み書きしない
- グローバルの `g` を参照しない
- 通信（ajax）しない
- `postup` を使わない（[viewpart-dataflow.md](frontend-viewpart-dataflow.instructions.md) に従い、通知はクロージャ props 経由で受け取る）
- props とクロージャ props だけで振る舞いが決まる

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
	//	見た目の指定を class 名へ導出する
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

> `class=":button_class"` のバインド先は、**必ず `<props>` に宣言する**。
> 未宣言の prop 名を書いてもバインドは成立せず、文字列がそのまま `class` 属性に残る
> （エラーも警告も出ない）。`disabled` は振る舞いを持つ真偽値属性なので、直接バインドしてよい
> （[viewpart-dataflow.md](frontend-viewpart-dataflow.instructions.md) §3）。

通信、`dbc`、業務上の判断が必要なら、それは `feature` 層である。**ui に業務を持ち込まず、feature 側で包む。**

---

## 4. props はその層の語彙で命名する

`ui` パーツの props には、**見た目の語彙**を使う。業務の語彙が入った瞬間に、再利用できなくなる。

```php
//	NG: ui が業務を知ってしまっている
<props>
{
	user_name	: "",
	is_admin	: false
}
</props>

//	OK: 見た目の語彙だけで書く
<props>
{
	label		: "",
	variant		: "primary"
}
</props>
```

`[[ui_label label=:user_name]]` のように、`feature` 層で**業務の語彙を見た目の語彙へ変換する**。
この変換は feature の責務である。

---

## 5. 差分は複製せず props で受け取る

**色やサイズの違いのためにファイルを複製しない。**

```php
//	NG: 複製する
//	  _common_/ui/button.php
//	  _common_/ui/button_red.php
//	  _common_/ui/button_small.php

//	OK: 1 ファイルで、見た目の差を props で受ける
[[ui_button label="保存" variant="primary"]]
[[ui_button label="削除" variant="danger" size="small"]]
```

受け取った値を class に反映し、見た目は `<style>` に決めさせる（[viewpart-dataflow.md](frontend-viewpart-dataflow.instructions.md) §3）。
`<style>` はパーツ名で自動的にスコープが付くため、**1ファイルにまとめれば CSS も1箇所に閉じる**。

---

## 6. 切り出すタイミング: 2箇所目で共通化する

- **1箇所でしか使わない間は切り出さない。** 使い方を1つしか知らない段階で共通化すると、2つ目の要求で props が膨らみ、かえって読みづらくなる
- **2箇所目が現れた瞬間に切り出す。** 2つ目をコピーで作らない——それが「同じものが別々に定義される」出発点になる
- **書き始める前に、必ず既存のものを探す。** 新しい見た目に着手する前に、`app/viewparts/` 配下の `ui_` で始まるパーツ名を検索し、同等のものが無いことを確認する。探さず書き始めること自体が、重複定義の出発点になる

パーツを初めて作るときは、**使う場所**に置く（§1 の配置表）。先回りして `_common_/` に置かない。
1箇所で使うものを最も広い階層に置くと、共有範囲が読み取れなくなる。

### 共通化を進めるときは配置場所も上げる

共有範囲が広がったら、配置を1階層上げる。**層は変わらず、配置場所だけが変わる。**

```
[role]/[module]/[action]/  →  [role]/[module]/_common_/  →  [role]/_common_/  →  _common_/
```

> **走査順で後に見つかった同名パーツが、先のパーツを上書きする。** 上位階層へ移したら、下位階層に残った同名ファイルを**必ず削除する**。
> 残すと、どちらが有効か読み取れないまま片方だけを修正する事故が起きる。

---

## 7. CSS の重複を作らない

- **2つのパーツの `<style>` に同じ見た目の規則を書かない。** 重複を見つけたら、その見た目は ui パーツである
- 色・間隔・文字サイズなどの**トークン**は、`app/assets/css/` 側の変数に置き、各パーツの `<style>` から参照する
  （解決順は `[role]/` → `[role]/_common_/` → `_common_/` → `engine/assets/css/`）
- パーツの `<style>` に色の実値を直接埋め込まない。トークンが無ければ、先にトークンを追加する
- レイアウト（配置・間隔）は**利用側**が持ち、ui パーツ自身には外側の余白を持たせない。
  ui パーツに `margin` を付けると、配置するたびに上書きが必要になり、再利用できなくなる
- **`<style>` の宣言は、自身のルート class の下に閉じる。** スコープは部分一致で、
  マウント先の親要素にもパーツ名が付くため、トップレベルにそのまま置いた宣言は親や兄弟へ漏れる
  （[viewpart.md](frontend-viewpart.instructions.md) §7）。再利用性の高い ui / parts ほど、影響範囲も広くなる

---

## 8. scene / root は組み立てだけを持つ

画面パーツに見た目を蓄積させない。

- `scene` の `<template>` は、feature と parts を並べるだけの組み立てに留める
- `scene` の `<style>` はレイアウトだけ（グリッド・領域の分割）。部品の見た目は下位層に置く
- `<method>` に業務ロジックが蓄積してきたら、feature パーツを切り出す合図である

---

## 9. バックエンドとの境界（action / model）

FE 内部の階層化（§1–§3）に加えて、**サーバ側の責務**との境界を守る。
バックエンドの正本は [backend/coding.md](backend-coding.instructions.md) §1.1（境界）、[backend/action.md](backend-action.instructions.md)（action = ユースケース）、[backend/model.md](backend-model.instructions.md)（model = ドメイン）にある。

### 9.1 誰が何を持つか

| 関心事 | 担当 | 注意点 |
| --- | --- | --- |
| **業務上の判断** — 権限、状態による制限、保存可否、競合 | **サーバ**（model が意味を、action が流れを持つ） | FE だけの制御は回避できるため、判断の正本にしない |
| UX のための事前確認（空欄、二重クリック防止、確認ダイアログ） | **feature** | 最終判断は常にサーバが行う |
| **契約レスポンスの組み立て**（`exit_ok` のペイロードの形） | **action** | ドメインではない。画面だけの関心事を model に入れない |
| **共有する表示ラベル・表示名**（契約に載せるもの） | **サーバ**（presenter → 契約） | FE は導出し直さず表示する。詳細はバックエンド §3.11 |
| **画面固有の表現・画面内の並べ方** | **feature / scene** | 契約上の一覧行順序の正本はサーバ（SQL）。FE はその順序を壊さない範囲で表現する |
| 契約に従った通信と `dbc` への反映 | **feature**（原則） | ui / parts は通信しない（§3）。scene は §9.2 |
| リクエスト本文の組み立て | **feature** | 契約のキーと型に従う。ui / parts は props 経由で値を上げるだけ |
| `exit_ng` などのエラー文言 | **サーバを正本とし、feature が提示する** | FE が業務上の意味を言い換えたり握りつぶしたりしない |

バックエンドの正本は [backend/coding.md](backend-coding.instructions.md) §1、[backend/action.md](backend-action.instructions.md) §2、[backend/model.md](backend-model.instructions.md) §3.11 にある。
**契約に載った共有表示値は、FE がそのまま使い、導出し直さない。契約に載らない画面固有のラベルと表現だけを FE が持つ。**

### 9.2 通信してよい層

```
scene / root  ──条件付き──▶  feature  ──禁止──▶  parts  ──▶  ui
```

- **通信（ajax）と `dbc` の読み書きは、原則 feature の責務。** ui / parts では禁止する（§3）。
- **`scene` / `root` が ajax をしてよいのは**、まだ feature が無く組み立てだけで足りる薄い画面、または root が全体として持つ横断的な状態の初回取得だけ。業務の一覧や更新は feature に切り出す。
- 一覧の取得・更新・削除の呼び出し、レスポンスの `dbc.set*`、エラー表示は、基本的に feature 内に閉じる。
- 発行前のゲート、世代管理、成功時の反映方法は [viewpart-dataflow.md](frontend-viewpart-dataflow.instructions.md) の「通信とレスポンスの反映」を参照する。

### 9.3 リクエストとレスポンス

```php
//  ui / parts — 値を上げるだけ（契約キーを知らない）
self.prop('on_submit')(self.prop('name'));

//  feature — 契約に沿って組み立てて送る
let request =
{
	name: name_,
	page_no: self.prop('page_no'),
};
//  … ajax → 成功なら dbc / props を更新、失敗ならサーバ文言を表示
```

- 成功時: 契約のペイロードを props / `dbc` に反映する。
  契約に載った共有表示値はそのまま使い、導出し直さない。画面固有の表現と並べ方だけを feature が持つ。
- 失敗時: **サーバが返したメッセージをそのまま（または契約に従って）表示する**。
  「対象外」に対して FE が別の文言を作らない。

### 9.4 禁止事項

- 「サーバと同じ」業務上の判断を feature に再実装し、それを正本にすること（UX のための事前確認はよい）。
- ui / parts から ajax / `dbc` / 契約キーの組み立てを行うこと。
- `exit_ng` のメッセージを握りつぶして成功扱いすること。
- あるテーブルの意味や権限について、FE の props だけを正本にすること。

---

## ✅ コンポーネント設計の確認

- [ ] 新しい見た目を書く前に、既存の ui / parts を探したか？
- [ ] 2つ目をコピーで作っていないか？（2箇所目で共通化する）
- [ ] 配置場所は「実際の利用範囲を覆う最も浅い階層」か？（先回りして `_common_/` に置いていないか？）
- [ ] パーツ名から層が読み取れるか？（`ui` は `ui/` と `ui_` が必須。parts/feature は §1 の推奨命名に従う）
- [ ] 接頭辞が一致するパーツ名を作っていないか？（`ui_button` と `ui_button_group`）
- [ ] `ui` / `parts` が `dbc` / `g` / 通信 / `postup` に触れていないか？
- [ ] `ui` の props は見た目の語彙か？（業務の語彙が漏れていないか？）
- [ ] バインドするすべての prop を `<props>` に宣言しているか？
- [ ] 色やサイズの違いをファイルの複製で作っていないか？
- [ ] 下位層が上位層のパーツ名を参照していないか？
- [ ] 複数のパーツの `<style>` に同じ CSS の規則が重複していないか？
- [ ] `<style>` の宣言は自身のルート class の下に閉じているか？
- [ ] `<style>` に色の実値を直接埋め込んでいないか？
- [ ] ui パーツ自身が外側の余白を持っていないか？
- [ ] 配置を上げた後、下位階層に同名ファイルが残っていないか？
- [ ] `scene` の `<template>` は組み立てに留まっているか？
- [ ] 業務上の判断の正本はサーバにあり、feature は UX の事前確認に留まっているか？
- [ ] 通信、リクエストの組み立て、`dbc` への反映は feature（または scene）内に閉じているか？
- [ ] サーバのエラーメッセージを言い換えたり握りつぶしたりしていないか？
