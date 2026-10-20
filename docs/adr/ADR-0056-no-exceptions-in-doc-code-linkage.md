---
id: ADR-0056
title: docs と実装の紐づきに例外を作らず、baseline と黙った省略を廃止し、対象の不在は traceconfig に理由付きで宣言し、義務のある範囲では不在を認めない
status: proposed
date: 2026-10-20
supersedes: ADR-0005
---

# ADR-0056 docs と実装の紐づきに例外を作らず、baseline と黙った省略を廃止し、対象の不在は traceconfig に理由付きで宣言し、義務のある範囲では不在を認めない

## Context

harness は「docs を正本にし、実装とテストを ID で紐づけ、紐づきを機械が検査する」ことで、AI の確率的なミスを補正する。紐づきの正しさ（注釈した単位が本当に文を実現するか）は reviewer が担うが、紐づきがあるかどうかは機械で数えられる事実であり、人の裁量に任せる部分は無い。

ADR-0052〜0055 で未検査の線を塞いだ後も、紐づきをすり抜ける経路が残っていた。

- **例外の台帳。** baseline（ADR-0005）は既知の違反を通す。ADR-0051 は 150 行を超える作業指針を `--update-baseline` で既知にする移行手順を Consequences に書いていた。`contract.exclude_codes` は指定したエラーコードを C7 から外す。
- **黙った省略。** trace-check は設定キーが無い検査を黙って省いた。stop-gate と CI は traceconfig.json が無ければ trace-check を飛ばし、contract-run はアダプターが無ければ、また skip を返した実例があっても exit 0 にした。空の配列、存在しないパス、何にも一致しない正規表現も 0 件として通った。
- **撤回済みの仕様への参照が通る。** 撤回済み（withdrawn）も定義済みと数えた。
- **片方向だけの線。** 契約に無い境界の入口、注釈の無いシナリオテスト、REQ から辿れない BR、注釈の無い DB 制約、どこでも使われない共有エラーコード、コードに無い用語集の識別子が、どれも検査されていなかった。
- **注釈の数え方。** 窓が「前の単位の後から次の単位まで」だったので別の単位の本体の注釈が隣の単位に数えられ、文字列リテラルの中の `@implements` も注釈と数えた。
- **パーサーの分裂。** trace-check だけが frontmatter と契約を独自の行スキャンで読み、先頭が空白の `status:` や引用符付きの `x-status:` を spec-lint・gate-hook と違う値に読んだ。
- **保留中のテスト。** `test.fixme(` や `it.skip(` のテストで被覆を満たせ、`@implements` したまま REQ を draft に戻せばテストの要求が消えた。

最初の案（宣言の省略を禁じ、不在は none で宣言する）は、5 人のレビュアーの再現付きの指摘を受け、原則派と実用派の 3 回の議論で次の形に確定した。

## Decision

紐づきに例外を作らない。すり抜けを許す経路はすべて違反か設定エラーにし、「対象がそもそも無い」ことだけを、理由付きの宣言として `traceconfig.json` の 1 か所に置く。主張は「検査が通れば、宣言した範囲では docs と実装・テストの紐づきに抜けが無く、検査しなかった範囲はすべて none の宣言としてレポートに現れる」。

- **baseline を廃止する。** spec-lint と trace-check から `--update-baseline` / `--strict` / `--baseline` と台帳の処理を削除し、違反はすべて失敗にする。廃止したフラグと `baseline_file` は使い方・設定エラー、残った台帳ファイルは読まずに警告する。R-804 を「紐づきに例外を作らない」に改める。ADR-0051 の `--update-baseline` による移行手順もこれで置き換え、150 行を超える作業指針は分割するまで spec-lint が落ちる（ADR-0051 の決定そのものは変えない）。
- **宣言を必須にする。** 紐づきの検査に要るキー（`docs.actors` / `vision` / `glossary` / `shared`、`source` とその `dirs` / `extensions` / `unit_dirs` / `unit_pattern` / `support_dirs` / `entry_pattern`、`tests` とその `test_pattern` / `pending_pattern` / `system` / `system.test_pattern` / `system.pending_pattern`、`schema` とその `files` か `dirs` / `constraint_pattern`、`contract`）は省略できない。対象が無いなら `{ "none": "<理由>" }`。docs の 4 ディレクトリと注釈の正規表現は none にできない。型の誤り、理由の無い none、コンパイルできない正規表現（すべて `u` フラグ）、捕捉グループの無い単位の印は、キー名付きの設定エラー（exit 2）。廃止したキー（`*.exempt_pattern`、`contract.exclude_codes`、`source.entry_files`）も設定エラー。`git.units` のある monorepo のルートは「unit ごとに `--root` で実行する」と案内する。
- **義務表（C26）。** none と 0 件が通るのは、それを求める active な文書・fixed な契約が無い間だけ。

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

  義務がある `unit_dirs` / `tests` / `tests.system` / `entry_pattern` / `constraint_pattern` の一致 0 件も違反。宣言した固定パス（glob でないパス）が無いことは、active な UC があるかそのキーに義務があれば違反で「作る（ディレクトリなら `.gitkeep`）か、none にする（理由付き）」と案内し、それ以外はレポートに「未作成」と出すだけにする。
- **分類（C27）。** active な REQ がある間、`source.dirs` の全ファイルは `unit_dirs` か `support_dirs` に入る（ADR-0055）。
- **注釈はコメントの中だけを数える。** `comment_pattern`（任意。最上位と `source` / `tests` / `tests.system` / `schema` で上書き可。既定 `^\s*(?:\/\/|\/\*|\*|#|--|@|<!--)`）に一致する行の注釈か、同じ行で注釈より前に `//` `/*` `#` `--` `<!--` がある注釈だけを数える。既定のままなら `#` / `@` で始まる行は窓をつなぐが、その行の注釈は前に `//` `/*` `--` `<!--` があるときだけ数え、数えなかったときはメッセージで上書きを案内する（TS の `#private` やデコレーターの文字列引数を数えないため）。
- **改行した呼び出しをつなげる。** 行末が `(` の行は、続く行を関数の本体が始まる行まで（最大 6 行）つなげてから単位の印と保留の印を当てる。Prettier が折り返したルートやテストが、受け手の名前によらず単位になる（印に受け手の名前の一覧を持たせると、一覧に無い名前の未宣言のルートが黙って抜ける）。
- **窓を絞る。** `before` は単位の印の行と直上に連続するコメント行（空行・コード行・別の単位の印で切れる）、`after` は単位の印の行と、次の行がコメント行ならその行。1 つのテストの窓に REQ の `@covers` が 2 つ以上あれば C11 違反。
- **保留（`pending_pattern`）。** 単位の印の行か窓に一致すればそのテスト、それ以外の行（`describe.skip`、本体の `XCTSkip` など）に一致すればファイルの全テストを保留とみなす。保留のテストは C1 / C10 / C15 / C20 の被覆に数えず、「skip を外す」「ファイルを分ける」と案内する。注釈の要求（C11 / C15）は保留でも変わらない。phase は判定に使わない。
- **C1 の起点を広げる。** active な REQ に加え、withdrawn 以外でソースから `@implements` されている REQ にもテストを求める。status を draft に戻しても、実装が残る限りテストの要求は消えない。C19 の `unit_dirs` の単位は REQ か BR を少なくとも 1 つ指す（`@implements UC-nnn` だけではテストに辿れない）。ただし、注釈を外した単位を既存の `support_dirs` の glob の中へ移すことは、traceconfig を変えずにできるので検出しない（ステートレスな検査の限界。reviewer が見る）。
- **走査の漏れを作らない。** 走査は `node_modules` と `.git` だけを除き、ドットで始まるディレクトリも見る。`source.dirs` の `!` で外したファイルが `tests.dirs` / `tests.system.dirs` にも入らなければ C27（誰も見ないファイル）。
- **撤回済みの仕様への参照を違反にする**（C3・C5・C15・C16・C17・C20・C21）。
- **新しい検査**:
  - C15 の派生: `tests.system.test_pattern` に一致する全テストに `@scenario`。人間でないと数えるのは種別が「システム」で始まるアクターだけ。
  - C21: 境界の入口（`entry_pattern`）はすべて `@operation UC-nnn#name` を持ち、`@operation` は入口か単位（`unit_pattern`、`support_dirs` を含むソース全体）の窓に帰属し、撤回されていない UC の契約に実在する操作を指し、fixed 契約の全操作はどこかの `@operation` から指される。入口を探す範囲は source 全体から `entry_exclude`（ファイル単位の glob）を除き、`entry_file_pattern` があれば中身が一致するファイルだけ（その印が無ければ入口として動かないフレームワークに限る）。
  - C21 の向き: 入口の窓の `@operation` は `direction: inbound` の操作だけを受け付け、パスの入口なら `transport: http` の操作に限る。owned かつ inbound の操作は、入口の窓の `@operation` だけが実装を指す（任意の関数の窓では足りない）。
  - C21 のパスの照合: 入口の捕捉が `/` で始まり、操作が http で `wire.path` を持つときだけ照合する。`?`・`#` 以降と末尾の `/` を除き、`${…}` `:x`（`:x{正規表現}` `:x?` を含む）`[x]` `{x}` `*` を同じパラメーターとみなし、捕捉が `/` で終われば前方一致、それ以外は後方一致（ルーターの接頭辞を許す）。method は見ない。正規化して空なら照合しない。
  - C22: active な BR は active な REQ の `br:` から参照される。C23: スキーマの制約（`constraint_pattern`）はすべて `@implements` を持つ。C13 の対象は active な BR。
  - C24: 撤回されていない契約が 1 件以上あるとき、共有語彙の全エラーコードがどれかの契約の `errors` で使われる。
  - C25: active な UC / REQ の本文が使う用語集の用語（用語集の status によらない）のコード識別子が、ソース（とスキーマ）のコメント行以外に存在する。長い用語から照合し、セルの装飾を剥がし、セル全体が `<…>` の行だけ捨てる。文字列リテラルは残す。
- **黙って省かない。** stop-gate と CI は traceconfig.json が無ければ失敗。spec-lint と contract-run は `<docs>/goals` が無ければ exit 2。contract-run は実行する実例があるのにアダプターが無いとき、skip を返した実例があるときに失敗。`contract.exclude_codes` は廃止し、契約に無いエラーコードは `error_code_pattern` に一致させない。`--only` の未知の ID・空は使い方エラーで、出力に「部分検査」と出す。`--as-active` は draft を active とみなす（承認前の自己検査）。
- **パーサーを共有する。** 厳格 YAML（`tools/_shared/strict-yaml.mjs`）、frontmatter（`frontmatter.mjs`）、glob（`glob.mjs`）を spec-lint / trace-check / contract-run / gate-hook が共有する（stop-gate は変更の検出の指紋に含める）。spec-lint は frontmatter の曖昧さ（先頭が空白の行、キーの重複、区切りもどき、閉じ忘れ、`キー: 値` でない行）、UC ディレクトリの UC.md / REQ-nnn.md 以外の md、contract.yaml の無い active な UC、種別が「人間」「システム」で始まらないアクターを ERROR にする。C9 は `_shared` 以外の `_` ディレクトリと、id を持つのに配置に無い md を違反にする。
- 層の向き（`layering`、C6）は紐づきではないので、必須にしない。
- **主張の外（M9）。** テストや計測が実際に実行されたこと（CI のテスト結果と `@covers` の突き合わせ）は検査しない。trace-check が見るのは紐づきの有無で、実行は `commands` の宣言どおりに stop-gate と利用プロジェクトの CI が走らせるところまで。

## Consequences

- 良: 検査が通れば、宣言した範囲では docs と実装・テストの紐づきに抜けが無い。検査しない範囲は、traceconfig.json の none 宣言とレポートの「宣言された不在」「未作成」にすべて現れる。
- 良: 義務が無い間は none や空の範囲が通るので、新規プロジェクトの最初のターンと既存プロジェクトの移行が none の往復なしで進む。文書を active にした時点で義務表が宣言を求める。
- 良: 撤回した仕様に紐づくコードとテストが、撤回と同じ変更で片付く。status を戻して実装だけ残す経路も C1 が塞ぐ。
- 良: 実装にあって契約に無い入口、テストに辿れない BR、注釈の無い DB 制約、保留のまま残ったテストが見つかる。
- 悪（破壊的変更）: 既存の利用プロジェクトは、harness を上げると次のどれかで止まる。宣言不足・廃止したキー（設定エラー）、baseline に頼っていた既知の違反、`--strict` / `--update-baseline` の呼び出し、skip を返す契約アダプター、`docs/goals` の不在、`source.dirs` の未分類のファイル。
- 悪: 既存プロジェクトへの導入は、違反ゼロを保ったまま宣言の範囲を広げて進めるしかない。docs-migrate は紐づきが揃うまで文書を draft に留め、テストの無い単位は特性テストを書くまで `support_dirs` に置く。
- 悪: none の宣言は理由を書けば通る。義務の無い範囲に限られ、差分とレポートに必ず現れる。agent が書き換えて検査を外す経路は ADR-0057 で人間の承認に掛ける。
- 悪: C21 のパスの照合は文字列の比較で、意味の限界がある。短い捕捉（`/:id`）は後方一致で別の操作の `wire.path` にも一致しうるので、取り違えた `@operation` を見逃すことがある。method も見ない。
- 悪: `entry_pattern`・`constraint_pattern`・`test_pattern`・用語集の照合は行単位の正規表現で、書き方によっては拾えない入口・制約・テスト・識別子がある。義務がある範囲の 0 件は C26 が落とすが、一部の取りこぼしは見えない。用語集の照合は識別子の存在だけを見て、用語の意味で使われているかは見ない。
- 悪: 窓を絞り、コメントの中だけを数えるので、doc comment と単位の間に空行を挟んでいたコードや、`#` を行コメントにする言語は、注釈の位置か `comment_pattern` を直す必要がある。
- 悪: 実機・シミュレーターでしか到達できない操作（skip を返していたもの）も、契約アダプターから実行できるようにする必要がある。
- 悪: テストが実際に実行されたかは見ない（M9）。`commands.test` が一部のテストしか走らせなくても、紐づきの検査は通る。
- 悪: ツールが `tools/_shared/` に依存する。`.harness/` に harness 全体を置く配置では変わらないが、ツールのディレクトリだけを写す配置では `_shared/` も写さないと起動しない。
- 悪: CI（spec-gate.yml）は利用プロジェクトのツールチェーンを持たないので、contract-run を実行しない。契約の実行は stop-gate と、利用プロジェクト自身の CI に残る。

## 却下した選択肢

- **baseline を移行専用に限定して残す**（触ったファイルの既知違反は失敗にする）: 例外の範囲は狭まるが、まだ触っていない古いコードには例外が残る。検査が通っても紐づきが揃っているとは言えない。
- **省いた検査を表示するだけにする**: 表示されても通るなら、省略は例外のまま残る。対象が無いことは宣言として明示させ、宣言の無い省略は設定エラーにする。
- **none の宣言を認めず、全キーに実在を求める**: DB を持たないアプリ、入口を持たないライブラリ、ADR だけのリポジトリ（harness 自身）のように、対象が本当に無い場合を表せない。
- **none をいつでも認める**（最初の案）: 文書を active にした後も none のまま検査を外せる。義務表で「求める文書がある間は none にできない」とする。
- **0 件の一致と固定パスの不在を常に設定エラーにする**: コードがまだ無い新規プロジェクトの最初のターンと、ひな形を置いた直後が止まる。害になるのは検査が走るとき（義務があるとき）だけなので、そのときだけ違反にする。
- **注釈を含む行をすべて数え、窓に空でない行を含める**（以前の形）: 文字列リテラルや隣の単位の本体の注釈で紐づきが満たされる。
- **途中状態の赤を避けるため、phase で検査を緩める・`--uc` で UC に絞る**: phase は agent が書く行で、判定の条件にすると agent が自分で検査を外せる。C11 / C19 / C24 は UC に帰属しない。
- **draft の文書を指す注釈を違反にする**: 改訂のたびに注釈を消す誘因になる。C1 の起点を広げ、status の降格を人間の承認に掛ける（ADR-0057）ほうが紐づきを残せる。
- **入口のパスを契約と照合しない、または method まで照合する**: 照合しなければ `@operation` は既存の操作名を書くだけで通る。method はフレームワークごとに書き方が違い、行の正規表現から取れない。
- **入口を探すファイルを `source.entry_files`（含めるリスト）で宣言する**: 新しいファイルが黙って範囲の外になる。除外のリスト（`entry_exclude`）にすれば、新しいファイルは常に検査される。
- **契約に無い入口を、フレームワークごとの命名規則から逆算して見つける**: 規則はフレームワークのパッケージごとに違い、harness の検査が言語やフレームワークに依存する。入口の印は正規表現で宣言させ、紐づけは言語に依存しない注釈（`@operation`）で持つ。
- **BR にも `@covers BR-nnn` を書かせる**: BR は REQ を通じて外から観測できる振る舞いになる（R-401）。REQ の `br:` から辿れれば、REQ のテスト（C1 / C10）が規則を検証する。
- **スキーマの全制約に注釈を求める**: 主キーや外部キーなど、業務ルールでない制約まで BR を要求することになる。どれをルールの制約とみなすかは `constraint_pattern` で宣言させる。
- **テストの実行結果と `@covers` を突き合わせる**: テストランナーの出力形式が言語ごとに違い、harness の検査が言語に依存する。主張の外（M9）とし、別の判断に残す。
