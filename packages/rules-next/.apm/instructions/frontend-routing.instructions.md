---
description: "🧭 Next.js / frontend — ルーティング（App Router）"
applyTo: "**/next.config.*,**/app/**/page.tsx,**/app/**/layout.tsx,**/app/**/loading.tsx,**/app/**/error.tsx,**/app/**/not-found.tsx,**/app/**/template.tsx,**/app/**/default.tsx,**/components/**,**/features/**"
---

# 🧭 Next.js / frontend — ルーティング（App Router）

Next.js（App Router）が対象。対象外なら破棄する。表層の規約は [frontend-coding](frontend-coding.instructions.md)。この文書は画面の場所と「URL から直接開かれる」前提だけを定める。コメントとユーザー向け文言は日本語。

- `app/` に置くのは到達可能な UI の入口とフレームワークが要求する特殊ファイルだけ。汎用コンポーネント、hook、domain、ユースケース、style は `app/` の外（場所は `CLAUDE.md`）。`app/` 配下の Server Actions もミューテーション・コントローラーとして薄く保つ（[backend-coding](backend-coding.instructions.md)）。
- ファイル配置がルーティング仕様。1 つの `page.tsx` 内で分岐して複数の「画面」を表示する疑似 route を作らない。2 画面なら 2 segment。
- すべての page は前の画面を経由せず直接開かれ得る。前の画面の値や state を前提にしない。
- `params` / `searchParams` は文字列（または文字列の配列）で到着する。数値、boolean、日付として使うなら読み取り配線の境界で parse し、失敗を扱う。不正な `id` は到達可能な状態であり、`notFound()` / エラー UI / view props の error・empty で表示を明示する。
- URL に載せるのは id、または filter として意味のある短い query だけ。JSON や大きな state を searchParams や path に詰め込まず、本体はユースケース経由でサーバーの正本から取得する。
- 宣言的遷移は `next/link` の `<Link>` を既定とし、`useRouter().push` / `replace` は Client の event handler またはロジック側からだけ呼ぶ（render 中には呼ばない）。未検証の値を href に連結しない。外部 URL への `Link` や `redirect` は、プロジェクト側で許可する遷移先を制限する。
- アプリ全体で共有する Client provider（theme、toast、client 側 cache）は根の `app/layout.tsx`（またはプロジェクトが決めた単一箇所）に置き、page ごとに増やさない。
