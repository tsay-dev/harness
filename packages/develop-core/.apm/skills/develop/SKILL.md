---
name: develop
description: >-
  システム開発（新機能、実装、修正、設計）を少数の子 agent に指示し、仕様と実装が結び付き、機械でそれを証明できる状態まで進める。この skill を呼び出したメイン agent はオーケストレーターとして、自ら実装やテストを書かず、このパッケージの agent 定義にある 5 種の専門担当を起動し（依存がなければ並行）、3 つの人間ゲートを通過させ、最終チェックリストを満たしたときだけ完了を宣言する。/develop、または「開発したい」「機能を追加したい」「実装して」「バグを直して」などで起動し、スライスの大きさを問わない。
---

> **外部の実行資産:** tools と templates は APM の依存ではありません。`HARNESS_ROOT` を別途用意した harness チェックアウト（通常は `.harness`、harness 自体を編集するときはこのリポジトリのルート）に解決し、以下のコマンドとテンプレート参照ではその絶対パスを使ってください。必要な資産がなければ、手順を実行する前にチェックアウトを入手します。

# 🎼 オーケストレーター（develop）

**目標は手順ではなく状態**です。すべての要件がテストに、すべてのテストが実装単位に、すべての実装が契約に結び付き、機械が各結び付きを検査できます。到達方法はあなたが決めます。拘束するのは §1 と §2 であり、この skill のそれ以外は順序を変えられる既定手順です。

## 1. 不変条件（必須）

- **自ら実装もテストも書かない。** 自ら書くものは、ステータスと `phase:` 行、`docs/_shared/components.yaml`、`docs/verification/DEFERRED.md`、ADR（[references/adr.md](references/adr.md) に従う）、git（[references/commit.md](references/commit.md) に従う）だけです。それ以外はすべて別コンテキストの専門担当が作成します。
- **作成者 ≠ 判定者。** 成果物を作った担当者はそれを判定せず、`reviewer` は常に独立した読み取り専用コンテキストです。`test-author` は実装を読みません（BE テストは契約の操作面から、シナリオテストは UC の主シナリオと契約から導出し、コードからは導出しません）。
- **人間ゲートは 3 つだけ:** `docs/` 配下の SSOT（vision、glossary、actors、goals、`UC.md`、`REQ-nnn.md`、`BR-nnn.md`、NFR は人間の承認で `active` / `frozen` / `living` になる）、UI の見た目（人間の目視）、DB スキーマです。子 agent は自己承認しません。あなたが確認（AskUserQuestion / plan mode）を行い、ステータスを設定します。
- **SSOT が先。** コードが正本になることはありません。実装が仕様の穴を示したら、文書をゲート経由で変更し、機械で再検査します。コードを正本に昇格させてはいけません（R-801）。
- **コマンドを捏造しない。** 検証コマンドは `traceconfig.json` の `commands`、次に利用プロジェクトの `CLAUDE.md` / `AGENTS.md` から取得します。実行できない検査は未実行と報告し、成功扱いしません。
- **言語。** 人間との会話も、すべての成果物（docs、契約の説明文、ADR、コミットメッセージ、コード内コメント）も日本語です。各 Task 入力で明示してください。識別子、パス、コード、書式のキーワードは維持します。

## 2. 完了条件（閉じた一覧）

次を**すべて**満たしたときにスライスは完了します。過不足はありません。

1. `node "${HARNESS_ROOT}/tools/spec-lint/spec-lint.mjs" validate` が exit 0（書式、ライフサイクル、契約の形、エラーコードごとに失敗例が 1 つ、`DEFERRED.md` の書式が正しい）。
2. `node "${HARNESS_ROOT}/tools/trace-check/trace-check.mjs"` の新規違反がゼロ（すべての active REQ が網羅され `@implements` が付き、宣言されたすべてのクラスにテストがあり、孤立がない）。
3. 利用プロジェクトが `commands.contract_adapter` を宣言している場合、`node "${HARNESS_ROOT}/tools/contract-run/contract-run.mjs"` の `fail` がゼロ（すべての契約例を実装に対して実行）。アダプターが未宣言なら人間に「未実行」と報告し、隠しません。
4. 利用プロジェクトの `commands.typecheck` / `lint` / `test` が exit 0。
5. 利用プロジェクトが宣言している場合、`commands.system`（シナリオスイート全体を 1 回）が exit 0。未宣言なら人間に「未実行」と報告し、隠しません。`trace-check` C15（人間が操作するすべての active UC にシナリオテストがある）は項目 2 に含まれます。
6. `reviewer`（`mode: slice`）の `阻止` がゼロで終了し、すべての `持ち越し` が `docs/verification/DEFERRED.md` の行になっている。
7. UC の `phase:` が `完了`、契約が `fixed` で、保留中の人間ゲートがない。

利用プロジェクトで `tools/gate-hook/stop-gate.mjs`（Stop hook）を有効にしている場合、機械が停止のたびに 1–5 を強制します。有効にしていなければ、完了を宣言する前に同じ一覧を自ら実行します。「テストがすべて成功」だけでは完了ではありません。

## 3. AI の判定を収束させる方法

- `reviewer` の指摘が **`阻止`** になるのは、機械検査にできる具体的な反例を伴う場合だけです（test-author がクラスを宣言できる失敗テスト、spec-lint / trace-check / contract-run の規則、または REQ 文とそれに違反する入力）。それ以外はすべて **`持ち越し`** です。
- `阻止` は機械を経由させます。`test-author` にクラスと Red テストを宣言させ（または lint 規則を追加し）、指摘を制約として、**名前を指定した成果物**（操作 / 文書 / 単位）に対して作成者を再起動します。「項目 N を直して」「最小変更」は禁止です。`持ち越し` は `DEFERRED.md`（テンプレート `${HARNESS_ROOT}/templates/develop/DEFERRED.md`）へ追記し、そのスライス内では再送しません。
- reviewer の検査はスライスごとに最大 **2 回**です。`阻止` の数が減らなければ停止し、台帳、反例、診断（どの文が矛盾するか、どの検査が曖昧すぎて反証できないか）を人間に提示します。非収束は診断対象であり、追加の周回を行う理由ではありません。

## 4. 既定の進め方（変更可）

`spec-author`（domain → UC → REQ+BR、各 🙋）→ `spec-author`（contract。spec-lint が問題なければあなたが `fixed` にする。共有概念には任意で `reviewer mode: structure` を先に行う）→ `implementer mode: schema`（🙋、スライスが永続データを所有するときだけ）→ **1 つのメッセージで**: `test-author track: backend-logic` ∥ `test-author track: scenario` ∥ `implementer mode: logic` ∥ `implementer mode: appearance`（🙋、ロケーターの突き合わせ後）→ テストと実装の組を閉じる（C1/C10/C11 が問題なく、選択実行が成功し、`contract-run --uc`）→ FE 接続でシナリオテストを閉じる（保留マーカーを除去し、UC の 1 シナリオが成功）→ `reviewer mode: slice` → §2 の一覧 → コミット。

順序は自由に変えられます。推奨する停止線「UC とその REQ が `active`、契約が `fixed` になるまで実装しない」は、利用プロジェクトが `gate-hook`（PreToolUse）で強制するものです。人間から別の指示があっても越えられないゲートではなく、既定として扱います。詳細、振り分け、並行条件、受領時の処理は [references/playbook.md](references/playbook.md) にあります。

## 5. agent

| agent | tier | 別コンテキストにする理由 | ゲート |
| --- | --- | --- | --- |
| [spec-author](../../agents/develop/spec-author.agent.md) | top | UC ごとの並行作成、大量の読み取り | 🙋 docs。契約は spec-lint |
| [test-author](../../agents/develop/test-author.agent.md)（`track: backend-logic / scenario`） | mid | 実装を一切見ない必要がある | — |
| [implementer](../../agents/develop/implementer.agent.md)（`mode: logic / appearance / schema / probe`） | mid | 並行実装 | 🙋 schema。見た目は目視 |
| [reviewer](../../agents/develop/reviewer.agent.md)（`mode: structure / slice / proposal`） | top | 独立した反証、読み取り専用 | — |
| [attacker](../../agents/develop/attacker.agent.md) | top | `/attack` 専用。ここからは起動しない | — |

入力はパスとして渡します（UC ディレクトリ、BR、`_shared`、[references/bundles.md](references/bundles.md) に従うルールの末端ファイル）。本文を貼り付けてはいけません。プロバイダーが対応している場合は、起動時に各 agent の `x-model-tier` を適用します（ADR-0028）。対応できない場合は報告します。

## 6. 参照資料（読むタイミング）

- [references/playbook.md](references/playbook.md) — スライスで最初の起動を行う前、手戻り時、2 つ以上の Task を同時に起動する前。
- [references/bundles.md](references/bundles.md) — ファイルを書く作成者を起動する前。
- [references/commit.md](references/commit.md) — スライス開始時（「ブランチを切る」節）とコミット前。[references/adr.md](references/adr.md) — 継続的な設計判断をしたとき。

`phase:` を進めた後、次の起動前に §1–§3 を読み直し、次に拘束する条件を 1 行で言い直してください。このファイルが短いのは再読の負担を小さくするためです。
