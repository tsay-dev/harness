---
id: ADR-0033
title: agent を隔離・並列・独立性が要る 5 体に統合し、手順は skill から references へ、develop-light は本線に吸収する
status: accepted
date: 2026-09-14
---

# ADR-0033 agent を隔離・並列・独立性が要る 5 体に統合し、手順は skill から references へ、develop-light は本線に吸収する

## Context

develop の agent は 16 体あり、その多くは推論を分解するための分割だった（domain / usecase / requirement の定義役、contract-author、FE / BE の implementer、structure-oracle と slice-reviewer、committer、adr-writer）。分解の境界では orchestrator の判断理由が要約に落ち、特に committer と adr-writer は入力が orchestrator 自身の要約（intent、Context / Decision）であるため、別コンテキストにする利益がなかった。

`develop/SKILL.md` は 443 行で、起動時に 1 回だけ読まれる。harness 自身が「§1 が会話に押し出されて効かなくなる」と認め、phase 更新のたびに再読を指示していた。工程ごとの起動順・往復規則を手順で固定するほど、モデルの分解が人間の分解仮説を超えた時点で上限になる。

採用する原理: 最終的に仕様と実装が紐づいていればよく、その間のプロセスは問わない。紐づきは tools で機械的に検査し（ADR-0031、ADR-0032）、順序と深さはモデルに任せる。agent は「別コンテキストが必要か」（隔離・並列・独立性）でだけ残す。

## Decision

- develop の agent を 5 体に統合する: `spec-author`（domain / UC / REQ+BR / 契約。UC 単位の並列執筆のため）、`test-author`（実装を読まない独立性のため）、`implementer`（`mode: logic | appearance | schema | probe`。並列実装のため。FE / BE の区別は渡される規約 bundle と書込先で決まり、ペルソナで分けない）、`reviewer`（`mode: structure | slice | proposal`。producer と別コンテキストの反証のため）、`attacker`（`scope: slice | system`。`/attack` 専用）。判定文: 「この agent に渡す時、前段の判断理由を要約で捨てているか」— 捨てているなら畳む。
- committer と adr-writer は orchestrator の手順に畳む。craft は `skills/develop/references/commit.md` / `adr.md` に移し、orchestrator 自身が commit と ADR を書く。「orchestrator はコードを書かない」は「実装とテストを書かない。自分が書いたものを自分で判定しない」に改める。
- `develop/SKILL.md` は 100 行以内とし、役割・不変条件・完成の閉じたリスト・判定の閉じ方・既定の playbook（柔らかい）・agent 表・references の読みどきだけを持つ。手順は同ディレクトリの `references/{playbook,bundles,commit,adr}.md` に置き、明示的な「Read when」で参照する。APM は skill フォルダを丸ごと配置し、legacy 射影も補助ファイルを出力する。
- test-author → implementer の順序強制を外す。契約 `fixed` 後に test-author / implementer(logic) / implementer(appearance) を同時起動してよい。BE テストは implementer の「閉じる」入力であり開始入力ではない。テストは契約の operation を規約（testing 葉の「operation → entry」）で導出した入口で呼び、実装の関数を名指ししない。入口がずれた場合は実装側が動く（R-801）。
- `/develop-light` は廃止し本線に吸収する。深さの選択は orchestrator の裁量で、終端ゲートと人間ゲートは同じである。
- 外部から develop skill の節番号を指していた参照（rules-* の testing 葉、render-media）は references のファイルと見出しを指す。

強制の所在: agent の集合は `tools/apm/test_projection.py` の tier 期待集合。SKILL.md の行数上限は CLAUDE.md の指針（説得的）。references の同梱は `test_projection.py` のリンク到達性検査。

## Consequences

- 起動の判断が「どの専門家か」から「別コンテキストが要るか」に変わり、往復と要約損失が減る。
- 1 体の craft が長くなる（implementer は 4 モード）。モードごとの delta を明示して共通部分を 1 度だけ書く必要がある。
- orchestrator が commit と ADR を自分で書くため、Task 実行中に commit しない・secrets を含めない等の guardrail を references で自分に課す。
- 順序強制を外すと、実装がテストに先行した場合に implementer の再起動が 1 回増えることがある。入口の規約が無い host（rules パッケージ未導入）は `CLAUDE.md` に規約を宣言する必要がある。
- `develop-light` を使っていた host は本線に移る。手順の削減はモデルの裁量になるため、深さの見積もりは人間が観察する。
- 既存 ADR-0020 / 0024 / 0028 / 0029 の agent 名の記述は履歴として残る。tier 対応表は agent 名を持たないため（ADR-0028）改修は不要。

## 却下した選択肢

- **committer / adr-writer を薄い skill にする**: skill から skill を起動する慣例がなく、description 起動の誤発火余地がある。references なら develop の文脈で明示的に読める。
- **commit / ADR の craft を instruction 葉にする**: commit message にはファイルアドレスがなく `applyTo` で届かない。
- **SKILL.md を単純に短縮する**: 手順が失われる。references に移して「Read when」で引く。
- **judge を structure-oracle / slice-reviewer の 2 体のまま残す**: 見る時期が違うだけで craft の大半（台帳、反例、read-only）が共通。mode で分ける。
- **FE / BE の implementer を残す**: 差は規約 bundle と書込先であり、ペルソナの差ではない。分けると同じ検証規則が 3 箇所に複製される。
- **develop-light を新ルールで書き直して残す**: 本線が深さをモデルに任せる以上、差分が「終端レビュー 1 回のみ」程度に縮み、別 skill を維持する理由がない。
