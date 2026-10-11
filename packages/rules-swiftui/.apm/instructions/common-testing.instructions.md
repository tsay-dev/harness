---
description: "🧪 SwiftUI — 共通のテスト規則（全レイヤー）"
applyTo: "**/*Tests.swift,**/*Test.swift,**/*Tests/**,**/*Spec.swift"
---

# 🧪 SwiftUI — 共通のテスト規則（全レイヤー）

> **適用範囲: SwiftUI を使うネイティブ iOS アプリ。** 該当しなければ破棄する。
>
> **テストの原則（何を、なぜテストするか）は develop の開発プロセスに従う。**
> 1 テスト = 1 振る舞い、条件に失敗・空・権限・境界を含める、モックは境界だけ、
> 決定的にする、カバレッジは指標であって目標ではない。これらは開発全般で共通なので、ここでは再掲せず、そちらに従う。
>
> この文書が保持するのは、**その原則を SwiftUI iOS で成立させる配線**だけ。
> **フロントエンド（View）のユニットテスト用の末端文書は置かない**（develop は FE ユニットテストを作成しない）。システムスイート、つまりシミュレーターを起動する UC ごとに 1 本の XCUITest シナリオは [system-testing.md](system-testing.instructions.md)。
> 表記は [common/coding.md](common-coding.instructions.md)、レイヤーの配置は [frontend/dataflow.md](frontend-dataflow.instructions.md)。
> **書いたテストを誰が、いつ実行するか**（並行区間では実行せず、1 つのシミュレーターで 1 回に集約）は
> [test-execution.md](common-test-execution.instructions.md) が正本。この文書は**何を書き、どのスイートに置くか**を扱う。
>
> **テスト名とコメントは日本語で書く。**

---

## 1. ランナーはプロジェクトが宣言する

**harness は特定のテストランナーを固定しない**（XCTest、Swift Testing のどちらでもよい）。
選択、設定、**既定スイートを実行するコマンド**はホストの `CLAUDE.md` に記録する。

- **単一のコマンドで既定スイート全体を実行でき、終了コードで Red / Green を判断できること**
  （`xcodebuild test …`、SPM の `swift test` など、プロジェクトの構成に合わせる）
- **未導入なら、導入が開始のゲート。** ランナーなしで実装を進めると、
  develop の Phase4（機械 oracle による Red-Green ループ）が成立しない

---

## 2. テストから操作を呼ぶ（operation → 入口）

契約適合テストは、実装から知ったシンボルではなく、**契約が示す入口**で操作を呼ぶ。
`test-author` と `implementer` はそれぞれ `contract.yaml` と下表から入口を導出し、互いからは導出しない
（実装より先にテストが存在することも、その逆もある）。レイヤーは [frontend/dataflow.md](frontend-dataflow.instructions.md) に従う。

| 契約（`contract.yaml`） | テストが構築する型 | 呼ぶ入口 |
| --- | --- | --- |
| `transport: http` / `sdk` / `local-store` / `device`（outbound）、operation `fetchUser` | **`<Operation>UseCase`**（`FetchUserUseCase`）という名前の Domain の `UseCase`。Repository protocol の fake で構築する | `examples.*.request` にある引数で `execute(...)` を呼ぶ。Repository の fake は `examples.*.response` を返すか、`errors[].code` を throw する |
| `transport: deeplink` / `push`（inbound）、operation `openItem` | 同じ `<Operation>UseCase`（`OpenItemUseCase`）。Router / app delegate はそこへ転送するだけ | デコード済みのペイロードで `execute(...)` を呼ぶ。ペイロードのデコードは Data で別途検証する |
| 任意の operation をホストの `commands.contract_adapter`（`traceconfig.json`）経由で呼ぶ | なし。テストは operation 名と例でアダプターを同一プロセス内で駆動し、テストコードに実装シンボルを出さない | — |

実装が入口を別の場所に置いたなら、実装を移す。テストは契約から導出する（R-801）。

---

## 3. 範囲を絞った実行（UC タグ）と要求の網羅（`@covers`）

すべてのテストで、最外側のグループ名を

`UC-012 <UC title>`

とし、UC ID（`docs/goals/` 配下の UC ディレクトリ名と同じキー）で機械的に選択できるようにする。

- Swift Testing は `@Suite("UC-012 …")` を使う。XCTest は最外側のクラス名または名前に `UC-012` を含める
- **各テストは宣言済みの分割クラスを正確に 1 つ指定する。** 本体の先頭行に `// @covers REQ-045#class` を置く（`trace-check` C10 / C11 が読む。先に REQ の `## 検証方針` でクラスを宣言する）
- ランナーに合った具体的な選択コマンドを `CLAUDE.md` に書く
- **修正ラウンドでは選択実行だけを行い、既定スイート全体は完了条件と CI で 1 回実行する。** この末端文書は UC ID によるタグ付けと選択方法だけを定義する
- **新しいテストをタグなしにしない**（選択実行の時機は [test-execution.md](common-test-execution.instructions.md) と develop skill の「テスト実行の粒度」節）

---

## 4. 機械 oracle の主戦場は Domain（UseCase）

このスタックで決定的に駆動できる Red-Green ループの中心は **UseCase**（必要に応じて薄い ViewModel）。

| 優先度 | 対象 | 方法 |
| --- | --- | --- |
| 主 | **UseCase** | Repository の **protocol の fake** を注入する。成功・失敗・空・権限・境界を試す |
| 次 | **ViewModel** | fake の UseCase を注入し、画面状態と Router の呼び出しだけを検証する |
| 別スイート | **XCUITest シナリオ**（UC ごとに 1 本） | シミュレーターが前提なので、既定ではなくシステムスイート。[system-testing.md](system-testing.instructions.md)。View のスナップショットは作成しない |

- **モックは境界だけ**（Repository、時計、乱数など）。Domain Entity 全体をモックしない
- 既定スイートで Data レイヤーの `URLSession` 実装を実ネットワークにつながない。
  HTTP レイヤーを試すなら fake の `URLProtocol` などで閉じる。それでも外部環境の起動が必要なら統合スイートに置く
- ViewModel のテストで Router を調べるときは、path の変更または呼び出しを観測できる fake / spy を使う

```swift
@Test("UC-012 ログイン — 成功するとセッションが立つ")
func loginSucceeds() async throws {
  // @covers REQ-045#accept-standard
  let users = FakeUserRepository(result: .success(sampleUser))
  let useCase = LoginUseCase(users: users)
  try await useCase.execute(email: "a@b.c", password: "secret")
  // 期待する Domains の結果だけを断言
}
```

---

## 5. 決定的にする（iOS で揺らぐもの）

| 揺らぎの原因 | 対処 |
| --- | --- |
| 実ネットワーク / 実キーチェーン / 実ディスク | 既定スイートでは使わない。境界を fake にする |
| 実時間とタイマー | 注入して固定するか、テストから制御する |
| 実時間の `sleep` / `Task.sleep` による待機 | **使わない。** CI の負荷で不安定になる |
| アニメーションと遷移アニメーション | 完了を待たない。検証対象にしない |
| MainActor | ViewModel のテストでは `@MainActor` を尊重する（テスト関数のアノテーションと実行方法を揃える） |

テストは**順序に依存しない。** 共有された可変グローバルや singleton を変更したら、必ず元に戻す。
`.shared` に依存するテストは、設計が既に崩れている兆候（[frontend/dataflow.md](frontend-dataflow.instructions.md)）。

---

## 6. 実行に必要なものによってスイートを分ける

unit / integration / system というテストレベル名を先に決めて分類するのではなく、
**そのテストを実行するために何を起動する必要があるか**で分ける。

| スイート | 基準（これだけで決まる） | 配置（既定例） | 実行頻度 |
| --- | --- | --- | --- |
| **既定**（unit） | シミュレーターも実 API も起動しない（モックは境界のみ） | 対象と対応する配置、`Tests/` など | Red-Green ループが取り出すスイート（ラウンド中は選択、全体実行は完了条件と CI だけ） |
| **統合** | **実 API または実サービスに接続する** | `Tests/Integration/` など | 境界のみ |
| **システム** | **シミュレーターまたは実機を起動する**（XCUITest） | `UITests/`（別テストターゲット） | シナリオテスト（UC ごとに 1 本）。FE 配線ラウンドでは UC クラスで選択し、境界で全体を 1 回（`commands.system` を宣言した場合の終端リスト、CI）。[system-testing.md](system-testing.instructions.md) |

- **フォルダー（または別テストターゲット）で分ける。** 名前だけに頼ると既定スイートに漏れ込む
- **統合とシステムの配置を既定スイートの探索対象から除外する**
- **シミュレーターもサーバーも利用できないマシンで、既定スイートが Green になること。**
  ここで「何も起動しない」は、**テスト自体が UI、実機、実サービスを起動しない**という意味。
  ランナーがシミュレーターの destination を要求する構成（アプリターゲットの `xcodebuild test`）を禁止するものではない。
  その構成での実行の進め方は [test-execution.md](common-test-execution.instructions.md)
- **システムスイートに置くのはシナリオテストだけ**（`docs.instructions.md` R-1106–R-1108）。書き方は [system-testing.md](system-testing.instructions.md)。この文書は**配置と「既定スイートに混ぜないこと」**だけを定義する

### 契約適合テストと UseCase テストは既定スイートに置く

外部環境を起動しない UseCase または契約適合テストは**統合テストではない。**
**統合スイートや UITests に移してはならない。** Red-Green ループから外れた瞬間に、Phase4 で統合上の欠陥を検出する手段がなくなる。

---

## ✅ 返却前チェックリスト

- [ ] 既定スイートの実行コマンドが `CLAUDE.md` にあり、終了コードで Red / Green を読めるか？
- [ ] 最外側のグループに `UC-nnn`、各テストに `@covers REQ-nnn#class` があるか？
- [ ] 主な検証は UseCase（または薄い ViewModel）に置き、View / UI テストへ逃がしていないか？
- [ ] モックは Repository などの境界に留まっているか？
- [ ] 既定スイートのテスト自体が実ネットワーク、実機、UI を起動しないか？（ランナーの destination 要件は別問題）
- [ ] 実時間の待機やアニメーション完了待ちを入れていないか？
- [ ] 統合とシステムを既定スイートの探索パスから外しているか？
