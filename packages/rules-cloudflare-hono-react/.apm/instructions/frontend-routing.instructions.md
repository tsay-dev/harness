---
description: "React SPA / TanStack Router — 機能の境界、薄い routes、ナビゲーション"
applyTo: "apps/web/src/**,**/vite.config.*,**/e2e/**,**/playwright.config.*"
---

# React SPA — 機能のルーティング

[共通コーディング](common-coding.instructions.md)に従う。ブラウザ routes は `apps/web/src/routes/` に置く。Hono の機能 routes は[バックエンドコーディング](backend-coding.instructions.md)の別の層。

## 配置と公開境界

- `apps/web/src/routes/` に TanStack Router のファイルベースルーティングを使う。route ファイルは薄く保ち、`beforeLoad`、`loader`、機能 components の配置 / 組み立てに留める。route ファイル内に機能 UI や業務ロジックを構築しない。
- ブラウザ機能は `apps/web/src/features/<feature>/{api,components,hooks,lib,index.ts}` に置く。同じドメイン概念には API / shared と同じ機能名を使う。
- 機能の `index.ts` は公開 components、hooks、型を明示的に export する。外部の利用者はその入口を経由して import し、内部ファイルは公開入口の循環を避けるため直接ローカル import を使う。
- 機能は公開入口を含めて別の機能を直接 import してはならない。routes / 明示的な組み立て境界で協働を構成し、入力やコールバックを渡す。
- 共有の表示プリミティブは `components/ui/`、再利用する技術コードは `lib/`、技術的 hooks は `hooks/` に置く。機能境界を回避するだけのために業務ロジックを共有フォルダーへ移動しない。
- 生成ルートツリーは生成物のまま維持し、手編集ではなく再生成する。

## ナビゲーションと読み込み

- path / search 入力を使用前に検証する。共有可能なフィルター、ソート、ページネーション、選択リソースは型付き URL 状態に置き、一時的なダイアログ / 下書きはローカルに保つ。
- route loaders / preloading とマウントされた機能 hooks で TanStack Query の query options を再利用する。route は機能の公開 query インターフェースを import し、その `api/` 実装に直接触れない。
- 待機、空、エラー、not-found 動作を宣言する。公開契約に従ってアクセスできないリソースと未処理の通信失敗を区別する。
- `beforeLoad` の認証ガードはナビゲーションだけを改善する。保護された API 操作はすべてサーバーで引き続き認可する。リダイレクトループを避け、戻り先を検証してオープンリダイレクトを防ぐ。
- components は props でデータを受け、コールバックで親に通知する。query / route の調整は表示から分離する。
- この SPA はブラウザで描画する。RSC 境界、`use server`、Server Actions を導入しない。

## 外観 / シナリオの共有ロケーター契約

この契約は `apps/web/src/` の外観作成者と `e2e/` のシナリオ作成者の両方に適用する。両方の配置をこのリーフの配送メタデータに含める。
相手の実装を調べず、用語集と固定契約から独立にインターフェースを導出する。

| 優先順位 | 外観が出力するもの | シナリオが使うもの |
| --- | --- | --- |
| 第一 | 正確な用語集の語を使う、意味的なコントロールの role とアクセシブルな name / label | `getByRole(role, { name })` または `getByLabel(text)` |
| 意味的な文言が曖昧な場合 | 契約の操作名と request フィールド名で、トリガー: `data-testid="operation"`、入力: `data-testid="operation.field"` | 同じ導出済み識別子の `getByTestId` |

CSS、XPath、位置による `nth()`、偶然の画面文言からロケーターを導出してはならない。外観が契約と食い違うなら、シナリオに実装を教えるのではなく外観を変更する。
シナリオ実行と注釈は[システムテスト](system-testing.instructions.md)の責任。

ディープリンクと更新は [Static Assets ルーティング](platform-routing.instructions.md)、リモート状態は[データフロー](frontend-dataflow.instructions.md)に依存する。
