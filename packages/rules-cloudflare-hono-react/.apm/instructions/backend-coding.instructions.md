---
description: "Hono — 機能の routes、services、repositories、型付き RPC 契約"
applyTo: "apps/api/src/**,packages/shared/src/**,**/tests/backend/**,**/tests/integration/**"
---

# Hono — 機能の境界

[共通コーディング](common-coding.instructions.md)に従う。HTTP の読み書きは Hono を入口とし、ブラウザコードからサーバーサービスを直接呼ばない。

## 機能の構造と責任

`apps/api/src/features/<feature>/<feature>.routes.ts`、`<feature>.service.ts`、`<feature>.repository.ts` を使う。
実行時の流れは **routes → service → repository**。これらは責任であり、さらに抽象的な層を要求するものではない。

| ファイル / 責任 | 含めるもの | 含めないもの |
| --- | --- | --- |
| `*.routes.ts` | HTTP 検証、主体識別、サービス呼び出し、レスポンス変換 | インライン SQL、実質的な業務判断 |
| `*.service.ts` | ユースケースの調整と純粋な業務関数 | Hono context、Worker バインディング、Drizzle ビルダー、通信レスポンスの構築 |
| `*.repository.ts` | 注入された依存先を通じた永続化と外部 I/O | 業務方針、routes への逆方向の呼び出し |
| `middleware/auth.ts`, `middleware/error-handler.ts` | 再利用可能なリクエスト主体識別 / エラー境界 | 機能の業務フロー |
| `types/env.ts` | 生成されたバインディングと型付き Hono variables | 手書きのバインディング定義の重複 |

- service は develop のユースケースの役割を果たす。パターンに合わせるだけのために専用の `UseCase`、DTO、domain ディレクトリ、インターフェース、クラスを必須にしない。
- service 内でも純粋な業務関数と副作用の調整を分ける。明確になるなら機能内のモジュールに抽出する。判断に必要な時刻 / 乱数は注入する。
- バックエンドロジック担当は routes / services / repositories、スキーマ担当はネイティブな永続化スキーマとマイグレーションを所有する。フロントエンドロジック担当はブラウザの接続、外観担当は表示を所有する。
- services は注入可能な repository 境界と純粋関数に依存する。機能の service を別機能の service に直接結合してはならない。必要な協働は組み立てを通じて与え、共有概念はドメイン上の根拠がある場合にのみ抽出する。
- `apps/api/src/index.ts` で middleware と機能の routes を組み立て、推論された `AppType`、Hono app の default export、Durable Object クラスの名前付き export を公開する。機能の route / Object モジュールを直接 import してよい。React の公開 index 制約はここには適用しない。
- Node の既定テストスイートが必要とする route / service モジュールには `cloudflare:workers` と Object クラスの import を含めない。Worker の組み立てと実際のバインディング動作は workerd で検査する。

## 入力、出力、共有契約

- service を呼ぶ前に、body、params、query、必須ヘッダーを Zod / `@hono/zod-validator` で検証する。WebSocket フレームはそれ自身の信頼境界で検証する。
- HTTP / WebSocket スキーマは `packages/shared/src/<feature>/schemas.ts` で共有し、公開型をそこで推論する。DB スキーマ、行、サービス実装、バインディングは共有パッケージに置かない。
- Zod オブジェクトの解析は権限や永続化された業務不変条件を保証しない。制御した repository 入力を使う service レベルの判断で保証する。
- service の結果を意図した HTTP ステータスと公開レスポンス形状に変換する。専用 DTO クラスは不要。生の DB 行、内部エラー、秘密情報、スタックは公開契約ではない。
- 安定した契約エラーコードを使う。予期しない失敗は middleware 境界で捕捉し、相関識別子付きで安全にログを記録して、一般化した公開エラーを返す。

## ハンドラーの組み立てと Hono RPC

- チェーン化した Hono routes 内にハンドラーを直接宣言する。再利用可能なハンドラーを抽出するときは `createFactory().createHandlers()` を使う。Rails 風の Controller クラスや、validator の型推論を失う型のない抽出ハンドラーを導入しない。
- チェーン化した route の結果型を保持する。戻り値の型を失った素の app 変数から `AppType` を導出すると、RPC からルートが気づかれず欠落する。
- 完全に組み立てたアプリケーションから公開 `AppType` を導出する。ブラウザは消去される `import type` と `hc<AppType>` を使い、サーバーモジュールを実行時に import しない。
- `hc<typeof subRoutes>` でクライアントを分割するなら、サブルート型に含まれないマウント接頭辞をクライアントのベース URL に含める。`.basePath(...)` と `.route(prefix, subRoutes)` の両方を考慮し、推論型に既にあるパスの接頭辞を二重にしない。
- `app.onError` / グローバル middleware のレスポンスは、すべての推論されたルートレスポンスの union に自動で含まれるわけではない。実行時のそれらのレスポンスを明示的に扱い、共有エラーを意図的にモデル化する。RPC 型がそれらを不可能にすると断言しない。
- RPC の型付けは実行時の検証や認可ではない。ブラウザバンドルからサーバー import が除去されることと、実際のクライアント呼び出しが型検査対象であることを確認する。

テストの入口と依存注入は、実装前に[テスト対応付け](common-testing.instructions.md)に従って宣言する。
境界の詳細は[セキュリティ](backend-security.instructions.md)、[D1](backend-database.instructions.md)、任意の[リアルタイム](backend-realtime.instructions.md) / [ストレージ](backend-storage.instructions.md)を読む。
