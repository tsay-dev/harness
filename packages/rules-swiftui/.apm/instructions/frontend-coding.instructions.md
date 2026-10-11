---
description: "🎨 SwiftUI / フロントエンド — 表示レイヤーのコーディング規則"
applyTo: "**/*.swift,**/Package.swift"
---

# 🎨 SwiftUI / フロントエンド — 表示レイヤーのコーディング規則

[共通規則](common-coding.instructions.md)に従った上で、View の書き方に適用する差分だけを持つ。状態の置き場は[データフロー](frontend-dataflow.instructions.md)、遷移は[ルーティング](frontend-routing.instructions.md)、分割と分業は[粒度と分業](frontend-components.instructions.md)。

## `body`

- `body` は現在の状態を外観に写す宣言。通信、Repository、UseCase の直接呼び出し、重い同期計算、ファイル I/O、セマフォ待機を置かない。
- 起動のトリガーは `.task`（必要なら `.task(id:)`）または明示的なユーザー操作に限り、本体は ViewModel に置く。`body` の中で `Task { }` を起動しない。`.onAppear` より `.task` を優先する。
- 1 ファイル / 1 `body` にフォーム、リスト、アラート、通信状態、レイアウトを詰め込まない。独立して読める部分は private な子 View へ。状態や操作が増えているなら View の分割ではなく ViewModel / Router の設計を疑う。子 View に渡すのは表示値とクロージャ（または薄い ViewModel への参照）まで。

## リスト

- 長いリストは `List` / `LazyVStack` / `LazyHStack`。`VStack` + `ForEach` で数百行を一度に構築しない。
- `ForEach` の id はドメイン上安定した識別子（`offset` や表示文字列にしない）。行の表示ごとに詳細取得を始めず、必要なデータは UseCase 側で揃える。行に渡すモデルは行が表示する範囲に留める。

## 画面端と Preview

- ノッチ、ホームインジケーター、Dynamic Island を前提にし、`safeAreaPadding` / `safeAreaInset` を使う。マジックナンバーだけで余白を埋めず、ナビゲーションバーやタブが消費した側に inset を二重に足さない。
- 入力のある画面は、キーボードが送信ボタンもフィールドも隠さない構造を最初から作る。
- `#Preview` を本番の `URLSession`、実 API、`.shared` に接続しない。Composition と同じ形で Repository / UseCase の fake を注入する。

## アクセシビリティと識別子（シナリオテストとの共有契約）

- 押せるものは `Button` として認識されること、アイコンだけのものは操作の意味を表す `accessibilityLabel`、装飾画像は `accessibilityHidden(true)`、選択中 / 無効はアクセシビリティ状態にも表す。
- 識別子は創作せず導出する（ADR-0037）: 契約の operation を発火するコントロールに `.accessibilityIdentifier("<operation>")`（`"createProject"`）、request フィールドの入力に `.accessibilityIdentifier("<operation>.<field>")`（`"createProject.title"`）。表示文言のコピーを id にしない。
- 見える文言（`Text`、ボタンラベル、`accessibilityLabel`）は用語集（`docs/01-glossary.md`）の語をそのまま使う。新しい語はゲートを通して用語集に追加し、View に先に書かない。
- これらは[システムスイート](system-testing.instructions.md)がタップ・検証するロケーター。報告に文言 → 識別子の表を返し、不一致は外観側を修正する。FE ユニットテストは作らない。

## レイアウト

- 必要な計測を説明できる場合だけ `GeometryReader` を使う。
- 色、フォント、余白はプロジェクト共通のデザイン入口（Assets、トークン集合）があればそこに置く。なければ独断でデザインシステムを立てず、既存のスタイルに合わせる。
- アニメーションは `animation` / `withAnimation` に任せ、毎フレーム状態を更新したり、クロージャに重い計算を埋め込んだりしない。
