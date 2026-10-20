# trace-check

harness に同梱する依存なしの Node ツール。docs の SSOT（GOAL → UC → REQ、BR、NFR、契約、用語集）とコード
（テスト、実装、スキーマ）の**トレーサビリティ**を機械的に検証する。対象はカバレッジ、参照、配置、
層、契約語彙。sdd-kit の `trace_check.py` の Node 移植（移植理由: `docs/adr/ADR-0003`）。

- **検証するもの**: 下記の 25 検査。**書式とライフサイクル**（frontmatter、節、ステータス語彙、
  契約構造）は `../spec-lint/` の担当。両ツールは重複しない。
- **例外を作らない**（ADR-0056）: baseline（既知の違反を通す台帳）、コードに書く例外の印、検査の黙った省略は無い。
  違反は 1 件でも失敗にする。対象が本当に無い範囲だけを、`traceconfig.json` に理由付きで宣言する（下記「宣言」）。
- **読むもの**: 利用プロジェクト直下の `traceconfig.json`（`templates/develop/traceconfig.json` から一度ひな形を置き、
  利用プロジェクトが維持する）。注釈は全行を正規表現（`covers_pattern` / `implements_pattern` / `scenario_pattern` /
  `nfr_pattern` / `operation_pattern`）で検索するため、任意の言語に対応する。
  `implements_pattern` の捕捉は一覧でもよい（`@implements UC-001, REQ-009 / BR-015` — `,` または `/` で分割）。
- **生成するもの**: カバレッジ行列（レポート）と全プロジェクト索引（`--index`）。
  両方とも導出物であり、コミットしてはならない（R-1003 / R-603）。
- **使い方**: 作成者が直接実行する（`--only` で関心範囲に絞る）。orchestrator がスライスの最後に実行する
  （merge 条件はテスト成功 + 違反ゼロ、R-803）。CI でも実行する。

```bash
node trace-check.mjs [--root .] [--config traceconfig.json]   # 検査。違反が 1 件でもあれば exit 1
node trace-check.mjs --index                                  # 全プロジェクトの対応図。ID ごとに一行
node trace-check.mjs --next req [--reserve N]                 # 次の空き ID を N 個（goal|uc|req|br|nfr|adr）、一行ずつ — R-204。原子的:
                                                              # mkdir ロックで .trace-reservations.json に番号を予約するため、
                                                              # 並行 Tasks がすべて呼んでも同じ番号を受け取らない。req は
                                                              # UC.md の表が予約する ID もファイル作成前から使用済みと数える
node trace-check.mjs --only C9,C12                            # 指定検査だけを判定（作成者の自己検査）
```

終了コード: `0` = 違反なし / `1` = 違反あり / `2` = 使用法・設定エラー（宣言の不足、廃止したキーやフラグを含む）。Node のみ。
廃止したもの: `--update-baseline` / `--strict`（使用法エラー）、`baseline_file`・`tests.exempt_pattern`・`source.exempt_pattern`・
`contract.exclude_codes`（設定エラー）。残った `.trace-baseline.json` は読まずに警告する。

## 宣言

紐づきの検査に要るキーは省略できない。省略は設定エラー（exit 2）で、足りないキーをまとめて表示する。
対象が本当に無いなら `{ "none": "<理由>" }` と書く。その範囲は検査せず、レポートの末尾に「宣言された不在」として理由を出す。
省略と不在を区別するのは、契約の `auth: none` / `operations: {}`（R-1206）と同じ考え方。

| キー | 読む検査 | 子のキー（親が none なら不要） |
| --- | --- | --- |
| `docs.actors` / `docs.vision` | C15 / C18 | — |
| `docs.glossary` | C25 | — |
| `docs.shared` | C7 / C24 | — |
| `source` | C5 / C14 / C19 / C21 / C25 | `unit_dirs`（宣言時は `unit_pattern` が必須で none 不可）、`entry_pattern` |
| `tests` | C1 / C3 / C10 / C11 / C20 | `test_pattern`、`system`（宣言時は `system.test_pattern`） |
| `schema` | C13 / C23 | `constraint_pattern` |
| `contract` | C7 | — |

`layering`（C6）は紐づきではなく層の向きの検査なので、省略できる。

注釈の位置（`*_placement`）は推測せず**宣言**する。`before`（既定）は単位の印の行と、その直上に連続する行
（空行か別の単位の印で切れる）、`after` は単位の印の行と次の行だけを見る。窓を広く取ると、別の単位の本体に書いた
注釈が隣の単位の紐づきに数えられ、紐づかない単位が紐づいて見えるため（ADR-0056）。

## 25 の検査

| # | 失敗条件 | 規則 |
| --- | --- | --- |
| C1 | `active` REQ を `@covers` するテストがない | R-1104 |
| C2 | `active` REQ に `## 検証方針` 節がない | R-1002 |
| C3 | テストが存在しない、または撤回済みの REQ を `@covers` する | R-602 |
| C4 | BR がどの UC / REQ にも参照されない（死んだ規則） | R-103 |
| C5 | コードが存在しない、または撤回済みの ID を `@implements` する（孤立参照） | R-701 |
| C6 | 層が禁止された層を import する（設定の `layering`。`layer_pattern` が層のパス階層を指定し、`{layer}` = `root` 配下の第一階層、`*/{layer}` = 第二階層、例: `Features/<name>/Domain`）。C6 は `import_patterns` だけを見る。同じモジュールに層があり互いに import しない言語（単一モジュール Swift アプリ）では一致対象がなく、正常な C6 は沈黙であり証明ではない。代わりにプラットフォーム linter で方向を保証し、`layering` は省略する | R-702 |
| C7 | 実装のエラーコードが `docs.shared` の `errorCodes` の部分集合ではない | R-703 |
| C8 | `active` GOAL を実現する UC がない | — |
| C9 | 配置と frontmatter が不一致: ディレクトリ接頭辞 ≠ `id`、`GOAL.md` / `UC.md` 欠落、REQ ファイル名 ≠ `id`、REQ が自身の `uc:` 直下にない、UC の `goal:` ≠ そのディレクトリ | R-1006 / R-1007 |
| C10 | 宣言された分割クラスにテストがない、または `active` REQ がクラスを一つも宣言しない（下限） | R-1101 / R-1104 |
| C11 | テストがクラスを指定しない、または未宣言のクラスを指定する（生成テストの上限）。`tests.test_pattern` に一致する `tests.dirs` の全テストに `@covers` を求め、どのテストにも属さない `@covers` も違反にする。テストの識別は**ファイル + 名前**（`test_pattern` は名前を捕捉する）。仕様を持たないテスト（REQ を持たない技術部品の自己検査）は `tests.dirs` の外に置く（ADR-0055） | R-1102 / R-1103 |
| C12 | 同じ ID が複数ファイルで定義される（採番衝突） | R-204 |
| C13 | `enforced_at` が DB を指定する BR に、スキーマソース内の `@implements BR-nnn` がない | R-704 |
| C14 | `active` REQ または `active` BR に、`source` またはスキーマソース内の `@implements` がない（C5 の逆）。UC レベルの `@implements UC-nnn` は専門技術（`comments.md`）であり、この検査の対象ではない | R-705 |
| C15 | 人間アクターの `active` UC（`docs.actors` 表の `種別` が `人間` で始まる。表にないアクターも人間と数える）に、`tests.system` 配下の `@scenario UC-nnn`（`scenario_pattern`）付きテストがない。`@scenario` が存在しない・撤回済みの UC を指す場合と、`tests.system.test_pattern` に一致する `@scenario` の無いテスト（窓は `tests.system.scenario_placement`）も違反。`tests.system.dirs` は `tests.dirs` と重複させない。「UC ごとに一つ、成功経路のみ」は reviewer が確認する | R-1106 / R-1107 |
| C16 | `active` UC / REQ の本文（frontmatter の `br:` を含む）が、定義されていない、または撤回済みの BR を参照する（C4 の逆方向） | R-203 |
| C17 | `active` UC の表と、その UC に属する REQ が 1 対 1 に対応しない: 表が未定義・撤回済みの REQ や別の UC の REQ を指す、または REQ（`withdrawn` を除く）が表のどのセルからも導出されていない。UC 本文に REQ の一覧を置かない規律（R-404）なので、本文に現れる REQ ID はすべて表のセルとして扱う | R-404 |
| C18 | `active` GOAL の `actor` / `origin`、`active` UC の `actor` が、`docs.actors` の表（`ACT-nn`）または `docs.vision` の KPI 表（先頭セルが `KPI-nn` の行）に無い | R-203 |
| C19 | `source.unit_dirs`（実現単位を置く場所）にあり `source.unit_pattern` に一致する単位（ユースケースクラス、ルール関数など）が `@implements` を持たない（C14 の逆方向）。REQ を持たない技術部品は `unit_dirs` の外（infra など）に置く（ADR-0055）。検査を強制する分岐の中の注釈は窓の外に出うるため、テストと違い帰属なしの `@implements` は違反にしない | R-705 |
| C20 | `active` NFR が、テスト（`tests` と `tests.system`）の `@covers NFR-nnn`（`nfr_pattern`）も、frontmatter の `measured_by`（テスト以外の計測の所在。リポジトリ直下からのパス）も持たない。`measured_by` のパスが実在しない場合と、テストが存在しない・撤回済みの NFR を `@covers` する場合も違反。C11 は NFR だけを `@covers` するテストも注釈済みと数える | R-104 |
| C21 | 境界の入口（`source.entry_pattern` に一致する行。捕捉 1 が入口の名前）が `@operation UC-nnn#name`（`operation_pattern`）を持たない、`@operation` が契約に無い操作や撤回済みの UC の操作を指す、または fixed 契約の操作がソースのどの `@operation` からも指されない（入口か外部境界のクライアントに書く）。`entry_pattern` が none なら入口の検査だけを省く | R-1206 |
| C22 | `active` BR を `br:` に持つ `active` REQ が無い（規則を検証するテストに辿れない） | R-105 |
| C23 | スキーマの制約（`schema.constraint_pattern` に一致する行）が `@implements` を持たない（C13 の逆方向）。主キーなどルールでない制約は `constraint_pattern` に一致させない | R-704 |
| C24 | `docs.shared` の `errorCodes` のコードが、撤回されていない UC のどの契約の `errors` でも使われていない（C7 の逆方向）。宣言した共有語彙のファイルが無い場合も違反 | R-703 |
| C25 | `living` の用語集（`docs.glossary`）のうち、`active` な UC / REQ の本文が使う用語の「コード識別子」列の識別子が、ソース（とスキーマ）に無い。用語集は語をコードより先に置くので、承認された仕様がまだ使っていない用語は求めない。`A.B` は A と B に分けて探し、識別子の形でない語とプレースホルダーは数えない。宣言した用語集のファイルが無い場合も違反 | R-203 |

C1 / C2 / C8 / C10 / C14–C18 / C20 / C22 は `active` docs のみが対象。`draft` はまだ要求せず、
`withdrawn` はもう要求しない（`withdrawn` を指す参照は C3 / C5 / C15–C17 / C20 / C21 が違反にする）。C11 はすべてのテストに適用する。
C16–C18 は HTML コメントの中の ID と、番号が 0 だけのプレースホルダー（`BR-000` など。残っていれば spec-lint が報告する）を数えない。

## 既存プロジェクトへの導入

baseline は無い（ADR-0056）。既知の違反を台帳に載せて通すことはせず、違反ゼロを保ったまま検査の範囲を広げる。

- 紐づきの揃っていない文書は `draft` に留める。`active` にするのは、テストと注釈が揃ってから。
- `tests.dirs` と `source.unit_dirs` には、注釈の揃った範囲だけを入れる（未着手は空の配列）。広げるたびに違反ゼロを確かめる。
- 対象が本当に無い範囲だけを none にする。移行が済んでいないことは none の理由にしない。

手順は `/docs-migrate` が持つ。

## 正常な検査が保証することと限界

テストと 25 検査がすべて正常なら、宣言した範囲では機械的に以下が成立する。すべての active GOAL に UC があり、
active REQ にテストがあり、宣言された全分割クラスにテストがあり、**方針外のテストも注釈の無いテストも存在しない**。
コード・テスト・文書が参照する ID はすべて存在し、撤回されていない。active REQ / BR はソースかスキーマから注釈され、
実現単位を置く場所の単位とスキーマの制約はすべて仕様を指す。active BR は REQ を通じてテストに辿れる。
active NFR は検証するテストか計測の所在を持つ。UC の表と REQ は 1 対 1 に対応する。境界の入口と契約の操作は
双方向に対応し、共有語彙のエラーコードは実装と契約の両方に現れる。人間向け active UC はシナリオテストを持ち、
シナリオテストはすべて UC を指す。用語集のコード識別子はコードに存在する。配置と frontmatter が一致し、依存方向が守られる。
検査しなかった範囲は、レポート末尾の「宣言された不在」にすべて現れる。

レビューに残るもの（R-901）: 分割が入力空間を尽くすか、アサーションが EARS 文の意味を検証するか、
EARS 文そのものが正しいか、注釈した単位が実際にその文を実現するか（C14 / C19 は注釈を見るが意味は見ない）、
`@implements BR-nnn` のスキーマ制約が実際に規則を保証するか（C13 / C23 は注釈を見るが意味は見ない）、
宣言の外（`unit_dirs` の外など）に置かれたコードに業務ルールが紛れていないか、none の理由が正しいか（`traceconfig.json` の変更は人間が承認する。ADR-0057）。
