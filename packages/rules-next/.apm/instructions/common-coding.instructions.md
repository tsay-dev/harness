---
description: "📐 Next.js — 共通コーディング規約（全レイヤー）"
applyTo: "**/next.config.*,**/middleware.ts,**/middleware.js,**/app/**/page.tsx,**/app/**/layout.tsx,**/app/**/route.ts,**/app/**/route.tsx,**/app/**/loading.tsx,**/app/**/error.tsx,**/app/**/not-found.tsx,**/app/**/template.tsx,**/app/**/default.tsx,**/app/**/actions.ts,**/app/**/actions.tsx,**/actions/**/*.ts,**/actions/**/*.tsx,**/components/**,**/features/**,**/domain/**,**/infrastructure/**,**/use-cases/**,**/usecases/**"
---

# 📐 Next.js — 共通コーディング規約（全レイヤー）

> **対象: Next.js（App Router）の TypeScript プロジェクト。**
> 利用先の `CLAUDE.md` でプラットフォーム／フレームワークを `web/next` と宣言していることを前提とする。
> この文書の `applyTo` は Next らしい手掛かり（`next.config.*`、`app/**/page.tsx` など）による弱い適用判定である。
> **対象が Next.js（App Router）でなければ、この文書は適用外として扱い**、破棄する。
>
> この文書が持つのは **レイヤーをまたいで成立する規約**だけである。サーバー側の責務分離は
> [backend/coding.md](backend-coding.instructions.md)、RSC / Client の表層は
> [frontend/coding.md](frontend-coding.instructions.md)、テストの配線は [testing.md](common-testing.instructions.md) にある。
> それらは **この文書との差分**である。**共通規約をレイヤーの末端文書へコピーしない**（SSOT はここ一か所）。
>
> **コメントとユーザー向けの文言は日本語で書く。**

---

## 0. 整形はこの文書ではなくツールが決める

インデント、改行、引用符、セミコロン、import 順序の **正本はプロジェクトの lint / format コマンド**であり、
この文書では定義しない。手作業で列を揃えない。**返却前に format コマンドを実行する。**

規約が衝突したらツールの出力を優先する（人間が見るのもそれだけである）。

---

## 1. 成功させるために型を弱めない

**「型エラーを消すため」に `any` / `as any` / 非 null アサーション（`!`）/ `@ts-expect-error` / `eslint-disable` を書かない。**
未知の値は `unknown` として扱い、使用前に絞り込む。

特に、Server Actions、Route Handlers、`searchParams` / `params` など、**外から来た値に `as` で業務型を貼り付けない**。
境界で実行時検証を経ていない値の型を信じること
（[backend/coding.md](backend-coding.instructions.md)）は、実行時に別の場所へ現れる欠陥である。

```ts
//  NG: 外から来た値を型で押し潰している
const input = raw as CreateUserInput;

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

> **唯一の例外: App Router がファイル規約で要求する default export。**
> 少なくとも `page.tsx` / `layout.tsx` / `route.ts(x)` / `loading.tsx` / `error.tsx` /
> `not-found.tsx` / `template.tsx` / `default.tsx` はフレームワークが default export を通じて解決する。
> そこで named export を使うと **ルートや特殊 UI が空になる**（ビルドは通ることもある）。

### barrel を作らない

再 export だけを行う `index.ts` を置かない。循環 import の温床となり、bundler に不要な配線を増やす。

`app/` 配下では、配置とファイル名そのものがルーティング仕様である。
barrel のつもりで置いたファイルが意図しないルートや特殊ファイルとして解決されないか注意する。

### 相対パスを積み重ねない

`../../../` を書かず、tsconfig のパスエイリアス（多くの Next プロジェクトでは `@/`）を使う。
ファイルを移動した瞬間に参照がすべて壊れることを防ぐ。

---

## 3. 環境変数と秘密情報

**`NEXT_PUBLIC_` を接頭辞に持つ環境変数はクライアント bundle に埋め込まれる。つまり公開される。**

- 公開 API のベース URL、公開鍵、feature flag → 置いてよい
- API の秘密情報、署名鍵、DB URL、管理者 token → **`NEXT_PUBLIC_` を付けない。サーバー専用の環境変数に置く**

Client Component 側で秘密情報を必要とする処理が必要になった場合、その処理はクライアントに置けない。
**実装を止めて報告する**（サーバー側の設計を自分で決めない）。

---

## 4. `middleware` に業務処理を沈めない

`middleware.ts` は薄いリクエスト境界に限定する（redirect、header、認証 cookie の有無の確認など）。
**ドメイン判断、DB アクセス、ユースケース呼び出しを置かない。**

本体を置く場所（[backend/coding.md](backend-coding.instructions.md) §1.1 が所管）:

- **ミューテーション**（Actions / Route Handlers）→ backend-logic
- **読み取り配線**（`page` / `layout`）→ frontend-logic
- **`middleware.ts` 自体**（薄い境界のみ）→ backend-logic（別担当に分けるなら `CLAUDE.md` に宣言する）
- いずれもユースケースを通さずに業務を完結しない。定義は [backend/coding.md](backend-coding.instructions.md) §1 にある

---

## ✅ 返却前チェックリスト

- [ ] lint / format コマンドを実行したか？
- [ ] 成功させるために `any` / `as any` / `!` / `@ts-expect-error` / `eslint-disable` を追加していないか？
- [ ] App Router が要求するファイル以外で `export default` を使っていないか？
- [ ] 再 export だけの `index.ts` を置いていないか？
- [ ] 秘密情報かもしれない値を `NEXT_PUBLIC_` に置いていないか？
- [ ] `middleware` に業務ロジックや DB アクセスを書いていないか？
