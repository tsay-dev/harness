---
description: "🧭 SwiftUI / frontend — routing (the Feature Router)"
applyTo: "**/*.swift,**/Package.swift"
---

# 🧭 SwiftUI / frontend — routing (the Feature Router)

> **Scope: native iOS apps using SwiftUI.** If it does not apply, discard it.
>
> The common notation rules are [common/coding.md](common-coding.instructions.md); the surface rules are [coding.md](frontend-coding.instructions.md);
> granularity and the division of work is [components.md](frontend-components.instructions.md).
> This document defines only **where screens live and how navigation works**. State and the flow between layers is [dataflow.md](frontend-dataflow.instructions.md).
>
> **Write comments and user-facing text in Japanese.**

---

## 0. Defining the goal (what NavigationStack can and cannot do)

`NavigationStack` is **a device that stacks screens according to a path**.
It does not decide the business questions of "where can I go from here" or "where do I proceed on success".

Put the path in a View's `@State` and the knowledge of navigation gets bound to rendering,
making it easy to break on rapid taps, deep links, and swapping things out in tests.

**This document's job is to pin ownership of navigation to the Feature's Router and to remove path manipulation from Views.**
The API underneath stays the ordinary `NavigationStack(path:)`.

---

## 1. Put a Router in each Feature

Put **that Feature's Router** in Presentation. Never default to one giant app-wide Router.

```swift
enum LoginRoute: Hashable {
  case home
  case forgotPassword
}

@Observable
final class LoginRouter {
  var path = NavigationPath()
  var sheet: LoginSheet?

  func showHome() {
    path.append(LoginRoute.home)
  }

  func showForgotPassword() {
    sheet = .forgotPassword
  }
}
```

- **The Router holds "which screens are currently up"** — the path, sheets, fullScreenCovers, and so on
- The ViewModel produces the business result and calls a Router method when navigation is permitted ([dataflow.md](frontend-dataflow.instructions.md))
- Only the root View (that Feature's entrance) binds `NavigationStack(path:)` to the Router

---

## 2. A View never calls `path.append`

```swift
// ❌ NG: View が遷移装置を直接いじる
Button("次へ") { path.append(Route.home) }

// ✅ OK: 意図だけを上に渡す（VM 経由でも Router でも、path 操作は View の外）
Button("次へ") { viewModel.nextButtonTapped() }
```

All a View may write is "what the user did".
Mutating the `NavigationPath` and owning the `navigationDestination` destination table belong to the Router (and the root View binding it).

```swift
struct LoginRootView: View {
  @Bindable var router: LoginRouter
  @Bindable var viewModel: LoginViewModel

  var body: some View {
    NavigationStack(path: $router.path) {
      LoginFormView(viewModel: viewModel)
        .navigationDestination(for: LoginRoute.self) { route in
          switch route {
          case .home: HomeView(/* 必要な依存は init で */)
          case .forgotPassword: ForgotPasswordView(/* ... */)
          }
        }
    }
    .sheet(item: $router.sheet) { sheet in
      // ...
    }
  }
}
```

---

## 3. Pass the id; re-fetch the substance

**Never pass a giant model, or "the JSON fetched on the previous screen", wholesale to the destination.**
Keep what you pass to restorable values such as an identifier, and let the destination fetch the substance via a UseCase.

Premising things on the previous screen's in-memory values always breaks on a deep link, on state restoration, and after a process kill.

Being opened with an invalid id is **not an exceptional case but a reachable state**.
Land a parse failure or a non-existent record into a form that works as a screen ([common/coding.md](common-coding.instructions.md)'s "never weaken types to get to green").

---

## 4. Make going back and closing explicit

- The Router also owns popping the stack (`pop`, `popToRoot`, and so on). Never let a View build a business flow out of `dismiss` alone
- Presenting and dismissing a sheet / fullScreenCover is likewise expressed in the Router's state
- Where to go when you **cannot** go back (home, and so on) is stated explicitly as a Router method where needed

---

## 5. Root wiring belongs only to `App/` or a Feature's entrance

- The app's first `NavigationStack` connection and the construction of a Feature Router are closed inside **the Composition Root (`App/`) or the Feature's entrance**
- Never proliferate new `NavigationStack`s deep inside child Views (nested stacks easily break the back operation and path resolution)
- When navigation spanning Features is needed, put that joining point in the Composition Root or in an explicit boundary API.
  Never let a Feature's internal Router start importing another Feature's concrete Views indiscriminately

---

## ✅ Checklist before returning

- [ ] Does the Feature have a Router, with ownership of the path and sheets there?
- [ ] Is a View calling `path.append` or manipulating the navigation device directly?
- [ ] Does the ViewModel call the Router after the business result?
- [ ] Are navigation parameters id-centric rather than giant objects?
- [ ] Did you decide the display for being opened with invalid input?
- [ ] Are you proliferating `NavigationStack`s deep in the children?
