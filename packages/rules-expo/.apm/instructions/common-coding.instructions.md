---
description: "📐 Expo — 共通コーディング規約（全レイヤー）"
applyTo: "**/*.tsx,**/*.ts,**/app.json,**/app.config.*,**/eas.json"
---

# 📐 Expo — 共通コーディング規約（全レイヤー）

> **対象: Expo（expo-router）の React Native アプリ。**
> この文書は拡張子で適用されるため、Expo 以外の TypeScript / React プロジェクトにも注入され得る。
> **対象が Expo でなければ、この文書は適用外として扱い**、破棄する。
>
> この文書が持つのは **レイヤーをまたいで成立する規約**だけである。表層（RN runtime、styling、画面）の規約は
> [frontend/coding.md](frontend-coding.instructions.md) にあり、**この文書との差分**である。
> **共通規約をレイヤーの末端文書へコピーしない**（SSOT はここ一か所）。
>
> **コメントとユーザー向けの文言は日本語で書く。**

---

## 0. 整形はこの文書ではなくツールが決める

インデント、改行、引用符、セミコロン、import 順序の **正本はプロジェクトの lint / format コマンド**であり、
この文書では定義しない。手作業で列を揃えない。**返却前に format コマンドを実行する。**

規約が衝突したらツールの出力を優先する（人間が見るのもそれだけである）。

---

## 1. 成功させるために型を弱めない

**「型エラーを消すため」に `as any` / 非 null アサーション（`!`）/ `@ts-expect-error` / `eslint-disable` を書かない。**

書く必要があることは **型か契約のどちらかが間違っている**という兆候である。
黙って抑制すると、その先の作業が誤った前提の上に積み重なり、実行時に別の場所へ現れる。

```ts
//  NG: 契約が合っていないのを型で押し潰している
const user = res.data as any;

//  NG: 「たぶん来る」を型に約束させている
const id = params.id!;
```

**抑制したくなったら実装を止め、「何と何が衝突しているか」を報告する**（各実装者の出力契約に従う）。
辻褄を合わせるために自分で契約を書き換えない。

唯一の例外は **外部ライブラリの型定義と実際の挙動が異なる場合**であり、その場合は理由をコメントに残す。

---

## 2. モジュールの形

### default export を使わない

import 側が自由に名前を付けられるため、同じものが呼び出し先ごとに違う名前になる。
**named export に統一する。**

```ts
//  NG
export default function UserCard() {}

//  OK
export function UserCard() {}
```

> **唯一の例外: expo-router の route ファイル（`app/**`）は `export default` を要求する。**
> フレームワークが画面として解決するため、named export では **ルートが空になる**。
> 詳細は [frontend/routing.md](frontend-routing.instructions.md) にある。

### barrel を作らない

再 export だけを行う `index.ts` を置かない。循環 import の温床となり、bundler に不要な配線を増やす。

さらに **`app/` 配下では `index.ts` 自体がルート**なので、barrel として置くと余分な画面が増える。

### 相対パスを積み重ねない

`../../../` を書かず、tsconfig のパスエイリアス（Expo の既定では `@/`）を使う。
ファイルを移動した瞬間に参照がすべて壊れることを防ぐ。

---

## 3. 環境変数と秘密情報

**`EXPO_PUBLIC_` を接頭辞に持つ環境変数と `app.config.ts` の `extra` は
build 時に client bundle へ埋め込まれる。つまり公開される。**

配布済みアプリの bundle は取り出せるため、そこへ置いたものは秘密情報ではない。

- API のベース URL、feature flag、公開鍵 → 置いてよい
- API の秘密情報、署名鍵、管理者 token → **置かない**

秘密情報を必要とする処理が必要になった場合、その処理は client に置けない。
**実装を止めて報告する**（サーバー側の設計を自分で決めない）。

---

## 4. 依存追加の境界

**native code を含む package を独断で追加しない。**

追加すると既存の dev build、Expo Go、配布済み build で動かなくなる。**native の再 build が必要**である。
`npm install` の成功は動作の証拠ではない（JS 側が解決されただけ）。

依存追加が必要になったら **何を、なぜ追加したいかを報告し、止まる**。
プロジェクトに既に存在する依存の利用は制限しない。

---

## ✅ 返却前チェックリスト

- [ ] lint / format コマンドを実行したか？
- [ ] 成功させるために `as any` / `!` / `@ts-expect-error` / `eslint-disable` を追加していないか？
- [ ] `app/` の外で `export default` を使っていないか？
- [ ] 秘密情報かもしれない値を `EXPO_PUBLIC_` / `extra` に置いていないか？
- [ ] 許可なしに native 依存を追加していないか？
