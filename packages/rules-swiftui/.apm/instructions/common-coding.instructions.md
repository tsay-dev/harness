---
description: "📐 SwiftUI — common coding rules (all layers)"
applyTo: "**/*.swift,**/Package.swift"
---

# 📐 SwiftUI — common coding rules (all layers)

> **Scope: native iOS apps using SwiftUI.**
> This document fires on file extension, so it can be injected into server-side Swift or non-SwiftUI targets too.
> **If the target is not a SwiftUI iOS app, treat this document as inapplicable** and discard it.
>
> What this document holds is only **what is true across layers**. The SwiftUI surface delta is
> [frontend/coding.md](frontend-coding.instructions.md); state and layering is
> [frontend/dataflow.md](frontend-dataflow.instructions.md); screen navigation is
> [frontend/routing.md](frontend-routing.instructions.md); granularity and the division of work is
> [frontend/components.md](frontend-components.instructions.md). Test wiring is
> [testing.md](common-testing.instructions.md), and when tests run is
> [test-execution.md](common-test-execution.instructions.md).
> **Never copy the common rules into a layer leaf** (the SSOT is here, in one place).
>
> **Write comments and user-facing text in Japanese.**

---

## 0. Formatting is decided by tools, not by this document

Indentation, line breaks, import order, and spacing are **authoritative in the project's format / lint command**,
and this document defines none of them. Never align columns by hand. **Run the format command before returning.**

When a rule conflicts, the tool's output wins (that is all a human looks at too).

---

## 1. Never weaken types and failures to get to green

**Never write a force unwrap (`!`), `try!`, `as!`, or an unexplained `fatalError` "to make it compile".**

Needing to write one is a signal that **either the type or the contract is wrong**.
Crush it silently and downstream work piles up on a wrong premise, landing somewhere else at runtime.

```swift
// ❌ NG: 失敗しうる値を成功前提に押し潰している
let user = try! await repository.fetchUser(id: id)
let id = Int(rawId)!

// ✅ OK: 失敗を型で運び、呼び出し側で扱う
let user = try await repository.fetchUser(id: id)
guard let id = Int(rawId) else { /* 到達可能な不正入力として扱う */ return }
```

**When you want to crush something, stop implementing and report "what conflicts with what"** (per each implementer's output contract).
Never rewrite the contract yourself to make things line up.

The only exception is **when an external API or the system documents a guarantee that "this always exists"**, and then leave the reason in a comment.
Where the framework mandates it — the `@IBOutlet` convention at an IB boundary, for instance — follow that.

---

## 2. Modules and locations (Feature-first)

Code locations are **Feature-first**. Never put layer names at the top.

```
App/                         # startup, the Composition Root, and root wiring only
Shared/                      # only what is genuinely used by several Features
Features/
  Login/
    Presentation/            # View / ViewModel / Router
    Domain/                  # Entity / UseCase / the Repository protocol
    Data/                    # the Repository implementation / DTOs / URLSession usage
```

### What may go in `App/`

- The app's entry point (`@main`)
- **The Composition Root** (constructing and wiring the concrete types; details in [dataflow.md](frontend-dataflow.instructions.md))
- Connecting the root `NavigationStack` (details in [routing.md](frontend-routing.instructions.md))

Never let business logic, screens, or Repository implementations escape into `App/`.

### The condition for promoting to `Shared/`

Promote **only what is used by 2 or more Features right now**.
Never promote on "we might use it later". A type used by one Feature lives under that Feature.

The moment `Shared/` becomes a Domain junk drawer, Feature-first's locality is gone.

### The direction of dependencies (the same across locations)

- A Feature's Domain knows nothing of SwiftUI, `URLSession`, or another Feature's Presentation / Data
- Features never import each other's internals and depend on each other
  (if sharing is needed, extract only the genuinely shared types into `Shared/`; report any coupling that still does not fit as a design issue)

---

## 3. Concurrency: `async/await` only; UI state on Main

**Never add more Combine to new code** (`PassthroughSubject`, `AnyPublisher`, and so on).
Write asynchrony with `async` / `await` / `Task`.

**Mark a ViewModel that holds screen state `@MainActor`.**
That pins updates of UI-touching values to the main thread and prevents, at the type level, a race between the View's calls and the update.

```swift
@MainActor
@Observable
final class LoginViewModel {
  var isLoading = false
  // ...
}
```

- The substance of heavy processing and networking is not written in the ViewModel but pushed down to the UseCase / Repository ([dataflow.md](frontend-dataflow.instructions.md))
- Never mark UseCases / Repositories `@MainActor` indiscriminately (it occupies main and freezes the screen)
- Never do blocking I/O or heavy computation synchronously from a View's `body`

Even where Combine remains in existing code, **keep new routes on `async/await`.**
If the scale calls for a migration policy, write it in that project's `CLAUDE.md` or in an ADR.

---

## 4. Never embed secrets in source or in the client

Never put a secret anywhere extractable from a distributed binary.

- An API base URL, a feature flag, a public key → fine on the client
- An API secret, a signing key, an admin token → **never put them there**

Whether in xcconfig, Info.plist, or a source literal, a value baked into the client is not a secret.
If processing that requires a secret becomes necessary, that processing cannot live on the client.
**Stop implementing and report** (never decide the server-side design yourself).

---

## 5. The boundary on adding dependencies

**Never add a Swift Package or a CocoaPods / SPM product dependency on your own.**

An addition affects the build, review, and the already-resolved versions.
Compiling successfully is not approval for a dependency addition.

When a dependency addition becomes necessary, **report what you want to add and why, and stop.**
Using a dependency already in the project is not restricted.

The networking standard is **`URLSession` + `async/await`** ([dataflow.md](frontend-dataflow.instructions.md)).
A project defaulting to a different client declares it in that project's `CLAUDE.md`.

---

## ✅ Checklist before returning

- [ ] Did you run the lint / format command?
- [ ] Did you add `!` / `try!` / `as!` to get to green?
- [ ] Did you add more Combine to new code?
- [ ] Does a ViewModel holding UI state carry `@MainActor`?
- [ ] Did you promote a single-Feature type into `Shared/`?
- [ ] Did you embed a value that could be a secret into a client artifact?
- [ ] Did you add a new external dependency without permission?
