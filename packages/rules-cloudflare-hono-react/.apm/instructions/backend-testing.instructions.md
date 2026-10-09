---
description: "Hono / Workers — backend contract tests and local binding integration checks"
applyTo: "**/*.test.ts,**/*.spec.ts,**/__tests__/**,**/tests/backend/**,**/tests/integration/**,**/vitest.config.*"
---

# Hono / Workers — backend testing

Follow [common testing](common-testing.instructions.md) for entry mapping, suite separation, annotations, and execution.
This leaf applies to backend / platform checks, not browser scenario specifications.

## Default suite

| Target | Test boundary |
| --- | --- |
| Pure business functions | Pure calculations and invariant partitions without framework / binding mocks |
| Service | Inject repository / service ports; assert scenario outcomes, not adapter internals |
| Hono entry | Exercise the declared feature route factory with `Request`; fake infrastructure at the boundary |
| Message processing | Validate frames and invoke the declared message-handler port with fake persistence / delivery |

- Derive behavior from fixed contracts and REQ partition classes. Do not import a handler just because implementation happened to export it.
- Invalid HTTP input must not invoke the service. Check validation errors, identity / authorization rejection, successful invocation, and outcome-to-status / DTO mapping.
- Check unsafe-request Origin / CSRF behavior, rejected WebSocket upgrades, expired or revoked permissions, duplicate request keys, and unknown API responses where required by the contract.
- Do not mock the pure business functions or hide missing authorization with an always-successful fake. A permission test must exercise the real policy decision with controlled boundary data.
- Keep database access, real network, workerd startup, and browser launch out of default discovery. BE contract-conformance cases remain in the default suite even when adapters also have integration tests.

## Local runtime integration

- Run with workerd and local bindings through the Cloudflare-supported test integration. Isolate storage per test / run, explicitly seed fixtures, and never connect to production identifiers.
- For D1, apply the actual migration files before queries. Check constraints, conditional updates, batch rollback, and dialect-dependent SQL where the change relies on them.
- For Durable Objects, exercise namespace routing, persistent state after reconstruction, WebSocket callbacks / attachment restoration, deduplication, resume gaps, and concurrency boundaries relevant to the contract.
- Do not claim hibernation / restart coverage from a test that only reuses one live in-memory instance. State emulator limitations and add an explicit disposable-environment check if local tools cannot reproduce the required behavior.
- For R2, cover authorized access, validation / finalization, missing objects, and retry / cleanup behavior. Presigned browser CORS needs its own endpoint-level verification where the local runtime cannot model it.
- Verify Worker / assets dispatch in the actual configured local preview: API failures must not become an HTML SPA success. Keep these protocol checks out of the one-main-scenario browser suite.
- A successful local check does not prove production limits, deployment permissions, or remote service availability. Report which runtime and bindings were exercised.

Persistence rules are in [D1](backend-database.instructions.md), [realtime](backend-realtime.instructions.md), and [storage](backend-storage.instructions.md).
