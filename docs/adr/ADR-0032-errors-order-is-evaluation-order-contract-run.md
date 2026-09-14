---
id: ADR-0032
title: 失敗条件の判定順序は契約の errors の並びだけに書き、契約は examples の実行で実装に紐づける
status: accepted
date: 2026-09-14
---

# ADR-0032 失敗条件の判定順序は契約の errors の並びだけに書き、契約は examples の実行で実装に紐づける

## Context

ホスト案件で、同意 POST の評価順という 1 つの事実が、契約の `x-http`、`errors[].when`、`x-oauth-settings`、`examples`、schema のコメント、ADR、BR、`UC.md` の表の 8 箇所に自然文で書かれていた。1 箇所を直すと他の箇所との食い違いが指摘され、条件が自然文なので「2 つの `when` が重ならないか」を機械で確かめられなかった。

harness 側の原因は 2 つある。contract-author の負リストは評価順を「BR と UC の状態×イベント表」へ送っていたが、表はセル → REQ しか持てず（R-404）、BR は自然文であり、評価順に構造化された家がなかった。spec-lint は操作直下の未知キー（`x-http` 等）を弾かず、負リストは説得的制御にとどまっていた。

また、既存の機械検査（spec-lint / trace-check）は参照の存在を閉じるが、契約と実装の**実行的**な紐づけを検査していなかった。契約の `examples` は必須で実値を持つのに、それを実行する仕組みがなかった。

## Decision

- **R-1207**: operation の失敗条件の評価順は、`contract.yaml` の `errors:` の並び（先頭一致優先）だけに書く。`when` は項目のラベルであり、排他性の証明ではない。UC / BR / ADR の散文と schema のコメントは順序を再掲しない。隣接する項目の優先関係は、両条件が同時に成り立つ入力の例（`contract-run` が実行）かテストのクラスで反証し、散文で証明しない。
- spec-lint は operation 直下のキーを 13 個（`transport` / `direction` / `owned` / `source` / `auth` / `summary` / `wire` / `entry` / `requires` / `request` / `response` / `errors` / `examples`）に閉じ、`errors[]` の項目を `code` / `when` / `wire` に閉じる。`x-*` は operation レベルで拒否する。既存ホストの違反は `validate --update-baseline` で 1 回だけ記録する（R-804 の「検査が既存物に初適用される時点」の第 3 の例外点。ADR-0005 の延長）。
- spec-lint は `fixed` 契約で、`errors[]` の各 code に少なくとも 1 つの失敗 example を要求する（失敗経路を例で実行可能にする）。
- `tools/contract-run` を追加する。`fixed` 契約の全 examples を、ホストが `traceconfig.json` `commands.contract_adapter` に宣言した 1 プロセスへ JSONL で流し、正常例は応答の部分一致、失敗例は error code の一致で判定する。アダプタ未宣言は「実行されていない」として exit 0 で明示し、pass とはしない。結果を baseline に入れない。
- `test-author` は `errors[]` の項目ごとと隣接対ごとに分割クラスを宣言する。`reviewer` は順序が宣言された operation で `when` の重なりを指摘せず、どの項目も覆わない入力か、1 つの入力に矛盾する観測を要求する 2 項目だけを指摘する。

強制の所在: キー閉集合と errors ⊆ examples は spec-lint（構造的）。実行の紐づけは contract-run（構造的、アダプタはホストの責務）。R-1207 の「散文に書かない」は docs.instructions と spec-author の負リスト（説得的、R-901）。

## Consequences

- 評価順の家が 1 箇所になり、機械（spec-lint）が複製の入口（`x-*`）を閉じる。順序の正しさは examples の実行で決まり、散文の排他性証明は不要になる。
- 契約 ↔ 実装のリンクが実行的に検査される。契約の examples が実質的に契約のテストになる。
- ホストはアダプタ（operation → 実装の入口を in-process で呼ぶ薄い層）を 1 本書く必要がある。書くまで contract-run は「未実行」を表示し続ける。
- 既存契約に `x-*` キーや失敗例の欠落があるホストは、初回に baseline 記録が要る。
- 閉集合は将来 operation にキーを足すたびに spec-lint の改修が要る。

## 却下した選択肢

- **`x-evaluation-order` のような拡張キーで順序を書く**: 順序が `errors` の並びと二重になり、複製の入口を残す。
- **BR の散文に順序を書く**: 機械で重なりを検査できず、今回の複製がそのまま再発する。
- **UC の状態×イベント表に列を足す**: 表はセル → REQ の対応だけを持つ（R-404）。順序は契約の境界の性質であり、表の関心ではない。
- **未知キーを warn に留める**: 8 箇所複製の再発を止められない。
- **契約からホスト言語ごとにテストを生成する**: 言語ごとの生成器が要り、生成テストと手書きテストの二重管理になる。アダプタ 1 本の方が小さく、生成物を持たない。
