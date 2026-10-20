# contract-run

harness に同梱する依存なしの Node ツール。利用プロジェクトの実装に対して境界契約を**実行**する。
`../spec-lint/` は契約の*書式*、`../trace-check/` は docs とコードの*参照*の解決を証明する。
このツールは残る隔たり、すなわち実装が契約どおりに応答することを確認する。

## 検査内容

すべての `fixed` 契約（`docs/goals/**/UC-*/contract.yaml`）は、操作ごとに実値の `examples` を持つ。
少なくとも成功例一つと、各 `errors[].code` の失敗例一つがある（spec-lint が保証）。それらを fixture とする。
contract-run は各例を**利用プロジェクトが書いたアダプタープロセス**で実装へ渡し、応答を例に照らして判定する。

- 成功例（`response:` があり `error:` がない）は、例の response を含む形状の response を返す必要がある
  （部分集合の一致。下記参照）。
- 失敗例（`error: CODE`）は、正確にそのコードの error を返す必要がある。

これにより、agent が両方を読む代わりに機械で契約 ↔ 実装の接続を検査する。意味は検査しない。
一致する `response: { status: ok }` は形状を証明するが、その背後の REQ の充足は証明しない。
それは各 REQ の `## 検証方針` に宣言したテストの担当。

## 使い方

```bash
node tools/contract-run/contract-run.mjs [--root <host root>] [--config traceconfig.json] [--docs docs]
                                          [--uc UC-012 ...] [--all] [--include-external] [--json] [--timeout 120]
```

| フラグ | 意味 |
| --- | --- |
| `--root` | 利用プロジェクト直下（既定: 現在のディレクトリ）。アダプターはここを cwd に実行 |
| `--config` | 読む `traceconfig.json`（既定: `<root>/traceconfig.json`）。設定欠落は exit `2`。探索はしない |
| `--docs` | root からの docs 相対ディレクトリ（既定: `docs`）。契約は `<docs>/goals/**/UC-*/contract.yaml` 配下で探す |
| `--uc` | `x-uc` が一致する契約だけ（繰り返し指定、またはカンマ区切り） |
| `--all` | `draft` 契約も実行（既定: `x-status: fixed` のみ） |
| `--include-external` | `owned: false` 操作も実行（既定: `owned: true` のみ）。外部境界は写しであり自身のものではないため明示選択 |
| `--json` | テキストの代わりに `{ results: [{uc, operation, case, verdict, detail}], summary: {pass, fail, skip} }` を表示 |
| `--timeout` | アダプターを含む全実行の秒数（既定 `120`） |

テキスト出力は例ごとに一行、続いて集計:

```
pass  UC-012 createItem.ok
fail  UC-012 createItem.ok  items[0].status: 期待 "ok" / 実際 "pending"
pass  UC-012 createItem.invalid  error INVALID_INPUT
skip  UC-012 openItem.ok  XCTest 経由でのみ到達可能
pass 2 / fail 1 / skip 1 (skip は検査されていないので失敗に数える)
```

終了コード: `0` = `fail` も `skip` もない / `1` = 一つ以上の `fail` か `skip`、または実行する実例があるのにアダプターが無い /
`2` = 設定またはアダプターエラー（`traceconfig.json` 欠落、解析不能な契約、アダプターの異常終了 /
タイムアウト / プロトコル違反）。`operations: {}` の操作は表示せずスキップする。
`response` も `error` もない例は、それ自体を `fail` として報告する（不正な例。アダプターへは送らない）。

`commands.contract_adapter` が**未宣言**で、実行する実例があれば失敗（`1`）にする（ADR-0056）:

```
[contract-run] commands.contract_adapter 未宣言: 実行する実例が 2 件あるのに実行できない（アダプタを書いて宣言する）
```

実行する実例が 1 件も無い（fixed 契約が無い、すべて `operations: {}` など）ときだけ、アダプターなしで `0` で終える。
利用プロジェクトがアダプター作成前に harness の残りを導入でき、接続が検証済みだと装わないためのもの。

## アダプターの契約

アダプターだけが利用プロジェクトの実装への到達方法を知る。contract-run は:

1. `commands.contract_adapter` を**一実行につき一度**起動する（`shell: true`、`cwd` = 利用プロジェクト直下）。
2. **例ごとに JSON 一行**を契約順で stdin に書き、stdin を閉じる。
3. stdout を**一行ずつ**読み、`id` でリクエストと応答を対応付ける。
4. 終了を待つ。

リクエスト行（例ごとに一つ）:

```json
{"id":1,"uc":"UC-012","operation":"createItem","transport":"http","direction":"outbound","owned":true,
 "auth":"bearer","wire":{"method":"POST","path":"/items","success":201},"entry":null,
 "request":{"title":"abc"},"case":"ok"}
```

契約に `wire`、`entry`、`request` がない場合は `null`。`auth` は契約の scheme 名
（`none` または `_shared` の `authSchemes` キー）。

応答行 — リクエストの `id` を付け、次の三つのうち正確に一つ:

```json
{"id":1,"response":{"id":42,"status":"ok"}}
{"id":1,"error":"INVALID_INPUT"}
{"id":1,"skip":"XCTest 経由でのみ到達可能"}
```

規則:

- 応答順序は任意だが、各リクエストには正確に一つの応答が必要。欠落 / 未知 / 重複の `id`、
  stdout の非 JSON 行、`response` / `error` / `skip` が一つもない応答、非ゼロ終了は**アダプターエラー**。
  exit `2` とし、診断用にアダプター stderr の末尾 20 行を表示する。
- アダプター自身の出力は **stderr** へ。stdout はプロトコルの経路。
- `skip` には一行の理由を入れる。skip した例は失敗に数える（紐づきに例外を作らない。ADR-0056）。
- アダプターは契約を読む必要がない。振り分けに必要なすべてをリクエスト行が持つ。

## アダプターの作成

アダプターは利用プロジェクトのコードで、その repository に置く（例: `scripts/contract-adapter.ts`）。
小さな振り分け器として、stdin を一行ずつ読み、`operation`（UC 間で名前が重複するなら `uc` も）で実装を選び、
呼び出して結果を応答に変換する。スタックごとの指針:

- **Next.js** — route handler または server action を直接 import し、**プロセス内**で呼ぶ。
  `request` から `Request`（または action の引数）を構築し、例同士が依存しないようメモリー内または
  トランザクション内のテスト DB で実行し、JSON body を `response` に読む。throw された domain error や
  エラー body を契約 `code` に変換する（利用プロジェクトには既に単一エラーコード正本 — `traceconfig.json` の
  `contract.error_source` — があるので、通常は一行の対応）。開発サーバーを起動して HTTP で呼ばない。
  目的はネットワークでなく境界の形状。
- **PHP（Crow / 素の PHP）** — フレームワークを一度初期化し、操作を所有するモジュールを読み込み、
  デコードした `request` で action 関数を呼ぶ。返った配列 / throw された例外を捕捉して `response` / `error` に
  変換する。例ごとにロールバックするトランザクションか使い捨て DB を使う。
- **Swift / SwiftUI** — 通常の実行可能 target（SwiftPM ライブラリの use-case 型）から到達できる操作はそこで呼ぶ。
  XCTest **のみ**で到達できる操作（UI に結合したコード、デバイス機能）は、ライブラリ target から呼べる形に
  境界を切り出す。`skip` は失敗に数えるので、到達できないままにはできない。
- **外部境界**（`owned: false`）— `--include-external` の場合だけ記録済み fixture または sandbox アカウントで実行し、
  本番には接続してはならない。既定では `owned: false` の操作は実行しない（写しであり自身の実装ではない。
  実装との紐づきは trace-check C21 の `@operation` が見る）。

## 判定規則

**成功例**の応答は `response` であり、`subset(example.response, reply.response)` が成立しなければならない:

- プリミティブ（string / number / boolean / null）は厳密に等しい（`===`）。
- 配列は**同じ長さ**で、各要素が同じ index の要素の部分集合。
- object は例の全キーが応答に存在し、その部分集合であること。**応答の追加キーは許可**する
  （契約の `additionalProperties` は spec-lint の関心であり、このツールの対象ではない）。

最初の不一致をパスで報告する: `items[0].status: 期待 "ok" / 実際 "pending"`。
欠落キーは `実際 (無し)`、長さの不一致は `期待 長さ 2 / 実際 長さ 3`。
成功例への `error` 応答は `期待: 正常 / 実際: error CODE` で失敗する。

**失敗例**の応答は**同じコード**の `error` でなければならない。`response` は失敗
（`期待: error CODE / 実際: 正常`）。異なるコードも失敗（`期待: error A / 実際: error B`）。

## ほかの検査との関係

| ツール | 証明するもの | 証明しないもの |
| --- | --- | --- |
| `spec-lint` | 契約の書式とライフサイクル（語彙、`examples` の存在と `request` との整合） | コードの存在 |
| `trace-check` | 参照の解決: `@covers` / `@implements`、エラーコード ⊆ `_shared` の `errorCodes`（C7）、層 | コードの動作 |
| **`contract-run`** | 実装が各例に契約の**形状**と**コード**で応答すること | REQ の**意味** |
| テスト（`## 検証方針`） | 分割クラスごとの REQ の意味 | — |

contract-run は形状を実行する。正常な実行 + テスト成功 + trace-check 違反ゼロは、
「機械で確認できる範囲で docs と実装が一致する」状態。

## `traceconfig.json` への宣言

```json
"commands": {
  "typecheck": "npx tsc --noEmit",
  "lint": "npx eslint .",
  "test": "npm test --silent",
  "contract_adapter": "npx tsx scripts/contract-adapter.ts"
}
```

`commands` ブロックは `tools/gate-hook`（最終ゲート）とこのツールだけが読み、trace-check は無視する。
アダプターができるまでは、実行する実例があれば contract-run は失敗する。推測でアダプターを作らない。

## 制約

- アダプターは利用プロジェクトのコード。正しさ（正しいハンドラー、分離データ、誠実なエラー変換）は
  利用プロジェクトの責任。contract-run は伝えられた内容を信頼する。
- **ベースラインファイルはない。** 実行結果は台帳化する負債ではない。`fail` は正本（契約または実装）で
  直すか、例が誤っている。
- skip は失敗。集計は未実行の例の数を示し、終了コードを `1` にする。
- 一実行一プロセス。アダプターは一つの寿命で全例を扱う。例間の分離が必要ならアダプターが行う
  （一行ごとのトランザクション、新規メモリー内ストア）。
- YAML reader は spec-lint と同じ厳格な部分集合（anchors、aliases、block scalars はエラー）。
  spec-lint が拒否する契約は、ここでは `fail` でなく exit `2`。
