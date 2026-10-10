---
description: "🧪 Next.js / backend — テスト設計"
applyTo: "**/*.test.ts,**/*.spec.ts,**/__tests__/**,**/vitest.config.*,**/jest.config.*"
---

# 🧪 Next.js / backend — テスト設計

> **対象: Next.js（App Router）のサーバー側処理。** Next.js でなければ適用外として扱い、破棄する。
>
> **共通規約は [common/testing.md](common-testing.instructions.md)**（runner はプロジェクトが宣言する。単一コマンドで実行。
> 決定性、スイート分離、`UC-nnn` / `@covers`）。この文書は **それらに従った上で**、
> 役割ごとに何をどう試すかだけを扱う。共通側は再掲しない。
>
> 責務分離は [backend/coding.md](backend-coding.instructions.md) にある。
> **読み取り配線（RSC page）の FE 側単体テストは作成しない**（フロントエンド単体テスト規約は置かない）。page は UC のシナリオテスト（[system-testing.md](system-testing.instructions.md)）で端から端まで観測する。
>
> **テスト名とコメントは日本語で書く。**

---

## 1. 役割ごとの主戦場

| 役割 | 既定スイートでの扱い |
| --- | --- |
| **Domain** | **最優先。** 副作用がなく mock も不要な単体テスト |
| **Use case** | **書く。** infrastructure は境界 mock または fake 実装にする。**シナリオ結果**（`ok` / `reason` など）を検証する |
| **Infrastructure** | 既定では実 DB や実外部 API を要求しない。書くなら結合スイートに置く |
| **ミューテーション・コントローラー**（Actions / Route Handlers）| **薄く書く。** 境界のスキーマ検証失敗、シナリオ結果から呼び出し側向けの形への写像、ユースケース呼び出しを検証する。Actions = Result、RH = status + body（[backend/coding.md](backend-coding.instructions.md) §6）。`revalidatePath` などは mock にする |

玉ねぎの内側ほど、容易かつ安価に反証できる。**肥大化した Server Action にテストを集めない。**

---

## 2. domain

```ts
describe("UC-012 名前変更方針", () => {
  it("空の表示名を拒否する", () => {
    // @covers REQ-045#empty-name
    expect(decideDisplayName(current, "  ").ok).toBe(false);
  });
});
```

- `next/*`、DB、時計に触れない
- 正常系だけで終わらず、失敗・空・権限・境界を扱う

---

## 3. ユースケース

- infrastructure 依存は引数で注入できる形を前提とする
- mock は **infrastructure 境界だけ**に置く（domain の内部まで mock にしない）
- 返すのはシナリオ結果である。呼び出し側向けの形への写像はミューテーション・コントローラーのテストで調べる

---

## 4. ミューテーション・コントローラー（Server Actions / Route Handlers）

両方に共通して、**不正入力**ではユースケースを呼ばず、失敗を区別できること。**正しい入力**では期待する引数でユースケースを呼び、シナリオ結果が呼び出し側向けの形に収まること。

| 実装形態 | 見るもの |
| --- | --- |
| Server Actions | 呼び出し側向け Result の成功 / 失敗 |
| Route Handlers | HTTP status + body（契約と一致するか）|

Next 固有 API は mock にする。cache key を総当たりする必要はない。

ある契約 operation についてテストが呼ぶファイルと export は、[common/testing.md](common-testing.instructions.md) の「operation → 入口」規約に従う。実装ではなく契約から導出する。

---

## 5. infrastructure と結合スイート

- 実 DB のテストは結合スイートへ置き、既定スイートから外す
- 既定では in-memory fake または mock を使い、境界の入出力だけを扱う

---

## ✅ 返却前チェックリスト

- [ ] 純粋な domain テストが主戦場か？
- [ ] ユースケースのテストでは infrastructure だけを境界 mock にしているか？
- [ ] ミューテーション・コントローラーのテストは境界と成功／失敗の区別に閉じているか（Actions = Result、RH = status + body）？
- [ ] 読み取り配線のテストを backend に必須としていないか（frontend のもの）？
- [ ] 実 DB テストを結合フォルダーに分け、既定から除外しているか？
- [ ] 最外グループに `UC-nnn`、各テストに `@covers REQ-nnn#class` があるか？
