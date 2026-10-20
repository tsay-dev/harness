---
description: "📚 docs の SDD / SSOT 規約（ID 付きルール）"
applyTo: "docs/**,traceconfig.json,**/CLAUDE.md,**/AGENTS.md"
---

# 📚 docs の SDD / SSOT 規約（ID 付きルール）

> 対象はすべてのプラットフォームの `docs/` 配下の全ファイルです。指摘では ID で引用します（`R-101`）。
> 各成果物の書式の正本は `${HARNESS_ROOT}/templates/develop/`、機械検査は `"${HARNESS_ROOT}/tools/spec-lint"`（書式、ライフサイクル）と `"${HARNESS_ROOT}/tools/trace-check"`（トレーサビリティ C1–C27）です。この末端ファイルが持つのは、テンプレートにもツールにも置けない原則と、誰が何を書いてよいかだけです。機械が検査する規則には検査器を添えます。

## 1. SSOT の原則

- **R-101 (MUST)** 事実の本文はリポジトリ内のちょうど 1 箇所にあり、ほかは ID またはパスで参照します。
- **R-102 (MUST)** 機械可読にできる事実（型、スキーマ、制約、定数、設定）の SSOT を文書にしません。文書は存在と意図だけを持ち、値と構造はコード、DB、契約に置きます。
- **R-103 (MUST)** 参照は下流 → 上流の一方向です。上流文書は下流を列挙せず、逆引きは `trace-check` が導出します。
- **R-104 (MUST)** 検証手段（テスト、検査、計測）のない文を要件やルールにしません。検証できなければ方針として vision か ADR の Context に置きます。
- **R-105 (SHOULD)** 同じ文が 2 つの UC に現れたら BR へ抽出します。active な BR は、少なくとも 1 つの active な REQ の `br:` から参照します（C22。規則を REQ のテストで検証する）。

## 2. ID の文法

- **R-201 (MUST)** ID は不変、内容は変更可能です。廃止は `status: withdrawn` であり削除ではありません。
- **R-202 (MUST)** `GOAL-nn` / `UC-nnn` / `REQ-nnn` / `BR-nnn` / `NFR-nnn` / `ADR-nnnn` / `ACT-nn` / `KPI-nn`。番号は再利用しません。桁幅は `traceconfig.json` で変えます。
- **R-203 (MUST)** 1 ID に 1 ファイル、frontmatter の `id:` に宣言します（例外は `goals-backlog.md` の `###` 見出しと ACT / KPI 表だけ）。本文に現れるほかの ID は参照で、参照先の定義は C16（BR）・C17（REQ）・C18（ACT・KPI）が検査します。
- **R-204 (MUST)** 採番は `node "${HARNESS_ROOT}/tools/trace-check/trace-check.mjs" --next <goal|uc|req|br|nfr|adr>`（原子的な予約。`--reserve N` で連番、`--next req` は UC 表が予約した ID も数える）。二重定義は C12 が検出します。
- **R-205 (MUST)** 数値部は固定幅のゼロ埋めです。番号に所属や分類を埋め込みません（所属は frontmatter、R-1007）。

## 3. 各文書に書いてよいもの

- **R-301 (MUST)** GOAL は What（アクターが目指す達成後の状態・成果）を定義します。操作、機能の利用、実装手段を目的に置き換えません。手段を別のものに替えても同じ達成状態を指す文にします。未着手の backlog にも適用します。
- **R-302 (MUST)** UC は GOAL に至る How（アクターとシステムの観測可能なやり取りによる達成手段）を定義します。成功時の事後条件が `goal:` の状態の実現にどう寄与するかを示します。ここでの How は利用・業務のシナリオであり、アルゴリズム、技術選定、画面構造などの実装設計ではありません。意味の適合は文書とレビューによる説得的統制です（R-301 ともに R-901）。

| 文書 | 書くもの (MUST) | 書かないもの (MUST NOT) |
| --- | --- | --- |
| `00-vision.md` | 課題、対象者、計測可能な成功指標（KPI）、対象外 | 機能一覧、画面、技術選定 |
| `01-glossary.md` | 用語、1 文の定義、コード識別子（active な仕様が使う語はコードに存在すること。C25）、禁止同義語 | クラス設計、テーブル定義 |
| `02-actors.md` | actor の閉じた集合（`ACT-nn`、システム actor を含む。種別は「人間」か「システム」で始め、「システム」で始まる actor だけが人間でない。spec-lint / C15） | goal を実現する UC（R-103） |
| `GOAL.md` / `goals-backlog.md` | R-301 の達成状態を actor の言葉で 1 文、`actor`、`origin`（KPI）、`domain`（R-1009。backlog の書式はテンプレート） | 達成手段、操作手順、配下 UC の一覧 |
| `UC.md` | R-302 のシナリオ、状態 × イベント表、事前・事後条件、BR の**参照** | 実装設計、BR 本文、REQ 本文、導出 REQ の一覧、契約のエラー評価順序（R-1207） |
| `REQ-nnn.md` | EARS 1 文、frontmatter（`pattern`、`uc`、`br`、`status`）、検証方針 | 実装手段、UI 詳細、テストケースの内容 |
| `BR-nnn.md` | ルールの存在、意図、`enforced_at` | 参照元、機械可読にできる値（R-102）、契約のエラー評価順序（R-1207） |
| `NFR-nnn.md` | 閾値 + 計測方法、検証の所在（保留でないテストの `@covers NFR-nnn` か `measured_by:`。`measured_by` は docs の goals / rules / nfr / adr の外にあるリポジトリ内のファイルで、中にその NFR の ID が現れる。外部の計測は ID と計測先を書いた runbook を指す。C20） | 計測できないもの（R-104） |
| `ADR-nnnn-<slug>.md` | Context / Decision / Consequences、却下した選択肢と理由 | 現在の設計状態（ADR は更新せず置き換える） |
| `verification/GLOBAL.md` | プロジェクト全体の「検証しない」範囲と理由 | REQ ごとの方針（REQ に置く） |
| `verification/DEFERRED.md` | 機械検査にできない reviewer 指摘を解決・昇格まで 1 行ずつ保持（オーケストレーターのみ） | テストや lint が判定できる指摘、人間待ちの未決事項（issue 管理へ） |
| `contract.yaml` | 境界の形（操作、型、**評価順の**エラー、エラーコードごとに失敗例 1 つ） | 同内容の説明文コピー、ルール、目的、エラーの順序・排他性の説明文 |

## 4. 要件（EARS）

- **R-401 (MUST)** 1 要件に 1 文、外部から観測可能な振る舞いだけです。判定: 実装の全行を置き換えてもその文は真か。偽になり得るなら設計です（文の数は spec-lint）。
- **R-402 (MUST)** `pattern:` に `Ubiquitous` / `Event-driven` / `State-driven` / `Unwanted behaviour` / `Optional` のいずれかを明示します（spec-lint）。
- **R-403 (SHOULD)** 各 UC に最低 1 つの `Unwanted behaviour` 要件を置きます。
- **R-404 (MUST)** REQ を導出したセルは UC の表が保持し、対応をほかに置きません。表と UC の REQ は 1 対 1 です（C17）。

## 5. ユースケース

- **R-501 (MUST)** 状態 × イベント表のすべてのセルを埋め、不可能なセルには `不可` と理由を書きます（spec-lint）。
- **R-502 (MUST)** 主シナリオの各ステップを権限、不変条件違反、並行性、外部依存の 4 分類で走査します（spec-lint）。
- **R-503 (SHOULD)** UC は「一度の着席で完了する価値の単位」です。login / logout に細分化しません。

## 6. 検証

- **R-601 (MUST)** ケースの準備、操作、期待値の SSOT はテストコードです。文書に転記しません。
- **R-602 (MUST)** テストは `@covers REQ-nnn#class` で要件を直接参照します（C3）。
- **R-603 (MUST)** 網羅表は `trace-check` の出力だけで、手書きしません。
- **R-604 (MUST)** 検証方針には必ず「検証しない」ものと理由を書き、それ以外はテストコードから復元できない行だけを書きます。

## 7. コードとの接続

- **R-701 (MUST)** 実装は `@implements REQ-nnn / BR-nnn / UC-nnn` で上流 ID を参照します（ID のみ。配置は comments 末端ファイル。存在しない ID は C5）。
- **R-702 (MUST)** 層の依存方向は lint / C6（`traceconfig.json` の `layering`）で強制します。
- **R-703 (MUST)** 実装のエラーコードは `_shared` の `errorCodes` に含まれ（C7）、`errorCodes` のコードはどれかの契約の `errors` で使われます（C24）。
- **R-704 (MUST)** DB 設計の SSOT は利用プロジェクトのスキーマ正本（`traceconfig.json` の `schema`）であり文書ではありません。`enforced_at` が DB の BR は、その正本で `@implements BR-nnn` 付きの制約として実現します（C13）。複数箇所で強制できるルールは、どの箇所を除くと正しさが壊れるかで保証の SSOT を決め、ADR に記録します。
- **R-705 (MUST)** すべての `active` REQ と BR に実装からの `@implements` があります（C14）。逆向き（実現単位を置く場所 `source.unit_dirs` の、どの仕様も指さない単位）は C19 が検出します。仕様を持たない技術部品は `source.support_dirs` に置き、`source.dirs` のファイルはどちらかに入れます（C27）。C14 / C19 が見るのは注釈の存在で、単位が文を実現するかは reviewer に残ります（R-901）。

## 8. 変更手順

- **R-801 (MUST) 上流優先。** 実装が仕様の誤りや穴を示したら、上流 SSOT を更新して再導出します（契約 → テスト → 実装）。
- **R-802 (MUST)** 判断の変更は `supersedes:` を持つ新 ADR の追加で行い、既存 ADR を書き換えません。
- **R-803 (MUST)** マージ条件はテスト成功かつ `spec-lint` / `trace-check` の違反ゼロです。
- **R-804 (MUST)** 紐づきに例外を作りません。既知の違反を通す baseline、コードに書く例外の印、検査の黙った省略は持たず、対象が無いことは `traceconfig.json` に理由付きで宣言します（`{ "none": "<理由>" }`。それを求める active な文書・fixed な契約が無い間だけ通る。C26）。`traceconfig.json` の変更は人間が承認します（ADR-0057）。既存資料への導入は宣言の範囲を広げて進めます（ADR-0056）。

## 9. 統制の種類

- **R-901 (SHOULD)** 各ルールが構造的（型、制約、検査）か説得的（文書、レビュー）かを把握し、説得的統制だけの場合は文書に明記します。

## 10. ファイル粒度と配置

- **R-1001 (MUST)** GOAL / UC / REQ / BR / NFR / ADR は 1 ID に 1 ファイルです。ファイル名は ID（ノードファイルは `GOAL.md` と `UC.md`、ADR は `ADR-nnnn-<slug>.md`）。
- **R-1002 (MUST)** REQ の検証方針は REQ ファイル内の `## 検証方針` に置きます（C2）。プロジェクト全体の除外だけを `docs/verification/GLOBAL.md` に置きます。
- **R-1003 (MUST)** 索引は生成し、コミットしません（`trace-check --index`）。
- **R-1004 (MUST)** ディレクトリ全体の読み取りを既定にせず、frontmatter の参照（UC の `goal:`、REQ の `uc:`、`br:`）から読むものを決めます。
- **R-1005 (SHOULD)** 1 ファイルはおおむね 100 行以下です。超えたら分割するか、値を機械可読にします。
- **R-1006 (MUST)** GOAL → UC → REQ は木なので、`docs/goals/<GOAL-nn-slug>/<UC-nnn-slug>/` に `UC.md`、その `REQ-*.md`、`contract.yaml` を置き、横断領域（BR / NFR / ADR / glossary / `_shared`）は `docs/` 直下に集約します。
- **R-1007 (MUST)** 所属の SSOT は frontmatter で、ディレクトリは配置です。一致は C9 が検査し、再構成時は先に frontmatter を更新します。
- **R-1008 (SHOULD)** 未着手 goal は `docs/goals-backlog.md` に置き、着手時にディレクトリへ昇格します。
- **R-1009 (MUST)** vision に複数ドメインがあれば、各 goal は `domain:`（backlog は `- **ドメイン**:` 行）で所属を宣言し、許容値の閉じた集合は `00-vision.md` が持ちます。
- **R-1010 (MUST)** 利用プロジェクトの作業指針（`docs/` と同じ階層の `CLAUDE.md` / `AGENTS.md`）は地図です。構成、層の向き、命名規則、`traceconfig.json` に置けない逸脱、正本へのリンクだけを持ち、コード・設定・テストに正本がある事実（部品の振る舞い、環境変数、フェイクの使い方）と人の運用手順（README へ）を写しません。150 行以下（spec-lint）。REQ を持たない技術部品の振る舞いの正本は、その単位の doc comment です（ADR-0051）。

## 11. 分割クラス（テスト生成の下限と上限）

- **R-1101 (MUST)** 各 `active` REQ の `## 検証方針` に 1 つ以上の分割クラスを `` - `#name` — 意図を 1 行 `` で宣言します。クラス一覧がその要件に必要なテスト全体の SSOT です。
- **R-1102 (MUST)** 各テストは `@covers REQ-nnn#class` で宣言済みクラスをちょうど 1 つ指定します（C11）。
- **R-1103 (MUST)** テスト追加前に方針へクラスを宣言します。方針外のテストは C11 で失敗します（生成テストの上限）。
- **R-1104 (MUST)** 各宣言済みクラスを最低 1 つのテストで覆います（C10）。検証しない入力領域はクラスにせず、理由とともに「検証しない」に書きます。
- **R-1105 (SHOULD)** 同値クラスごとに 1 クラスです。複数クラスをまたぐ 1 テストは分割の失敗です。
- **R-1106 (MUST)** `UC.md` の `## 主シナリオ` と `成功時` 事後条件が UC シナリオテストの SSOT です。actor が人間の各 `active` UC に正常系シナリオテストを 1 つ置き、`@scenario UC-nnn` を付けます（C15 は保留でないものの存在を検査）。失敗経路は REQ のクラスです。
- **R-1107 (MUST)** シナリオテストは用語集の語でステップを実行し、事後条件を検証するだけです。シナリオにないステップ、DOM・ビュー階層の assertion は禁止で、追加ステップは先にゲート経由で `UC.md` を変えます。
- **R-1108 (MUST)** ロケーターは実装を読まず、可視文言は `01-glossary.md`、識別子は契約の操作名とリクエストフィールド名から導出します（ADR-0037。構文はスタックの system-testing 末端ファイル）。食い違えば見た目を動かします。

C10 / C11 / C15 が保証するのは宣言と存在の一致です。分割が入力空間を尽くすか、assertion が文の意味を検証するかは reviewer の責任です（R-901）。

## 12. 契約一般（HTTP 以外の境界）

契約は所有権、変更周期、寿命が異なる 2 者の境界での機械可読な合意で、HTTP はその一例です。

- **R-1201 (MUST)** 開始時に境界を列挙し、契約の SSOT と検査者を割り当てます。最低限: 時間（出荷済み版が書いた永続データ）、OS / プラットフォーム、モジュール間（公開型）、所有しない外部 API。
- **R-1202 (MUST)** 時間の境界。出荷済み各版が書いたデータを `contracts/fixtures/` の golden fixture に追記専用で保持し、現行コードが全 fixture を読めることを分割クラス `#persist-vN-compat` のテストで証明します。
- **R-1203 (MUST)** OS 契約（Info.plist、entitlements、manifest）は機械可読なのでそれ自身が SSOT です。
- **R-1204 (SHOULD)** モジュール間は言語の型システムが契約、コンパイラーと C6 が検査者です。テストが契約操作を呼ぶ入口は、フレームワークの testing 末端ファイルの「operation → entry」規約で操作名から導出し、ルールパッケージがなければ利用プロジェクトの `CLAUDE.md` / `AGENTS.md` に命名規則として 1 回宣言します（操作ごとの表にせず、規則に従わないものだけを挙げます）。テストの足場（境界フェイク、fixture、テスト用 app）の使い方の正本はそのテストコードの型とコメントで、作業指針に写しません。実装を読んで導出しません。
- **R-1205 (SHOULD)** 外部 API はクライアント側で防御的に扱います（DTO 層、記録した応答 fixture、未知フィールドを無視するデコード）。
- **R-1206 (MUST)** 各 UC に `contract.yaml` を置きます（harness 書式、ADR-0001）。境界の入口と契約の操作は `@operation` で双方向に対応させます（C21）。境界を越えない UC は `operations: {}` と `x-no-boundary: <reason>` で宣言し、欠落させません。HTTP でない境界に HTTP 操作を捏造しません。
- **R-1207 (MUST)** 失敗条件の評価順序は `contract.yaml` の `errors:` 一覧順だけに置き、最初の一致を採用します。`when` はラベルで排他性の証明ではなく、順序を UC / BR / ADR / スキーマコメント / 操作配下の `x-*` に再記述しません（spec-lint が `x-*` を拒否）。隣接項目の優先順位は両条件を満たす例（`contract-run`）またはテストクラスで反証します。
