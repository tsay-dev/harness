---
description: "⚙️ crow / バックエンド — 責務境界（サーバー側の核）"
applyTo: "**/crow3_*/app/classes/**,**/crow3_*/app/assets/query/**,**/crow3_*/**/module_*.php"
---

# ⚙️ crow / バックエンド — 責務境界（サーバー側の核）

> **読むタイミング：crow のサーバー側 PHP（action / model / service / presenter / util / SQL）を作成・修正するとき、必ず最初に読みます。**
> この規約は **どの配置先を変更しても守る不変条件だけ**を持ちます。各配置先の書き方は §1.2 の一覧から必要な規約だけを開いてください。
>
> **共通の書式は [common/coding.md](common-coding.instructions.md) に従います**（インデント表、Allman、snake_case、
> `i_` 接頭辞、`===` / `!` の禁止、`//<TAB>` コメント、80 桁、PHP の閉じタグ、末尾改行）。
> この文書は **その規約に従ったうえで**、サーバー側に適用する差分だけを定義します。
> 共通規約は再記載しません。表記は共通規約に従い、ここにない規則を埋めるために複写しないでください。
>
> 以下は表記でなく **「サーバー側のロジックをどこに置くか」**を定義します。
> 新規実装でも、自然にこの分担へ収まるように書いてください。
>
> **コメントは日本語で書いてください。**

---

## 1. 概要

crow の上に厳密な四層アーキテクチャを再現しないでください。行うのは **action / model / presenter / model 以外の util の配置を厳密にすること**です。

| 一般的な層名 | crow での実体 | 一言で |
| --- | --- | --- |
| Presentation（画面） | view / viewpart / frontend JS | 画面固有の表現 |
| Presentation（共通表示値） | `model_*_presenter` / `common_presenter` | 契約に載る表示値の導出 |
| Application（ユースケース） | `module_*` 内の `action_*` | 入力を開き、頼み、出力を閉じる |
| Domain（一テーブルが主語） | `model_<table>` の **手書き**メソッドとフック | そのテーブルの意味・判定・定型取得 |
| Domain（複数テーブルにまたがる） | `model_<table>_<table>_service` | 単一テーブルを主語にできない業務判定・導出（[model.md](backend-model.instructions.md) §3.12） |
| Infrastructure | crow ORM / 生成メンバー / `raw` SQL / 外部 API | model の継承側と **同居してよい** |
| （共通・非表示・どのテーブルにも属さない） | `app/classes/_common_/` の model 以外の util | フィルター値の整備など |

**核（必須）**

1. **テーブルの意味・判定・定型クエリ（一覧の主語となる取得を含む）→ `model_*`**
   **主語が決まらない、複数テーブルにまたがる業務判定・導出 → `model_<table>_<table>_service`（[model.md](backend-model.instructions.md) §3.12）**
2. **リクエストの受け取り、結果に応じた応答の判断、model 間の更新順序、Tx → `action_*`**
   （**action は入力を開き、model / presenter に頼み、出力を閉じます。** 詳細は [action.md](backend-action.instructions.md) §2.1）
3. **どのテーブルの Domain にも属さない共通純粋処理（非表示）→ model 以外の util（[model.md](backend-model.instructions.md) §4）**
4. **契約レスポンスの組み立て → action。共通表示値の導出 → presenter（[model.md](backend-model.instructions.md) §3.11）。画面固有の表現と画面上の並べ方 → frontend（feature / scene）**
   （表示専用・画面専用の関心を model に置かないでください。FE 側は [frontend/viewpart-components.md](frontend-viewpart-components.instructions.md) §9 を正とします）
5. **一覧・候補集合の行順（契約上の取得順）→ SQL の `ORDER BY`（定型クエリまたはフラグメント内）。取得後に PHP で再ソートしないでください。**
   FE は契約上の行順を変えない並べ替えだけ行えます（[model.md](backend-model.instructions.md) §3.4）

補足：

- 別の Domain ディレクトリを作らないでください。
- model に Domain と永続化を同居させるのは妥協ではなく、**crow における Domain の正当な配置先**です。
- model の外で Domain と Infrastructure を分離しようとしないでください。
- **クエリ組み立て用の巨大な横断クラスを導入しないでください。**
  `common_presenter` は **薄い表示専用の共通窓口**に限定します（[model.md](backend-model.instructions.md) §3.11）。配置に迷ったら [model.md](backend-model.instructions.md) §3 / §3.11 / §3.12 / §4 の判断表で振り分けてください。
  禁止するのは **何でも扱うクエリファクトリーや横断的な寄せ集め**です。
  **業務概念で名付け、一つの関心に絞ったドメインサービス（[model.md](backend-model.instructions.md) §3.12）は禁止しません**。

処理の流れ：

```
action:     入力を開く → model / service / presenter に頼む → 契約に従って出力を閉じる
model:      主語テーブルの意味・判定・定型クエリ・保存フック
service:    主語が決まらない、複数テーブルにまたがる業務判定・導出（Domain）
presenter:  契約に載せる共通表示値（テーブルごと / テーブル非依存の共通形）
util:       どのテーブルにも属さない共通純粋処理（非表示）だけ
FE:         契約 payload を受け取り、画面固有の表現と並べ方を組み立てる
```

### 1.1 システム責務と業務責務の境界（全バックエンド規約で最優先の不変条件）

**この節はすべてのバックエンド規約・すべての節より優先します。** 以下と解釈が矛盾する場合、この節を優先します。

| | システム責務 | 業務（Domain）責務 |
| --- | --- | --- |
| **配置先** | `action_*`（および `module_*` 内の `preload()`） | `model_<table>` / `model_<table>_<table>_service` |
| **持つもの** | 入力・出力・**終了**・Tx 境界・DB ハンドル・認証・セッション・致命的ログ | テーブルや業務概念の意味・判定・導出・整合性と、業務メッセージの文言 |
| **知ってよいこと** | 「誰に、どう頼み、結果に対してどう応答するか」 | **自分の業務だけ。** リクエストの内容、返し方、終了時点を知らない |

> **この節の「Domain 側」**は **action から呼ばれるすべてのファイル**を指します。
> `model_*` / `model_*_service` / `model_*_presenter` / model 以外の util（配置と書式は [model.md](backend-model.instructions.md) §3、§4）。
> presenter と util は層としては Domain ではありませんが、**同様にシステム責務を持たない**ため、
> 四者すべてに以下の禁止を同じ強さで適用します。

**システム責務の識別子（Domain 側のファイルに一つも書かない）**

| 種類 | 識別子 |
| --- | --- |
| I/O | `crow_request::*` / `crow_response::*` |
| **プログラムの終了** | `app::exit_ok()` / `app::exit_ng()` / `app::exit_*()` / `exit` / `die` / `header()` / redirect |
| トランザクション境界 | `$hdb->begin()` / `commit()` / `rollback()` |
| DB ハンドルの取得 | `crow::get_hdb()`（必要なら **引数で受け取る** — [query.md](backend-query.instructions.md) §3.9） |
| 認証と進行制御 | `crow_auth::*` |
| セッション・cookie・スーパーグローバル | `$_GET` / `$_POST` / `$_SESSION` など |
| 致命的ログ | `crow_log::error()`（crow の設定によって **リクエストを終了する** — 終了と同義。[action.md](backend-action.instructions.md) §2.10） |

**二つの絶対規則**

> **1. Domain はプログラムを終了しません。**
> `model_*` / `model_*_service` / `model_*_presenter` / util 内に、リクエストを終了し得る呼び出しを **一つも**書かないでください。
> 異常は **戻り値（`false` / `''` / エラー配列）**または **`push_validation_error()` / `get_last_error()`** で呼び出し側へ返し、
> **停止・継続は action に決めさせます**（[action.md](backend-action.instructions.md) §2.3）。
>
> **2. Domain はシステム側の事情を知りません。**
> 上の表の識別子が Domain 側にあることは「例外として許される最適化」ではなく、**設計誤り**です。

**絶対である理由**（一つでも例外を作るとすべてが崩れる）

1. Domain が終了すると、**ユニットテストもプロセスごと死んで書けなくなります**（[backend/testing.md](backend-testing.instructions.md) の Red 対象は手書きの Domain）。
2. 同じ判定を **別の入口から再利用できません**（別 action、バッチ、CLI）。
3. **Tx 途中の終了は中間状態を残します**（rollback は action にしか書けません — [action.md](backend-action.instructions.md) §2.8）。

**Domain が出してよい唯一の記録は `crow_log::warning()`** です（終了しません）。[action.md](backend-action.instructions.md) §2.10 に従います。

自己検査の grep は §6 にあります。

---

### 1.2 規約一覧（書く配置先 → 開く規約）

バックエンド規約は **配置先ごとに分割**しています。この規約（境界の核）を必ず読み、**そのうえで書く配置先の規約だけを開きます**。

| 作成・修正する配置先 | 開く規約 | 内容 |
| --- | --- | --- |
| `module_*.php` 内の `action_*` と `preload()` | [action.md](backend-action.instructions.md) | §2。ユースケースの骨格、request/response、Tx、認証ゲート、ログ |
| `app/classes/_common_/` 配下の PHP<br/>（`model_*` / `model_*_*_service` / `model_*_presenter` / model 以外の util） | [model.md](backend-model.instructions.md) | §3、§4。Domain の配置、拡張フック、presenter、ドメインサービス、util |
| `app/assets/query/**` 配下の `.sql`（とそれを組み立てる model メソッド） | [query.md](backend-query.instructions.md) | §3.9。raw フラグメント、許可リスト、ページング一覧 |
| `db_design.txt` | [db.md](backend-db.instructions.md) | DB 設計の形式と配置 |
| テストコード | [testing.md](backend-testing.instructions.md) | PHPUnit。Red の対象と対象外 |

- **一スライスで action と model の両方を書くなら、両方の規約を開いてください。** 変更しない配置先の規約は開きません。
- **節番号はバックエンド規約全体で通し番号です**（この規約 §1 → `action.md` §2 → `model.md` §3、§4 / `query.md` §3.9 → この規約 §5、§6、§7）。
  分割後に振り直さないでください。他の規約からの参照が壊れます。
- 迷ったら §1 の判断表と §1.1 の境界に戻ります。**規約を開かず勘で書かないでください。**

---

## 5. 既存コードを変更するとき

- `action_*` に主語が一意に決まる判定や定型クエリがハードコードされていたら、
  **その機能の実装範囲内だけで**、主語 model へ移します。
- `action_*` に **複数テーブルにまたがる業務判定**がハードコードされていたら、
  **その機能の実装範囲内だけで**、[model.md](backend-model.instructions.md) §3.12 に従って service へ移します（新規作成可）。
- Domain（model / service / presenter / util）に `exit_*` / Tx / `crow_request` / `crow::get_hdb()` が混入していたら、
  **変更する機能の範囲内だけで**、§1.1 の形に直します（Domain が値を返し、action が停止）。
  **これを「既存コードに合わせる」理由にしてはいけません**。新たに書くコードでその形を踏襲しないでください。
- model や module に表示整形が蓄積していたら、
  **変更する機能の範囲内だけで**、[model.md](backend-model.instructions.md) §3.11 の判断に従って presenter へ移します。
- 横断クラスに定型取得や行整形が蓄積していたら、
  **変更する機能の範囲内だけで**、[model.md](backend-model.instructions.md) §3 / §3.11 / §4 の判断表で振り分けます（全体を解体しません）。
- **一括書き換えはしないでください。**
- 拡張のないテーブルへドメインロジックを追加する場合は、その範囲内で
  `app/classes/_common_/model_<table>.php` を追加します。

---

## 6. 責務の自己検査（サーバー側の記述後、返却前に必ず実施）

**§1.1 を目視だけで確認しないでください。** 記述が終わったら以下を実行します。

```bash
#	Domain 側（model / service / presenter / util）にシステム責務が漏れていないか
#	→ ヒット 0 が正
grep -rnE "crow_request|crow_response|app::exit_|crow_auth::|crow::get_hdb|crow_log::error|->begin\(|->commit\(|->rollback\(|\bdie\b|\bexit\b|\bheader\(|\\\$_(GET|POST|SESSION|COOKIE)" \
	app/classes/_common_/
```

**ヒットしたら §1.1 に照らして判断します。**
今回書いた行なら **返却前に修正**してください。既存行なら §5 に従い（変更する機能の範囲内だけ修正）、
**範囲外で修正しなかったものを報告に残します**（黙って通さないでください）。
コメントや文字列リテラル内の偶然の一致は、確認後に除外して構いません。
**ただし「たぶんコメント」で済ませず、必ず行を開いて確認してください。**

次に、grep で拾えないものを読んで確認します。

- [ ] `action_*` を上から下へ読むと、**入力 → 委譲 → 出力**の三段階だけになっているか（[action.md](backend-action.instructions.md) §2.1）？
- [ ] `action_*` 内に **業務条件分岐**（`&&` / `||` で組み立てた業務規則・状態遷移判定）が残っていないか？
      一テーブルなら model、複数なら **[model.md](backend-model.instructions.md) §3.12 の service** へ移します
- [ ] Domain は **異常を戻り値で返し**、停止判断を action に残しているか（§1.1 絶対規則 1）？
- [ ] `begin()` を呼んだすべての経路に、`exit_ng` 前の `rollback()` があるか（[action.md](backend-action.instructions.md) §2.8）？
- [ ] 新規 service は **対象テーブル名の連結（アルファベット順）+ `_service`** で命名しているか？
      代わりに業務概念名にしていないか？ **同じ組み合わせの既存 service を見落として重複作成していないか？**
      （`ls app/classes/_common_/model_*_service.php` で確認）。
      既存メソッドが参照するテーブルを増やしたとき、クラス名も追従させたか（[model.md](backend-model.instructions.md) §3.12）？
- [ ] Domain に書いたメソッドは **行オブジェクトまたは配列を渡すだけでユニットテストできるか**？
      （できなければシステム側の事情がまだ混入しています）

---

## 7. ここに置くもの（拡張の仕方）

サーバー側だけを拘束する規則が生まれたら、**その規則が適用される配置先の規約**へ追加します（§1.2 の一覧と同じ分割）。

| 追加したいもの | 配置先 | `applyTo`（読み込み条件） |
| --- | --- | --- |
| 配置先をまたぐ不変条件、層境界、自己検査 | この規約 `coding.md` | すべてのサーバー側配置先 |
| action の書き方 | [action.md](backend-action.instructions.md) | `module_*.php` |
| model / service / presenter / util の書き方 | [model.md](backend-model.instructions.md) | `app/classes/**` |
| `.sql` フラグメントの書き方 | [query.md](backend-query.instructions.md) | `app/assets/query/**` |

- **この規約を肥大化させないでください。** ここが太ると、すべての配置先で読み込まれます。配置先固有の事項は必ずその規約へ置きます。
- **規約を追加するときは必ず `applyTo` を絞ります**（配置先を特定できなければ配置先固有の規則ではありません。まず、この規約に置く不変条件か、[common/coding.md](common-coding.instructions.md) に置くものかを決めてください）。
- **責務境界は §1.1 を正**とし、他の規約から参照します（禁止事項を各規約へ転記しません）。
- **節番号は通し番号を維持します**（§1.2）。規約間で参照しているため、振り直しません。
- **フロントエンドにも適用するようになったら、その時点で backend から [common/coding.md](common-coding.instructions.md) へ昇格させます。**
