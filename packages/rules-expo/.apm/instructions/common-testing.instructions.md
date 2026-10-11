---
description: "🧪 Expo — 共通テスト規約（全レイヤー）"
applyTo: "**/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx,**/__tests__/**,**/jest.config.*"
---

# 🧪 Expo — 共通テスト規約（全レイヤー）

> **対象: Expo（expo-router）の React Native アプリ。** Expo でなければ適用外として扱い、破棄する。
>
> **テストの原則（何を、なぜ検証するか）は develop の開発プロセスに従う。**
> 1 テスト = 1 振る舞い、条件に失敗・空・権限・境界を含める、mock は境界だけに置く、
> 決定的にする、coverage は目標ではなく手掛かり。これらはすべての開発に共通するため、ここでは再掲せず、その原則に従う。
>
> この文書が持つのは **Expo でその原則を成立させる配線**だけである。
> **フロントエンドの単体テスト規約は置かない**（develop は FE 単体テストを作成しない）。simulator を起動するユースケースごと 1 本のシナリオ flow を持つシステムスイートは [system-testing.md](system-testing.instructions.md) にある。記法は [common/coding.md](common-coding.instructions.md) にある。
>
> **テスト名とコメントは日本語で書く。**

---

## 1. runner と preset

**Jest と `jest-expo` preset を使う。**

素の `react-native` preset や独自の ts-jest 設定を作らない。preset は Expo module の解決先と
transpile の除外（`transformIgnorePatterns`）を既に揃えており、独自設定では
**「module を import した瞬間の syntax error」**を再現してしまう。
それは検証対象ではなく設定の欠陥なので、そこで時間を消費しない。

---

## 2. テストから operation を呼ぶ（operation → 入口）

契約適合テストは **契約が示す入口**で operation を呼び、実装から知った symbol を使わない。
`test-author` と `implementer` はそれぞれ `contract.yaml` と下表から入口を導出し、互いからは導出しない
（実装より先にテストが存在する場合も、その逆もある）。レイヤーは [frontend/dataflow.md](frontend-dataflow.instructions.md) に従い、module の場所は利用先が定める（`CLAUDE.md`）。

| 契約（`contract.yaml`）| テストが import するファイル | 呼ぶ export |
| --- | --- | --- |
| `transport: http` / `sdk`（送信側）、operation `fetchUser` | feature の API module。query 層の `queryFn` / `mutationFn` が import するファイル | **operation と完全に同名**の関数（`fetchUser`）。`examples.*.request` で呼び、network は境界で fake にする |
| `transport: local-store`、operation `saveAppearance` | feature の永続化 module（dataflow §7）| operation と完全に同名の関数（`saveAppearance`）。storage adapter は fake にする |
| `transport: device` / `deeplink` / `push` | OS 機能または受信入口を包む module | operation と完全に同名の関数。native module は mock にする |
| 任意の operation を利用先の `commands.contract_adapter`（`traceconfig.json`）経由で呼ぶ場合 | なし。テストは operation 名と example で adapter をプロセス内で駆動する。テストコードに実装 symbol は登場しない | — |

実装が別の場所に入口を置いたなら実装を移す。テストは契約から導出される（R-801）。

---

## 3. 単一コマンドで実行する

- **単一コマンドですべてを実行でき、終了コードで Red / Green が決まること**
- **未導入なら、導入が開始のゲートである。** runner がないまま実装を進めると、
  develop の Phase4（機械 oracle が駆動する Red-Green ループ）が成立しない
- 選択、設定、実行コマンドを **プロジェクトの `CLAUDE.md` に記録する**（harness は固定しない）
- **範囲を絞った実行（UC タグ）**: 各テストの最外 `describe` を
  `describe('UC-012 <UC の題名>', ...)` にし、UC ID で機械的に選択できるようにする
  （`docs/goals/` 配下の UC ディレクトリ名と同じキー）。選択実行は `jest -t "UC-012"`。
  **修正ラウンドでは選択実行だけを行い、既定スイート全体は完了条件と CI で 1 回実行する。** この末端文書は UC ID の付与・選択方法だけを定義する
- **要求の検証**: 各テストは宣言済み分割クラスをちょうど 1 つ示し、本体の先頭行に `// @covers REQ-045#class` を置く（`trace-check` C10 / C11 が読む。先に REQ の `## 検証方針` でクラスを宣言する）

---

## 4. React Native での「決定的」の意味

非決定性の原因は実時間、乱数、network だけではない。RN 独自の不安定さがある。

| 不安定さの原因 | 対処 |
| --- | --- |
| animation と transition | 完了を待たない。animation を検証対象にしない |
| `InteractionManager` の遅延実行 | fake timer で進める |
| layout 計測（`onLayout`）| テスト環境では 0 を返す。寸法に依存する分岐を検証しない |
| native bridge をまたぐ非同期応答 | mock にして直ちに解決する |

**実時間の `sleep` で待たない。** 待機は非同期 query と fake timer で表す。
実時間の待機は遅いだけでなく、CI の負荷に応じて失敗する不安定さを必ず生む。

---

## 5. 実行に必要なものによってスイートを分ける

最初にテスト階層名（unit / integration / system）を選んで分類するのではなく、
**そのテストを実行するために何を起動する必要があるか**で分ける。この基準は判断を要さず、
機械的に決まり、「§3 の Red-Green ループへ混ぜてよいか」と一致する。

| スイート | 判定基準（これだけで決める）| 場所（既定）| 実行頻度 |
| --- | --- | --- | --- |
| **既定**（unit）| 外部環境を起動しない（mock は境界のみ）| そのまま（対象構造を反映した配置、`__tests__/`）| Red-Green ループで使うスイート（ラウンド中は選択実行、全体実行は完了条件と CI だけ）|
| **結合** | **実 API または実サービスに接続する** | `tests/integration/` | 境界のみ（返却前、commit 前、CI）|
| **システム** | **simulator、実機、browser を起動する** | `.maestro/` または `e2e/`（Maestro / Detox の規約）| シナリオ flow（UC ごと 1 本）。FE 配線ラウンドでは UC タグで選択実行、境界で一度全体実行（`commands.system` を宣言した場合の終端チェックリスト、CI）。[system-testing.md](system-testing.instructions.md) |

- **フォルダーで分ける。** タグだけの分離では、実行コマンドの設定の穴から既定スイートへ漏れたときに気付けない
- **結合・システムの配置を Jest の探索から除外する。** `tests/integration` と `e2e` を `testPathIgnorePatterns` に入れる。
  忘れると `*.test.ts` / `__tests__` という名前だけで既定スイートに拾われ、simulator 起動が Red-Green ループへ入り込む
- **simulator も server も利用できないマシンで既定スイートが Green になること**
- **システムスイートはシナリオ flow だけを持つ**（`docs.instructions.md` R-1106–R-1108）。書き方は [system-testing.md](system-testing.instructions.md)。この文書は **場所と「既定スイートへ混ぜない」**だけを定義する

### 契約適合テストは既定スイートに属する

外部環境を起動しない契約適合テストは **結合テストではない**（上記基準では既定スイートに属する）。

**結合スイートへ移動しない。** develop の Phase4 Red-Green ループは **BE テスト**が担う（FE 単体テストは作成しない。シナリオ flow はループ内ではなく境界で完結する）。
Red-Green ループから外れた瞬間、Phase4 で統合上の欠陥を捕らえる手段がなくなる。
