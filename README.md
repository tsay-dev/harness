# harness

エージェントの skill / agent / rules の正本を管理する、ベンダー中立の APM モノレポです。必要なパッケージだけを各プロジェクトへ取り込み、Claude / Codex / Cursor / Grok 向けに展開します。特定ベンダーの設定集ではありません。

**正本は `packages/`、実行アセットは `tools/`、書式は `templates/`。`.claude/`・`.agents/`・`.codex/`・`.cursor/`・`.grok/` は生成物で、直接編集しません。** ルートの `AGENTS.md`・`CLAUDE.md` はこのリポジトリ自身の作業規約です。

## 到達状態

harness が目指すのは、**人間が承認した仕様から、実装とその検証が互いに独立に導出され、両者の紐づきを機械が検査して完了を判定できる状態**です（ADR-0044）。到達の順序や深さはオーケストレーターが決め、プロンプトには到達状態、不変条件、入出力契約と、機械が検査せずモデルが自力では到達しない知識だけを置きます。手順、機械が検査する事項の再説明、重複、チェックリストは置きません。

- **仕様は人間が承認した 1 箇所にある。** `docs/` の SSOT は人間ゲートで `active` になり、コードは正本になりません。人間ゲートは SSOT、UI の見た目、DB スキーマの 3 つだけです。
- **検証は実装から独立に導出される。** テストは仕様と契約から実装を読まずに書かれ、判定者は作成者と別コンテキストです。
- **紐づきは機械で検査できる。** spec-lint（書式とライフサイクル）、trace-check（C1–C15 のトレーサビリティ）、contract-run（契約 examples の実行）、ホストの typecheck / lint / test / system が判定します。
- **完了は閉じたリストで判定される。** 上記がすべて exit 0 で reviewer の `阻止` がゼロのときだけ完了です。ホストが Stop hook に `tools/gate-hook/stop-gate.mjs` を設置すると機械が強制します。

## 必要な用途とスタックだけを選ぶ

| パッケージ | 内容 | 選ぶ場面 |
| --- | --- | --- |
| `develop-core` | develop / attack / docs-migrate の skills、develop の agent 5 体、docs・comments の共通規約 | システム開発 |
| `rules-next` | Next.js の規約葉 | Next.js 開発。develop-core と組み合わせる |
| `rules-cloudflare-hono-react` | Workers + Hono + React SPA、D1 + Drizzle の規約葉 | Cloudflare 開発。develop-core と組み合わせる |
| `rules-crow` | crow の規約葉 | crow 開発 |
| `rules-expo` | Expo の規約葉 | Expo 開発 |
| `rules-swiftui` | SwiftUI の規約葉 | SwiftUI 開発 |
| `grilling` | grilling / grill-me の skills | 計画・設計のインタビュー |

全部入りのパッケージはありません。複数用途が必要なプロジェクトは、必要なパッケージをそれぞれ明示します。

## APM で導入する

消費プロジェクトの `apm.yml` に、選ぶパッケージだけを記述します。

```yaml
name: my-next-app
version: 1.0.0
targets: [codex] # claude / cursor / grok-build など、使う対象を明示
dependencies:
  apm:
    - tsay-dev/harness/packages/develop-core
    - tsay-dev/harness/packages/rules-next
```

```bash
apm install
```

`tools/` と `templates/` は APM パッケージ外です。spec-lint / trace-check やテンプレートを使う工程では、このリポジトリを別途 `.harness/` などへ取得して版を固定します。フック、CI、ブランチ保護の設置と検証コマンドの宣言は消費プロジェクトの責務です。公開前のローカル検証、対象の選択、固定版、既存ホストの移行は [APM 導入ガイド](docs/apm.md) にあります。

## 常駐ゼロ

インストール単位と読み込み単位を分けます。用途とスタックで不要なファイルを入れず、作業に必要な本文だけを読みます。

- 手続きは skill の明示起動、または description による発見が入口です。
- 規約葉は中立メタデータ `applyTo` で対象ファイルを宣言します。Claude 向け展開では `paths:` に変換され、書くファイルに合わせて自動で読み込まれます。遅延ロードのない対象では、オーケストレーターが `applyTo` と書くパスを照合して葉のパスを渡します。
- 規約本文を常駐させる索引、ルーター用の `AGENTS.md` / `CLAUDE.md`、`settings.json` の自動注入は作りません。APM の `compile` は使いません。

## 参照の方向

参照は **skills → agents** の 1 本だけです（ADR-0048）。オーケストレーターは起動する agent の名前、mode、tier を知ります。agent は読むべき規約を名指しせず、書くパスに対応して届いた規約に従います。規約葉は skill も agent も知らず、そのパスに置くファイルの事実だけを持ちます。`tools/apm/test_projection.py` が逆方向の参照と、ファイル種別ごとの行数上限を検査します。

## 正本の構成

```text
harness/
  packages/
    develop-core/
      apm.yml
      .apm/
        skills/<name>/SKILL.md      # 到達状態、不変条件、完了条件。references/ にガードレールと配送契約
        agents/develop/<name>.agent.md
        instructions/<scene>-<concern>.instructions.md
    rules-next/                     # apm.yml + .apm/instructions/
    rules-cloudflare-hono-react/
    rules-crow/
    rules-expo/
    rules-swiftui/
    grilling/
  tools/                            # spec-lint、trace-check、contract-run、gate-hook、git-lint、apm。APM 外
  templates/                        # 文書書式。APM 外
  docs/apm.md
  docs/adr/
  init.sh                           # 選択パッケージからの互換展開
```

develop の agent は `spec-author`、`test-author`（`track: backend-logic / scenario`）、`implementer`（`mode: logic / appearance / schema / probe`）、`reviewer`（`mode: structure / slice / proposal`）、`attacker` の 5 体で、別コンテキストが必要な場合だけ分けています。各 agent は `x-model-tier`（top / mid / light）を 1 つ宣言し、プロバイダーのモデル名はアダプターの対応表だけが持ちます。

## docs の SDD / SSOT

成果物は 1 ID 1 ファイルです。縦の `GOAL → UC → REQ` は `docs/goals/GOAL-nn/UC-nnn/` の木に一致させ、横断する BR / NFR / ADR / glossary は `docs/` 直下に置きます。DB 設計はホストのネイティブスキーマが正本です。人間ゲートの文書は `draft → active → withdrawn`、契約は `draft → fixed`。工程は各 `UC.md` の `phase:` が持ち、導出できる台帳はコミットしません。テストは `@covers REQ-nnn#class`、シナリオテストは `@scenario UC-nnn`、実装は `@implements` で上流を指し、trace-check が紐づきを検査します。書式の正本は [templates/develop](templates/develop/README.md) です。

## このリポジトリを編集するとき

[CLAUDE.md](CLAUDE.md) の作業規律に従い、`packages/`、`tools/`、`templates/` の正本を修正して生成物を再生成します。持続的な設計判断は `docs/adr/` に記録します。会話、docs 成果物、プロンプト正本、コミットメッセージ、コード内コメントは日本語です。案件固有の事実は各消費プロジェクトの `AGENTS.md` / `CLAUDE.md` に書きます。
