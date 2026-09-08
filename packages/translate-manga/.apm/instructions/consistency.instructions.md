---
description: "📦 増分更新・一貫性の担保（連載での価値の本体）"
applyTo: "**/master/**,**/episodes/**"
---

# 📦 増分更新・一貫性の担保（連載での価値の本体）

> master を黙って書き換えない作法（差分提案）と、連載を通じた一貫性の担保を定める。
> 単発の正しさより「前の話数と同じか」を保証することが、長期連載での価値。
> master の書式は [master-format.md](master-format.instructions.md)、なぜこの型かは [overview.md](overview.instructions.md)。
> 実行手続きは skill [translate-manga-ko-ja](../skills/translate-manga-ko-ja/SKILL.md) の Stage 4・5。

## 🔁 増分更新（マスターを黙って書き換えない）

- ep-001 は素材から用語集・口調表を**起こす（ブートストラップ）**。以降は master を読み込んで訳す。
- 新規キャラ・用語・口調を見つけても **master 本体を直接書き換えない。**
  `review/master-update.md` に**差分（追加/変更の提案）**として出し、**人間が承認してから** master に反映する。
- 黙った上書きは過去話との一貫性を静かに壊す。承認を挟むことでそれを断つ。

## 🧩 一貫性の担保（連載での価値の本体）

- 単発の正しさより「この用語・この口調は前の話数と同じか」を保証することが、長期連載での価値。
- 既存 glossary と照合し、**同一語が別訳になっていないか（ブレ）**を検出して `review/consistency.md` に報告する。

## 🔍 独立レビュー（別コンテキストで反証する）

一貫性・過信の検出は、**訳を作った主体にはさせない。** 同じ思い込みを見逃すため（rules コア制約「作る主体 ≠ 判定する主体」／[overview.md](overview.instructions.md)）。

- **judge は翻訳を作っていない別サブエージェント。** 入力は成果物（`review/script.md`）と `master/`・`source/` だけ。maker の思考過程は渡さない（同じ見落としを継がせない）。
- **仕事は"一致の確認"でなく反証（粗探し）。** source と master から自分で訳を導き直し、`script.md` と突き合わせて誤りを探す。
- 検出して `review/consistency.md` に報告する観点：
  - 既存 glossary と**同一語が別訳**になっていないか（ブレ）。
  - characters.md の口調表と**矛盾する口調**を割り当てていないか。
  - 曖昧なのに `⚠` が漏れている行はないか（**過信の検出**＝ maker が「通るはず」と流した行）。
  - master をブートストラップした話数では、draft の階級構造・口調表・glossary が source と食い違っていないか。
- **objective なブレ（glossary との不一致）は maker が `script.md` を訂正し再フラグ。** レジスターの解釈など判断が割れるものは `⚠` のまま人間へ委ねる（黙って1つに丸めない）。
