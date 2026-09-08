---
description: "🔀 Expo / frontend — state and data flow"
applyTo: "**/*.tsx,**/*.ts,**/app.json,**/app.config.*,**/eas.json"
---

# 🔀 Expo / frontend — state and data flow

> **Scope: React Native apps on Expo (expo-router).** If it is not Expo, treat this document as inapplicable and discard it.
>
> The common notation rules are [common/coding.md](common-coding.instructions.md); the surface rules are [coding.md](frontend-coding.instructions.md);
> where screens live and how navigation works is [routing.md](frontend-routing.instructions.md).
> This document defines only **where state is held and how it flows**. Component granularity is [components.md](frontend-components.instructions.md).
>
> **Write comments and user-facing text in Japanese.**

---

## 0. Defining the goal (what React does and does not support)

React guarantees only 2 things:

1. When state changes, it re-renders
2. props are one-way, parent to child

**Caching, deduplication, refetching, cancellation, invalidation, persistence, and the screen lifecycle are outside React's remit.**

Because that space is empty, an implementation naturally goes to fill it by hand with `useEffect` + `useState`.
And what it fills in **works correctly** on a dev machine's fast connection with a single screen's interactions.
It breaks on a real device, on a slow connection, on rapid taps, and when moving between screens — exactly where verification does not reach.

**This document's job is to forbid that hand-rolled implementation and to name the place things go instead.**

---

## 1. Server state and client state are different things

| Kind | Definition | Where it lives |
| --- | --- | --- |
| **Server state** | values whose truth the server holds and of which we **only see a copy** (lists, details, user info) | **a query layer with a cache** (TanStack Query by default) |
| **Client state** | values born only inside this app that the server does not know about (a modal's open/closed, in-progress input, a selection, the current tab) | a component's `useState`; a lightweight store if sharing is needed |

**A value you cannot decide between is exactly where the design is ambiguous.**
Decide first who holds that value's truth.

> **The default library is TanStack Query.**
> A project choosing otherwise **declares it in that project's `CLAUDE.md`** (the harness does not pin it).
> But "place no cache layer" is not an available choice, since it is incompatible with §2.

---

## 2. Never fetch and `setState` inside a `useEffect`

This is not a matter of taste. **The following defects all enter, simultaneously and inevitably.**

- **Duplicate requests** when several places ask for the same data
- **A race** where an older response sent first arrives later and overwrites (reproduced by rapid taps and fast switching)
- **No cancellation** when leaving the screen
- Updates after unmount
- **No refetch when you come back** (more serious in RN, where the screen survives — see §4)

```tsx
//  NG: 上の全部が入る
useEffect(() => {
  fetch(url).then(r => r.json()).then(setData);
}, [url]);

//  OK: 取得は宣言的に書き、失効と再取得はクエリ層に任せる
const { data, isPending, error } = useQuery({ queryKey: ['user', id], queryFn: () => fetchUser(id) });
```

The only permitted use of `useEffect` is **synchronizing with an external system** (starting and stopping a subscription, receiving a native event).

---

## 3. Never copy a server value into local state

The moment you assign a query's result into `useState`, **it is cut off from cache updates.**
A refetch leaves the screen on the old value, breaking as "I updated it but it doesn't show".

Derive derived values **at render time** (a plain computation, or the query layer's `select`).

```tsx
//  NG: 同期が要るオリジナルの複製を作っている
const [rows, setRows] = useState([]);
useEffect(() => { if (data) setRows(data.items); }, [data]);

//  OK: 導出する
const rows = data?.items ?? [];
```

The exception is **a form being edited**. That is a different thing (client state) that starts from the server value as its initial value,
so copying it is correct. But **decide explicitly when the initial value gets re-taken** (never overwrite silently).

---

## 4. On native, screens are not unmounted

This is the decisive difference from Web routing. **A previous screen pushed onto the stack stays alive.**

- "Fetch on mount" **does not run when you come back**. Trigger a refetch on focus regain or on `AppState` resuming
- Timers, subscriptions, and location watchers **stay attached**. Always release them (they keep running in the background and drain the battery)
- Stop heavy processing on an off-screen view once it loses focus

This is where the "you don't notice it in development because the screen gets rebuilt" class of defects gathers.

---

## 5. Never use `Context` as state management

Context is a tool for **dependency injection**, not for state management.

- Without memoizing the value, **every consumer re-renders**
- Even memoized, putting a frequently changing value in it amounts to the same thing, since the subscription unit cannot be chosen

**Changing shared state goes in a store where the subscription unit can be chosen.**
What may go in Context is only **what barely changes after startup** (the theme, a client instance, the authenticated user's identifier).

When a props bucket brigade exceeds 3 levels, **doubt the way it is split** before adding a Context ([components.md](frontend-components.instructions.md)).

---

## 6. Re-renders and animation

**Never drive an animation frame by frame from JS-side state.**
Use a means that runs on the UI thread (Reanimated, or `useNativeDriver`).

An implementation that re-renders the layout every frame **runs smoothly on a dev machine and only stutters or dies on a low-spec real device.**
It is the class of defect you notice latest, so avoid it at the moment you write it.

---

## 7. Persistence

- **Never put tokens, credentials, or personal information in `AsyncStorage`.** It is stored in plaintext. Use `expo-secure-store`
- **A persisted value is also "a cache of server state", not the app's truth.**
  Restoring it at startup is fine, but never treat it as the latest (it needs reconciling with the server)

> When the persistence rules grow beyond what fits here, carve a leaf as `persistence.md`.
> **Never name it `db.md`** (that name is delivered only to the DB designer and never reaches the implementers).

---

## ✅ Checklist before returning

- [ ] For each value handled, did you decide whether it is server state or client state?
- [ ] Are you fetching and `setState`-ing inside a `useEffect`?
- [ ] Are you copying a query result into `useState`? (if so, is it an in-progress edit form?)
- [ ] On the premise that screens survive, did you decide the trigger for refetching?
- [ ] Did you release the subscriptions and timers you attached?
- [ ] Are you putting a frequently changing value into Context?
- [ ] Are you driving an animation from JS state?
- [ ] Are you putting sensitive values into `AsyncStorage`?
