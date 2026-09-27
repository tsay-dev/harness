---
description: "📱 Expo — the system suite (scenario tests that start a simulator or device)"
applyTo: "**/e2e/**,**/.maestro/**"
---

# 📱 Expo — the system suite (scenario tests that start a simulator or device)

> **Scope: React Native apps on Expo (expo-router).** If it is not Expo, discard this document.
>
> **What a scenario test is, why there is one per use case, and when it runs are the develop process's**
> (`docs.instructions.md` R-1106–R-1108, `references/playbook.md` *Test-run granularity*). This document holds only
> **the wiring that makes those rules hold on a simulator or device**: the runner, the folder, the locator ladder,
> the pending marker, the UC tag, the `@scenario` annotation, and the exclusivity of the simulator.
> The default-suite rules are [common/testing.md](common-testing.instructions.md).
>
> **Write flow names and comments in Japanese.**

---

## 1. Runner and folder

- **Maestro** (YAML flows under `.maestro/`, or `e2e/` when the host prefers) is the default: it needs no build hooking and its selectors are the same `testID` / accessibility values the appearance already emits. Detox is acceptable when the host has already adopted it — then the host declares the equivalent of every rule below in `CLAUDE.md`. **The harness never pins the runner beyond this.**
- The host declares the folder in `traceconfig.json` `tests.system.dirs` (`extensions: [".yaml", ".yml"]` for Maestro), **disjoint from `tests.dirs`**, and the folder is in Jest's `testPathIgnorePatterns` (a `.yaml` is never picked up by Jest, but `e2e/*.test.ts` would be).
- **One command runs the whole suite** (`maestro test .maestro/`), declared as `commands.system` when the host wants it in the terminal gate; CI runs it regardless. **The selection by UC** is by tag: `maestro test --include-tags UC-012 .maestro/`.
- The app under test reaches the **scenario environment the host declares in `CLAUDE.md`**: which backend (a local server, a stub server, staging), how the base URL is switched (an `app.config` variant, an env var read at build time), seeded data, a disposable account. Never invented by a producer.

---

## 2. Shape of a scenario flow

One flow per use case. The `@scenario` annotation is a YAML comment on the first line; the UC ID is both the flow `name` prefix and a `tag`.

```yaml
# @scenario UC-012
appId: com.example.app
name: UC-012 案件を登録する
tags:
  - UC-012
  - pending
---
- launchApp
- tapOn: "新規案件"
- tapOn:
    id: "createProject.title"
- inputText: "案件A"
- tapOn: "保存"
- assertVisible: "案件A"
```

- Each step is one numbered step of `UC.md`'s `## 主シナリオ`; the final `assertVisible` is its `成功時` post-condition. Nothing the scenario does not say.
- **The pending marker is the `pending` tag**, and the whole-suite command excludes it (`--exclude-tags pending` in `commands.system` and CI) until the FE-wiring implementer removes the tag. `trace-check` C15 sees the flow regardless of the tag.
- **No `@covers`** on a flow. **No fixed `waitFor` / sleep**; Maestro waits for the element.

---

## 3. The locator ladder (derived, never discovered)

| Rung | Selector | Derived from |
| --- | --- | --- |
| 1 | `tapOn: "<text>"`, `assertVisible: "<text>"` | the **glossary term** (`docs/01-glossary.md`) — the term itself, never a synonym; matches `accessibilityLabel` and visible text |
| 2 | `id: "<testID>"` | the **contract**: the control that fires operation `createProject` → `testID="createProject"`; its request field `title` → `testID="createProject.title"` ([frontend/coding.md](frontend-coding.instructions.md) §6 emits them) |
| never | coordinates, indices, a copied display string as `testID`, screen or component names | — |

**If the appearance disagrees, the appearance moves** (ADR-0037); a flow is never edited to follow an implementation.

---

## 4. The simulator is an exclusive resource

- A producer launched concurrently **does not run flows** (a simulator boot, `maestro test`). Stop at editing and static checks, and **state in the report that the flow is unexecuted and which UC tag must run**.
- **Exceptions**: the selective run of the one new flow right after filing (fits in a single process); the eyeball launch for the appearance (a human gate).
- The consolidated run after the concurrent section closes pins one device (declared in `CLAUDE.md`), reuses a booted simulator, and runs **the selection by UC tag** — the whole suite only at the boundary (terminal list, CI).

---

## 5. Deterministic on a device

| Source of wobble | How to handle it |
| --- | --- |
| App state from a previous run | `launchApp` with `clearState: true`, or a disposable account per run |
| Animations, transitions, the keyboard | assert the end state; never wait on an animation; `hideKeyboard` before asserting below the fold |
| Network to the scenario backend | the backend is the host's declared one; a stub server is acceptable when declared, never a mock inside the app |
| Permissions dialogs | pre-grant through the launch arguments the host declares |

---

## ✅ Checklist before returning

- [ ] Exactly one flow for the UC, `name: UC-nnn …`, tag `UC-nnn`, `# @scenario UC-nnn` on line 1, tag `pending` as the marker?
- [ ] Every step a numbered step of `## 主シナリオ`, the last assertion its `成功時`?
- [ ] Selectors only rung 1 (glossary term) or rung 2 (operation / `operation.field` as `testID`)?
- [ ] Folder in Jest's `testPathIgnorePatterns`, `tests.system.dirs` disjoint from `tests.dirs`?
- [ ] Ran only this flow (`--include-tags UC-nnn`) — or reported it unexecuted because a concurrent section holds the simulator — and `trace-check --only C15`?
