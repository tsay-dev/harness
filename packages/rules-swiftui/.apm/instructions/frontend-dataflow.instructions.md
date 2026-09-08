---
description: "🔀 SwiftUI / frontend — state and data flow (Clean Architecture)"
applyTo: "**/*.swift,**/Package.swift"
---

# 🔀 SwiftUI / frontend — state and data flow (Clean Architecture)

> **Scope: native iOS apps using SwiftUI.** If it does not apply, discard it.
>
> The common notation rules are [common/coding.md](common-coding.instructions.md); the surface rules are [coding.md](frontend-coding.instructions.md);
> where screens live and how navigation works is [routing.md](frontend-routing.instructions.md); granularity and the division of work is [components.md](frontend-components.instructions.md).
> This document defines only **where state is held and how it flows between the layers**.
>
> **Write comments and user-facing text in Japanese.**

---

## 0. Defining the goal (what SwiftUI does and does not support)

What SwiftUI / Observation come close to guaranteeing is this:

1. When an observed value changes, the View updates
2. The flow of data does not become one-way by itself unless you design it that way

**Executing a use case, networking, caching policy, persistence, thread boundaries, and assembling dependencies are outside SwiftUI's remit.**

Because that space is empty, an implementation naturally writes `URLSession` into a View's `task` / `onAppear`
and stuffs both business and networking into an `@Observable` class. That implementation **works correctly** in a demo.
It breaks on rapid taps, a bad connection, screens surviving, and swapping things out in tests — exactly where verification does not reach.

**This document's job is to forbid that stuffing and to name the layers and the places things go.**

---

## 1. The layers and the direction of dependency (mandatory)

The layers within a Feature are as follows. **Dependencies run from outside inward only** (Presentation → Domain ← Data).

| Layer | What may go there | What it must not know |
| --- | --- | --- |
| **Presentation** | View / a thin ViewModel / Router | `URLSession`, DTOs, another Feature's Data implementation |
| **Domain** | Entity / UseCase / the Repository **protocol** | SwiftUI, `URLSession`, DTOs, concrete networking |
| **Data** | The Repository **implementation** / DTOs / mapping | View, ViewModel, Router |

```
View ──calls──▶ ViewModel ──calls──▶ UseCase ──depends on──▶ Repository (protocol)
                                                  ▲
                                                  │ implements
                                          RepositoryImpl (Data, URLSession)
```

- **The UseCase is mandatory.** Never call a Repository directly from a ViewModel
- **The Repository is a protocol in Domain and an implementation in Data.** Never put only the concrete type in Domain
- If a Domain type needs `import SwiftUI` or `URLSession`, the layering has dissolved

---

## 2. The ViewModel is thin, `@Observable` + `@MainActor`

A screen's client state (in-progress input, the loading indicator, an error message, a selection) is held by
**that screen's ViewModel**.

```swift
@MainActor
@Observable
final class LoginViewModel {
  var email = ""
  var password = ""
  var isLoading = false
  var errorMessage: String?

  private let loginUseCase: LoginUseCase
  private let router: LoginRouter

  init(loginUseCase: LoginUseCase, router: LoginRouter) {
    self.loginUseCase = loginUseCase
    self.router = router
  }

  func loginButtonTapped() async {
    isLoading = true
    defer { isLoading = false }
    do {
      try await loginUseCase.execute(email: email, password: password)
      router.showHome()
    } catch {
      errorMessage = "ログインに失敗しました"
    }
  }
}
```

What a ViewModel may do:

- Hold and update the screen state
- Call the UseCase and shape the result for the screen (display messages, and so on)
- Signal the Router that navigation is permitted

What a ViewModel must not do:

- `URLSession` or assembling endpoints
- The substance of business rules spanning Entities (that is the UseCase)
- Directly operating persistence or the keychain (push that down to the Data side's responsibility)

**The View does not know the UseCase or the Repository.** All it knows is the ViewModel (and the Router binding needed for the root wiring).

---

## 3. UseCase and Repository

### UseCase

- Represents one application operation ("log in", "fetch the statement")
- Takes input and gives output in the Domain's vocabulary (never brings in screen wording or the View's convenience)
- Receives in `init` only the dependencies Domain permits, such as a Repository protocol

### Repository

- The protocol is Domain
- The implementation is Data. **The networking standard is `URLSession` + `async/await`**
- Converting between external JSON / DTOs and Domain Entities is closed inside Data (never leak a DTO up to Presentation)

```swift
// Domain
protocol UserRepository: Sendable {
  func fetchUser(id: UserID) async throws -> User
}

struct FetchUserUseCase: Sendable {
  private let users: UserRepository
  init(users: UserRepository) { self.users = users }
  func execute(id: UserID) async throws -> User {
    try await users.fetchUser(id: id)
  }
}

// Data
struct UserRepositoryImpl: UserRepository {
  private let session: URLSession
  private let baseURL: URL
  // decode → Entity へマッピング
}
```

---

## 4. Only the Composition Root knows the concrete types

**Constructing and wiring concrete types (`UserRepositoryImpl` and the like) happens only in `App/`** (or a Feature's factory).
View / ViewModel / UseCase depend on a protocol or an abstraction and receive it by **init injection**.

- Never take Domain / Data from a service locator or a `.shared` singleton
- Never distribute Domain-level things by putting a UseCase or a Repository into SwiftUI's `Environment`
  (what may go in Environment is limited to presentation concerns that barely change after startup, such as the theme)

An unswappable concrete coupling means untestability and a relapse into "a straight line from screen to network".

---

## 5. Never communicate from a View

```swift
// ❌ NG: View が Data の仕事をしている
.task {
  let (data, _) = try await URLSession.shared.data(from: url)
  users = decode(data)
}

// ✅ OK: View は意図だけを渡す
.task { await viewModel.onAppear() }
```

Never touch `URLSession` or a Repository implementation directly from `task` / `onAppear` / a button.
Treat re-entry, cancellation, and rapid taps as design problems on the ViewModel / UseCase side.

---

## 6. Server-derived values and screen-only values

| Kind | Definition | Where it lives |
| --- | --- | --- |
| **Server-derived** | values whose truth the server holds and of which we see a copy | fetched via a UseCase. If it is cached on the screen indefinitely, state the policy |
| **Screen-only** | in-progress input, a modal's open/closed, a selection — values the server does not know | the ViewModel (or a View's `@State` if truly tiny) |

When you cannot decide, **decide first who holds the truth**.
Never copy a server-derived value into a View's `@State` and make that "the screen's truth"
(the exception is starting an explicit editing copy, as in an edit form).

---

## ✅ Checklist before returning

- [ ] Does it run View → ViewModel → UseCase → Repository (protocol) → implementation?
- [ ] Are you skipping the UseCase and calling a Repository from a ViewModel?
- [ ] Does Domain import SwiftUI / `URLSession` / DTOs?
- [ ] Is the ViewModel `@Observable` + `@MainActor` and kept thin?
- [ ] Has concrete construction leaked outside the Composition Root?
- [ ] Are you calling `URLSession` or a Repository implementation directly from a View?
- [ ] Has a DTO leaked up to Presentation?
