# trace-check

harness に同梱する依存なしの Node ツール。docs の SSOT（GOAL → UC → REQ、BR、NFR、契約、用語集）とコード
（テスト、実装、スキーマ）の**トレーサビリティ**を機械的に検証する。対象はカバレッジ、参照、配置、
層、契約語彙。sdd-kit の `trace_check.py` の Node 移植（移植理由: `docs/adr/ADR-0003`）。

- **検証するもの**: 下記の 27 検査（C1〜C27）。**書式とライフサイクル**（frontmatter、節、ステータス語彙、
  契約構造）は `../spec-lint/` の担当。両ツールは重複しない。frontmatter と契約 YAML は `../_shared/` の
  共有パーサーで読むので、spec-lint・gate-hook と同じ値に読む。
- **例外を作らない**（ADR-0056）: baseline（既知の違反を通す台帳）、コードに書く例外の印、検査の黙った省略は無い。
  違反は 1 件でも失敗にする。対象が本当に無い範囲だけを、`traceconfig.json` に理由付きで宣言する（下記「宣言」）。
  宣言の変更は人間が承認する（ADR-0057）。
- **読むもの**: 利用プロジェクト直下の `traceconfig.json`（`templates/develop/traceconfig.json` から一度ひな形を置き、
  利用プロジェクトが維持する）。注釈（`@covers` / `@implements` / `@scenario` / `@operation`）は正規表現で探し、
  **コメントの中にあるものだけ**を数える（下記「注釈と窓」）ので、任意の言語に対応する。
- **生成するもの**: カバレッジ行列（レポート）と全プロジェクト索引（`--index`）。
  両方とも導出物であり、コミットしてはならない（R-1003 / R-603）。
- **使い方**: 作成者が直接実行する（`--only` で関心範囲に絞る）。orchestrator がスライスの最後に実行する
  （merge 条件はテスト成功 + 違反ゼロ、R-803）。stop-gate と CI（spec-gate.yml）でも実行する。

```bash
node trace-check.mjs [--root .] [--config traceconfig.json]   # 検査。違反が 1 件でもあれば exit 1
node trace-check.mjs --as-active                              # draft の文書を active とみなして検査（承認前の自己検査）
node trace-check.mjs --only C9,C12                            # 指定検査だけを判定（作成者の自己検査）。出力に「部分検査」と出す
node trace-check.mjs --index                                  # 全プロジェクトの対応図。ID ごとに一行
node trace-check.mjs --next req [--reserve N]                 # 次の空き ID を N 個（goal|uc|req|br|nfr|adr）、一行ずつ — R-204。原子的:
                                                              # mkdir ロックで .trace-reservations.json に番号を予約するため、
                                                              # 並行 Tasks がすべて呼んでも同じ番号を受け取らない。req は
                                                              # UC.md の表が予約する ID もファイル作成前から使用済みと数える
```

- `--as-active`: spec-author と reviewer が承認前に、文書が active になったときに出る違反（C16〜C18、C22 など）を先に見る。
- `--only`: 未知の ID（`C99`）と空は使い方エラー（exit 2）。宣言の不足・設定エラーは `--only` でも exit 2。

終了コード: `0` = 違反なし / `1` = 違反あり / `2` = 使用法・設定エラー（宣言の不足、型の誤り、コンパイルできない正規表現、
廃止したキーやフラグを含む）。Node のみ。
廃止したもの: `--update-baseline` / `--strict`（使用法エラー）、`baseline_file`・`tests.exempt_pattern`・`tests.system.exempt_pattern`・
`source.exempt_pattern`・`contract.exclude_codes`・`source.entry_files`（設定エラー）。残った `.trace-baseline.json` は読まずに警告する。

走査は `node_modules` と `.git` だけを除き、ドットで始まるディレクトリも見る（壊れたシンボリックリンクとディレクトリへのシンボリックリンクは辿らない）。違反の位置はリポジトリ直下からの相対パス:行で出す。

## 宣言

紐づきの検査に要るキーは省略できない。省略は設定エラー（exit 2）で、足りないキーをまとめて表示する。
対象が本当に無いなら `{ "none": "<理由>" }` と書く。その範囲は検査せず、レポートの末尾に「宣言された不在」として理由を出す。
省略と不在を区別するのは、契約の `auth: none` / `operations: {}`（R-1206）と同じ考え方。
none が通るのは、それを求める active な文書・fixed な契約が無い間だけ（下記「義務表」）。

| キー | 必須 / none | 意味 | 読む検査 |
| --- | --- | --- | --- |
| `id_patterns.br` / `id_patterns.req` | 必須 / 不可 | 文書の中の BR / REQ の ID の形 | C4 / C16 / C17 |
| `covers_pattern` | 必須 / 不可 | テストの注釈。捕捉 1 = REQ、捕捉 2 = 分割クラス | C1 / C3 / C10 / C11 |
| `implements_pattern` | 必須 / 不可 | 実装・スキーマの注釈。捕捉 1 は ID の並びでもよい（`@implements UC-001, REQ-009 / BR-015` — `,` `、` `/` で分割） | C5 / C13 / C14 / C19 / C23 |
| `scenario_pattern` | 任意（既定 `@scenario\s+(UC-\d{3})(?!\d)`） | シナリオテストの注釈 | C15 |
| `nfr_pattern` | 任意（既定 `@covers\s+(NFR-\d{3})(?!\d)`） | NFR を検証するテストの注釈 | C11 / C20 |
| `operation_pattern` | 任意（既定 `@operation\s+(UC-\d{3})#(\w+)`。捕捉 2 つ） | 入口・クライアントの注釈 | C21 |
| `comment_pattern` | 任意（既定 `^\s*(?:\/\/|\/\*|\*|#|--|@|<!--)`） | コメント行の印。各セクションで上書きできる | 注釈を数えるすべて |
| `docs.goals_dir` / `rules_dir` / `nfr_dir` / `adr_dir` | 必須 / 不可 | docs の木と横断文書の場所 | 全体 |
| `docs.actors` / `docs.vision` | 必須 / 可 | アクター表、KPI 表 | C15 / C18 |
| `docs.glossary` | 必須 / 可 | 用語集 | C25 |
| `docs.shared` | 必須 / 可 | 共有語彙（`errorCodes`） | C7 / C24 |
| `source` | 必須 / 可 | 本番コード。子: `dirs`・`extensions`（必須）、`unit_dirs`（必須 / 可）と `unit_pattern`（`unit_dirs` 宣言時は必須）、`support_dirs`（必須 / 可）、`entry_pattern`（必須 / 可）、`entry_exclude`・`entry_file_pattern`・`implements_placement`・`comment_pattern`（任意） | C5 / C14 / C19 / C21 / C25 / C27 |
| `tests` | 必須 / 可 | 仕様のテスト。子: `dirs`・`extensions`・`test_pattern`（必須 / 不可）、`pending_pattern`（必須 / 可）、`covers_placement`・`comment_pattern`（任意）、`system` | C1 / C3 / C10 / C11 / C20 |
| `tests.system` | 必須 / 可 | シナリオテスト。子: `dirs`・`extensions`・`test_pattern`（必須 / 不可）、`pending_pattern`（必須 / 可）、`scenario_placement`・`comment_pattern`（任意） | C15 / C20 |
| `schema` | 必須 / 可 | スキーマ源。子: `files` か `dirs`（どちらか必須）、`extensions`（任意、既定 `.sql` `.prisma`）、`constraint_pattern`（必須 / 可）、`implements_placement`・`comment_pattern`（任意） | C13 / C23 / C25 |
| `contract` | 必須 / 可 | 子: `error_source`（エラーコードの正本のファイル）、`error_code_pattern`（捕捉 1 = コード） | C7 |
| `layering` | 任意 | 層の向き。紐づきではないので省略できる | C6 |

`commands`・`policy`・`git` は trace-check の判定には使わない（`commands` は stop-gate と contract-run が読む）。
`git.units` がある monorepo のルートで宣言が足りなければ、「unit ごとに `--root <unit>` で実行する」と案内して exit 2 にする。

- **範囲**（`source.dirs`・`unit_dirs`・`support_dirs`・`entry_exclude`、`tests.dirs`、`tests.system.dirs`、`schema.files` / `dirs`）は、
  パスか glob（`**` `*` `?`）の配列。`!` で始まるものは除外、ファイルも書ける。固定パスはそのファイルか配下を指す。
- **正規表現**はすべて `u` フラグでコンパイルし、失敗はキー名付きの設定エラーにする。`u` フラグでも `\w` は ASCII だけなので、
  日本語の名前（`test_ログインできる`、`func test_UC012_案件を登録する`）は `[\p{L}\p{N}_]` で書く。
  単位の印（`unit_pattern` / `test_pattern` / `entry_pattern` / `constraint_pattern`）は捕捉グループが要る（単位の同一性は名前で持つ）。
- 型の誤り（配列のはずが文字列、文字列のはずがオブジェクトなど）と、理由の無い none も設定エラー。

## 義務表（C26）

active な文書・fixed な契約は「義務」を生む。義務がある範囲で、宣言が none であること、範囲・印の一致が 0 件であることを違反にする。
義務が無い間は none も空の範囲も 0 件も通る（新規プロジェクトの最初のターンと、移行の途中が none の往復なしで通る）。

| 義務を生むもの | none にできないキー |
| --- | --- |
| active な REQ | `source`、`source.unit_dirs`、`source.support_dirs`、`tests`、`tests.pending_pattern` |
| withdrawn 以外でソースから `@implements` されている REQ | `tests` |
| active な BR | `source` |
| 人間がアクターの active な UC | `tests`、`tests.system`、`tests.system.pending_pattern` |
| active な UC | `docs.glossary` |
| fixed 契約に owned かつ inbound の操作 | `source`、`source.entry_pattern` |
| fixed 契約の owned の操作に `errors` | `contract` |
| 撤回されていない契約に `errors` | `contract`、`docs.shared` |
| `enforced_at` が database の active な BR | `schema`、`schema.constraint_pattern` |
| active な GOAL / UC が `ACT-nn` を持つ | `docs.actors` |
| active な GOAL が `KPI-nn` を持つ | `docs.vision` |

- 義務がある `source.unit_dirs`（`unit_pattern` の一致）、`tests`（`test_pattern`）、`tests.system`（`system.test_pattern`）、
  `source.entry_pattern`、`schema.constraint_pattern` の一致 0 件も違反（範囲か印の正規表現の書き損じ）。
- 宣言した**固定パス**（glob を含まないパス）が無いとき: active な UC があるか、そのキーに義務があれば違反
  （「作る（ディレクトリなら `.gitkeep` を置く）か、none にする（理由付き）」。docs の 4 ディレクトリは none 不可なので「作る」だけ）。
  それ以外はレポートに「未作成」と出すだけ。

## 分類（C27）

active な REQ がある間、`source.dirs` の全ファイルは `source.unit_dirs`（実現単位の置き場）か `source.support_dirs`
（REQ を持たない技術部品の置き場）のどちらかに入る（ADR-0055）。

- 対象は `git ls-files -co --exclude-standard` のファイル（git が無ければドットで始まるものを除く全ファイル）。**拡張子を問わない**。
- どちらにも入らないファイルと、`unit_dirs` にあって拡張子が `source.extensions` に無いファイル（走査されないので `@implements` を検査できない）を、
  ディレクトリ単位で 1 件にまとめて報告する。両方に入るファイルは設定エラー（`!` で一方から除外する）。
- C19 が `@implements` を求めるのは `unit_dirs` の単位だけで、REQ か BR を少なくとも 1 つ指すこと（UC だけではテストに辿れない）。`support_dirs` の `@implements` は違反にしない。
- `unit_dirs` の中で `source.dirs` の `!` で外したファイル（`*.spec.ts` の名前の本番コードなど）が `tests.dirs` / `tests.system.dirs` にも入らなければ、どの検査にも見えないので違反。
  `support_dirs` に同居する技術部品の自己検査（`tests.dirs` の外に置く規約）は対象にしない。
- 再 export だけのバレル（`index.ts` の `export { … } from`）を `unit_dirs` に置くと単位と読まれうるので、`!` で `unit_dirs` から外して `support_dirs` に置く。
- 新しい置き場を作ること自体が `traceconfig.json` の変更（人間の承認）になる。同居テストは `source.dirs` の `!**/*.test.*` などで外す。

## 注釈と窓

**注釈はコメントの中だけを数える。** `comment_pattern`（セクション > 最上位 > 既定の順に決まる）に一致する行にある注釈か、
同じ行で注釈より前に `//` `/*` `#` `--` `<!--` がある注釈（行末コメント）だけ。文字列リテラルの中の注釈は数えない。

- 既定の `comment_pattern` は多言語の和集合なので、`#` / `@` で始まる行（デコレーター、属性、TS の `#private`）は窓をつなぐが、
  その行の注釈は前に `//` `/*` `--` `<!--` があるときだけ数える。数えなかったときは違反メッセージで `comment_pattern` の上書きを案内する。
  `#` を行コメントにする言語（YAML、Python、シェル）は、そのセクションで `comment_pattern` を上書きする。

**単位への帰属は窓で決める。** 注釈の位置（`*_placement`）は推測せず**宣言**する。

- `before`（既定）: 単位の印の行と、その直上に連続するコメント行（空行・コード行・別の単位の印で切れる）。doc コメントの流儀。
- `after`: 単位の印の行と、次の行がコメント行ならその行。本体 1 行目の流儀。

窓を広く取ると、別の単位の本体に書いた注釈が隣の単位の紐づきに数えられ、紐づかない単位が紐づいて見えるため（ADR-0056）。
どの単位にも属さない注釈は、テストの `@covers` は C11、シナリオテストの `@scenario` は C15、`@operation` は C21 の違反。
本番コードとスキーマの `@implements` は窓の外でも C5 / C13 / C14 に数える（検査を強制する分岐の中の注釈が窓の外に出うるため）。
1 つのテストの窓に REQ の `@covers` が 2 つ以上あれば C11 違反（NFR の `@covers` は別に数える）。

行末が `(` の行（Prettier が折り返したルートやテストの頭）は、続く行を関数の本体が始まる行（`=>` / `function` / 行末の `{`）まで最大 6 行つなげてから
単位の印と `pending_pattern` を当てる（つなげた行は単位の一部で、`after` の窓はその次の行）。それ以外の判定は行単位なので、複数行にまたがる文字列（テンプレートリテラル）の中の `// @implements` は注釈と数え、`/*` だけの行で始まるブロックコメントの中の
`@implements`（行頭に `*` が無い）は数えない（ブロックコメントでは行頭に `*` を付ける）。前者で紐づいて見えるのは reviewer が見る範囲（主張の外）。

## 保留（`pending_pattern`）

`tests.pending_pattern` / `tests.system.pending_pattern` は、保留中のテスト（`test.fixme(`、`it.skip(`、`xit(` など）の印。

- 単位の印の行か窓に一致すれば、そのテストが保留。それ以外の行（`describe.skip`、本体の `XCTSkip`、Maestro のヘッダーの tag など）に
  一致すれば、そのファイルの全テストを保留とみなす（保守的）。
- 保留のテストは C1 / C10 / C15 / C20 の被覆に数えない。被覆が保留のテストにしか無いときは「skip を外す」
  「（ファイル全体が保留なら）ファイルを分ける」と案内する。注釈の要求（C11 / C15）は保留でも変わらない。
- テストの本体で条件付きに skip する書き方（Playwright の `test.skip(browserName === "webkit")` など）も、印の行の外にあるのでファイル全体を保留にする。
  条件付きの skip は別のファイルに分ける。
- phase は使わない。FE の配線までシナリオテストが fixme の間は C15 が赤のままで、完了時に保留が残れば機械が止める。

## 入口（C21）

`source.entry_pattern` は境界の入口（ルーターの登録など）の印で、捕捉 1 が入口の名前かパス。入口は窓に `@operation UC-nnn#name` を持つ。

- 入口を探す範囲は `source` 全体から `source.entry_exclude`（ファイル単位の glob。`/health` を置くファイルなど）を除き、
  `source.entry_file_pattern`（複数行モードの正規表現）があれば中身が一致するファイルだけ。
- `entry_file_pattern` で範囲を絞ってよいのは、その印が無ければ入口として動かないフレームワークだけ（Next.js の `"use server"` や
  Route Handlers の `export function GET` など）。Hono / Express では使わない（印の無いファイルでもルートを登録できるので、入口が黙って範囲の外になる）。
- `@operation` は入口の窓か、単位（`unit_pattern`。`unit_dirs` と `support_dirs` を含むソース全体）の窓に帰属したものだけを数える。
  外部境界のクライアントは単位の窓に書く。外部 API のクライアントの呼び出し（`api.post("/v1/…")` など）が入口の印に一致するなら、
  そのファイルを `source.entry_exclude` に入れる（入口の窓の `@operation` は inbound の操作だけを受け付けるため）。
- 入口の窓の `@operation` は `direction: inbound` の操作だけ（パスの入口なら `transport: http` に限る）。owned かつ inbound の fixed 操作は、入口の窓の `@operation` があって初めて「実装あり」になる。
- **パスの照合**: 入口の捕捉が `/` で始まり、操作が `transport: http` で `wire.path` を持つときだけ照合する。
  `?`・`#` 以降と末尾の `/` を除き、`${…}` `:x`（`:x{正規表現}` `:x?` を含む）`[x]` `{x}` `*` を同じパラメーターとみなす。捕捉が `/` で終われば（連結が続く）前方一致、
  それ以外は後方一致（ルーターの接頭辞を許す）。method は見ない。正規化して空なら照合しない。
  短い捕捉（`/:id`）は別の操作の `wire.path` にも一致しうるので、取り違えた `@operation` を見逃すことがある（意味の限界。ADR-0056）。

## 27 の検査

| # | 失敗条件 | 規則 |
| --- | --- | --- |
| C1 | `active` REQ と、withdrawn 以外でソースから `@implements` されている REQ に、保留でないテストの `@covers` がない（status を戻しても実装が残ればテストが要る） | R-1104 |
| C2 | `active` REQ に `## 検証方針` 節がない | R-1002 |
| C3 | テストが存在しない、または撤回済みの REQ を `@covers` する | R-602 |
| C4 | BR がどの UC / REQ にも参照されない（死んだ規則） | R-103 |
| C5 | コードが存在しない、または撤回済みの ID を `@implements` する（孤立参照） | R-701 |
| C6 | 層が禁止された層を import する（設定の `layering`。`layer_pattern` が層のパス階層を指定し、`{layer}` = `root` 配下の第一階層、`*/{layer}` = 第二階層、例: `Features/<name>/Domain`）。C6 は `import_patterns` だけを見る。同じモジュールに層があり互いに import しない言語（単一モジュール Swift アプリ）では一致対象がなく、正常な C6 は沈黙であり証明ではない。代わりにプラットフォーム linter で方向を保証し、`layering` は省略する | R-702 |
| C7 | 実装のエラーコード（`contract.error_source` の `error_code_pattern` の一致）が `docs.shared` の `errorCodes` の部分集合ではない | R-703 |
| C8 | `active` GOAL を実現する UC がない | — |
| C9 | 配置と frontmatter が不一致: ディレクトリ接頭辞 ≠ `id`、`GOAL.md` / `UC.md` 欠落、REQ ファイル名 ≠ `id`、REQ が自身の `uc:` 直下にない、UC の `goal:` ≠ そのディレクトリ。goals 配下で検査の対象にならない文書（`_shared` 以外の `_` ディレクトリ、`id` を持つのに配置に無い md）も違反 | R-1006 / R-1007 |
| C10 | 宣言された分割クラスに保留でないテストがない、または `active` REQ がクラスを一つも宣言しない（下限） | R-1101 / R-1104 |
| C11 | テストがクラスを指定しない、または未宣言のクラスを指定する（生成テストの上限）。`tests.test_pattern` に一致する `tests.dirs` の全テストに窓の `@covers` を求め、REQ の `@covers` が 2 つ以上のテストと、どのテストにも属さない `@covers` も違反。仕様を持たないテスト（技術部品の自己検査）は `tests.dirs` の外に置く（ADR-0055） | R-1102 / R-1103 |
| C12 | 同じ ID が複数ファイルで定義される（採番衝突） | R-204 |
| C13 | `enforced_at` が DB を指定する `active` BR に、スキーマ源内の `@implements BR-nnn` がない | R-704 |
| C14 | `active` REQ または `active` BR に、`source` またはスキーマ源内の `@implements` がない（C5 の逆）。UC レベルの `@implements UC-nnn` は専門技術（`comments.md`）であり、この検査の対象ではない | R-705 |
| C15 | 人間アクターの `active` UC（`docs.actors` 表の `種別` が `システム` で始まるもの以外。表にないアクターも人間と数える）に、保留でない `@scenario UC-nnn` のシナリオテスト（`tests.system`）がない。`@scenario` が存在しない・撤回済みの UC を指す場合、`tests.system.test_pattern` に一致する `@scenario` の無いテスト、どのテストにも属さない `@scenario` も違反。「UC ごとに一つ、成功経路のみ」は reviewer が確認する | R-1106 / R-1107 |
| C16 | `active` UC / REQ の本文（frontmatter の `br:` を含む）が、定義されていない、`draft` の、または撤回済みの BR を参照する（C4 の逆方向。ADR-0052） | R-203 |
| C17 | `active` UC の「## 状態 × イベント表」「## 例外系の走査」の節と、その UC に属する REQ が 1 対 1 に対応しない: 表が未定義・撤回済みの REQ や別の UC の REQ を指す、REQ（`withdrawn` を除く）が表のどのセルからも導出されていない、または `active` / `draft` の REQ が 1 件も無い | R-404 |
| C18 | `active` GOAL の `actor` / `origin`、`active` UC の `actor` が、`docs.actors` の表（`ACT-nn`）または `docs.vision` の KPI 表（先頭セルが `KPI-nn` の行）に無い | R-203 |
| C19 | `source.unit_dirs` にあり `source.unit_pattern` に一致する実現単位が、窓に REQ / BR を指す `@implements` を持たない（C14 の逆方向。UC だけでは足りない）。REQ を持たない技術部品は `source.support_dirs` に置く（ADR-0055） | R-705 |
| C20 | `active` NFR が、保留でないテスト（`tests` と `tests.system`）の `@covers NFR-nnn`（`nfr_pattern`）も、条件を満たす `measured_by` も持たない。`measured_by` はリポジトリ内のファイル（URL・絶対パス・リポジトリ外・ディレクトリは違反）で、docs の `goals_dir` / `rules_dir` / `nfr_dir` / `adr_dir` の外にあり、中にその NFR の ID が現れること。テストが存在しない・撤回済みの NFR を `@covers` する場合と、どのシナリオテストにも属さない `@covers` も違反（ADR-0054） | R-104 |
| C21 | 境界の入口（上記「入口」）が `@operation` を持たない、`@operation` が入口にも単位にも属さない・契約に無い操作や撤回済みの UC の操作を指す、入口のパスが契約の `wire.path` と合わない、または fixed 契約の操作がソースのどの `@operation` からも指されない（入口か外部境界のクライアントに書く） | R-1206 |
| C22 | `active` BR を `br:` に持つ `active` REQ が無い（規則を検証するテストに辿れない） | R-105 |
| C23 | スキーマの制約（`schema.constraint_pattern` に一致する行）が窓に `@implements` を持たない（C13 の逆方向）。主キーなどルールでない制約は `constraint_pattern` に一致させない | R-704 |
| C24 | 撤回されていない契約が 1 件以上あるとき、`docs.shared` の `errorCodes` のコードが、どの契約の `errors` でも使われていない（C7 の逆方向） | R-703 |
| C25 | `active` な UC / REQ の本文が使う用語集（`docs.glossary`。用語集の status によらない）の用語の「コード識別子」列の識別子が、ソース（とスキーマ）のコメント行以外に無い。用語は長いものから照合し（「予約枠」に含まれる「枠」は単独で現れたときだけ使われたと数える）、セルの装飾（`**` `` ` `` リンク）を剥がし、セル全体が `<…>` の行だけを捨てる。`A.B` は A と B に分けて探し、識別子の形でない語は数えない。文字列リテラルの中の語も数える | R-203 |
| C26 | 宣言と義務の矛盾: 義務がある範囲の none、範囲・印の一致 0 件、固定パスの不在（上記「義務表」） | R-804 |
| C27 | `source.dirs` のファイルが `unit_dirs` にも `support_dirs` にも入らない、または `unit_dirs` のファイルの拡張子が `source.extensions` に無い（上記「分類」） | R-804 |

C1 / C2 / C8 / C10 / C14–C18 / C20 / C22 は `active` docs が対象（C1 は `@implements` された REQ にも広がる）。`draft` はまだ要求せず、
`withdrawn` はもう要求しない（`withdrawn` を指す参照は C3 / C5 / C15–C17 / C20 / C21 が違反にする）。C11 はすべてのテストに適用する。
C16–C18 は HTML コメントの中の ID と、番号が 0 だけのプレースホルダー（`BR-000` など。残っていれば spec-lint が報告する）を数えない。

## 既存プロジェクトへの導入

baseline は無い（ADR-0056）。既知の違反を台帳に載せて通すことはせず、違反ゼロを保ったまま検査の範囲を広げる。

- 義務が無い間（active な文書・fixed な契約が無い間）は、none も空の範囲も通る。文書を active にした時点で義務表が宣言を求める。
- 紐づきの揃っていない文書は `draft` に留める。`active` にするのは、テストと注釈が揃ってから。
- テストの無い既存の単位は、特性テストを書くまで `source.support_dirs` に置く。揃った範囲から `unit_dirs` / `tests.dirs` に移す。
- 宣言を変えるたびに `traceconfig.json` の変更として人間が承認する（ADR-0057）。

手順は `/docs-migrate` が持つ。

## NFR の計測（`measured_by`）

テストで測れない NFR は、計測の所在を NFR の frontmatter の `measured_by:` に書く（C20）。指すのは負荷試験のスクリプト、
CI ジョブの定義、runbook などのリポジトリ内のファイルで、中に NFR の ID を書く。
外部の SaaS やダッシュボードで測るなら、リポジトリ内の runbook に **NFR の ID と計測先**（サービス名、ダッシュボードや監視の名前）を書き、
その runbook を `measured_by` に書く。URL を直接書くと違反になる（実在を確かめられない）。

## 正常な検査が保証することと限界

テストと 27 検査がすべて正常なら、宣言した範囲では機械的に以下が成立する。すべての active GOAL に UC があり、
active REQ（と実装の残る REQ）に保留でないテストがあり、宣言された全分割クラスにテストがあり、**方針外のテストも注釈の無いテストも存在しない**。
コード・テスト・文書が参照する ID はすべて存在し、撤回されていない。active な文書が参照する BR は active。
active REQ / BR はソースかスキーマから注釈され、ソースの全ファイルは実現単位か技術部品の置き場に分類され、
実現単位とスキーマの制約はすべて仕様を指す。active BR は REQ を通じてテストに辿れる。active NFR は検証するテストか計測の所在を持つ。
UC の表と REQ は 1 対 1 に対応する。境界の入口と契約の操作は双方向に対応し、共有語彙のエラーコードは実装と契約の両方に現れる。
人間向け active UC はシナリオテストを持ち、シナリオテストはすべて UC を指す。用語集のコード識別子はコードに存在する。
配置と frontmatter が一致し、依存方向が守られる。検査しなかった範囲は、レポート末尾の「宣言された不在」と「未作成」にすべて現れる。

主張の外:

- **テストが実際に実行されたこと**（ADR-0056 の M9）。trace-check は紐づきの有無を見るだけで、`@covers` したテストが CI で走って通ったかは突き合わせない。
  実行は stop-gate と利用プロジェクトの CI が `commands` の宣言どおりに行う。
- 行単位の正規表現で拾えない書き方の単位・入口・制約（テンプレートの既定では、`` app.get(`${prefix}/x`) `` や `app.get(ROUTES.x)` のように
  パスがリテラルで始まらない入口、`app.on("GET", ["/a", "/b"])`）。義務のある範囲の 0 件は C26 が落とすが、一部の取りこぼしは見えない。
- C21 のパスの照合の意味の限界（短い捕捉が別の操作に一致しうる、method を見ない）。

レビューに残るもの（R-901）: 分割が入力空間を尽くすか、アサーションが EARS 文の意味を検証するか、
EARS 文そのものが正しいか、注釈した単位が実際にその文を実現するか（C14 / C19 は注釈を見るが意味は見ない）、
`@implements BR-nnn` のスキーマ制約が実際に規則を保証するか（C13 / C23 は注釈を見るが意味は見ない）、
`support_dirs` に置かれたコードに業務ルールが紛れていないか、none の理由と宣言の範囲が正しいか。

## 宣言の変更を守る（推奨）

`traceconfig.json` と docs の status の変更は、gate-hook が Claude Code の Write / Edit で人間の承認を求める（ADR-0057）。
Bash や Claude Code 以外のプロバイダーでの変更は止まらないので、利用プロジェクトは merge 時に CODEOWNERS とブランチ保護で
必須レビューにする（harness はテンプレートを置かない）。呼び出し側の CI ワークフローも PR で書き換えられるので、`.github/workflows/**` も含める。

```text
# .github/CODEOWNERS の例（ブランチ保護で「Require review from Code Owners」を有効にする）
**/traceconfig.json      @<レビューする人かチーム>
docs/                    @<レビューする人かチーム>
/.github/workflows/      @<レビューする人かチーム>
# commands が呼ぶテストの設定も（書き換えれば stop-gate の test / system を空振りにできる）
package.json             @<レビューする人かチーム>
vitest.config.*          @<レビューする人かチーム>
playwright.config.*      @<レビューする人かチーム>
```
