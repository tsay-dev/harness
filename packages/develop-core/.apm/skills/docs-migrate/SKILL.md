---
name: docs-migrate
description: プロジェクトの docs とコードを harness の SDD/SSOT 配置（docs/goals/GOAL-nn/UC-nnn/、EARS 要件、BR/NFR/ADR、境界契約、@covers/@implements 注釈、trace-check）にフェーズごとに適合させ、各フェーズ末に人間のレビューゲートを設ける。旧 F-xxx 配置の harness 利用プロジェクトと、harness docs がない既存プロジェクトの両方を扱う。/docs-migrate、または「docs を移行して」「docs が harness に準拠しているかチェックして」「SDD に準拠させて」「docs レイアウトを最新化して」などで起動する。
---

> **外部の実行資産:** tools と templates は APM の依存ではありません。`HARNESS_ROOT` を別途用意した harness チェックアウト（通常は `.harness`、harness 自体を編集するときはこのリポジトリのルート）に解決し、以下のコマンドとテンプレート参照ではその絶対パスを使ってください。必要な資産がなければ、手順を実行する前にチェックアウトを入手します。


# 🔧 docs-migrate — 既存プロジェクトを段階的に適合させる（sdd-conform）

> **この skill は適合の定義を所有しません。** 正本は常に「現行 harness の spec-lint + trace-check + `${HARNESS_ROOT}/templates/develop/` のテンプレート + 規約の末端ファイル [docs.instructions.md](../../instructions/docs.instructions.md)」です。この skill は到達手順だけを保持します。harness 改訂時はそれらが新しい正本となり、この skill を書き換えずに従います。
>
> **役割**: 実行中はオーケストレーターです。機械的な移動は自ら行い（判定者は機械）、内容の変換はすべてその書式の作成者に別コンテキストで委譲します（domain / UC / REQ / BR / contract は `spec-author`、分割クラスと注釈は `test-author`、`@implements` は `implementer`）。ADR とコミットは develop skill の [adr.md](../develop/references/adr.md) / [commit.md](../develop/references/commit.md) に従って自ら書きます（ADR 本文にも A-1 が適用）。**言語**: 人間への報告と移行する docs は日本語です。各 Task 入力で明示します。

## 絶対規則（違反時は停止して人間に尋ねる）

- **A-1 創作しない。** 既存コード、docs、テストから読み取れない振る舞いを要件、ルール、表セルとして書きません。読み取れないものは質問として `OPEN-QUESTIONS.md` へ。**もっともらしい仕様の創作が、この手順の最悪の失敗です。**
- **A-2 破壊しない。** 既存文書を削除しません。役目を終えたものは `docs/attic/` へ移動し、元の場所に 1 行の移動案内を残します（`git mv`。コピー後削除は禁止）。
- **A-3 振る舞い不変。** 全フェーズで本番動作を変えません。許すコード変更は注釈コメント追加、定数抽出（値不変）、ファイル移動です。途中の動作バグは修正せず `OPEN-QUESTIONS.md` へ（修正は `/develop` の仕事）。
- **A-4 フェーズゲート。** 各フェーズ末に停止し、次へ進む前に人間が成果物をレビューします。1 フェーズ = 1 コミット（または [commit.md](../develop/references/commit.md) に従うコミット群）。フェーズ間の変更を混ぜません。
- **A-5 縮小原則。** フェーズ 1 で baseline 付き `trace-check` を導入し、`spec-lint` はフェーズ 7 まで `--ignore-legacy-layout` と独自 baseline（`.spec-baseline.json`）で実行します。各フェーズで「新規違反ゼロ」（R-803）を保持します。baseline は縮小のみ（R-804）で、**許される増加はちょうど 2 回**です。どちらも既存の穴を正直に記録し、フェーズ報告に件数を明記します。フェーズ 5 末の spec-lint（REQ がまだ `draft` の `fixed` 契約。移行は契約が REQ より先）と、フェーズ 6 末の trace-check（`active` になった REQ / BR のクラスを既存テストが尽くさない、実装に `@implements` がない。C1 / C10 / C14 が初適用）です。フェーズ 6 後は増加しません。
- **`OPEN-QUESTIONS.md` はオーケストレーターだけが書きます。** 作成者は質問を報告で返し、あなたが追記します。同じファイルの並行書き込みは破損させます。
- **横断的な単一ファイル編集は並行展開の前に行い、横で並行しません。** 共有ファイルへの `@implements` 分配、全 GOAL の注釈、`traceconfig.json` / `_shared` 編集を単独で終えてから UC ごとの Task を起動します（同じファイルの並行編集は参照位置の不一致を生みます）。独立検証者と修正者は同じ作業ツリーで同時に作業しません（順次実行、または検証者に worktree）。排他的 build 資源（`xcodebuild` など）は直列化し、テスト件数を前実行と比較してから信用します。
- **承認状態を保持します。** 移行で昇格・降格しません。旧 `fixed` は新 `active`、`draft` は `draft` のままです。唯一の延期はフェーズ 4 承認の REQ で、テスト接続後のフェーズ 6 に `active` と書きます（A-5）。承認自体はフェーズ 4 報告に記録します。
- **情報を黙って落としません。** 新配置で行き先がないものは develop skill の [playbook.md](../develop/references/playbook.md)「情報の振り分け」（ADR、issue、コミットメッセージ、attic）に従い、計画と報告の両方に明記します。

## フェーズ 0: 棚卸し（書き換えなし）

1. `node "${HARNESS_ROOT}/tools/spec-lint/spec-lint.mjs" validate` を 1 回実行し（`docs/specs/` で停止したら `--ignore-legacy-layout` を追加して残りの報告を表示）、分類します。
   - **適合**（exit 0、警告だけ）→ 警告を「次の develop 差分更新で対応」と報告し**停止**（確認だけの起動はここまで）。
   - **旧 harness 配置を検出**（`docs/specs/F-xxx-<slug>/`、`PRD.md`、`docs/specs/_shared`、日付付き ADR ファイル名）→ 下記フェーズ 2–5 の対応をファイルごとに適用。
   - **harness docs なし**（既存プロジェクト）→ フェーズ 2–6 の抽出手順を適用。
2. リポジトリを調べ、`${HARNESS_ROOT}/templates/docs-migrate/INVENTORY.md` から `docs/INVENTORY.md` を作ります。文書、README、仕様相当のコメントブロック、wiki ファイルごとに 1 行、**SSOT候補 / 派生物 / 重複 / 不明・死蔵**で分類し、処置案を記載します。重複の組ごとにどちらを本文にするか 1 行添えます。
3. コードから中核リソース（entity）と状態値をそのまま列挙します（用語集の資料。表記揺れをすべて記録）。
4. `OPEN-QUESTIONS.md` を作り、迷った分類と発見した矛盾をすべて記録します。

**成果物**: `docs/INVENTORY.md`、`OPEN-QUESTIONS.md`。**停止（🙋）**: 人間が分類、特に「どちらを本文にするか」を承認します。

## フェーズ 1: 骨格と検査

1. `docs/goals/`、`docs/rules/`、`docs/nfr/`、`docs/adr/`、`docs/verification/`、`docs/_shared/`、`docs/attic/` を作成します（空のままのディレクトリは作りません、R-1008）。
2. `${HARNESS_ROOT}/templates/develop/traceconfig.json` から利用プロジェクトのルートに `traceconfig.json` を初期化し、言語、パス、ID 桁幅に合わせて `source` / `tests` / `layering` / `id_patterns` を編集します。**境界を列挙**（R-1201: 時間 / OS / モジュール間 / 外部 API）。実装のエラーコード正本が 1 つの場合だけ `contract` ブロックを設定します（なければ C7 は省略）。`docs/_shared/components.yaml` をテンプレートから初期化します（旧配置では `git mv docs/specs/_shared/components.yaml docs/_shared/components.yaml`）。
3. `node "${HARNESS_ROOT}/tools/trace-check/trace-check.mjs" --update-baseline` と `node "${HARNESS_ROOT}/tools/spec-lint/spec-lint.mjs" validate --ignore-legacy-layout --update-baseline` で初期 baseline を記録します（旧配置の既知 Red は OpenAPI 契約、`PRD.md`、旧 `_shared`）。CI（または hook の停止条件）へ「tests + spec-lint + trace-check」を追加します。harness workflow を呼ぶ最小設定で十分です。フェーズ 7 で除去するまで reusable workflow に `spec_lint_args: --ignore-legacy-layout` を渡します。以後、各作成者は通常のコマンドを実行します（`rsync` した docs コピーは禁止）。

**成果物**: 骨格、動作する検査、baseline。**このフェーズでは本文を書きません。**

## フェーズ 2: 語彙、actor、goal（`spec-author`、target `domain`）

棚卸し、用語集資料、既存資料をパスで渡し、**「抽出し、創作しない（A-1）」**と指示して **`spec-author`**（[spec-author.agent.md](../../agents/develop/spec-author.agent.md)、target `domain`）に委譲します。

1. フェーズ 0 資料から `01-glossary.md`。主な作業は表記揺れを禁止同義語列へ集めること。正規語は既存コードの多数派に従い、疑問は `OPEN-QUESTIONS.md` へ。
2. 旧 `PRD.md` / README から `00-vision.md`（Why、対象者、対象外）。**資料に数値がない KPI は `未計測`**とし、`OPEN-QUESTIONS.md` に質問を記載。旧配置の `PRD.md` の横断業務原則は BR 候補としてフェーズ 4 用にマーク。その後 `git mv docs/PRD.md docs/attic/PRD.md`。
3. 認証 / 認可コードと既存 docs から `02-actors.md`。システム actor も含めます。
4. goal: 旧配置では `F-xxx` 機能を actor の goal でまとめます（台帳の概要列が資料）。各組を `GOAL-nn-<slug>/GOAL.md`（着手済み）または backlog にします。既存の NFR 相当文は計測方法がある場合だけ `docs/nfr/NFR-nnn.md` にします。

**停止（🙋）**: 正規語と禁止同義語。以後の全文書をこの語彙で拘束します。承認後、ステータス（`frozen` / `living` / `active`）を設定します。

## フェーズ 3: UC と状態 × イベント表（`spec-author`、target `usecase`）

1. 入口（controller、CLI command、job。旧配置では通常 1 `F-xxx` = 1 UC、場合によって 2 `F-xxx` が 1 着席）から UC 候補を列挙し、R-503 の粒度へまとめます。
2. UC ごとに **`spec-author`**（target `usecase`）へ委譲（UC 間は並行、各入力に A-1）。`docs/goals/<GOAL-nn-slug>/<UC-nnn-slug>/UC.md` を作ります。各 Task が `trace-check --next req --reserve N` で REQ 番号を予約（原子的で並行衝突なし）。**状態 × イベント表は既存コードの分岐から埋めます**（旧配置では `spec.md` の状態節と GWT も使う）。対応する分岐がないセルは**埋めず `?` のまま**とし、`OPEN-QUESTIONS.md` へ。穴を見つけることが価値です。
3. 複数 UC にある同じ検証・ルールを `<!-- BR候補 -->` マーカーで残します（HTML コメントは spec-lint の placeholder 検索対象外）。

**停止（🙋）**: UC 粒度と穴一覧。承認後 `status: active`。

## フェーズ 4: 要件と業務ルール（`spec-author`、target `requirements`）

1. active UC ごとに **`spec-author`**（target `requirements`）へ委譲（並行、A-1）。予約セルごとに UC 直下の `REQ-nnn.md`（EARS 1 文）を作ります。**REQ ID はフェーズ 3 の UC 表の予約番号**です。入力として渡し、spec-author が自ら採番しません。BR は原子的な `--next br` を使うため並行抽出できます。旧配置の主資料は `spec.md` の `業務ルール` 箇条書き（1 項目 ≈ 1 REQ / BR）。`受け入れ条件`（GWT）はセル対応の証拠で要件ではありません。既存テストが観測する振る舞いなら、その観測が文の根拠です。`## 検証方針` はフェーズ 6 まで雛形のままです。
2. BR 候補は `docs/rules/BR-nnn.md`（1 ルールに 1 ファイル）へ、UC / REQ 側は ID 参照に置換（R-101 / R-105）。
3. **R-102 を適用**: 各 BR 値（閾値、列挙、一意性）について既存定数、DB 制約、スキーマを探します。あれば SSOT と宣言し、存在・意図だけを書きます。複数箇所で hardcode された同値は `OPEN-QUESTIONS.md` へ（統合は動作確認が必要で A-3 外）。
4. 重複段落を参照に置換し、原文を attic へ（A-2）。旧配置では内容の行き先が決まったら `git mv docs/specs/F-xxx-<slug>/spec.md docs/attic/specs/F-xxx-<slug>/spec.md` し、移動案内を残します。

**停止（🙋）**: REQ 一覧と BR 抽出。適合の中心なので最も時間を使います。承認後も**BR / REQ はフェーズ 6 まで `draft`**です（テストと `@implements` 接続前の `active` 化は全件で C1 / C10 / C14 を発火させ、縮小原則を壊す）。承認を報告に記録します。

## フェーズ 5: 契約と判断の掘り起こし（`spec-author`、target `contract`。ADR はオーケストレーター）

1. **契約**: 旧配置は OpenAPI（`docs/specs/F-xxx-<slug>/api-contract.yaml`）。各契約を自らその場で機械変換します: `node "${HARNESS_ROOT}/tools/spec-lint/spec-lint.mjs" convert docs/specs/F-xxx-<slug>/api-contract.yaml --uc UC-nnn --direction <inbound|outbound> --out docs/goals/<GOAL>/<UC>/contract.yaml`（自サーバーの API は `inbound`、このアプリから呼ぶ API は `outbound`）。変換器は形を保持（操作、request / response、4xx → `errors`、`components.schemas` → 契約自身の `schemas:`、`x-status` 引き継ぎで `fixed` 保持）し、判断できない点ごとに `# convert:` 注記（auth、推測が必要なエラーコード、summary 欠落）を残します。**`spec-author`**（target `contract`）へ委譲するのは注記の解消と `_shared` 移行（`components.schemas` → `schemas`、`securitySchemes` → `authSchemes`、エラーコード → `errorCodes`、あなたが適用）だけで、**再導出は禁止**です。UC に分割・統合する機能も先に変換し、その後 spec-author が分割・統合します。現 spec-lint（閉じた操作キー、エラーコードごと失敗例 1 つ）を満たし、配置不能キーの注記は情報を UC / REQ / BR へ移して解決します。`x-*` を残しません。旧契約に 4xx がない操作は `errors: []`（失敗経路なしの宣言）となり、失敗例のためコードを創作しません。契約なしのプロジェクトは「コードが実際に公開する境界を転記」と UC ごとに委譲（A-1。第三者境界は `owned: false` + `source`、境界なしは `operations: {}` + `x-no-boundary`）。**transport はテンプレートヘッダーの表で 1 回、一律に決定**します。永続化 → `local-store`、OS 機能 → `device`、第三者 SDK → `sdk`。自アプリ内のモジュール境界は既定で操作にしません（R-1204）。旧契約が内部境界を HTTP とし契約を維持したい場合は `internal`。その解釈を 1 ADR に記録して全 UC に適用し、個別担当が再判断・好みで `sdk` / `local-store` を割り当てません。その後旧ファイルを `git mv` で attic へ（A-2）。
2. **ADR**: 旧配置は `git mv docs/adr/NNNN-YYYY-MM-DD-title.md docs/adr/ADR-NNNN-title.md` し、frontmatter（`id` / `title` / `status: accepted` / 旧名から `date`）を追加。「却下案」段落を `## 却下した選択肢` に移します（必要なら [adr.md](../develop/references/adr.md) に従って自ら再構成）。ADR がない場合は [adr.md](../develop/references/adr.md) に従って現アーキテクチャの主要選択（層、認可位置、永続化戦略、フレームワーク）を**現状の記録として**自ら書きます。Context は「履歴不明」と正直に書いてよく、却下した選択肢にはテンプレート固定行 `- **記録なし**: 当時の比較は記録されていない（移行時に付した記録）` を使います（A-1、spec-lint が許容）。Context に git log / PR / コミットメッセージを引用するのは実在する場合だけです。

**停止（🙋）**: ADR が実態と一致し、契約の形が保たれたか。その後 `spec-lint validate --ignore-legacy-layout --update-baseline` を 1 回。これが最初の許可増加（A-5）、フェーズ 6 まで `draft` の REQ に対する `fixed` 契約です。件数を報告します。

## フェーズ 6: 検証の接続（`test-author`）

1. 先に `traceconfig.json` の `tests.test_pattern`（テスト名を capture）、`tests.covers_placement`（`@covers` はテスト印の `before`、または本体先頭行の `after`。片方を決め担当者に従わせる）、`tests.exempt_pattern` を設定し、`@covers` 欠落を報告だけで済まさず C11 で数えます。続いて UC ごとに **`test-author` の `annotate-existing` モード**へ委譲（mode と既存テストパスを渡す。既定 Red 作成指示を置換）。既存テストの観測から **REQ の `## 検証方針` に分割クラスを宣言**（R-1101）、既存テストへ `@covers REQ-nnn#class`（R-1102）と UC タグ、仕様外へ免除マーカーを付けます。**どの REQ にも合わないテストは必ず出ます**。(a) 要件漏れ → フェーズ 4、(b) 仕様外の実装詳細 → テスト内で明示。疑問は `OPEN-QUESTIONS.md`。**既存テストの分割を後付けで正当化しません**。尽くされない分割は正直に不足として baseline に残します。
2. 実装に `@implements REQ-nnn / BR-nnn / UC-nnn` を追加（コメントだけ、A-3）。層ごとに `implementer`（`mode: logic`、注釈のみ）へ委譲し、comments 末端ファイルをパスで渡します。
3. REQ **と BR** を `active` にします（フェーズ 4 承認済み。接続前に C1 / C10 / C14 が発火しないよう `draft` だった）。`trace-check` を実行し C1 / C14（未検証・未注釈）の一覧を得ます。これが 2 回目の許可増加（A-5）で、既存テストが尽くさない分割・コードにない注釈が C1 / C10 / C14 に見えるようになります。`--update-baseline` で 1 回記録し件数を報告、クラスを狭めて回帰を隠さず、検証不足の正直な台帳とします。**許される新テストは現動作を観測として固定するものだけ**（特性テスト）。期待が現動作と異なるならテストではなく `OPEN-QUESTIONS.md` へ。
4. `docs/verification/GLOBAL.md` はプロジェクト全体の「検証しない」範囲だけを保持します。

**停止（🙋）**: 網羅表と baseline の収支。

## フェーズ 7: 返済計画と定常運用

1. baseline の残余違反を返済 issue として列挙し、優先順は C1 > C14 > C7 > C4 > その他。
2. 利用プロジェクトの `CLAUDE.md` / README に定常規則を記録します。マージ条件（テスト成功 + 新規違反ゼロ、R-803）、上流優先（R-801）、baseline 縮小（R-804）。
3. 空になった旧ディレクトリ（`docs/specs/`）を `git rm` し、残る旧パス参照（プロジェクトの `CLAUDE.md`、README、CI 設定、hook）を更新し、CI から `--ignore-legacy-layout` を除去します。`spec-lint validate`（flag なし。`.spec-baseline.json` は空、または全件が返済 issue）と `trace-check` を最後に実行し、[commit.md](../develop/references/commit.md) に従いコミット（意図は docs 配置移行、対応の要約を添える）。
4. 以後の新規開発は `/develop`（GOAL → UC → REQ → contract → verification → implementation）に従います。

## 迷ったとき

1. [docs.instructions.md](../../instructions/docs.instructions.md) の規則 ID > テンプレート > この手順 > 常識。
2. まだ決められなければ選択肢と推奨を `OPEN-QUESTIONS.md` に書いて停止。**推測で進みません。**

## 完了条件

- 全 INVENTORY 行が SSOT / 生成物 / 参照 / attic として解決済み
- `spec-lint validate` が `--ignore-legacy-layout` なしで exit 0、`spec-lint --strict` / `trace-check --strict` が成功、または残余全件が返済 issue
- `OPEN-QUESTIONS.md` が空、または全項目に人間の回答あり

## この skill が行わないこと

- **仕様改善**（明確化の書き換え、肥大解消）— 警告のみ。`/develop` の差分更新で対応します。
- **harness 自体の修正** — lint、テンプレート、規約の末端ファイルの欠陥は人間に報告し、移行中に修正しません（移行途中で適合先を動かしません）。
- **`design.md` の創作** — なければ「任意、未作成」と報告。作成は人間（または人間の指示）によります。
