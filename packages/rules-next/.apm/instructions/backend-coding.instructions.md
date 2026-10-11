---
description: "⚙️ Next.js / backend — 責務分離（サーバー側の差分）"
applyTo: "**/next.config.*,**/app/**/route.ts,**/app/**/route.tsx,**/app/**/actions.ts,**/app/**/actions.tsx,**/actions/**/*.ts,**/actions/**/*.tsx,**/domain/**,**/infrastructure/**,**/use-cases/**,**/usecases/**"
---

# ⚙️ Next.js / backend — 責務分離（サーバー側の差分）

Next.js（App Router）のサーバー側処理が対象。対象外なら破棄する。共通規約は [common-coding](common-coding.instructions.md)。harness はディレクトリ名を固定せず（`applyTo` の `domain/` などは手掛かり）、固定するのは役割分離そのもの。場所はプロジェクトの `CLAUDE.md` に記録する。コメントとユーザー向け文言は日本語。

## 4 つの役割と依存の方向

| 役割 | 責務 | 許される参照 | 含めてはいけないもの |
| --- | --- | --- | --- |
| Domain | 業務規則、判断、計算 | なし（純粋）| DB / HTTP / 時計 / 乱数などの副作用、`next/*` |
| Use case | シナリオの組み立て（infra で読取 → domain で判断 → infra で書込）。シナリオ結果（成功データまたは理由コード）を返す | domain、infrastructure | 外側の入口、`revalidatePath` / `redirect` / `cookies` / `headers` など Next 固有 API、SQL、長い業務分岐 |
| Infrastructure | 副作用: DB アクセス、外部 API、メール送信 | DB、HTTP client など | ユースケース、外側の入口、業務判断 |
| 外側の入口 | 信頼できない入力の検証、ユースケース呼び出し、Next / HTTP 固有 I/O（`revalidatePath` など）| ユースケース、境界スキーマ | infrastructure や domain の本体。入口と infrastructure を直結して業務を完結させない |

役割を 1 つの関数やモジュールに混ぜない。依存は常に内向き（入口 → ユースケース → domain。infrastructure → ユースケースは禁止）。

## 外側の入口の実装形態

| 実装形態 | 使う場面 | 成功 / 失敗の伝え方 |
| --- | --- | --- |
| ミューテーション・コントローラー — Server Actions | 同一アプリ内の更新（既定）| 呼び出し側向け Result（例: `{ success: true; data } \| { success: false; error }`）。生の例外 stack を公開しない |
| ミューテーション・コントローラー — Route Handlers（`route.ts`）| 外部公開 HTTP | HTTP status + body（同じ Result 形状を JSON で返してもよい）|
| 読み取り配線（`page.tsx` / `layout.tsx` の RSC）| 一覧・詳細の初回表示 | `notFound()` / エラー UI / view props（error / empty）への写像。Client 向け Result 型は不要 |

- 読み取り用の Server Actions を増やさない。
- ユースケースのシナリオ結果（`ok` / `reason` など）と呼び出し側向けの形は異なってよく、ミューテーション・コントローラーが境界で写像する。伝え方はプロジェクト全体で 1 方式に揃え、demo と実装でフィールド名を混在させない。
- 外から来る値は外側の入口の境界で 1 回だけ実行時スキーマ検証（既定は zod。別のものは `CLAUDE.md` に宣言）し、通過したものだけをユースケースへ渡す。ユースケースや domain で再検証を要求しない。業務の不変条件は domain の責務であり、スキーマ検証の代わりにならない。

## 配置の境界

- domain / use cases / infrastructure の本体と、Server Actions / Route Handlers の本体（検証、ユースケース呼び出し、`revalidatePath` など）、`middleware.ts` はサーバー側のコード。
- `page` / `layout` の読み取り配線（params 検証、既存ユースケース呼び出し、view への props 受け渡し）はユースケースと Actions を呼んで props で渡すだけで、本体を作ったり膨らませたりしない。読み取りに必要なユースケースがなければ先にサーバー側に用意する。
- 表示用の外観は props だけで表示が決まる。page の JSX をサーバー側の本体に置かない。
