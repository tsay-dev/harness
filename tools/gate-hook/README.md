# gate-hook — develop ゲートの機械的保証（明示選択する Claude Code hooks）

develop skill の説得による停止線を構造にする、二つの hook と一つの共有ログ:

| hook | Claude Code イベント | 阻止するもの | スクリプト |
| --- | --- | --- | --- |
| **実装開始ゲート**（§2） | `PreToolUse` (Write / Edit / NotebookEdit) | UC とその REQs が `active`、契約が `fixed` になる前の実装コードの書き込み | `gate-hook.mjs` |
| **最終ゲート** | `Stop` | spec-lint、trace-check、contract-run、利用プロジェクトの typecheck / lint / test / system が失敗したままのターン終了 | `stop-gate.mjs` |
| **拒否ログ** | （共有） | 全ゲート判断を JSONL 一行ずつ記録し、「このゲートは実際に阻止しているか」をデータで回答 | `gate-log.mjs` |

- **develop 手順はこれらなしでも動く**（§2 は自己検査、spec-lint gate はコミット時の事後検査）。
  hooks は第三の網、**書く瞬間に実際に止める停止線と、終了する瞬間に止める停止線**を追加する。
- **有効化は利用プロジェクトが決める。** harness はスクリプトとこの指示だけを同梱する
  （設定への接続による導入は各プロジェクトの責任。README の「同梱する機械検査」節を参照）。

## gate-hook — 実装開始ゲート（PreToolUse）

1. Write / Edit / NotebookEdit の直前に発火し、対象パスを受け取る。
2. 対象が「実装コード」（`--code` glob に一致）なら、全 `docs/goals/**/UC-*/UC.md` の frontmatter `phase:` を読む（そこが進捗台帳。台帳ファイルはコミットしない、R-1003）。
3. **phase が実装または検証のすべての UC** について、UC が `active`、REQ に `draft` がない、`contract.yaml` が `fixed` であることを検証する。
4. 欠落があれば **exit 2 でツール呼び出しを阻止**し、理由（どの UC に何が欠け、どの phase に戻るか）を stderr で AI に返す。AI の意図にかかわらず停止する。

UC 自身の frontmatter が機械可読のゲート状態なので、**追加の状態ファイルはない**。
orchestrator が SKILL の手順で `phase:` を進める限り、hook はその状態をそのまま判定する。

### 判定規則

| 書き込み対象 | 判定 | ログ記録 |
| --- | --- | --- |
| `docs/` 配下（UC、REQ、契約）、`traceconfig.json`、`.harness-gate/` | 常に許可（SSOT の書き込みはゲートの前提条件） | なし |
| `.claude/` / `.agents/` / `.codex/` / `.cursor/` / `.grok/` / `apm_modules/` / `.harness/` 配下、`--exclude` に一致、または `--code` に不一致 | 許可（ゲート外） | なし |
| 実装コード + `docs/goals` なし | **阻止**（`no-goals` → Phase 1） | あり |
| 実装コード + phase が実装\|検証の UC なし | **阻止**（`no-active-phase`。開始前に UC の `phase:` を進める） | あり |
| 実装コード + 進行中 UC が `active` でない、そこに `draft` REQ がある、または契約欠落 / `fixed` でない | **阻止**（`uc-not-active` / `req-draft` / `contract-missing` / `contract-not-fixed` → Phase 1 / Phase 3） | あり |
| 上記をすべて充足 | 許可（`pass` / `ok`） | あり |

ゲート判定に到達した書き込みだけを記録するため、ログの分母は「ゲート対象の書き込み」であり、阻止率を直接読める。

hook 自身の内部エラー（不正な stdin など）は **fail-open**（許可）。hook のバグでセッションを壊してはならない。
一方、ゲートの判定自体は **fail-closed**。SSOT がなければ停止する。

### 引数（全設定はここに置き、設定ファイルを追加しない）

| 引数 | 意味 |
| --- | --- |
| `--code <glob>` | 実装コード、すなわちゲート対象のパス（繰り返し可、**必須**）。例: `'src/**'` `'app/**'` `'db/schema.*'` |
| `--exclude <glob>` | `--code` から除外するパス（繰り返し可）。例: skeleton の作業場所 `'skeleton/**'` |
| `--docs <dir>` | docs のルート（既定 `docs`） |
| `--log <path>` | 拒否ログ（既定: プロジェクト直下の `.harness-gate/log.jsonl`）。相対パスはプロジェクト直下から解決 |

- `--code` なしの有効化では阻止せず警告のみ（exit 1。誤導入の検出用。`skip` / `misconfig` と記録）。
- glob は `**` / `*` / `?` だけに対応する最小実装（プロジェクト直下からの相対パスと照合）。

## stop-gate — 最終ゲート（Stop）

主 agent のターン終了直前に発火する。利用プロジェクトの検証スイートを実行し、失敗があれば
**exit 2 で終了を阻止**し、失敗ステップの末尾出力を継続理由としてモデルに返す。
モデルは失敗を直して、再度終了を試みる。

### 実行順序

| # | ステップ | 実行条件 | 失敗時 |
| --- | --- | --- | --- |
| 1 | `spec-lint validate --docs <docs>` | 常に | 収集 |
| 2 | `trace-check` | 常に。`traceconfig.json` が無ければ失敗（紐づきの検査は省略できない。ADR-0056） | 収集 |
| 3 | `contract-run` | `traceconfig.json` があれば常に。実行する実例があるのにアダプターが無い場合と skip した例は contract-run 自身が失敗にする | 収集 |
| 4 | `commands.typecheck` → `commands.lint` → `commands.test` | 宣言済みの各キー（なければ `skip: commands.<k> 未宣言`） | 最初の失敗で停止 |
| 5 | `commands.system`（シナリオスイート — ブラウザ / シミュレーター / デバイス — 全体を一度） | 宣言済みでステップ 4 が成功（なければ `skip: commands.system 未宣言`） | 収集 |

全失敗を一度に報告するためステップ 1–3 は常に実行する。型検査を通らないコードのテストはノイズなので
ステップ 4 は早期停止する。ステップ 5 は最も高コストなので既定スイートの成功後のみ実行する。
毎回の終了にはシナリオスイートが遅すぎる利用プロジェクトは `commands.system` を未宣言にして CI のみで実行する。
skip 行がその選択を可視化する。`--timeout` を超えるステップは `timeout:<step>` という失敗になる。

**コマンドは `traceconfig.json` の `commands` ブロックだけから取得し、推測してはならない。** 欠落キーは
stdout にスキップとして報告する（ユーザーへの文脈として表示）。`package.json` などから創作しない。
同梱ツールはこのスクリプト自身のディレクトリから解決するため、`.harness/` から動く。

### スキップ規則と収束

- **変更なし**: `git rev-parse HEAD` + `git status --porcelain` + `git diff HEAD` のハッシュを取る
  （自身の状態ディレクトリは除外）。最終成功時の記録と同じなら `[stop-gate] 変更なし（最終合格 <ts>）` と
  表示して再実行せず終了を許可する。`--force` はこれを無効化する。
- **異なるイベント**: `hook_event_name: "Stop"` 以外は許可し、`skip` / `wrong-event` と記録する。
- **回数上限**: Stop hook の阻止でモデルが既に継続中なら、Claude Code は `stop_hook_active: true` を設定する。
  その状態でセッションが既に `--max-rounds` 回連続失敗したら、再度阻止せず `[stop-gate] 非収束: ...` と
  **解除**する（exit 0）。残る失敗は人間へ渡す。失敗集合が連続二回縮まらない場合（`non-decreasing`）も
  同じく解除する。セッション ID の変更、成功、解除後に回数をリセットする。
- 状態（`last_pass` の指紋、セッションごとの回数と失敗履歴）はログ隣の `state.json` に置く
  （既定 `.harness-gate/state.json`）。利用プロジェクトの `.gitignore` に `.harness-gate/` を追加する。

### fail-open と fail-closed

| 状況 | 結果 |
| --- | --- |
| 検証ステップの失敗またはタイムアウト | **阻止**（exit 2）。ゲート自身の判定は fail-closed |
| stdin が読めない、hook 内の例外 | 許可（exit 0、`internal-error` と記録）。壊れた hook でセッションを壊してはならない |
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
        "matcher": "Write|Edit|NotebookEdit",
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
| `decision` | `block` \| `pass` \| `skip` \| `release` |
| `reason` | gate-hook: `misconfig` `no-goals` `no-active-phase` `uc-not-active` `req-draft` `contract-missing` `contract-not-fixed` `ok`。stop-gate: `ok` `no-changes` `wrong-event` `round-cap` `non-decreasing` `internal-error`、または阻止時の最初の失敗ステップ名（`spec-lint` `trace-check` `contract-run` `typecheck` `lint` `test` `system`、`timeout:<step>`） |
| `target` | gate-hook: root からのゲート対象ファイル相対パス。それ以外は `null` |
| `uc` | gate-hook: 検査した進行中 UC の ID。それ以外は `null` |
| `round` | stop-gate: 阻止 / 解除時の回数。それ以外は `null` |
| `failures` | stop-gate: 阻止 / 解除時の全失敗ステップ名。それ以外は `null` |
| `ms` | 判定にかかったミリ秒 |

### 集計

```bash
node .harness/tools/gate-hook/gate-log.mjs --summary [--log .harness-gate/log.jsonl] [--since 14]
```

hook ごとにゲート対象 / 阻止件数（gate-hook）、実行 / 阻止 / 解除 / スキップ件数（stop-gate）、
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
  意図的に対象外とする。
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
