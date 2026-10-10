---
id: ADR-0041
title: Cloudflare Workers・Hono・React SPA の規約を独立パッケージで配布する
status: accepted
date: 2026-10-09
---

# ADR-0041 Cloudflare Workers・Hono・React SPA の規約を独立パッケージで配布する

## Context

Cloudflare Workers 上で Hono API と React SPA を同一オリジン配信する構成を、harness から選択して導入したい。既存の Next.js 規約は RSC と Server Actions を前提としており、SPA にそのまま適用できない。ユーザーは技術スタックが分かる名前と、D1 に Drizzle ORM を使う提案を採用した。

検討の入力となったチャットアプリの構成案には、ルームと Durable Object の対応、保存期間、予算など案件ごとに決める事項もある。共通の配布パッケージへ案件固有の決定を持ち込む必要はない。

## Decision

`rules-cloudflare-hono-react` を独立した APM パッケージとして追加し、開発手続きが必要な消費側は `develop-core` と明示的に組み合わせる。バージョンは manifest で管理し、名前に連番を付けない。

規約は中立な `.apm/instructions/` 直下で関心ごとに分割し、`applyTo` とホストが宣言する編集先から必要な葉だけを配送する。新しい常駐ルーター、skill、agent は作らず、既存パッケージから暗黙に導入しない。実行アセットとテンプレートは従来どおりパッケージ外に置く。

D1 の標準アクセスを Drizzle とし、Durable Objects と R2 は使用するときの規約を定義する。ORM の採用は、DB の方言差や D1 と Durable Objects をまたぐ原子性を解消する保証にはしない。業務ごとの保存先・分割単位・保持期間・料金条件は消費側が決定する。

パッケージ形状・参照到達性は既存の projection テストと APM 導入で、選択したパッケージだけが生成されることは一時 consumer で検証する。規約本文のアプリケーションへの適用は、ホストの型検査・境界検査・統合テストに接続して初めて機械的な保証になる。規約をインストールしただけの状態は説得的制御であり、Cloudflare 上の実行や権限制御を保証したとは扱わない。

## Consequences

- 選択時に実行基盤・API・フロントの構成が分かり、Next.js の実行モデルを SPA へ誤配布しにくくなる。
- D1・Drizzle、Workers 配信、リアルタイム処理の境界を各担当者へ必要な範囲で渡せる。
- 特定の技術構成に対応するパッケージなので、各ライブラリとプラットフォームの変更に追随する保守が必要になる。
- 別のディレクトリ構成ではホスト側の編集先宣言と規約配送が必要になる。パッケージの存在だけで自動配送を保証しない。
- PostgreSQL などへの移行ではスキーマ・SQL・トランザクション・データ移行の検証が別途必要であり、Drizzle による型付けだけでは移行費用をなくせない。

## 却下した選択肢

- **`cloudflare-001` という連番名にする**: Cloudflare 上の Next.js 構成などと選択時に区別できず、内容の更新を表す manifest の version と別の番号を持つことになる。
- **`rules-cloudflare-hono-spa` にする**: SPA であることは明確になるが、採用する React が名前から分からない。React を名前に含め、SPA 前提は説明と本文で示す。
- **`rules-next` を継承して差分だけを追加する**: RSC・Server Actions・Next.js のルーティング規約が SPA の責務やデータフローと衝突する。
- **案件のチャット基盤 ADR をそのまま共通規約にする**: ルーム単位の分割や保持期間などを、同じ技術構成の別アプリにも強制してしまう。
