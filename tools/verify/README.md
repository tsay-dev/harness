# verify — 完了の判定

プロジェクトの検証一式（検査の並び）を実行する（`harness verify`）。動かし方は 2 つあり、実行する検査は同じ。

| 動かし方 | 使う場面 | 通らなかったとき |
| --- | --- | --- |
| `harness verify` | CI と手元。並びを 1 回実行して結果を表示する。状態もログも残さない | exit 1 |
| `harness verify --hook` | Claude Code の Stop フック。主 agent がターンを終える直前に実行する | exit 2 で終了を阻止し、失敗した検査の出力の末尾をモデルに返す |

hook の設定例（`.claude/settings.local.json`）、拒否ログ、hook を使ううえでの制約は、書き込み前の関門（`harness guard`）と共通で、`../guard/README.md` が正本。

## 実行する検査

検査の並びは `../_shared/suite.mjs` の 1 か所にあり、Stop フック（`harness verify --hook`）と、CI・手元から呼ぶ `harness verify` が同じものを実行する。フックで通って CI で落ちる食い違いを作らないためである。

| # | 検査 | 実行する level | 失敗時 |
| --- | --- | --- | --- |
| 1 | `lint config --config <設定ファイル>`（設定の形。ルートで 1 回。unit の設定も lint config が読む） | lint 以上 | 収集 |
| 2 | `lint spec --docs <docs>` | lint 以上 | 収集 |
| 3 | `lint refs --root <root> --config <設定ファイル>`、続けて `lint entry`（テストの入口が、本番と同じ組み立てを呼んでいるか）。`commands.list_entries` がコマンドでない（未宣言・none）ときは、`lint entries` もここで実行する（none にできるかは、契約を読めば分かる） | lint 以上 | 収集 |
| 4 | `commands.list_entries`（アプリの入口の一覧を出す。unit のディレクトリで実行し、標準出力だけを一時ファイルに書く） → `lint entries --from <一時ファイル>`（契約に無い入口と、入口の無い操作）。コマンドが失敗したら、失敗の名前は `list_entries` で、突き合わせは実行しない。`a | b` の形のコマンドは、シェルが対応していれば pipefail を付けて実行する（左側の失敗も失敗にする）。止められたときも一時ファイルを残さない。monorepo では unit の設定のコマンドを unit のディレクトリで実行する。続けて `run cases --root <root> --config <設定ファイル> --docs <docs>`。実行する実例があるのにアダプターが無い場合と skip した例は、run cases 自身が失敗にする | fast 以上 | 収集 |
| 5 | `commands.typecheck` → `commands.lint` → `commands.test` → `lint coverage`（`test` が書いた実行の記録を読む。`test` が通ったときだけ） → `commands.extra` の各コマンド（書いた順） | fast 以上 | 最初の失敗で停止 |
| 6 | `commands.system`（シナリオテスト全件。ブラウザ / シミュレーター / 実機） | full | 5 が通ったときだけ実行 |

`--level` で、どこまで実行するかを選ぶ（既定は `full`）。

| level | 実行するもの | 使いどころの例 |
| --- | --- | --- |
| `lint` | 1〜3。読むだけで、利用プロジェクトのコマンドは実行しない | テストが遅く、ターンの終わりごとには回せないプロジェクトの Stop フック |
| `fast` | 1〜5 | Stop フック、PR ごとの CI |
| `full` | 1〜6 | マージ前の CI、手元での最終確認 |

- level で実行しなかった検査は、`[verify] skip: …（--level lint では実行しない）` と表示する。黙って省かない。
- 全失敗を一度に報告するため、1〜4 は（level が実行するものを）全部実行する。型検査を通らないコードのテストはノイズなので、5 は最初の失敗で止める。
- `--timeout` を超えた検査は `timeout:<検査>` という失敗になる。超えたコマンドは、シェルの子として動くテストランナーごと（プロセスグループごと）止める。`--timeout 0` は制限なし。
- `commands.extra` の形が誤っているときは、extra から先（`system` も）を実行しない。
- 設定（`harness.config.json`）が無ければ失敗（紐づきの検査は省略できない。ADR-0056）。JSON として読めなければ `config` の失敗。

**`commands` の `typecheck` / `lint` / `test` / `system` は宣言が必須。** それぞれ文字列のコマンドか `{ "none": "<理由>" }` で、
欠落・理由の無い none・それ以外の型は、例外ではなく失敗の 1 項目（`commands.<k>`）になる。黙った skip を作らない。宣言の検査は、どの level でも行う。
設定が `tests` を none でなく宣言しているなら、その設定の `commands.test` は none にできない。
`commands.extra` は、4 つのほかに実行するコマンドを `{ "<名前>": "<コマンド>" }` で書く（省略できる）。`test` の後、`system` の前に、書いた順で実行する。
**コマンドは設定の `commands` だけから取得し、推測してはならない。** `package.json` などから創作しない。
検査の並びが実行するコマンドのファイルは、このコマンド自身の置き場（`tools/`）から決まるので、`.harness/` から動く。

## monorepo（`git.units`）

設定に `git.units`（`{ 単位名: ディレクトリ }`）があれば、1 をルートで実行した後、2〜6 を unit ごとに実行する。

| unit の状態 | 扱い |
| --- | --- |
| `<dir>/harness.config.json` がある | 2〜4 を `<dir>/docs` と `<dir>/harness.config.json` で実行し、5〜6 は unit の設定の `commands` を `<dir>` で実行する。失敗の名前は `<検査>:<unit>` |
| docs も設定も無い | `docs なし` と表示するだけ |
| docs を持つのに設定が無い | 失敗（`lint refs:<unit>`） |
| 古い名前（`traceconfig.json`）のファイルだけがある | 失敗（改名の案内付き） |

- unit の `commands` も、4 キーの宣言が必須。ある unit のコマンドが失敗しても、ほかの unit は検査する。
- ルートの設定に `commands` があれば、unit の後にルートで実行する（リポジトリ全体に掛ける検査）。monorepo のルートでは、`commands` は無くてもよい。
- `--unit <名前>`（複数可）で、検査する unit を絞れる。絞ったときは、ルートの `commands` は実行しない。宣言に無い名前は失敗。

## 1 回の実行（CI・手元）

```bash
node .harness/bin/harness.mjs verify [--level lint|fast|full] [--unit <名前>]... [--root <プロジェクトのルート>] [--timeout 300] [--tail 15] [--verbose]
```

Stop フックと同じ検査を、標準入力もラウンドの記録も使わずに 1 回実行する。状態もログも残さない。終了コードは、すべて通過で 0、失敗があれば 1、使い方の誤りで 2。
失敗した検査の名前と出力の末尾は、標準エラー出力に出す。`--verbose` を付けると、実行した検査の出力を、通ったものも含めて全部表示する（lint spec の警告や、違反の一覧の全体を CI のログに残す）。`--config` の相対パスは、実行したディレクトリから探す（Stop フックではプロジェクトのルートから）。止められたら（SIGINT / SIGTERM / SIGHUP / SIGQUIT）、実行中のコマンドをプロセスグループごと止め、残りを実行せずに同じシグナルで終わる。

CI では、再利用ワークフロー `.github/workflows/verify.yml` が `harness verify --verbose` を実行する。既定の level は `lint`。テストまで CI で実行するなら、`with:` に `level: fast`（または `full`）と、依存を入れる `setup_command`（例: `npm ci`）を渡す。

## Stop フック（`--hook`）

主 agent のターン終了直前に発火する。利用プロジェクトの検証スイートを実行し、失敗があれば
**exit 2 で終了を阻止**し、失敗ステップの末尾出力を継続理由としてモデルに返す。
モデルは失敗を直して、再度終了を試みる。

### スキップ規則と収束

- **変更なし**: `git rev-parse HEAD` + `git status --porcelain` + `git diff HEAD` に、未追跡ファイル
  （`git ls-files -o --exclude-standard`）の中身、`harness.config.json`（unit のものも。ignore されていても）、
  検査の並びが実行するコマンドのファイル（lint config・lint spec・lint refs・lint entry・lint entries・lint coverage・run cases）と共有の処理（`tools/_shared/*.mjs`）、
  `--level` と `--unit` の指定を加えたハッシュを取る
  （自身の状態ディレクトリは除外）。最終成功時の記録と同じなら `[verify] 変更なし（最終合格 <ts>）` と
  表示して再実行せず終了を許可する。`--force` はこれを無効化する。
- **異なるイベント**: `hook_event_name: "Stop"` 以外は許可し、`skip` / `wrong-event` と記録する。
- **回数上限**: Stop hook の阻止でモデルが既に継続中なら、Claude Code は `stop_hook_active: true` を設定する。
  その状態でセッションが既に `--max-rounds` 回連続失敗したら、再度阻止せず**解除**する（exit 0）。
  解除したときは stdout に `{"systemMessage": "[verify] 終端ゲートが通らないまま解放した…。失敗: …"}` だけを出し、
  Claude Code が利用者に表示する。残る失敗は人間へ渡す。前のラウンドから進んでいない場合（`non-decreasing`。直前に落ちた検査が今回もすべて落ちている、または落ちる検査の組が前のものへ戻った）も、上限を待たずに
  同じく解除する（`--max-rounds` を 3 以上にしたときに働く。既定の 2 では、上限と同じ回で解除される）。セッション ID の変更、成功、解除後に回数をリセットする。
- 状態（`last_pass` の指紋、セッションごとの回数と失敗履歴）はログ隣の `state.json` に置く
  （既定 `.harness-gate/state.json`）。guard が `.harness-gate/` への Write / Edit を止める。利用プロジェクトの `.gitignore` に `.harness-gate/` を追加する。

### 阻止したときの指示

阻止時の stderr は、失敗ごとの末尾出力に続けて次を求める: 直せる失敗は直し、修正範囲を再検証してから終了する。
人間ゲート待ちや後続の担当の成果物でしか直せない失敗は、未達として報告して終える。
設定（`harness.config.json`）を緩めて（none にする、範囲を狭める）通さない。

### fail-open と fail-closed

| 状況 | 結果 |
| --- | --- |
| 検証ステップの失敗またはタイムアウト、`harness.config.json` の構文の誤り、`commands` の欠落・型の誤り | **阻止**（exit 2）。ゲート自身の判定は fail-closed |
| stdin が読めない | 許可（exit 0、`skip` / `internal-error` と記録）。入口の不具合でセッションを壊してはならない |
| stdin を読めた後の hook 内の例外 | **阻止**（exit 2、`block` / `internal-error`）。回数を数え、`stop_hook_active` で上限に達していれば解除する（状態を保存できず数えられないときも、継続中なら解除）。無限ループを避ける |
| 未知の `--` 引数 | 使用法の行付き exit 2（誤導入は即座に見える必要がある） |

### 引数

| 引数 | 意味 |
| --- | --- |
| `--level <lint\|fast\|full>` | どこまで実行するか（既定 `full`） |
| `--unit <名前>` | monorepo で、検査する unit（複数可。省略すると全 unit） |
| `--ignore-legacy-layout` | 旧レイアウト（`docs/specs/`）が残っていても検査を続ける（lint spec へ渡す。移行中だけ） |
| `--docs <dir>` | lint spec に渡す docs ルート（既定 `docs`） |
| `--config <path>` | trace 設定（既定: プロジェクト直下の `harness.config.json`） |
| `--log <path>` | 拒否ログ（既定 `.harness-gate/log.jsonl`）。同じディレクトリに `state.json` を保持 |
| `--max-rounds <n>` | 人間へ解除するまでのセッションごとの連続阻止回数（既定 `2`） |
| `--timeout <sec>` | ステップごとのタイムアウト（既定 `300`）。設定の hook 自身の `timeout` は予想合計より大きくする |
| `--tail <n>` | モデルへ返す各失敗ステップの出力行数（既定 `15`） |
| `--force` | 最終成功時からツリーが未変更でも再実行 |

## テスト

```bash
node --test 'tools/verify/test/*.test.mjs'
```
