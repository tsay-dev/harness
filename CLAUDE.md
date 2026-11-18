# CLAUDE.md — harness 自体の開発ガイド

このリポジトリは、プロバイダーに依存しない agent の skill、agent、instruction のソースであり、独立して選択できる APM パッケージとして配布する。正本は `packages/`、実行可能な資産は `tools/` と入口の `bin/`、文書形式は `templates/` にある。`.claude/` は `.agents/`、`.codex/`、`.cursor/`、`.grok/` と同じく生成物。

思想とパッケージ選択は [`README.md`](./README.md)、APM の契約、移行、検証は [`docs/apm.md`](./docs/apm.md) を読む。このファイルは harness 自体を変更するときの作業指針。

> **言語方針。** `packages/` 配下のプロンプト正本、ツールの README、テンプレート内のガイダンスコメントは**日本語**で書く。**ユーザーとの会話は日本語**。`docs/` 配下の成果物（vision、UC、REQ、BR、ADR など）、コミットメッセージ、コード内コメントも**日本語**。テンプレートの日本語見出しと frontmatter のキーは維持する。`README.md` と `docs/apm.md` も日本語。
>
> **日本語の書き方。** 英語の直訳調の言葉を使わない（悪い例:「法的な意味を持つ文言」）。日本語として自然で、指す範囲がはっきりした言い方にする。抽象的な形容で済ませず、具体的に何を指すかを書く（良い例:「利用規約への同意文など、書いたとおりに表示したことが後で問われる文言」）。会話、文書、コミットメッセージのすべてに適用する。

## 0. 不変条件

- **常駐ゼロを破らない。** 常駐するルール索引、`AGENTS.md` / `CLAUDE.md` 内のルーター、`settings.json` への自動注入を追加しない（`guard` / `verify --hook` などの hook はホストが明示的に有効化する）。導出できる文書台帳をコミットしない（`harness index` が必要時に索引を生成する）。レビューの指摘を保留の一覧に書かない（ADR-0068。既存の `docs/verification/DEFERRED.md` は凍結済みで、凍結した日より後の行は lint spec が失敗にし、行を足す書き込みは guard が人間の承認に回す）。APM で可能だからという理由だけで、インストール済み instruction 全体を基底文書にコンパイルしない。
- **生成済みのプロバイダー向けディレクトリを手で編集しない。** `.claude/`、`.agents/`、`.codex/`、`.cursor/`、`.grok/` は出力。`packages/` または `tools/` を変更して再生成する。ルートの `AGENTS.md` / `CLAUDE.md` はこのリポジトリの作業用入口であり、生成されたルールルーターではない。
- **あるプロバイダーの出力を、別のプロバイダーの正本にしない。** 展開の入力は、選択した中立パッケージに由来しなければならない。
- **既定で全部をインストールしない。** ルートの全部入り APM パッケージは存在しない。開発と各フレームワークは独立して選択できる状態を保つ。
- **ホスト固有の事実をここに追加しない。** 共有 harness は汎用的な手順と規則を持つ。案件のスタック、アドレス、コマンド、決めごと、例外は、そのホストの側に書く。置き場はホストの `harness.config.json`（ADR-0064）と、ホストの `AGENTS.md` または `CLAUDE.md`。
- **知識を重複させない。** 文書形式の正本は `templates/` の一か所に置き、lint spec が必須項目をそこから導出する。作業技法は agent 本文に置く。ただし、入力が orchestrator 自身の判断だけで、自身が実行する副作用（commit、ADR）のガードレールと書式、ルール末端ファイルの配送契約は、その skill の `references/*.md` に置く。プロンプトが持つのは到達状態、不変条件、入出力契約と、機械が検査せずモデルが自力で到達しない知識だけで、手順の順序・回数、機械が検査する事項の再説明、重複表、チェックリストは置かない（ADR-0044）。ファイル種別ごとの行数上限は `tools/apm/test_projection.py` が固定し、縮む方向にだけ動かす。コピーはしない。agent 本文を移したら元は削除する。
- **厳守事項と柔軟な事項を分ける。** 絶対に破れない事項（3 つの人間ゲート、producer ≠ judge、終端チェックリスト、閉じた語彙）は hook と lint で強制する。そこへ至る方法（順序、深さ、起動順序）は orchestrator が決め、skill に手順として書かない。手順を追加する前に機械チェックを追加する。agent は別コンテキストが必要な場合だけ追加する（隔離、並列性、独立性。「subagent に渡すと要約によって推論を捨てることになるか？」が該当するなら手元に戻す）。
- **実行可能な資産を APM パッケージの外に置く。** `tools/`、`bin/`、`templates/` は明示的に別途配置する資産であり、APM primitive ではない。

## 1. 基本規則

| 原則 | 意味 |
| --- | --- |
| 階層は抽象度を表す | 末端文書はその階層に適用し、深いディレクトリで特殊化する。軸は種類であり、プロジェクトではない。フレームワークとレイヤーの末端文書には、共通規則からの差分だけを置く。 |
| パッケージ選択は読み込みより先 | 必要な場面とスタックだけをインストールする。パッケージが存在しても、その本文全体を読み込む権限にはならない。 |
| 作ること ≠ 判定すること | producer と oracle / reviewer / attacker / judge は、別コンテキストの別 agent とする。producer は自分自身の判定を承認しない。 |
| skill がプロセスを駆動する | orchestrator が判断の中核、委譲、ゲート、状態遷移を所有する。実装やテストは書かない。自身が書くのは状態、`_shared`、ADR、git（凍結済みの `DEFERRED.md` は、解消した行を消すだけ）。 |
| 参照は skill → agent の 1 本だけ | orchestrator は起動する agent の名前、mode、tier を知る。agent は読むべき規約を名指しせず、書くパスに対応して届いた末端文書に従う。`rules-*` の末端文書は skill も agent も知らず、そのパスに置くファイルの事実だけを持つ（ADR-0048）。skill が探索してよいのは配送メタデータとアドレスだけで、末端文書の本文を要約したり、節番号や内容に依存したりしない。 |

手順名は skill、agent、instruction の場面をまたいで安定させる。パッケージ境界は責務を変えずに配布を分ける。`attack` orchestrator は develop の agent と規則を共有し、重複させない。小さなスライスでの深さは develop orchestrator の判断であり、別 skill にはしない。

## 2. 配置場所

| 資産 | ソース | 読み込みトリガー |
| --- | --- | --- |
| instruction の末端文書 | `packages/<package>/.apm/instructions/*.instructions.md` | 対象ファイルのアドレスが中立の `applyTo` メタデータに一致したとき、受け取る producer が必要時に読む。 |
| 手順 | `packages/<package>/.apm/skills/<name>/SKILL.md` | 明示的な呼び出し、または skill の説明。標準の Agent Skills ディレクトリ構成を保つ。 |
| 専門 agent | `packages/<package>/.apm/agents/**/*.agent.md` | orchestrator が専門担当を起動する。 |
| 文書のひな形 | `templates/<procedure>/` | producer が必要な形式を読む。 |
| 実行可能な資産（コマンド 1 つに 1 つの置き場 `tools/<コマンド>/`、共有の処理 `tools/_shared/`）/ プロバイダーごとのモデルの対応表 | `tools/` | `harness <コマンド>`。 |
| 同梱ツールの入口 | `bin/harness.mjs` | `harness <コマンド>`。コマンドの語からファイルの場所を決めて引数を渡すだけで、検査の中身は持たない（ADR-0071）。 |
| パッケージ manifest | `packages/<package>/apm.yml` | APM が選択したパッケージを解決する。 |

`.apm/` を、APM が探索できない独自の構成に平坦化しない。manifest フィールドや primitive メタデータを変更する前に公式スキーマを確認する。検証済みのバージョンと出典は `docs/apm.md` を参照する。

## 3. 拡張チェックリスト

### instruction の追加

1. 最初にインストール境界を選ぶ。フレームワークの末端文書は選択された専用パッケージだけに置く: `rules-next`、`rules-cloudflare-hono-react`、`rules-righthub`、`rules-crow`、`rules-expo`、`rules-swiftui`。複数のスタックに同じ末端文書が要るときは、写さずに共通のパッケージ（例: `rules-hono-react-spa`）へ出し、スタックのパッケージの `apm.yml` から同じリポジトリの相対パス（`../<パッケージ>`）で依存させる（利用プロジェクトの選び方は変わらない）。`develop-core` に置くのは文書やコメントなど、プラットフォームに依存しない関心事だけ。
2. **末端文書 1 つにつき関心事 1 つ**を保つ。instruction のファイル名で場面 / プラットフォーム / フレームワーク / レイヤーの特殊化を保つ。APM 0.30.0 は `.apm/instructions/` 直下の instruction ファイルを探索する。共通規則をレイヤー別の末端文書へ転記しない。
3. **`applyTo` を中立の配送契約として宣言する。** YAML 配列ではなくカンマ区切りの文字列を使う。想定する受け手が書くファイルを正確に列挙する: テスト設計者にはテストのアドレス、DB 設計者にはネイティブスキーマのアドレス、実装担当者には本番コードのアドレス。広い glob が有効なのは、一致するすべてのアドレスに適用する規則だけ。狭すぎる glob は黙って配送を止める。
4. Claude の `paths:` は APM が展開時に出力するものであり、ソース構文ではない。他のプロバイダーにも同等のネイティブな遅延読み込み機能があるとは仮定しない。instruction はインストール済み APM パッケージに残り、呼び出し時に探索して読める。
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
2. `.apm/skills/<key>/SKILL.md` には、到達状態、オーケストレーションの不変条件、完了の定義だけを置く。既定フローや手順は書かない。orchestrator 自身のガードレールと書式（commit、ADR）、配送契約は同じ skill ディレクトリの `references/*.md` に置き（APM はフォルダー全体をインストールする）、`SKILL.md` に読み込みトリガーを明記する。行数上限は `tools/apm/test_projection.py` が固定する。
3. `.apm/agents/<key>/*.agent.md` に agent を追加するのは、別コンテキストが必要な場合だけ（隔離、並列性、「実装を決して読まない」などの独立性）。producer と judge の独立性を保つ。入力が orchestrator 自身の要約である役割は、agent ではなく手順にする。
4. 適用する型と規則は `.apm/instructions/<scene>-<concern>.instructions.md` に置く。
5. 参照は中立パッケージのソース、または `apm_modules/` の選択されたパッケージから解決し、`.claude/` の存在を要求しない。実行可能な資産とテンプレートは、別途配置されたルートから解決する。

### agent のモデルと能力

安定した agent 名と、明示的な入力 / 作業技法 / 出力契約を使う。oracle は既定で読み取り専用とし、同意を確認するのではなく欠陥を明らかにする。各中立 agent は `x-model-tier: top | mid | light` を正確に 1 つ宣言する。この frontmatter フィールドが割り当ての唯一の正本。プロバイダーのモデルファミリーやバージョン付きカタログ ID を含めてはならない（ADR-0028）。

プロバイダーごとのモデルの対応表は、agent 名ではなく tier から引く。Claude のファミリーマッピングは `tools/apm/claude-models.json`、Codex のカタログ ID と reasoning effort は `tools/codex-sync/models.json` だけに置く（ADR-0029）。APM は `x-model-tier` をプロバイダーのモデル指定に変換しないので、orchestrator がソースの tier を読み、対応表に従って起動時に適用する。プロバイダーが tier に従えない場合は、動作確認済みと主張せず制限を報告する。

## 4. 作業フロー

1. 変更する中立ソースを特定する: パッケージ manifest / instruction / skill / agent、`tools/`、`templates/`、またはリポジトリの作業指針。
2. ファイルを移す前にパッケージ境界と重複を確認する。形式変更では現在の APM 構成を確認する。
3. ソースを編集する。参照、言語、指示、プロセスのゲートの意味を見直す。
4. パッケージを検証する（`docs/apm.md` の検証手順）。プロバイダー向けの出力は、消費プロジェクトで `apm install` をやり直して再生成する。展開の経路は APM だけ（ADR-0062）。
5. 変更に持続的な設計判断が含まれる場合は、`packages/develop-core/.apm/skills/develop/references/adr.md` に従い、自分で `docs/adr/ADR-nnnn-<slug>.md` に ADR を記録する。形式は `templates/develop/ADR.md`。`node bin/harness.mjs next-id adr` で番号を予約し、ディレクトリ一覧から次の ID を推測しない。`harness lint spec` が結果を検証し、`harness lint refs --only C12` が衝突を検出する。
6. `packages/develop-core/.apm/skills/develop/references/commit.md` に従って自分でコミットする。subagent の Task が実行中の間はコミットしない。リリースが適切な場合は破壊的変更と移行手順を説明し、旧 submodule のホストが自動移行するかのように書かない。

## 5. 検証の重点

| 変更 | 最低限の確認 |
| --- | --- |
| manifest / パッケージ境界 | APM がパッケージを認識する。新規インストールに選択した依存だけが入り、tools / bin / templates が同梱されない。 |
| instruction | 有効な `applyTo`、関心事 1 つ、想定する書き手のアドレス、Claude 出力の `paths` が glob の意味を失わないこと。 |
| skill | 呼び出しが動作する。行数上限内（`test_projection.py`）。オーケストレーションと実装を分離したままにする。ゲートと `active` / `fixed` / `phase` の遷移は orchestrator が保持する。参照が `.claude/` なしで動作する。`references/*.md` が全プロバイダーの出力にあり、それ自体には frontmatter を持たない。 |
| agent | producer / judge が独立している。明示的な契約、有効な `x-model-tier`、モデルの段は `x-model-tier` だけで宣言し、プロバイダーのモデル名を書かない。develop の構成は、別コンテキストが正当化された 5 役に留める（`tools/apm/test_projection.py` が tier の集合を固定する）。 |
| プロバイダー向けの展開 | 展開は APM だけで行う（ADR-0062）。モデルの対応表は tier の 3 段だけを持ち、agent 名を持たない（`tools/apm/test_projection.py`）。APM の出力（Claude の `paths` と Cursor の `globs` が `applyTo` と同じ対象を表すこと、選択外のパッケージが出ないこと、遅延読み込みのない対象にルールが常駐しないこと）は機械で検査していない。パッケージの構成や `applyTo` の書き方を変えたら、新しい consumer で `docs/apm.md` の確認項目を手で確かめる。 |
| テンプレート / lint spec / lint git uc | 必須形式はテンプレートから導出する。閉じた語彙（`status`、`phase`、`pattern`、`transport`、`direction`、operation の 13 キーと `errors[]` の各項目の 3 キー、凍結済みの `DEFERRED.md` の行文法と `frozen_at`）を、実行可能な lint の正本として維持する。`fixed` 契約にはエラーコードごとに失敗例を 1 つ置く。baseline は持たず、違反はすべて失敗にする（ADR-0056）。`harness convert` は、判断を含まない変換の注記を保つ。`harness lint git uc` は monorepo のコミットの UC を、その `scope` が示す unit（`git.units`）の文書内で解決し、scope が unit でない `UC:` trailer を失敗にする。読むのは unit の対応表だけで、`git.units` の形式は lint git branch と lint git message が担当する。 |
| REQ の置き場 | REQ は `UC.md` の「要件」の節に、1 ID を 1 つの小節（`### REQ-nnn`）として書く（ADR-0067）。読み方は `tools/_shared/reqs.mjs` の 1 か所に置き、lint spec・lint refs・guard はそこから組み立てた REQ の文書を検査する。`REQ-nnn.md` が残っていれば違反にする。移すのは `harness migrate reqs`（`tools/migrate-reqs/README.md`）。 |
| lint refs / next-id / index | lint refs はトレーサビリティのみ: C1–C26（C5・C14・C19・C21・C23・C27 は欠番で、番号は詰めない）。各検査の意味、義務表、注釈の窓の規則は `tools/lint-refs/README.md` が正本で、ここに再掲しない。読む注釈は、テストの `@covers`（REQ のクラス、NFR、BR）とシナリオテストの `@scenario` だけ。実装とスキーマのコードの注釈は読まず、読む検査を足さない（ADR-0070。実装との対応は lint entry・lint coverage・lint entries が実行で確かめる）。宣言キーは最上位の `covers_pattern` / `id_patterns` / `scenario_pattern` / `nfr_pattern` / `br_pattern` / `comment_pattern`、`docs`、`source`、`tests`、`tests.system`、`schema`、`contract`。廃止したキーは `tools/_shared/config.mjs` の一覧に足し、残っていれば案内を付けて失敗にする（黙って読み飛ばさない）。紐づきに例外を作らない（ADR-0056）: baseline、コードに書く例外の印、黙った省略を持たず、撤回済みの仕様への参照も違反にする。宣言の省略は設定エラーにし、`{ "none": "<理由>" }` は義務が無い間だけ通す。active な REQ と `source` があれば、lint coverage が読む `coverage` も none・省略にできず、記録のファイル（`report`）を指していない形も違反にする（C26）。形式検証を重複させない。`--only`（部分検査）を保つ。採番（`harness next-id`。予約つき）と索引（`harness index`）は、検査と同じ読み方（`tools/_shared/refs.mjs`）を使う。 |
| run cases | 契約例を実行する経路は `harness.config.json` の `commands.contract_adapter` だけ。実行する実例があるのにアダプターが無ければ失敗にし、`skip` 応答も失敗に数える（ADR-0056）。baseline ファイルは置かない。 |
| guard / verify | フック（`harness guard`、`harness verify --hook`）は、ホスト設定で明示的に有効化し、自動注入しない。PreToolUse は `UC.md` から phase を読む。`.harness-gate/` の書き込みを阻止し、`harness.config.json`・`.harness/`・hook の設定・`.github/workflows/` の書き込みと、docs の status の降格、`UC.md` の `active` と契約の `fixed` への昇格、凍結済みの保留の一覧を広げる書き込み（新規作成、`frozen_at` の変更、行の追加。ADR-0068）に人間の承認を求める（ADR-0057）。Stop フックと `harness verify`（CI・手元）は、同じ検査の並び（`tools/_shared/suite.mjs` が正本）を実行する: harness.config.json だけから（推測せずに。無ければ失敗）lint config → lint spec → lint refs → lint entry → `commands.list_entries` → lint entries → run cases → `commands.typecheck` / `lint` / `test` → lint coverage → `commands.extra` → `commands.system`。どこまで実行するかは `--level`（lint / fast / full）で選び、実行しなかった検査は skip として表示する。`commands` の 4 キーは宣言か理由付きの none を必須にする。monorepo は unit ごとに、unit の `commands` を unit のディレクトリで実行する。制限時間を過ぎたコマンドはプロセスグループごと止める（ADR-0065）。ツリー（未追跡ファイル、harness.config.json、検査の並びが使うコマンドのファイルと共有の処理を含む）が変わらなければ省略し、`stop_hook_active` の場合は `--max-rounds` で解除して利用者に表示する。判定中の例外は fail-closed。両方とも拒否ログに追記する。 |
| lint git branch / lint git message | 判断不要の事項だけを決める: ブランチ名の形式、prefix、topic、コミットヘッダーの `type`、末尾のピリオド、monorepo の `scope`。`harness.config.json` が `git` を宣言した場所だけで実行する。未宣言のホストと除外ブランチは「未検査」と報告し、合格とはしない。`type` の一覧は `commit.md` の表と一致させる（テストで固定）。baseline はなく、パスや差分の規則も持たない。 |
| lint config | 設定（`harness.config.json`）の形だけを検査する: 最上位のキーの名前、`rules` / `conventions` / `exceptions` の形、unit の場所、廃止したキーが残っていないこと、monorepo のルートに unit にしか効かない宣言が無いこと（K1〜K7。`tools/lint-config/README.md` が正本）。使えるキーはひな形から導く。ひな形に値を置けない任意のキーだけ、`tools/_shared/config.mjs` に一覧を持つ。値が正しいかは、その値を読むコマンドが検査する。古い名前（`traceconfig.json`）は読まない（ADR-0064）。 |
| lint entry / lint coverage / lint entries | 3 つとも、ファイルと記録を読むだけで、テストもコマンドも実行しない（実行するのは検査の並び `tools/_shared/suite.mjs`）。`lint entry` はテストの入口が本番の組み立ての名前を含むこと、`lint coverage` は範囲に入るソースが記録に載り、1 行も実行されなかったファイルと、1 回も呼ばれなかった名前のある関数が無いこと、`lint entries` はアプリが出した入口の一覧と fixed の契約の inbound の操作が双方向に合うことを確かめる（fixed でない契約の操作は、入口の突き合わせ先に数えない）（X1・X2・V1〜V7・E1・E2・E4。E3 は欠番。`tools/lint-entry/README.md`・`tools/lint-coverage/README.md`・`tools/lint-entries/README.md` が正本）。割合のしきい値は持たない。記録の形式は lcov。実行されないことを認めるファイルと関数は `coverage.not_run` に理由と一緒に書かせ、実行されるようになったら違反にする。入口と操作の突き合わせは文字の完全一致で、harness はパスを解釈しない（`:id` と `{id}` を同じとみなす、`*` を特別に扱う、といった読み方を足さない。枠組みの書き方から契約の文字へ直すのは、プロジェクトの `commands.list_entries` の役目）。契約の外の入口を認める手段は作らない（入口はすべて契約の操作として書かせる。ADR-0066 / ADR-0070）。 |
| 入口（`bin/harness.mjs`）とコマンドの名前 | コマンドの名前と、同梱ツールのファイルの名前は 1 つ（ADR-0071）。入口は名前とファイルの対応表を持たず、コマンドの語を `-` でつないだものを置き場とファイルの名前にする（`harness lint git branch` → `tools/lint-git-branch/lint-git-branch.mjs`。決め方は `tools/_shared/command-file.mjs`）。コマンドを足すときは、入口の一覧（語、分類、1 行の説明）に 1 行足し、決まった場所にファイルと `README.md` と `test/` を置く。2 つ以上のコマンドが使う処理は `tools/_shared/` に置く。入口に検査や引数の解釈を書かない。コマンドでない置き場（`tools/apm`、`tools/codex-sync`）は、理由と一緒に `bin/test/harness.test.mjs` の一覧に書く。古い呼び名（改名の対応は ADR-0071 の表）を文書やコードに書かない（`bin/test/names.test.mjs` が、残っていれば失敗にする）。テストは `node --test tools/*/test/*.test.mjs bin/test/*.test.mjs`。 |
| インストール / 文書 | コマンドが実際の help と一致する。新規インストールと既存ホストの移行を区別する。旧方式の利用プロジェクトは `docs/apm.md` の移行手順で APM へ移る（ADR-0062）。 |

品質の軸は、パッケージの隔離、参照の整合性、常駐ゼロ、プロセスの意味の維持。委譲やモデル選択を評価するとき、パッケージングの検証は実際のプロバイダーセッションの代わりにはならない。
