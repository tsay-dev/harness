---
description: "📱 Expo — システムスイート（simulator または実機を起動するシナリオテスト）"
applyTo: "**/e2e/**,**/.maestro/**"
---

# 📱 Expo — システムスイート（simulator または実機を起動するシナリオテスト）

> **対象: Expo（expo-router）の React Native アプリ。** Expo でなければこの文書を破棄する。
>
> **シナリオテストの定義、ユースケースごとに 1 本とする理由、実行時期は develop プロセスが所管する**
> （`docs.instructions.md` R-1106–R-1108、`references/playbook.md`「テスト実行の粒度」）。この文書が持つのは
> **simulator / 実機でその規約を成立させる配線**だけである。runner、フォルダー、locator の優先順、
> pending マーカー、UC タグ、`@scenario` 注釈、simulator の排他性を定める。
> 既定スイートの規約は [common/testing.md](common-testing.instructions.md) にある。
>
> **flow 名とコメントは日本語で書く。**

---

## 1. runner とフォルダー

- **Maestro**（`.maestro/`、または利用先が選ぶ場合は `e2e/` 配下の YAML flow）を既定にする。build への組み込みが不要で、selector は外観が既に出力する `testID` / accessibility 値と同じである。利用先が既に採用している場合は Detox でもよい。その場合、下記の各規約に相当するものを利用先の `CLAUDE.md` に宣言する。**harness はこれ以上 runner を固定しない。**
- 利用先は `traceconfig.json` の `tests.system.dirs` にフォルダーを宣言する（Maestro では `extensions: [".yaml", ".yml"]`）。**`tests.dirs` と重ならないようにする**。フォルダーを Jest の `testPathIgnorePatterns` に入れる（`.yaml` は Jest に拾われないが、`e2e/*.test.ts` は拾われる）。
- **単一コマンドでスイート全体を実行する**（`maestro test .maestro/`）。利用先が終端ゲートに含めたい場合は `commands.system` に宣言する。CI では宣言の有無にかかわらず実行する。**UC での選択実行**は tag による `maestro test --include-tags UC-012 .maestro/`。
- テスト対象アプリは **利用先の `CLAUDE.md` が宣言するシナリオ環境**へ接続する。backend の種類（local server、stub server、staging）、base URL の切替方法（`app.config` の variant、build 時に読む環境変数）、投入済みデータ、使い捨てアカウントを定める。producer が発明しない。

---

## 2. シナリオ flow の形

ユースケースごとに 1 flow。`@scenario` 注釈を 1 行目の YAML コメントに置き、UC ID を flow の `name` の接頭辞と `tag` の両方にする。

```yaml
# @scenario UC-012
appId: com.example.app
name: UC-012 案件を登録する
tags:
  - UC-012
  - pending
---
- launchApp
- tapOn: "新規案件"
- tapOn:
    id: "createProject.title"
- inputText: "案件A"
- tapOn: "保存"
- assertVisible: "案件A"
```

- 各ステップは `UC.md` の `## 主シナリオ` の番号付きステップ 1 つに対応し、最後の `assertVisible` は `成功時` の事後条件に対応する。シナリオにないことは書かない。
- **pending マーカーは `pending` tag**。FE 配線の実装者が tag を外すまでは、全体実行コマンドで除外する（`commands.system` と CI の `--exclude-tags pending`）。`trace-check` C15 は tag の有無にかかわらず flow を検出する。
- flow に **`@covers` は付けない**。**固定の `waitFor` / sleep は使わない**。Maestro が要素を待つ。

---

## 3. locator の優先順（探索せず導出する）

| 優先順 | selector | 導出元 |
| --- | --- | --- |
| 1 | `tapOn: "<text>"`、`assertVisible: "<text>"` | **用語集の用語**（`docs/01-glossary.md`）。用語そのものを使い、同義語にしない。`accessibilityLabel` と見える text に一致する |
| 2 | `id: "<testID>"` | **契約**。operation `createProject` を実行する control → `testID="createProject"`、request field `title` → `testID="createProject.title"`（[frontend/coding.md](frontend-coding.instructions.md) §6 が出力する）|
| 禁止 | 座標、index、表示文言をコピーした `testID`、画面名・コンポーネント名 | — |

**外観が不一致なら外観側を動かす**（ADR-0037）。実装に合わせて flow を変更しない。

---

## 4. simulator は排他資源

- 並行起動された producer は **flow を実行しない**（simulator 起動、`maestro test`）。編集と静的検査までで止め、**flow が未実行であることと、実行が必要な UC tag を報告に明記する**。
- **例外**: 新しい 1 flow の作成直後の選択実行（単一プロセスに収まる）、外観の目視起動（人間ゲート）。
- 並行区間終了後のまとめた実行では、端末を 1 つに固定し（`CLAUDE.md` に宣言）、起動済み simulator を再利用して **UC tag で選択実行**する。全体実行は境界だけ（終端チェックリスト、CI）。

---

## 5. 実機上でも決定的にする

| 不安定さの原因 | 対処 |
| --- | --- |
| 前回実行から残るアプリ状態 | `clearState: true` 付き `launchApp`、または実行ごとの使い捨てアカウント |
| animation、transition、keyboard | 最終状態を検証し、animation を待たない。画面の見えている範囲より下を検証する前に `hideKeyboard` |
| シナリオ backend への network | 利用先が宣言した backend を使う。宣言済みなら stub server でもよいが、アプリ内 mock は使わない |
| 権限 dialog | 利用先が宣言する起動引数で事前に許可する |

---

## ✅ 返却前チェックリスト

- [ ] UC の flow はちょうど 1 つで、`name: UC-nnn …`、tag `UC-nnn`、1 行目の `# @scenario UC-nnn`、マーカーの tag `pending` があるか？
- [ ] すべてのステップが `## 主シナリオ` の番号付きステップに、最後の assertion が `成功時` に対応するか？
- [ ] selector は優先順 1（用語集の用語）か 2（operation / `operation.field` を `testID` とする）だけか？
- [ ] フォルダーは Jest の `testPathIgnorePatterns` に入り、`tests.system.dirs` と `tests.dirs` は重ならないか？
- [ ] この flow だけ（`--include-tags UC-nnn`）を実行したか、または並行区間で simulator を占有しているため未実行と報告したか？ `trace-check --only C15` を実行したか？
