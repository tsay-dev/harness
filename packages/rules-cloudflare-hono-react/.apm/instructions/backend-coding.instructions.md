---
description: "Hono — feature routes, services, repositories, and typed RPC contracts"
applyTo: "apps/api/src/**,packages/shared/src/**,**/tests/backend/**,**/tests/integration/**"
---

# Hono — feature boundaries

Follow [common coding](common-coding.instructions.md). HTTP reads and writes enter through Hono; browser code never calls server services directly.

## Feature structure and responsibilities

Use `apps/api/src/features/<feature>/<feature>.routes.ts`, `<feature>.service.ts`, and `<feature>.repository.ts`.
The runtime flow is **routes → service → repository**. These are responsibilities, not a demand for more abstract layers.

| File / responsibility | Contains | Excludes |
| --- | --- | --- |
| `*.routes.ts` | HTTP validation, identity, service invocation, response mapping | inline SQL, substantive business decisions |
| `*.service.ts` | use-case coordination and pure business functions | Hono context, Worker bindings, Drizzle builders, transport response construction |
| `*.repository.ts` | persistence and external I/O through injected dependencies | business policy, calling back into routes |
| `middleware/auth.ts`, `middleware/error-handler.ts` | reusable request identity / error boundary | feature business flow |
| `types/env.ts` | generated bindings plus typed Hono variables | duplicate manual binding definitions |

- A service fulfills develop's use-case role. Do not mandate dedicated `UseCase`, DTO, domain directories, interfaces, or classes just to fit a pattern.
- Keep pure business functions separate from side-effect orchestration within a service; extract a feature-local module when it clarifies the code. Inject time / randomness for decisions that need them.
- Backend logic owns routes / services / repositories. Schema work owns native persistence schemas and migrations. Frontend logic owns browser wiring; frontend appearance owns presentation.
- Services depend on injectable repository boundaries and pure functions. Feature services must not directly couple to another feature's service; supply necessary collaboration through composition, with shared concepts extracted only when the domain supports it.
- `apps/api/src/index.ts` assembles middleware and feature routes, exports the inferred `AppType`, exports the Hono app as default, and exports Durable Object classes by name. It may import feature route / Object modules directly; the React public-index restriction does not apply here.
- Keep `cloudflare:workers` and Object-class imports out of route / service modules needed by Node's default test suite. The Worker assembly and actual binding behavior are checked in workerd.

## Input, output, and shared contracts

- Validate body, params, query, and required headers using Zod / `@hono/zod-validator` before calling the service. Validate WebSocket frames at their own trust boundary.
- Share HTTP / WebSocket schemas through `packages/shared/src/<feature>/schemas.ts`; infer public types there. Database schemas, rows, service implementation, and bindings do not belong in the shared package.
- Parsing a Zod object does not establish permission or persisted business invariants. Enforce these in service-level decisions with controlled repository input.
- Map service outcomes to deliberate HTTP statuses and public response shapes. Dedicated DTO classes are unnecessary; raw database rows, internal errors, secrets, and stacks are not public contracts.
- Use stable contract error codes. Catch unexpected failures at the middleware boundary, log safely with correlation identifiers, and return generic public errors.

## Handler composition and Hono RPC

- Declare handlers inline in chained Hono routes or use `createFactory().createHandlers()` when extracting reusable handlers. Do not introduce Rails-style Controller classes or untyped extracted handlers that lose validator inference.
- Preserve the type of the chained route result; deriving `AppType` from a bare app variable that lost those return types silently drops routes from RPC.
- Derive the exported `AppType` from the fully composed application. The browser uses `hc<AppType>` with an erased `import type`, never a runtime import of server modules.
- If splitting the client by `hc<typeof subRoutes>`, make the client base URL include the mounted prefix omitted from that subroute type. Account for both `.basePath(...)` and `.route(prefix, subRoutes)`; avoid double-prefixing paths already included in the inferred type.
- `app.onError` / global middleware responses are not automatically part of every inferred route response union. Handle those runtime responses explicitly and model shared errors deliberately; do not assert the RPC type makes them impossible.
- RPC typing is not runtime validation or authorization. Check browser bundling removes server imports and typecheck covers actual client calls.

Test entries and dependency injection are declared before implementation under [test mapping](common-testing.instructions.md).
Read [security](backend-security.instructions.md), [D1](backend-database.instructions.md), and optional [realtime](backend-realtime.instructions.md) / [storage](backend-storage.instructions.md) for boundary details.
