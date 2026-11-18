---
name: develop
description: >-
  システム開発（新機能、実装、修正、設計）を少数の子 agent に指示し、人間が承認した仕様から実装と検証が独立に導出され、両者の紐づきを機械が検査できる状態まで進める。この skill を呼び出したメイン agent はオーケストレーターとして、自ら実装やテストを書かず、このパッケージの agent 定義にある 5 種の専門担当を起動し、3 つの人間ゲートを通過させ、完了条件をすべて満たしたときだけ完了を宣言する。/develop、または「開発したい」「機能を追加したい」「実装して」「バグを直して」などで起動し、スライスの大きさを問わない。
---

> **外部の実行資産:** `HARNESS_ROOT` は tools と templates を持つ harness チェックアウト（通常は `.harness`、harness 自体を編集するときはこのリポジトリのルート）の絶対パスです。以下のコマンドとテンプレート参照に使い、なければ入手してから始めます。

# オーケストレーター（develop）

## 1. 到達状態

人間が承認した仕様から、実装とその検証が互いに独立に導出され、両者の紐づきを機械が検査して完了を判定できる状態（ADR-0044）。到達の順序、深さ、起動の並べ方はあなたが決めます。拘束するのは §2 と §3 だけです。

## 2. 不変条件

- **自ら実装もテストも書かない。** 自ら書くのは `status` / `phase:` 行、`docs/_shared/components.yaml`、`harness.config.json`（宣言の範囲、`commands`。test-author が書いた契約アダプターの `commands.contract_adapter` を含み、書き込みは人間の承認を経る）、ADR（[references/adr.md](references/adr.md)）、凍結済みの `DEFERRED.md` から解消した行を消すこと、git（[references/commit.md](references/commit.md)）だけです。それ以外は別コンテキストの専門担当が作ります。
- **作成者 ≠ 判定者。** 成果物を作った担当はそれを判定しません。`reviewer` は常に別コンテキストの読み取り専用、`test-author` は実装を読みません。
- **人間ゲートは 3 つだけ。** `docs/` の SSOT（人間の承認で `active` / `frozen` / `living`。`status` の降格と、`UC.md` の `active`・契約の `fixed` への昇格は、gate-hook が書き込みごとにも承認を求める。検査の範囲を決める `harness.config.json` の変更もここに含み、同じく書き込みごとに承認を求める。ADR-0057）、UI の見た目（目視）、DB スキーマです。子 agent は自己承認せず、確認（AskUserQuestion / plan mode）とステータス・`phase:` の遷移はあなただけが行います。進捗は各 `UC.md` の `phase:`（`定義` → `構造` → `実装` → `検証` → `完了`）が持ちます。
- **SSOT が先。** コードは正本になりません。実装や赤いテストが仕様の穴を示したら、実装 → テスト → SSOT の順に疑い、SSOT はゲート経由で直して再導出します。通すためにテストや契約を歪めません（R-801）。
- **コマンドを捏造しない。** 検証コマンドは `harness.config.json` の `commands`、次に利用プロジェクトの `CLAUDE.md` / `AGENTS.md` から取ります。実行できない検査は未実行と報告し、成功扱いしません。
- **名前付き agent で起動する。** 専門担当はこのパッケージの agent 定義を名前で起動し、汎用 agent で代替しません。各定義の `x-model-tier` を起動時に適用し（プロバイダーのモデルへの対応は `${HARNESS_ROOT}/tools/apm/claude-models.json` と `${HARNESS_ROOT}/tools/codex-sync/models.json`）、プロバイダーが対応しなければ報告します（ADR-0028 / ADR-0034）。入力はパスで渡し、本文を貼りません。`HARNESS_ROOT` の絶対パスも各 Task 入力に渡します。ルールの末端ファイルは [references/bundles.md](references/bundles.md) に従って渡します（ADR-0047）。
- **言語。** 会話と成果物（docs、契約の説明文、ADR、コミットメッセージ、コード内コメント）は利用プロジェクトの `harness.config.json` の `policy.language`（未宣言なら日本語）で書きます（ADR-0050）。各 Task 入力で明示します。識別子、パス、コード、書式のキーワードは維持します。

## 3. 完了条件（閉じた一覧）

次を**すべて**満たしたときだけスライスは完了です。

1. `node "${HARNESS_ROOT}/tools/spec-lint/spec-lint.mjs" validate` が exit 0。
2. `node "${HARNESS_ROOT}/tools/trace-check/trace-check.mjs"` の違反がゼロ（C1–C26）。実装との対応は `harness lint entry` / `coverage` / `entries`（`tools/exec-check`）の違反がゼロ（テストから実行されないソースと関数、契約に無い入口が無い）。
3. `node "${HARNESS_ROOT}/tools/contract-run/contract-run.mjs"` が exit 0（`fail` も `skip` も無く、実行する実例があればアダプターで実行済み）。
4. 利用プロジェクトの `commands.typecheck` / `lint` / `test` が exit 0。
5. `commands.system` のシナリオスイート全体が 1 回 exit 0。`{ "none": "<理由>" }` のコマンドは理由とともに「未実行」と報告します。
6. `reviewer`（`mode: slice`）が `阻止` ゼロで終了し、すべての `問い` に人間が答えている（未決を持ち越さない。ADR-0068）。
7. 触った UC の `phase:` が `完了`、契約が `fixed`、保留中の人間ゲートがない。

利用プロジェクトが `tools/gate-hook/stop-gate.mjs`（Stop hook）を有効にしていれば機械が 1–5 を強制し、`gate-hook.mjs`（PreToolUse）を有効にしていれば UC・REQ が `active` で契約が `fixed` になる前の実装コード書き込みを阻止します。無効なら同じ条件を自ら守ります。stop-gate に止められたら、直せる失敗は担当に直させ、人間ゲート待ちや後続の担当の成果物でしか直せない失敗（スライス途中の赤）は未達として報告してターンを終えます。`harness.config.json` を緩めて（none にする、範囲を狭める）通しません。「テストがすべて成功」だけでは完了ではありません。

## 4. 判定の閉じ方

- `reviewer` の指摘は 2 種類だけです。**`阻止`** は機械検査にできる具体的な反例（test-author がクラスを宣言できる失敗テスト、spec-lint / trace-check / contract-run の規則、または REQ 文と違反入力）を伴うもの。**`問い`** は、仕様が答えを決めていない点を、具体的な入力・2 つ以上の候補・候補ごとの帰結で示したものです。どちらでもない指摘（文言、スタイル、テストや例で決まる境界）は受け取りません。収束は、`阻止` ゼロかつ `問い` がすべて答え済みです。
- `阻止` は散文で作成者に戻さず、テストクラスか lint 規則にして機械ループへ戻します。手戻りの単位は指摘ではなく名指した成果物（操作 / 文書 / 単位）で、作成者は SSOT から再導出します。`問い` は、そのスライスの中で人間に聞いて決めます。答えは仕様（UC・REQ・BR・契約。持続する判断なら ADR）に書き、機械ループへ戻します。答えで仕様を変えたら、変えた成果物を reviewer に見せ直します。`問い` が残る間は人間待ちで、未達として報告してターンを終えます。保留の一覧（`DEFERRED.md`）には書きません（既存の一覧は凍結済み。ADR-0068）。reviewer が検査台帳に書いた「`/attack` 向けの疑念」は、完了の報告で人間に伝えます。
- reviewer はスライスごとに最大 2 回。`問い` への答えで変えた成果物を見せ直す回は、この 2 回に数えません（その回に出た `阻止` と `問い` は、同じ扱いで閉じます）。`阻止` の数が減らなければ停止し、台帳、反例、診断を人間に提示します。非収束は診断対象であり、周回を重ねる理由ではありません。

## 5. agent

| agent | tier | 別コンテキストにする理由 | 人間ゲート |
| --- | --- | --- | --- |
| [spec-author](../../agents/develop/spec-author.agent.md)（`target: domain / usecase / requirements / contract`） | top | UC ごとの並行作成 | 🙋 docs。契約は spec-lint |
| [test-author](../../agents/develop/test-author.agent.md)（`track: backend-logic / scenario`） | mid | 実装を一切見ない | — |
| [implementer](../../agents/develop/implementer.agent.md)（`mode: logic / appearance / schema / probe`） | mid | 並行実装 | 🙋 schema。見た目は目視 |
| [reviewer](../../agents/develop/reviewer.agent.md)（`mode: structure / slice / proposal`） | top | 独立した反証、読み取り専用 | — |
| [attacker](../../agents/develop/attacker.agent.md) | top | `/attack` 専用。ここからは起動しない | — |

成果物の置き場と作成者は `${HARNESS_ROOT}/templates/develop/README.md`、文書の書き分けは [docs.instructions.md](../../instructions/docs.instructions.md) が正本です。

## 6. 参照資料（読むタイミング）

- [references/bundles.md](references/bundles.md) — ファイルを書く作成者を起動する前。
- [references/commit.md](references/commit.md) — スライス開始時（ブランチを切る）とコミット前。
- [references/adr.md](references/adr.md) — 継続的な設計判断をしたとき。
