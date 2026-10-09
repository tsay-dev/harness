---
description: "Cloudflare / Hono / React — test suites, contract entry mapping, and develop wiring"
applyTo: "**/*.test.ts,**/*.test.tsx,**/*.spec.ts,**/*.spec.tsx,**/__tests__/**,**/tests/**,**/e2e/**,**/vitest.config.*,**/playwright.config.*,apps/api/src/index.ts,apps/api/src/features/**/*.routes.ts"
---

# Cloudflare / Hono / React — test wiring

This package specializes the `develop-core` testing process, not its gates or producer / judge responsibilities.
Follow [common coding](common-coding.instructions.md); backend cases are in [backend testing](backend-testing.instructions.md), browser scenarios in [system testing](system-testing.instructions.md).
No frontend unit-testing leaf is supplied: develop does not file frontend unit tests.

## Suites and commands

| Suite | Runtime and boundary | Default address |
| --- | --- | --- |
| Default | Vitest, pure business functions / services / Hono HTTP with injected boundary fakes; no live bindings or browser | `tests/backend/` or colocated `*.test.ts` |
| Integration | Cloudflare Workers Vitest integration running in workerd with local D1 / DO / R2 bindings; no production resources | `tests/integration/` |
| System | Playwright against the real SPA + Worker scenario environment | `e2e/` |

- Separate suite discovery by folder / runner configuration. Exclude integration and system addresses from the default suite; default tests pass without starting workerd, a database, or a browser.
- Record full and UC-filtered commands in host guidance; declare `commands.test` and, when used by the terminal gate, `commands.system` in `traceconfig.json`. Record the separate integration command and run it at relevant boundaries / CI.
- Use the Cloudflare-supported Vitest integration compatible with the pinned toolchain. A Node mock of a binding is not a workerd integration check.
- Use the declared commands; do not invent a contract adapter command. `commands.contract_adapter` is an explicit host capability, not automatically provided by Hono RPC.
- Changes in directory layout require the host delivery mapping in [common coding](common-coding.instructions.md) and matching `traceconfig.json` test discovery.

## Operation → entry (derive without reading implementation)

Before independent test / implementation work starts, the host declares each operation's feature, route mount prefix, runtime-independent route factory path / export, dependency shape, and test-fixture provider.
The default file is `apps/api/src/features/<feature>/<feature>.routes.ts`; its factory export (for example `createChatRoutes`) and injected repository / service boundary are fixed in that declaration. A factory may return the same chained routes used by production assembly; it must not import Object classes or require live bindings at import time.
The test assembles that route factory under the declared mount prefix and derives the full URL from the contract. Never require the default Node suite to import `apps/api/src/index.ts`: its Durable Object exports can load `cloudflare:workers`.
The app assembly, middleware installation, mount prefixes, and real bindings are verified separately in workerd integration. The host also registers actual source / schema / test addresses and commands in its supported trace configuration; directory layout does not change develop's gates or roles.

| Contract transport | Test entry | Invocation |
| --- | --- | --- |
| `http` | Declared feature route factory with injected boundary fakes | Mount the factory result in a test Hono app using the declared prefix. Build a `Request` from `wire.method`, `wire.path`, and the contract example; call `app.request(request)`. Assert public HTTP status / headers / body. |
| `internal` | Host-declared operation-to-port module / export and argument mapping | Invoke the symbol derived from that mapping and the operation name, not a symbol found by inspecting implementation. |
| WebSocket / streaming wire | Host-declared handshake address, frame mapping, and local-runtime client or adapter | Derive upgrade and frames from the contract; default tests cover injected message handling, integration tests cover actual transport. |
| Any supported operation via `commands.contract_adapter` | Host-declared adapter | Pass the operation name and example using the adapter protocol; do not import an implementation-discovered symbol. |

Missing mappings are a prerequisite to fill in with the host / contract author. Do not guess an API filename from a route string or change tests to match a misplaced implementation.

## Tags and determinism

- Default / integration cases use an outer group `UC-nnn <title>` and a first-line `// @covers REQ-nnn#class` in each test body, with that class declared in the REQ. Scenario tests use their separate annotation below.
- Inject / fix time and randomness, fake only external boundaries, and clean up shared state. Never use real-time sleeps to synchronize tests.
- Write test titles and comments in Japanese. Preserve one behavior per test and failure / empty / permission / boundary partitions from the develop process.
- Scoped runs and whole-suite timing follow develop's playbook; coverage percentages are signals, not completion criteria.
