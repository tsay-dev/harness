---
description: "Durable Objects — WebSocket hibernation, durable state, delivery, and recovery"
applyTo: "apps/api/src/features/**/*.do.ts,apps/api/src/features/**/*.schema.ts,apps/api/src/features/**/*.routes.ts,apps/api/src/index.ts,**/wrangler.toml,**/wrangler.json,**/wrangler.jsonc,**/tests/integration/**"
---

# Durable Objects — realtime

Apply only when Durable Objects are selected. Follow [backend boundaries](backend-coding.instructions.md) and [WebSocket security](backend-security.instructions.md).

## Lifecycle and storage

- Declare the namespace binding, exported class, and ordered migrations; use `new_sqlite_classes` for new SQLite-backed classes. Class migration declarations do not replace the Object's application schema migrations.
- Keep each Object class in its feature's `*.do.ts` and its SQLite schema / versioned migration initializer in the adjacent `*.schema.ts`. These are independent of D1's `db/schema/` and `apps/api/migrations/`.
- Default to `ctx.storage.sql` for Object-local SQLite. D1 Drizzle repositories and migration commands do not govern this store; adopting a separate ORM adapter requires an explicit host decision.
- Treat constructor reruns and hibernation as normal. Persist authoritative state in storage; rebuild ephemeral indexes / caches without assuming memory survived.
- For hibernatable WebSockets, accept the server socket with `ctx.acceptWebSocket`, handle the Object's WebSocket callbacks, and store the minimum resumption metadata with attachments. Do not use ordinary `socket.accept()` while claiming hibernation behavior.
- Restore connection metadata from attachments / storage and current authorization state. Attachments last only for the live socket; durable records belong in storage. Do not freeze an expired permission for the life of a socket.
- Run short, versioned, reentrant-safe SQLite initialization under `blockConcurrencyWhile`, without external I/O. Do not assume arbitrary operations remain isolated across `await`; use supported storage transactions / concurrency controls for the invariant in question.
- Native WebSocket ping / pong control frames are handled by the platform. `setWebSocketAutoResponse` is for a defined application-level request / response heartbeat; do not confuse the two.

## Delivery contract

- Define event IDs, per-stream ordering, cursor semantics, and idempotency keys in the contract before implementing clients.
- Persist an accepted event before acknowledging its durable acceptance. Define what happens if persistence succeeds but acknowledgment / broadcast fails.
- Deduplicate retries and bound outbound queues; reconnect with capped exponential backoff and jitter. Backoff alone does not recover missed messages.
- Define resume-from-cursor and a consistent history / live handoff so overlap neither loses nor duplicates events. Specify snapshot or reset behavior when the cursor falls outside retention.
- Treat disconnects, duplicate frames, delayed frames, process restart, and partial broadcast as expected states. Use local integration tests to check storage and hibernation-dependent behavior.
- Cross-Object or Object-to-D1 updates are distributed work. Choose a source of truth and idempotent retries / reconciliation; do not claim cross-store atomicity.

The host chooses Object partitioning (including whether one room equals one Object), retention, search, fanout limits, and storage placement. They are not stack-wide defaults.
The browser's cache / event reconciliation belongs to [frontend data flow](frontend-dataflow.instructions.md).
