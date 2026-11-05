---
description: "Hono — 機能の routes、services、repositories、型付き RPC 契約"
applyTo: "**/apps/api/src/**,**/packages/shared/src/**,**/tests/backend/**,**/tests/integration/**"
---

# Hono — 機能の境界

[共通コーディング](common-coding.instructions.md)に従う。HTTP の入口は Hono で、ブラウザコードからサーバーサービスを直接呼ばない。

## 責任の分割

`apps/api/src/features/<feature>/<feature>.routes.ts` → `.service.ts` → `.repository.ts`。責任の分割であり、追加の抽象層（`UseCase` クラス、DTO 層、domain ディレクトリ）を要求しない。

| ファイル | 含めるもの | 含めないもの |
| --- | --- | --- |
| `*.routes.ts` | HTTP 検証、主体識別、service 呼び出し、レスポンス変換 | インライン SQL、業務判断 |
| `*.service.ts` | ユースケースの調整と純粋な業務関数（ユースケースの役割） | Hono context、環境変数、Prisma Client と生成モデル型、通信レスポンス |
| `*.repository.ts` | 注入された依存先を通じた永続化と外部 I/O | 業務方針、routes への逆呼び出し |
| `middleware/auth.ts`、`middleware/error-handler.ts` | 再利用する主体識別とエラー境界 | 機能の業務フロー |
| `types/env.ts` | 起動時に検証する環境設定と型付き Hono variables | 秘密情報のリテラル |

- service は注入可能な repository 境界と純粋関数に依存し、別機能の service を直接 import しない。時刻と乱数は注入する。
- `apps/api/src/index.ts` で middleware と機能 routes を組み立て、推論した `AppType` と app を公開する。`server.ts` で `@hono/node-server` と実依存を組み立て、待ち受けを開始する。
- route / service の import 時に待ち受け、DB 接続、環境変数の読み取りを開始しない。接続と起動は組み立て境界に集める。

## 入出力と Hono RPC

- service を呼ぶ前に body、params、query、必須ヘッダーを Zod で検証する。Zod は権限や永続化不変条件を保証しないので、それらは service の判断で保証する。
- service の結果を契約のステータスと公開レスポンス形へ変換する。生の DB 行、内部エラー、秘密情報、スタックは返さない。予期しない失敗は middleware で捕捉し、相関識別子付きでログに記録して一般化したエラーを返す。
- ハンドラーはチェーン化した routes 内に宣言し、再利用するなら `createFactory().createHandlers()` を使う。チェーンの結果型を失うと `AppType` からルートが欠落する。
- `hc<typeof subRoutes>` で分割するなら、サブルート型に含まれないマウント接頭辞をベース URL に含め、二重にしない。`app.onError` のレスポンスは推論型の union に自動では含まれないので、共有エラーを明示的にモデル化する。
- RPC の型付けは実行時の検証や認可ではない。

テストの入口と依存注入は実装前に[テスト対応付け](common-testing.instructions.md)で宣言する。
