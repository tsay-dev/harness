---
description: "🎨 Expo / frontend — 表層コーディング規約"
applyTo: "**/*.tsx,**/*.ts,**/app.json,**/app.config.*,**/eas.json"
---

# Expo / frontend — 表層コーディング規約

共通規約は[共通コーディング](common-coding.instructions.md)。この文書は React Native の表層を拘束する差分と、外観 / シナリオテストが共有する識別子契約だけを持つ。Expo でなければ適用外として破棄する。

## 表層の不変条件

- 条件付き描画は `&&` ではなく三項と明示的な `null`（`<View>` 直下に文字列、空文字、`0` を落とさない）。
- style は `StyleSheet.create` に置き、JSX 内で object literal を作らない。影は iOS（`shadow*`）と Android（`elevation`）の両方を指定する。
- platform 分岐は、値数個の差なら `Platform.select`、構造が違うか片方だけ native 依存なら `Foo.ios.tsx` / `Foo.android.tsx`。分けた場合は props 型を共有ファイルに置き、両方の export 名を一致させる。`Platform.OS === 'web'` 分岐はプロジェクトが Expo Web の出荷を決めた場合だけ書く。
- safe area は `react-native-safe-area-context` から取得し、`react-native` の `SafeAreaView` を使わない。navigator が消費した辺は `edges` で除外し、inset を二重に足さない。
- 入力を含むすべての `ScrollView` に `keyboardShouldPersistTaps="handled"` を付ける。

## accessibility と testID（外観 / シナリオの共有契約）

- 押せるものすべてに `accessibilityRole`、text のない要素に `accessibilityLabel`（何をするかを書く）、disabled / selected / expanded は `accessibilityState` で表す。44pt 未満の tap 領域は `hitSlop`。
- 押せるものとシナリオ flow が特定するものすべてに安定した `testID` を付け、値は発明せず導出する（ADR-0037）: 契約 operation を実行する control は operation 名（`testID="createProject"`）、request field の入力は `<operation>.<field>`（`testID="createProject.title"`）。表示文言をコピーしない。契約にない id を使わない。
- 見える文言（label、button 文言、`accessibilityLabel`）は用語集（`docs/01-glossary.md`）の用語をそのまま使う。新しい用語はゲートを通して用語集へ追加し、先に画面へ入れない。
- 報告には文言 → `testID` の表を返す。シナリオ flow（[システムテスト](system-testing.instructions.md)）と不一致なら外観側を動かす。
