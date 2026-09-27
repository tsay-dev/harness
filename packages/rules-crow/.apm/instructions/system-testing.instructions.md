---
description: "🎭 crow — the system suite (scenario tests that start a browser)"
applyTo: "**/crow3_*/e2e/**,**/crow3_*/playwright.config.*"
---

# 🎭 crow — the system suite (scenario tests that start a browser)

> **Scope: crow (crow3) applications.** If it is not crow, discard this document.
>
> **What a scenario test is, why there is one per use case, and when it runs are the develop process's**
> (`docs.instructions.md` R-1106–R-1108, `references/playbook.md` *Test-run granularity*). This document holds only
> **the wiring that makes those rules hold in a browser on crow**: the runner, the folder, the locator ladder, the
> pending marker, the UC tag, the `@scenario` annotation. The default-suite rules are [common/testing.md](common-testing.instructions.md).
>
> **Write test titles and comments in Japanese.**

---

## 1. Runner and folder

- **Playwright** (`@playwright/test`), under `e2e/` at the crow application root, config `playwright.config.ts`. The PHP side is not involved: the suite drives the served pages from the outside, so the runner is the same as on any web app. The host declares the folder in `CLAUDE.md` and in `traceconfig.json` `tests.system.dirs` (`extensions: [".ts"]`).
- **`e2e/` is not under `tests/`**, so PHPUnit's discovery never sees it, and `tests.system.dirs` stays disjoint from `tests.dirs` (C11 would otherwise report scenario tests as carrying no `@covers`).
- **One command runs the whole suite** (`npx playwright test` from the application root), declared as `commands.system` in `traceconfig.json` when the host wants it in the terminal gate; CI runs it regardless. **The selection by UC** is `npx playwright test --grep "UC-012"`.
- The suite drives the **real application** (the host's local server, seeded database, disposable accounts — declared in `CLAUDE.md`, never invented). A mocked backend belongs to the appearance, not here.

---

## 2. Shape of a scenario test

One file per use case, one `test` per file, titled with the UC ID and title. `// @scenario UC-nnn` sits on the line right above `test(`.

```ts
import { test, expect } from "@playwright/test";

// @scenario UC-012
test.fixme("UC-012 案件を登録する", async ({ page }) => {
  await page.goto("/projects");
  await page.getByRole("link", { name: "新規案件" }).click();
  await page.getByLabel("件名").fill("案件A");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("row", { name: /案件A/ })).toBeVisible();
});
```

- Each `await` line is one numbered step of `UC.md`'s `## 主シナリオ`; the final `expect` is its `成功時` post-condition. Nothing the scenario does not say.
- **The pending marker is `test.fixme(...)`**; the FE-wiring implementer turns it into `test` and drives it green.
- **No `@covers`**, **no `page.waitForTimeout`**.
- A crow page that renders through view parts (`frontend-viewpart.md`) is still just DOM to the browser: the scenario never names a part, a section, or a class.

---

## 3. The locator ladder (derived, never discovered)

| Rung | Locator | Derived from |
| --- | --- | --- |
| 1 | `getByRole(role, { name })`, `getByLabel(text)` | the **glossary term** (`docs/01-glossary.md`) — the term itself, never a synonym; the role from what the control is |
| 2 | `getByTestId(id)` | the **contract**: the control that fires operation `renameUser` → `data-testid="renameUser"`; its request field `name` → `data-testid="renameUser.name"` |
| never | CSS selectors, XPath, `nth()`, part or section names, text copied from the screen as an id | — |

**If the appearance disagrees, the appearance moves** (ADR-0037); a scenario test is never edited to follow an implementation.

---

## 4. Deterministic in a browser

| Source of wobble | How to handle it |
| --- | --- |
| Shared accounts and leftover rows | a seeded fixture or disposable account per run, declared by the host; never depend on a previous test |
| Server-rendered navigation | assert on the landed page's content, not on the URL alone |
| Real time | freeze through the application's injection point where the scenario depends on it |
| Retries | allowed in CI config; a scenario that needs one to pass is a finding |

Tests never depend on order; one `test` per file, never chained.

---

## ✅ Checklist before returning

- [ ] Exactly one `test` for the UC, titled `UC-nnn …`, `// @scenario UC-nnn` above it, `test.fixme` as the pending marker?
- [ ] Every action a numbered step of `## 主シナリオ`, the last assertion its `成功時`?
- [ ] Locators only rung 1 (glossary term) or rung 2 (operation / `operation.field`)?
- [ ] `e2e/` outside PHPUnit's discovery, `tests.system.dirs` disjoint from `tests.dirs`?
- [ ] Ran only this test (`--grep "UC-nnn"`) and `trace-check --only C15`?
