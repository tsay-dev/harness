# APM パッケージの導入と移行

## 正本と確認した仕様

正本は `packages/`、実行アセットは `tools/`、文書書式は `templates/` に置く。`.claude/`・`.agents/`・`.codex/`・`.cursor/`・`.grok/` は生成先であり、直接編集しない。全部入りの manifest は置かない。

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

スタックは `rules-next` を `rules-cloudflare-hono-react`、`rules-expo`、`rules-swiftui`、`rules-crow` に替える。各スタックの配置と規約はそのパッケージの葉が正本で、ここには再掲しない。

GitHub の例はこの構成が公開された版に対して有効。ref を固定するなら `tsay-dev/harness/packages/rules-next#<release-tag>` と書き、実在する公開タグに置き換える。依存を変えたら `apm.lock.yaml` と manifest の変更を保存し、CI では `apm install --frozen` を使う。更新は `apm update` で計画を確認して行う。

### 出力と常駐ゼロ

- skills はフォルダ単位（`SKILL.md` と同梱の `references/*.md`）で原則 `.agents/skills/` に共有配置され、target に必要な発見経路も生成される。agents の出力は Claude `.claude/agents/`、Codex `.codex/agents/`、Cursor `.cursor/agents/`、Grok Build `.grok/agents/`。配布名に package 名が付くことがあるため、短いファイル名を展開後の識別子だと決めつけない。
- Claude / Cursor では scoped instructions をそれぞれの形式へ展開し、書くファイルに合わせて自動で読み込まれる。Codex / Grok Build では install だけで root `AGENTS.md` は作られず、instructions は `apm_modules/` に残る。オーケストレーターが選択済み package の `applyTo` と書くパスを照合し、合う葉だけをパスで渡す（develop skill の `references/bundles.md`）。本文を常駐させるルーターは作らない。
- agent 本文は読む規約を名指しせず、相対リンクも持たない。規約の配送と `HARNESS_ROOT` はオーケストレーターの Task 入力が担う（ADR-0047 / ADR-0048）。

### モデル設定の差異

中立 agent ソースは provider 固有の `model:` を持たず、`x-model-tier: top | mid | light` を各 agent の frontmatter に 1 つ宣言する。Claude family の対応は `tools/apm/claude-models.json`、Codex catalog ID と reasoning effort は `tools/codex-sync/models.json` に置き、どちらにも agent 名を列挙しない（ADR-0028 / ADR-0029）。

互換 adapter は tier を読み、Claude では opus / sonnet / haiku、Codex では JSON の 3 段へ変換する。Cursor は `inherit` に正規化し、オーケストレーターが起動時に同段の family を選ぶ。Grok Build は per-launch の model 指定がないため親を継承し、要求段を保証できなければその制約を報告する。APM の native integrator が中立拡張を provider の model field に変換するとは仮定せず、native install 後はオーケストレーターが `apm_modules/` の元 source から tier を読んで起動時に適用する。

## tools / templates を別途用意する

APM packages は tools / templates を含まない。develop の検証と文書生成に必要なアセットは、消費プロジェクトの `.harness/` にこのリポジトリの別 checkout として用意し、版を固定する。各手続きは `HARNESS_ROOT` をその絶対パスとして解決する（このリポジトリ自身では root）。この checkout の `init.sh` は APM consumer に実行しない。

```bash
# <release-tag> を実在する、package と整合するタグに置き換える
# git clone --branch <release-tag> https://github.com/tsay-dev/harness.git .harness

node .harness/tools/spec-lint/spec-lint.mjs validate
node .harness/tools/trace-check/trace-check.mjs
node .harness/tools/contract-run/contract-run.mjs          # traceconfig.json の commands.contract_adapter 宣言時のみ実行される
node .harness/tools/gate-hook/gate-log.mjs --summary       # gate-hook / stop-gate の拒否ログ集計
node .harness/tools/git-lint/git-lint.mjs branch           # traceconfig.json に git を宣言したホストのみ実行される
```

- Stop hook の終端ゲート（`tools/gate-hook/stop-gate.mjs`）と PreToolUse の着手ゲート（`gate-hook.mjs`）は、ホストが `.claude/settings.local.json` に明示して設置する（`tools/gate-hook/README.md`）。
- ブランチ名とコミットメッセージの書式（`tools/git-lint`）は、ホストが `traceconfig.json` に `git` を宣言すると有効になる。PR での強制は再利用ワークフロー `.github/workflows/spec-gate.yml` が担い、merge を止めるにはホストが既定ブランチの保護でそのジョブを必須チェックにする（`tools/git-lint/README.md`）。

## 旧 init.sh 利用者の移行

旧方式（`.claude` の symlink / submodule / copy）は新方式へ上書きせず、次の順で移行する。旧引数（`--mode` / `update` / `--force`）は新 `init.sh` が無変更で停止する。移行対応表は `tools/apm/migration-map.json`。削除した用途（翻訳、動画制作、メディア生成）に移行先はない（ADR-0046）。

1. 現在の導入方式、固定版、`.claude` が symlink か実体かを調べ、ホスト固有の skills / rules / settings と未保存の変更を退避する。
2. 必要な用途・スタックと target を決める。全体導入に相当する root 依存は作らない。
3. 新しい consumer または移行用 checkout で APM install を先に検証し、選択した packages だけが存在してホスト独自ファイルを上書きしないことを確認する。
4. 旧方式が所有する symlink・生成物・導入記録を対象を確認してから外す。リンク先を再帰削除せず、`.harness` の gitlink を通常 clone で上書きしない。
5. APM の manifest / lock と別アセットを設置して install し、ホストの事実・検証コマンド・フックの参照先を新配置へ更新する。
6. 以後の更新は APM に一本化する。APM と互換展開を同じ消費プロジェクトで混ぜない。

## 互換展開とリポジトリ編集

APM を使わない環境では `init.sh` を選択パッケージの中立ソースから各 target への互換生成に使う。`install` は `claude` の別名。`tools/{codex,cursor,grok}-sync/sync.sh` も同じ入口を呼ぶ。選択と source は `.harness-legacy.json` に記録され、複数 target では選択を一致させる。APM の manifest / lock / modules があるホストへの互換生成は拒否する。

```bash
./init.sh codex /path/to/legacy-consumer --package develop-core --package rules-next
./init.sh codex . --package develop-core --package rules-next   # このリポジトリで検証生成する例
```

編集は `packages/` / `tools/` / `templates/` へ行い、該当パッケージだけを再生成する。

## 検証手順

リポジトリ直下で実行する。

```bash
python3 tools/apm/test_projection.py     # パッケージ境界、リンク到達性、参照方向、行数上限、互換生成の所有権
node --test "tools/**/*.test.mjs"        # spec-lint / trace-check / gate-hook / stop-gate / contract-run / git-lint
node tools/spec-lint/spec-lint.mjs validate
node tools/trace-check/trace-check.mjs
```

native APM install は別の fresh consumer で確認する。公開前はローカルパッケージを絶対パスで指定する。

```bash
apm install --target codex /absolute/path/to/harness/packages/develop-core
apm install --target codex /absolute/path/to/harness/packages/rules-next
```

確認する項目:

1. 各パッケージを単独で install でき、develop-core + rules-next の consumer にほかのスタックの葉が出ない。
2. installed package に tools / templates が同梱されない。
3. Claude 出力の `paths` が元の `applyTo` と同じ対象を表し、Cursor 出力が常駐指示にならない。
4. Codex / Grok の install が root `AGENTS.md` や全文の rules router を生成しない。
5. skill 本文のリンクが `apm_modules/` 内で解決し、`.claude/` がなくても到達できる。

各 provider 上での対話、委譲、モデル選択の実行確認は、ファイルの install と参照の検証とは別に、実際のセッションで行う。
