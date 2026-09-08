---
description: "📐 Next.js — common coding rules (all layers)"
applyTo: "**/next.config.*,**/middleware.ts,**/middleware.js,**/app/**/page.tsx,**/app/**/layout.tsx,**/app/**/route.ts,**/app/**/route.tsx,**/app/**/loading.tsx,**/app/**/error.tsx,**/app/**/not-found.tsx,**/app/**/template.tsx,**/app/**/default.tsx,**/app/**/actions.ts,**/app/**/actions.tsx,**/actions/**/*.ts,**/actions/**/*.tsx,**/components/**,**/features/**,**/domain/**,**/infrastructure/**,**/use-cases/**,**/usecases/**"
---

# 📐 Next.js — common coding rules (all layers)

> **Scope: TypeScript projects on Next.js (App Router).**
> It presumes the host `CLAUDE.md` declares the platform/framework as `web/next`.
> This document's `applyTo` are a weak gate based on Next-like signals (`next.config.*`, `app/**/page.tsx`, and so on).
> **If the target is not Next.js (App Router), treat this document as inapplicable** and discard it.
>
> What this document holds is only **what is true across layers**. Server-side separation of responsibilities is
> [backend/coding.md](backend-coding.instructions.md); the RSC / Client surface is
> [frontend/coding.md](frontend-coding.instructions.md); test wiring is [testing.md](common-testing.instructions.md).
> Those are **deltas on this document**. **Never copy the common rules into a layer leaf** (the SSOT is here, in one place).
>
> **Write comments and user-facing text in Japanese.**

---

## 0. Formatting is decided by tools, not by this document

Indentation, line breaks, quotes, semicolons, and import order are **authoritative in the project's lint / format command**,
and this document defines none of them. Never align columns by hand. **Run the format command before returning.**

When a rule conflicts, the tool's output wins (that is all a human looks at too).

---

## 1. Never weaken types to get to green

**Never write `any` / `as any` / a non-null assertion (`!`) / `@ts-expect-error` / `eslint-disable` "to make a type error go away".**
Treat an unknown value as `unknown` and narrow it before use.

In particular, **never paste a business type onto values arriving from outside** — Server Actions, Route Handlers,
`searchParams` / `params` — with `as`. Trusting the type of a value that has not been through runtime validation at the edge
([backend/coding.md](backend-coding.instructions.md)) is a defect that lands somewhere else at runtime.

```ts
//  NG: 外から来た値を型で押し潰している
const input = raw as CreateUserInput;

//  NG: 「たぶん来る」を型に約束させている
const id = params.id!;
```

**When you want to suppress something, stop implementing and report "what conflicts with what"** (per each implementer's output contract).
Never rewrite the contract yourself to make things line up.

The only exception is **when an external library's type definitions differ from its actual behavior**, and then leave the reason in a comment.

---

## 2. The shape of a module

### Do not use default exports

The importing side is free to name it anything, so the same thing ends up with a different name at every call site.
**Standardize on named exports.**

```ts
//  NG
export default function UserCard() {}

//  OK
export function UserCard() {}
```

> **The one exception: the default exports the App Router requires by file convention.**
> At minimum `page.tsx` / `layout.tsx` / `route.ts(x)` / `loading.tsx` / `error.tsx` /
> `not-found.tsx` / `template.tsx` / `default.tsx` are resolved by the framework through a default export.
> A named export there **leaves the route or the special UI empty** (the build may still pass).

### Do not create barrels

Never place an `index.ts` that only re-exports. It is a breeding ground for circular imports and adds wiring the bundler does not need.

Under `app/`, the placement and the file name themselves are the routing spec.
Watch that a file you meant as a barrel does not get resolved as an unintended route or special file.

### Do not stack relative paths

Never write `../../../`; use tsconfig's path alias (`@/` in most Next projects).
This prevents every link breaking the moment a file moves.

---

## 3. Environment variables and secrets

**An environment variable prefixed `NEXT_PUBLIC_` is embedded into the client bundle — that is, published.**

- A public API base URL, a public key, a feature flag → fine to put there
- An API secret, a signing key, a DB URL, an admin token → **never prefix them `NEXT_PUBLIC_`. Put them in server-only environment variables**

If processing that requires a secret becomes necessary on the Client Component side, that processing cannot live on the client.
**Stop implementing and report** (never decide the server-side design yourself).

---

## 4. Never sink business into `middleware`

`middleware.ts` is limited to a thin request edge (redirects, headers, checking for the presence of an auth cookie, and so on).
**Never put domain decisions, DB access, or use-case invocation there.**

Where the substance goes (owned by [backend/coding.md](backend-coding.instructions.md) §1.1):

- **Mutations** (Actions / Route Handlers) → backend-logic
- **Read wiring** (`page` / `layout`) → frontend-logic
- **`middleware.ts` itself** (the thin edge only) → backend-logic (declare it in `CLAUDE.md` if you split it out)
- None of them completes business without going through a use case. The definitions are in [backend/coding.md](backend-coding.instructions.md) §1

---

## ✅ Checklist before returning

- [ ] Did you run the lint / format command?
- [ ] Did you add `any` / `as any` / `!` / `@ts-expect-error` / `eslint-disable` to get to green?
- [ ] Are you using `export default` anywhere other than the files the App Router requires?
- [ ] Did you place an `index.ts` that only re-exports?
- [ ] Did you put a value that could be a secret into `NEXT_PUBLIC_`?
- [ ] Did you write business logic or DB access into `middleware`?
