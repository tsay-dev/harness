# 既定の進め方（develop）

> これは変更可能な**既定**の流れです。作業に応じてステップの順序変更、統合、反復を自由に行えます。拘束するのは [SKILL.md](../SKILL.md) §2 の不変条件と §3 の完了条件だけです。このファイルの節見出しは安定した参照先であり、`SKILL.md`、ほかの参照資料、ルールの末端ファイルから名前で参照されます。

## docs 成果物の配置

**1 ユースケースに 1 ディレクトリ**（`docs/goals/GOAL-nn-<slug>/UC-nnn-<slug>/`）を設け、実装時に読む `UC.md`、その `REQ-nnn.md`、`contract.yaml` をすべて置きます。GOAL → UC → REQ は木なので、ファイルシステムを一致させます。横断文書（BR / NFR / ADR / glossary / `_shared` / verification）は `docs/` に集約します。**索引は生成し、コミットしません**（`trace-check --index`）。書式はテンプレート（`${HARNESS_ROOT}/templates/develop/`）、原則はルールの末端ファイル [docs.instructions.md](../../../instructions/docs.instructions.md) が保持します。`applyTo:` により `docs/` 配下を書く担当者へ配送され、ADR と DEFERRED を書くオーケストレーターも対象です。

> **スライスの MIS**: `UC.md`（シナリオ、セルが REQ を指す状態 × イベント表、例外走査）+ `REQ-nnn.md`（EARS 1 文 + `## 検証方針` の分割クラス）+ `contract.yaml`（操作、型、required、enum、評価順の `errors:` — R-1207）。2 つ以上の UC が共有するルールは `docs/rules/BR-nnn.md` に 1 回だけ置きます。**境界は HTTP に限りません**。境界を越えない UC は契約を省略せず、理由付きの `operations: {}` を宣言します。

| 成果物 | 場所 | 作成者 |
| --- | --- | --- |
| vision / glossary / actors | `docs/00-vision.md` / `01-glossary.md` / `02-actors.md` | `spec-author`（🙋 → `frozen` / `living` / `living`） |
| goal | `docs/goals/GOAL-nn-<slug>/GOAL.md`（着手済み）/ `docs/goals-backlog.md`（未着手） | `spec-author`（🙋 → `active`） |
| ユースケース（シナリオ、状態 × イベント表、例外走査） | `…/UC-nnn-<slug>/UC.md` | `spec-author`（🙋 → `active`）。`phase:` 行はオーケストレーター |
| 要件（EARS 1 文）+ 検証方針 | `…/UC-nnn-<slug>/REQ-nnn.md` | `spec-author`（🙋 → `active`）。`## 検証方針` は `test-author` |
| 業務ルール（2 つ以上の UC で共有）/ NFR | `docs/rules/BR-nnn.md` / `docs/nfr/NFR-nnn.md` | `spec-author`（🙋 → `active`） |
| 境界契約（任意の transport） | `…/UC-nnn-<slug>/contract.yaml` | `spec-author`（🤖 → オーケストレーターが `fixed` にする） |
| 共有契約語彙（`$ref` の参照先） | `docs/_shared/components.yaml` | **オーケストレーターのみ**（作成者は依頼を報告として返す） |
| プロジェクト全体の「検証しない」範囲 | `docs/verification/GLOBAL.md` | `test-author` |
| シナリオテスト（`UC.md` 主シナリオの実行可能な投影。UC ごとに正常系 1 つ。`@scenario UC-nnn`） | 利用プロジェクトのシステムスイート（`traceconfig.json` の `tests.system`。スタックの system-testing 末端ファイルに従う `e2e/`、`UITests/` など） | `test-author (track: scenario)`。保留マーカーは FE 接続時に `implementer (logic)` が除去 |
| 持ち越し指摘台帳（`持ち越し`） | `docs/verification/DEFERRED.md` | **オーケストレーターのみ**（テンプレート `${HARNESS_ROOT}/templates/develop/DEFERRED.md`） |
| DB 設計 | **利用プロジェクト固有のスキーマ正本のみ**（利用プロジェクトの `CLAUDE.md` / `AGENTS.md` または `traceconfig.json` の `schema.files` に宣言。docs の草案は禁止、R-102）。ルールを強制する制約に `@implements BR-nnn`（C13）を付ける | `implementer (mode: schema)` + フレームワーク規約 |
| Design Doc（How、現在形、任意） | `docs/design.md` | 人間（🙋。オーケストレーターが代筆可。理由は ADR へ） |
| ADR | `docs/adr/ADR-nnnn-<slug>.md` | オーケストレーター。[adr.md](adr.md) に従う |
| トレース設定 | 利用プロジェクトのルートの `traceconfig.json` | オーケストレーターがテンプレートから 1 回初期化し、利用プロジェクト側で維持 |

- **develop 側で DB 設計の場所を固定せず、docs 草案にも代替しません。** 利用プロジェクトが固有の正本を宣言していなければ人間に尋ねます。永続データを所有するスライスは正本なしでは進められません。
- **進捗は各 `UC.md` frontmatter の `phase:` 行**です（`定義`→`構造`→`実装`→`検証`→`完了`）。オーケストレーターが遷移ごとに進め、作成者は触りません。**進めたら、次フェーズに適用される SKILL.md §2 の不変条件を 1 行で言い直します**。skill は最初に読み込まれた後、ほかの情報に埋もれるためです。
- **ステータス**: docs ノードは `draft → active → withdrawn`（`active` = 人間が承認。単独文書は `frozen` / `living`）、契約は `draft → fixed`。**すべての遷移をオーケストレーターが行い**、作成者は草案を返します。

## フェーズ 1: 定義

最初の起動前にスライスのブランチを切ります（[commit.md](commit.md)「ブランチを切る」）。`traceconfig.json` がなければ `${HARNESS_ROOT}/templates/develop/traceconfig.json` から初期化します（`source` / `tests` / `commands` を調整。不明なら尋ねる）。既存プロジェクトでは `trace-check --update-baseline` を 1 回実行します。続いて依存順に対象別の `spec-author` を起動し、受領ごとに 1 回 🙋 を行います。

1. **domain** — vision（計測可能な KPI）、閉じた用語・actor 集合、各 goal が `GOAL.md` または backlog 項目、各 NFR に計測方法。承認後 `frozen` / `living` / `active` に設定します。
2. **usecase** — UC ごとに 1 Task、UC 間は並行。各 Task が `trace-check --next req --reserve N` で REQ ID を予約します（原子的。番号帯を配りません）。状態 × イベント表に空セルがなく、各セルが予約 REQ、計画 UC、または理由付き `不可` を指し、例外走査が 4 軸を覆ったら完了。承認後 `active`。
3. **requirements** — active UC ごとに 1 Task、並行。予約 ID ごとにパターン付き EARS 1 文、UC ごとに最低 1 つの `Unwanted behaviour`、2 つ以上の UC の共有ルールがすべて ID 参照の BR になったら完了。承認後 `active`。

承認済み要件への欠陥報告は「情報の振り分け」「手戻り」を経由させ、その場で修正しません。

## 構造リスクゲートと probe

その場で判断します（子 agent は使いません）。構造が**高い新規性**、**広い影響範囲**、**取り消しの高コスト**（本番データが既に入っている）のいずれかを持つなら**高リスク**です。それ以外はフェーズ 3 へ直行します。高リスクなら UC 横断の最も危険な経路を 1 つ選び、`implementer (mode: probe)` を起動します。実 I/O に到達する最小実装で端から端まで実行し（ブラウザー E2E は不要）、構造が振る舞いを支えられるか報告させます。**probe の成果物は使い捨てで、本流へ入れません。** 構造への反証はフェーズ 1/3 に戻します（原因が人間を判定者とする成果物なら 🙋）。

## フェーズ 3: 構造

ユースケースに対応するスキーマと境界契約を作り、参照を整合させます。UI 設計文書は作りません（画面は表にあり、見た目はフェーズ 4 で組み立てます）。

1. `implementer (mode: schema)`（🙋）— UC ディレクトリ、`enforced_at` が DB を指す BR、用語集、**スキーマ正本パス**を渡します。保証点の提案（非対称性でルールの SSOT となる強制箇所を決める）は同じゲートで決着させます。承認した提案は ADR（[adr.md](adr.md)）にし、`enforced_at` が変わったら `spec-author` が BR を編集します。**永続データを所有しないスライスは省略**。端末内永続化（SwiftData / SQLite / Core Data）も永続データです。
2. **`_shared` の初期化**（オーケストレーターがその場で実行）— なければ `${HARNESS_ROOT}/templates/develop/components.yaml` から `docs/_shared/components.yaml` を作り、確定スキーマから最初の共有 DTO とエラーコードを設定します。
3. `spec-author` — active UC ディレクトリ + 確定スキーマから `contract.yaml`（`draft`）を導出。UC ごとに並行し、同じ `_shared` / 既存契約パスを渡します。`_shared` 追加依頼は報告で返し、次の周回前に自ら適用します。その後 `spec-lint validate` を実行します（操作キーは閉じた集合、`errors[].code` ごとに失敗例 1 つ、`errors:` 順は評価順。例とテストで反証し、`when` ラベルでは反証しません）。
4. `reviewer (mode: structure)` — 読み取り専用の別コンテキスト。共有概念や構造変更には**推奨**（「手戻り」の概念全体の範囲を渡し、完了済みスライスも含む）、ローカル UC は**任意**です。使命は意味の検査だけであり、書式、transport フィールド、語彙、例（spec-lint）、配置 / 死んだルール / ID（trace-check）は機械が判定済みです。指摘は `severity: 阻止 | 持ち越し` を持ち、「周回台帳と停止条件」に従って反復します。
5. **`fixed` にする** — spec-lint 成功、起動したレビューの `阻止` ゼロで、**オーケストレーター**が `x-status: fixed` とし、`phase:` を `構造` へ進めます。proposal レビューでは行わず、作成者・判定者も行いません。

## フェーズ 4: 振る舞い

開始時に `phase:` を `実装` へ進めます。以下はすべて `fixed` 契約を前提とし、変えたくなったら停止してフェーズ 3 へ戻ります。

1. 契約が `fixed` になったら**4 担当を 1 メッセージで起動**: `test-author (track: backend-logic)`（各 REQ の `## 検証方針` に分割クラスを宣言し、`@covers REQ-nnn#class` 付き Red テストを作成。**実装を読まない**）、`test-author (track: scenario)`（`UC.md` の主シナリオ・事後条件と契約の `examples` から UC の **1 つ**のシナリオテストを作成。`UC-nnn` タグ、`@scenario UC-nnn` 注釈、スタックの保留マーカーを付け、意味は Red でも CI を失敗させない。**実装を読まず**、REQ 方針も書かない）、契約だけから backend を作る `implementer (mode: logic)`、`implementer (mode: appearance)`（🙋、契約に従うモックデータ、ロジックなし、機能名の識別子を出力）。4 担当とも共有内容を互いからではなく SSOT から導出します。BE テストが呼ぶ入口は契約と testing 末端ファイルの「operation → entry」規約、シナリオテストと見た目のロケーターはスタックの system-testing / frontend-coding 末端ファイルに従い、用語集（文言）と契約（操作・フィールド名）から導出します（ADR-0037）。
   **ロケーターの突き合わせ（オーケストレーター、目視前にその場で）**: 見た目とシナリオテストが両方返ったら、テストが指定する識別子・文言と見た目が出力するものを比較します。不一致なら見た目を動かし、テストは動かしません（R-1108）。シナリオテストのパスを完了時入力として `implementer (mode: appearance)` を **1 回**再起動し、整合後の見た目に 🙋 目視を開きます。人間が見る時点で識別子は確定済みです。シナリオテストが検証しないレイアウトや装飾は目視で自由に変更できます。
2. **完了時の突き合わせ** — BE テストは logic implementer の開始時入力ではなく、*完了時*入力です（読み手と書き手を先に並行起動できる唯一の例外）。両方が返り、実装が先だった場合、Red テストを渡して implementer を **1 回**再起動します（Red + 影響範囲を実行）。スライスの REQ に `trace-check --only C1,C10,C11` の違反がなく、選択実行が成功したら組を閉じます。
3. **frontend 接続** — 目視後、frontend のパスを担当する `implementer (mode: logic)` がリクエスト処理、状態、契約の境界を見た目に接続します（**フレームワークの形に従う**。FE 単体テストは作らず、型と lint で検証）。**シナリオテストが今回の完了時入力**です。保留マーカーを除去し、**UC のシナリオだけ**（`UC-nnn` 選択。システムスイート全体は禁止）を実行して成功させます。Red は「情報の振り分け」の順（実装 → テスト → SSOT）で診断し、実装に合わせたテスト編集で解消しません。
4. **スイート** — Red-Green ループに入れるのは既定スイート（外部環境を起動しない）だけです。integration / system は別フォルダー・コマンドに置きます（場所はフレームワークの testing 末端ファイル、時点は「テスト実行の粒度」）。BE の契約適合テストは既定スイートです。system はシナリオテストだけ（UC ごとに正常系 1 つ。失敗経路は既定スイートの REQ クラス）を置き、全体実行は節目だけ。利用プロジェクトの `CLAUDE.md` にシナリオ環境（接続先 backend、seed データ、使い捨てアカウント）が必要で、作成者は捏造しません。
5. **機械ゲート** — `node "${HARNESS_ROOT}/tools/contract-run/contract-run.mjs" --uc UC-nnn`（`commands.contract_adapter` 経由で全 fixed 例を実行。「未宣言」は未実行であり成功ではない）と `node "${HARNESS_ROOT}/tools/trace-check/trace-check.mjs"`（C15 を含む。UC のシナリオテストが存在）。Red は「周回台帳」に従い制約として返します。
6. **判定** — `phase:` を `検証` へ進め、`reviewer (mode: slice)` を起動（読み取り専用。スライス、UC ディレクトリ、テスト、変更範囲）。最大 2 回。`阻止` はテストクラス（`test-author`）または lint 規則にして機械ループへ戻し、`持ち越し` は `DEFERRED.md` の行へ。`attacker` は起動しません。
7. **最終一覧、その後コミット** — `tools/gate-hook/stop-gate.mjs` が実行するもの: `spec-lint validate` → `trace-check` → `contract-run` → 利用プロジェクトの `commands.typecheck` / `lint` / `test`（既定スイート全体を 1 回）→ `commands.system`（宣言されていればシナリオスイート全体を 1 回。ブラウザーやシミュレーターは排他的資源なので実行中の Task は不可）。すべて問題なく `阻止` ゼロなら [commit.md](commit.md) に従いコミット（実行中 Task なし）し、`phase:` を `完了` へ進めます。

## 情報の振り分け

`docs/` の各文書は**現在形の不変条件だけ**を保持し、履歴、理由、計測値、未決事項を蓄積しません。先に分類してから渡します。

| 情報の種類 | 行き先 | 経路 |
| --- | --- | --- |
| 製品全体の Why、KPI、対象外。用語・禁止同義語。新 actor / goal | `00-vision.md` / `01-glossary.md` / `02-actors.md` / `GOAL.md` / `goals-backlog.md` | `spec-author`（🙋） |
| 新状態、イベント、例外経路（表のセル） | `…/UC-nnn-<slug>/UC.md` | `spec-author`（🙋） |
| 観測可能な振る舞いの変更 | `…/UC-nnn-<slug>/REQ-nnn.md`（1 文） | `spec-author`（🙋） |
| 主シナリオのステップ・事後条件の変更（シナリオテストが実行・検証するもの） | `…/UC-nnn-<slug>/UC.md` の `## 主シナリオ` / `## 事後条件` | `spec-author`（🙋）→ `test-author (track: scenario)` が再導出 |
| UI の文言。シナリオテストが指定する識別子 | `docs/01-glossary.md`（文言）/ `contract.yaml` の操作・フィールド名（識別子）。`UC.md` とテストには置かない | `spec-author`（用語集は 🙋）。ADR-0037 |
| 2 つ以上の UC を拘束するルール・強制箇所。横断的な閾値 | `docs/rules/BR-nnn.md`（`enforced_at`）/ `docs/nfr/NFR-nnn.md` | `spec-author`（🙋）。理由 → ADR |
| 要件のテストが分割する入力、検証しないもの | REQ の `## 検証方針` / `docs/verification/GLOBAL.md` | `test-author` |
| 境界の形の変更 | `…/UC-nnn-<slug>/contract.yaml` | `spec-author` |
| 2 つ以上の UC が使う契約語彙 | `docs/_shared/components.yaml` | オーケストレーター（作成者の報告を適用） |
| 全体構造、採用技術、設計制約（How） | `docs/design.md` | 🙋（オーケストレーターが代筆可。理由は ADR） |
| 判断の理由、トレードオフ、却下案、計測値 | `docs/adr/` | オーケストレーター。[adr.md](adr.md) に従う |
| 判定者の `持ち越し` 指摘（機械で決着できず保留） | `docs/verification/DEFERRED.md` | オーケストレーター（指摘ごとに 1 行。同じスライス内で再送しない） |
| 機械可読にできる値（閾値、列挙） | コード定数 / スキーマ制約（R-102）。文書は場所を示す | `implementer`（`logic` / `schema`） |
| 未決事項、残余リスク、人間の判断待ち | issue 管理（プロジェクト規約。なければ尋ねる） | オーケストレーター |
| 改訂履歴、差分の説明 | git コミットメッセージ | オーケストレーター。[commit.md](commit.md) に従う |

> **欠陥発見だけでは SSOT を変える理由になりません。** 判定者やテストの指摘を `spec-author` に振る前に、既存 REQ 文と BR がその誤りを反証できるか確認します。**できる**なら SSOT は正しく、変えるのは実装（または不足クラス → `test-author`）です。**できない**ときだけ SSOT 変更です。省くとレビューごとに UC ディレクトリが膨らみ、各作成者・判定者のコンテキスト費用になります。同じ理由で見た目の細かな指摘を SSOT に振りません（判定者は人間の目視）。
>
> **Red のシナリオテストの原因は 3 つで、この順にその場で診断します（オーケストレーター）:** (1) 主シナリオと契約が既に振る舞いを決めている → 実装の欠陥 → 名指した単位への制約として Red を `implementer (logic)` に渡す。(2) テストがシナリオにないステップを実行する、または DOM / ビュー構造を検証する → SSOT は正しい → `test-author (track: scenario)` が再導出。(3) シナリオが操作を表現できない → SSOT 変更 → `UC.md` の `spec-author`（🙋）、その後テストと実装を再導出。「テスト失敗」から直ちに「UC 変更」へ進まず、成功させるためにテストを編集しません。

## 手戻りと振り分け表

実装中に SSOT 変更が必要になったら停止し、SSOT を修正（上流優先、R-801）して再導出します。「一律に元のループへ巻き戻す」は禁止です。**振り分け前に測ります**（オーケストレーター、その場で）。

1. docs、宣言済みスキーマ、source、tests を一緒に検索します（`rg -l -F -e '<ID>' -e '<term>' -e '<identifier>' <roots…>`）。共有語彙と完了済みスライスも含め、新しい参照先がなくなるまで辿ります。生成物 / vendor コピーは対象外。検索できなかったルートを記録します。
2. 作業コンテキストに一時的な振り分け表を保持します。影響パス、変更意図、担当作成者、読み取り入力、書き込み先、依存、再検証範囲です。ヒットは候補であり編集対象とは限りません。生きた依存先と、撤回済み成果物・残すべき履歴説明を区別します。ゼロヒットや `trace-check` 成功は意味の証明ではありません。
3. 条件を満たす場合は「判断の事前検査」を適用します。振り分け表で全集合を**1 つの協調バッチ**として、作成者と依存ごとにまとめます。各 Task に影響パス、意図、待つ先行出力を渡します。1 バッチは 1 回の起動という意味ではありません。下流の読み手を起動する前に上流の書き込みと承認を終えます。
4. 作成者が別の依存先を見つけたら受領時に表を拡張します。影響する下流作業を止め、確定入力に対して再起動します。古い入力を承知で続けません。
5. バッチ確定後、生きた依存先の漏れを再検索し、全集合をフェーズの reviewer と機械検査へ周回ごとに 1 回渡します。表は一時的に保ち、台帳としてコミットしません。

| 変更の種類 | 戻り先と再検証範囲 |
| --- | --- |
| 1 要件の文、または新分割クラス | 現スライスへ（方針 → テスト → 実装を再導出） |
| 新セル、新 BR、確定済み構造に触れる SSOT 変更 | フェーズ 1（UC / REQ / BR）→ フェーズ 3 再実行 → 表に従って**完了済みスライスも再検証**（`trace-check` C4 は死んだルールだけを検出） |

## 判断の事前検査

- **契機**: 提案が共有概念 / ルールを追加・変更・撤回する、または既存の構造前提（状態、境界、永続化制約）を変える場合。定義中も対象です。不変の SSOT から導くローカル修正には行いません。
- 振り分け表を集めた後、**判断を実現する書き込みの前に**、`reviewer (mode: proposal)` を読み取り専用で起動します。変更前後の意図（未ファイル化ならその場の入力可）、根拠、概念全体のパス（UC ディレクトリ、方針付き REQ、BR、用語集、`_shared`、契約、スキーマ、関連 source / tests）を渡し、未作成成果物と理由も明示します。それら入力への書き手を止め、意味的な依存先を含む概念全体の反例を求めます。
- **受領時**: 根拠を検証し、表を拡張し、すべての `阻止` と不足証拠を解決してから振り分けます。設計詳細が必要なら担当作成者に報告としての提案を求め（成果物は変更しない）、再判定します。方針の曖昧さは競合する解釈を添えて人間へ。reviewer は方針を選ばず承認しません。問題のない proposal 報告が許すのは通常の作成者 / ゲートの順序だけです。**`fixed` 化もフェーズ前進も行わず、人間ゲートも追加しません**。成果物はフェーズ 3 で同じ範囲を再レビューします。

## 周回台帳と停止条件

すべての判定ループ（reviewer の `structure` / `slice` / `proposal` と Red の機械ゲート）は、オーケストレーターが作業コンテキストに保持する台帳で進めます。周回ごとに 1 行: **`阻止` 数、`持ち越し` 数、再導出した成果物、`same-location`（前周回で挙げた場所の指摘）**。

- **各周回のすべての `阻止` を、名指した成果物（操作、文書、単位）への制約として 1 回の起動で送ります。** 手戻りの単位は指摘ではなく成果物であり、「最小変更」は禁止です。slice reviewer の `阻止` は先にテストクラス（`test-author`）または lint 規則へ変換し、機械ループを経由させます。説明文だけで作成者に渡しません。
- **次の起動前にすべての `持ち越し` を `docs/verification/DEFERRED.md` の行として追加します**（テンプレート `${HARNESS_ROOT}/templates/develop/DEFERRED.md` が列を定義）。同じスライスで再送しません。
- **reviewer はスライスごとに最大 2 回。** 再判定は周回ごとに 1 回。2 回目以降は「前回の指摘 + 今回の変更範囲」を渡し、「修正確認 + 変更の影響範囲再走査」に絞ります（最初は全体判定。狭めるのは範囲だけ）。
- **周回間で `阻止` 数が減らない、または `same-location` 行が現れたら停止**し、台帳、反例、停滞理由の診断を人間へ提示します。期待だけで 2 回目を消費しません。
- **周回後のテスト失敗はクラス別（ファイル別）に読みます。** 合計は回帰を隠します。送り返す前に、想定した新 Red と、成功から失敗へ転じたクラスを分けます。

## テスト実行の粒度

既定スイートは**Red-Green ループが選ぶ母集団**であり、変更のたびに発火するコマンドではありません。各周回を最終判定として全体実行することは禁止です。

| 時点 | 実行するもの | 「成功」の意味 |
| --- | --- | --- |
| 修正 / 手戻り周回（排他的資源で省略した後のまとめ実行も含む） | **今回の Red + 影響範囲** | その選択が成功 |
| スライスがコミット可能と宣言するとき（最後の reviewer が `阻止` ゼロ） | **最終一覧**（`spec-lint validate`、`trace-check`、`contract-run`、次に利用プロジェクトの `commands.typecheck` / `lint` / `test` — 既定スイート全体を 1 回 — と、宣言されていれば `commands.system`） | 全コマンド exit 0、`trace-check` の新規違反なし |
| CI（push、pull request、merge） | 既定スイート全体、spec-lint、trace-check、CI が定義するもの | CI |

**システムスイート**（シナリオテスト）も 1 段上で同じ形です。`test-author (track: scenario)` の作成直後は新テストだけ（Red / 保留）、FE 接続周回は UC の 1 シナリオだけ（`UC-nnn` 選択）、最終一覧と CI は全体を 1 回（宣言済み `commands.system`）。**修正周回でシステムスイート全体を実行しません**。ブラウザーやシミュレーターは排他的資源です（「並行条件」）。

**影響範囲は失敗した 1 テストでも既定スイート全体でもありません。** 今回変更したファイルと同じ経路を観測するタグ付きスイート（`UC-nnn`）です。session、lock、stash、microphone、書き込み連鎖などの UC 横断の進行を共有するスイートは、UC ID が異なっても互いの影響範囲に含まれます。不明なら隣接 `UC-nnn` タグで広げ、既定スイートコマンドを発火させません。選択方法（タグ、filter flag）は渡すフレームワークの testing 末端ファイルが定め、ここは**いつ**を決めます。integration / system は節目またはフェーズ外に置きます。**オーケストレーターは修正周回、probe、reviewer 検査の一部として既定スイート全体を命じません。**

## 並行条件

起動ごとに、**4 条件がすべて成り立てば同時起動します（1 メッセージに複数 Task）**。どれかを満たさない組だけ直列化し、条件を明示します。フェーズ 1 の N 個の usecase Task / requirements Task、フェーズ 3 の N 個の contract Task、フェーズ 4 の `test-author (backend-logic)` ∥ `test-author (scenario)` ∥ `implementer (logic)` ∥ `implementer (appearance)` はこの条件の例であり、別規則ではありません（2 つの test-author は別フォルダー、既定スイートとシステムスイートを書きます）。

1. **入力が確定済み** — 各入力が `active` / 確定 / `fixed` で、同じ周回の別 Task の出力待ちではありません。読み取り入力を、オーケストレーターも含む全並行 Task の書き込み先と比較し、**同じファイルの書き手と読み手を重ねません**。改訂中のファイルはステータスラベルだけでは確定しません。**唯一の例外**: BE テストは logic implementer の*完了時*入力（フェーズ 4）なので、`test-author` と `implementer (logic)` を同時に始め、完了時の突き合わせで整合させます。
2. **書き込み先が互いに素** — 同じファイル（`_shared`、スキーマ正本、domain の単独文書、別 Task が読む `UC.md`）を書く Task を同時に実行しません。`_shared` とすべての `phase:` 行はオーケストレーターだけの担当です。2 つの `spec-author` が同じ BR を抽出するなら候補を返し、片方だけが書きます。
3. **共有語彙を同一に渡す** — glossary、BR、`_shared`、既存契約の同じパスを全並行作成者に渡します。
4. **人間ゲートを同時に 2 つ開かない** — 保留 🙋（spec-author / implementer schema / implementer appearance）は最大 1 つ。

主な並行対象は**独立スライス**です。`fixed` 契約を持ち 1–4 を満たすスライスは、各フェーズ 4 の連鎖全体を持たせて **2–3 個同時**に進められます。人間が手戻りを追える上限にします。**排他的実行資源（git index、単一の build / run 環境、シミュレーター）を使うステップは同時実行しません**。作成者が「排他性のため実行を省略」と報告したら並行区間を閉じ、**同じ implementer を単独で**省略 UC ID + 影響範囲を渡して再起動し、その選択を成功させてから進みます。未実行のまま reviewer やコミットへ渡しません。実行する判定者にも適用します。**Task が実行中ならコミットしません。** 途中で条件 2 が壊れたら、そのスライスを直列化します。作成者と判定者を別コンテキストにする要件は並行によって変わりません。

## Task の入力と受け取り

**Task 入力はパスであり、成果物本文ではありません。** SSOT、スキーマ、契約、テスト、見た目、変更範囲はリポジトリのパスで渡します。スライスでは **UC ディレクトリ**を渡します（agent が `ls` して内容を読む）。その場の本文を許すのは未ファイル化のものだけ、根拠付き指摘一覧、mode、予約 REQ ID などの制御情報です。全 Task に共有語彙のパスを渡し、日本語成果物と明示し、[bundles.md](bundles.md) に従うルール束を渡します。受領時は外へ出る判断の前に判定者の根拠を自ら検証し、自ら同じものを修正・承認せず、機械が決めるものを人間に上げません。

**モデル選択は 3 tier 方針です。** 各 agent 正本が `x-model-tier: top | mid | light` を宣言します。起動前に読み、起動 API 経由で適用します（ADR-0028）。Claude Code: `opus` / `sonnet` / `haiku`。Cursor: Task ごとに対応ファミリーの最新モデルを選択（`inherit` 禁止。ファミリーがなければ候補を報告して停止）。Grok Build: 各専門担当を `workflow` ツールで起動します。その場の Rhai script から `agent()` / `parallel()` へ渡す `agent_type` は agent frontmatter の `name:`（`implementer` など）とし、`fork_context` は設定しません。並行バッチは 1 回の `parallel()` 呼び出しです。人間ゲート前後で親に戻し、script にゲートを埋め込みません。script はその場で渡し、`.grok/workflows/` に保存しません。文法はセッションの `create-workflow` skill に従い、ツールが拒否したら再読します。`spawn_subagent` は専門担当の起動とは数えません。`workflow` / `agent_type` がなければ停止して指定 agent が未起動と報告し、`general-purpose` に代替しません。子は親のモデルを継承するため、セッションが top-tier agent の tier 未満なら報告します。Codex: TOML の `name` を用いる `spawn_agent`（`agent_type`、または `task_name` と `fork_turns: none` を使い `message` に役割定義名を指定）。指定可能なら `"${HARNESS_ROOT}/tools/codex-sync/models.json"` から `model` / `reasoning_effort` を渡し、固定できなければ報告します。カタログ ID をハードコードしません。

| 受け取った停止・報告 | 担当 | 処理 |
| --- | --- | --- |
| 草案 + 確認点（domain、UC、REQ / BR、NFR） | `spec-author` | 🙋 提示 → 承認後ステータス / 変更依頼で再起動。`?` セルは穴なので承認前に決着。既存 active UC を拘束する BR → 「手戻り」 |
| 契約草案、`_shared` 語彙依頼 | `spec-author` | 🤖 `spec-lint validate`。次周回前に自ら語彙を適用し、フェーズ 3 手順 4–5 へ |
| 契約を決着できない（UC / REQ / BR / スキーマの欠陥） | `spec-author` | 🙋 原因となる人間判定の成果物へ返し、承認後に再導出 |
| スキーマ草案 + 保証点提案、または「スキーマ正本未宣言」 | `implementer (schema)` | 🙋 提示 → 承認で確定（保証点 → ADR、`enforced_at` 変更 → `spec-author`）。正本なしなら人間に場所を尋ね、利用プロジェクトの `CLAUDE.md` / `AGENTS.md` / `traceconfig.json` に記録 |
| 構造への反証 | `implementer (probe)` | 構造原因（スキーマなど）→ 🙋 / それ以外はフェーズ 1 / 3 で再作成 |
| 見た目 + 確認依頼 | `implementer (appearance)` | 🙋 提示 → 確定 / 変更依頼で再実装 |
| 分割クラス + Red テスト | `test-author (backend-logic)` | 🤖 `implementer (logic)` の完了時入力 — フェーズ 4 の完了時の突き合わせ |
| UC のシナリオテスト（Red / 保留、`@scenario UC-nnn`） | `test-author (scenario)` | 🤖 両方返ったら見た目とのロケーター突き合わせ（見た目を動かす）→ FE 接続 `implementer (logic)` の完了時入力 |
| FE 接続時・節目でシナリオが Red | `implementer (logic)` / stop-gate | 🛠 「情報の振り分け」の順（実装 → テスト → SSOT）で診断。実装に合わせてテスト編集しない |
| 要件・契約が不足（欠落セル、矛盾） | `test-author` | 原因が SSOT → `spec-author` 経由で 🙋 / 契約 → 🤖 `spec-author` が再導出 |
| 契約が不足（実装中） | `implementer` | 契約内で閉じる → 🤖 `spec-author` が再導出 / 人間判定成果物に届く → 🙋 |
| テスト未実行（排他的資源で省略） | `implementer` | 🛠 並行区間を閉じ、同じ implementer を省略 UC ID + 影響範囲で単独再起動。未実行のまま reviewer・コミットへ進まない |
| テスト Red、`trace-check` / `contract-run` 違反 | `implementer` | 🤖 全 Red を 1 起動で制約として渡し、Red + 影響範囲を再検査。台帳に 1 行。Red に既定スイート全体で応じない |
| proposal 報告 | `reviewer (proposal)` | 「判断の事前検査」: `阻止`・未検査証拠は振り分けを止める。ステータス・フェーズ変更なし |
| 成果物の指摘（`阻止` / `持ち越し`） | `reviewer (structure)` | `阻止` → `spec-author` / `implementer (schema)` へ 1 起動で制約を渡し、差分範囲を再判定（≤ 2 回）。`持ち越し` → `DEFERRED.md`。**`阻止` ゼロ + spec-lint 成功 → オーケストレーターが `fixed` にする** |
| スライスの指摘（`阻止` / `持ち越し`） | `reviewer (slice)` | `阻止` → テストクラス（`test-author`）または lint 規則 → 機械ループ。`持ち越し` → `DEFERRED.md`。**`阻止` ゼロ → 最終一覧 → コミット** |
| `阻止` 数が減らない、`same-location` 行 | 任意の `reviewer` | 🙋 停止: 台帳 + 反例 + 診断 |

## 人間ゲート

**子 agent はユーザーと会話できません。** 🙋 の agent は自己承認せず、人間が決める点付きの草案を返して停止します。確認（AskUserQuestion / plan mode）とステータス遷移（`active` / `frozen` / `living`、確定見た目・スキーマ）はオーケストレーターが行います。子 agent 内に人間ゲートを埋め込みません。
