---
id: ADR-0042
title: Cloudflare 構成の React と Hono を対応する機能単位で配置する
status: accepted
date: 2026-10-09
---

# ADR-0042 Cloudflare 構成の React と Hono を対応する機能単位で配置する

## Context

`rules-cloudflare-hono-react` の作成にあたり、ユーザーから React と Hono の両側を feature 単位で分け、同じ機能名を対応させたいとの指定があった。画面と API の編集先を機能名から辿れ、feature 内部の変更を外部へ波及させにくい構成が必要になる。

初期の参考構成では API の routes、DB アクセス、Durable Objects が種類別のディレクトリに分かれていた。また、既存 Next.js 規約にある barrel 禁止をそのまま移すと、指定された React feature の公開 `index.ts` と矛盾する。

## Decision

新パッケージの標準配置を `apps/web/src/features/<feature>`、`apps/api/src/features/<feature>`、`packages/shared/src/<feature>` とする。同じ業務上の関心には同じ機能名を使い、別の関心を名前だけの一致のために統合しない。

React のルートは遷移・読み込みの宣言と feature の配置を担う。feature 外部からの参照はその公開 `index.ts` を経由し、feature 同士は直接 import しない。必要な協調はルートなどの組み立て側で行い、共通 UI や汎用処理は業務に依存しない共有先へ分ける。公開口としての barrel は認めるが、feature 内部から自分の公開口を経由して循環させない。

Hono は feature ごとの `routes → service → repository` を基本とし、UseCase・DTO の専用層やディレクトリを一律には要求しない。入口は HTTP の検証と応答変換、service は業務判断と処理の調停、repository は永続化を担う。純粋な判断と副作用の役割は分離し、service に Hono context や Drizzle のクエリビルダーを漏らさない。

Hono のルート定義は型推論を保つチェーンで記述し、ハンドラはその中に置くか型を保つ factory で構成する。Controller クラスを追加しない。アプリの組み立て入口は feature のルートと Durable Object クラスを直接参照できる。React の公開口規則をこの入口へ誤適用しない。

D1 スキーマと SQL migration は API の共通 DB 領域に置き、Durable Object 内のスキーマと更新処理はその feature 内に置く。DO 内の DB 更新と、Wrangler の DO クラス migration は別の管理対象とする。HTTP と WebSocket の境界スキーマは shared の対応する feature に置く。

配置と import 境界は規約本文で定義し、消費側の型検査・import 制約 lint・統合テストへ接続する。規約パッケージ自体はアプリの lint 設定を自動生成しないので、導入だけで機械的強制が成立するとは扱わない。

## Consequences

- 同一機能のフロントとバックエンドの編集先を対応付けられ、DO の処理も担当 feature から辿れる。
- service にユースケースの役割を持たせることで、小規模な機能でも形式だけの層を増やさずに済む。
- 公開 `index.ts` の保守と依存境界の検査が必要になり、公開口を経由する循環参照には注意が必要になる。
- feature 間の協調は組み立て側で明示する必要がある。共通化を急いで汎用 lib に業務処理を集めると、機能境界を失う。
- D1、DO 内 SQLite、DO クラスの三つの更新対象を区別して運用しなければならない。

## 却下した選択肢

- **API の全 routes・repositories・Durable Objects を種類別に集約する**: 一つの機能の変更が複数の場所に散らばり、今回指定された feature 単位の探索と合わない。
- **React の feature 内部を外部から直接 import する**: 内部のファイル分割を変えるたびに利用側も修正する必要があり、公開口による境界が失われる。
- **UseCase・DTO の専用層を必須にする**: service と入出力境界で表現できる段階でも形式的な分割を増やす。必要な責務分離を保ちつつ、追加分割は複雑さに応じて判断する。
- **Controller クラスにルートハンドラを集める**: ルート定義から切り離された型注釈で Hono RPC の推論を失いやすい。チェーン内のハンドラまたは型を保持する factory を選ぶ。
