# APM パッケージの導入と移行

## 正本と確認した仕様

正本は `packages/`、実行アセットは `tools/` と入口の `bin/`、文書書式は `templates/` に置く。`.claude/`・`.agents/`・`.codex/`・`.cursor/`・`.grok/` は生成先であり、直接編集しない。全部入りの manifest は置かない。

2026-09-08 に **Microsoft APM CLI 0.30.0** と公式資料を確認した。公式サイトは更新されるため、APM 更新時は下記を再検証する。

| 契約 | 採用する形・根拠 |
| --- | --- |
| package anatomy | パッケージごとに `apm.yml` と `.apm/`。必須 identity は `name` と `version`。[公式 anatomy](https://microsoft.github.io/apm/concepts/package-anatomy/) |
| モノレポの選択 | `dependencies.apm` に `owner/repo/path` を指定し、必要なサブディレクトリだけを選ぶ。固定 ref は末尾の `#<ref>`。[manifest schema](https://microsoft.github.io/apm/reference/manifest-schema/) |
| primitives | `.apm/skills/<name>/SKILL.md`、`.apm/agents/**/*.agent.md`、`.apm/instructions/*.instructions.md`。対象は中立メタデータ `applyTo`（カンマ区切り文字列）。instructions は `.apm/instructions/` 直下だけを探索する。[instructions / agents](https://microsoft.github.io/apm/producer/author-primitives/instructions-and-agents/) |
| install | `--target` または消費側 `targets` で対象を明示する。複数は `--target claude,codex` のように 1 つのオプションにまとめる。[install CLI](https://microsoft.github.io/apm/reference/cli/install/) |
| 本文の相対参照 | skill 本文の Markdown link は APM の integrator が installed package への参照に変換する。Codex の agent TOML は変換しないため、agent 本文は相対リンクを持たない（ADR-0047 / ADR-0048）。[package-relative links](https://microsoft.github.io/apm/producer/package-relative-links/) |
| compile | 規約を対象向けの文脈ファイルへ構成する標準機能。常駐ゼロのため使わない。Codex compile は glob に一致するファイルがなくても root `AGENTS.md` へ本文を fallback し、常駐化する。[compile CLI](https://microsoft.github.io/apm/reference/cli/compile/) |
| provider 差異 | 対応する primitive と出力先は target ごとに異なり、同じ実行時能力を保証しない。[targets matrix](https://microsoft.github.io/apm/reference/targets-matrix/) |

## 新規消費プロジェクト

消費プロジェクトの `apm.yml` に、選ぶパッケージだけを書く。

```yaml
name: my-next-app
version: 1.0.0
targets: [codex]
dependencies:
  apm:
    - tsay-dev/harness/packages/develop-core
    - tsay-dev/harness/packages/rules-next
```

```bash
apm install
# CLI から依存を追加する場合
apm install --target codex tsay-dev/harness/packages/develop-core
apm install --target codex tsay-dev/harness/packages/rules-next
```

スタックは `rules-next` を `rules-cloudflare-hono-react`、`rules-righthub`、`rules-expo`、`rules-swiftui`、`rules-crow` に替える。各スタックの配置と規約はそのパッケージの葉が正本で、ここには再掲しない。

GitHub の例はこの構成が公開された版に対して有効。ref を固定するなら `tsay-dev/harness/packages/rules-next#<release-tag>` と書き、実在する公開タグに置き換える。依存を変えたら `apm.lock.yaml` と manifest の変更を保存し、CI では `apm install --frozen` を使う。更新は `apm update` で計画を確認して行う。

### 出力と常駐ゼロ

- skills はフォルダ単位（`SKILL.md` と同梱の `references/*.md`）で原則 `.agents/skills/` に共有配置され、target に必要な発見経路も生成される。agents の出力は Claude `.claude/agents/`、Codex `.codex/agents/`、Cursor `.cursor/agents/`、Grok Build `.grok/agents/`。配布名に package 名が付くことがあるため、短いファイル名を展開後の識別子だと決めつけない。
- Claude / Cursor では scoped instructions をそれぞれの形式へ展開し、書くファイルに合わせて自動で読み込まれる。Codex / Grok Build では install だけで root `AGENTS.md` は作られない。Codex では instructions は `apm_modules/` に残る。Grok Build では `.grok/rules/` にも展開されるが、Grok Build がこれをいつ読むかは確かめていない（ADR-0062）。どちらも、オーケストレーターが選択済み package の `applyTo` と書くパスを照合し、合う葉だけをパスで渡す（develop skill の `references/bundles.md`）。本文を常駐させるルーターは作らない。
- agent 本文は読む規約を名指しせず、相対リンクも持たない。規約の配送と `HARNESS_ROOT` はオーケストレーターの Task 入力が担う（ADR-0047 / ADR-0048）。

### モデル設定の差異

中立 agent ソースは provider 固有の `model:` を持たず、`x-model-tier: top | mid | light` を各 agent の frontmatter に 1 つ宣言する。Claude family の対応は `tools/apm/claude-models.json`、Codex catalog ID と reasoning effort は `tools/codex-sync/models.json` に置き、どちらにも agent 名を列挙しない（ADR-0028 / ADR-0029）。

APM は中立拡張の `x-model-tier` を provider の model field に変換しない。install 後は、オーケストレーターが `apm_modules/` の元 source から tier を読み、上の対応表に従って起動時に適用する（Claude では opus / sonnet / haiku、Codex では JSON の 3 段、Cursor では同段の family）。Grok Build は per-launch の model 指定がないため親を継承し、要求段を保証できなければその制約を報告する。

## tools / bin / templates を別途用意する

APM packages は tools / bin / templates を含まない。develop の検証と文書生成に必要なアセットは、消費プロジェクトの `.harness/` にこのリポジトリの別 checkout として用意し、版を固定する。spec-lint / trace-check / contract-run / gate-hook は `tools/_shared/`（厳格 YAML、frontmatter、glob の共有モジュール）を相対パスで読むため、個々のツールのディレクトリだけを取り出して配置せず、`tools/` をディレクトリごと（`_shared/` を含めて）置く。入口の `bin/harness.mjs` は `../tools/` を相対パスで読むので、`bin/` も同じ checkout のまま置く。入口は名前から同梱ツールを選んで引数をそのまま渡すだけで、ツールのファイルを直接呼んでも検査の結果は同じ（ADR-0063。対応は `bin/harness.mjs` の表が正本）。各手続きは `HARNESS_ROOT` をその絶対パスとして解決する（このリポジトリ自身では root）。

```bash
# <release-tag> を実在する、package と整合するタグに置き換える
# git clone --branch <release-tag> https://github.com/tsay-dev/harness.git .harness

node .harness/bin/harness.mjs                    # 使えるコマンドの一覧
node .harness/bin/harness.mjs lint config        # 設定（harness.config.json）の形。機械で確かめていない決めごとを一覧する
node .harness/bin/harness.mjs lint spec          # 仕様の文書の書式と状態の決まり
node .harness/bin/harness.mjs lint refs          # 仕様・コード・テストの ID の紐づき
node .harness/bin/harness.mjs lint entry         # テストの入口が、本番と同じ組み立てを呼んでいるか
node .harness/bin/harness.mjs lint coverage      # テストの実行の記録から、どのテストからも実行されなかったソースを洗い出す
node .harness/bin/harness.mjs lint git branch    # harness.config.json に git を宣言したホストのみ実行される
node .harness/bin/harness.mjs run cases          # 実行する実例があれば commands.contract_adapter が必要（未宣言は失敗）
node .harness/bin/harness.mjs verify --level fast  # 完了の判定（Stop フックと CI と同じ検査の並び。lint / fast / full）
node .harness/tools/gate-hook/gate-log.mjs --summary       # gate-hook / stop-gate の拒否ログ集計
```

- Stop hook の終端ゲート（`harness verify --hook`。`tools/gate-hook/stop-gate.mjs`）と PreToolUse の着手ゲート（`gate-hook.mjs`）は、ホストが `.claude/settings.local.json` に明示して設置する（`tools/gate-hook/README.md`）。
- ブランチ名とコミットメッセージの書式（`tools/git-lint`）は、ホストが `harness.config.json` に `git` を宣言すると有効になる。PR での強制は再利用ワークフロー `.github/workflows/spec-gate.yml` が担い（検査器は `harness_ref` の版を checkout して使い、`uses:` の ref と同じ値にする）、merge を止めるにはホストが既定ブランチの保護でそのジョブを必須チェックにする（`tools/git-lint/README.md`）。
- 同じ再利用ワークフローが、完了の判定（`harness verify`）も実行する。既定の level は `lint`（設定の形・仕様の書式・紐づき。読むだけ）。テストまで CI で実行するなら、`with:` に `level: fast`（シナリオテストまでなら `full`）と、依存を入れる `setup_command` を渡す（`tools/gate-hook/README.md`）。

## 旧方式からの移行

旧方式（`.claude` の symlink / submodule / copy、`init.sh` による互換展開）は廃止した（ADR-0062）。新方式へ上書きせず、次の順で移行する。削除した用途（翻訳、動画制作、メディア生成）に移行先はない（ADR-0046）。

1. 現在の導入方式、固定版、`.claude` が symlink か実体かを調べ、ホスト固有の skills / rules / settings と未保存の変更を退避する。
2. 必要な用途・スタックと target を決める。全体導入に相当する root 依存は作らない。
3. 新しい consumer または移行用 checkout で APM install を先に検証し、選択した packages だけが存在してホスト独自ファイルを上書きしないことを確認する。
4. 旧方式が所有する symlink・生成物・導入記録（`.harness-legacy.json` と、それが記録するファイル）を対象を確認してから外す。リンク先を再帰削除せず、`.harness` の gitlink を通常 clone で上書きしない。
5. APM の manifest / lock と別アセットを設置して install し、ホストの事実・検証コマンド・フックの参照先を新配置へ更新する。
6. 以後の更新は APM で行う。

## 設定ファイルの名前を変える（traceconfig.json → harness.config.json）

設定ファイルの名前は `harness.config.json` に変わった（ADR-0064）。`traceconfig.json` は読まれない。中身のキーは変わっていないので、名前を変えるだけで移れる。自動では移らない。

1. プロジェクトのルートと、monorepo なら設定を持つ unit のそれぞれで、`git mv traceconfig.json harness.config.json` を実行する。
2. プロジェクトの側で `traceconfig.json` を名指ししている場所を直す。フックの設定、CI のワークフロー、`CLAUDE.md` / `AGENTS.md`、変更されたファイルから unit を選ぶスクリプトなど。
3. `node .harness/bin/harness.mjs lint` を実行し、設定を読めていることを確かめる。
4. gate-hook の拒否ログの理由 `traceconfig` は `config` に変わった。古いログを集計している場合は、名前を読み替える。

古い名前のファイルだけが残っていると、完了の判定と CI が、改名したことを添えて失敗する。

## REQ を UC の文書へ移す（REQ-nnn.md → UC.md の「要件」の節）

REQ は、`UC.md` の「要件」の節に小節として書く形に変わった（ADR-0067）。`REQ-nnn.md` が残っていると、spec-lint と trace-check が失敗する。意味を変えずに移すスクリプトがある。自動では移らない。

1. 文書を持つディレクトリ（monorepo では unit ごと）で、`node .harness/bin/harness.mjs migrate reqs` を実行し、移せることを確かめる。移せないものがあれば、表示された理由を直す。
2. `node .harness/bin/harness.mjs migrate reqs --write` で書き換える。
3. 文書の中の `…/REQ-nnn.md` への参照（保留の一覧の対象など）を、`…/UC.md#REQ-nnn` に直す。
4. `node .harness/bin/harness.mjs lint` を実行し、検査が通ることを確かめる。

## 契約の引用符の中のエスケープ

契約と共有語彙の YAML で、二重引用符の中のエスケープを YAML の決まりどおりに解くようにした。これまでは、ブロックの値ではバックスラッシュをそのまま残し、フロー記法の値ではバックスラッシュだけを落として読んでいた（`"a\nb"` が「a\nb」や「anb」になっていた）。

- 版を上げたら `harness lint spec` を実行する。二重引用符の中に知らないエスケープ（`"^\d+$"` の `\d` など）があれば違反として出る。単一引用符で囲むか、`\\d` と書き直す。
- 契約アダプターに、読み違えた値を書かれた値へ戻す対応表を持っていたら、外す（改行・タブ・NUL を含む例が、書いたとおりの値で届く）。
- **違反にならずに値が変わる書き方がある。** YAML が知っているエスケープを、正規表現のつもりで二重引用符の中に書いていた値は、黙って別の文字になる（`"\bfoo\b"` の `\b` は語の境界ではなく後退の文字、`"\P{L}"` の `\P` は段落区切り、`"a\x2eb"` は `a.b`）。`\0`・`\a`・`\e`・`\N`・`\_`・`\L` も同じ。二重引用符の中にバックスラッシュを持つ `pattern` は、単一引用符に書き直す。
- 二重引用符の中に `\\` を書いていた値は、バックスラッシュ 1 つとして読まれる。pattern の意味が変わっていないかを `harness run cases` で確かめる。

## 保留の一覧を凍結する（DEFERRED.md）

レビューの指摘を保留の一覧に書く運用をやめた（ADR-0068）。指摘は、機械検査にするか、そのスライスの中で人間に聞いて仕様に書く。

- `docs/verification/DEFERRED.md` を持つプロジェクトは、frontmatter に `frozen_at: YYYY-MM-DD`（版を上げた日）を足す。これが無いと spec-lint が失敗する。書き込み前の関門を有効にしていれば、この書き込みも人間の承認に回る（`frozen_at` の変更に当たるため）ので、許可する。その日より後の起票日の行を足しても失敗する。
- 残っている行は、そのままでよい。解消したら消す。残っている件数は、spec-lint が毎回 1 行で表示する。
- 一覧を持たないプロジェクトは、新しく作らない。
- 書き込み前の関門（`harness guard`）を有効にしていれば、一覧を新しく作る・`frozen_at` を変える・行を足す書き込みは、人間の承認に回る。

## 検証手順

リポジトリ直下で実行する。

```bash
python3 tools/apm/test_projection.py     # パッケージ境界、リンク到達性、参照方向、行数上限、モデルの対応表
node --test "tools/**/*.test.mjs" "bin/**/*.test.mjs" < /dev/null   # spec-lint / trace-check / gate-hook / stop-gate / contract-run / git-lint / config-lint / exec-check / 入口
node bin/harness.mjs lint                # lint config → lint spec → lint refs → lint entry → lint git branch
node bin/harness.mjs verify --level fast # 上の検査とテストを、完了の判定と同じ並びでまとめて実行する（harness 自身の設定に宣言したコマンド）
```

native APM install は別の fresh consumer で確認する。公開前はローカルパッケージを絶対パスで指定する。

```bash
apm install --target codex /absolute/path/to/harness/packages/develop-core
apm install --target codex /absolute/path/to/harness/packages/rules-next
```

確認する項目:

1. 各パッケージを単独で install でき、develop-core + rules-next の consumer にほかのスタックの葉が出ない。
2. installed package に tools / bin / templates が同梱されない。
3. Claude 出力の `paths` と Cursor 出力の `globs` が元の `applyTo` と同じ対象を表し、Cursor 出力が常駐指示にならない。
4. どの target の install も `.claude/settings.json` を作らない。Codex / Grok の install が root `AGENTS.md` や全文の rules router を生成しない。Grok Build の `.grok/rules/` が常に読まれる設定になっていない。
5. skill 本文のリンクが `apm_modules/` 内で解決し、`.claude/` がなくても到達できる。
6. agent の名前が重複せず、複数の `rules-*` を選んだときに同じ名前の規約が互いを上書きしていない。

各 provider 上での対話、委譲、モデル選択の実行確認は、ファイルの install と参照の検証とは別に、実際のセッションで行う。
