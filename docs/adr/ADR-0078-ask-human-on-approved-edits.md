---
id: ADR-0078
title: 承認した後の仕様の書き換えは、承認を無効にせず、関門（guard）が書き込みごとに人に回す
status: accepted
date: 2026-11-19
---

# ADR-0078 承認した後の仕様の書き換えは、承認を無効にせず、関門（guard）が書き込みごとに人に回す

## Context

UC・BR・NFR の `active`、概要の `living`、契約の `fixed` は、人が承認したことを表す（ADR-0057 は、昇格と降格を関門で人に回すことにした）。ところが、status を変えずに本文を書き換える書き込みは、関門が何も言わずに通していた。agent が承認済みの UC の主シナリオや契約の操作を書き換えても、status は `active` / `fixed` のままで、人は気付かない。承認したのは書き換える前の文である。

依頼主は 2026-11-19 に、承認後の書き換えを関門で人に回すことを決めた。

## Decision

- `harness guard`（PreToolUse）は、次の文書の本文を変える書き込みを ask（理由 `approved-edit`）にする。本文は、frontmatter の `status`（契約は `x-status`）以外の行。
  - `active` の `UC.md`・BR（ファイル名 `BR-nnn` か frontmatter の `id`）・NFR（同じく `NFR-nnn`）
  - `living` の概要（`<docs>/00-overview.md`）
  - `fixed` の契約（`.yaml`）
- 次の書き込みは ask にしない。開発が回らなくなるため。
  - 同じ書き込みで status を下げる書き込み。既存の降格（`status-down`）として ask になる。
  - `UC.md` の `phase:` だけを変える書き込み。phase は orchestrator が進める工程台帳で、本文ではない。
  - active の `UC.md` で、draft の REQ の小節を足す・直すだけの書き込み。REQ の読み方は `tools/_shared/reqs.mjs`（lint spec・lint refs と同じ）。
- 判定に迷う形は fail-closed で ask にする: 書き込み後の内容が分からない、「要件」の節の書き方に誤りがある、REQ の小節を消す（draft でも）、active の UC の REQ を active にする・active で足す。
- 強制の所在: `tools/guard/guard.mjs` の判定と `tools/guard/test/guard.test.mjs` のテスト。guard はホストが明示的に有効にしたときだけ動く（常駐ゼロ）。有効にしていないホストでは、この決定は説得による統制（R-901）にとどまる。

## Consequences

**得られるもの**

- 承認済みの文書を書き換えるたびに、人が差分を見る。承認した文と今の文が、黙って食い違うことが無くなる。
- 記録を増やさない。承認の印は今までどおり status だけで、指紋の置き場や照合の検査を持たない。

**代償と今後の制約**

- 承認済みの文書の誤字を直すだけでも、人の承認が要る。living の概要では、GOAL の行を planned から draft にする（ゴールに着手する）書き込みも人に回る。
- active の UC で REQ を active にする書き込みは、これまで記録して通していたが、人に回るようになる。
- 関門は書き込みの瞬間しか見ない。guard を有効にしていないホストや、関門を通らない書き込み（シェルからの書き換え、git の操作）は止めない。後から書き換えに気付く手段は、git の差分とレビューだけである。

## 却下した選択肢

- **承認したときの本文の指紋（ハッシュ）を記録し、検査が今の本文と比べて、違えば承認を無効にする**: 1 文字直すだけで承認し直しになる。指紋を記録する置き場（frontmatter か別のファイル）が要り、その置き場の書き込みを守る仕組みもまた要る。
- **書き換えを止めず、検査の時に status を draft に戻させる**: 書き換えた後で承認が外れるので、人が見る前に実装が進む。戻す作業も agent が自分でするので、外れたことに人が気付かない。
- **本文のどの行の書き換えでも ask にする（phase と draft の REQ も含める）**: orchestrator が phase を進めるたび、draft の REQ を書くたびに人が呼ばれ、開発が回らなくなる。
