---
description: "📱 SwiftUI — the system suite (XCUITest scenario tests that start a simulator or device)"
applyTo: "**/UITests/**,**/*UITests.swift,**/*UITest.swift"
---

# 📱 SwiftUI — the system suite (XCUITest scenario tests that start a simulator or device)

> **Scope: native iOS apps using SwiftUI.** If it does not apply, discard it.
>
> **What a scenario test is, why there is one per use case, and when it runs are the develop process's**
> (`docs.instructions.md` R-1106–R-1108, `references/playbook.md` *Test-run granularity*). This document holds only
> **the wiring that makes those rules hold in XCUITest**: the target, the locator ladder, the pending marker, the UC
> tag, the `@scenario` annotation. The default-suite rules are [testing.md](common-testing.instructions.md); **who runs
> the simulator and when** is [test-execution.md](common-test-execution.instructions.md) — it binds this suite too.
>
> **Write test names and comments in Japanese.**

---

## 1. Target and folder

- **XCUITest in a separate UI-test target** (`<App>UITests`), sources under `UITests/`. The host declares the folder in `traceconfig.json` `tests.system.dirs` (`extensions: [".swift"]`), **disjoint from `tests.dirs`** — the unit target's folder — so C11 never sees a scenario test as one with no `@covers`.
- **One command runs the whole suite**: the host's `xcodebuild test -only-testing:<App>UITests …` line with the pinned destination, declared as `commands.system` when the host wants it in the terminal gate (a simulator boot on every stop is often too slow — then CI only, and the skip line says so). **The selection by UC** is `-only-testing:<App>UITests/UC012RegisterProjectTests` — one test class per UC, named with the UC ID, is what makes the selection mechanical.
- The app under test reaches the **scenario environment the host declares in `CLAUDE.md`**: which backend and how the base URL is switched (a scheme, `launchArguments` / `launchEnvironment` read by the app's configuration entry), seeded data, a disposable account. Never invented by a producer. A stub server is acceptable when declared; a mock inside the app is not — that is the appearance's preview, not a scenario.

---

## 2. Shape of a scenario test

One test class per use case (`UC012RegisterProjectTests`), **one test method**, named with the UC ID. `// @scenario UC-nnn` is the line right above the `func`.

```swift
import XCTest

final class UC012RegisterProjectTests: XCTestCase {
  // @scenario UC-012
  func test_UC012_案件を登録する() throws {
    throw XCTSkip("UC-012 配線待ち")  // pending マーカー。FE 配線で外す
    let app = XCUIApplication()
    app.launchArguments += ["-scenario"]
    app.launch()
    app.buttons["新規案件"].tap()
    app.textFields["createProject.title"].tap()
    app.typeText("案件A")
    app.buttons["保存"].tap()
    XCTAssertTrue(app.staticTexts["案件A"].waitForExistence(timeout: 5))
  }
}
```

- Each line is one numbered step of `UC.md`'s `## 主シナリオ`; the final assertion is its `成功時` post-condition. Nothing the scenario does not say.
- **The pending marker is `throw XCTSkip("…")` as the first statement**; the FE-wiring implementer deletes that line and drives the test green.
- **No `@covers`** on a scenario test. **No `sleep`**; use `waitForExistence(timeout:)` on the element the next step needs.

---

## 3. The locator ladder (derived, never discovered)

| Rung | Query | Derived from |
| --- | --- | --- |
| 1 | `app.buttons["<label>"]`, `app.staticTexts["<text>"]`, `app.textFields["<label>"]` | the **glossary term** (`docs/01-glossary.md`) — the term itself, never a synonym; the element type from what the control is |
| 2 | `app.otherElements["<id>"]`, `app.buttons["<id>"]` by `accessibilityIdentifier` | the **contract**: the control that fires operation `createProject` → `.accessibilityIdentifier("createProject")`; its request field `title` → `"createProject.title"` ([frontend/coding.md](frontend-coding.instructions.md) §6 emits them) |
| never | element indices, coordinates, view or screen type names, a copied display string as an identifier | — |

**If the appearance disagrees, the appearance moves** (ADR-0037); a scenario test is never edited to follow an implementation.

---

## 4. The simulator is an exclusive resource

[test-execution.md](common-test-execution.instructions.md) applies to this target as written: no `xcodebuild test` inside a concurrent section (report the UC tag as unexecuted), the selective Red / pending check right after filing is allowed, one pinned destination, one `xcodebuild` at a time, the selection (`-only-testing:` the UC class) in fix rounds and the whole suite only at the boundary.

---

## 5. Deterministic on a device

| Source of wobble | How to handle it |
| --- | --- |
| App state from a previous run | a launch argument the app honours to reset local persistence, or a disposable account per run — declared by the host |
| Animations, sheets, the keyboard | assert the end state with `waitForExistence`; never wait on an animation; dismiss the keyboard before tapping below it |
| Permission dialogs | `addUIInterruptionMonitor` or pre-granted through the host's simulator setup |
| Network to the scenario backend | the host's declared backend; latency is absorbed by `waitForExistence`, never by `sleep` |

---

## ✅ Checklist before returning

- [ ] Exactly one test class and one method for the UC, both named with `UCnnn`, `// @scenario UC-nnn` above the method, `throw XCTSkip` as the pending marker?
- [ ] Every step a numbered step of `## 主シナリオ`, the last assertion its `成功時`?
- [ ] Queries only rung 1 (glossary term) or rung 2 (operation / `operation.field` as `accessibilityIdentifier`)?
- [ ] UI-test target folder in `tests.system.dirs`, disjoint from `tests.dirs`?
- [ ] Ran only this class (`-only-testing:`) — or reported it unexecuted because a concurrent section holds the simulator — and `trace-check --only C15`?
