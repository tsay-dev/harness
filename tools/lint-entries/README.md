# lint entries

アプリの入口の一覧を契約と突き合わせ、契約に無い入口と、入口の無い操作を洗い出す（`harness lint entries`）。

テストが通っていても、契約に無い入口がアプリに残っている、または、契約の操作に合う入口がアプリに無いと、仕様どおりに動くことの裏付けにならない。

仕様と実装の対応を、実装のコードに書く印ではなく実行で確かめる考え方（ADR-0070）と、3 つの検査（`lint entry`・`lint coverage`・`lint entries`）の分担は、`../lint-coverage/README.md` に書く。このコマンドは、設定と契約と一覧を読むだけで、コマンドを実行しない（一覧は、完了の判定が `commands.list_entries` を実行して渡す）。

## 設定（`harness.config.json`）

```json
{
  "commands": {
    "list_entries": "node scripts/list-entries.mjs"
  }
}
```

| キー | 書くもの |
| --- | --- |
| `commands.list_entries` | アプリの入口の一覧を、標準出力へ 1 行 1 件の JSON で出すコマンド。コマンドか `{ "none": "<理由>" }` を必ず書く |

- `commands.list_entries` は省略できない（E4）。none が通るのは、撤回されていない UC の fixed の契約に inbound の操作が 1 つも無い間だけ。
- 契約の外の入口を認める宣言は無い（以前の案の `entries.outside_contract` は無くした）。設定に `entries` が残っていれば E4 と、`harness lint config` の K6 で失敗する。

## 検査項目

| ID | 内容 |
| --- | --- |
| E1 | 一覧にある入口が、撤回されていない UC の fixed の契約の、inbound の操作のどれにも合わない。合う操作がどの契約にも無い入口は「契約に無い入口」、合う操作が fixed でない契約にしか無い入口は「契約が fixed でない入口」と、文を分けて報告する。認める宣言の手段は無い |
| E2 | fixed の契約の、owned かつ inbound の操作に合う入口が、一覧に無い |
| E4 | 一覧か、契約の操作の入口を読めない: `commands.list_entries` が未宣言、none にできないのに none、fixed の契約に inbound の操作があるのに一覧が 0 行、JSON でない行、項目の欠落、知らない項目、空でない文字列でない `method`・`path`・`name`（空白だけは空とみなす）、同じ入口の重複。契約の inbound の操作の `wire.method`・`wire.path`・`entry` が空でない文字列でない、`transport` が入口の種類に無い（owned と `x-status` によらない。撤回済みの UC の契約は対象外）。廃止した設定のキー `entries` が残っている |

E3 は欠番（契約に書かない入口の宣言の検査だった。その宣言を廃止したので、番号は詰めずに空ける）。

## 入口の一覧と契約を突き合わせる理由

「契約に無い入口」は、コードの注釈では見つからない（注釈の無い入口は、注釈を探す検査から見えない）。そこで、アプリに入口の一覧を出させて、契約と突き合わせる。

**アプリの入口は、すべて契約の操作として書く。** 契約の外に入口を置く手段（設定で認める宣言）は無い。そういう手段があると、設定に 1 行足すだけで、仕様にもテストにも無い入口を置ける。入口の処理は無名の関数で書かれることが多く、関数の単位の検査（V6）にも掛からない。契約に書いた操作は、fixed にするときに実例が必須になり（lint spec）、契約の実例の実行（`harness run cases`）がその操作を実行する。入口の突き合わせ先にするのは、fixed の契約の操作だけである（下の「契約のどの操作を数えるか」）。

## 一覧の形

`commands.list_entries` のコマンドは、標準出力へ、1 行に 1 件の JSON を出す。標準エラーの出力は読まない（読み込みの記録などは標準エラーへ出す）。空の行は読み飛ばす。

```jsonl
{"kind":"http","method":"GET","path":"/api/members/{accountId}"}
{"kind":"http","method":"POST","path":"/api/members"}
{"kind":"push","name":"order.updated"}
{"kind":"deeplink","name":"myapp://item/{itemId}"}
```

| `kind` | 持つ項目 | 契約のどこと突き合わせるか |
| --- | --- | --- |
| `http` | `method`、`path`（どちらも空でない文字列） | `transport: http` の操作の `wire.method` と `wire.path` |
| `deeplink` / `push` / `stream` | `name` | その transport の操作の `entry` |
| `sdk` / `local-store` / `device` / `internal` | `name` | その transport の操作の名前（これらは契約に `entry` を持たない） |

- **本番と同じ組み立てから列挙する。** ルーターの登録を自分で書き写した一覧では、載せ忘れた入口が見つからない。本番の組み立て（`entry.compose`）で作ったアプリから、登録済みの経路を取り出して出す。
- **突き合わせは、文字の完全一致。** http は `method` と `path` を、契約の `wire.method` と `wire.path` と、文字としてそのまま比べる。それ以外は `name` を、契約の `entry`（`entry` を持たない種類は操作の名前）と比べる。1 文字でも違えば合わない。harness はパスを解釈しない。`:id` と `{id}` を同じとみなさず、パラメーターの名前も一致が要る。`*` を特別に扱わない。末尾の `/` を無視しない。大文字と小文字をならさない（`method` も、契約の `wire.method` と同じ表記で出す）。前後の空白も削らない。
- **契約に書いたとおりの文字で出す。** 枠組みの書き方（`:id`、`[id]`、`[...slug]` など）を、契約の `wire.path` に書いた文字へ直すのは、一覧を出すスクリプトの役目である。harness は入口の書式を持たないので、契約と一覧が同じ文字なら、どんな書き方でも合う（`/files/{name}.json`、`/odata/$metadata`、`myapp://open?item={id}`）。直し方が正しいかは、harness は確かめない。
- すべての method を受ける登録（`all` など）は、受ける method ごとに 1 行ずつ出す。
- 一覧を出すスクリプトは、利用プロジェクトのコードである。最初の 1 本の形はスタックの規約（`rules-*` の `harness.config.json` の規約）が示し、implementer が、入口を足す・変える・消すのと同じ変更で保つ。
- 上の項目のほかの項目を持つ行、同じ入口を 2 回出す一覧は、E4 の違反にする。

## 契約のどの操作を数えるか

- **E1**（一覧 → 契約）: 撤回されていない UC の、`x-status: fixed` の契約の、`direction: inbound` の操作。owned が false でも、合えば通る。outbound の操作（外の API を呼ぶ側）と同じパスの入口は、契約にある入口とは数えない。
  - **fixed でない契約の操作は、突き合わせ先に数えない。** 契約を fixed にするには人間の承認が要り（guard）、fixed の契約の操作には実例が必須になる（lint spec）。draft の契約は、人の承認なしに書ける。draft の契約の操作を突き合わせ先に数えると、操作を 1 つ書き足すだけで、REQ もテストも実例も無い入口が通る。合う操作が fixed でない契約にしか無い入口は、「契約が fixed でない入口」として違反にし、合う操作の ID と、その契約の `x-status` を表示する。契約を fixed にするまで、この検査は通らない（fixed の契約を改訂のために draft に戻した間も同じ）。
- **比べられない操作**: inbound の http の操作の `wire.method`・`wire.path` と、deeplink / push / stream の操作の `entry` は、空でない文字列でなければ比べられない（空白だけは空とみなす。数や真偽値は文字列でない）。`harness lint spec` が draft の段階から違反にし、lint entries も黙って捨てずに E4 で報告する。2 つは同じ判定（`tools/_shared/contract-vocab.mjs`）を使う。撤回済みの UC の契約は、lint entries は対象にしない（lint spec は、http の 2 項目を対象にしない）。
- **どの契約を読むか**: 仕様の木の根（設定の `docs.goals_dir`）の直下のゴールのフォルダと、その直下の UC のフォルダの `contract.yaml`。根の決め方とフォルダの数え方は、lint spec・lint refs・guard・run cases と同じもの（`tools/_shared/spec-tree.mjs`）を使う。ゴールの階層でも UC の階層でも、`.` や `_` で始まるフォルダの契約は読まない。`docs.goals_dir` が `<docs>/goals` と別の場所を指していれば、lint spec・run cases・完了の判定が設定の誤りとして止まる。lint spec が検査しない場所に置いた契約を、突き合わせ先に数えない。
- **E2**（契約 → 一覧）: 撤回されていない UC の、`x-status: fixed` の契約の、`owned: true` かつ `direction: inbound` の操作。draft の契約の操作は、入口を求めない。
- **none と 0 行の一覧**: `commands.list_entries` を `{ "none": "<理由>" }` にできるのは、撤回されていない UC の fixed の契約に inbound の操作が 1 つも無い間だけ。一覧が 0 行で通る条件も同じである。fixed の契約に inbound の操作があるのに、none にしているか、一覧が 0 行なら、E4 の違反にする。inbound の操作が draft の契約にしか無い間は、none でも 0 行でも通る。none の間は一覧を読まないので、その間に置いた入口は見ない。

## 機能の仕様ではない入口（生存確認、静的なファイルや画面の配信）

生存確認・準備の確認・静的なファイルや画像の配信・画面の配信のような入口も、契約の操作として書く。書き方は次のとおり。

- **どの UC の契約に置くか**: 運用のための入口をまとめる UC を 1 つ立て、その `contract.yaml` に書く（例: 「稼働を確かめ、画面と静的なファイルを配る」）。アクターは、入口を呼ぶ仕組み（監視、ブラウザー、CDN）で、アクター表の種別を「システム」で始める。人間でないアクターの UC には、シナリオテストの義務（lint refs の C15）は無い。それ以外は、ほかの UC と同じである。active にするには REQ が 1 件以上要り（C17）、REQ にはテストが要る（C1・C10）。「生存確認は、依存先に届かないとき 503 を返す」のような振る舞いを REQ に書き、テストで確かめる。
- **何でも受ける経路**: `wire.path` に、一覧に出すのと同じ文字で書く（例: `path: /assets/*`。一覧にも `/assets/*` と出す）。`*` に特別な意味は無く、文字として一致するかだけを見る。配るファイルを 1 つずつ操作にはしない。
- **応答が JSON でない操作（画像、HTML、ファイル）**: 契約の `response` と実例は、アダプターが返す JSON の形を書く。契約アダプターは、実装の応答から、確かめたい事実だけを JSON にして返す（例: `{ "contentType": "text/html" }`、`{ "contentType": "image/png", "cacheControl": "public, max-age=31536000" }`）。本文そのものは実例に書かない。契約の書式（lint spec）と run cases は、今のままでこの形を扱える（判定は、実例の `response` がアダプターの応答の部分集合であること）。

  ```yaml
  serveAssets:
    transport: http
    direction: inbound
    owned: true
    auth: none
    summary: 静的なファイルを配る
    wire: { method: GET, path: /assets/*, success: 200 }
    request: { type: object, required: [path], properties: { path: { type: string } } }
    response: { type: object, required: [contentType], properties: { contentType: { type: string } } }
    errors:
      - { code: NOT_FOUND, when: 該当するファイルが無い, wire: { status: 404 } }
    examples:
      ok: { request: { path: /assets/logo.png }, response: { contentType: image/png } }
      missing: { request: { path: /assets/none.png }, error: NOT_FOUND }
  ```

**契約にある入口が、実例で実行されるか。** fixed の契約の操作は、成功例 1 件以上と、エラーコードごとの失敗例を持つ（lint spec）。run cases は、その全部をアダプターに渡し、skip も失敗に数える。

- **draft の契約の操作**: 実例は必須でなく、run cases も既定では実行しない。そのため、E1 は draft の契約の操作を突き合わせ先に数えない。draft の契約の操作にしか合わない入口は、E1 の違反になる。
- **`owned: false` の inbound の操作**（他者が形を決める、受ける側の境界。外部サービスからの通知など）: 実例は必須だが、run cases は既定では実行しない（`--include-external` のときだけ）。fixed の契約なら入口は E1 を通るが、既定の完了の判定では、実例は実行されない。

## 単独で呼ぶ

```bash
node scripts/list-entries.mjs | harness lint entries          # 標準入力から
harness lint entries --from /tmp/entries.jsonl                # ファイルから
```

`commands.list_entries` が none・未宣言のときは、一覧を渡さなくても判定する。`harness lint`（まとめて実行）には入らない（一覧が要るので、引数なしでは意味が決まらない）。完了の判定は、level `fast` 以上で `commands.list_entries` を unit のディレクトリで実行し、標準出力を一時ファイルに書いて渡す。`a | b` の形のコマンドは、シェルが対応していれば pipefail を付けて実行するので、左側の失敗も失敗になる。対応していないシェル（古い dash など）では、左側の失敗は終了コードに出ない（空や途中までの一覧は、E2・E4 が見つける）。monorepo では unit の設定に書く（ルートの設定に書いたコマンドは実行されず、lint config の K7 が違反にする）。level `lint` では、コマンドを実行しないので skip として表示する（none・未宣言の判定は、level `lint` でも行う）。

## 確かめないこと

- 一覧に載っていない入口。一覧は利用プロジェクトのコマンドが出すので、コマンドが載せ忘れた入口は見つからない。
- 入口の先の処理が、契約の形（リクエスト、レスポンス、エラー）どおりに動くか。それは契約の実例の実行（`harness run cases`）が確かめる。

## 使い方

```bash
harness lint entries [--root <プロジェクトのルート>] [--config <設定ファイル>] [--from <入口の一覧のファイル>]
```

`--from` を省くと、一覧を標準入力から読む。

終了コード: 0 = 違反なし / 1 = 違反あり / 2 = 使い方の誤り、設定ファイルが無い、JSON として読めない、`--from` のファイルが無い。

## テスト

```bash
node --test tools/lint-entries/test/*.test.mjs < /dev/null
```
