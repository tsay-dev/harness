---
description: "🔀 Next.js / frontend — 状態とデータフロー"
applyTo: "**/next.config.*,**/app/**/page.tsx,**/app/**/layout.tsx,**/app/**/loading.tsx,**/app/**/error.tsx,**/app/**/not-found.tsx,**/app/**/template.tsx,**/app/**/default.tsx,**/components/**,**/features/**"
---

# 🔀 Next.js / frontend — 状態とデータフロー

> **対象: Next.js（App Router）の UI 表層。** Next.js でなければ適用外として扱い、破棄する。
>
> 共通規約は [common/coding.md](common-coding.instructions.md)、RSC / Client 境界は [coding.md](frontend-coding.instructions.md)、
> 粒度は [components.md](frontend-components.instructions.md)、配置は [routing.md](frontend-routing.instructions.md)、
> サーバー側の責務分離は [backend/coding.md](backend-coding.instructions.md) にある。
> この文書は **データの保持場所と流れる方向**だけを定義する。
>
> **コメントとユーザー向けの文言は日本語で書く。**

---

## 0. 目的の定義（流れを一方向にすると何が守られるか）

React が保証するのは、おおむね次の 2 点だけである。

1. state が変わると再 render する
2. **props は親から子への一方向**

そこに「子が親の state を直接書き換える」「どこからでも fetch する」を加えると、
1 画面の正本が複数箇所へ分散し、AI にも人間にも変更の影響範囲が読めなくなる。

App Router にはさらに **Server Component と Client Component の間で渡せるものに制約がある**。
通常の web React の感覚で関数やクラスを prop として渡すと実行時エラーになる。

**この文書の役割は、データの方向と置き場所を固定し、抜け道を塞ぐことである。**

---

## 1. データは親 → 子、イベントは子 → 親（一方向）

| 方向 | 渡すもの | 手段 |
| --- | --- | --- |
| **親 → 子** | 表示に使うデータと設定 | **props** |
| **子 → 親** | 「何かが起きた」という通知 | 親から渡された **callback**（`onX`）だけ |

```tsx
//  OK: データは下り、イベントはコールバックで上る
function Parent() {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onClose={() => setOpen(false)} />;
}

//  NG: 子が親の state やモジュール変数を直接触る
//  NG: グローバル可変オブジェクトを配って各方書き込む
```

- 子は import や参照経由で親の state を書き換えない
- ツリーをまたいで共有したくなったら、**まずコンポーネント分割を疑う**。それでも必要なら、プロジェクトの `CLAUDE.md` で承認した共有機構だけを使う（この文書は特定ライブラリを固定しない）

```text
[親]  props（データ） →  [子]
[親]  ← onEvent()        [子]
```

---

## 2. event handler は Client の末端に閉じる

Server Component は `onClick` などの event handler を持てない（フレームワークの制約）。

- 対話が必要な node だけ `"use client"` にする（[coding.md](frontend-coding.instructions.md)）
- **イベントの発生点を Client の末端に置く**
- 末端より上の Client 親へ通知するときは、§1 に従い **props callback 経由**で上げる

Server Component の親が Client の子へ渡すのは **データ（props）**と、必要に応じて **Server Actions**（§3）。
Server から Client へ渡す通常の inline 関数を `onClick` に結び付けない。

---

## 3. Server から Client へ渡せるもの

Client Component へ渡す props は **シリアル化可能な値**に限る。

| 渡してよい | 渡してはいけない |
| --- | --- |
| シリアル化可能なデータ: 文字列、数値、boolean、配列、plain object、`Date` など | 通常の関数、クラス instance、Map/Set などのシリアル化できない値 |
| **Server Actions**（ミューテーションの入口として渡す）| ユースケース / infrastructure / サーバーを前提とする domain 関数そのもの |

読み取り配線の手順（params 検証、ユースケース、`notFound` / props への写像）の
**SSOT は [coding.md](frontend-coding.instructions.md) §2** にある（page 全体をここへ再掲しない）。

この文書が定義するのは受け渡しの形だけである。

```tsx
//  OK: Client へ渡すのはシリアル化可能なデータと Server Action 参照だけ
<UserEditForm user={user} updateUser={updateUserAction} />

//  NG: Server で定義した通常関数を Client に渡す
//  <Button onClick={() => doSomething()} />
```

**ミューテーションの本体は Server Action（ミューテーション・コントローラー）に置き、backend-logic が書く。**
詳細は [backend/coding.md](backend-coding.instructions.md)。frontend は呼び出しと props の受け渡しだけを行う（[coding.md](frontend-coding.instructions.md) §4）。
Client からユースケースや DB client を import・呼び出しすることは禁止する。

---

## 4. 状態の置き場所（軽量な規約）

値を保持する前に **その値の正本がどこにあるか**を決める。

| 種別 | 定義 | 置き場所 |
| --- | --- | --- |
| **サーバーの正本** | DB または外部システムが正本を持つデータ（一覧、詳細、ユーザー情報）| **読み取り**: RSC 配線 → ユースケース。<br/>**更新**: Server Actions → ユースケース（[backend/coding.md](backend-coding.instructions.md)）|
| **Client 専用状態** | サーバーが知らない一時 UI 状態（modal の開閉、入力途中、現在の tab）| 必要最小の Client 末端の `useState` など。共有が必要な場合のみ、プロジェクトが承認した機構 |

禁止事項と避けること:

- **初回表示のために** Client の `useEffect` で fetch して `setState` しない。読み取れるなら RSC（ユースケース経由）で読み、props で渡す
- 編集 form 以外の理由で、サーバーから受けた一覧や詳細をそのまま `useState` にコピーしない（コピーした瞬間に再取得や Action 後の表示と乖離する）
- 編集 form のように「入力中の下書き」が必要な場合だけ、初期値として受けて局所 state に置いてよい。**いつサーバー値から再初期化するかを明示する**

> client 側 cache 層（例: TanStack Query）を置くかはプロジェクトの `CLAUDE.md` に宣言する。
> harness はライブラリを固定しない。ただし「Client で初期データを手動取得する」は既定にしない。

---

## 5. 画面内の流れ（図）

```text
RSC（page 配線）
  │  ユースケース経由で読み取り
  ▼
  props（データ）/ Server Action（更新入口）
  │
  ▼
Server / Client の表示コンポーネントツリー
  │  props を通してデータが下る
  ▼
Client の末端（入力、クリック）
  │  onX で Client 親へ上げる、または Server Action を直接呼ぶ
  ▼
（更新後）Action 側が再検証 → 表示が新しいサーバーの正本へ移る
```

---

## ✅ 返却前チェックリスト

- [ ] データは props で親 → 子へ流れるか（子が親の state を直接書いていないか）？
- [ ] 子 → 親の通知は親から渡された callback（または Server Action）だけか？
- [ ] Server Component に event handler を置いていないか？
- [ ] Server → Client の props はシリアル化可能なデータか？渡す関数は Server Action だけか？
- [ ] 初回表示のために Client の `useEffect` + fetch へ逃げていないか？
- [ ] 編集用下書き以外の理由でサーバーの正本を不必要に `useState` へコピーしていないか？
