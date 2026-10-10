---
description: "🔀 crow / frontend — viewpart のデータフローと宣言的な書き方"
applyTo: "**/crow3_*/app/viewparts/**,**/crow3_*/app/views/**,**/crow3_*/app/assets/css/**,**/crow3_*/app/assets/js/**"
---

# 🔀 crow / frontend — viewpart のデータフローと宣言的な書き方

> パーツの構造上の規則は [viewpart.md](frontend-viewpart.instructions.md) を参照する。本書では、**状態をどう持ち、どう流すか**を定める。
> 目指すのは「読めば振る舞いが分かる」こと——手続きの順序を追わなくても、状態とテンプレートから画面が決まること。
>
> **コメントとユーザー向けの文言は日本語で書く。**

---

## 0. 目標を定める（crow ができること・できないこと）

crow の viewpart **は React ではない**。仮想 DOM、再レンダリング、差分適用は無く、
条件付き描画、一覧描画、イベントのための宣言的ディレクティブも無い。
リアクティビティは props への細かなバインドで実現される。

**そのため、「React のように書くこと」を目標にしない。** 目標は次の2つに絞る。

1. **状態が唯一の正本であり、画面はそこから導出される**という関係を壊さない
2. **データは親から子へ、イベントは子から親へ**という方向を固定する

1つ目は crow の実装が既に支えている。`:` によるプロパティバインドは親から子への一方向で、戻り道は無い。
2つ目は、**クロージャを prop として渡し、子はそれを呼ぶだけにする**ことで実現する（§5）。
**この規則は、仕組みが許してしまう抜け道を塞ぐためにある。**

---

## 1. 状態が唯一の正本（DOM から状態を読まない）

**画面の現在値を DOM から読まない。** 状態は常に props 側にあり、DOM はその投影である。

```php
//	NG: DOM を状態源にしている
let name = self.jq('input_name').val();
if( name === "" ) { ... }

//	OK: props を状態源にする（bind_input で DOM → props が同期される）
if( self.prop('name') === "" ) { ... }
```

入力要素は `bind_input` / `bind_checked` で props に結び付ける。これは**DOM と自身の props の間**の局所的な双方向バインドであり、
フォーム入力に必要なので許可する。**親の props に結び付けない。**

画面を変えたいときは、**DOM ではなく props を変える**。

```php
//	NG: DOM を直接書き換える（次の再描画で失われ、状態と食い違う）
self.jq('label').text("完了");

//	OK: 状態を変える。テンプレートのバインドが画面を更新する
self.prop('status_label', "完了");
```

---

## 2. テンプレートで宣言できるものはテンプレートに書く

`<ready>` や `<method>` で HTML を組み立てない。**`innerHTML` への文字列代入は禁止する**（詳細は [viewpart.md](frontend-viewpart.instructions.md) §5）。

宣言できるものは4つある。これらで表現できるものは、必ずこれらを使って書く。

| 記法 | 意味 |
| --- | --- |
| `{{ prop }}` | テキスト補間（HTML エスケープする） |
| `{{{ prop }}}` | テキスト補間（エスケープしない）。**信頼できる値だけに使う** |
| `attr=":prop"` / `attr="::"` | 属性バインド（`::` は同名の prop にバインドする） |
| `[[part arg=:prop]]` | 子パーツの埋め込み + プロパティバインド |

### `{{ }}` は「その要素だけのテキスト」に使う

補間のための抽出は、「タグの内容がテキスト」という形を前提にしている。
**間に別のタグを挟むと、意図しない範囲を巻き込んで壊れる。**

```php
<!--  NG: 内側に別タグがある  -->
<p>こんにちは {{ name }} <b>さん</b></p>

<!--  OK: 補間する値を専用要素で包む  -->
<p>こんにちは <span>{{ name }}</span> <b>さん</b></p>
```

**補間する値には、必ず専用の要素を与える**と覚える。

---

## 3. 表示の切り替えは class バインドで表現する

crow に条件付き描画のディレクティブは無い。表示・非表示や状態による差は、
**class をバインドし、見た目を `<style>` に決めさせる**ことで表現する。

「状態 → class → 見た目」という1本の経路にすると、状態と CSS を見るだけで画面が決まり、
表示ロジックが `<ready>` に散らばらない。

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
	//	真偽値の状態から、表示用の class 名を導出する
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

### 例外: 振る舞いを持つ真偽値属性は直接バインドする

`checked` / `required` / `disabled` / `readonly` の4つは、**class では代替できない振る舞い**を持つ。
この4つだけは、真偽値の prop を直接バインドしてよい。

```php
<template>
 <input type="checkbox" checked="::">
 <button disabled=":is_saving">保存</button>
</template>
```

**この4つ以外の属性を表示制御に使わない。** 見た目の違いはすべて class に反映する。

---

## 4. 一覧は「状態 → 1つの描画メソッド」に集約する

crow に一覧描画のディレクティブは無いため、描画は手続き的になる。ただし、
**呼び出す場所を1箇所に固定すれば、宣言的な性質を保てる。**

原則: **イベントハンドラから直接 DOM に子を積み上げない。イベントは状態を変えるだけ。**
`<watch>` が状態の変化を拾い、1つの描画メソッドだけを呼ぶ。

```php
<props>
{
	rows : []
}
</props>

<template>
 <div class="list">
  <button ref="btn_reload">再読込</button>
  <div ref="list_body"></div>
 </div>
</template>

<ready>
{
	//	初回描画は ready で起こす。
	//	生成時に args_ で rows を受け取った場合は watch が発火しないため、
	//	これが無いと永久に描画されない
	self.render_rows();

	//	イベントは状態を変えるだけ。DOM には触らない
	self.jq('btn_reload').on('click', () => self.load_rows());
}
</ready>

<watch>
{
	//	状態が変わったら描画メソッドを呼ぶだけ
	rows(old_, new_)
	{
		self.render_rows();
	}
}
</watch>

<method>
{
	//	描画は必ずこの 1 メソッドに閉じる
	render_rows()
	{
		//	自分が作った子だけを消してから作り直す
		self.remove_pref("row");

		//	全行に同じ pref を付けることで、次回の remove_pref で一括破棄できる
		self.create_children_and_append("row", self.prop('rows'), "list_body", "row");
	}
}
</method>
```

- **初回描画は `<ready>` で起こす。** `<watch>` は変化したときしか動かないため、これが無いと
  「生成時に `args_` で渡されたデータが一度も描画されない」事故が起きる
- 子の破棄は `remove_pref()` で行い、**一覧の全行に同じ pref を付ける**（[viewpart.md](frontend-viewpart.instructions.md) §2）
- 配列の内容を変更しても参照は変わらず watch が発火しないため、`self.update('rows')` で明示的に発火させる
- crow に差分更新（キーによる再利用）は無い。**行数が多く、全破棄・再構築が重い場合だけ**、
  `<method>` 内に閉じた局所的な差分更新を書く（呼び出し箇所は1つに保つ）

---

## 5. 一方向のデータフロー（親子間の契約）

```
        props（値）
   親 ───────────────▶ 子
   親 ───────────────▶ 子   props（クロージャ）
   親 ◀─────────────── 子   子はそのクロージャを呼ぶだけ
```

**下りも上りも、props という1本の経路を通す。** 値とイベントが同じ道を通るため、
親のテンプレートと生成コードを見るだけで、その子との契約全体が分かる。

### 下り: 親 → 子は props として渡す

```php
<!--  ":" は継続バインド（親の変更が子へ流れ続ける）。属性名が子の prop 名になる  -->
[[user_card name=:user_name]]

<!--  "@" は初回のみ。属性名と prop 名を必ず一致させる  -->
[[user_card user_name=@user_name]]

<!--  リテラルは直接渡す（"true" / "false" は真偽値に変換される）  -->
[[user_card editable="true"]]
```

> **`@` は属性名を見ない。** 参照先の prop 名がそのまま子の prop 名になるため、
> `[[user_card name=@user_name]]` は子の `name` を**設定しない**——`user_name` というキーを注入する。
> **名前が一致しなければ、値は届かない。** 別名で渡したいときは `:` を使う。

動的に生成する子には、`create_child*` の `args_` で値を渡す。`bind_prop()` は、親が後から値を変更したい場合だけ使う。

> **渡すのは参照である。** `:` バインドも `args_` も、オブジェクトや配列を**コピーせず、そのまま渡す**。
> 子が内容を破壊的に変更すると、**親のデータが直接書き換わり、watch さえ発火しない**（後述の禁止事項を参照）。

### 上り: 子 → 親は、親から渡されたクロージャを呼ぶ

**通常は `postup` / `postdown` を使わない**（例外は後述）。
処理の実体は親が持ち、**それを呼ぶ関数を prop として子に渡す**。
子は「自分に何が起きたか」を伝えるだけで、親がそれをどう扱うかは知らない。

**親: 処理の実体を `<method>` に置く**

```php
<method>
{
	//	処理の実体は親が持つ
	on_row_selected(id_)
	{
		self.prop('selected_id', id_);
	}
}
</method>
```

**親: 動的に生成する子には、生成時に `args_` で渡す**

```php
<ready>
{
	self.create_child_and_append
	(
		"row",
		{
			id			: 1,
			on_select	: (id_) => self.on_row_selected(id_)
		},
		"list_body"
	);
}
</ready>
```

**親: テンプレートに埋め込む子には、prop 経由で渡す**

```php
<props>
{
	//	クロージャは <props> の中で定義しない。null で枠だけ宣言する
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
	//	self が使えるのは <init> 以降。ここで実体を入れる
	self.prop('on_select', (id_) => self.on_row_selected(id_));
}
</init>
```

> テンプレートに埋め込まれた子は、**親の `<init>` より前に生成される**ため、生成時点では `null` が入っている。
> `:` の継続バインドにより、`<init>` で代入した値が子へ流れる。これに伴い、2つの制約がある。
>
> - **子は自身の `<init>` 内でクロージャを呼んではいけない**（まだ届いていない）
> - **親は `<init>` 内で `watch_stop()` を呼んではいけない。** 停止中は `:` バインドの伝播も止まるため、
>   クロージャが子に届かなくなる（[viewpart.md](frontend-viewpart.instructions.md) §3）

**子: 受け取り、呼ぶだけ**

```php
<props>
{
	id			: 0,
	on_select	: null
}
</props>

<ready>
{
	self.jq('btn').on('click', () =>
	{
		//	渡されていない場合に落ちないよう存在を確認する
		if( self.prop('on_select') === null ) return;
		self.prop('on_select')(self.prop('id'));
	});
}
</ready>
```

### クロージャ props の規則

- **名前は `on_` + 起きた事実にする。** `on_select` / `on_close_requested` のように、**子で何が起きたか**を名前にする。
  `on_delete_user` のように**親が何をするか**を名前にしない（子が親の業務を知ってしまう）
- **`<props>` 内でクロージャを定義しない。** props 節には `self` が存在しないため、
  そこに書いた関数は自身のパーツに触れない。`null` で枠を宣言し、`<init>` から実体を入れる
- **子は呼ぶだけで、戻り値に依存しない。** 親がどう処理したかを子が知る必要は無い
- **引数には最小限の値だけを渡す。** DOM 要素、イベントオブジェクト、自身のインスタンスを渡さない
- **未設定でも動くようにする。** 呼ぶ前に `null` を確認し、無ければ何もしない
- **受け渡しが3階層を超えたら設計を疑う。** 中間パーツが通すだけのクロージャが積み重なり始めたら、
  その状態は共通祖先ではなく `dbc` に置くべきである

### 例外: postup / `<recv>` は横断的な通知だけに使う

`postup` を使うのは、**画面のどこからでも発行できる必要があり、受信先がルートの1箇所だけである通知**に限る。
典型例はエラーダイアログとメッセージ表示で、すべての中間パーツにクロージャを通すのは不合理である。

**発行してよいのは feature 以上（feature / scene / root）だけ。**
`ui` / `parts` では `postup` を禁止する（親への通知はクロージャ props で返す——
[viewpart-components.md](frontend-viewpart-components.instructions.md) §3）。

```php
//	feature 以上: 横断的な通知だけは postup を使う
self.postup('error', ["E001", "保存に失敗しました"]);
```

```php
//	ルート: <recv> で受ける
<recv>
{
	//	横断: 全パーツから上がるエラー表示。クロージャを全階層に通さないためここで受ける
	error(sender_, params_)
	{
		ui.dialog.popup_error("error", params_[0], params_[1]);

		//	処理しきったので伝播を止める
		return true;
	}
}
</recv>
```

受信ハンドラの第1引数は、**発行元のインスタンスで固定**。第2引数は `postup` に渡したパラメータである。
処理しきったら `true` を返して伝播を止める（返さなければ祖先へ上がり続ける）。

**使うときは、なぜ横断的な通知なのかを `<recv>` 側のコメントに残す。**
理由を書けないなら、それはクロージャで渡すべきイベントである。

### 禁止事項（仕組み上は可能だが、一方向の流れを壊す）

- **子は親の状態を書き換えない。** `self.parent().prop(...)` / `self.parent().jq(...)` を書かない。
  `parent()` は公開されているため仕組み上は可能だが、変更の出所を追えなくなる。
  子は**渡されたクロージャを呼ぶだけ**にする
- **子は親から受け取った prop を書き換えない。** 再代入しても親には届かず、親の次の変更で上書きされる。
  さらに、**オブジェクトや配列は参照を共有する**ため、内容を変更すると
  **watch を発火させずに親のデータをひそかに汚染する**（最も追いにくい壊れ方）。
  変換したいときは、**別名の prop を用意し、`<watch>` で導出する**
- **兄弟パーツを直接参照しない。** `viewpart_find_by_name()` / `viewpart_find_all_by_name()` で兄弟を取得して
  操作しない。共通の親でクロージャを受け、親が `pref()` 経由で他方の子へ反映する
- **孫を直接取得しない。** `self.pref('a').pref('b')` のような連鎖参照を書かない。責務は1階層ずつ委譲する

### 広く共有する状態は dbc に置く

共通祖先が遠い状態や画面をまたぐ状態には、共通祖先へ引き上げる代わりに `dbc`（データキャッシュ）を使う。

```php
//	dbc の値をパーツの prop にバインドする
dbc.bind("user.list", user_id, self, "user_row");
```

- **`dbc.bind()` は dbc → prop の一方向**（prop を変えても dbc は変わらない）。
  更新は必ず `dbc.set()` / `dbc.set_list()` / `dbc.merge_list()` で行い、prop を直接書き換えない
- **バインドはパーツの破棄時に自動解除される。** `dbc.unbind(self, "prop name")` を明示的に書くのは、
  まだ画面上にある間に早めに解除したい場合だけ
- **`set_list()` は「新しい一覧に無いキー」を削除しない。** 全体を再取得して行が消えても、
  バインドされた prop は**以前の値のまま残る**。消えた行を反映する必要があるなら、`remove` 系を使うか、
  描画側で dbc の一覧を取り直す

### 通信とレスポンスの反映（ajax / 契約）

通信してよい主体は [viewpart-components.md](frontend-viewpart-components.instructions.md) §9（feature 以上）を参照する。
ここでは、**どう発行し、どうレスポンスを反映するか**を定める。

#### 発行前は条件が揃うまで許可しない

必須条件（担当者、選択行、契約の必須キー）が揃うまで、**ajax を発行しない**。
揃わない間は空状態またはスケルトン表示に留め、**条件を緩めて取得しない**
（サーバの対象母集団の制約や権限がひそかに消える経路を作らない）。

リクエストの組み立ては、feature 内の**1本の経路**（例: `build_*_request_params`）に集約し、
タブ切り替えやページングなど、すべての UI 操作をそこへ通す。

#### 成功時の反映方法

| データの性質 | 反映先 |
| --- | --- |
| 画面内の複数パーツで共有する一覧や行 | `dbc.set` / `dbc.set_list` / `dbc.merge_list`。子は `dbc.bind` を使う |
| その feature だけが持つ局所的な状態 | そのパーツ自身の props |

- 成功コールバックで直接組み立てた DOM を状態源にしない（§1、§4）。
  先にデータを反映し、その後で既存の1つの描画メソッドまたは子の生成へ進む。
- 契約のレスポンスの形に従って反映する（キー名の正本は feature の契約。
  `rows` / `rows_with_id` / `pager` は**よくある例**であり、必須キーの一覧ではない）。

#### 古いレスポンスを反映しない

`ajax.post` などは中止用のハンドルを返さず、既に届いたレスポンスは止められない場合もある。
連打やタブ切り替えでは、**リクエスト世代（seq）**を持ち、次を守る。

- 発行するたびに seq を進める
- レスポンスの反映前に、最新世代のものか判定する
- **最新以外は一覧や状態へ一切書き込まない**（条件を満たさなければ拒否する）

古いレスポンスの失敗によって、最新世代の一覧を空状態に潰してはいけない。

#### 失敗時

- サーバが返したメッセージを、トーストまたは画面内のエラーとして**提示する**（言い換え・握りつぶしは §9）。
- 一覧を空にするか、以前の表示を残すかは feature の仕様に従う。どちらかを明示し、曖昧にしない。
- スケルトン表示を出したままにしない（失敗時も閉じる）。

```php
//  概形（名前は機能に合わせる）
let request_seq = self.next_list_request_seq(self.prop('list_request_seq'));
self.prop('list_request_seq', request_seq);

ajax_or_helper
(
	params,
	(data_) =>
	{
		if( self.should_apply_list_response(request_seq, self.prop('list_request_seq')) === false )
		{
			return;
		}
		//	data_ のキーは契約に従う（以下は例）
		dbc.set_list('example.list', data_.rows_with_id);
		self.prop('pager', data_.pager);
		self.render_list();
	},
	(code_, msg_) =>
	{
		if( self.should_apply_list_response(request_seq, self.prop('list_request_seq')) === false )
		{
			return;
		}
		dbc.set_list('example.list', null);
		self.render_empty();
		//	トースト API 名はプロジェクト側。サーバ文言 msg_ を提示する
		show_error(msg_);
	}
);
```

---

## 6. 許可する手続き的コードは「イベントの配線」だけ

crow に宣言的なイベントディレクティブは無いため、`<ready>` での配線は避けられない。
**ここを手続き的コードの唯一の入口と捉え、広げない。**

```php
<ready>
{
	//	OK: 配線して、自分の状態を変えるだけ
	self.jq('btn_save').on('click', () => self.prop('saving', true));

	//	OK: 親から渡されたクロージャを呼ぶだけ
	self.jq('btn_close').on('click', () =>
	{
		if( self.prop('on_close_requested') === null ) return;
		self.prop('on_close_requested')();
	});
}
</ready>
```

`<ready>` に画面の組み立て、分岐、ループが蓄積してきたら、状態設計が失敗している合図である。
**まず「その分岐は prop にできないか？」と疑う。**

---

## ✅ データフローの確認

- [ ] 画面の値を DOM から読んでいないか？（`.val()` / `.text()` が状態源になっていないか？）
- [ ] `innerHTML` に文字列を代入したり、HTML を組み立てたりしていないか？
- [ ] `{{ }}` は専用の要素で包んでいるか？（内部に別のタグが無いか？）
- [ ] 表示制御は class バインドで書いているか？（4つの真偽値属性以外で切り替えていないか？）
- [ ] 一覧の初回描画は `<ready>` にあるか？
- [ ] 一覧の描画メソッドは1つだけで、イベントハンドラから直接 DOM に積み上げていないか？
- [ ] 子が `self.parent()` 経由で親を書き換えていないか？
- [ ] 子が親から受け取った prop（オブジェクトの内容も含む）を書き換えていないか？
- [ ] 兄弟や孫を直接参照していないか？
- [ ] `@` バインドで、属性名と prop 名が一致しているか？（一致しなければ値が届かない）
- [ ] 子 → 親の通知はクロージャ props か？（通常の通知に `postup` を使っていないか？）
- [ ] クロージャ props は `on_` + 起きた事実で命名しているか？
- [ ] `<props>` 内でクロージャを定義していないか？（`null` の宣言 + `<init>` での代入になっているか？）
- [ ] 子はクロージャを呼ぶ前に `null` を確認し、`<init>` で呼ばないようにしているか？
- [ ] `postup` を使う各箇所に、なぜ横断的な通知なのかのコメントがあり、`true` で伝播を止めているか？
- [ ] `postup` を発行するのは feature 以上だけか？（ui / parts から発行していないか？）
- [ ] `<ready>` はイベントの配線に留まっているか？
- [ ] 通信前のゲートは、条件が揃わなければ拒否するか？（必須条件が未成立のまま ajax を発行していないか？）
- [ ] 共有一覧の取得成功結果は `dbc`（または局所的な props）へ反映しているか？
- [ ] 古いレスポンスはリクエスト世代で破棄しているか？（最新以外を一覧に書いていないか？）
- [ ] 失敗時はサーバの文言を提示し、スケルトン表示を閉じているか？
