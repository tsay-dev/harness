---
description: "🧱 Next.js / frontend — component granularity and the division of work"
applyTo: "**/next.config.*,**/app/**/page.tsx,**/app/**/layout.tsx,**/app/**/loading.tsx,**/app/**/error.tsx,**/app/**/not-found.tsx,**/app/**/template.tsx,**/app/**/default.tsx,**/components/**,**/features/**"
---

# 🧱 Next.js / frontend — component granularity and the division of work

> **Scope: the UI surface on Next.js (App Router).** If it is not Next.js, treat this document as inapplicable and discard it.
>
> Surface notation is [coding.md](frontend-coding.instructions.md); how state is held is [dataflow.md](frontend-dataflow.instructions.md);
> where screens live is [routing.md](frontend-routing.instructions.md); server-side responsibilities are [backend/coding.md](backend-coding.instructions.md).
> This document defines **how to split a set of components and who writes which part**.
> The SSOT for read-wiring code examples is [coding.md](frontend-coding.instructions.md) §2 (never copy it here in full).
>
> **Write comments and user-facing text in Japanese.**

---

## 1. The layer is the responsibility; the location is the scope of sharing (two separate axes)

**Never conflate the layer (what it may know) with the location (where it goes).**
The layer is determined by responsibility; the location by "how many places use it right now".

### Layer = responsibility

| Layer | Responsibility | Examples |
| --- | --- | --- |
| **ui** (atoms) | the smallest unit of appearance, decomposed no further. Knows neither business nor fetching | `Button` `TextField` `Avatar` |
| **parts** (molecules) | a reusable grouping of ui. Holds local UI state but knows no business | `SearchBar` `Modal` `EmptyState` |
| **feature** (organisms) | a grouping that knows the business. May handle the data shapes display needs and the update entrance (a Server Action passed to it) | `UserList` `OrderForm` |
| **route** (read wiring) | composition and wiring only. Appearance is delegated to the lower layers | `app/**/page.tsx` `layout.tsx` |

**A reusable component knows no business domain.** The moment `Button` starts knowing about "orders", it is a `feature`.
Name props in that layer's vocabulary too (never bring business terms into a `ui` component's props).

### Location = the scope of sharing

**Put it at the smallest place covering the range actually in use.** While only one screen uses it, do not promote it to a shared location.
**Carve it out the moment a second site appears, and raise the location along with it.**

**Search for an existing one before you start writing.** Never create a state where the same appearance is defined separately.

> **The harness does not pin directory names.** Whether to use `components/` / `features/` / `src/ui/` is
> decided by the project and **recorded in that project's `CLAUDE.md`**. **The separation itself is pinned.**

---

## 2. The boundary between the UI implementer and the logic implementer

**This separation is develop's requirement, not optional.** Appearance and logic are handled by implementers in separate contexts,
split because their oracles differ (the human eyeball for appearance, machine tests for logic).

### The split you always create structurally

**The route file = read wiring; the view component = display.**
`page.tsx` / `layout.tsx` hold only validation, the use-case invocation, and passing props;
**the substance of the JSX goes on the presentational view side** (the example is in [coding.md](frontend-coding.instructions.md) §2).

### As a result, ownership divides mechanically

| Implementer | What it writes | What it does not write |
| --- | --- | --- |
| **The UI implementer** (frontend-ui) | presentational components (**display determined by props alone**) and styling | **Never imports a use case, infrastructure, the substance of a Server Action, or `fetch`.** Data flows in as contract-conformant fixed mocks on the props |
| **The logic implementer** (frontend-logic) | read wiring (validating params, invoking the use case, mapping props), local UI state at the Client leaves, **calling an existing Server Action and passing it through props** | **Never rebuilds the JSX structure or the styling. Never writes the substance of Server Actions / Route Handlers (zod, invoking the use case, `revalidatePath`)** ([backend/coding.md](backend-coding.instructions.md) §1.1) |

### The props type is the contract between the two

**The UI implementer defines and exports the props type, and the logic implementer maps onto it.**
The logic side never changes the props type on its own.

**When either side finds it insufficient, that side stops implementing and reports** (per each implementer's output contract).

---

## 3. UI states are expressed through props

**empty / error / no-permission / boundary (long text, 0 rows, a huge number) are expressed through view props.**
The UI side **does not know where that state came from.**

The division of waiting:

- **Waiting on a segment frame** (suspense during page navigation) → `loading.tsx` ([routing.md](frontend-routing.instructions.md))
- **State within the view** (after a retry, a partial update, no permission) → a `loading` / `error` prop

Never hold both with the same meaning, twice.

The read wiring's job stays closed on "mapping the use case's scenario result into props"
(a page need not return a caller-facing ActionResult — [backend/coding.md](backend-coding.instructions.md) §6).

The direction of data itself is [dataflow.md](frontend-dataflow.instructions.md).

---

## 4. Dependencies run one way, downward

Depend only in the direction `route → feature → parts → ui`. **Never create backflow or cross-links.**

- A lower layer never imports an upper layer
- Layers at the same level never import each other (that becomes a cycle)
- Child-to-parent notification takes the form of **calling a callback the parent passed** ([dataflow.md](frontend-dataflow.instructions.md) §1)

---

## 5. Keep list keys stable

When rendering a variable-length list, **never use an array index as the `key`**.
Use **a stable, unique id**.

Do not needlessly rebuild the props and callbacks passed to a row as new references every render.
The choice of a particular list-virtualization library is left to the project.

---

## 6. Never duplicate visual tokens

- Colors, spacing, corner radii, and letter-spacing **live in tokens; never hardcode raw values** (the mechanism is the project's choice)
- Never write the same visual style definition in two components
- **A reusable `ui` layer component carries no outer margin (`margin`).** Outer spacing is **decided by the parent**

---

## ✅ Checklist before returning

- [ ] Did you search for an existing component with the same appearance before starting?
- [ ] Does a reusable component know the business domain?
- [ ] Have you promoted something used in one place only to a shared location?
- [ ] Have you written the substance of the JSX into the route file?
- [ ] (UI implementer) Are you importing a use case, infrastructure, or fetching logic?
- [ ] (Logic implementer) Are you writing the substance of an Action, or rebuilding the JSX?
- [ ] Are in-view states (empty / error / permission / boundary, and in-view loading) received through props? Is segment waiting duplicated into a `loading` prop?
- [ ] Do dependencies run one way, downward?
- [ ] Is the list `key` a stable id (not an index)?
- [ ] Does a `ui`-layer component carry an outer `margin`?
