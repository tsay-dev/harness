---
description: "🧭 Next.js / frontend — routing (App Router)"
applyTo: "**/next.config.*,**/app/**/page.tsx,**/app/**/layout.tsx,**/app/**/loading.tsx,**/app/**/error.tsx,**/app/**/not-found.tsx,**/app/**/template.tsx,**/app/**/default.tsx,**/components/**,**/features/**"
---

# 🧭 Next.js / frontend — routing (App Router)

> **Scope: Next.js (App Router).** If it is not Next.js, treat this document as inapplicable and discard it.
>
> The common notation rules are [common/coding.md](common-coding.instructions.md); the surface rules are [coding.md](frontend-coding.instructions.md).
> This document defines only **where screens live and the premise of entering from a URL**. How state is held is [dataflow.md](frontend-dataflow.instructions.md);
> granularity is [components.md](frontend-components.instructions.md).
>
> **Write comments and user-facing text in Japanese.**

---

## 0. Defining the goal (the file layout is the spec)

In the App Router, **the file layout under `app/` is the routing spec itself.**
There is no separate giant route table holding a "list of screens".

In exchange, **an in-app link and someone entering by opening a URL directly take the same route.**
That is, **every page can be opened out of nowhere, without passing through the previous screen.**
A page premised on "a value the previous screen passed" or "the previous screen's state" will always break on that route.

**This document's job is to enforce the file-layout conventions and to keep the "opened out of nowhere" premise intact.**

---

## 1. Put only routes and frames in `app/`

**Put nothing in `app/` but reachable UI entrances and the special files the framework requires.**
Making `app/` the home of generic components, hooks, the domain, use cases, or styles
grows unintended URLs and mixes wiring with implementation.

A screen's components go outside `app/` (the location is in the project's `CLAUDE.md`).

Even when Server Actions live under `app/`, **keep them thin, as mutation controllers**
([backend/coding.md](backend-coding.instructions.md)). Sinking the business substance into an Action file is forbidden.

**`page.tsx` / `layout.tsx` / `route.ts` and the like use the default export the framework requires.**
The extent of that exception is in [common/coding.md](common-coding.instructions.md). A named export can leave a route empty.

---

## 2. The file name is the spec

| Name | Meaning |
| --- | --- |
| `page.tsx` | the UI entrance for that segment |
| `layout.tsx` | the shared frame wrapping the segments below (it nests) |
| `route.ts(x)` | a Route Handler (an HTTP endpoint) |
| `loading.tsx` | the loading UI for that frame (segment waiting; the split with a view-state `loading` prop is [components.md](frontend-components.instructions.md) §3) |
| `error.tsx` | the error UI for that frame (a Client Component) |
| `not-found.tsx` | the catcher for what does not exist |
| `template.tsx` | a frame whose state resets on every navigation |
| `default.tsx` | the fallback for Parallel Routes |
| `(group)` | grouping that does not appear in the URL |
| `[id]` | a dynamic segment |
| `[...slug]` / `[[...slug]]` | catch-all / optional catch-all |

**Never cut into these conventions with procedural code.** Building a pseudo-route that branches inside one `page.tsx`
to show several "screens" makes those states unreachable from the URL, and the file structure stops being the spec.
Two screens means two segments (two files).

---

## 3. `params` / `searchParams` are strings, not your types

Both dynamic segments and query values arrive as **strings (or arrays of them)**.
To use them as a number, a boolean, or a date, **parse them at the read wiring's edge and handle the failure.**
([backend/coding.md](backend-coding.instructions.md) §5, [frontend/coding.md](frontend-coding.instructions.md) §2, [common/coding.md](common-coding.instructions.md) §1)

```tsx
//  NG: 型パラメータで数値だと信じ込ませ、未検証のままユースケースへ
//  OK: スキーマ検証に失敗したら notFound() 等。成功時だけユースケースへ
```

Being opened with an invalid `id` is **not an exceptional case but a reachable state** (URLs are editable).
State the display explicitly through `notFound()` / error UI / the view props' error and empty
(a Client-facing ActionResult is not mandated for reads — [backend/coding.md](backend-coding.instructions.md) §6).

---

## 4. Never stuff objects or "the previous screen's luggage" into the URL

Never make it the default to load JSON or large state into searchParams or the path to "pass it to the next screen".
**What you pass is limited to an id, or a short query meaningful as a filter.**
The substance is pulled from the server's truth via a use case ([dataflow.md](frontend-dataflow.instructions.md), [backend/coding.md](backend-coding.instructions.md)).

"I already have it in hand, so passing it all through props or the URL is faster"
collapses the moment the URL is opened directly.

---

## 5. Navigation

**Declarative navigation defaults to `next/link`'s `<Link>`.**
Imperative `useRouter().push` / `replace` is called **only from a Client event handler or the logic side**
(never during render).

```tsx
//  OK
<Link href={`/users/${id}`}>詳細</Link>

//  動的に組むときも、不正な文字列や未検証の値をそのまま連結しない
```

For a `Link` or a `redirect` to an external URL, **restrict the permitted destinations on the project side**
so it does not become an open redirect (the concrete means is the project's choice).

---

## 6. Gather shared providers into the root `layout.tsx`

Client providers shared across the whole app (theme, toasts, a client-side cache, and so on) go
**in `app/layout.tsx` near the root (or the single place the project decided).**

Never multiply providers per page and fracture the cache or the configuration.
What becomes a provider is itself the project's choice; this document forbids only **scattering the location.**

---

## ✅ Checklist before returning

- [ ] Have you put anything in `app/` besides routes, frames, and thin controllers?
- [ ] Do the files the framework requires use a default export?
- [ ] Have you turned one page into a pseudo-route branching across several screens?
- [ ] Did you parse and validate `params` / `searchParams` and decide the display on invalid input?
- [ ] Are you stuffing objects or large state into the URL to pass to the next screen?
- [ ] Are you calling imperative navigation during render?
- [ ] Are you multiplying shared providers per page?
