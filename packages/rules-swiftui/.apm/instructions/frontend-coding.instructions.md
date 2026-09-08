---
description: "🎨 SwiftUI / frontend — surface-layer coding rules"
applyTo: "**/*.swift,**/Package.swift"
---

# 🎨 SwiftUI / frontend — surface-layer coding rules

> **Scope: native iOS apps using SwiftUI.** If it does not apply, discard it.
>
> **The common rules are [common/coding.md](common-coding.instructions.md)** (formatting is the tool's; never weaken types to get to green;
> Feature-first and `App`/`Shared`; `@MainActor` and `async/await`; secrets and dependencies).
> State and layering is [dataflow.md](frontend-dataflow.instructions.md); navigation is [routing.md](frontend-routing.instructions.md);
> granularity and the implementers' division of work is [components.md](frontend-components.instructions.md).
> This document defines, **on top of following those**, only the delta that binds SwiftUI's surface (how a View is written). It never restates the common side.
>
> **Write comments and user-facing text in Japanese.**

---

## 0. Defining the goal (what `body` can and cannot do)

A SwiftUI `body` is **a declaration that maps the current state onto an appearance**.
Fetching data, persisting it, owning navigation, and the substance of business rules are not here.

`body` can be re-evaluated. Write a side effect premised on how many times or when it runs, and
it works in a demo while breaking only on a real device, on a redraw, or in a preview.

**This document's job is to close the loopholes that tend to open on the View surface (side effects, bloat, list accidents, missing edges).**

---

## 1. Never write side effects in `body` or on the render path

```swift
// ❌ NG: 描画のたびに走りうる
var body: some View {
  let _ = viewModel.load()          // 同期副作用
  Text(viewModel.title)
    .onAppear { Task { await api.fetch() } }  // View が Data を知っている
}

// ✅ OK: 表示と「起動の意図」だけ。本体は ViewModel へ
var body: some View {
  Text(viewModel.title)
    .task { await viewModel.onAppear() }
}
```

- **Never write a direct call to networking, a Repository, or a UseCase in a View** ([dataflow.md](frontend-dataflow.instructions.md))
- Never launch a `Task { }` inside `body` to "update while we're here". The trigger is limited to `.task` or an explicit user action, and the substance lives in the ViewModel
- Never do heavy synchronous computation, file I/O, or a semaphore wait from `body` (it freezes main)

**Prefer `.task` (and `.task(id:)` where needed) over `.onAppear`.**
Cancellation and lifecycle handling are clearer, reducing accidental updates after the screen is gone.

---

## 2. Never let a View become a giant monolith

Never load a form, a list, alerts, communication state, and layout all into one file or one `body`.

| Signal to split | What to do |
| --- | --- |
| A section of the screen reads independently | carve it into a private child View (a `private struct` in the same file is fine) |
| You want a reuse or preview unit | make it a separate View type within Presentation |
| State and operations are growing | that is not a View split — doubt the ViewModel / Router design ([dataflow.md](frontend-dataflow.instructions.md)) |

**Never drag a UseCase into a View through a purely visual split.**
What a child View needs goes no further than display values and closures (or a reference to a thin ViewModel).

---

## 3. Lists and identity

Long lists use **a lazy container: `List` / `LazyVStack` / `LazyHStack`**.
Never build hundreds of rows at once with an ordinary `VStack` + `ForEach` (it dies on the initial render and on scroll).

```swift
// ❌ NG: 安定しない id、行の中でまた通信
ForEach(Array(items.enumerated()), id: \.offset) { _, item in
  Row(item: item).task { await loadDetail(item) }
}

// ✅ OK: ドメイン上安定した id。行は表示に徹する
ForEach(items, id: \.id) { item in
  Row(item: item)
}
```

- A `ForEach`'s id is **an identifier stable in the domain** (never make `offset` or a display string the id)
- Never start a detail fetch each time a row appears. Assemble the data a list needs on the UseCase side, or make it an explicit per-screen load
- The model passed to a row stays within what that row displays (never hand a giant graph to every row)

---

## 4. The screen's edges — safe area and the keyboard

Miss them and it is hard to notice in the simulator while breaking only on a real device.

- Presume the notch, the home indicator, and the Dynamic Island.
  Use `safeAreaPadding` / `safeAreaInset` where needed, and **never fill the padding with hand-picked magic numbers alone**
- Never add the same inset twice on a side the navigation bar or the tabs already consumed
- Build a structure where the keyboard hides neither the submit button nor the fields, from the start, on any screen with input
  (`ScrollView`, `safeAreaInset(edge: .bottom)`, and so on — never rebuild the layout afterwards)

---

## 5. Drive Previews with the Composition's fakes

Never connect a `#Preview` to the production `URLSession` or a real API.

- Inject **fakes of the Repository / UseCase** for the Preview, in the same shape as the Composition
- Never let a View start referencing a singleton or `.shared` for the sake of a Preview ([dataflow.md](frontend-dataflow.instructions.md))
- Pass dependencies explicitly, so the preview stays "a device for checking a screen's appearance" and never becomes a substitute for integration tests

```swift
#Preview {
  LoginRootView(
    router: LoginRouter(),
    viewModel: LoginViewModel(
      loginUseCase: PreviewLoginUseCase(),
      router: LoginRouter()
    )
  )
}
```

---

## 6. Accessibility is something you "emit"

A control that is only an icon or only decoration announces nothing to VoiceOver.

| Target | What to attach |
| --- | --- |
| Anything pressable | that it is recognized as a button and the like (use `Button`; `accessibilityAddTraits` where needed) |
| Something with only an icon and no wording | `accessibilityLabel` (the meaning of the action, not the icon's name) |
| A purely decorative image | `accessibilityHidden(true)` |
| State (selected, disabled) | express it in the accessibility state as well as in the appearance |

Never use a copy of the displayed wording as an id (a wording change breaks it). When identification in tests is needed, attach a separate identifier **named for the function**.

> Deeper a11y guidance and an FE testing leaf are not placed for now.
> In line with the premise that develop does not file FE tests, only the minimum line for emission is pinned here.

---

## 7. Never habitually reach for layout escape hatches

- **Never use `GeometryReader` "just because".** It breaks the size children propose, and nesting it collapses layouts easily. Use it only when you can explain the measurement you need
- Never scatter magic numbers for colors, fonts, and spacing per screen. If the project has a common design entrance (Assets, a small token set), use it. If it does not, do not stand up a whole design system on your own — match the existing style
- Never update state every frame just so an animation "looks like it moves". Put it on SwiftUI's `animation` / `withAnimation`, and never embed heavy computation inside an animation's closure

---

## ✅ Checklist before returning

- [ ] Is there networking, heavy synchronous processing, or an unsanctioned `Task` launch in `body` or on the render path?
- [ ] Is a View calling a UseCase / Repository / `URLSession` directly?
- [ ] Has the screen stayed a giant monolith?
- [ ] Is a long list in a lazy container, with a stable `ForEach` id?
- [ ] Will the real-device layout survive the safe area and the keyboard?
- [ ] Does a Preview depend on a real API or `.shared`?
- [ ] Do icon buttons and the like have an `accessibilityLabel` (or an equivalent)?
- [ ] Are you multiplying `GeometryReader` without a reason?
