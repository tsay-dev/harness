---
description: "🔀 Expo / frontend — 状態とデータフロー"
applyTo: "**/*.tsx,**/*.ts,**/app.json,**/app.config.*,**/eas.json"
---

# 🔀 Expo / frontend — 状態とデータフロー

> **対象: Expo（expo-router）の React Native アプリ。** Expo でなければ適用外として扱い、破棄する。
>
> 共通の記法規約は [common/coding.md](common-coding.instructions.md)、表層の規約は [coding.md](frontend-coding.instructions.md)、
> 画面の場所と遷移は [routing.md](frontend-routing.instructions.md) にある。
> この文書は **状態の保持場所と流れ方**だけを定義する。コンポーネントの粒度は [components.md](frontend-components.instructions.md) にある。
>
> **コメントとユーザー向けの文言は日本語で書く。**

---

## 0. 目的の定義（React が支えること、支えないこと）

React が保証するのは 2 点だけである。

1. state が変わると再 render する
2. props は親から子への一方向

**cache、重複排除、再取得、cancel、無効化、永続化、画面 lifecycle は React の責務外である。**

その空白があるため、実装は自然に `useEffect` + `useState` で手動補完しようとする。
補完したものは、開発マシンの高速な接続で 1 画面だけ操作するなら **正しく動く**。
壊れるのは実機、低速接続、連打、画面間移動であり、ちょうど検証が届かない場所である。

**この文書の役割は、その手作り実装を禁止し、代わりの置き場所を名指すことである。**

---

## 1. server state と client state は別物

| 種別 | 定義 | 置き場所 |
| --- | --- | --- |
| **server state** | サーバーが正本を持ち、私たちは **コピーを見るだけ**の値（一覧、詳細、ユーザー情報）| **cache を持つ query 層**（既定は TanStack Query）|
| **client state** | このアプリ内でだけ生まれ、サーバーが知らない値（modal の開閉、入力途中、選択、現在の tab）| コンポーネントの `useState`。共有が必要なら軽量 store |

**どちらか判断できない値こそ、設計が曖昧な場所である。**
先にその値の正本を誰が持つか決める。

> **既定ライブラリは TanStack Query。**
> 他のものを選ぶプロジェクトは **そのプロジェクトの `CLAUDE.md` に宣言する**（harness は固定しない）。
> ただし §2 と両立しないため、「cache 層を置かない」は選択肢にしない。

---

## 2. `useEffect` 内で fetch して `setState` しない

好みの問題ではない。**次の欠陥が同時に、必然的に入る。**

- 複数箇所が同じデータを求めたときの **重複 request**
- 先に送った古い応答が遅れて届き上書きする **競合**（連打・高速切替で再現する）
- 画面を離れたときの **cancel がない**
- unmount 後の更新
- **戻ったときの再取得がない**（画面が生き残る RN ではより深刻。§4 参照）

```tsx
//  NG: 上の全部が入る
useEffect(() => {
  fetch(url).then(r => r.json()).then(setData);
}, [url]);

//  OK: 取得は宣言的に書き、失効と再取得はクエリ層に任せる
const { data, isPending, error } = useQuery({ queryKey: ['user', id], queryFn: () => fetchUser(id) });
```

`useEffect` に許す用途は **外部システムとの同期**だけである（購読の開始・停止、native event の受信）。

---

## 3. サーバー値を局所 state にコピーしない

query 結果を `useState` に代入した瞬間、**cache 更新から切り離される**。
再取得しても画面が古い値のままとなり、「更新したのに表示されない」として壊れる。

導出値は **render 時に**導出する（通常の計算、または query 層の `select`）。

```tsx
//  NG: 同期が要るオリジナルの複製を作っている
const [rows, setRows] = useState([]);
useEffect(() => { if (data) setRows(data.items); }, [data]);

//  OK: 導出する
const rows = data?.items ?? [];
```

例外は **編集中の form**。サーバー値を初期値として始まる別物（client state）なので、
コピーが正しい。ただし **初期値をいつ取り直すかを明示して決める**（黙って上書きしない）。

---

## 4. native では画面は unmount されない

Web routing との決定的な違いである。**stack に push された前の画面は生き残る。**

- 「mount 時に取得」は **戻ったときに動かない**。focus 復帰または `AppState` 再開で再取得を起動する
- timer、購読、位置 watcher は **付いたまま**になる。必ず解放する（background で動き続け、電池を消耗する）
- 画面外の view が focus を失ったら重い処理を止める

「開発中は画面が作り直されるため気付かない」種類の欠陥がここへ集まる。

---

## 5. `Context` を状態管理として使わない

Context は **依存注入**のための道具であり、状態管理ではない。

- value を memo 化しないと **全 consumer が再 render する**
- memo 化しても、頻繁に変わる値を入れると購読単位を選べないため同じことになる

**変化する共有 state は、購読単位を選べる store に置く。**
Context に入れてよいのは **起動後ほぼ変わらないもの**だけである（theme、client instance、認証済みユーザーの識別子）。

props のバケツリレーが 3 階層を超えたら、Context を追加する前に **分け方を疑う**（[components.md](frontend-components.instructions.md)）。

---

## 6. 再 render と animation

**JS 側 state で animation を frame ごとに駆動しない。**
UI thread で動く手段（Reanimated または `useNativeDriver`）を使う。

毎 frame layout を再 render する実装は **開発マシンでは滑らかに動き、低スペック実機でだけ引っ掛かったり落ちたりする**。
最も遅く気付く種類の欠陥なので、書く時点で避ける。

---

## 7. 永続化

- **token、認証情報、個人情報を `AsyncStorage` に置かない。** 平文で保存される。`expo-secure-store` を使う
- **永続化した値も「server state の cache」であり、アプリの正本ではない。**
  起動時に復元してよいが、最新として扱わない（サーバーとの照合が必要）

> 永続化規約がここへ収まらなくなったら、末端文書を `persistence.md` として切り出す。
> **`db.md` と命名しない**（その名前は DB 設計者にしか配送されず、実装者へ届かない）。

---

## ✅ 返却前チェックリスト

- [ ] 扱う値ごとに server state か client state か決めたか？
- [ ] `useEffect` 内で fetch・`setState` していないか？
- [ ] query 結果を `useState` にコピーしていないか（している場合、編集中の form か）？
- [ ] 画面が生き残る前提で再取得の trigger を決めたか？
- [ ] 付けた購読や timer を解放したか？
- [ ] 頻繁に変わる値を Context に入れていないか？
- [ ] JS state で animation を駆動していないか？
- [ ] 機密性のある値を `AsyncStorage` に置いていないか？
