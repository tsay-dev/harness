---
description: "📐 Expo — 共通コーディング規約（全レイヤー）"
applyTo: "**/*.tsx,**/*.ts,**/app.json,**/app.config.*,**/eas.json"
---

# Expo — 共通コーディング規約（全レイヤー）

対象は Expo（expo-router）の React Native アプリ。拡張子で配送されるため、対象が Expo でなければ適用外として破棄する。レイヤーをまたぐ規約だけを持ち、表層の差分は[表層コーディング](frontend-coding.instructions.md)にある。コメントとユーザー向け文言は日本語。

- 整形（インデント、引用符、import 順）の正本はプロジェクトの lint / format コマンドであり、この文書は定義しない。返却前に format コマンドを実行する。
- lint で止める決まり（型の抜け道、default export、barrel、相対の読み込みの積み重ね、階層をまたぐ読み込み）は [lint で止める項目](common-lint.instructions.md) にあり、ここでは繰り返さない。
- 型エラーを抑えたくなったら、型か契約のどちらかが誤っている兆候として実装を止め、何と何が衝突しているかを報告する。契約を自分で書き換えない。例外は外部ライブラリの型定義と実挙動の乖離で、理由をコメントに残す。
- `app/` 配下の `index.ts` は、それ自体がルートになる。
- `EXPO_PUBLIC_` 環境変数と `app.config.ts` の `extra` は client bundle に埋め込まれ公開される。API のベース URL、feature flag、公開鍵は置いてよく、API の秘密情報、署名鍵、管理者 token は置かない。秘密情報を要する処理は client に置けないので、サーバー側の設計を自分で決めず実装を止めて報告する。
- native code を含む package を独断で追加しない（native の再 build が必要になる。`npm install` の成功は動作の証拠ではない）。必要なら何を、なぜ追加したいかを報告して止まる。既存依存の利用は制限しない。
