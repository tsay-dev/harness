---
description: "🧱 Expo / frontend — コンポーネントの粒度と分担"
applyTo: "**/*.tsx,**/*.ts,**/app.json,**/app.config.*,**/eas.json"
---

# Expo / frontend — コンポーネントの粒度と分担

コンポーネント群の分割と、誰がどこを書くかを定める。表層は[表層コーディング](frontend-coding.instructions.md)、状態は[データフロー](frontend-dataflow.instructions.md)、画面の場所は[ルーティング](frontend-routing.instructions.md)。Expo でなければ適用外として破棄する。

## レイヤー（責務）と配置（共有範囲）は別の 2 軸

| レイヤー | 責務 |
| --- | --- |
| ui | 外観の最小単位。業務も通信も知らない |
| parts | 再利用可能な ui のまとまり。局所 state は持つが業務は知らない |
| feature | 業務を知る。契約に適合する通信や query を扱ってよい |
| screen / route | 構成と配線だけ。外観は下位へ委譲する |

- 再利用可能なコンポーネントは業務 domain を知らず、props もそのレイヤーの語彙で命名する。
- 依存は `screen → feature → parts → ui` の一方向。逆流と同階層間の import を作らない。子から親への通知は親から渡された callback を呼ぶ。
- 配置は実際の利用範囲を覆う最小の場所。2 つ目の利用箇所が現れた時点で切り出して引き上げる。書き始める前に同じ外観の既存を探す。ディレクトリ名はプロジェクトの `CLAUDE.md` が定め、harness は分離だけを固定する。
- 色、余白、角丸、字間は token に置き、同じ視覚 style を 2 か所に書かない。`ui` レイヤーのコンポーネントは外側の `margin` を持たず、間隔は親が決める。

## UI 実装者とロジック実装者の境界

外観とロジックは別コンテキストの実装者が扱う（oracle が異なる: 外観は人間の目視、ロジックは機械テスト）。

- route ファイル（`app/**`）は hook 呼び出しと props の受け渡しだけを持ち、JSX 本体は view コンポーネントに置く。
- UI 実装者は props だけで表示が決まる view コンポーネントと styling を書く。query hook、API client、store、`expo-secure-store` を import せず、`fetch` を書かない。データは契約に適合する固定 mock を props に流す。
- ロジック実装者は hook、API client、query / store 設定、route の配線を書き、JSX 構造と styling を作り直さない。
- props 型は UI 実装者が定義・export し、ロジック実装者がそれに写像する。不足を見つけた側は実装を止めて報告し、相手側を独断で変えない。
- loading / 空 / エラー / 権限なし / 境界（長文、0 行、巨大な数）はすべて props で表し、UI 側はその由来を知らない。
