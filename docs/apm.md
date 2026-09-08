# APM パッケージの導入と移行

## 正本と確認した仕様

正本は `packages/`、実行アセットは `tools/`、文書書式は `templates/` に置く。`.claude/`・`.agents/`・`.codex/`・`.cursor/`・`.grok/` は生成先であり、直接編集しない。root の全部入り manifest は置かない。

2026-09-08 に **Microsoft APM CLI 0.30.0** と公式資料を確認した。公式サイトは更新されるため、APM 更新時は下記の再検証を行う。

| 契約 | 採用する形・根拠 |
| --- | --- |
| package anatomy | パッケージごとに `apm.yml` と `.apm/`。必須 identity は `name` と `version`。[公式 anatomy](https://microsoft.github.io/apm/concepts/package-anatomy/) |
| モノレポの選択 | `dependencies.apm` に `owner/repo/path` を指定し、必要なサブディレクトリだけを選ぶ。固定 ref は末尾の `#<ref>`。[manifest schema](https://microsoft.github.io/apm/reference/manifest-schema/) |
| primitives | `.apm/skills/<name>/SKILL.md`、`.apm/agents/**/*.agent.md`、`.apm/instructions/*.instructions.md`。対象は中立メタデータ `applyTo`。[instructions / agents](https://microsoft.github.io/apm/producer/author-primitives/instructions-and-agents/) |
| install | `--target` または消費側 `targets` で対象を明示する。複数ならカンマ区切り。[install CLI](https://microsoft.github.io/apm/reference/cli/install/) |
| 本文の相対参照 | package 内の Markdown link を使う。APM の対応する integrator が installed package への参照に変換する。Codex agent 本文の例外は後述する。[package-relative links](https://microsoft.github.io/apm/producer/package-relative-links/) |
| compile | 規約を対象向けの文脈ファイルへ構成する標準機能。本ハーネスでは常駐ゼロを守るため使わない。[compile CLI](https://microsoft.github.io/apm/reference/cli/compile/) |
| provider 差異 | 対応する primitive と出力先は target ごとに異なる。同じ実行時能力を保証するものではない。[targets matrix](https://microsoft.github.io/apm/reference/targets-matrix/) |

APM 0.30.0 の実装・最小 package で、instructions は `.apm/instructions/` **直下**を探索し、agents はネストを探索することを確認した。旧 rules の階層は instruction ファイル名に保持し、見つからないネストに押し込まない。`applyTo` はカンマ区切り文字列（例: `applyTo: "**/*.ts,**/*.tsx"`）を用い、各 glob を Claude 固有の `paths:` に変換するのは展開時だけとする。

## 移行対応表

移動前に定めたパッケージ境界は次のとおり。個々の移動は `tools/apm/migration-map.json` を参照する。

| 旧正本 | 新正本 |
| --- | --- |
| `.claude/skills/{develop,develop-light,attack,docs-migrate}/` | `packages/develop-core/.apm/skills/` |
| `.claude/agents/develop/` | `packages/develop-core/.apm/agents/develop/` |
| `.claude/rules/develop/{docs,comments}.md` | `packages/develop-core/.apm/instructions/` |
| `.claude/rules/develop/web/next/**` | `packages/rules-next/.apm/instructions/` |
| `.claude/rules/develop/web/crow/**` | `packages/rules-crow/.apm/instructions/` |
| `.claude/rules/develop/native/expo/**` | `packages/rules-expo/.apm/instructions/` |
| `.claude/rules/develop/native/swiftui/**` | `packages/rules-swiftui/.apm/instructions/` |
| `.claude/{skills,agents,rules}/translate-manga-ko-ja/` | `packages/translate-manga/.apm/{skills,agents,instructions}/` |
| `.claude/{skills,agents,rules}/produce-video/` | `packages/produce-video/.apm/{skills,agents,instructions}/` |
| `.claude/{skills,agents,rules}/render-media/` | `packages/render-media/.apm/{skills,agents,instructions}/` |
| `.claude/skills/{grilling,grill-me}/` | `packages/grilling/.apm/skills/` |
| `.claude/tools/` | `tools/`（APM 外） |
| `.claude/templates/` | `templates/`（APM 外） |

agent ファイルには `.agent.md`、instruction ファイルには `.instructions.md` を使う。既存の動画・メディア・インタビュー用途も独立した任意パッケージとして保存する。develop-core の依存に全スタックや全用途を加えない。

## 新規消費プロジェクト

Next.js + Codex の例:

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
```

manifest を CLI から作成・更新する場合:

```bash
apm install --target codex tsay-dev/harness/packages/develop-core
apm install --target codex tsay-dev/harness/packages/rules-next
```

翻訳だけの場合:

```bash
apm install --target claude tsay-dev/harness/packages/translate-manga
```

対象は `claude` / `codex` / `cursor` / `grok-build` から選ぶ。複数使う場合は `--target claude,codex` のように一つのオプションへまとめる。`--target` の反復は最後の値だけが有効になる。パッケージソースで消費先を固定しない。

GitHub 例はこの構成が公開された版に対して有効。ref を固定する場合は、たとえば `tsay-dev/harness/packages/rules-next#<release-tag>` と記述し、`<release-tag>` を実在する公開タグへ置き換える。存在しないリリース名を例からそのまま使わない。依存を変えたら生成された `apm.lock.yaml` と manifest の変更を確認して保存し、CI で同じ解決を使う場合は `apm install --frozen` を使う。更新は APM の `apm update` で計画を確認して行う。

### 出力と常駐ゼロ

APM 0.30.0 の install では skills は原則 `.agents/skills/` に共有配置され、Claude などの target に必要な発見経路も生成される。agents の出力は Claude `.claude/agents/`、Codex `.codex/agents/`、Cursor `.cursor/agents/`、Grok Build `.grok/agents/`。配布名に package 名が付くことがあるため、元の短いファイル名を展開後の識別子だと決めつけない。

Claude / Cursor 向けには scoped instructions をそれぞれの形式へ展開する。Codex / Grok Build では install だけで root `AGENTS.md` は作られず、installed instructions は `apm_modules/` に残る。skill 起動時に選択済み package の `applyTo` とパスを調べ、担当者が書くファイルに合う葉だけを渡す。本文を常駐させるルーターは作らない。

**`apm compile` は本構成の通常手順に含めない。** APM 0.30.0 の Codex compile を最小 consumer で試すと、glob に一致するファイルがない場合も root `AGENTS.md` に本文が fallback し、常駐化した。install に compile を機械的に続けると、このハーネスの意図から外れる。

### Codex agent の参照解決

APM 0.30.0 は Codex の生成 TOML に埋め込む agent 本文の相対リンクを書き換えない。各 agent の正本冒頭にある **Package source resolution** 規約で、必要な参照を次のように解決する。

1. `apm_modules/` の manifest を正確な package `name` で照合し、所属 package を見つける。
2. 規約に記載された `.apm/agents/.../*.agent.md` の元ファイルを開く。
3. **その元ファイルに記されたリンク**を元ファイル基準で解決し、要求された instruction だけを読む。

生成済み本文の URL を元ディレクトリに当て直さない。他 target では URL が既に書き換えられている場合がある。互換展開では `.harness-legacy.json` の source checkout から同じ元ファイルを解決する。この規約は参照先を探す手順だけを持ち、規約本文の常時読み込みやコピーを行わない。

### モデル設定の差異

中立 agent ソースは provider 固有の `model:` を持たず、`x-model-tier: top | mid | light` で重要度を宣言する。割当は各 agent の frontmatter 一箇所だけに置く。Claude family の対応は `tools/apm/claude-models.json`、Codex catalog ID と reasoning effort の対応は `tools/codex-sync/models.json` に置き、どちらにも agent 名を列挙しない（ADR-0028 / ADR-0029）。

互換 adapter は `x-model-tier` を読み、Claude では opus / sonnet / haiku、Codex では JSON の3段へ変換する。Cursor は生成ファイルを `inherit` に正規化し、orchestrator が起動時に同段の family を選ぶ。Grok Build は per-launch model 指定がないため親を継承し、要求段を保証できない場合はその制約を報告する。

APM 0.30.0 の native integrator が中立拡張を provider の model field に変換するとは仮定しない。native install 後は `apm_modules/` の元 agent sourceから tier を読み、起動 API が受け付けるときに適用する。APM が管理する生成物は手書きで直さない。特定モデル・独立コンテキスト・委譲 API の利用可否は、使うホストで確認する。

## tools / templates を別途用意する

APM packages は tools / templates を含まない。develop の検証・文書生成、動画制作・レンダリングなどで必要なアセットを、消費プロジェクトの `.harness/` にこのリポジトリの別 checkout として用意する。

```bash
# <release-tag> を実在する、package と整合するタグに置き換えて実行する
# git clone --branch <release-tag> https://github.com/tsay-dev/harness.git .harness

# 導入後、消費プロジェクト直下から実行する例
node .harness/tools/spec-lint/spec-lint.mjs validate
node .harness/tools/trace-check/trace-check.mjs
```

各手続きは冒頭で `HARNESS_ROOT` を tools / templates を持つ checkout の絶対パスとして解決する。消費側の通常配置は `.harness/`、このリポジトリ自身では root。`.harness/tools/` は実行アセット、`.harness/templates/` は書式の参照先である。checkout 自体は全ソースを含み得るが、その存在だけで各 provider に全パッケージを展開しない。**この checkout の `init.sh` は APM consumer に実行しない。** フック・CI・ブランチ保護はホストが明示して設置する。未導入アセットが必要な工程では、存在を仮定してコマンドを捏造しない。

## 旧 init.sh 利用者の移行

旧方式は `.claude` を `.harness/.claude` / `.claude-harness/.claude` や外部 checkout にリンクする、または全体を copy する方式だった。新方式へ上書きするだけでは、所有権の衝突や不要ファイルの残存を起こす。旧 `submodule` / `symlink` / `copy` の配置管理とタグ更新処理は、中立 package の選択展開へ役割が変わったため、新 `init.sh` には引き継がない。旧引数を黙って新方式へ読み替えると既存ホストを壊すため、無変更で止める。旧版のまま運用を続けるホストは、移行するまでその導入時の版とスクリプトに固定する。

1. 現在の導入方式、固定版、`.claude` が symlink か実体かを調べる。ホスト固有の skills / rules / settings、未保存の変更を退避する。旧生成物だけを識別する。
2. 必要な用途・スタックと target を決め、旧方式の全体導入に相当する root 依存を作らない。
3. 新しい consumer または移行用 checkout で APM install を先に検証する。選択した packages だけが存在し、host 独自ファイルを上書きしないことを確認する。
4. 旧方式が所有する symlink・生成物・導入記録を、対象を確認してから外す。リンク先を再帰削除しない。submodule の扱いはホストの管理下で行い、`.harness` の gitlink を通常 clone で上書きしない。
5. APM の manifest / lock と必要な別アセットを設置し、install を実行する。ホストの事実・検証コマンド・任意フックの参照先を新配置へ更新する。
6. 以後の更新は APM に一本化する。旧 `init.sh update` と APM install を交互に実行しない。

APM と互換展開は、**同じ消費プロジェクトで混ぜない**。旧方式の手書き変更・symlink・gitlink の自動削除は移行手段にしない。

## 互換展開とリポジトリ編集

APM を使わない環境では `init.sh` を選択パッケージの中立ソースから各 target への互換生成に使う。全体導入を既定にはしない。コマンドは次の形で、`--package` は反復可能。`install` は `claude` の別名。

```bash
./init.sh codex /path/to/legacy-consumer --package develop-core --package rules-next
./init.sh claude /path/to/legacy-consumer --package translate-manga

# このリポジトリの選択済み正本を Codex 向けに検証生成する例
./init.sh codex . --package develop-core --package rules-next
```

`tools/codex-sync/sync.sh`・`tools/cursor-sync/sync.sh`・`tools/grok-sync/sync.sh` も `[TARGET] --package NAME ...` の形で同じ中立ソースを使う。互換導入の選択と source は `.harness-legacy.json` に記録され、複数 target で併用する場合は選択を一致させる。APM の manifest / lock / modules があるホストへの互換生成は拒否する。旧 `--mode` / `update` / `--force` は移行を促して無変更で停止し、以前の動作を暗黙に再現しない。

編集は `packages/` / `tools/` / `templates/` へ行い、該当パッケージだけを再生成する。`.claude/` を編集して他社へ射影する経路には戻さない。APM consumer では正本更新・依存更新・`apm install`、互換 consumer では中立正本更新・`init.sh` の再生成という管理をそれぞれ保つ。

## 検証手順

リポジトリ直下で実行する再現チェック:

```bash
python3 tools/apm/test_projection.py
node tools/spec-lint/spec-lint.mjs validate
node tools/trace-check/trace-check.mjs
```

互換生成の 9 テスト、spec-lint、trace-check は通過した。以下の native APM install は別の fresh consumer で確認する。

公開前はローカルパッケージで fresh consumer を作れる。絶対パスを作業環境の checkout に置き換える。

```bash
# 空の一時consumerディレクトリで実行する
apm install --target codex /absolute/path/to/harness/packages/develop-core
apm install --target codex /absolute/path/to/harness/packages/rules-next
```

確認する項目:

1. 全 manifest が APM 0.30.0 で認識され、各パッケージを単独で install できる。
2. develop-core + rules-next の consumer に Expo / crow / SwiftUI / manga のファイル・本文が出ない。translate-manga 単独に develop が入らない。
3. installed package 内に tools / templates を同梱していない。
4. Claude 出力の `paths` が元の `applyTo` と同じ対象を表し、Cursor 出力が常駐指示にならない。
5. Codex / Grok install が root `AGENTS.md` や全文 rules router を生成しない。
6. skill の規約・agent 参照が `apm_modules/` 内で解決し、`.claude/` がなくても到達できる。コードブロック内のコマンドは Markdown link 自動変換の対象と決めつけず、別途確認する。
7. 互換生成は中立ソースだけから再現し、無関係な手書きファイルを上書きしない。再実行で不要差分が増えない。
8. develop の段階・人間ゲート・producer と judge の分離・翻訳の工程・言語規約を保つ。

### 最終実測結果

APM 0.30.0、公開前のローカル package を絶対パス依存にした fresh consumer で確認した。GitHub 上への公開や remote install の実測とは区別する。

| 検証 | 結果 |
| --- | --- |
| 9 パッケージそれぞれを Codex へ単独 install | 9 件すべて exit 0 |
| develop-core + rules-next を Claude / Codex / Cursor / Grok Build へ install | 4 件すべて exit 0。他スタック・翻訳の混入なし |
| 9 パッケージを明示して同時に Codex へ install | exit 0。28 agents、名前衝突なし |
| 出力の Markdown 参照 | 書換済み URL と上記 Codex source-resolution 規約を含め、未解決 0 |
| 配布対象外と常駐本文 | tools / templates 同梱なし。root AGENTS.md / CLAUDE.md 生成なし |
| `x-model-tier` の互換性 | APM 0.30.0 の develop-core → Codex install は exit 0。中立値は `apm_modules/` に保持され、生成 TOML へ未知 field として漏れない |

合計 14 回の install を確認した。最小パッケージでは install と compile の常駐化の差異も確認済み。各 provider 上での対話・委譲・モデル選択の実行確認は、ファイルの install と参照検証とは分けて扱う。
