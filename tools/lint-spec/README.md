# lint spec

docs の SSOT（単一文書、GOAL / UC / REQ、
BR / NFR / ADR、境界契約）の**書式とライフサイクル**を機械的に検証する（`harness lint spec`。依存なしの Node）。

- **検証する配置**: `docs/00-overview.md`（1 枚の概要。ADR-0076） `01-glossary.md`（任意で
  `verification/DEFERRED.md` —
  凍結済みの、過去の保留の一覧。行のみ。ADR-0068）、`docs/goals/GOAL-nn-<slug>/`（概要の `planned` でない行の GOAL だけ）、
  `…/UC-nnn-<slug>/`（`UC.md`（REQ は「要件」の節の `### REQ-nnn`。ADR-0067）、`contract.yaml`）、`docs/rules/BR-nnn.md`、`docs/nfr/NFR-nnn.md`、
  `docs/adr/ADR-nnnn-<slug>.md`、`docs/_shared/components.yaml`。`design.md` と `verification/GLOBAL.md` は置かず、
  残っていれば違反にする（ADR-0077）。
- **検証する書式**: SSOT は `../../templates/develop/` のテンプレート。必須 frontmatter キー
  （テンプレートのコメントに `optional` とあるキーは任意）、必須節、契約の必須 `x-` キーを
  **テンプレートから導出**する（テンプレートを編集して書式を改めれば lint が追従）。
  閉じた語彙は実行コードだけが保証できるため、ここに置く:
  `status`（ノードは `draft|active|withdrawn`、単一文書は `draft|frozen|living`、
  `DEFERRED.md` は `living` のみ、ADR は `proposed|accepted|superseded`、契約は `draft|fixed`）、
  `phase`（`定義|構造|実装|検証|完了`）、`pattern`（五つの EARS パターン）、
  `transport`（`http|sdk|local-store|deeplink|push|device|internal|stream` — `internal` は利用プロジェクトが
  ADR で明示的に契約化を決めたプロセス内境界。R-1204 の既定ではその境界は操作ではない）/ `direction`。
- **利用プロジェクトの作業指針**: `docs/` と同じ階層の `CLAUDE.md` / `AGENTS.md` が 150 行を超えたら err（R-1010。
  作業指針は地図だけを持つ）。
- **トレーサビリティは担当外**: カバレッジ、`@covers` / `@scenario` の解決、配置 ↔ frontmatter
  （C9）、採番衝突、参照先の実在は `harness lint refs` の検査（C1〜C26。`../lint-refs/README.md`）の担当。
- **撤回済みの文書**: `status: withdrawn` の UC・REQ・BR・NFR には、必須の節（検証方針、状態 × イベント表、例外系の走査など）とその中身を求めない。frontmatter・ID・要件文（REQ と NFR）は検査する。
- **共有パーサー**: frontmatter は `../_shared/frontmatter.mjs`、契約と共有語彙の YAML は `../_shared/strict-yaml.mjs` で読む。
  引用符付きの値は YAML の決まりどおりに読む（二重引用符の中のエスケープを解く。知らないエスケープは違反。単一引用符の中は解かない）。改行・タブ・NUL を含む例は `"a\nb"`・`"\u0000"` のように書ける。
  lint refs・run cases・guard も同じものを使うので、同じ文書をコマンドごとに違う値（一方は active、他方は draft）に読まない（ADR-0056）。
- **契約検証の範囲**: 契約は **OpenAPI ではない**。harness 独自の境界契約書式（理由: `docs/adr/ADR-0001`）。
  意図的に狭い YAML 部分集合用の手書き parser（`../_shared/strict-yaml.mjs`。理由: `docs/adr/ADR-0002`）で構造を検査する:
  `transport` / `direction` / `owned` の妥当性、`wire` は `http` のみ、inbound の `http` の操作の `wire.method` と `wire.path` は空でない文字列（入口の一覧と文字どおり比べるため。形は解釈しない。撤回済みの UC の契約は対象にしない）、`entry` は `deeplink` / `push` / `stream` のみ（`deeplink` / `push` は inbound 限定）、`stream` の `observers` と例の `events`、
  `owned: false` なら `source` 必須、全操作に明示した `auth` が `_shared` に解決すること、
  `errors[].code` が `_shared` の `errorCodes` に閉じていること、対応する `PERMISSION_DENIED` のない `requires`、
  `errors: []` を「失敗経路なし」の宣言として受理すること（失敗例は要求しない。`errors` の省略はその宣言ではない）、
  成功 `examples` が宣言 `request` と一致すること（失敗例は反例なので禁止キーを含んでよい）、
  操作キーがテンプレートの 13 個に閉じていること、`fixed` 後は全宣言エラーコードを少なくとも一例が返すこと。
  **検査器がすべて判定するため、準拠判定のために agent が契約を全文読む必要はない。**
- **使い方**: 作成者が直接実行して成果物を機械検証する。

```bash
harness lint spec [--docs docs]              # 書式 + ライフサイクル不変条件 + docs の健全性
harness lint spec --ignore-legacy-layout     # docs/specs/ が残る移行中も新配置を検査
```

コミットが指す UC の状態の検査は `harness lint git uc`（`../lint-git-uc/README.md`）、旧 OpenAPI 契約の変換は `harness convert`（`../convert/README.md`）。

終了コード: `0` = 正常 / `1` = 違反 / `2` = 使用法エラー、docs の隣の設定の `docs.goals_dir` が `<docs>/goals` と別の場所を指している（lint refs・lint entries と別の木を読むことになる。根の決め方は `../_shared/spec-tree.mjs`）、または `<docs>/goals` が無い（`--docs` の指定を確かめるか、
`<docs>/goals/` を作る。空なら `.gitkeep` を置く）。docs の場所の書き損じで検証が黙って空回りしないため（ADR-0056）。Node のみ（外部依存なし）。
baseline は無い（ADR-0056）。違反は 1 件でも失敗にする。廃止した `--update-baseline` / `--strict` / `--baseline` は
使用法エラー、残った `.spec-baseline.json` は読まずに警告する。
回帰テスト: `node --test "tools/lint-spec/test/*.test.mjs"`（ケースごとに一時ディレクトリへ最小 docs ツリーを書く）。
旧配置（`docs/specs/F-xxx-<slug>/`）検出時は `/docs-migrate` を案内して `1` を返す。
`--ignore-legacy-layout` 指定時は旧ディレクトリを警告にし、新配置を完全に検査する。

## エラーとして扱うもの（ライフサイクルと参照の不変条件）

- 必須 frontmatter / 必須節 / 必須 `x-` キーの欠落、語彙外の status。
- frontmatter の曖昧な書き方: 先頭が空白の行、キーの重複、区切りもどき（`--- ` や `---x`）、終わりの `---` の閉じ忘れ、
  `キー: 値` でない行。ツールごとに読みが割れてすり抜けになるため（ADR-0056）。
- UC ディレクトリにある `REQ-nnn.md`（REQ は `UC.md` の「要件」の節に書く。`harness migrate reqs --write` で移す）。
- UC ディレクトリにある `UC.md` 以外の md（lint refs の対象に入らず紐づきの検査をすり抜ける。資料は `docs/attic` へ）。
- `contract.yaml` の無い `active` UC（ファイルを省略せず、境界ゼロは `operations: {}` + `x-no-boundary` で宣言する）。
- 概要の表（読み方は `tools/_shared/overview.mjs`）: 列の見出しがひな形と違う、ID の形の誤り、同じ ID の行、列の数の食い違い（`|` のエスケープ漏れ）、`種別` が `人間` か `システム` で始まらないアクター（lint refs の C15 は `システム` で始まるものだけを人間でないと数える）、GOAL の行の status が `planned | draft | active | withdrawn` の外、`withdrawn` でない行の目指す状態が空（`withdrawn` で備考が空なら warn）。
- GOAL のフォルダ: 概要に行が無い、行が `planned`、同じ GOAL のフォルダが 2 つ、概要が無い。
- 概要へ移した古い文書（`00-vision.md`・`02-actors.md`・`goals-backlog.md`・`GOAL.md`。名前を変えたものも frontmatter の id `VISION`・`ACTORS`・`GOALS_BACKLOG`・`GOAL-nn` で見つける）。`harness migrate overview` を案内する。
- 例外系の走査: 並行性・外部依存の行は、概要の全体の方針の 3 つの小節が埋まり、概要が `living` のときだけ省ける。導出の欄の「方針の例外（<見出し>）: …。理由: …」は、見出しが方針の小節のどれか、理由が空でない、行に REQ-nnn があることを検査する。
- 設定の `docs.overview` が `<docs>/00-overview.md` でも none でもない（使い方の誤り、exit 2）。
- ディレクトリ名の違反（`GOAL-nn-<slug>`、`UC-nnn-<slug>`、`ADR-nnnn-<slug>.md`）、ディレクトリや
  ファイル名に合わない `id`、重複 UC id、`UC.md` 欠落、ゴール直下の UC / REQ。
- EARS 引用ブロックがゼロまたは複数の REQ（一要件一文 — R-401）、五つの EARS パターン外の `pattern`、
  ディレクトリに合わない `uc:`。
- 確定 UC の状態 × イベント表の空セル（R-501）、または例外系走査の四軸の欠落（R-502）。
- 確定文書に残るテンプレートプレースホルダー（`UC-000`、`YYYY-MM-DD`、`<...>` など）。`<...>` は
  テンプレートが使う文字列、または後続語に接着していない非 ASCII の `<…>` を数える（`<言語>.lproj` は
  メタ変数であり空欄ではない）。HTML コメント、コード span / fence、YAML コメントは走査しない。
  REQ の `## 検証方針` は除外し、内容は lint refs の C2 / C10 が扱う。
- UC またはいずれかの REQ が `draft` の `fixed` 契約、`phase` が `定義` を超えた `draft` UC、
  解決しない `x-spec` / `$ref`、存在しない ADR の `supersedes`、承認済み（`proposed` でない）の ADR が置き換えたのに `superseded` になっていない ADR。
- 受理する YAML 部分集合外の構文: anchors / aliases（`&` / `*`）、block scalars（`|` / `>`）、tabs、
  重複キー。OpenAPI 書式のままの契約、UC ディレクトリに残る `api-contract.yaml`。
- `transport` / `direction` / `owned` / `auth` / `summary` 欠落、transport に属さないフィールドを持つ操作、
  `x-no-boundary` の理由がない `operations: {}`。
- 閉じた集合 `transport` / `direction` / `owned` / `source` / `auth` / `summary` / `wire` / `entry` /
  `requires` / `request` / `response` / `errors` / `examples` — `templates/develop/contract.yaml` の 13 キー —
  以外を持つ操作。操作レベルの `x-*` も拒否する。規則は UC / REQ / BR に属し、評価順序は `errors` の順序
  （R-1207）。各 `errors[]` 項目も `code` / `when` / `wire` に閉じる。
- `stream`（持続する接続のメッセージ。ADR-0061）: `entry` の欠落、届くイベント（inbound）の `response` / `errors` /
  重複した `entry`、`observers` に無い観測者名や予約語 `self` の宣言、`stream` 以外の例の `events`、
  `entry` / `payload` 以外のキーを持つ `events` 項目、届くイベントを指さない `entry`、その `request` と噛み合わない
  `payload`、自身を含まない届くイベントの例。`fixed` ではさらに、`events` を省略した `stream` の例
  （届かないなら観測者ごとに `[]` と書く）と、どの例の `events` にも現れない届くイベント。
- `fixed` 契約に、どの `examples.<case>.error` も返さない宣言エラーコードがある（`errors` ⊆ `examples`。
  既存の「全失敗例は宣言済みコードを指定する」の逆。`errors: []` は除外）。例のない失敗経路はテストで実行できない。
- `docs/verification/DEFERRED.md`（既存のものだけ。凍結済み。ADR-0068）: `frozen_at`（一覧を凍結した日）が無い・実在する日付でない・未来の日付、`frozen_at` より後の `起票日` の行（保留は新しく足さない）、`living` 以外の `status`、セルがちょうど七つでない行、
  `DEF-nnn` に一致しない / 重複した `ID`、`YYYY-MM-DD` でない / 未来の `起票日`、空の `出所` / `対象` /
  `指摘` / `理由`、`spec-lint | trace-check | contract-run | test | typecheck | lint | hook | 未定` 外の `昇格先`
  （凍結済みの行が持っている語。行を書き換えないので、ツールの改名の後も語は変えない）。
  ヘッダー行だけの表は有効。

導入前に書かれた契約へこれらの規則を適用する利用プロジェクトは、違反を直すまで契約を `draft` に戻す
（baseline は無い。ADR-0056）。

## docs の健全性の検出（すべて警告）

文書が「現在形の不変条件」から情報の投げ込み場所へ変質する兆候を警告する（禁止リストの SSOT は各作成者の専門技術）。

| 検出 | 対象 | 意味 |
| --- | --- | --- |
| 本文の括弧内の日付（`（2026-01-01 改訂` など。助詞が続く日付 — `（2026-02-29 は不正` — は履歴でなく検討対象の値。コード span は除外） | すべて | 履歴は git が持つ。本文を現在形に統合する |
| 実装への参照点（コードのファイルパス） | UC / REQ（BR は除外。BR の「値の SSOT は `<path>`」は正当、R-102） | コードが SSOT。docs に書くと腐敗する |
| 内部 API 参照（`Class::method`） | UC / REQ | 観測可能な動作の語彙で書く |
| 「既知の問題 / 残留リスク / バックログ」節 | UC / REQ | 未解決項目は issue 管理へ出す |
| 肥大化（UC 8,000 字超 / REQ 2,500 字超 / BR 2,500 字超 / 契約 400 行超） | すべて | 行でなく文字数を測る（一行 1,000 字は行数をすり抜ける） |
| 200 字を超える EARS 文 | REQ | 複数要件を一つに圧縮している（R-401） |
| **文章内**の他 UC 参照が 10 超（表の行 — `不可: UC-010` セルも — と事前条件節は数えない。設計上の参照であって写しではない） | UC | 参照先の動作の重複が疑わしい。BR に抽出する（R-105） |
| 測定のない NFR、`**意図**` のない BR | NFR / BR | R-104 / 規則は存在と意図を持つ |
| 長い `description`（8 行または 200 字超） | 契約 | 目的、規則、UI 説明は UC / REQ。契約は一行 `summary` と短い注記を持つ（操作配下の `x-*` は警告ではなく、上記の閉じたキー集合が拒否） |
| `DEFERRED.md` に行が残っている（件数を 1 行で示す） | DEFERRED | 凍結済みの一覧が減っているかを、毎回表示する。解消した行は消す |
| `DEFERRED.md` の行の `対象`（利用プロジェクト直下からのパス。REQ は `UC.md#REQ-nnn`）が存在しない | DEFERRED | 対象の消失は行が古いことを示す（解消済みなら削除） |
| 例外系走査でケースを導出する UC なのに契約に `errors` がない（理由の有無にかかわらず `なし` / `—` / `-` で始まる導出セルは導出なしと数える） | 契約 | 失敗経路が境界の形状を持たない |
| `PRD.md` があり、単一文書が欠落 | docs 直下 | 旧配置の残骸。`/docs-migrate` |

エラーにしない理由: 既存プロジェクトの `lint spec` が即座に終了しないようにするため
（差分更新の機会に段階的に整理する）。
