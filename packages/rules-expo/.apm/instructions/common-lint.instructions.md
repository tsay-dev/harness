---
description: "Expo — プロジェクトの lint で止める項目の一覧"
applyTo: "**/*.tsx,**/*.ts,**/app.json,**/app.config.*,**/eas.json,**/eslint.config.*,**/.eslintrc*,**/biome.json,**/biome.jsonc,**/tsconfig*.json,**/harness.config.json"
---

# Expo — lint で止める項目

このスタックの規約のうち、lint（型検査を含む）で機械的に止められる決まりの一覧。ほかの規約はこれらを文章で繰り返さず、この一覧（`common-lint`）を指す。

- 止め方（使う道具、規則の名前、設定の書き方）は利用プロジェクトが決める。`harness.config.json` の `rules` に、その設定のファイルと、確かめる `commands` のキーを書く。
- まだ止めていない項目は、止めるまで `harness.config.json` の `conventions` に、項目の文と止めていない理由を書く。
- 対象から外すファイル（expo-router の route ファイルなど）は、lint の設定の側に書く。

| 止めること | 対象 |
| --- | --- |
| 型エラーを消すための `as any`、非 null アサーション（`!`）、`@ts-expect-error`、lint を抑えるコメント | 本番コードとテスト |
| default export（expo-router の route ファイル `app/**` を除く） | 本番コード |
| 再 export だけの `index.ts`（barrel） | 本番コード |
| `../../../` のように積み重ねた相対の読み込み（tsconfig のパスエイリアスを使う） | 本番コード |
| `react-native` の `SafeAreaView` | 本番コード |
| `screen → feature → parts → ui` の逆向きの読み込みと、同じ階層どうしの読み込み | 画面とコンポーネント |
| view コンポーネントが、query hook、API client、store、`expo-secure-store` を読み込む、または `fetch` を呼ぶ | 外観のコンポーネント |
| `@covers` を付けた仕様のテストが、入口の表（`common-testing`）が示す module とテストの足場以外の本番コードを読み込む | 既定スイートの `tests.dirs`（`@covers` を付けない部品の自己検査は、`tests.dirs` の外に置くので対象外） |
