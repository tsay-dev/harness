---
description: "🔀 Next.js / frontend — 状態とデータフロー"
applyTo: "**/next.config.*,**/app/**/page.tsx,**/app/**/layout.tsx,**/app/**/loading.tsx,**/app/**/error.tsx,**/app/**/not-found.tsx,**/app/**/template.tsx,**/app/**/default.tsx,**/components/**,**/features/**"
---

# 🔀 Next.js / frontend — 状態とデータフロー

Next.js（App Router）の UI 表層が対象。対象外なら破棄する。RSC / Client 境界と読み取り配線は [frontend-coding](frontend-coding.instructions.md)、サーバー側の責務は [backend-coding](backend-coding.instructions.md)。この文書はデータの保持場所と流れる方向だけを定める。コメントとユーザー向け文言は日本語。

## 方向

- データは親 → 子へ props で下り、イベントは子 → 親へ親から渡された callback（`onX`）だけで上がる。子は import や参照経由で親の state やモジュール変数を書き換えない。
- ツリーをまたいで共有したくなったら、まずコンポーネント分割を疑う。それでも必要なら、プロジェクトの `CLAUDE.md` で承認した共有機構だけを使う（harness はライブラリを固定しない）。
- イベントの発生点は Client の末端に置く。Server Component の親が Client の子へ渡すのはシリアル化可能なデータと Server Actions（ミューテーションの入口）だけで、ユースケース、infrastructure、サーバー前提の domain 関数は渡さない。

## 状態の置き場所

| 種別 | 定義 | 置き場所 |
| --- | --- | --- |
| サーバーの正本 | DB または外部システムが正本を持つデータ（一覧、詳細、ユーザー情報）| 読み取り: RSC 配線 → ユースケース。更新: Server Actions → ユースケース |
| Client 専用状態 | サーバーが知らない一時 UI 状態（modal の開閉、入力途中、現在の tab）| 必要最小の Client 末端の `useState` など |

- 初回表示のために Client の `useEffect` で fetch して `setState` しない。読めるものは RSC（ユースケース経由）で読み、props で渡す。
- サーバーから受けた一覧や詳細を `useState` にコピーしない。例外は編集 form の下書きだけで、その場合はいつサーバー値から再初期化するかを明示する。
- client 側 cache 層（例: TanStack Query）を置くかは `CLAUDE.md` に宣言する。「Client で初期データを手動取得する」を既定にしない。
- 更新後は Action 側の再検証で表示が新しいサーバーの正本へ移る。Client 側で結果を手動合成しない。
