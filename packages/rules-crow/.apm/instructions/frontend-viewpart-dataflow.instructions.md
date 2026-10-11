---
description: "🔀 crow / frontend — viewpart のデータフローと宣言的な書き方"
applyTo: "**/crow3_*/app/viewparts/**,**/crow3_*/app/views/**,**/crow3_*/app/assets/css/**,**/crow3_*/app/assets/js/**"
---

# 🔀 crow / frontend — viewpart のデータフローと宣言的な書き方

状態をどう持ち、どう流すか。パーツの構造規則は [frontend-viewpart](frontend-viewpart.instructions.md)。到達状態は、手続きの順序を追わなくても状態とテンプレートから画面が決まること。コメントとユーザー向けの文言は日本語で書く。

## 0. crow ができること・できないこと

crow の viewpart は React ではない。仮想 DOM、再レンダリング、差分適用はなく、条件付き描画、一覧描画、イベントのための宣言的ディレクティブもない。リアクティビティは props への細かなバインドで実現され、`:` のプロパティバインドは親から子への一方向で戻り道はない。守る不変条件は二つ: 状態が唯一の正本で画面はそこから導出される、データは親から子へ・イベントは子から親へ（クロージャ props）。

## 1. 状態が唯一の正本

- 画面の現在値を DOM から読まない（`self.jq('input_name').val()` を状態源にしない）。状態は props にあり、DOM はその投影。
- 入力要素は `bind_input` / `bind_checked` で自身の props に結び付ける（DOM と自身の props の間の局所的な双方向バインド）。親の props に結び付けない。
- 画面を変えるときは DOM でなく props を変える（`self.jq('label').text("完了")` ではなく `self.prop('status_label', "完了")`）。

## 2. テンプレートで宣言できるものはテンプレートに書く

| 記法 | 意味 |
| --- | --- |
| `{{ prop }}` | テキスト補間（HTML エスケープする） |
| `{{{ prop }}}` | テキスト補間（エスケープしない）。信頼できる値だけに使う |
| `attr=":prop"` / `attr="::"` | 属性バインド（`::` は同名の prop にバインド） |
| `[[part arg=:prop]]` | 子パーツの埋め込み + プロパティバインド |

`{{ }}` の抽出は「タグの内容がテキスト」という形を前提にしており、間に別のタグを挟むと意図しない範囲を巻き込んで壊れる。補間する値には専用の要素を与える（`<p>こんにちは <span>{{ name }}</span> <b>さん</b></p>`）。

## 3. 表示の切り替えは class バインド

条件付き描画のディレクティブはないため、表示・非表示や状態による差は class をバインドし、見た目を `<style>` に決めさせる（状態 → class → 見た目）。

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

例外: `checked` / `required` / `disabled` / `readonly` の四つは class で代替できない振る舞いを持つため、真偽値の prop を直接バインドしてよい（`<input type="checkbox" checked="::">`、`<button disabled=":is_saving">`）。この四つ以外の属性を表示制御に使わない。

## 4. 一覧は「状態 → 1 つの描画メソッド」

一覧描画のディレクティブはないため描画は手続き的になるが、呼び出す場所を 1 箇所に固定する。イベントハンドラは状態を変えるだけで、DOM に子を積み上げない。`<watch>` が変化を拾い、1 つの描画メソッドだけを呼ぶ。

```php
<ready>
{
	//	初回描画は ready で起こす。args_ で rows を受け取った場合は watch が発火しない
	self.render_rows();
	self.jq('btn_reload').on('click', () => self.load_rows());
}
</ready>

<watch>
{
	rows(old_, new_)
	{
		self.render_rows();
	}
}
</watch>

<method>
{
	render_rows()
	{
		//	全行に同じ pref を付け、次回の remove_pref で一括破棄する
		self.remove_pref("row");
		self.create_children_and_append("row", self.prop('rows'), "list_body", "row");
	}
}
</method>
```

- 初回描画は `<ready>` で起こす。`<watch>` は変化したときしか動かず、生成時に `args_` で渡されたデータは描画されない。
- 配列の内容を変更しても参照は変わらず watch が発火しないため、`self.update('rows')` で明示的に発火させる。
- 差分更新（キーによる再利用）はない。行数が多く全破棄・再構築が重い場合だけ、`<method>` 内に閉じた局所的な差分更新を書く（呼び出し箇所は 1 つ）。

## 5. 一方向のデータフロー（親子間の契約）

下りも上りも props という 1 本の経路を通す。親のテンプレートと生成コードを見るだけで、その子との契約全体が分かる状態にする。

### 下り: 親 → 子は props

```php
<!--  ":" は継続バインド（親の変更が子へ流れ続ける）。属性名が子の prop 名になる  -->
[[user_card name=:user_name]]

<!--  "@" は初回のみ。参照先の prop 名がそのまま子の prop 名になるため、属性名と一致させる  -->
[[user_card user_name=@user_name]]

<!--  リテラル。"true" / "false" は真偽値に変換される  -->
[[user_card editable="true"]]
```

- `@` は属性名を見ない。`[[user_card name=@user_name]]` は子の `name` を設定せず `user_name` というキーを注入する。別名で渡すなら `:` を使う。
- 動的に生成する子には `create_child*` の `args_` で渡す。`bind_prop()` は親が後から値を変更する場合だけ。
- `:` バインドも `args_` もオブジェクトや配列をコピーせず参照のまま渡す。子が内容を破壊的に変更すると親のデータが直接書き換わり、watch も発火しない。

### 上り: 子 → 親は、親から渡されたクロージャを呼ぶ

処理の実体は親の `<method>` に置き、それを呼ぶ関数を prop として子に渡す。子は「自分に何が起きたか」を伝えるだけで、親がどう扱うかを知らない。

```php
//	親: 動的に生成する子には args_ で渡す
self.create_child_and_append
(
	"row",
	{
		id			: 1,
		on_select	: (id_) => self.on_row_selected(id_)
	},
	"list_body"
);

//	親: テンプレートに埋め込む子には prop 経由で渡す
<props>
{
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
	self.prop('on_select', (id_) => self.on_row_selected(id_));
}
</init>

//	子: 受け取り、呼ぶだけ
<ready>
{
	self.jq('btn').on('click', () =>
	{
		if( self.prop('on_select') === null ) return;
		self.prop('on_select')(self.prop('id'));
	});
}
</ready>
```

テンプレートに埋め込まれた子は親の `<init>` より前に生成されるため、生成時点では `null` が入り、`:` の継続バインドで `<init>` の代入が子へ流れる。したがって、子は自身の `<init>` 内でクロージャを呼ばず、親は `<init>` 内で `watch_stop()` を呼ばない（停止中は `:` バインドの伝播も止まる）。

クロージャ props の規則:

- 名前は `on_` + 起きた事実（`on_select` / `on_close_requested`）。親が何をするか（`on_delete_user`）を名前にしない。
- `<props>` 内でクロージャを定義しない（props 節に `self` は存在しない）。`null` で枠を宣言し、`<init>` から実体を入れる。
- 子は呼ぶだけで戻り値に依存しない。引数には最小限の値だけを渡し、DOM 要素・イベントオブジェクト・自身のインスタンスを渡さない。
- 呼ぶ前に `null` を確認し、未設定でも動く。
- 受け渡しが 3 階層を超えたら、その状態は共通祖先ではなく `dbc` に置く。

### 例外: postup / `<recv>` は横断的な通知だけ

`postup` を使うのは、画面のどこからでも発行でき、受信先がルートの 1 箇所だけである通知（エラーダイアログ、メッセージ表示）に限る。発行してよいのは feature 以上（feature / scene / root）だけで、`ui` / `parts` では禁止。使う箇所には、なぜ横断的な通知なのかを `<recv>` 側のコメントに残す。

```php
//	feature 以上
self.postup('error', ["E001", "保存に失敗しました"]);

//	ルート
<recv>
{
	//	横断: 全パーツから上がるエラー表示。クロージャを全階層に通さないためここで受ける
	error(sender_, params_)
	{
		ui.dialog.popup_error("error", params_[0], params_[1]);
		return true;
	}
}
</recv>
```

受信ハンドラの第 1 引数は発行元のインスタンス、第 2 引数は `postup` に渡したパラメータ。処理しきったら `true` を返して伝播を止める（返さなければ祖先へ上がり続ける）。

### 禁止事項（仕組み上は可能だが、一方向の流れを壊す）

- 子は親の状態を書き換えない（`self.parent().prop(...)` / `self.parent().jq(...)`）。
- 子は親から受け取った prop を書き換えない。再代入は親に届かず次の変更で上書きされ、オブジェクトや配列の内容変更は watch を発火させずに親のデータを汚染する。変換したいときは別名の prop を用意し `<watch>` で導出する。
- 兄弟パーツを `viewpart_find_by_name()` / `viewpart_find_all_by_name()` で取得して操作しない。共通の親でクロージャを受け、親が `pref()` 経由で他方の子へ反映する。
- 孫を `self.pref('a').pref('b')` のように連鎖参照しない。責務は 1 階層ずつ委譲する。

### 広く共有する状態は dbc に置く

共通祖先が遠い状態や画面をまたぐ状態は `dbc`（データキャッシュ）に置く。

```php
dbc.bind("user.list", user_id, self, "user_row");
```

- `dbc.bind()` は dbc → prop の一方向。更新は `dbc.set()` / `dbc.set_list()` / `dbc.merge_list()` で行い、prop を直接書き換えない。
- バインドはパーツの破棄時に自動解除される。`dbc.unbind(self, "prop name")` は画面上にある間に早めに解除したい場合だけ。
- `set_list()` は「新しい一覧にないキー」を削除しない。全体を再取得して行が消えても、バインドされた prop は以前の値のまま残る。消えた行を反映するなら `remove` 系を使うか、描画側で dbc の一覧を取り直す。

### 通信とレスポンスの反映（ajax / 契約）

通信してよい層は [frontend-viewpart-components](frontend-viewpart-components.instructions.md) §9。

- 必須条件（担当者、選択行、契約の必須キー）が揃うまで ajax を発行しない。揃わない間は空状態またはスケルトン表示に留め、条件を緩めて取得しない。
- リクエストの組み立ては feature 内の 1 本の経路（`build_*_request_params` など）に集約し、タブ切り替えやページングなどすべての UI 操作をそこへ通す。
- 成功時: 画面内の複数パーツで共有する一覧や行は `dbc.set` / `dbc.set_list` / `dbc.merge_list` へ反映し、子は `dbc.bind` で受ける。その feature だけの局所的な状態はパーツ自身の props。データを反映した後で 1 つの描画メソッドまたは子の生成へ進む。キー名の正本は契約（`rows` / `rows_with_id` / `pager` は例であり必須キーの一覧ではない）。
- 古いレスポンスを反映しない: `ajax.post` などは中止用のハンドルを返さないため、リクエスト世代（seq）を持ち、発行ごとに進め、反映前に最新世代か判定し、最新以外は一覧や状態へ一切書き込まない。古いレスポンスの失敗で最新世代の一覧を空状態に潰さない。
- 失敗時: サーバが返したメッセージをトーストまたは画面内のエラーとして提示する。一覧を空にするか以前の表示を残すかは feature の仕様で明示する。スケルトン表示を出したままにしない。

```php
let request_seq = self.next_list_request_seq(self.prop('list_request_seq'));
self.prop('list_request_seq', request_seq);

ajax_or_helper
(
	params,
	(data_) =>
	{
		if( self.should_apply_list_response(request_seq, self.prop('list_request_seq')) === false ) return;
		dbc.set_list('example.list', data_.rows_with_id);
		self.prop('pager', data_.pager);
		self.render_list();
	},
	(code_, msg_) =>
	{
		if( self.should_apply_list_response(request_seq, self.prop('list_request_seq')) === false ) return;
		dbc.set_list('example.list', null);
		self.render_empty();
		show_error(msg_);
	}
);
```

## 6. 許可する手続き的コードは「イベントの配線」だけ

宣言的なイベントディレクティブはないため `<ready>` での配線は避けられないが、ここを手続き的コードの唯一の入口とし広げない。配線して自分の状態を変える、または親から渡されたクロージャを呼ぶだけに留める。`<ready>` に画面の組み立て、分岐、ループが蓄積したら、その分岐は prop にできないかを疑う。
