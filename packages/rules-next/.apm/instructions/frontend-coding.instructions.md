---
description: "🎨 Next.js / frontend — 表層コーディング規約"
applyTo: "**/next.config.*,**/app/**/page.tsx,**/app/**/layout.tsx,**/app/**/loading.tsx,**/app/**/error.tsx,**/app/**/not-found.tsx,**/app/**/template.tsx,**/app/**/default.tsx,**/components/**,**/features/**"
---

# 🎨 Next.js / frontend — 表層コーディング規約

> **対象: Next.js（App Router）の UI 表層。** Next.js でなければ適用外として扱い、破棄する。
>
> **共通規約は [common/coding.md](common-coding.instructions.md)**。サーバー側の責務分離は
> [backend/coding.md](backend-coding.instructions.md)（Actions の本体、玉ねぎ構造。FE 実装者の bundle に含まれる。develop skill の `references/bundles.md`「配送先の決定」）。
> データの方向と状態の置き場所は [dataflow.md](frontend-dataflow.instructions.md) にある。
> コンポーネントの粒度は [components.md](frontend-components.instructions.md)、画面の置き場所は [routing.md](frontend-routing.instructions.md) にある。
> **FE 単体テストは作成しない**（フロントエンド単体テスト規約は置かない。共通の配線は [common/testing.md](common-testing.instructions.md)）。画面は UC のシナリオテスト（[system-testing.md](system-testing.instructions.md)）で端から端まで観測し、§5 が出力する文言と識別子で要素を探す。
> この文書は **それらに従った上で**、RSC / Client 境界と page の薄さだけを定義する。共通側は再掲しない。
>
> **harness はディレクトリ名（`components/` など）を固定しない。** 場所はプロジェクトの `CLAUDE.md` に記録する。
>
> **コメントとユーザー向けの文言は日本語で書く。**

---

## 0. 目的の定義（RSC が既定である理由）

App Router では、何も指定していないファイルは **Server Component** として扱われる。
Client Component（`"use client"`）は例外であり、対話性が必要な境界を切り出すために使う。

page の根や大きな枝に `"use client"` を置くと、その配下のツリー全体が client bundle に入り、
サーバーに残せた取得処理、秘密情報、重い依存まで引き込む。

**この文書の役割は、必要になる前に Client へ落とす抜け道を塞ぐことである。**

---

## 1. Server Component を既定とし、Client は末端に置く

- **原則すべて Server Component とする**
- `useState` / `useEffect` / browser 専用 API / event handler（`onClick` など）が必要な **最小の末端**だけ、ファイル先頭に `"use client"` を書く
- Client 境界は **できるだけ末端に近く**置く（page 全体を Client にしない）

---

## 2. page / layout は読み取り配線に閉じる

`page.tsx` / `layout.tsx` に複雑な UI 構造や styling の本体を書かない。
**構成と読み取り配線だけ**を持ち、表示の本体は表示用コンポーネントへ渡す。

読み取り配線は玉ねぎ構造の **外側の入口**の一形態である（[backend/coding.md](backend-coding.instructions.md) §1、§3）。

- page に infrastructure や domain を直接書かない
- `params` / `searchParams` はユースケースへ渡す前に境界で検証する
- 不正な入力は `notFound()` などで扱う。取得結果は view の props に写像する（空 / エラー / 権限なしなど）
- **segment の枠で待つ処理**は `loading.tsx`。初回 suspense を `loading` prop で二重に持たない（[components.md](frontend-components.instructions.md) §3）

```tsx
//  OK: 読み取り配線（検証 → ユースケース → ビュー）
export default async function UserPage({ params }: Props) {
  const raw = await params;
  const parsed = UserIdSchema.safeParse(raw);
  if (!parsed.success) notFound();

  const outcome = await getUser({ id: parsed.data.id });
  if (!outcome.ok) {
    if (outcome.reason === "not_found") notFound();
    return <UserDetailView user={null} error={toUserMessage(outcome.reason)} />;
  }
  return <UserDetailView user={outcome.user} error={null} />;
}
```

```tsx
//  NG: page に取得と表示と判定が同居／params を未検証のまま流す
export default async function UserPage({ params }: Props) {
  const { id } = await params;
  const row = await prisma.user.findMany();
  //  ...大量の JSX
}
```

粒度と JSX の担当は [components.md](frontend-components.instructions.md) にある。例の SSOT はこの文書である（他の末端文書はリンクのみ）。

---

## 3. Client からサーバーレイヤーを import しない

`"use client"` モジュールが import できるのは、おおむね次だけである。

- 他の Client Component と、クライアント内に閉じる UI utility
- **Server Actions**（更新の入口。**本体は backend-logic の責務**）
- 公開してよい設定値（`NEXT_PUBLIC_` など）

**Client からユースケース、infrastructure、サーバーを前提とする domain 実装を import しない。**

---

## 4. ミューテーションは Server Actions を通す

同一アプリ内でサーバー側の正本を変更する処理は、Client から infrastructure を叩く代わりに、
**Server Action（ミューテーション・コントローラー）を呼ぶ**。

- Actions / Route Handlers の **本体**（zod、ユースケース、`revalidatePath`）は
  [backend/coding.md](backend-coding.instructions.md) に従い **backend-logic が書く**
- frontend-logic は **Action の呼び出しと props の受け渡し**に留める
- 外部 client 向け HTTP は Route Handlers（backend）。**Client が独自に「公開 API」を直接叩いて更新しない**
  （ブラウザー向け更新入口は Actions が既定）

---

## 5. 文言と識別子は導出して出力する

シナリオテストはあなたの markup を読まず、あなたと同じ SSOT から locator を導出する（ADR-0037）。テストが探すものをそのまま出力する。

| 対象 | 出力するもの | 導出元 |
| --- | --- | --- |
| 見える文言（button 文言、label、見出し、行の文言）| **用語集の用語**をそのまま | `docs/01-glossary.md`（同義語や「親しみやすい」言い換えは使わない。新しい用語はゲートを通して用語集へ追加する）|
| 契約 operation を実行する control | `data-testid="<operation>"` | `contract.yaml` の operation 名（`data-testid="renameUser"`）|
| request field の入力 | `data-testid="<operation>.<field>"` | request field 名（`data-testid="renameUser.name"`）|
| 押せるものすべて、form control すべて | 本来の role（`<button>`、`<a href>`、`<label>` 付き `<input>`）| id なしで `getByRole` / `getByLabel` が解決できるようにする |

- **表示文言を識別子へコピーしない**。契約にない識別子を発明しない。シナリオテストはそれを導出できない。
- 報告では **文言 → 識別子の表**を返す。orchestrator は目視確認の前にシナリオテストと突き合わせ、**不一致なら外観側を動かす**。

---

## ✅ 返却前チェックリスト

- [ ] 見える用語はすべて用語集の用語で、operation control / request input のすべてに `data-testid="<operation>"` / `"<operation>.<field>"` があるか？
- [ ] `"use client"` は page の根でなく、対話が必要な末端にあるか？
- [ ] `page.tsx` / `layout.tsx` は読み取り配線に閉じ、UI 本体を下へ渡しているか？
- [ ] `params` / `searchParams` はユースケースに渡す前に検証されているか？
- [ ] 読み取りのために page から infrastructure（Prisma など）を直接呼んでいないか？
- [ ] Client Component がユースケース、infrastructure、サーバーを前提とする domain を import していないか？
- [ ] 同一アプリ内の更新は Server Actions を通しているか（本体は backend）？
