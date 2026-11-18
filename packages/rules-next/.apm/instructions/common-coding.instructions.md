---
description: "📐 Next.js — 共通コーディング規約（全レイヤー）"
applyTo: "**/next.config.*,**/middleware.ts,**/middleware.js,**/app/**/page.tsx,**/app/**/layout.tsx,**/app/**/route.ts,**/app/**/route.tsx,**/app/**/loading.tsx,**/app/**/error.tsx,**/app/**/not-found.tsx,**/app/**/template.tsx,**/app/**/default.tsx,**/app/**/actions.ts,**/app/**/actions.tsx,**/actions/**/*.ts,**/actions/**/*.tsx,**/components/**,**/features/**,**/domain/**,**/infrastructure/**,**/use-cases/**,**/usecases/**"
---

# 📐 Next.js — 共通コーディング規約（全レイヤー）

対象は利用先の `CLAUDE.md` が `web/next` と宣言した Next.js（App Router）の TypeScript プロジェクト。`applyTo` は弱い手掛かりであり、対象でなければ適用外として破棄する。レイヤー別の末端文書はこの文書との差分だけを持つ。コメントとユーザー向け文言は日本語。

- 整形（インデント、引用符、import 順序など）の正本はプロジェクトの lint / format コマンド。返却前に実行し、衝突したらツールの出力に従う。
- lint で止める決まり（型の抜け道、default export、barrel、相対の読み込みの積み重ね、レイヤーをまたぐ読み込み）は [lint で止める項目](common-lint.instructions.md) にあり、ここでは繰り返さない。
- 外から来た値（Server Action の引数、Route Handler の body、`params` / `searchParams`）に `as` で業務型を貼らず、境界の実行時検証を通す。型エラーを抑えたくなったら実装を止め、何と何が衝突しているかを報告する。例外は外部ライブラリの型定義と実挙動の不一致だけで、理由をコメントに残す。
- `app/` 配下では配置とファイル名がルーティング仕様なので、意図しないルートや特殊ファイルとして解決されるファイルを置かない。
- 秘密情報（署名鍵、DB URL、管理者 token）を `NEXT_PUBLIC_` に置かない。Client で秘密情報が必要になったら実装を止めて報告し、サーバー側の設計を自分で決めない。
- `middleware.ts` は薄いリクエスト境界（redirect、header、認証 cookie の有無）に限り、ドメイン判断、DB アクセス、ユースケース呼び出しを置かない。本体の置き場と担当は [backend-coding](backend-coding.instructions.md)。
