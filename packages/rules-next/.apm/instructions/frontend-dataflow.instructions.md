---
description: "🔀 Next.js / frontend — state and data flow"
applyTo: "**/next.config.*,**/app/**/page.tsx,**/app/**/layout.tsx,**/app/**/loading.tsx,**/app/**/error.tsx,**/app/**/not-found.tsx,**/app/**/template.tsx,**/app/**/default.tsx,**/components/**,**/features/**"
---

# 🔀 Next.js / frontend — state and data flow

> **Scope: the UI surface on Next.js (App Router).** If it is not Next.js, treat this document as inapplicable and discard it.
>
> The common rules are [common/coding.md](common-coding.instructions.md); the RSC / Client boundary is [coding.md](frontend-coding.instructions.md);
> granularity is [components.md](frontend-components.instructions.md); locations are [routing.md](frontend-routing.instructions.md);
> server-side separation of responsibilities is [backend/coding.md](backend-coding.instructions.md).
> This document defines only **where data is held and which way it flows**.
>
> **Write comments and user-facing text in Japanese.**

---

## 0. Defining the goal (what a single flow direction saves you)

Roughly, React guarantees only these 2 things:

1. When state changes, it re-renders
2. **props are one-way, parent to child**

Add "a child rewrites the parent's state directly" and "fetch from anywhere" to that, and
the truth of one screen splits across several places, and neither an AI nor a human can read the blast radius of a change.

In the App Router there is more: **what can be passed between a Server Component and a Client Component is limited.**
Pass a function or a class as a prop with a plain-React-on-the-web mindset and you get a runtime error.

**This document's job is to fix the direction and the home of data, and close the loopholes.**

---

## 1. Data flows parent → child; events flow child → parent (one-way)

| Direction | What it carries | The means |
| --- | --- | --- |
| **parent → child** | the data and settings used for display | **props** |
| **child → parent** | the notification "something happened" | only **a callback** the parent passed (`onX`) |

```tsx
//  OK: データは下り、イベントはコールバックで上る
function Parent() {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onClose={() => setOpen(false)} />;
}

//  NG: 子が親の state やモジュール変数を直接触る
//  NG: グローバル可変オブジェクトを配って各方書き込む
```

- A child never rewrites the parent's state via an import or a reference
- When you want to share across the tree, **first doubt the component split**. If it is still needed, use only the sharing mechanism approved in the project's `CLAUDE.md` (this document pins no particular library)

```text
[parent]  props(data)  →  [child]
[parent]  ← onEvent()      [child]
```

---

## 2. Event handlers stay closed at the Client leaves

A Server Component cannot hold an event handler such as `onClick` (a framework constraint).

- Make only the nodes that need interaction `"use client"` ([coding.md](frontend-coding.instructions.md))
- Put **the point where an event occurs at a Client leaf**
- When notifying a Client parent above the leaf, raise it **through a props callback**, per §1

A Server Component parent passes its Client child **data (props)** and, where needed, **Server Actions** (§3).
Never bind an ordinary inline function passed from Server to Client onto `onClick`.

---

## 3. What may be passed from Server to Client

Props passed to a Client Component are limited to **serializable values**.

| May be passed | Must not be passed |
| --- | --- |
| Serializable data: strings, numbers, booleans, arrays, plain objects, `Date`, and so on | ordinary functions, class instances, non-serializable values such as Map/Set |
| **Server Actions** (passed as the entrance for a mutation) | the use case / infrastructure / server-presuming domain functions themselves |

The procedure for read wiring (validating params, the use case, `notFound` / mapping props) has its
**SSOT in [coding.md](frontend-coding.instructions.md) §2** (never restate a whole page here).

What this document defines is only the shape of the handoff.

```tsx
//  OK: Client へ渡すのはシリアル化可能なデータと Server Action 参照だけ
<UserEditForm user={user} updateUser={updateUserAction} />

//  NG: Server で定義した通常関数を Client に渡す
//  <Button onClick={() => doSomething()} />
```

**The substance of a mutation lives in a Server Action (a mutation controller) and is written by backend-logic.**
Details in [backend/coding.md](backend-coding.instructions.md). The frontend only calls it and passes props ([coding.md](frontend-coding.instructions.md) §4).
Importing and calling a use case or a DB client from the Client is forbidden.

---

## 4. Where state lives (a lightweight rule)

Before holding a value, decide **where that value's truth lives**.

| Kind | Definition | Where it lives |
| --- | --- | --- |
| **Server truth** | data whose authority is the DB or an external system (lists, details, user info) | **Reads**: RSC wiring → the use case.<br/>**Updates**: Server Actions → the use case ([backend/coding.md](backend-coding.instructions.md)) |
| **Client-only state** | temporary UI state the server does not know about (a modal's open/closed, in-progress input, the current tab) | `useState` and the like at the smallest necessary Client leaf. Only when sharing is needed, the mechanism the project approved |

Prohibitions and avoidances:

- Never fetch in a Client `useEffect` and `setState` **for the initial render**. If it can be read, read it in RSC (via the use case) and pass it through props
- Never copy a list or a detail received from the server straight into `useState` for any reason other than an edit form (the moment you copy it, it diverges from a refetch or the post-Action display)
- Only when a "draft while typing" is needed, as in an edit form, may you receive it as an initial value and put it in local state. **State explicitly when it gets re-initialized from the server value**

> Whether to place a client-side cache layer (TanStack Query, for example) is declared in the project's `CLAUDE.md`.
> The harness pins no library. But "fetching the initial data by hand on the Client" is never the default.

---

## 5. The flow within a screen (the picture)

```text
RSC (page wiring)
  │  reads via the use case
  ▼
  props (data) / Server Action (the update entrance)
  │
  ▼
the Server / Client display component tree
  │  data flows down through props
  ▼
Client leaves (input, clicks)
  │  up to the Client parent via onX, or calling a Server Action directly
  ▼
(after the mutation) the Action side revalidates → the display moves to the new server truth
```

---

## ✅ Checklist before returning

- [ ] Does data flow parent → child through props? (is a child writing the parent's state directly?)
- [ ] Is child → parent notification limited to a callback the parent passed (or a Server Action)?
- [ ] Is an event handler placed on a Server Component?
- [ ] Are the Server → Client props serializable data? Is the only function you pass a Server Action?
- [ ] Have you escaped into a Client `useEffect` + fetch for the initial render?
- [ ] Are you needlessly copying server truth into `useState` for anything but an edit draft?
