---
description: "⚙️ crow / バックエンド — 責務境界（サーバー側の核）"
applyTo: "**/crow3_*/app/classes/**,**/crow3_*/app/assets/query/**,**/crow3_*/**/module_*.php"
---

# ⚙️ crow / バックエンド — 責務境界（サーバー側の核）

サーバー側 PHP のどの配置先を変更しても成り立つ不変条件。書式は [common-coding](common-coding.instructions.md)、配置先ごとの書き方は [action](backend-action.instructions.md)（`module_*` の `action_*` / `preload()`）、[model](backend-model.instructions.md)（`app/classes/_common_/` の model / service / presenter / util）、[query](backend-query.instructions.md)（`app/assets/query/**` の `.sql`）、[db](backend-db.instructions.md)（`db_design.txt`）、[testing](backend-testing.instructions.md)。節番号はバックエンド規約全体で通し番号（§1 → action §2 → model §3、§4 / query §3.9）。コメントは日本語で書く。

## 1. 配置

crow に四層アーキテクチャや別の Domain ディレクトリは導入しない。Domain と永続化は `model_<table>` に同居する。

| 関心 | crow での実体 |
| --- | --- |
| 画面固有の表現と並べ方 | view / viewpart / frontend JS |
| 契約に載る共通表示値 | `model_<table>_presenter` / `common_presenter`（§3.11） |
| ユースケース（入力を開く → 頼む → 出力を閉じる） | `module_*` 内の `action_*`（§2） |
| 一テーブルが主語の意味・判定・定型クエリ（JOIN 可）・保存フック | `model_<table>` の手書きメソッド（§3） |
| 複数テーブルにまたがり主語が決まらない業務判定・導出 | `model_<table>_<table>_service`（§3.12） |
| 永続化（ORM・生成メンバー・`raw` SQL）・外部 API | model の継承側に同居 |
| どのテーブルにも属さない共通純粋処理（非表示） | `app/classes/_common_/` の model 以外の util（§4） |

- 契約レスポンスの組み立ては action。表示専用・画面専用の関心を model に置かない。
- 一覧・候補集合の行順は SQL の `ORDER BY` が正本。取得後に PHP で再ソートしない（action / model / presenter / util のいずれでも）。FE は契約上の行順を変えない範囲でだけ並べ替える。
- 何でも扱うクエリファクトリーや横断的な寄せ集めクラスを作らない。`common_presenter` は薄い表示専用の共通窓口に限る。

### 1.1 システム責務と業務責務の境界（全バックエンド規約で最優先）

| | システム責務 | 業務（Domain）責務 |
| --- | --- | --- |
| 配置先 | `action_*`（および `module_*` の `preload()`） | action から呼ばれるすべてのファイル: `model_*` / `model_*_service` / `model_*_presenter` / util |
| 持つもの | 入力・出力・終了・Tx 境界・DB ハンドル・認証・セッション・致命的ログ | 業務の意味・判定・導出・整合性と、業務メッセージの文言 |
| 知ってよいこと | 誰に、どう頼み、結果にどう応答するか | 自分の業務だけ。リクエストの内容、返し方、終了時点を知らない |

Domain 側のファイルに一つも書かない識別子:

| 種類 | 識別子 |
| --- | --- |
| I/O | `crow_request::*` / `crow_response::*` |
| プログラムの終了 | `app::exit_ok()` / `app::exit_ng()` / `app::exit_*()` / `exit` / `die` / `header()` / redirect |
| トランザクション境界 | `$hdb->begin()` / `commit()` / `rollback()` |
| DB ハンドルの取得 | `crow::get_hdb()`（必要なら引数で受け取る） |
| 認証と進行制御 | `crow_auth::*` |
| セッション・cookie・スーパーグローバル | `$_GET` / `$_POST` / `$_SESSION` など |
| 致命的ログ | `crow_log::error()`（crow の設定によりリクエストを終了する） |

- **Domain はプログラムを終了しない。** 異常は戻り値（`false` / `''` / エラー配列）または `push_validation_error()` / `get_last_error()` で返し、停止・継続は action が決める。Domain が出してよい唯一の記録は `crow_log::warning()`。
- **Domain はシステム側の事情を知らない。** 上の識別子が Domain 側にあるのは最適化ではなく設計誤り。
- Domain のメソッドは行オブジェクトまたは配列を渡すだけでユニットテストできる状態を保つ。

## 5. 既存コードの変更

- action にハードコードされた判定・定型クエリ・業務分岐、Domain に混入したシステム責務、model や module に蓄積した表示整形は、変更する機能の範囲内だけで正しい配置先へ移す。一括書き換えはしない。範囲外で直さなかったものは報告に残す。
- 既存の逸脱を新規コードで踏襲しない。
- 拡張のないテーブルへドメインロジックを足すときは `app/classes/_common_/model_<table>.php` を追加する。
