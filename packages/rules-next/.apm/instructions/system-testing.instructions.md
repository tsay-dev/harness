---
description: "🎭 Next.js — the system suite (scenario tests that start a browser)"
applyTo: "**/e2e/**,**/playwright.config.*"
---

# 🎭 Next.js — the system suite (scenario tests that start a browser)

> **Scope: TypeScript projects on Next.js (App Router).** If it is not Next.js, treat this document as inapplicable and discard it.
>
> **What a scenario test is, why there is one per use case, and when it runs are the develop process's**
> (`docs.instructions.md` R-1106–R-1108, `references/playbook.md` *Test-run granularity*). This document holds only
> **the wiring that makes those rules hold in a browser on Next.js**: the runner, the folder, the locator ladder, the
> pending marker, the UC tag, the `@scenario` annotation. The default-suite rules are [common/testing.md](common-testing.instructions.md).
>
> **Write test titles and comments in Japanese.**

---

## 1. Runner and folder

- **Playwright** (`@playwright/test`), under `e2e/` at the project root, config `playwright.config.ts`. The host may rename the folder; then it declares it in `CLAUDE.md` and in `traceconfig.json` `tests.system.dirs`.
- **`e2e/` is excluded from the default suite's discovery** (`vitest` / `jest` config) and `tests.system.dirs` is disjoint from `tests.dirs` — otherwise the scenario tests are reported as tests with no `@covers` (C11).
- **One command runs the whole suite** (`npx playwright test`), declared as `commands.system` in `traceconfig.json` when the host wants it in the terminal gate; CI runs it regardless. **The selection by UC** is `npx playwright test --grep "UC-012"`.
- The suite drives the **real application** against the scenario environment the host declares in `CLAUDE.md` (`webServer` in the config, seeded data, disposable accounts). Never a mocked backend in this suite — that is the appearance's job, not the scenario's.

---

## 2. Shape of a scenario test

One file per use case, one `test` per file, titled with the UC ID and the UC title. The `@scenario` annotation is the line right above `test(` (that is where `trace-check` reads it — `scenario_pattern`).

```ts
import { test, expect } from "@playwright/test";

// @scenario UC-012
test.fixme("UC-012 案件を登録する", async ({ page }) => {
  await page.goto("/projects");
  await page.getByRole("button", { name: "新規案件" }).click();
  await page.getByLabel("件名").fill("案件A");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("row", { name: /案件A/ })).toBeVisible();
});
```

- Each `await` line is one numbered step of `UC.md`'s `## 主シナリオ`; the final `expect` is its `成功時` post-condition. **Nothing else** — no extra navigation, no assertion the scenario does not state.
- **The pending marker is `test.fixme(...)`**: the test is filed Red in meaning but skipped by the runner until the FE wiring lands. The FE-wiring implementer replaces `test.fixme` with `test` and drives it green. `test.fail` is not used (a scenario that "passes by failing" hides a wired-but-wrong screen).
- **No `@covers`** on a scenario test. **No `page.waitForTimeout`**; Playwright's auto-waiting and web-first assertions do the waiting.

---

## 3. The locator ladder (derived, never discovered)

Both the scenario test and the appearance derive locators from the same SSOT, so neither reads the other (ADR-0037).

| Rung | Locator | Derived from |
| --- | --- | --- |
| 1 | `getByRole(role, { name })`, `getByLabel(text)` | the **glossary term** (`docs/01-glossary.md`) — the term itself, never a synonym; the role from what the control is (a button, a link, a textbox, a row) |
| 2 | `getByTestId(id)` | the **contract**: a control that fires operation `renameUser` → `data-testid="renameUser"`; the input for its request field `name` → `data-testid="renameUser.name"` |
| never | CSS selectors, XPath, `nth()`, text copied from the screen as an id | — |

Use rung 1 whenever the wording is unambiguous on the screen; fall to rung 2 when two controls share a name. **If the appearance disagrees, the appearance moves** — a scenario test is never edited to follow an implementation.

---

## 4. Deterministic in a browser

| Source of wobble | How to handle it |
| --- | --- |
| Shared accounts and leftover data | one disposable account or a seeded fixture per run, declared by the host; never depend on a previous test |
| Animations and transitions | never wait for them; assert the end state with a web-first assertion |
| Real time | freeze it through the app's own injection point or `page.clock` where the scenario depends on it |
| Retries | `retries` may be set for CI, but a scenario that needs a retry to pass is a finding, not a fix |

Tests **never depend on order**. One scenario per UC means one `test` per file; do not chain scenarios across files.

---

## ✅ Checklist before returning

- [ ] Exactly one `test` for the UC, titled `UC-nnn …`, with `// @scenario UC-nnn` on the line above, and `test.fixme` as the pending marker?
- [ ] Does every action map to a numbered step of `## 主シナリオ`, and the last assertion to `成功時`?
- [ ] Are all locators rung 1 (glossary term) or rung 2 (operation / `operation.field`)? No CSS, XPath, `nth()`?
- [ ] Is `e2e/` excluded from the default suite's discovery, and `tests.system.dirs` disjoint from `tests.dirs`?
- [ ] Did you run only this test (`--grep "UC-nnn"`) and `trace-check --only C15`?
