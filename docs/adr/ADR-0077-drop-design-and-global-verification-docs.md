---
id: ADR-0077
title: 設計書（design.md）と全体の検証方針（verification/GLOBAL.md）をやめ、残っていれば違反にする
status: accepted
date: 2026-11-19
---

# ADR-0077 設計書（design.md）と全体の検証方針（verification/GLOBAL.md）をやめ、残っていれば違反にする

## Context

利用プロジェクトの docs には、ひな形として 2 つの文書が残っていた。

- `docs/design.md`（ADR-0003 が「任意の人間所有文書」として残した設計書）。設計の事実は、境界の形が契約（`contract.yaml`）に、判断とその理由が ADR に、実際の構造がコードにある。design.md はそれらの写しで、元を直しても写しは直らないので食い違う。lint spec が見ていたのは frontmatter の有無と、受け入れ条件らしき語の有無だけで、中身が契約やコードと合っているかは誰も確かめていなかった。
- `docs/verification/GLOBAL.md`（プロジェクト全体で検証しない範囲）。ADR-0054 で NFR の計測の所在を NFR ファイルへ移した後は、「外部 SDK の内部は検証しない」のような数行の表だけが残った。そのために、文書 1 枚、ひな形 1 枚、設定のキー `docs.verification_global`、lint spec の書式の検査、lint refs の C20 の除外を保っていた。

依頼主は 2026-11-19 に、2 つの文書を無くすことを決めた。

## Decision

- ひな形 `templates/develop/design.md` と `templates/develop/verification-GLOBAL.md` を消し、設定のひな形から `docs.verification_global` を消す。
- プロジェクト全体で検証しない範囲とその理由は、概要（`00-overview.md`）の「全体の方針」の小節の前に書く。計測の決めごとは NFR に、設計の判断は ADR に書く。docs の規約（R-1002）とひな形の案内をこれに合わせる。
- 残っていれば違反にする（`REQ-nnn.md`・`GOAL.md` と同じ扱い）。`tools/_shared/dropped-docs.mjs` が、`<docs>/design.md`、`<docs>/verification/GLOBAL.md`、frontmatter の `id` が `VERIFICATION_GLOBAL` の md を見つけ、lint spec と lint refs（C9）が「概要の全体の方針・NFR・ADR へ移して消す」と案内して失敗にする。設定に `docs.verification_global` が残っていれば、廃止したキー（`tools/_shared/config.mjs` の `RETIRED_KEYS`）として lint config（K6）と lint refs が失敗にする。
- 移す道具は作らない。design.md の記述が契約・ADR・コードのどれと重なり、どれにも無い判断はどれか、GLOBAL.md の行が本当に検証しない範囲かは、人が読んで決める。

## Consequences

**得られるもの**

- 設計の事実の置き場が契約・ADR・コードだけになり、写しとの食い違いが生まれない。
- 全体の検証しない範囲が、全 agent が毎回読む概要に載る。文書 1 枚、設定のキー 1 つ、書式の検査 1 つが減る。

**代償と今後の制約**

- design.md や GLOBAL.md を持つ利用プロジェクトは、lint spec・lint refs・lint config が失敗するようになる。中身を人が移すまで検査が通らない。移行の道具は無い。
- 契約・ADR・コードに分かれた設計を 1 枚で見渡す文書が無くなる。見渡すには `harness index` の索引と ADR を読む。
- 概要の「全体の方針」の小節の前に書いた検証しない範囲は、書式を機械で検査しない（自由な箇条書き）。概要が living なら書き換えは関門が人に回す（ADR-0078）。

## 却下した選択肢

- **残して確定させる（design.md と GLOBAL.md を active / living にして、承認後の書き換えを止める）**: 写しであることは変わらず、元の契約・ADR・コードを直しても写しは直らない。確定させると、食い違ったまま承認済みとして残る。
- **任意の文書として残し、検査だけ外す**: 置いてよい文書が残ると、agent が写しを書き続ける。誰も中身を確かめない文書が増える。
- **移行の道具（`harness migrate` の一つ）を作る**: design.md の記述を契約・ADR・コードのどれに当てるか、GLOBAL.md の行が本当に検証しない範囲かは、機械では決められない。
