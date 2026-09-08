---
description: "🧭 Expo / frontend — routing (expo-router)"
applyTo: "**/*.tsx,**/*.ts,**/app.json,**/app.config.*,**/eas.json"
---

# 🧭 Expo / frontend — routing (expo-router)

> **Scope: React Native apps on Expo (expo-router).** If it is not Expo, treat this document as inapplicable and discard it.
>
> The common notation rules are [common/coding.md](common-coding.instructions.md); the surface rules are [coding.md](frontend-coding.instructions.md).
> This document defines only **where screens live and how navigation works**. How state is held is [dataflow.md](frontend-dataflow.instructions.md).
>
> **Write comments and user-facing text in Japanese.**

---

## 0. Defining the goal (what expo-router can and cannot do)

In expo-router, **the file layout is the routing spec itself**.
There is no router configuration object, no navigation table, no registration step.

In exchange, **in-app navigation and direct entry from a URL or a deep link take the same route.**
That is, **every screen can be opened out of nowhere, without passing through the previous screen.**
A screen premised on "a value the previous screen passed" will always break on that route.

**This document's job is to enforce the file-layout conventions and to keep the "opened out of nowhere" premise intact.**

---

## 1. A file placed under `app/` becomes a route, whatever you intended

Never put components, hooks, constants, or type definitions in `app/`. **The moment you do, a reachable screen appears.**
Anything that is not a screen goes outside `app/` (`components/`, `hooks/`, and so on; the location follows the project's `CLAUDE.md`).

**A route file requires `export default`.**
This is **the one exception** to "do not use default exports" in [common/coding.md](common-coding.instructions.md).
With a named export the framework cannot resolve the route and **the screen goes blank** (the build still passes).

---

## 2. The file name is the spec

| Name | Meaning |
| --- | --- |
| `_layout.tsx` | the shared layout and navigator for that directory and below |
| `(group)` | grouping that does not appear in the URL (bundling tabs, auth states, and so on) |
| `[id]` | a dynamic segment |
| `[...rest]` | catch-all |
| `+not-found.tsx` | the catcher for undefined paths |
| `index.tsx` | that directory's own path |

**Never cut into these conventions with procedural code.** Building a "pseudo-route" that branches inside one file
to show several screens makes those states unreachable from the URL, and the file structure stops being the spec.
Two screens means two files.

---

## 3. params are strings, not your types

What `useLocalSearchParams()` returns is **`string | string[] | undefined`**.
Numbers, booleans, dates, and JSON must **always be parsed, with the failure handled.**

```tsx
//  NG: 型を騙しているだけ。不正な値でそのまま下流へ流れる
const { id } = useLocalSearchParams<{ id: number }>();

//  OK: パースして、不正なら到達可能な状態として扱う
const { id: rawId } = useLocalSearchParams<{ id: string }>();
const id = Number(rawId);
if (Number.isNaN(id)) return <NotFound />;
```

Being opened with an invalid `id` is **not an exceptional case but a reachable state** (URLs are editable).
[common/coding.md](common-coding.instructions.md)'s "never weaken types to get to green" binds here.

**The default is `useLocalSearchParams`.** `useGlobalSearchParams` returns the params of the currently focused route, so
**it re-renders wherever in the app you navigate**. Use it only when you can explain why.

---

## 4. Never stuff an object into params

params are serialized onto the URL. **A screen premised on "JSON passed from the previous screen"
will always break on a deep link and on the restore route.**

**Pass only the id and pull the substance from the cache layer** ([dataflow.md](frontend-dataflow.instructions.md)).
"I already have it in hand, so passing it is faster" does not hold once a cache layer exists.

---

## 5. Navigation

**The default is `<Link>`'s declarative form.**

```tsx
//  NG: エスケープ漏れが起き、typed routes の恩恵も消える
<Link href={`/user/${id}?tab=${tab}`} />

//  OK
<Link href={{ pathname: '/user/[id]', params: { id, tab } }} />
```

Imperative `router.push` / `router.replace` is called **only from an event handler or the logic side**
(never during render).

**Guard `router.back()` with `router.canGoBack()`.**
When the screen was entered directly via a deep link there is nothing on the stack to go back to, and
it breaks as "the close button does nothing". State explicitly where to go when you cannot go back (home, and so on).

---

## 6. One place for providers: the root `_layout.tsx`

Providers shared across the whole app (the query client, safe area, theme, auth state) go
**only in the topmost `_layout.tsx`.**

Creating a provider per screen **fractures the cache and the insets per screen**, breaking in the hard-to-trace forms
**"the value differs when you go back" and "the padding shifts per screen"**.

---

## ✅ Checklist before returning

- [ ] Have you put non-screen files inside `app/`?
- [ ] Does the route file use `export default`?
- [ ] Are you branching inside one file to show several screens?
- [ ] Did you parse the params and decide the display for invalid values?
- [ ] Are you passing only the id rather than stuffing an object into params?
- [ ] Are you building `href` by string concatenation?
- [ ] Did you guard `router.back()` with `canGoBack()`?
- [ ] Are you creating providers per screen?
