# templates/develop — docs 成果物のテンプレート（書式の SSOT）

各テンプレートは、**作成者（書く側）と lint（検証する側）が共有する唯一の書式定義**。
spec-lint はこのディレクトリのテンプレートから必須 frontmatter キーと必須節を導出する。
そのため書式変更はテンプレートを編集すれば lint が追従する（重複なし）。
配置の原則（単一親、ID 文法、EARS、同値分割クラスなど）は規約リーフ
`packages/develop-core/.apm/instructions/docs.instructions.md`（任意パッケージ。インストール済みコピーを使う）にあり、
その `paths:` で `docs/` 配下の作成者へ配送する。

| テンプレート | 生成先（利用プロジェクト） | 作成者 |
| --- | --- | --- |
| `00-vision.md` | `docs/00-vision.md` | spec-author（🙋 人間ゲート → `frozen`） |
| `01-glossary.md` | `docs/01-glossary.md` | spec-author（🙋 → `living`） |
| `02-actors.md` | `docs/02-actors.md` | spec-author（🙋 → `living`） |
| `goals-backlog.md` | `docs/goals-backlog.md` | spec-author |
| `GOAL.md` | `docs/goals/GOAL-nn-<slug>/GOAL.md` | spec-author（🙋 → `active`） |
| `UC.md` | `docs/goals/GOAL-nn-<slug>/UC-nnn-<slug>/UC.md` | spec-author（🙋 → `active`）。`phase:` 行は orchestrator |
| `REQ.md` | `…/UC-nnn-<slug>/REQ-nnn.md` | spec-author（🙋 → `active`）。`## 検証方針` は test-author |
| `BR.md` | `docs/rules/BR-nnn.md` | spec-author（🙋 → `active`） |
| `NFR.md` | `docs/nfr/NFR-nnn.md` | spec-author（🙋 → `active`） |
| `contract.yaml` | `…/UC-nnn-<slug>/contract.yaml`（HTTP・非 HTTP 共通の境界形状） | spec-author（🤖 → orchestrator が `fixed`） |
| `components.yaml` | `docs/_shared/components.yaml` | orchestrator のみ（作成者は追加要求を報告） |
| `ADR.md` | `docs/adr/ADR-nnnn-<slug>.md` | orchestrator（develop skill の `references/adr.md`） |
| `verification-GLOBAL.md` | `docs/verification/GLOBAL.md` | test-author |
| `DEFERRED.md` | `docs/verification/DEFERRED.md`（任意） | orchestrator のみ。機械検査にできない reviewer 指摘の台帳 |
| `design.md` | `docs/design.md`（任意） | 人間（orchestrator が代筆してもよい） |
| `traceconfig.json` | 利用プロジェクト直下の `traceconfig.json` | orchestrator が一度ひな形を置き、利用プロジェクトが維持する（`commands` に自身の検査と契約アダプターを指定）。検査の範囲（none の宣言を含む）を決めるので、変更は 🙋 人間の承認（gate-hook が確認を求める。ADR-0057） |

UC ディレクトリ（`UC.md` + `REQ-*.md` + `contract.yaml`）が一つの垂直スライスの SSOT であり、
そこでの `ls` がスライスの範囲を定義する。列とキーの形はこのテンプレートが定め、
何を書かないかの判断は各作成者の専門技術に従う。

- ステータス語彙: docs ノードは `draft → active → withdrawn`（`active` は人間承認済み。
  単一文書は `active` の代わりに `frozen` / `living`）。契約は `draft → fixed`
  （`fixed` は spec-lint が正常で、reviewer を起動した場合は `阻止` がない状態）。作成者自身がステータスを進めてはならない。
- プレースホルダー（`GOAL-00` / `UC-000` / `REQ-000` / `BR-000` / `NFR-000` / `ADR-0000` / `ACT-00` /
  `KPI-00` / `YYYY-MM-DD` / `<...>`）は `draft` を離れる前に置換する（spec-lint が検証）。
- コメントに `optional` とある frontmatter 行は任意。それ以外のテンプレートのキーはすべて必須。
- 一 UC の二つ以上の操作で共有する形状は契約の最上位 `schemas:` に置いてよい
  （`$ref: "#/schemas/<Name>"`）。二つ以上の UC で共有する形状は `_shared/components.yaml` に置く。
  `errors: []` の操作は失敗経路がないと宣言し、spec-lint は失敗例を要求しない（`errors` の省略はこの宣言ではない）。
  失敗例は request が禁止するキーを持ってよい。
- 操作配下のキーは閉じた集合（spec-lint が権威: `transport` / `direction` / `owned` /
  `source` / `auth` / `summary` / `wire` / `entry` / `requires` / `request` / `response` / `errors` / `examples`。
  `errors` の項目は `code` / `when` / `wire` のみ）。操作レベルの `x-*` は拒否する。
  `errors` の順序が評価順序（R-1207）。`fixed` 契約には `errors[]` のコードごとに失敗例一つを置き、
  `tools/contract-run` がすべての例を利用プロジェクトの契約アダプターで実行する。
- 比較が記録されていない事後作成の ADR は `## 却下した選択肢` に
  `- **記録なし**: 当時の比較は記録されていない（移行時に付した記録）` をそのまま書く。
  spec-lint は受理する。選択肢の創作は禁止。
- 書き方の判断規則（禁止リスト、専門技術）はテンプレートに書かない。各作成者の agent 本文に置く。
- **生成する成果物とテンプレート内の案内は日本語で書く。** 出力契約で固定された見出しと frontmatter キー・列挙値は保持する。
