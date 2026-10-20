# gate-hook — develop ゲートの機械的保証（明示選択する Claude Code hooks）

develop skill の説得による停止線を構造にする、二つの hook と一つの共有ログ:

| hook | Claude Code イベント | 阻止するもの | スクリプト |
| --- | --- | --- | --- |
| **実装開始ゲート**（§2） | `PreToolUse` (Write / Edit / MultiEdit / NotebookEdit) | UC とその REQs が `active`、契約が `fixed` になる前の実装コードの書き込み。検査の範囲・検査器・hook の設定・workflow・docs の status の変更は人間の承認に掛ける | `gate-hook.mjs` |
| **最終ゲート** | `Stop` | spec-lint、trace-check、contract-run、利用プロジェクトの typecheck / lint / test / system が失敗したままのターン終了 | `stop-gate.mjs` |
| **拒否ログ** | （共有） | 全ゲート判断を JSONL 一行ずつ記録し、「このゲートは実際に阻止しているか」をデータで回答 | `gate-log.mjs` |

- **develop 手順はこれらなしでも動く**（§2 は自己検査、spec-lint gate はコミット時の事後検査）。
  hooks は第三の網、**書く瞬間に実際に止める停止線と、終了する瞬間に止める停止線**を追加する。
- **有効化は利用プロジェクトが決める。** harness はスクリプトとこの指示だけを同梱する
  （設定への接続による導入は各プロジェクトの責任。README の「同梱する機械検査」節を参照）。

## gate-hook — 実装開始ゲート（PreToolUse）

1. Write / Edit / MultiEdit / NotebookEdit の直前に発火し、対象パスを受け取る。
2. 対象が「実装コード」（`--code` glob に一致）なら、全 `docs/goals/**/UC-*/UC.md` の frontmatter `phase:` を読む（そこが進捗台帳。台帳ファイルはコミットしない、R-1003）。
3. **phase が実装または検証のすべての UC** について、UC が `active`、REQ に `draft` がない、`contract.yaml` が `fixed` であることを検証する。
4. 欠落があれば **exit 2 でツール呼び出しを阻止**し、理由（どの UC に何が欠け、どの phase に戻るか）を stderr で AI に返す。AI の意図にかかわらず停止する。

UC 自身の frontmatter が機械可読のゲート状態なので、**追加の状態ファイルはない**。
orchestrator が SKILL の手順で `phase:` を進める限り、hook はその状態をそのまま判定する。

### 判定規則

上の行から順に、最初に当たったものを適用する。パスの比較は大文字小文字を無視する（`--code` / `--exclude` / `--docs` も。大文字小文字を区別しないファイルシステムで `Docs/` や `Src/` から書いて素通りしないように）。

| 書き込み対象 | 判定 | ログ記録 |
| --- | --- | --- |
| `.harness-gate/` 配下 | **阻止**（exit 2）。ログと stop-gate の状態はフック自身だけが書く | あり（`block` / `harness-gate`） |
| `**/traceconfig.json`（unit の traceconfig も） | 止めずに人間の承認を求める（`permissionDecision: "ask"`）。検査の範囲（none の宣言、注釈の正規表現、`commands`）を決め、書き換えれば検査を外せるため（ADR-0057） | あり（`ask` / `traceconfig`） |
| `.harness/**`（検査器そのもの） | 人間の承認を求める | あり（`ask` / `harness`） |
| `.claude/settings*.json` と、`.codex/` `.cursor/` `.grok/` `.agents/` 直下の `*.json` / `*.toml`（hook の設定。プロジェクト外のユーザー設定 `~/.claude/settings.json` なども） | 人間の承認を求める | あり（`ask` / `hook-settings`） |
| `.github/workflows/**` | 人間の承認を求める | あり（`ask` / `workflow`） |
| `docs/` 配下で status の降格（`active` / `fixed` / `living` / `frozen` から、それ以外の値・status 行の削除・引用符を付けた値などの語彙の外の値へ）と、判定中の例外 | 人間の承認を求める。検査の義務を減らすため。契約の `x-status` は共有の厳格 YAML パーサーで読む（他のツールと同じ値） | あり（`ask` / `status-down`） |
| アクター表（traceconfig の `docs.actors`、無ければ `docs/02-actors.md`）で人間のアクターを削除する、種別を「システム」に変える、または active な `UC.md` の `actor:` を変える | 人間の承認を求める。シナリオテスト（C15）の義務を減らすため | あり（`ask` / `actor-kind`） |
| `docs/` 配下で `UC.md` の `active`、契約の `fixed` への昇格（新規作成で書く場合も） | 人間の承認を求める。実装着手ゲートを開ける人間ゲートを agent が自力で開けないため | あり（`ask` / `status-up-gate`） |
| `docs/` 配下でそれ以外の昇格（REQ / BR / NFR / GOAL の `draft` → `active`、単一文書の `draft` → `living` / `frozen`）と、status を持つ新規作成 | 許可 | あり（`pass` / `status-up`） |
| `docs/` 配下でそれ以外（status が変わらない、status を持たない新規ファイル、`draft` ↔ `withdrawn` など義務の増減を伴わない変更） | 許可（SSOT の書き込みはゲートの前提条件） | なし |
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
- glob は `**` / `*` / `?` だけに対応する最小実装（`tools/_shared/glob.mjs`。プロジェクト直下からの相対パスと照合）。frontmatter は `tools/_shared/frontmatter.mjs` で読む（spec-lint / trace-check と同じ読み方）。

## stop-gate — 最終ゲート（Stop）

主 agent のターン終了直前に発火する。利用プロジェクトの検証スイートを実行し、失敗があれば
**exit 2 で終了を阻止**し、失敗ステップの末尾出力を継続理由としてモデルに返す。
モデルは失敗を直して、再度終了を試みる。

### 実行順序

| # | ステップ | 実行条件 | 失敗時 |
| --- | --- | --- | --- |
| 1 | `spec-lint validate --docs <docs>` | 常に | 収集 |
| 2 | `trace-check --root <root> --config <traceconfig>` | 常に。`traceconfig.json` が無ければ失敗（紐づきの検査は省略できない。ADR-0056）。JSON として読めなければ `traceconfig` の失敗 | 収集 |
| 3 | `contract-run --root <root> --config <traceconfig> --docs <docs>` | `traceconfig.json` があれば常に。実行する実例があるのにアダプターが無い場合と skip した例は contract-run 自身が失敗にする | 収集 |
| 4 | `commands.typecheck` → `commands.lint` → `commands.test` | 文字列のコマンドなら実行、`{ "none": "<理由>" }` なら理由を表示して skip | 最初の失敗で停止 |
| 5 | `commands.system`（シナリオスイート — ブラウザ / シミュレーター / デバイス — 全体を一度） | ステップ 4 が成功し、コマンドが宣言されている（none なら理由を表示して skip） | 収集 |

全失敗を一度に報告するためステップ 1–3 は常に実行する。型検査を通らないコードのテストはノイズなので
ステップ 4 は早期停止する。ステップ 5 は最も高コストなので既定スイートの成功後のみ実行する。
毎回の終了にはシナリオスイートが遅すぎる利用プロジェクトは `commands.system` を `{ "none": "<理由>" }` にして CI のみで実行する。
skip 行がその選択と理由を可視化する。`--timeout` を超えるステップは `timeout:<step>` という失敗になる。

**`commands` の `typecheck` / `lint` / `test` / `system` は宣言が必須。** それぞれ文字列のコマンドか `{ "none": "<理由>" }` で、
欠落・理由の無い none・それ以外の型は、例外ではなく失敗の 1 項目（`commands.<k>`）になる。黙った skip を作らない。
`traceconfig.json` が `tests` を none でなく宣言しているなら（monorepo では unit のどれかが宣言しているなら）、`commands.test` は none にできない。
**コマンドは `traceconfig.json` の `commands` ブロックだけから取得し、推測してはならない。** `package.json` などから創作しない。
同梱ツールはこのスクリプト自身のディレクトリから解決するため、`.harness/` から動く。

### monorepo（`git.units`）

`traceconfig.json` に `git.units`（`{ 単位名: ディレクトリ }`）があれば、ルートではステップ 1–3 を実行せず、unit ごとに実行する。

| unit の状態 | 扱い |
| --- | --- |
| `<dir>/traceconfig.json` がある | `spec-lint validate --docs <dir>/docs`、`trace-check --root <dir> --config <dir>/traceconfig.json`、`contract-run --root <dir> --config <dir>/traceconfig.json --docs <dir>/docs`。失敗名は `<step>:<unit>` |
| docs も traceconfig も無い | `docs なし` と表示するだけ |
| docs を持つのに traceconfig が無い | 失敗（`trace-check:<unit>`） |

ステップ 4–5 の `commands` はルートの `traceconfig.json` のものを使う。CI（`.github/workflows/spec-gate.yml`）の spec-lint / trace-check も同じ規則で unit ごとに実行する。

### スキップ規則と収束

- **変更なし**: `git rev-parse HEAD` + `git status --porcelain` + `git diff HEAD` に、未追跡ファイル
  （`git ls-files -o --exclude-standard`）の中身、`traceconfig.json`（unit のものも。ignore されていても）、
  使う harness ツール（`spec-lint.mjs`、`trace-check.mjs`、`contract-run.mjs`、`tools/_shared/*.mjs`）を加えたハッシュを取る
  （自身の状態ディレクトリは除外）。最終成功時の記録と同じなら `[stop-gate] 変更なし（最終合格 <ts>）` と
  表示して再実行せず終了を許可する。`--force` はこれを無効化する。
- **異なるイベント**: `hook_event_name: "Stop"` 以外は許可し、`skip` / `wrong-event` と記録する。
- **回数上限**: Stop hook の阻止でモデルが既に継続中なら、Claude Code は `stop_hook_active: true` を設定する。
  その状態でセッションが既に `--max-rounds` 回連続失敗したら、再度阻止せず**解除**する（exit 0）。
  解除したときは stdout に `{"systemMessage": "[stop-gate] 終端ゲートが通らないまま解放した…。失敗: …"}` だけを出し、
  Claude Code が利用者に表示する。残る失敗は人間へ渡す。失敗集合が連続二回縮まらない場合（`non-decreasing`）も
  同じく解除する。セッション ID の変更、成功、解除後に回数をリセットする。
- 状態（`last_pass` の指紋、セッションごとの回数と失敗履歴）はログ隣の `state.json` に置く
  （既定 `.harness-gate/state.json`）。gate-hook が `.harness-gate/` への Write / Edit を止める。利用プロジェクトの `.gitignore` に `.harness-gate/` を追加する。

### 阻止したときの指示

阻止時の stderr は、失敗ごとの末尾出力に続けて次を求める: 直せる失敗は直し、修正範囲を再検証してから終了する。
人間ゲート待ちや後続の担当の成果物でしか直せない失敗は、未達として報告して終える。
`traceconfig.json` を緩めて（none にする、範囲を狭める）通さない。

### fail-open と fail-closed

| 状況 | 結果 |
| --- | --- |
| 検証ステップの失敗またはタイムアウト、`traceconfig.json` の構文の誤り、`commands` の欠落・型の誤り | **阻止**（exit 2）。ゲート自身の判定は fail-closed |
| stdin が読めない | 許可（exit 0、`skip` / `internal-error` と記録）。入口の不具合でセッションを壊してはならない |
| stdin を読めた後の hook 内の例外 | **阻止**（exit 2、`block` / `internal-error`）。回数を数え、`stop_hook_active` で上限に達していれば解除する（状態を保存できず数えられないときも、継続中なら解除）。無限ループを避ける |
| 未知の `--` 引数 | 使用法の行付き exit 2（誤導入は即座に見える必要がある） |

### 引数

| 引数 | 意味 |
| --- | --- |
| `--docs <dir>` | spec-lint に渡す docs ルート（既定 `docs`） |
| `--config <path>` | trace 設定（既定: プロジェクト直下の `traceconfig.json`） |
| `--log <path>` | 拒否ログ（既定 `.harness-gate/log.jsonl`）。同じディレクトリに `state.json` を保持 |
| `--max-rounds <n>` | 人間へ解除するまでのセッションごとの連続阻止回数（既定 `2`） |
| `--timeout <sec>` | ステップごとのタイムアウト（既定 `300`）。設定の hook 自身の `timeout` は予想合計より大きくする |
| `--tail <n>` | モデルへ返す各失敗ステップの出力行数（既定 `15`） |
| `--force` | 最終成功時からツリーが未変更でも再実行 |

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
            "command": "node \"$CLAUDE_PROJECT_DIR/.harness/tools/gate-hook/gate-hook.mjs\" --code 'src/**' --code 'app/**'"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/.harness/tools/gate-hook/stop-gate.mjs\"",
            "timeout": 600
          }
        ]
      }
    ]
  }
}
```

`Stop` 項目に `matcher` はなく、毎回の終了で発火する。各 hook は単独でも導入できる。

明示選択するこれらの hooks は利用プロジェクトの `.claude/settings.local.json` に置く。生成プロンプトディレクトリを修正したり、`settings.json` を規約ルーターにしたりしない。

## 拒否ログ

両 hooks は判定ごとに JSON 一行を `.harness-gate/log.jsonl` へ追加する（`--log` で変更）。
ログ記録の失敗でゲートを止めてはならない。記録形状（キーはこの固定順）:

| キー | 値 |
| --- | --- |
| `ts` | ISO タイムスタンプ |
| `hook` | `gate-hook` \| `stop-gate` |
| `event` | `PreToolUse` \| `Stop` |
| `session` | Claude Code の `session_id`、または `null` |
| `decision` | `block` \| `pass` \| `skip` \| `release` \| `ask`（gate-hook が止めずに人間の承認を求めた） |
| `reason` | gate-hook: 実装ゲートは `misconfig` `no-goals` `no-active-phase` `uc-not-active` `req-draft` `contract-missing` `contract-not-fixed` `internal-error` `ok`。ask は `traceconfig` `harness` `hook-settings` `workflow` `status-down` `status-up-gate` `actor-kind`。`pass` / `status-up`（docs の status の昇格・新規作成）、`block` / `harness-gate`（`.harness-gate/` への書き込み）。stop-gate: `ok` `no-changes` `wrong-event` `round-cap` `non-decreasing` `internal-error`、または阻止時の最初の失敗名（`spec-lint` `trace-check` `contract-run` `traceconfig` `commands.<k>` `typecheck` `lint` `test` `system`、`timeout:<step>`、monorepo では `<step>:<unit>`） |
| `target` | gate-hook: root からのゲート対象ファイル相対パス。それ以外は `null` |
| `uc` | gate-hook: 検査した進行中 UC の ID。それ以外は `null` |
| `round` | stop-gate: 阻止 / 解除時の回数。それ以外は `null` |
| `failures` | stop-gate: 阻止 / 解除時の全失敗ステップ名。それ以外は `null` |
| `ms` | 判定にかかったミリ秒 |

### 集計

```bash
node .harness/tools/gate-hook/gate-log.mjs --summary [--log .harness-gate/log.jsonl] [--since 14]
```

hook ごとにゲート対象 / 阻止件数と ask の内訳・`status-up`・`harness-gate` の件数（gate-hook）、実行 / 阻止 / 解除 / スキップ件数（stop-gate）、
阻止理由の内訳を表示し、期間内に阻止ゼロの hook の後に `降格候補` 印を付ける。

同じ確認のための `jq` 一行:

```bash
jq -r 'select(.decision=="block") | "\(.ts) \(.hook) \(.reason) \(.target // (.failures|join(",")))"' .harness-gate/log.jsonl
```

**規則:** 実使用で約 14 日間阻止ゼロのゲートは降格候補。何も検出せず待ち時間だけを増やしている可能性がある。
降格するか保険として残すかは、このデータを見て人間が判断する。ツールは件数だけを示す。

## 制約（理解したうえで使う）

- **シナリオスイート（`e2e/**`、`UITests/**`）は `--code` に含めない。** UC が `active`、契約が `fixed` に
  なったら実装とともにシナリオテストを書くため、ここへのゲートはノイズだけを増やす。Stop gate と
  `trace-check` C15 が担当する。
- **Bash（`sed -i`、リダイレクトなど）の書き込みは PreToolUse ゲートをそのまま通る。** matcher は
  Write/Edit 系だけに適用する。Bash も阻止する設計は誤検出が多すぎる（ビルドとテストを妨げる）ため、
  意図的に対象外とする。traceconfig / status / 検査器 / workflow の ask も同じで、Bash や Claude Code 以外の
  プロバイダーでの変更は止まらない。CI（spec-gate.yml）が PR のジョブ要約にそれらの変更を出すので、
  merge 時に CODEOWNERS とブランチ保護で必須レビューにする（ADR-0057）。
- **docs の status の判定は `--docs` の 1 か所だけ。** monorepo の unit の docs（`apps/a/docs` など）の status の変更は ask しない。
- PreToolUse では**どちらの hook も主 agent と子 agent を区別しない**。実装作成者の正当な Write も
  同じ検査を通るが、正当な実装は UC、REQs、契約が揃ってからのみ行うので追加の網は害を与えない
  （実際、逸脱する作成者も止める）。
- **子 agent の終了では `Stop` は発火しない**（それは `SubagentStop` で、stop-gate は無視する）。
  最終ゲートは主 agent のターンだけを判定する。
- **スイート実行時間は利用プロジェクトの責任。** stop-gate は変更のある毎回の終了時に `commands` の
  宣言を実行する。宣言コマンドを速くするか範囲を絞り、`--timeout` / hook の `timeout` を合わせる。
  遅いスイートは全ターンを遅くする。
- **git なしでは stop-gate は毎回実行する。** 変更検出には少なくとも一コミットの repository が必要。
- **walking skeleton**（§3。契約固定前に動作を書く明示的な例外）は本流のコードツリー外（例: `skeleton/`）で
  作業し、`--exclude` で除外するか、ゲート対象 glob 外に置く。
- UC の `phase:` や status が実態とずれたら PreToolUse 判定もずれる。
  spec-lint（`../spec-lint/`）と trace-check（`../trace-check/`）がコミット時に整合を確認する。

## 動作確認

```bash
# PreToolUse ゲート
echo '{"tool_input":{"file_path":"src/x.js"},"cwd":"/path/to/project","session_id":"manual"}' \
  | node tools/gate-hook/gate-hook.mjs --code 'src/**'
echo $?   # 進行中 UC、REQs、契約がすべて揃っていなければ 2（阻止理由は stderr）

# Stop ゲート
echo '{"session_id":"manual","cwd":"/path/to/project","hook_event_name":"Stop","stop_hook_active":false}' \
  | CLAUDE_PROJECT_DIR=/path/to/project node tools/gate-hook/stop-gate.mjs
echo $?   # 宣言済み全検査の成功時は 0（skip は stdout に一覧化）。失敗は 2 とし末尾出力を stderr に表示

# 回帰テスト（一時ディレクトリのみ。既存のディスク内容には触れない）
node --test 'tools/gate-hook/test/*.test.mjs'
```
