# CLAUDE.md — harness 自体の開発ガイド

このリポジトリは、プロバイダーに依存しない agent の skill、agent、instruction のソースであり、独立して選択できる APM パッケージとして配布する。正本は `packages/`、実行可能な資産は `tools/`、文書形式は `templates/` にある。`.claude/` は `.agents/`、`.codex/`、`.cursor/`、`.grok/` と同じく生成物。

思想とパッケージ選択は [`README.md`](./README.md)、APM の契約、移行、検証は [`docs/apm.md`](./docs/apm.md) を読む。このファイルは harness 自体を変更するときの作業指針。

> **言語方針。** `packages/` 配下のプロンプト正本、ツールの README、テンプレート内のガイダンスコメントは**日本語**で書く。**ユーザーとの会話は日本語**。`docs/` 配下の成果物（vision、UC、REQ、BR、ADR など）、コミットメッセージ、コード内コメントも**日本語**。テンプレートの日本語見出しと frontmatter のキーは維持する。`README.md` と `docs/apm.md` も日本語。

## 0. 不変条件

- **常駐ゼロを破らない。** 常駐するルール索引、`AGENTS.md` / `CLAUDE.md` 内のルーター、`settings.json` への自動注入を追加しない（`gate-hook` / `stop-gate` などの hook はホストが明示的に有効化する）。導出できる文書台帳をコミットしない（`trace-check --index` が必要時に索引を生成する。`docs/verification/DEFERRED.md` は唯一コミットする台帳であり、どのソースからも再生成できない、反例付きの reviewer 指摘を保持する）。APM で可能だからという理由だけで、インストール済み instruction 全体を基底文書にコンパイルしない。
- **生成済みのプロバイダー向けディレクトリを手で編集しない。** `.claude/`、`.agents/`、`.codex/`、`.cursor/`、`.grok/` は出力。`packages/` または `tools/` を変更して再生成する。ルートの `AGENTS.md` / `CLAUDE.md` はこのリポジトリの作業用入口であり、生成されたルールルーターではない。
- **あるプロバイダーの出力を、別のプロバイダーの正本にしない。** アダプターは一時的な中間ファイルを使ってよいが、入力は選択した中立パッケージに由来しなければならない。
- **既定で全部をインストールしない。** ルートの全部入り APM パッケージは存在しない。開発と各フレームワークは独立して選択できる状態を保つ。
- **ホスト固有の事実をここに追加しない。** 共有 harness は汎用的な手順と規則を持つ。案件のスタック、アドレス、コマンド、例外はそのホストの `AGENTS.md` または `CLAUDE.md` に書く。
- **知識を重複させない。** 文書形式の正本は `templates/` の一か所に置き、spec-lint が必須項目をそこから導出する。作業技法は agent 本文に置く。ただし、入力が orchestrator 自身の判断だけで、自身が実行する副作用（commit、ADR）のガードレールと書式、ルール末端ファイルの配送契約は、その skill の `references/*.md` に置く。プロンプトが持つのは到達状態、不変条件、入出力契約と、機械が検査せずモデルが自力で到達しない知識だけで、手順の順序・回数、機械が検査する事項の再説明、重複表、チェックリストは置かない（ADR-0044）。ファイル種別ごとの行数上限は `tools/apm/test_projection.py` が固定し、縮む方向にだけ動かす。コピーはしない。agent 本文を移したら元は削除する。
- **厳守事項と柔軟な事項を分ける。** 絶対に破れない事項（3 つの人間ゲート、producer ≠ judge、終端チェックリスト、閉じた語彙）は hook と lint で強制する。そこへ至る方法（順序、深さ、起動順序）は orchestrator が決め、skill に手順として書かない。手順を追加する前に機械チェックを追加する。agent は別コンテキストが必要な場合だけ追加する（隔離、並列性、独立性。「subagent に渡すと要約によって推論を捨てることになるか？」が該当するなら手元に戻す）。
- **実行可能な資産を APM パッケージの外に置く。** `tools/` と `templates/` は明示的に別途配置する資産であり、APM primitive ではない。

## 1. 基本規則

| 原則 | 意味 |
| --- | --- |
| 階層は抽象度を表す | 末端文書はその階層に適用し、深いディレクトリで特殊化する。軸は種類であり、プロジェクトではない。フレームワークとレイヤーの末端文書には、共通規則からの差分だけを置く。 |
| パッケージ選択は読み込みより先 | 必要な場面とスタックだけをインストールする。パッケージが存在しても、その本文全体を読み込む権限にはならない。 |
| 作ること ≠ 判定すること | producer と oracle / reviewer / attacker / judge は、別コンテキストの別 agent とする。producer は自分自身の判定を承認しない。 |
| skill がプロセスを駆動する | orchestrator が判断の中核、委譲、ゲート、状態遷移を所有する。実装やテストは書かない。自身が書くのは状態、`_shared`、`DEFERRED.md`、ADR、git。 |
| 参照は instruction → skill の一方向 | 末端文書は手順を参照してよい。skill が探索してよいのは配送メタデータとアドレスだけであり、instruction 本文を要約したり、その節番号や内容に依存したりしない。受け取る agent が末端文書を読む。 |

手順名は skill、agent、instruction の場面をまたいで安定させる。パッケージ境界は責務を変えずに配布を分ける。`attack` orchestrator は develop の agent と規則を共有し、重複させない。小さなスライスでの深さは develop orchestrator の判断であり、別 skill にはしない。

## 2. 配置場所

| 資産 | ソース | 読み込みトリガー |
| --- | --- | --- |
| instruction の末端文書 | `packages/<package>/.apm/instructions/*.instructions.md` | 対象ファイルのアドレスが中立の `applyTo` メタデータに一致したとき、受け取る producer が必要時に読む。 |
| 手順 | `packages/<package>/.apm/skills/<name>/SKILL.md` | 明示的な呼び出し、または skill の説明。標準の Agent Skills ディレクトリ構成を保つ。 |
| 専門 agent | `packages/<package>/.apm/agents/**/*.agent.md` | orchestrator が専門担当を起動する。 |
| 文書のひな形 | `templates/<procedure>/` | producer が必要な形式を読む。 |
| 実行可能な資産 / プロバイダー向けアダプター | `tools/<name>/` | 明示的な呼び出し。 |
| パッケージ manifest | `packages/<package>/apm.yml` | APM が選択したパッケージを解決する。 |

`.apm/` を、APM が探索できない独自の構成に平坦化しない。manifest フィールドや primitive メタデータを変更する前に公式スキーマを確認する。検証済みのバージョンと出典は `docs/apm.md` を参照する。

## 3. 拡張チェックリスト

### instruction の追加

1. 最初にインストール境界を選ぶ。フレームワークの末端文書は選択された専用パッケージだけに置く: `rules-next`、`rules-cloudflare-hono-react`、`rules-crow`、`rules-expo`、`rules-swiftui`。`develop-core` に置くのは文書やコメントなど、プラットフォームに依存しない関心事だけ。
2. **末端文書 1 つにつき関心事 1 つ**を保つ。instruction のファイル名で場面 / プラットフォーム / フレームワーク / レイヤーの特殊化を保つ。APM 0.30.0 は `.apm/instructions/` 直下の instruction ファイルを探索する。共通規則をレイヤー別の末端文書へ転記しない。
3. **`applyTo` を中立の配送契約として宣言する。** YAML 配列ではなくカンマ区切りの文字列を使う。想定する受け手が書くファイルを正確に列挙する: テスト設計者にはテストのアドレス、DB 設計者にはネイティブスキーマのアドレス、実装担当者には本番コードのアドレス。広い glob が有効なのは、一致するすべてのアドレスに適用する規則だけ。狭すぎる glob は黙って配送を止める。
4. Claude の `paths:` はアダプターが出力するものであり、ソース構文ではない。他のプロバイダーにも同等のネイティブな遅延読み込み機能があるとは仮定しない。instruction はインストール済み APM パッケージに残り、呼び出し時に探索して読める。
5. 本文の相互参照に配送効果はない。委譲先のアドレスを `applyTo` に宣言する。アドレスと末端文書の対応ガイドは該当する末端文書に置き、常駐索引や skill 本文には置かない。
6. パッケージを単独で検証し、新しい消費プロジェクトに無関係なパッケージが現れないことを確認する。

```yaml
---
description: 選択したソースアドレスに適用する規則
applyTo: "**/crow3_*/app/classes/**"
---
```

### 手順の追加

1. 用途に対して独立した APM パッケージを選ぶか追加する。既存のすべてのパッケージへの依存を追加しない。
2. `.apm/skills/<key>/SKILL.md` には、到達状態、オーケストレーションの不変条件、完了の定義だけを置く。既定フローや手順は書かない。orchestrator 自身のガードレールと書式（commit、ADR）、配送契約は同じ skill ディレクトリの `references/*.md` に置き（APM はフォルダー全体をインストールし、旧アダプターは各ファイルを投影する）、`SKILL.md` に読み込みトリガーを明記する。行数上限は `tools/apm/test_projection.py` が固定する。
3. `.apm/agents/<key>/*.agent.md` に agent を追加するのは、別コンテキストが必要な場合だけ（隔離、並列性、「実装を決して読まない」などの独立性）。producer と judge の独立性を保つ。入力が orchestrator 自身の要約である役割は、agent ではなく手順にする。
4. 適用する型と規則は `.apm/instructions/<scene>-<concern>.instructions.md` に置く。
5. 参照は中立パッケージのソース、または `apm_modules/` の選択されたパッケージから解決し、`.claude/` の存在を要求しない。実行可能な資産とテンプレートは、別途配置されたルートから解決する。

### agent のモデルと能力

安定した agent 名と、明示的な入力 / 作業技法 / 出力契約を使う。oracle は既定で読み取り専用とし、同意を確認するのではなく欠陥を明らかにする。各中立 agent は `x-model-tier: top | mid | light` を正確に 1 つ宣言する。この frontmatter フィールドが割り当ての唯一の正本。プロバイダーのモデルファミリーやバージョン付きカタログ ID を含めてはならない（ADR-0028）。

プロバイダー向けアダプターは agent 名ではなく tier をマッピングする。Claude のファミリーマッピングは `tools/apm/claude-models.json`、Codex のカタログ ID と reasoning effort は `tools/codex-sync/models.json` だけに置く（ADR-0029）。ネイティブ APM は拡張を保持しても強制しない場合があるため、orchestrator がソースの tier を読み、対応している場合は起動時に適用する。プロバイダーが tier に従えない場合は、動作確認済みと主張せず制限を報告する。

## 4. 作業フロー

1. 変更する中立ソースを特定する: パッケージ manifest / instruction / skill / agent、`tools/`、`templates/`、またはリポジトリの作業指針。
2. ファイルを移す前にパッケージ境界と重複を確認する。形式変更では現在の APM 構成を確認する。
3. ソースを編集する。参照、言語、指示、プロセスのゲートの意味を見直す。
4. パッケージを検証し、`docs/apm.md` のコマンドで選択したプロバイダー向け出力を再生成する。同じ消費プロジェクトで APM 管理の出力と旧 `init.sh` の出力を混ぜない。
5. 変更に持続的な設計判断が含まれる場合は、`packages/develop-core/.apm/skills/develop/references/adr.md` に従い、自分で `docs/adr/ADR-nnnn-<slug>.md` に ADR を記録する。形式は `templates/develop/ADR.md`。`node tools/trace-check/trace-check.mjs --next adr` で番号を予約し、ディレクトリ一覧から次の ID を推測しない。`spec-lint validate` が結果を検証し、`trace-check --only C12` が衝突を検出する。
6. `packages/develop-core/.apm/skills/develop/references/commit.md` に従って自分でコミットする。subagent の Task が実行中の間はコミットしない。リリースが適切な場合は破壊的変更と移行手順を説明し、旧 submodule のホストが自動移行するかのように書かない。

## 5. 検証の重点

| 変更 | 最低限の確認 |
| --- | --- |
| manifest / パッケージ境界 | APM がパッケージを認識する。新規インストールに選択した依存だけが入り、tools / templates が同梱されない。 |
| instruction | 有効な `applyTo`、関心事 1 つ、想定する書き手のアドレス、Claude 出力の `paths` が glob の意味を失わないこと。 |
| skill | 呼び出しが動作する。行数上限内（`test_projection.py`）。オーケストレーションと実装を分離したままにする。ゲートと `active` / `fixed` / `phase` の遷移は orchestrator が保持する。参照が `.claude/` なしで動作する。`references/*.md` が全プロバイダーの出力にあり、それ自体には frontmatter を持たない。 |
| agent | producer / judge が独立している。明示的な契約、有効な `x-model-tier`、正しい対象変換とモデル方針。develop の構成は、別コンテキストが正当化された 5 役に留める（`tools/apm/test_projection.py` が tier の集合を固定する）。 |
| アダプター | 選択した中立入力のみ。生成マーカーと所有権チェック。管理外ファイルを上書きしない。再生成が安定している。遅延読み込みのない対象にルールを常駐させない。 |
| テンプレート / spec-lint | 必須形式はテンプレートから導出する。閉じた語彙（`status`、`phase`、`pattern`、`transport`、`direction`、operation の 13 キーと `errors[]` の各項目の 3 キー、`DEFERRED.md` の行文法）を、実行可能な lint の正本として維持する。`fixed` 契約にはエラーコードごとに失敗例を 1 つ置く。baseline は持たず、違反はすべて失敗にする（ADR-0056）。判断を含まない変換の注記を保つ。`gate` は monorepo のコミットの UC を、その `scope` が示す unit（`git.units`）の文書内で解決し、scope が unit でない `UC:` trailer を失敗にする。読むのは unit の対応表だけで、`git.units` の形式は git-lint が担当する。 |
| trace-check | トレーサビリティのみ: C1–C25（C15 = 人間向けの active な各 UC が `tests.system` に `@scenario UC-nnn` テストを持ち、シナリオテストはすべて `@scenario` を持つ。C16–C18 = 文書が参照する BR・REQ・アクター・KPI の実在と、UC の表と REQ の 1 対 1。C19 = `source.unit_dirs` の実現単位が `@implements` を持つ。C20 = active な NFR がテストか `measured_by` を持つ。C21 = 境界の入口と契約の操作が `@operation` で双方向に対応する。C22–C25 = REQ から辿れる BR、注釈のある DB 制約、使われる共有エラーコード、コードにある用語集の識別子）。紐づきに例外を作らない（ADR-0056）: baseline、コードに書く例外の印、黙った省略を持たず、撤回済みの仕様への参照も違反にする。紐づきの宣言は省略を設定エラーにし、対象が無い範囲は `{ "none": "<理由>" }` で宣言させてレポートに出す。形式検証を重複させない。`--only` と `--next` の予約を保つ。 |
| contract-run | 契約例を実行する経路は `traceconfig.json` の `commands.contract_adapter` だけ。実行する実例があるのにアダプターが無ければ失敗にし、`skip` 応答も失敗に数える（ADR-0056）。baseline ファイルは置かない。 |
| gate-hook / stop-gate | ホスト設定で明示的に有効化し、自動注入しない。PreToolUse は `UC.md` から phase を読む。Stop は traceconfig だけから（推測せずに。traceconfig が無ければ失敗）spec-lint → trace-check → contract-run → `commands.typecheck` / `lint` / `test` → `commands.system`（シナリオスイート。`test` が Green になった後に最後に実行）の順で動かす。ツリーが変わらなければ省略し、`stop_hook_active` の場合は `--max-rounds` で解除する。両方とも拒否ログに追記する。文書、harness の資産、`.harness-gate/` の書き込みは許可し、`traceconfig.json` の書き込みは人間の承認を求める（ADR-0057）。 |
| git-lint | 判断不要の事項だけを決める: ブランチ名の形式、prefix、topic、コミットヘッダーの `type`、末尾のピリオド、monorepo の `scope`。`traceconfig.json` が `git` を宣言した場所だけで実行する。未宣言のホストと除外ブランチは「未検査」と報告し、合格とはしない。`type` の一覧は `commit.md` の表と一致させる（テストで固定）。baseline はなく、パスや差分の規則も持たない。 |
| インストール / 文書 | コマンドが実際の help と一致する。新規インストールと既存ホストの移行を区別する。APM と旧方式の所有権が重ならない。 |

品質の軸は、パッケージの隔離、参照の整合性、常駐ゼロ、プロセスの意味の維持。委譲やモデル選択を評価するとき、パッケージングの検証は実際のプロバイダーセッションの代わりにはならない。
