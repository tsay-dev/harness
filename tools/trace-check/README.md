# trace-check

harness に同梱する依存なしの Node ツール。docs の SSOT（GOAL → UC → REQ、BR）とコード
（テスト、実装）の**トレーサビリティ**を機械的に検証する。対象はカバレッジ、参照、配置、
層、契約語彙。sdd-kit の `trace_check.py` の Node 移植（移植理由: `docs/adr/ADR-0003`）。

- **検証するもの**: 下記の 18 検査。**書式とライフサイクル**（frontmatter、節、ステータス語彙、
  契約構造）は `../spec-lint/` の担当。両ツールは重複しない。
- **読むもの**: 利用プロジェクト直下の `traceconfig.json`（`templates/develop/traceconfig.json` から一度ひな形を置き、
  利用プロジェクトが `source` / `tests` / `schema` / `layering` / `contract` を維持）。
  注釈は全行を正規表現（`covers_pattern` / `implements_pattern`）で検索するため、任意の言語に対応する。
  `implements_pattern` の捕捉は一覧でもよい（`@implements UC-001, REQ-009 / BR-015` — `,` または `/` で分割）。
- **生成するもの**: カバレッジ行列（レポート）と全プロジェクト索引（`--index`）。
  両方とも導出物であり、コミットしてはならない（R-1003 / R-603）。
- **使い方**: 作成者が直接実行する（`--only` で関心範囲に絞る）。orchestrator がスライスの最後に実行する
  （merge 条件はテスト成功 + 新規違反ゼロ、R-803）。CI でも実行する。

```bash
node trace-check.mjs [--root .] [--config traceconfig.json]   # 検査。新規違反で exit 1
node trace-check.mjs --update-baseline                        # 現在の違反をベースラインとして記録
node trace-check.mjs --strict                                 # ベースラインを無視（全違反で失敗）
node trace-check.mjs --index                                  # 全プロジェクトの対応図。ID ごとに一行
node trace-check.mjs --next req [--reserve N]                 # 次の空き ID を N 個（goal|uc|req|br|nfr|adr）、一行ずつ — R-204。原子的:
                                                              # mkdir ロックで .trace-reservations.json に番号を予約するため、
                                                              # 並行 Tasks がすべて呼んでも同じ番号を受け取らない。req は
                                                              # UC.md の表が予約する ID もファイル作成前から使用済みと数える
node trace-check.mjs --only C9,C12                            # 指定検査だけを判定（作成者の自己検査）
```

終了コード: `0` = 新規違反なし / `1` = 新規違反 / `2` = 使用法エラー。Node のみ。

## 18 の検査

| # | 失敗条件 | 規則 |
| --- | --- | --- |
| C1 | `active` REQ を `@covers` するテストがない | R-1104 |
| C2 | `active` REQ に `## 検証方針` 節がない | R-1002 |
| C3 | テストが存在しない REQ を `@covers` する | R-602 |
| C4 | BR がどの UC / REQ にも参照されない（死んだ規則） | R-103 |
| C5 | コードが存在しない ID を `@implements` する（孤立参照） | R-701 |
| C6 | 層が禁止された層を import する（設定の `layering`。`layer_pattern` が層のパス階層を指定し、`{layer}` = `root` 配下の第一階層、`*/{layer}` = 第二階層、例: `Features/<name>/Domain`）。C6 は `import_patterns` だけを見る。同じモジュールに層があり互いに import しない言語（単一モジュール Swift アプリ）では一致対象がなく、正常な C6 は沈黙であり証明ではない。代わりにプラットフォーム linter で方向を保証し、`layering` は未設定にする | R-702 |
| C7 | 実装のエラーコードが `docs/_shared/components.yaml` の `errorCodes` の部分集合ではない（`contract` 設定時のみ） | R-703 |
| C8 | `active` GOAL を実現する UC がない | — |
| C9 | 配置と frontmatter が不一致: ディレクトリ接頭辞 ≠ `id`、`GOAL.md` / `UC.md` 欠落、REQ ファイル名 ≠ `id`、REQ が自身の `uc:` 直下にない、UC の `goal:` ≠ そのディレクトリ | R-1006 / R-1007 |
| C10 | 宣言された分割クラスにテストがない、または `active` REQ がクラスを一つも宣言しない（下限） | R-1101 / R-1104 |
| C11 | テストがクラスを指定しない、または未宣言のクラスを指定する（生成テストの上限）。`tests.test_pattern` 設定時は、`@covers` が全くないテスト関数も検出する。未注釈テストは、それ以外では C10 / C11 から見えない。`tests.exempt_pattern`（明示的な `// 仕様外:` 印）があるテストは欠落ではなく除外として数える。テストの識別は**ファイル + 名前**（`test_pattern` は名前を捕捉する必要がある）で、台帳は行番号に依存しない。注釈位置は推測せず**宣言**する: `tests.covers_placement: before`（既定。テスト印の直上の文書コメント）または `after`（印の行と本文の先頭行）。trace-check はその範囲だけを調べ、どの範囲にも属さない `@covers` はテストに属さないと報告する | R-1102 / R-1103 |
| C12 | 同じ ID が複数ファイルで定義される（採番衝突） | R-204 |
| C13 | `enforced_at` が DB を指定する BR に、スキーマソース内の `@implements BR-nnn` がない（`schema.files` / `schema.dirs`。設定時のみ） | R-704 |
| C14 | `active` REQ または `active` BR に、`source` またはスキーマソース内の `@implements` がない（C5 の逆。`source` 設定時のみ）。UC レベルの `@implements UC-nnn` は専門技術（`comments.md`）であり、この検査の対象ではない | R-705 |
| C15 | 人間アクターの `active` UC（`docs.actors` 表の `種別` が `人間` で始まる。表にないアクターも人間と数える）に、`tests.system` 配下の `@scenario UC-nnn`（`scenario_pattern`）付きテストがない、または `@scenario` が存在しない UC を指定する。`tests.system` 設定時のみ。`tests.system.dirs` は `tests.dirs` と重複させてはならず、重複すると C11 がシナリオテストを未注釈として報告する。検査は存在と参照を扱い、「UC ごとに一つ、成功経路のみ」は reviewer が確認する | R-1106 / R-1107 |
| C16 | `active` UC / REQ の本文（frontmatter の `br:` を含む）が、定義されていない BR を参照する（C4 の逆方向。`withdrawn` の BR は定義済みと数える） | R-203 |
| C17 | `active` UC の表と、その UC に属する REQ が 1 対 1 に対応しない: 表が未定義の REQ や別の UC の REQ を指す、または REQ（`withdrawn` を除く）が表のどのセルからも導出されていない。UC 本文に REQ の一覧を置かない規律（R-404）なので、本文に現れる REQ ID はすべて表のセルとして扱う | R-404 |
| C18 | `active` GOAL の `actor` / `origin`、`active` UC の `actor` が、`docs.actors` の表（`ACT-nn`）または `docs.vision` の KPI 表（先頭セルが `KPI-nn` の行）に無い。キーが未宣言ならその参照は判定しない | R-203 |

C1 / C2 / C8 / C10 / C14–C18 は `active` docs のみが対象。`draft` REQ / BR はまだ要求せず、
`withdrawn` はもう要求しない。C11 はすべてのテストに適用する。
C16–C18 は HTML コメントの中の ID と、番号が 0 だけのプレースホルダー（`BR-000` など。残っていれば spec-lint が報告する）を数えない。

## ベースラインの歯止め（既存プロジェクトへの導入）

既存プロジェクトの初回実行では違反が多数出る。すべて解消するまで CI を赤にし続けない。

```bash
node tools/trace-check/trace-check.mjs --update-baseline   # 現在の違反を台帳化 → CI 正常
node tools/trace-check/trace-check.mjs                     # 以後は新規違反のみ失敗
# 負債の解消とともに --update-baseline で台帳を縮め、空になったら --strict へ切り替える
```

台帳のキーはメッセージ内の各 `<file>:<line>` を `<file>` に縮めたもの（未注釈テストは名前で識別するため、
名前を保つ編集で項目は維持される）。同じキーは件数で比較する（レポートの行番号は移動用に残す）。

最初に保証するのは「現在より悪化しない」だけであり、返済を計画する。**ベースラインは縮むだけ**
（R-804）。増加はレビューで差し戻す。`.trace-baseline.json` が単調減少するかがプロジェクトの健全性指標。
認める増加は、既存資料に検査を初めて適用する瞬間だけ（移行で REQ を `active` にし、既存テストや注釈が
網羅していなかった同値分割と実装を C1 / C10 / C14 が検出する場合）。`--update-baseline` で一度だけ記録し、
その段階の報告に名前と件数を示して、繰り返さない（`/docs-migrate` Phase 6）。

## 正常な検査が保証することと限界

テストと 18 検査がすべて正常なら、機械的に以下が成立する。すべての active GOAL に UC があり、active REQ にテストがある。
宣言された全分割クラスにテストがあり、**方針外のテストが存在しない**。コードとテストが参照する ID が存在する。
active REQ / BR はソースかスキーマから注釈される（`@implements`）。死んだ規則も ID の重複定義もなく、文書が参照する BR・REQ・アクター・KPI は定義されており、UC の表と REQ は 1 対 1 に対応する。
配置と frontmatter が一致する。依存方向と契約語彙が実装と一致する。DB で保証する規則はスキーマソースの制約に注釈される。
人間向け active UC はシナリオテストを持つ（システムスイートの宣言時）。

レビューに残るもの（R-901）: 分割が入力空間を尽くすか、アサーションが EARS 文の意味を検証するか、
EARS 文そのものが正しいか、注釈した単位が実際にその文を実現するか（C14 は注釈を見るが意味は見ない）、
`@implements BR-nnn` のスキーマ制約が実際に規則を保証するか（C13 は注釈を見るが意味は見ない）。
