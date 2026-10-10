---
description: "🎨 Expo / frontend — 表層コーディング規約"
applyTo: "**/*.tsx,**/*.ts,**/app.json,**/app.config.*,**/eas.json"
---

# 🎨 Expo / frontend — 表層コーディング規約

> **対象: Expo（expo-router）の React Native アプリ。** Expo でなければ適用外として扱い、破棄する。
>
> **共通規約は [common/coding.md](common-coding.instructions.md)**（整形はツールが決める。成功させるために型を弱めない。
> default export 禁止、barrel 禁止、パスエイリアス、秘密情報と `EXPO_PUBLIC_`、native 依存の境界）。
> この文書は **それらに従った上で**、React Native の表層を拘束する差分だけを定義する。共通側は再掲しない。
>
> **コメントとユーザー向けの文言は日本語で書く。**

---

## 0. 目的の定義（RN runtime ができること、できないこと）

React Native runtime は **browser でも Node でもない**。

DOM はない。CSS の cascade、継承、selector、media query はない。
`document` / `window` / `localStorage` / `alert` は存在しないか、まったく別物である。
`Buffer` / `crypto` / `Intl` の一部は存在しないか、platform ごとに挙動が違う。

**最大の事故原因は、JSX の見た目が Web とまったく同じことである。**
同じように見えるコードが書けるため、Web の知識が通用する錯覚を生む。
**Web なら layout の崩れになる間違いが、ここでは実行時 crash や片方の platform での無反応になる。**

**この文書の役割は、同じ見た目によって残る抜け道を塞ぐことである。**

---

## 1. 生の文字列は `<Text>` の中にだけ置ける

`<View>` 直下に現れる文字列は **実行時に crash する**（`Text strings must be rendered within a <Text> component`）。
Web の React では問題なく描画する同じコードが、ここではアプリを落とす。

危険なのは意図して書いた文字列ではなく、**条件式から漏れる文字列**である。

```tsx
//  NG: count が 0 のとき、0 が View の直下に落ちてクラッシュする
<View>{count && <Badge count={count} />}</View>

//  NG: 空文字・スペースも同じく落ちる
<View>{isNew && ' '}</View>

//  OK: 三項で書き、出さない場合は明示的に null
<View>{count > 0 ? <Badge count={count} /> : null}</View>
```

**条件付き描画は `&&` ではなく、三項演算子と明示的な `null` で書く。**
毎回 `&&` 左辺が数値や空文字になり得るかを考えるより、形を固定する方が安い。

---

## 2. style は CSS ではない

### `StyleSheet.create` に置く

**JSX の中で毎回 style object literal を作らない。**
render ごとに新しい参照が生まれ、子の `React.memo` による再 render 回避を無条件に破る。
リストの行コンポーネントで行うと、scroll のたびに全行が再 render する。

```tsx
//  NG: 毎レンダで新しいオブジェクト
<View style={{ padding: 16, backgroundColor: '#fff' }} />

//  OK: 定義は外、条件付きは配列で合成
<View style={[styles.card, isActive && styles.cardActive]} />
```

### CSS の常識を持ち込まない

| Web での前提 | React Native では |
| --- | --- |
| style は cascade・継承する | **しない。** 入れ子の `<Text>` を通して一部の text style だけが継承する |
| `flexDirection` の既定は `row` | **既定は `column`** |
| `position: fixed` がある | **ない。** absolute 配置と layout 構造で画面へ固定する |
| 1 つの `box-shadow` で影が出る | **iOS は `shadowColor` / `shadowOffset` / `shadowOpacity` / `shadowRadius`、Android は `elevation`。片方だけ書くと他方で影が消える** |
| container の `padding` は内容に効く | `ScrollView` では **`contentContainerStyle`** に置く（`style` では効かない）|
| `text-overflow: ellipsis` | **`numberOfLines` prop** で指定する |
| `gap` / `%` / `vh` が使える | `gap` は使えるが `vh` はない。画面寸法は `useWindowDimensions` から取得する |

**「Web ではこう書く」で手が動いたら、止まって上表を確認する。**

---

## 3. 差分の大きさで platform 分岐の手段を変える

| 差分の大きさ | 手段 |
| --- | --- |
| 数個の値だけが違う（余白、font、影）| 式内で `Platform.select` / `Platform.OS` を使う |
| **コンポーネント構造全体が違う、または片方だけ native 依存を持つ** | **`Foo.ios.tsx` / `Foo.android.tsx` へ分ける**（bundler が解決し、import 側は `./Foo` のまま）|

**ファイルに分けた場合は、両方の props 型と export 名を同じにする。**
片方の signature だけ変わる破損は、他方の platform 向けに build するまで気付かず、
**最も遅く表面化する欠陥**となる。props 型を共有ファイルに置き、両方から import する。

`Platform.OS === 'web'` 分岐は **プロジェクトが Expo Web の出荷を決めた場合だけ**書く。
未決定なら書かない（存在しない要求の分岐は未検証のまま腐る）。

---

## 4. 画面の端 — safe area と keyboard

**どちらも任意ではなく、CSS で代用できない。** 見落とすと実機でだけ壊れる。

### safe area

- **`react-native-safe-area-context` を使う**（`useSafeAreaInsets` またはそのライブラリの `SafeAreaView`）
- **`react-native` から import する `SafeAreaView` を使わない。** iOS 専用で **Android では何もしない**ため、
  片方の platform だけ notch や gesture bar の下へ潜る
- header や tab のある画面で **inset を二重に足さない**。navigator が既に消費した辺は `edges` で除外する
  （上下の不自然な余白の原因である）

### keyboard

入力のある画面は **最初から** keyboard に入力が隠れない設計にする（そうしないと後から layout を作り直すことになる）。

**入力を含むすべての `ScrollView` に `keyboardShouldPersistTaps="handled"` を付ける。**
ない場合は **keyboard 表示中の最初の tap が keyboard を閉じるために消費され、button が反応しない**。
「ときどき押せない」としか報告されず、review でも再現しにくい欠陥となる。

---

## 5. accessibility と testID は「出力する」もの

**RN に semantic element はない。** `<Pressable>` も `<View>` も自分が何かを名乗らない。
Web のように markup から自動決定されないため、**明示して出力する**。

| 対象 | 付けるもの |
| --- | --- |
| 押せるものすべて | `accessibilityRole`（`button` / `link` / `checkbox` など）|
| icon だけで text がない要素 | `accessibilityLabel`（icon 名でなく何をするかを書く）|
| disabled、selected、expanded などの状態 | `accessibilityState`（外観だけで表さない）|
| 44pt より小さい tap 領域 | `hitSlop`（外観はそのままに、判定領域だけ広げる）|

加えて **押せるものとシナリオ flow が特定するものすべてに安定した `testID` を付け、値は発明せず導出する**（ADR-0037）。
契約 operation を実行する control は **operation 名**（`testID="createProject"`）、request field の入力は **`<operation>.<field>`**（`testID="createProject.title"`）を持つ。
**表示文言をコピーしない**（文言変更で flow が壊れる）。契約にない id も使わない（シナリオ flow が導出できない）。
見える文言（label、button 文言、`accessibilityLabel`）は **用語集の用語**をそのまま使う（`docs/01-glossary.md`）。新しい用語はゲートを通して用語集へ追加し、先に画面へ入れない。

```tsx
//  NG: 何も名乗らない。読み上げでは無反応、テストからも引けない
<Pressable onPress={onSubmit}><Icon name="check" /></Pressable>

//  OK
<Pressable
  onPress={onSubmit}
  accessibilityRole="button"
  accessibilityLabel="送信する"
  accessibilityState={{ disabled: isSubmitting }}
  testID="createProject"
  hitSlop={8}
>
  <Icon name="check" />
</Pressable>
```

> ここで出力する属性は VoiceOver / TalkBack が読み上げ、UC のシナリオ flow（[system-testing.md](system-testing.instructions.md)）が tap・検証するものとなる。flow は同じ用語集と契約から導出するため、報告には文言 → `testID` の表を返す。不一致なら外観側を動かす。

---

## ✅ 返却前チェックリスト

- [ ] `&&` による条件付き描画が残っていないか（三項 + `null` になっているか）？
- [ ] JSX 内に style object literal を書いていないか？
- [ ] 影を追加したすべての箇所で iOS 側と Android 側の両方を指定したか？
- [ ] `.ios.tsx` / `.android.tsx` に分けた場合、両方の props 型と export 名は同じか？
- [ ] safe area は `react-native-safe-area-context` から取得しているか（`react-native` の `SafeAreaView` ではないか）？
- [ ] 入力を含む `ScrollView` に `keyboardShouldPersistTaps="handled"` を付けたか？
- [ ] 押せるものすべてに `accessibilityRole` と、text がない場合は `accessibilityLabel` があるか？
- [ ] 外観に加えて `accessibilityState` でも状態を表したか？
- [ ] `testID` はすべて契約の operation 名または `<operation>.<field>` で、見える用語はすべて用語集の用語か？表示文言を id にコピーしていないか？
