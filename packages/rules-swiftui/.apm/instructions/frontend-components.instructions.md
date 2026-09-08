---
description: "🧱 SwiftUI / frontend — View granularity and the division of work"
applyTo: "**/*.swift,**/Package.swift"
---

# 🧱 SwiftUI / frontend — View granularity and the division of work

> **Scope: native iOS apps using SwiftUI.** If it does not apply, discard it.
>
> Surface notation is [coding.md](frontend-coding.instructions.md); state and layering is [dataflow.md](frontend-dataflow.instructions.md);
> where screens live is [routing.md](frontend-routing.instructions.md).
> This document defines **how to split a set of Views and who writes which part**.
>
> **Write comments and user-facing text in Japanese.**

---

## 1. The layer is the responsibility; the location is the scope of sharing (two separate axes)

**Never conflate the layer (what it may know) with the location (where it goes).**
The layer is determined by responsibility; the location by "how many places use it right now".
The Feature-first folder convention itself has its SSOT in [common/coding.md](common-coding.instructions.md).

### Layer = responsibility (inside Presentation)

| Layer | Responsibility | Examples |
| --- | --- | --- |
| **ui** (atoms) | the smallest unit of appearance, decomposed no further. Knows neither business nor UseCases | `PrimaryButton` `Avatar` `FormTextField` |
| **parts** (molecules) | a reusable grouping of ui. Holds local UI state but knows no business | `SearchBar` `EmptyState` `ErrorBanner` |
| **feature** (organisms) | a grouping that knows the business. May touch the ViewModel / Router | `LoginFormView` `UserListView` |
| **root** (wiring) | the Feature's entrance. Only the `NavigationStack` connection and handing over dependencies | `LoginRootView` |

**A reusable component knows no business domain.** The moment `PrimaryButton` starts knowing about "orders", it is a `feature`.
Name the arguments in that layer's vocabulary too (never bring business terms into a `ui` component's arguments).

### Location = the scope of sharing

**Put it at the smallest place covering the range actually in use.** While only one screen uses it, do not promote it to `Shared/`.
**Carve it out the moment a second site appears, and raise the location along with it.**

**Search for an existing one before you start writing.** Never create a state where the same appearance is defined separately
(never incur, from the outset, the maintenance cost of fixing several files to change a button's corner radius).

> **The harness does not pin directory names beyond this.**
> Whether to use `Presentation/UI` or keep it flat may be recorded in the project's `CLAUDE.md`.
> **The separation itself (ui / parts / feature / root) and the condition for promoting to Shared are pinned.**

---

## 2. The boundary between the UI implementer and the logic implementer

**This separation is develop's requirement, not optional.** Appearance and logic are handled by implementers in separate contexts,
split because their oracles differ (the human eyeball for appearance, machine tests for logic).

### The split you always create structurally

**root = wiring; presentational = display.**
A Feature's entrance (`LoginRootView`, and so on) stays on receiving the Router / ViewModel and connecting the `NavigationStack`,
and **the substance of the screen's appearance lives in the Views below it** ([routing.md](frontend-routing.instructions.md)).

```swift
// ✅ root — 配線だけ
struct LoginRootView: View {
  @Bindable var router: LoginRouter
  @Bindable var viewModel: LoginViewModel

  var body: some View {
    NavigationStack(path: $router.path) {
      LoginFormView(viewModel: viewModel)
        .navigationDestination(for: LoginRoute.self) { /* ... */ }
    }
  }
}

// ✅ presentational に近い feature View — 表示と意図の転送
struct LoginFormView: View {
  @Bindable var viewModel: LoginViewModel

  var body: some View {
    // レイアウトと控件。通信・Repository は知らない
  }
}
```

### As a result, ownership divides mechanically

| Implementer | What it writes | What it does not write |
| --- | --- | --- |
| **The UI implementer** | presentational Views (**display determined by the values and closures passed in**) and styling | **Never imports a UseCase / Repository / `URLSession`.** Data flows in as contract-conformant fixed mocks in the arguments. Previews use fake DI too ([coding.md](frontend-coding.instructions.md)) |
| **The logic implementer** | the ViewModel / Router / UseCase connection, the wiring at root, Domain / Data | **Never rebuilds the visual structure or the styling** (it maps onto the existing View's arguments) |

### The argument (props) type is the contract between the two

**The UI side defines the View's inputs (initializer arguments, the model types passed in), and the logic side maps onto them.**
The logic side never rewrites a View into "arguments that suit me".

**When either side finds it insufficient, that side stops implementing and reports** (per each implementer's output contract).
Changing one side for your own convenience makes the other side's green a lie.

---

## 3. UI states are expressed as arguments (or a thin binding)

**loading / empty / error / no-permission / boundary (long text, 0 rows, a huge number) are expressed as inputs, from the display side's view.**
The UI side **does not know where that state came from.**

- `ui` / `parts` close, as far as possible, on **values and closures alone** (never holding a ViewModel directly)
- A `feature` may hold a ViewModel. But keep it in a shape where the View need not know the ViewModel's contents (the UseCase)
- The logic side's job stays closed on "mapping the UseCase's result and progress into the form the View receives"

Once that breaks and the UI side starts knowing about communication, the separation of **confirming the appearance first** stops holding.

---

## 4. Dependencies run one way, downward

Depend only in the direction `root → feature → parts → ui`. **Never create backflow or cross-links.**

- A lower layer never imports an upper layer
- Layers at the same level never import each other (that becomes a cycle)
- Child-to-parent notification takes the form of **calling a closure the parent passed** (the child does not know the parent's type)
- Dependency on the CA layers (Domain / Data) follows [dataflow.md](frontend-dataflow.instructions.md). Never touch a Domain implementation or Data from `ui` / `parts`

---

## 5. A list row stays a display component

Lazy containers for variable-length lists and stable ids have their SSOT in [coding.md](frontend-coding.instructions.md).
This document only adds the division of work.

- **Keep row Views in `ui` / `parts`.** Never launch a UseCase inside a row
- The data a list needs is assembled by the parent feature / ViewModel before being passed down
- The model passed to a row stays within what that row displays

---

## 6. Never duplicate visual tokens

- Colors, spacing, corner radii, and letter-spacing go into the project's common entrance if it has one; never scatter raw values per screen
- Never write the same visual style definition in two Views
- **A reusable `ui` layer component carries no outer spacing.**
  Every placement would need an override and it stops being reusable. Outer spacing is **decided by the parent**

---

## ✅ Checklist before returning

- [ ] Did you search for an existing View with the same appearance before starting?
- [ ] Does a reusable component know the business domain?
- [ ] Have you promoted something used in one place only to `Shared/`?
- [ ] Have you written too much of the appearance's substance into root? (does it stay on wiring?)
- [ ] (UI implementer) Are you importing a UseCase / Repository / `URLSession`?
- [ ] (Logic implementer) Are you rebuilding the visual structure and the styling?
- [ ] Are UI states (loading / empty / error / permission / boundary) expressed as inputs on the display side?
- [ ] Do dependencies run one way, downward?
- [ ] Does a list row carry networking or a UseCase?
- [ ] Does the `ui` layer carry outer spacing?
