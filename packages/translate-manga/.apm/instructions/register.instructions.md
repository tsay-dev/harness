---
description: "📦 韓国語 → 日本語 のレジスターの写像（誤訳の温床）"
applyTo: "**/master/**,**/episodes/**"
---

# 📦 韓国語 → 日本語 のレジスターの写像（誤訳の温床）

> 敬語体系・一人称/二人称・擬音擬態語を日本語口調へ写す判断基準。ここが韓→日翻訳で最も誤訳が生まれる場所。
> 判定の根拠になる階級構造・口調表は [master-format.md](master-format.instructions.md)（story.md / characters.md）。
> 割れたら丸めず ⚠ を付ける（理由コードは [script-format.md](script-format.instructions.md)）。
> 実行手続きは skill [translate-manga-ko-ja](../skills/translate-manga-ko-ja/SKILL.md) の Stage 2。

- **敬語体系の写像は身分・関係で決まる。** 반말/존댓말、하게체/하오체/해요体 が日本語の
  「〜だ／〜である／〜です／〜でございます」のどれかは、characters.md の口調表を根拠に判定する。
- **一人称・二人称**は身分と態度を映す（나/저/本人名、너/당신/職位）。安易に固定しない（`⚠人`）。
- **擬音・擬態語（SFX）は別カテゴリ**として扱い、通常セリフと混ぜない（`⚠音`）。
