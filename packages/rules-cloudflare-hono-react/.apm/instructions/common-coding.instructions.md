---
description: "Cloudflare / Hono / React — stack scope, source boundaries, and shared coding rules"
applyTo: "apps/web/src/**,apps/api/src/**,packages/shared/src/**,**/tsconfig*.json,**/vite.config.*,**/wrangler.toml,**/wrangler.json,**/wrangler.jsonc,**/drizzle.config.*,**/worker-configuration.d.ts"
---

# Cloudflare / Hono / React — common coding

This package applies only to the host-declared Cloudflare Workers + Hono + React SPA stack.
Select it independently, normally with `develop-core`; it does not inherit `rules-next`.
Rules bind the selected application, not unrelated units of a monorepo. Discard a leaf outside that scope.

## Stack and host facts

- Workers + Static Assets serve a Vite React SPA and Hono API on the same origin.
- Use TanStack Router for browser routes, TanStack Query for server state, and Hono RPC for typed HTTP calls.
- Use Zod and `@hono/zod-validator` at HTTP input boundaries; use D1 with `drizzle-orm/d1` for relational persistence.
- Durable Objects and R2 are optional capabilities, not prerequisites for every application.
- The host `AGENTS.md` / `CLAUDE.md` declares the selected unit, actual paths, bindings, commands, and deviations. Versions belong in its manifests and lockfile.
- Do not assume RSC, Server Actions, or a persistent Node.js server. A change of stack requires a host design decision, not an accidental dependency.

## Source addresses and delivery

Use the feature-based layout below as the default. Match feature names on the browser, API, and shared-contract sides (for example `chat`, `auth`, `rooms`, `profile`). Keep `users` separate from `profile` only when they are different domain concepts.
The host may use other addresses, but must declare the role-to-address mapping before delegation.
Unmatched addresses need host-scoped neutral `applyTo` metadata pointing to the appropriate installed leaves, or explicit task-time delivery of those leaf paths to their writers. A Markdown link alone does not deliver a rule.
Do not patch installed provider output or create a resident rules index. Do not infer the layer from a bare `routes/` directory.

| Writer's address | Read when working there |
| --- | --- |
| `wrangler.*`, `vite.config.*`, `apps/api/src/index.ts`, generated environment types | [runtime](platform-runtime.instructions.md), [asset routing](platform-routing.instructions.md) |
| `apps/api/src/features/<feature>/<feature>.{routes,service,repository}.ts`, `middleware/**`, `types/env.ts` | [backend boundaries](backend-coding.instructions.md); [security](backend-security.instructions.md) at authenticated boundaries |
| `apps/api/src/db/{schema/*.ts,client.ts}`, feature repositories, `drizzle.config.*`, `apps/api/migrations/*.sql` | [D1 / Drizzle](backend-database.instructions.md) for database changes |
| `apps/api/src/features/<feature>/*.do.ts` and `*.schema.ts` | [realtime](backend-realtime.instructions.md) for Object classes and their local SQLite migrations |
| Feature repositories using R2 and their upload routes | [R2](backend-storage.instructions.md) when object storage is used |
| `apps/web/src/routes/**`, `features/<feature>/{api,components,hooks,lib,index.ts}`, shared UI / client libraries | [browser routing](frontend-routing.instructions.md), [data flow](frontend-dataflow.instructions.md) |
| `packages/shared/src/<feature>/schemas.ts` | [backend boundaries](backend-coding.instructions.md) for shared HTTP / WebSocket Zod contracts |
| tests and runner configuration | [test wiring](common-testing.instructions.md), then [backend](backend-testing.instructions.md) or [system](system-testing.instructions.md) |

## Shared coding rules

- Enable TypeScript strict checking for both runtimes. Keep browser and Worker compiler environments separate so browser code cannot silently use server globals.
- Never use `any`, non-null assertions, unchecked casts, or suppression comments to hide a contract mismatch. Narrow `unknown` at trust boundaries; report a conflict instead of rewriting the contract to fit implementation.
- Prefer named exports; runtime-mandated exports such as the Hono Worker default app and configuration defaults are exceptions. Avoid deep relative-import chains.
- React feature `index.ts` files are deliberate public APIs: external consumers use them, while feature internals import each other directly. This is an explicit barrel exception; do not add arbitrary re-export chains elsewhere.
- `packages/shared/src/<feature>/schemas.ts` contains browser-safe HTTP / WebSocket Zod schemas and inferred public types. Its root `index.ts` explicitly exposes selected public contracts only; internal modules must not import through that root and create cycles.
- Browser code must not import server runtime modules, bindings, database schemas, or secrets. Sharing a Zod contract does not justify sharing persistence or service implementation.
- A type-only import of the Hono application type is the limited server-source exception; it must erase from the browser bundle. See [backend boundaries](backend-coding.instructions.md).
- Formatting and import order follow the host formatter / lint command. Write comments and user-facing text in Japanese; identifiers follow the host vocabulary.
- Do not hand-edit generated route trees or binding declarations; regenerate them using the host command.
