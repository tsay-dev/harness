---
description: "🧪 Next.js — 共通テスト規約（全レイヤー）"
applyTo: "**/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx,**/__tests__/**,**/vitest.config.*,**/jest.config.*,**/playwright.config.*"
---

# 🧪 Next.js — 共通テスト規約（全レイヤー）

> **対象: Next.js（App Router）の TypeScript プロジェクト。** Next.js でなければ適用外として扱い、破棄する。
>
> **テストの原則（何を、なぜ検証するか）は develop の開発プロセスに従う。**
> 1 テスト = 1 振る舞い、条件に失敗・空・権限・境界を含める、mock は境界だけに置く、
> 決定的にする、coverage は目標ではなく手掛かり。これらはすべての開発に共通するため、ここでは再掲せず、その原則に従う。
>
> この文書が持つのは **Next.js でその原則を成立させる配線**だけである。
> レイヤー固有の書き方は [backend/testing.md](backend-testing.instructions.md) にある。
> **フロントエンドの単体テスト規約は置かない**（develop は FE 単体テストを作成しない）。ブラウザーを起動するユースケースごと 1 本のシナリオテストを持つシステムスイートは [system-testing.md](system-testing.instructions.md) にある。
> 記法は [common/coding.md](common-coding.instructions.md) にある。
>
> **テスト名とコメントは日本語で書く。**

---

## 1. runner はプロジェクトが宣言する

**harness は特定の test runner や UI テストライブラリを固定しない。**
選択、設定、**既定スイートを実行するコマンド**を利用先の `CLAUDE.md` に記録する。

- **単一コマンドで既定スイート全体を実行でき、終了コードで Red / Green が決まること**
- **未導入なら、導入が開始のゲートである。** runner がないまま実装を進めると、
  develop の Phase4（機械 oracle が駆動する Red-Green ループ）が成立しない

---

## 2. テストから operation を呼ぶ（operation → 入口）

契約適合テストは **契約が示す入口**で operation を呼び、実装から知った symbol を使わない。
`test-author` と `implementer` はそれぞれ `contract.yaml` と下表から入口を導出し、互いからは導出しない
（実装より先にテストが存在する場合も、その逆もある）。`app/` の場所は利用先が定める（`CLAUDE.md`）。

| 契約（`contract.yaml`）| テストが import するファイル | 呼ぶ export |
| --- | --- | --- |
| `transport: http`、`wire.path: /api/users`、`wire.method: POST` | `app/api/users/route.ts`（`wire.path` を `app/` 配下に置き、その下の `route.ts`）| `wire.method` と同名の export（`POST`）。`examples.*.request` から作った `Request` で呼ぶ |
| Server Action（プロジェクト ADR による `transport: internal`、または利用先が Actions に対応付ける同一アプリ内の更新）| feature の `actions.ts`（`CLAUDE.md` で宣言したミューテーション・コントローラーの場所）| **operation と完全に同名**の export（operation `renameUser` なら `renameUser`）。`examples.*.request` を引数に呼ぶ |
| 任意の operation を利用先の `commands.contract_adapter`（`traceconfig.json`）経由で呼ぶ場合 | なし。テストは operation 名と example で adapter をプロセス内で駆動する。テストコードに実装 symbol は登場しない | — |

実装が別の場所に入口を置いたなら実装を移す。テストは契約から導出される（R-801）。

---

## 3. 範囲を絞った実行（UC タグ）と要求の検証（`@covers`）

各テストの最外グループ（多くの runner では `describe`）を次の名前にする。

`UC-012 <UC の題名>`

UC ID（`docs/goals/` 配下の UC ディレクトリ名と同じキー）によって機械的に選択できるようにする。

- **各テストは宣言済み分割クラスをちょうど 1 つ示す**。`it` / `test` 本体の先頭行に `// @covers REQ-045#accept-standard` を置く（`trace-check` C10 / C11 が読む。先に REQ の `## 検証方針` でクラスを宣言する）
- runner に合わせた具体的な選択コマンドを `CLAUDE.md` に書く（例: `UC-012` の名前フィルター）
- **修正ラウンドでは選択実行だけを行い、既定スイート全体は完了条件と CI で 1 回実行する。** この末端文書は UC ID の付与・選択方法だけを定義する
- **新規テストをタグなしにしない**（タグがないと範囲を絞った実行から外れ、回帰検出が境界まで持ち越される）

---

## 4. 決定的にする（Next で不安定になるもの）

実時間、乱数、ネットワーク、実 DB に暗黙に依存しない。必要な箇所では注入し、テストで固定する。

| 不安定さの原因 | 対処 |
| --- | --- |
| 実ネットワーク / 実 DB | 既定スイートでは使わない。境界を mock または fake にする |
| `Date.now` / timer | 固定するか、fake timer で進める |
| 実時間の `sleep` | **使わない。** CI の負荷で不安定になる |
| `next/cache`、`cookies`、`headers` など | ミューテーション・コントローラー（Actions / RH）のテストで触れるなら mock にする。ユースケースには入らないことが前提（[backend/coding.md](backend-coding.instructions.md)）|

テストは **実行順序に依存しない**。共有された可変 global を変更したら必ず元に戻す。

---

## 5. 実行に必要なものによってスイートを分ける

最初にテスト階層名（unit / integration / system）を選んで分類するのではなく、
**そのテストを実行するために何を起動する必要があるか**で分ける。

| スイート | 判定基準（これだけで決める）| 場所（既定の例）| 実行頻度 |
| --- | --- | --- | --- |
| **既定** | 外部環境を起動しない（mock は境界のみ）| 対象構造を反映した配置、`__tests__/` など | Red-Green ループで使うスイート（ラウンド中は選択実行、全体実行は完了条件と CI だけ）|
| **結合** | **実 DB または実サービスに接続する** | `tests/integration/` | 境界のみ（返却前、commit 前、CI）|
| **システム** | **ブラウザーを起動する** | `e2e/` | シナリオテスト（UC ごと 1 本）。FE 配線ラウンドでは UC 選択実行、境界で一度全体実行（`commands.system` を宣言した場合の終端チェックリスト、CI）。[system-testing.md](system-testing.instructions.md) |

- **フォルダーで分ける。** タグだけの分離では、設定の穴から既定スイートへ漏れたときに気付けない
- **結合・システムの配置を既定スイートの探索から除外する**（runner 設定で ignore にする）。忘れるとブラウザーや実 DB が Red-Green ループへ入り込む
- **DB もブラウザーも利用できないマシンで既定スイートが Green になること**
- 場所を変更するプロジェクトは **`CLAUDE.md` に宣言する**。判定基準と「既定へ混ぜない」は変わらない
- **システムスイートはシナリオテストだけを持つ**（`docs.instructions.md` R-1106–R-1108）。書き方は [system-testing.md](system-testing.instructions.md)。この文書は場所と混在禁止だけを定義する

### 契約適合テストは既定スイートに属する

バックエンドの契約適合テスト（入出力、純粋関数。[backend/testing.md](backend-testing.instructions.md)）は
外部環境を起動しないため、**結合テストではない**。

**結合スイートへ移動しない。** develop の Phase4 Red-Green ループは **BE テスト**が担う（FE 単体テストは作成しない。シナリオテストはループ内ではなく境界で完結する）。

---

## 6. coverage は目標ではなく手掛かり

coverage の割合は見ていない箇所への手掛かりであり、**達成すべき目標ではない**。
**テストが Green であることは前提条件であり、完了の定義ではない。** Green の後は対抗的検証（`reviewer`、必要なら `/attack`）で欠陥を暴く。

---

## ✅ 返却前チェックリスト

- [ ] 既定スイートの実行コマンドが `CLAUDE.md` にあり、終了コードで Red / Green が分かるか？
- [ ] 最外グループに `UC-nnn`、各テストに `@covers REQ-nnn#class` があるか？
- [ ] 実時間の sleep、実 DB、ブラウザー起動が既定スイートに混ざっていないか？
- [ ] 結合・システムが別フォルダーにあり、既定の探索から除外されているか？
