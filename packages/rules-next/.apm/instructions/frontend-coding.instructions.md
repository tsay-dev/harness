---
description: "🎨 Next.js / frontend — surface-layer coding rules"
applyTo: "**/next.config.*,**/app/**/page.tsx,**/app/**/layout.tsx,**/app/**/loading.tsx,**/app/**/error.tsx,**/app/**/not-found.tsx,**/app/**/template.tsx,**/app/**/default.tsx,**/components/**,**/features/**"
---

# 🎨 Next.js / frontend — surface-layer coding rules

> **Scope: the UI surface on Next.js (App Router).** If it is not Next.js, treat this document as inapplicable and discard it.
>
> **The common rules are [common/coding.md](common-coding.instructions.md)**. Server-side separation of responsibilities is
> [backend/coding.md](backend-coding.instructions.md) (the substance of Actions; the onion. It is part of the FE implementers' bundle — develop skill §6-B).
> The direction of data and where state lives is [dataflow.md](frontend-dataflow.instructions.md).
> Component granularity is [components.md](frontend-components.instructions.md); where screens live is [routing.md](frontend-routing.instructions.md).
> **FE tests are not filed for now** (no frontend testing leaf is placed; the common wiring is [common/testing.md](common-testing.instructions.md)).
> This document defines, **on top of following those**, only the RSC / Client boundary and the thinness of a page. It never restates the common side.
>
> **The harness does not pin directory names (`components/` and the like).** Locations are recorded in the project's `CLAUDE.md`.
>
> **Write comments and user-facing text in Japanese.**

---

## 0. Defining the goal (why RSC is the default)

In the App Router, a file with nothing written in it is treated as a **Server Component**.
A Client Component (`"use client"`) is the exception, for carving a boundary where interactivity is needed.

Put `"use client"` at the root of a page or a large branch and the whole tree beneath it goes into the client bundle,
dragging along fetches, secrets, and heavy dependencies that could have stayed on the server.

**This document's job is to close the loopholes that drop things to the Client before it is necessary.**

---

## 1. Make Server Components the default and keep Client at the leaves

- **In principle everything is a Server Component**
- Write `"use client"` at the top of a file only at **the smallest leaves** that need
  `useState` / `useEffect` / browser-only APIs / event handlers (`onClick`, and so on)
- Place the Client boundary **as close to the leaf as possible** (never make a whole page Client)

---

## 2. page / layout stay closed on read wiring

Never write complex UI structure or the substance of styling into `page.tsx` / `layout.tsx`.
They hold **composition and read wiring only**, passing the substance of display down to presentational components.

Read wiring is one form of the onion's **outer entrance** ([backend/coding.md](backend-coding.instructions.md) §1, §3).

- Never write infrastructure or the domain inline into a page
- Validate `params` / `searchParams` at the edge before handing them to a use case
- On invalid input use `notFound()` and the like; map the fetch result into the view's props (empty / error / no-permission, and so on)
- **Waiting on a segment frame** is `loading.tsx`. Never hold the initial suspense a second time in a `loading` prop ([components.md](frontend-components.instructions.md) §3)

```tsx
//  OK: 読み取り配線（検証 → ユースケース → ビュー）
export default async function UserPage({ params }: Props) {
  const raw = await params;
  const parsed = UserIdSchema.safeParse(raw);
  if (!parsed.success) notFound();

  const outcome = await getUser({ id: parsed.data.id });
  if (!outcome.ok) {
    if (outcome.reason === "not_found") notFound();
    return <UserDetailView user={null} error={toUserMessage(outcome.reason)} />;
  }
  return <UserDetailView user={outcome.user} error={null} />;
}
```

```tsx
//  NG: page に取得と表示と判定が同居／params を未検証のまま流す
export default async function UserPage({ params }: Props) {
  const { id } = await params;
  const row = await prisma.user.findMany();
  //  ...大量の JSX
}
```

Granularity and who writes the JSX are in [components.md](frontend-components.instructions.md). The SSOT for the examples is this document (other leaves link only).

---

## 3. Never import a server layer from the Client

A `"use client"` module may import roughly only the following.

- Other Client Components, and UI utilities that close on the client
- **Server Actions** (the entrance for mutations. **The substance is backend-logic's**)
- Configuration values that may be published (`NEXT_PUBLIC_`, and so on)

**Never import a use case, infrastructure, or a server-presuming domain implementation from the Client.**

---

## 4. Mutations go through Server Actions

Processing that changes server-side truth within the same app **calls a Server Action (a mutation controller)**
rather than hitting infrastructure from the Client.

- **The substance** of Actions / Route Handlers (zod, the use case, `revalidatePath`) is
  **written by backend-logic**, per [backend/coding.md](backend-coding.instructions.md)
- frontend-logic stays on **calling the Action and passing props**
- HTTP for external clients is Route Handlers (backend). **Never let the Client mutate by hitting a "public API" directly on its own**
  (the browser-facing update entrance defaults to Actions)

---

## ✅ Checklist before returning

- [ ] Is `"use client"` on the leaves that need interaction, rather than at a page root?
- [ ] Do `page.tsx` / `layout.tsx` stay closed on read wiring, passing the UI substance downward?
- [ ] Are `params` / `searchParams` validated before being handed to a use case?
- [ ] Is infrastructure (Prisma, and so on) being called directly from a page for a read?
- [ ] Does a Client Component import a use case, infrastructure, or a server-presuming domain?
- [ ] Do same-app mutations go through Server Actions (with the substance on the backend)?
