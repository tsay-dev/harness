# spec-lint

harness に同梱する依存なしの Node ツール。docs の SSOT（単一文書、GOAL / UC / REQ、
BR / NFR / ADR、境界契約）の**書式とライフサイクル**を機械的に検証する。

- **検証する配置**: `docs/00-vision.md` `01-glossary.md` `02-actors.md`（任意で
  `goals-backlog.md`、`design.md`、`verification/GLOBAL.md`、`verification/DEFERRED.md` —
  機械判定できない reviewer 指摘の台帳。行のみ）、`docs/goals/GOAL-nn-<slug>/GOAL.md`、
  `…/UC-nnn-<slug>/`（`UC.md`、`REQ-nnn.md`、`contract.yaml`）、`docs/rules/BR-nnn.md`、`docs/nfr/NFR-nnn.md`、
  `docs/adr/ADR-nnnn-<slug>.md`、`docs/_shared/components.yaml`。
- **検証する書式**: SSOT は `../../templates/develop/` のテンプレート。必須 frontmatter キー
  （テンプレートのコメントに `optional` とあるキーは任意）、必須節、契約の必須 `x-` キーを
  **テンプレートから導出**する（テンプレートを編集して書式を改めれば lint が追従）。
  閉じた語彙は実行コードだけが保証できるため、ここに置く:
  `status`（ノードは `draft|active|withdrawn`、単一文書は `draft|frozen|living`、
  `DEFERRED.md` は `living` のみ、ADR は `proposed|accepted|superseded`、契約は `draft|fixed`）、
  `phase`（`定義|構造|実装|検証|完了`）、`pattern`（五つの EARS パターン）、
  `transport`（`http|sdk|local-store|deeplink|push|device|internal` — `internal` は利用プロジェクトが
  ADR で明示的に契約化を決めたプロセス内境界。R-1204 の既定ではその境界は操作ではない）/ `direction`。
- **利用プロジェクトの作業指針**: `docs/` と同じ階層の `CLAUDE.md` / `AGENTS.md` が 150 行を超えたら err（R-1010。
  作業指針は地図だけを持つ。メッセージに実際の行数を入れず、baseline のキーを編集で動かさない）。
- **トレーサビリティは担当外**: カバレッジ、`@covers` / `@implements` の解決、配置 ↔ frontmatter
  （C9）、採番衝突は `../trace-check/` の 15 検査の担当。
- **契約検証の範囲**: 契約は **OpenAPI ではない**。harness 独自の境界契約書式（理由: `docs/adr/ADR-0001`）。
  意図的に狭い YAML 部分集合用の手書き parser（理由: `docs/adr/ADR-0002`）で構造を検査する:
  `transport` / `direction` / `owned` の妥当性、`wire` は `http` のみ、`entry` は `deeplink` / `push` のみ、
  `owned: false` なら `source` 必須、全操作に明示した `auth` が `_shared` に解決すること、
  `errors[].code` が `_shared` の `errorCodes` に閉じていること、対応する `PERMISSION_DENIED` のない `requires`、
  `errors: []` を「失敗経路なし」の宣言として受理すること（失敗例は要求しない。`errors` の省略はその宣言ではない）、
  成功 `examples` が宣言 `request` と一致すること（失敗例は反例なので禁止キーを含んでよい）、
  操作キーがテンプレートの 13 個に閉じていること、`fixed` 後は全宣言エラーコードを少なくとも一例が返すこと。
  **検査器がすべて判定するため、準拠判定のために agent が契約を全文読む必要はない。**
- **使い方**: 作成者が直接実行して成果物を機械検証する。`gate` を commit-msg hook に接続してもよい
  （任意。各プロジェクト側で設定）。

```bash
node spec-lint.mjs validate [--docs docs]     # 書式 + ライフサイクル不変条件 + docs の健全性
node spec-lint.mjs validate --ignore-legacy-layout   # docs/specs/ が残る移行中も新配置を検査
node spec-lint.mjs validate --update-baseline # 現在のエラーを .spec-baseline.json に記録。以後は新規エラーのみ失敗
node spec-lint.mjs validate --strict          # ベースラインを無視（全エラーで失敗）[--baseline <file> で配置変更]
node spec-lint.mjs gate --message <file>       # コミットの UC: trailer を検証（UC / REQs が active、契約が fixed）。ベースラインは使わない
node spec-lint.mjs gate --uc UC-012            # 一 UC に同じ検査 [モノレポ直下では --unit <name>]
node spec-lint.mjs convert <openapi.yaml> --uc UC-012 [--direction outbound|inbound] [--out contract.yaml] [--date YYYY-MM-DD]
```

終了コード: `0` = 正常 / `1` = 違反 / `2` = 使用法エラー。Node のみ（外部依存なし）。
モノレポの利用プロジェクト（`traceconfig.json` が `git.units` を宣言し、repository 直下から実行）では docs と
UC 番号は単位ごと。`gate` は一単位の `docs/` を検索する。`--message` はコミットヘッダーの `scope` から、
`--uc` は `--unit` から単位を取る。宣言済み単位でない scope（`repo`、なし）で `UC:` を持つコミットは失敗する。
trailer のないコミットは、ほかと同様、そのまま通す（ADR-0040）。
回帰テスト: `node --test "tools/spec-lint/test/*.test.mjs"`（ケースごとに一時ディレクトリへ最小 docs ツリーを書く）。
旧配置（`docs/specs/F-xxx-<slug>/`）検出時は `/docs-migrate` を案内して `1` を返す。
`--ignore-legacy-layout` 指定時は旧ディレクトリを警告にし、新配置を完全に検査する。

## ベースラインの歯止め

trace-check と同じ意味を持つ。`--update-baseline` は現在の全エラーを記録する（キーは行番号を除くファイル +
メッセージ。無関係な編集で行がずれても既知エラーは新規にならない。同じキーは件数で比較するため、
記録済み種類でも一件増えれば新規）。以後の `validate` は既知を `known` と表示し、新規だけで失敗する。
解消後に再度 `--update-baseline` で台帳を縮める。既存プロジェクトの初回導入と移行中の既知の赤
（REQ がまだ `draft` の `fixed` 契約、未変換の旧書式ファイル）に使う。台帳は `/docs-migrate` が指定する
箇所以外では縮むだけ（R-804）。`gate` はベースラインを無視し、実装開始を免除してはならない。

## convert（旧 OpenAPI 契約 → harness 契約）

`convert` は `docs/adr/ADR-0001` で決めた書式変更の機械処理部分。緩い parser（block scalar を畳む）で
OpenAPI 3.x 契約を読み、形状を保持して harness 契約を書く:
`paths.*.<method>`（`operationId`）→ `transport: http` と `wire` 付きの `operations.<name>`、path / query
`parameters` + `requestBody` → 一つの `request` object、最初の 2xx → `response`、各 4xx / 5xx → `errors[]`
（`code` は `x-error-code`、なければ response schema の `code` の `const` / `enum`、なければ 400 の
`INVALID_INPUT` などステータス既定値）、`example(s)` → `examples`、`components.schemas` → 契約の最上位
`schemas:`（`$ref` を `#/schemas/<Name>` に書き換え）、`security` → `auth`（`[]` = `none`）、`x-status` は引き継ぐ。
判断できないもの — direction（`--direction`、既定 `outbound` = このアプリが API を呼ぶ。サーバー自身の API は
`inbound`）、欠落した `security`、推測したエラーコード、欠落した `summary`、UC（`--uc`）— はすべて
ファイル末尾の `# convert:` 注記として残し、stderr に表示する。旧契約に 4xx がない操作は `errors: []` にする
（失敗経路を創作しない）。注記を解消後に `validate` を通すことを意図した結果。

## エラーとして扱うもの（ライフサイクルと参照の不変条件）

- 必須 frontmatter / 必須節 / 必須 `x-` キーの欠落、語彙外の status。
- ディレクトリ名の違反（`GOAL-nn-<slug>`、`UC-nnn-<slug>`、`ADR-nnnn-<slug>.md`）、ディレクトリや
  ファイル名に合わない `id`、重複 GOAL / UC id、`GOAL.md` / `UC.md` 欠落、ゴール直下の UC / REQ。
- EARS 引用ブロックがゼロまたは複数の REQ（一要件一文 — R-401）、五つの EARS パターン外の `pattern`、
  ディレクトリに合わない `uc:`。
- 確定 UC の状態 × イベント表の空セル（R-501）、または例外系走査の四軸の欠落（R-502）。
- 確定文書に残るテンプレートプレースホルダー（`UC-000`、`YYYY-MM-DD`、`<...>` など）。`<...>` は
  テンプレートが使う文字列、または後続語に接着していない非 ASCII の `<…>` を数える（`<言語>.lproj` は
  メタ変数であり空欄ではない）。HTML コメント、コード span / fence、YAML コメントは走査しない。
  REQ の `## 検証方針` は除外し、内容は trace-check の C2 / C10 が扱う。
- UC またはいずれかの REQ が `draft` の `fixed` 契約、`phase` が `定義` を超えた `draft` UC、
  解決しない `x-spec` / `$ref`、存在しない ADR の `supersedes`。
- 受理する YAML 部分集合外の構文: anchors / aliases（`&` / `*`）、block scalars（`|` / `>`）、tabs、
  重複キー。OpenAPI 書式のままの契約、UC ディレクトリに残る `api-contract.yaml`。
- `transport` / `direction` / `owned` / `auth` / `summary` 欠落、transport に属さないフィールドを持つ操作、
  `x-no-boundary` の理由がない `operations: {}`。
- 閉じた集合 `transport` / `direction` / `owned` / `source` / `auth` / `summary` / `wire` / `entry` /
  `requires` / `request` / `response` / `errors` / `examples` — `templates/develop/contract.yaml` の 13 キー —
  以外を持つ操作。操作レベルの `x-*` も拒否する。規則は UC / REQ / BR に属し、評価順序は `errors` の順序
  （R-1207）。各 `errors[]` 項目も `code` / `when` / `wire` に閉じる。
- `fixed` 契約に、どの `examples.<case>.error` も返さない宣言エラーコードがある（`errors` ⊆ `examples`。
  既存の「全失敗例は宣言済みコードを指定する」の逆。`errors: []` は除外）。例のない失敗経路はテストで実行できない。
- `docs/verification/DEFERRED.md`（任意）: `living` 以外の `status`、セルがちょうど七つでない行、
  `DEF-nnn` に一致しない / 重複した `ID`、`YYYY-MM-DD` でない / 未来の `起票日`、空の `出所` / `対象` /
  `指摘` / `理由`、`spec-lint | trace-check | contract-run | test | typecheck | lint | hook | 未定` 外の `昇格先`。
  ヘッダー行だけの表は有効。

導入前に書かれた契約へこれらの規則を適用する利用プロジェクトは、一度 `validate --update-baseline` を実行して
既存資料を台帳に記録し、以後は新規違反のみで失敗させる（既存資料への初回検査適用に対する R-804 の例外）。
`gate` は引き続きベースラインを無視する。

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
| 30 日を超えた `DEFERRED.md` 行 | DEFERRED | ここまで待った指摘は機械検査へ昇格するか、解消するかを判断する |
| 同じ `対象` の `DEFERRED.md` 行が三つ以上、または利用プロジェクト直下からの `対象` パスが存在しない | DEFERRED | 再発は機械検査を書く価値の兆候。対象の消失は行が古いことを示す（解消済みなら削除） |
| `contract.yaml` のない `active` UC | UC | ファイルを省略せず、境界ゼロ（`operations: {}` + `x-no-boundary`）を宣言する |
| 例外系走査でケースを導出する UC なのに契約に `errors` がない（理由の有無にかかわらず `なし` / `—` / `-` で始まる導出セルは導出なしと数える） | 契約 | 失敗経路が境界の形状を持たない |
| `PRD.md` があり、単一文書が欠落 | docs 直下 | 旧配置の残骸。`/docs-migrate` |

エラーにしない理由: 既存プロジェクトの `validate` が即座に終了しないようにするため
（差分更新の機会に段階的に整理する）。
