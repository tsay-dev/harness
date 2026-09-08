---
description: "📦 全体像・思想（韓国語漫画 → 日本語 翻訳チェックの型）"
applyTo: "**/master/**,**/episodes/**"
---

# 📦 全体像・思想（韓国語漫画 → 日本語 翻訳チェックの型）

> 韓国語で描かれた漫画（ウェブトゥーン等）を日本語に翻訳し、**最終的に人間が必ずチェックする**前提で、
> そのチェックコスト（脳の疲労・時間）を最小化するための型。ここは**この型の不変の核**（最初に読む）。
> 各書式の詳細は同カタログの葉（[master-format](master-format.instructions.md) / [script-format](script-format.instructions.md) / [register](register.instructions.md) / [consistency](consistency.instructions.md)）へ。
> 実行手続きは skill [translate-manga-ko-ja](../skills/translate-manga-ko-ja/SKILL.md)。

## 前提思想（これが全体の土台）

- **翻訳の正しさは「物語理解」が前提。** 世界観・階級・人間関係を理解していなければ、訳が適切かを人間もAIも判定できない。
- ゆえに AI の役割は**訳文を出すことだけではない。** 各行に「その訳を選んだ根拠（誰が誰にどんな立場で話しているか）」を添え、
  **人間が"疑うべき行"だけを精読できるよう注意を誘導する**こと。これがチェックコスト最小化の核。
- **全行を等しく読ませない。** これが最大のコスト削減。詳細は [§ チェックコスト最小化](#-チェックコスト最小化全行を等しく読ませない)。
- **作る主体と判定する主体を分ける（レビューは別コンテキスト必須）。** 訳した本人が自己レビューすると、同じ思い込み（「通るはず」）を見逃し、批判が甘くなる。一貫性・過信の検出は、**訳を作っていない独立したサブエージェント**に反証（粗探し）として行わせる。逆に**翻訳そのものは分割しない**——複数エージェントに並行させると口調・用語がぶれ、本方式の芯である一貫性を壊すため、master を共有する1つの脳で訳す。詳細は [consistency.md](consistency.instructions.md)。

## フォルダ構成（作品共通の脳 × 話数ごとの作業場）

肝は **作品全体で共通するマスターデータ**と**話数ごとに処理するエピソードデータ**を分けること。
連載物で新しい話数を訳すとき、AI に過去の文脈（用語・口調）を迷わず読み込ませ、**一貫性**を担保するため。

```text
<作品名>/
├── master/                      # 作品共通の「脳」（読み取りが正。更新は提案経由）
│   ├── story.md                 #   作品理解：あらすじ・世界ルール・階級/勢力の構造
│   ├── characters.md            #   キャラクター・口調定義表
│   ├── glossary.md              #   世界観・階級・固有名詞・専門用語集（韓→日 確定訳）
│   └── guideline.md             #   翻訳トーン&マナー・作品固有の方針
└── episodes/
    └── ep-001/
        ├── source/              #   原本（画像 and/or OCRテキスト。画像優先）
        ├── review/              #   AI生成・人間チェック用（skill の出力先）
        │   ├── script.md        #     対訳チェックシート（書式 → script-format.md）
        │   ├── consistency.md   #     一貫性・自己レビュー結果
        │   └── master-update.md #     master への更新提案（差分。承認後に反映）
        └── final/               #   人間承認後の決定稿（写植へ渡す）
```

- master/ の各ファイルの書式は [master-format.md](master-format.instructions.md)。
- **master/ は読み取りが正。** 話数を進めても skill が黙って書き換えない（[増分更新](consistency.instructions.md)）。
- **人間がメインで作業するのは `review/`。** ここで対訳をチェック・修正し、`final/` へ確定する。

## 🎯 チェックコスト最小化（全行を等しく読ませない）

人間チェックの本当のコストは「どこを疑えばいいか分からず全部読む」こと。
`✅` は流し読み、`⚠` だけ精読する運用にすると、読むべき行が大幅に減る。**これが本方式の最大の効果**。

- AI は「通るはず」と思い込んだ行こそ `⚠` を付ける（自信のある行だけ `✅`）。
- 曖昧さを黙って1つの訳に丸めない。割れる場合は文脈ノートに代替案を1つ添える。
- 信頼度フラグと ⚠ 理由コードの定義は [script-format.md](script-format.instructions.md)。

## ✅ チェック着手前の確認

- [ ] master/（story・characters・glossary）が対象作品ぶん存在するか（無ければブートストラップ／[master-format.md](master-format.instructions.md)）
- [ ] 対訳シートが厳格フォーマット（ID・信頼度・用語 の列）を満たしているか（[script-format.md](script-format.instructions.md)）
- [ ] `⚠` の理由コードが付き、精読すべき行が絞られているか
- [ ] master への変更が「更新提案（差分）」として分離され、本体を書き換えていないか（[consistency.md](consistency.instructions.md)）
- [ ] 既存用語とのブレが consistency.md に報告されているか
