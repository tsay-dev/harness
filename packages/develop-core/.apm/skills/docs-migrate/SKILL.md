---
name: docs-migrate
description: プロジェクトの docs とコードを harness の SDD/SSOT 配置（docs/goals/GOAL-nn/UC-nnn/、EARS 要件、BR/NFR/ADR、境界契約、@covers/@implements 注釈、trace-check）にフェーズごとに適合させ、各フェーズ末に人間のレビューゲートを設ける。旧 F-xxx 配置の harness 利用プロジェクトと、harness docs がない既存プロジェクトの両方を扱う。/docs-migrate、または「docs を移行して」「docs が harness に準拠しているかチェックして」「SDD に準拠させて」「docs レイアウトを最新化して」などで起動する。
---

> **外部の実行資産:** `HARNESS_ROOT` は tools と templates を持つ harness チェックアウト（通常は `.harness`）の絶対パスです。以下のコマンドとテンプレート参照に使います。

# docs-migrate — 既存プロジェクトを段階的に適合させる

適合の定義はこの skill が所有しません。正本は現行の spec-lint、trace-check、`${HARNESS_ROOT}/templates/develop/` のテンプレート、規約の末端ファイル [docs.instructions.md](../../instructions/docs.instructions.md) です。あなたはオーケストレーターとして、機械的な移動（`git mv`、変換コマンド）は自ら行い、内容の変換は書式の作成者へ別コンテキストで委譲します（`HARNESS_ROOT` と末端ファイルのパスを入力に渡す。domain / UC / REQ / BR / contract は `spec-author`、分割クラスと注釈は `test-author` の `annotate-existing` モード、`@implements` は `implementer`）。ADR とコミットは [adr.md](../develop/references/adr.md) / [commit.md](../develop/references/commit.md) に従って自ら書きます。人間への報告と移行する docs は日本語です。

## 絶対規則（違反時は停止して人間に尋ねる）

- **A-1 創作しない。** 既存コード、docs、テストから読み取れない振る舞いを要件、ルール、表セルとして書きません。読み取れないものは `OPEN-QUESTIONS.md` へ。もっともらしい仕様の創作が最悪の失敗です。
- **A-2 破壊しない。** 既存文書を削除せず、役目を終えたものは `git mv` で `docs/attic/` へ移し、元の場所に 1 行の移動案内を残します。
- **A-3 振る舞い不変。** 本番動作を変えません。許すコード変更は注釈コメントの追加、定数抽出（値不変）、ファイル移動だけです。動作バグは `OPEN-QUESTIONS.md` へ（修正は `/develop`）。
- **A-4 フェーズゲート。** 各フェーズ末に停止し、人間が成果物をレビューします。1 フェーズ = 1 コミット（または commit.md に従うコミット群）。
- **A-5 違反ゼロで進める。** baseline はありません（ADR-0056）。各フェーズ末に `spec-lint validate`（フェーズ 7 までは `--ignore-legacy-layout` だけ許す）と `trace-check` を exit 0 にします。検査の範囲は宣言で広げ、注釈の揃った範囲だけを `tests.dirs` / `source.unit_dirs` に入れます（未着手は空の配列）。
- **承認は記録し、status は紐づきが揃ってから進める。** 各フェーズの承認は報告に記録し、GOAL・UC・REQ・BR はフェーズ 6 まで `draft`、契約も `draft` に留めます（先に進めると C1 / C8 / C10 / C14 / C17 が発火し A-5 を壊す）。
- `OPEN-QUESTIONS.md` はあなただけが書きます。横断的な単一ファイル編集（`traceconfig.json`、`_shared`、共有ファイルの注釈）は並行 Task の前に単独で終えます。
- **情報を黙って落とさない。** 新配置で行き先がないものは ADR、issue、コミットメッセージ、attic のいずれかに振り、計画と報告に明記します。

## フェーズと人間ゲート

| フェーズ | 成果物 | 🙋 で決めること |
| --- | --- | --- |
| 0 棚卸し（書き換えなし） | `spec-lint validate` の分類結果、`${HARNESS_ROOT}/templates/docs-migrate/INVENTORY.md` からの `docs/INVENTORY.md`（SSOT候補 / 派生物 / 重複 / 不明）、コードから集めた entity と状態値、`OPEN-QUESTIONS.md` | 分類、特に重複の組でどちらを本文にするか。適合済み（exit 0）ならここで停止 |
| 1 骨格と検査 | `docs/{goals,rules,nfr,adr,verification,_shared,attic}/`、テンプレートからの `traceconfig.json`（全宣言。対象が無いものは `{ "none": "<理由>" }`）と `_shared/components.yaml`、CI への spec-lint / trace-check 追加（`spec_lint_args: --ignore-legacy-layout`） | なし（本文は書かない） |
| 2 語彙・actor・goal | `spec-author`（`domain`）が既存資料から抽出した `01-glossary.md`（表記揺れは禁止同義語へ）、`00-vision.md`（KPI は資料になければ `未計測`）、`02-actors.md`、GOAL / backlog、計測方法のある NFR | 正規語と禁止同義語。承認後にステータスを設定 |
| 3 UC と表 | `spec-author`（`usecase`、UC ごと並行）が入口（controller、CLI、job）から導いた `UC.md`。表はコードの分岐から埋め、分岐がないセルは `?` のまま `OPEN-QUESTIONS.md` へ | UC 粒度（R-503）と穴の一覧。承認後 `active` |
| 4 要件と業務ルール | `spec-author`（`requirements`、並行）が表の予約 ID で書いた `REQ-nnn.md` と抽出した `BR-nnn.md`。値は R-102 で既存定数・制約を SSOT にする。原文は attic へ | REQ 一覧と BR 抽出。承認を報告に記録し、`draft` のまま |
| 5 契約と判断 | 旧 OpenAPI は `node "${HARNESS_ROOT}/tools/spec-lint/spec-lint.mjs" convert <api-contract.yaml> --uc UC-nnn --direction <inbound|outbound> --out <contract.yaml>` で自ら変換し、`# convert:` 注記の解消と `_shared` 移行だけを `spec-author`（`contract`）へ委譲（再導出は禁止）。transport はテンプレートの判定表で一律に決め、解釈を 1 ADR に記録。契約のないプロジェクトは公開している境界を転記（第三者は `owned: false` + `source`、境界なしは `operations: {}` + `x-no-boundary`）。ADR は `git mv` と frontmatter 追加、なければ現状の記録として自ら書く（却下案は固定行「記録なし」） | ADR が実態と一致し契約の形が保たれたか |
| 6 検証の接続 | `traceconfig.json` の `tests.test_pattern` / `covers_placement` を設定し、技術部品の自己検査を `tests.dirs` の外へ移した後、UC ごとに `test-author`（`annotate-existing`）が既存テストの観測から `## 検証方針` と `@covers` を付け、`implementer`（`logic`、注釈のみ）が `@implements` / `@operation` を付ける。紐づきの揃った文書を `active`、契約を `fixed` にし、注釈済みの範囲を宣言に加える。新テストは現動作を固定する特性テストだけ | 網羅表と、`draft` に残る文書の一覧 |
| 7 返済と定常運用 | `draft` に残る文書と、宣言の外に残るコード・テストの返済 issue、利用プロジェクトの `CLAUDE.md` / README に R-801 / R-803 / R-804、`docs/specs/` の `git rm`、CI から `--ignore-legacy-layout` を除去、flag なしの `spec-lint validate` と `trace-check` | なし |

旧 harness 配置の目印は `docs/specs/F-xxx-<slug>/`（通常 1 F-xxx = 1 UC、`spec.md` の業務ルール箇条書きが REQ / BR の資料、`受け入れ条件` は証拠であって要件ではない）、`PRD.md`（vision へ吸収、横断原則は BR 候補）、`docs/specs/_shared`、日付付き ADR ファイル名です。

## 完了条件

- 全 INVENTORY 行が SSOT / 生成物 / 参照 / attic として解決済み。
- `spec-lint validate` が `--ignore-legacy-layout` なしで exit 0、`trace-check` が exit 0。`draft` に残る文書と宣言の外のコード・テストは全件が返済 issue。
- `OPEN-QUESTIONS.md` が空、または全項目に人間の回答あり。

迷ったら [docs.instructions.md](../../instructions/docs.instructions.md) の規則 ID > テンプレート > この手順 > 常識の順で決め、決められなければ選択肢と推奨を `OPEN-QUESTIONS.md` に書いて停止します。仕様改善、harness 自体の修正、`design.md` の創作はこの skill の外です。
