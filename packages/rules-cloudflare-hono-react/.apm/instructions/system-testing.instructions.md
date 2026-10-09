---
description: "React SPA / Workers — Playwright use-case scenarios against the real application"
applyTo: "**/e2e/**,**/playwright.config.*"
---

# React SPA / Workers — system testing

Follow [common testing](common-testing.instructions.md). This leaf wires develop's one-main-scenario-per-UC rule to Playwright; it does not introduce a second frontend unit suite.

## Environment and discovery

- Use `@playwright/test` in `e2e/` with `playwright.config.ts`. Host overrides update both delivery mapping and `traceconfig.json` `tests.system.dirs`.
- Run the real SPA and Hono Worker on the configured same origin, backed by disposable local / scenario bindings. Declare `webServer`, seeded fixtures, and the startup command in the host; do not substitute mocked API responses.
- Keep `tests.system.dirs` disjoint from `tests.dirs` and exclude it from Vitest's default discovery.
- Declare the whole-suite command as `commands.system` when included in the terminal gate; CI runs the suite. Declare the UC selection command, normally `playwright test --grep "UC-nnn"` through the host's package runner.

## Scenario shape

- One file and one `test` per UC, titled `UC-nnn <UC title>`. Place `// @scenario UC-nnn` immediately above the test declaration; scenario tests have no `@covers` tag.
- Derive actions from the numbered steps of `UC.md`'s `## 主シナリオ` and the final assertion from `成功時`. Do not extend the scenario with failure partitions or implementation-discovered navigation.
- Before frontend wiring, file it as `test.fixme`; the frontend implementer replaces that marker with `test` and makes it pass. Never use `test.fail` to hide an unfinished scenario.
- Do not add extra browser tests for protocol edge cases to this suite. Those belong in [backend testing](backend-testing.instructions.md).

## Locators and determinism

- Derive locators using the [shared appearance / scenario contract](frontend-routing.instructions.md), delivered to both writers. That leaf is the single source for semantic labels, test IDs, and independent derivation.
- Use Playwright auto-waiting and web-first assertions, never `waitForTimeout`. Set up disposable accounts / data independently; scenarios must not depend on execution order.
- Control time where the scenario depends on it. Treat a pass requiring retries as a finding, not a fix.
- Write titles and comments in Japanese. Deep-link behavior follows [asset routing](platform-routing.instructions.md), and rendered state follows [frontend data flow](frontend-dataflow.instructions.md).
