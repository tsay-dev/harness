---
description: "📐 Expo — common coding rules (all layers)"
applyTo: "**/*.tsx,**/*.ts,**/app.json,**/app.config.*,**/eas.json"
---

# 📐 Expo — common coding rules (all layers)

> **Scope: React Native apps on Expo (expo-router).**
> This document fires on file extension, so it can be injected into non-Expo TypeScript / React projects too.
> **If the target is not Expo, treat this document as inapplicable** and discard it.
>
> What this document holds is only **what is true across layers**. The rules for the surface (the RN runtime, styling, screens) are in
> [frontend/coding.md](frontend-coding.instructions.md), and those are **a delta on this document**.
> **Never copy the common rules into a layer leaf** (the SSOT is here, in one place).
>
> **Write comments and user-facing text in Japanese.**

---

## 0. Formatting is decided by tools, not by this document

Indentation, line breaks, quotes, semicolons, and import order are **authoritative in the project's lint / format command**,
and this document defines none of them. Never align columns by hand. **Run the format command before returning.**

When a rule conflicts, the tool's output wins (that is all a human looks at too).

---

## 1. Never weaken types to get to green

**Never write `as any` / a non-null assertion (`!`) / `@ts-expect-error` / `eslint-disable` "to make a type error go away".**

Needing to write one is a signal that **either the type or the contract is wrong**.
Suppress it silently and downstream work piles up on a wrong premise, landing somewhere else at runtime.

```ts
//  NG: 契約が合っていないのを型で押し潰している
const user = res.data as any;

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

> **The one exception: expo-router's route files (`app/**`) require `export default`.**
> The framework resolves them as screens, so a named export **leaves the route empty**.
> Details in [frontend/routing.md](frontend-routing.instructions.md).

### Do not create barrels

Never place an `index.ts` that only re-exports. It is a breeding ground for circular imports and adds wiring the bundler does not need.

On top of that, **under `app/` an `index.ts` is a route in itself**, so placing one as a barrel grows an extra screen.

### Do not stack relative paths

Never write `../../../`; use tsconfig's path alias (`@/` by default in Expo).
This prevents every link breaking the moment a file moves.

---

## 3. Environment variables and secrets

**Environment variables prefixed `EXPO_PUBLIC_`, and `extra` in `app.config.ts`,
are baked into the client bundle at build time — that is, published.**

A distributed app's bundle can be extracted, so nothing put there is a secret.

- An API base URL, a feature flag, a public key → fine to put there
- An API secret, a signing key, an admin token → **never put them there**

If processing that requires a secret becomes necessary, that processing cannot live on the client.
**Stop implementing and report** (never decide the server-side design yourself).

---

## 4. The boundary on adding dependencies

**Never add a package containing native code on your own.**

Adding one means it does not work in existing dev builds, in Expo Go, or in already-distributed builds — **a native rebuild is required**.
`npm install` succeeding is no proof it works (only the JS side got resolved).

When a dependency addition becomes necessary, **report what you want to add and why, and stop.**
Using a dependency already in the project is not restricted.

---

## ✅ Checklist before returning

- [ ] Did you run the lint / format command?
- [ ] Did you add `as any` / `!` / `@ts-expect-error` / `eslint-disable` to get to green?
- [ ] Are you using `export default` outside `app/`?
- [ ] Did you put a value that could be a secret into `EXPO_PUBLIC_` / `extra`?
- [ ] Did you add a native dependency without permission?
