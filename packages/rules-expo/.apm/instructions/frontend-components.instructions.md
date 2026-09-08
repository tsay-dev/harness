---
description: "🧱 Expo / frontend — component granularity and the division of work"
applyTo: "**/*.tsx,**/*.ts,**/app.json,**/app.config.*,**/eas.json"
---

# 🧱 Expo / frontend — component granularity and the division of work

> **Scope: React Native apps on Expo (expo-router).** If it is not Expo, treat this document as inapplicable and discard it.
>
> Surface notation is [coding.md](frontend-coding.instructions.md); how state is held is [dataflow.md](frontend-dataflow.instructions.md);
> where screens live is [routing.md](frontend-routing.instructions.md).
> This document defines **how to split a set of components and who writes which part**.
>
> **Write comments and user-facing text in Japanese.**

---

## 1. The layer is the responsibility; the location is the scope of sharing (two separate axes)

**Never conflate the layer (what it may know) with the location (where it goes).**
The layer is determined by responsibility; the location by "how many places use it right now".

### Layer = responsibility

| Layer | Responsibility | Examples |
| --- | --- | --- |
| **ui** (atoms) | the smallest unit of appearance, decomposed no further. Knows neither business nor communication | `Button` `TextField` `Avatar` |
| **parts** (molecules) | a reusable grouping of ui. Holds local state but knows no business | `SearchBar` `Modal` `EmptyState` |
| **feature** (organisms) | a grouping that knows the business. May touch contract-conformant communication and queries | `UserList` `OrderForm` |
| **screen / route** | composition and wiring only. Appearance is delegated to the lower layers | `app/user/[id].tsx` |

**A reusable component knows no business domain.** The moment `Button` starts knowing about "orders", it is a `feature`.
Name props in that layer's vocabulary too (never bring business terms into a `ui` component's props).

### Location = the scope of sharing

**Put it at the smallest place covering the range actually in use.** While only one screen uses it, do not promote it to a shared location.
**Carve it out the moment a second site appears, and raise the location along with it.**

**Search for an existing one before you start writing.** Never create a state where the same appearance is defined separately
(never incur, from the outset, the maintenance cost of fixing 7 files to change a button's corner radius).

> **The harness does not pin directory names.** Whether to use `components/` / `features/` / `src/ui/` is
> decided by the project and **recorded in that project's `CLAUDE.md`**. **The separation itself is pinned.**

---

## 2. The boundary between the UI implementer and the logic implementer

**This separation is develop's requirement, not optional.** Appearance and logic are handled by implementers in separate contexts,
split because their oracles differ (the human eyeball for appearance, machine tests for logic).

### The split you always create structurally

**The route file = wiring; the view component = display.**
A route file under `app/**` holds only hook calls and passing props;
**the substance of the JSX goes on the presentational view component's side.**

```tsx
//  app/user/[id].tsx — 配線だけ
export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isPending, error } = useUser(id);
  return <UserDetailView user={data} isLoading={isPending} error={error} onRetry={...} />;
}
```

### As a result, ownership divides mechanically

| Implementer | What it writes | What it does not write |
| --- | --- | --- |
| **The UI implementer** | presentational components (**display determined by props alone**) and styling | **Never imports a query hook, an API client, a store, or `expo-secure-store`. Never writes `fetch`.** Data flows in as contract-conformant fixed mocks on the props |
| **The logic implementer** | hooks, the API client, query / store configuration, the wiring in a route file | **Never rebuilds the JSX structure or the styling** |

### The props type is the contract between the two

**The UI implementer defines and exports the props type, and the logic implementer maps onto it.**
The logic side never changes the props type on its own.

**When either side finds it insufficient, that side stops implementing and reports** (per each implementer's output contract).
Changing one side for your own convenience makes the other side's green a lie.

---

## 3. UI states are expressed through props

**loading / empty / error / no-permission / boundary (long text, 0 rows, a huge number) are all expressed through props.**
The UI side **does not know where that state came from.**

The logic side's job stays closed on "mapping the query's state into props".
Once that breaks and the UI side starts knowing about communication, the separation of **confirming the appearance first** stops holding.

---

## 4. Dependencies run one way, downward

Depend only in the direction `screen → feature → parts → ui`. **Never create backflow or cross-links.**

- A lower layer never imports an upper layer
- Layers at the same level never import each other (that becomes a cycle)
- Child-to-parent notification takes the form of **calling a callback the parent passed** (the child does not know the parent)

---

## 5. Lists go on a `FlatList`

**Never render a list of variable, potentially long length with `.map()`.** Every row mounts at once and it dies on a real device.

Put it on a `FlatList` (or `FlashList`) and observe the following.

- **`keyExtractor` returns a stable, unique id.**
  The default falls back in the order `key` → `id` → **the array index**.
  **Falling to the index desynchronizes rows and their state on a reorder or a delete** (another row's value gets displayed)
- **Memoize the row component and never rebuild the props you pass every render.**
  Inline styles and callbacks defeat the memoization (the same reason as [coding.md](frontend-coding.instructions.md) §2)
- **Add `getItemLayout` only when the row height is fixed.** With it, `scrollToIndex` works correctly.
  Adding it with variable heights misplaces the position
- **Never put a `FlatList` inside a `ScrollView` of the same direction.** Virtualization is defeated and putting it on a list means nothing.
  To add a header, use `ListHeaderComponent`
- Express empty, loading, and the tail with `ListEmptyComponent` / `ListFooterComponent`

---

## 6. Never duplicate visual tokens

- Colors, spacing, corner radii, and letter-spacing **live in tokens; never hardcode raw values**
- Never write the same visual style definition in two components
- **A reusable `ui` layer component carries no outer margin (`margin`).**
  Every placement would need an override and it stops being reusable. Outer spacing is **decided by the parent**

---

## ✅ Checklist before returning

- [ ] Did you search for an existing component with the same appearance before starting?
- [ ] Does a reusable component know the business domain?
- [ ] Have you promoted something used in one place only to a shared location?
- [ ] Have you written the substance of the JSX into the route file?
- [ ] (UI implementer) Are you importing a query, an API client, or a store?
- [ ] (Logic implementer) Are you rebuilding the JSX structure and the styling?
- [ ] Are all UI states (loading / empty / error / permission / boundary) received through props?
- [ ] Do dependencies run one way, downward?
- [ ] Is a variable-length list on a `FlatList`, with `keyExtractor` returning a stable id?
- [ ] Does a `ui`-layer component carry an outer `margin`?
