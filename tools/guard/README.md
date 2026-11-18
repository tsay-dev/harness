# guard — 書き込み前の関門（明示選択する Claude Code hooks）

develop skill の説得による停止線を構造にする、二つの hook と一つの共有ログのうち、書き込みの前に動くほう（`harness guard`）。
もう 1 つの hook（Stop。`harness verify --hook`）の中身は `../verify/README.md`。hook の設定例、拒否ログ、制約は 2 つに共通で、このファイルが正本。

| hook | Claude Code イベント | 阻止するもの | コマンド |
| --- | --- | --- | --- |
| **実装開始ゲート**（§2） | `PreToolUse` (Write / Edit / MultiEdit / NotebookEdit) | UC とその REQs が `active`、契約が `fixed` になる前の実装コードの書き込み。検査の範囲・検査器・hook の設定・workflow・docs の status の変更・承認済みの文書の書き換えは人間の承認に掛ける | `harness guard` |
| **最終ゲート** | `Stop` | lint spec、lint refs、run cases、利用プロジェクトの typecheck / lint / test / system が失敗したままのターン終了 | `harness verify --hook` |
| **拒否ログ** | （共有） | 全ゲート判断を JSONL 一行ずつ記録し、「このゲートは実際に阻止しているか」をデータで回答 | `tools/_shared/gate-log.mjs` |

- **develop 手順はこれらなしでも動く**（§2 は自己検査、`harness lint git uc` はコミット時の事後検査）。
  hooks は第三の網、**書く瞬間に実際に止める停止線と、終了する瞬間に止める停止線**を追加する。
- **有効化は利用プロジェクトが決める。** harness はコマンドとこの指示だけを同梱する
  （設定への接続による導入は各プロジェクトの責任。README の「同梱する機械検査」節を参照）。

## 実装開始ゲート（PreToolUse）

1. Write / Edit / MultiEdit / NotebookEdit の直前に発火し、対象パスを受け取る。
2. 対象が「実装コード」（`--code` glob に一致）なら、仕様の木のすべての UC の `UC.md`（どのフォルダを UC として数えるかと、木の根の決め方は、ほかの検査と同じ `../_shared/spec-tree.mjs`）の frontmatter `phase:` を読む（そこが進捗台帳。台帳ファイルはコミットしない、R-1003）。
3. **phase が実装または検証のすべての UC** について、UC が `active`、REQ に `draft` がない、`contract.yaml` が `fixed` であることを検証する。
4. 欠落があれば **exit 2 でツール呼び出しを阻止**し、理由（どの UC に何が欠け、どの phase に戻るか）を stderr で AI に返す。AI の意図にかかわらず停止する。

UC 自身の frontmatter が機械可読のゲート状態なので、**追加の状態ファイルはない**。
orchestrator が SKILL の手順で `phase:` を進める限り、hook はその状態をそのまま判定する。

### 判定規則

上の行から順に、最初に当たったものを適用する。パスの比較は大文字小文字を無視する（`--code` / `--exclude` / `--docs` も。大文字小文字を区別しないファイルシステムで `Docs/` や `Src/` から書いて素通りしないように）。
表の `docs/` は、`--docs` のフォルダと、monorepo ではルートの `harness.config.json` の `git.units` に宣言した各 unit の `<unit のディレクトリ>/<--docs>`（例: `apps/a/docs`）を指す。どの unit の docs にも同じ判定を当てる。

| 書き込み対象 | 判定 | ログ記録 |
| --- | --- | --- |
| `.harness-gate/` 配下 | **阻止**（exit 2）。ログと verify --hook の状態はフック自身だけが書く | あり（`block` / `harness-gate`） |
| `**/harness.config.json`（unit の harness.config.json も） | 止めずに人間の承認を求める（`permissionDecision: "ask"`）。検査の範囲（none の宣言、注釈の正規表現、`commands`）を決め、書き換えれば検査を外せるため（ADR-0057） | あり（`ask` / `config`） |
| `.harness/**`（検査器そのもの） | 人間の承認を求める | あり（`ask` / `harness`） |
| `.claude/settings*.json` と、`.codex/` `.cursor/` `.grok/` `.agents/` 直下の `*.json` / `*.toml`（hook の設定。プロジェクト外のユーザー設定 `~/.claude/settings.json` なども） | 人間の承認を求める | あり（`ask` / `hook-settings`） |
| `.github/workflows/**` | 人間の承認を求める | あり（`ask` / `workflow`） |
| docs の場所を決められない: monorepo（ルートの `harness.config.json` に `git.units`）で、unit の docs（`<unit>/<--docs>`）に書くのに `<unit>/harness.config.json` が無い・JSON として読めない、`git.units` の値がディレクトリの文字列でない、ルートの `harness.config.json` が JSON として読めない（このときは、パスの途中に `--docs` のフォルダ名を含む書き込みと `--docs` 配下） | 人間の承認を求める（fail-closed）。どの docs への書き込みか、その docs の判定に要る設定を決められないため | あり（`ask` / `status-down`） |
| `docs/` 配下で status の降格（`active` / `fixed` / `living` / `frozen` から、それ以外の値・status 行の削除・引用符を付けた値などの語彙の外の値へ）と、判定中の例外 | 人間の承認を求める。検査の義務を減らすため。契約の `x-status` は共有の厳格 YAML パーサーで読む（他のツールと同じ値） | あり（`ask` / `status-down`） |
| 概要（`<docs>/00-overview.md`）のアクター表で人間のアクターを削除する、種別を「システム」に変える、または active な `UC.md` の `actor:` を変える | 人間の承認を求める。シナリオテスト（C15）の義務を減らすため | あり（`ask` / `actor-kind`） |
| 概要の GOAL の表から行を消す（status によらず）、active の行を active でなくする | 人間の承認を求める。降格と同じく検査の義務を減らすため（ADR-0076） | あり（`ask` / `status-down`） |
| 概要の全体の方針の小節の本文を変える（未記入→記入、記入→別の文、記入→未記入。概要の status によらず） | 人間の承認を求める。UC の並行性・外部依存の行を省けるかを、すべての UC について一度に変えるため（ADR-0076） | あり（`ask` / `overview-policy`） |
| `verification/DEFERRED.md`（保留の一覧。`--docs` の場所によらず、monorepo の unit 配下も含む）を新しく作る、`frozen_at` を変える、行を足す（行を消すだけの書き込みは対象外）と、判定中の例外 | 人間の承認を求める。一覧は凍結済みで、足せば未決を持ち越せるため（ADR-0068） | あり（`ask` / `deferred`） |
| `docs/` 配下で `UC.md` の `active`、契約の `fixed` への昇格（新規作成で書く場合も） | 人間の承認を求める。実装着手ゲートを開ける人間ゲートを agent が自力で開けないため | あり（`ask` / `status-up-gate`） |
| `docs/` 配下で、承認済みの文書（`active` の `UC.md`・BR・NFR、`living` の概要、`fixed` の契約）の本文（frontmatter の `status`、契約の `x-status` 以外の行）を変える。active の `UC.md` で REQ を `active` にする・`active` で足す、draft の REQ の小節を消す、書き込み後の内容や「要件」の節の書き方が読めないときも含む（判定に迷う形は人に回す） | 人間の承認を求める。承認時の指紋で承認を無効にするのではなく、書き換えるたびに人が差分を見る（ADR-0078）。BR・NFR はファイル名（`BR-nnn` / `NFR-nnn`）か frontmatter の `id` で見分ける | あり（`ask` / `approved-edit`） |
| `docs/` 配下の共有の語彙（`<docs>/_shared/components.yaml` と、設定の `docs.shared` が指すファイル）を変える書き込み（エラーコードを足すだけでも、新しく作るのも、書き込み後の内容が分からないのも）で、その docs の仕様の木に `fixed` の契約が 1 つでもあるとき | 人間の承認を求める。契約の本文を書き換えなくても、承認済みの契約が参照する語彙が変わるため（ADR-0078）。どの契約がどの語彙を参照するかは解決せず、`fixed` の契約があるかだけを見る。`fixed` の契約が無ければ許可 | あり（`ask` / `approved-edit`） |
| 上の承認済みの文書のうち、`UC.md` の `phase:` だけを変える書き込みと、active の `UC.md` で draft の REQ の小節を足す・直すだけの書き込み | 許可。phase は orchestrator が進め、draft の REQ はまだ人が承認していないため。同じ書き込みで status を下げるなら上の `status-down` | なし |
| `docs/` 配下でそれ以外の昇格（REQ（UC が active でないとき）/ BR / NFR / GOAL の `draft` → `active`、単一文書の `draft` → `living` / `frozen`）と、status を持つ新規作成 | 許可 | あり（`pass` / `status-up`） |
| `docs/` 配下でそれ以外（承認前の文書で status が変わらない、status を持たない新規ファイル、`draft` ↔ `withdrawn` など義務の増減を伴わない変更） | 許可（SSOT の書き込みはゲートの前提条件） | なし |
| `.claude/` / `.agents/` / `.codex/` / `.cursor/` / `.grok/` / `apm_modules/` 配下、`--exclude` に一致、または `--code` に不一致 | 許可（ゲート外） | なし |
| 実装コード + `docs/goals` なし | **阻止**（`no-goals` → Phase 1） | あり |
| 実装コード + phase が実装\|検証の UC なし | **阻止**（`no-active-phase`。開始前に UC の `phase:` を進める） | あり |
| 実装コード + 進行中 UC が `active` でない、そこに `draft` REQ がある、または契約欠落 / `fixed` でない | **阻止**（`uc-not-active` / `req-draft` / `contract-missing` / `contract-not-fixed` → Phase 1 / Phase 3） | あり |
| 上記をすべて充足 | 許可（`pass` / `ok`） | あり |

status は、frontmatter の `status:` と、契約（`.yaml`）の `x-status:`（引用符は外す）を、書き込みの前後で比べる。
書き込み前は既存ファイル（無ければ新規）、書き込み後は Write の `content`、Edit の `old_string` → `new_string`（`replace_all` を含む）、
MultiEdit の `edits` を順に当てた結果。書き込み後の内容が分からないもの（NotebookEdit、`old_string` が見つからない Edit）は判定せず許可する。
ask のメッセージには、ファイルと「旧 → 新」を書く。

実装ゲートのログの分母は「ゲート対象の実装コードへの書き込み」であり、阻止率を直接読める（ask、`status-up`、`harness-gate` は別に数える）。

入口の不具合（不正な stdin など）と、`--code` に一致する前の例外は **fail-open**（許可）。hook のバグでセッションを壊してはならない。
一方、`--code` に一致した後（実装コードへの書き込みの判定中）の例外は **fail-closed**（exit 2、`block` / `internal-error`）。
判定できないまま通すと、ゲートが無いのと同じになる。SSOT がなければ停止する。

### 引数（全設定はここに置き、設定ファイルを追加しない）

| 引数 | 意味 |
| --- | --- |
| `--code <glob>` | 実装コード、すなわちゲート対象のパス（繰り返し可、**必須**）。例: `'src/**'` `'app/**'` `'db/schema.*'` |
| `--exclude <glob>` | `--code` から除外するパス（繰り返し可）。例: skeleton の作業場所 `'skeleton/**'` |
| `--docs <dir>` | docs のルート（既定 `docs`） |
| `--log <path>` | 拒否ログ（既定: プロジェクト直下の `.harness-gate/log.jsonl`）。相対パスはプロジェクト直下から解決 |

- `--code` なしの有効化では阻止せず警告のみ（exit 1。誤導入の検出用。`skip` / `misconfig` と記録）。
- glob は `**` / `*` / `?` だけに対応する最小実装（`tools/_shared/glob.mjs`。プロジェクト直下からの相対パスと照合）。frontmatter は `tools/_shared/frontmatter.mjs` で読む（lint spec / lint refs と同じ読み方）。

## 導入（利用プロジェクト側）

`.claude/settings.local.json` に追加する（個人用、コミットしない。submodule 配置でも利用プロジェクト内に置く）:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/.harness/bin/harness.mjs\" guard --code 'src/**' --code 'app/**'"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/.harness/bin/harness.mjs\" verify --hook",
            "timeout": 600
          }
        ]
      }
    ]
  }
}
```

`Stop` 項目に `matcher` はなく、毎回の終了で発火する。この例は、シナリオテストまで実行する（`--level` の既定は `full`）。ターンの終わりごとには重すぎるなら、`--level fast`（シナリオテストを除く）か `--level lint`（読むだけ）を付ける。フックで実行しなかった分は、CI の level で補う。フックも CI も低い level のままだと、その検査はどこでも実行されない。各 hook は単独でも導入できる。

明示選択するこれらの hooks は利用プロジェクトの `.claude/settings.local.json` に置く。生成プロンプトディレクトリを修正したり、`settings.json` を規約ルーターにしたりしない。

## 拒否ログ

両 hooks は判定ごとに JSON 一行を `.harness-gate/log.jsonl` へ追加する（`--log` で変更）。
ログ記録の失敗でゲートを止めてはならない。記録形状（キーはこの固定順）:

| キー | 値 |
| --- | --- |
| `ts` | ISO タイムスタンプ |
| `hook` | `guard` \| `verify` |
| `event` | `PreToolUse` \| `Stop` |
| `session` | Claude Code の `session_id`、または `null` |
| `decision` | `block` \| `pass` \| `skip` \| `release` \| `ask`（guard が止めずに人間の承認を求めた） |
| `reason` | guard: 実装ゲートは `misconfig` `no-goals` `no-active-phase` `uc-not-active` `req-draft` `contract-missing` `contract-not-fixed` `internal-error` `ok`。ask は `config` `harness` `hook-settings` `workflow` `status-down` `status-up-gate` `actor-kind` `overview-policy` `deferred` `approved-edit`。`pass` / `status-up`（docs の status の昇格・新規作成）、`block` / `harness-gate`（`.harness-gate/` への書き込み）。verify: `ok` `no-changes` `wrong-event` `round-cap` `non-decreasing` `internal-error`、または阻止時の最初の失敗名（`lint spec` `lint refs` `run cases` `config` `commands.<k>` `typecheck` `lint` `test` `system`、`timeout:<step>`、monorepo では `<step>:<unit>`） |
| `target` | guard: root からのゲート対象ファイル相対パス。それ以外は `null` |
| `uc` | guard: 検査した進行中 UC の ID。それ以外は `null` |
| `round` | verify: 阻止 / 解除時の回数。それ以外は `null` |
| `failures` | verify: 阻止 / 解除時の全失敗ステップ名。それ以外は `null` |
| `ms` | 判定にかかったミリ秒 |

### 集計

```bash
node .harness/tools/_shared/gate-log.mjs --summary [--log .harness-gate/log.jsonl] [--since 14]
```

hook ごとにゲート対象 / 阻止件数と ask の内訳・`status-up`・`harness-gate` の件数（guard）、実行 / 阻止 / 解除 / スキップ件数（verify）、
阻止理由の内訳を表示し、期間内に阻止ゼロの hook の後に `降格候補` 印を付ける。

同じ確認のための `jq` 一行:

```bash
jq -r 'select(.decision=="block") | "\(.ts) \(.hook) \(.reason) \(.target // (.failures|join(",")))"' .harness-gate/log.jsonl
```

**規則:** 実使用で約 14 日間阻止ゼロのゲートは降格候補。何も検出せず待ち時間だけを増やしている可能性がある。
降格するか保険として残すかは、このデータを見て人間が判断する。ツールは件数だけを示す。

## 制約（理解したうえで使う）

- **シナリオスイート（`e2e/**`、`UITests/**`）は `--code` に含めない。** UC が `active`、契約が `fixed` に
  なったら実装とともにシナリオテストを書くため、ここへのゲートはノイズだけを増やす。Stop フック（`harness verify --hook`）と
  `harness lint refs` の C15 が担当する。
- **Bash（`sed -i`、リダイレクトなど）の書き込みは PreToolUse ゲートをそのまま通る。** matcher は
  Write/Edit 系だけに適用する。Bash も阻止する設計は誤検出が多すぎる（ビルドとテストを妨げる）ため、
  意図的に対象外とする。harness.config.json / status / 検査器 / workflow の ask も同じで、Bash や Claude Code 以外の
  プロバイダーでの変更は止まらない。CI（verify.yml）が PR のジョブ要約にそれらの変更を出すので、
  merge 時に CODEOWNERS とブランチ保護で必須レビューにする（ADR-0057）。
- **docs の判定は、`--docs` と、ルートの `harness.config.json` の `git.units` に宣言した unit の docs だけに当てる。** unit の docs は `<unit のディレクトリ>/<--docs>`、その設定は `<unit のディレクトリ>/harness.config.json` で、`harness verify` が unit ごとに読むものと同じ（`tools/_shared/suite.mjs` の `unitsOf`・`readConfig`）。`git.units` に宣言していないフォルダの docs（`apps/c/docs` など）は判定しない。実装コードの判定（`--code`）は、今までどおり `--docs` の仕様の木だけを読む。
- PreToolUse では**どちらの hook も主 agent と子 agent を区別しない**。実装作成者の正当な Write も
  同じ検査を通るが、正当な実装は UC、REQs、契約が揃ってからのみ行うので追加の網は害を与えない
  （実際、逸脱する作成者も止める）。
- **子 agent の終了では `Stop` は発火しない**（それは `SubagentStop` で、`verify --hook` は無視する）。
  最終ゲートは主 agent のターンだけを判定する。
- **スイート実行時間は利用プロジェクトの責任。** Stop フックは変更のある毎回の終了時に `commands` の
  宣言を実行する。宣言コマンドを速くするか範囲を絞り、`--timeout` / hook の `timeout` を合わせる。
  遅いスイートは全ターンを遅くする。
- **git なしでは Stop フックは毎回実行する。** 変更検出には少なくとも一コミットの repository が必要。
- **walking skeleton**（§3。契約固定前に動作を書く明示的な例外）は本流のコードツリー外（例: `skeleton/`）で
  作業し、`--exclude` で除外するか、ゲート対象 glob 外に置く。
- UC の `phase:` や status が実態とずれたら PreToolUse 判定もずれる。
  `harness lint spec`（`../lint-spec/README.md`）と `harness lint refs`（`../lint-refs/README.md`）がコミット時に整合を確認する。

## 動作確認

```bash
# PreToolUse ゲート
echo '{"tool_input":{"file_path":"src/x.js"},"cwd":"/path/to/project","session_id":"manual"}' \
  | node bin/harness.mjs guard --code 'src/**'
echo $?   # 進行中 UC、REQs、契約がすべて揃っていなければ 2（阻止理由は stderr）

# Stop ゲート
echo '{"session_id":"manual","cwd":"/path/to/project","hook_event_name":"Stop","stop_hook_active":false}' \
  | CLAUDE_PROJECT_DIR=/path/to/project node bin/harness.mjs verify --hook
echo $?   # 宣言済み全検査の成功時は 0（skip は stdout に一覧化）。失敗は 2 とし末尾出力を stderr に表示

# フックを通さずに、同じ検査を 1 回実行する（CI と同じ）
node bin/harness.mjs verify --root /path/to/project --level fast
echo $?   # 成功は 0、失敗は 1

# 回帰テスト（一時ディレクトリのみ。既存のディスク内容には触れない）
node --test 'tools/guard/test/*.test.mjs' 'tools/verify/test/*.test.mjs'
```
