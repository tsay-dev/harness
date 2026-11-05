---
description: "React SPA / TanStack Router — 機能の境界、薄い routes、ナビゲーション"
applyTo: "**/apps/web/src/**,**/vite.config.*,**/e2e/**,**/playwright.config.*"
---

# React SPA — 機能のルーティング

ブラウザ routes は `apps/web/src/routes/`。Hono の機能 routes は[バックエンドコーディング](backend-coding.instructions.md)の別の層。

## 配置と公開境界

- TanStack Router のファイルベースルーティングを使い、route ファイルは `beforeLoad`、`loader`、機能 components の配置に留める。機能 UI や業務ロジックを route ファイルに置かない。生成ルートツリーは再生成する。
- 機能は `apps/web/src/features/<feature>/{api,components,hooks,lib,index.ts}`。`index.ts` が公開 components、hooks、型を明示的に export し、機能内部は直接ローカル import する。
- 機能は別の機能を直接 import しない。協働は routes や組み立て境界で構成し、入力とコールバックを渡す。
- 共有の表示プリミティブは `components/ui/`、技術コードは `lib/`、技術的 hooks は `hooks/`。機能境界を回避するために業務ロジックを共有フォルダーへ移さない。

## ナビゲーション

- path / search 入力は使用前に検証する。共有可能なフィルター、ソート、ページネーション、選択リソースは型付き URL 状態、一時的なダイアログ / 下書きはローカル。
- route loaders / preloading とマウントされた hooks で同じ query options を再利用する。route は機能の公開 query インターフェースを import し、`api/` 実装に直接触れない。
- `beforeLoad` の認証ガードはナビゲーションの改善にすぎず、保護された操作はサーバーで認可する。戻り先を検証してオープンリダイレクトを防ぐ。
- この SPA はブラウザで描画する。RSC 境界、`use server`、Server Actions を導入しない。

## 外観 / シナリオの共有ロケーター契約

`apps/web/src/` の外観作成者と `e2e/` のシナリオ作成者の両方に適用する。相手の実装を調べず、用語集と固定契約から独立に導出する。

| 優先順位 | 外観が出力するもの | シナリオが使うもの |
| --- | --- | --- |
| 第一 | 用語集の語そのものを使う、意味的なコントロールの role とアクセシブルな name / label | `getByRole(role, { name })` または `getByLabel(text)` |
| 文言が曖昧な場合 | トリガーは `data-testid="operation"`、入力は `data-testid="operation.field"`（契約の操作名とフィールド名） | 同じ識別子の `getByTestId` |

CSS、XPath、位置による `nth()`、偶然の画面文言からロケーターを導出しない。食い違えば外観を変える。
