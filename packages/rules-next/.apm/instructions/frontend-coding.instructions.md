---
description: "🎨 Next.js / frontend — 表層コーディング規約"
applyTo: "**/next.config.*,**/app/**/page.tsx,**/app/**/layout.tsx,**/app/**/loading.tsx,**/app/**/error.tsx,**/app/**/not-found.tsx,**/app/**/template.tsx,**/app/**/default.tsx,**/components/**,**/features/**"
---

# 🎨 Next.js / frontend — 表層コーディング規約

Next.js（App Router）の UI 表層が対象。対象外なら破棄する。共通規約は [common-coding](common-coding.instructions.md)、サーバー側の責務分離と担当は [backend-coding](backend-coding.instructions.md)。FE 単体テストは作らず、画面は UC のシナリオテスト（[system-testing](system-testing.instructions.md)）で観測する。harness はディレクトリ名を固定せず、場所はプロジェクトの `CLAUDE.md` に記録する。コメントとユーザー向け文言は日本語。

## RSC / Client 境界と page の薄さ

- 既定は Server Component。`"use client"` は `useState` / `useEffect` / browser API / event handler が必要な最小の末端だけに置き、page の根や大きな枝に置かない。
- `page.tsx` / `layout.tsx` は読み取り配線（`params` / `searchParams` の境界検証 → 既存ユースケース呼び出し → view props への写像）に閉じ、JSX 本体と styling は表示用コンポーネントへ渡す。infrastructure や domain を直接書かない。
- 不正な入力は `notFound()` などの到達可能な UI で扱う。取得結果の空 / エラー / 権限なしは view props で表す。segment の枠で待つ処理は `loading.tsx` に置き、初回 suspense を `loading` prop と二重に持たない。
- `"use client"` モジュールが import できるのは、他の Client Component、クライアント内に閉じる UI utility、Server Actions、公開設定値（`NEXT_PUBLIC_`）だけ。ユースケース、infrastructure、サーバーを前提とする domain を import しない。
- 同一アプリ内の更新は Server Action を呼ぶ。Action / Route Handler の本体は backend 側の logic 担当が書き、frontend 側の logic 担当は呼び出しと props の受け渡しに留める。Client が公開 HTTP API を直接叩いて更新しない。

## 文言と識別子は導出して出力する

シナリオテストは markup を読まず、同じ SSOT から locator を導出する（ADR-0037）。テストが探すものをそのまま出力する。

| 対象 | 出力するもの | 導出元 |
| --- | --- | --- |
| 見える文言（button、label、見出し、行）| 用語集の用語そのまま | `docs/01-glossary.md`。同義語や言い換えを使わず、新しい用語はゲートを通して用語集へ追加する |
| 契約 operation を実行する control | `data-testid="<operation>"` | `contract.yaml` の operation 名（`data-testid="renameUser"`）|
| request field の入力 | `data-testid="<operation>.<field>"` | request field 名（`data-testid="renameUser.name"`）|
| 押せるもの、form control すべて | 本来の role（`<button>`、`<a href>`、`<label>` 付き `<input>`）| id なしで `getByRole` / `getByLabel` が解決できること |

表示文言を識別子へコピーせず、契約にない識別子を発明しない。報告では文言 → 識別子の表を返す。シナリオテストと不一致なら外観側を動かす。
