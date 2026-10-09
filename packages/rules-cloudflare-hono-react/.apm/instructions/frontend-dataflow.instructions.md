---
description: "React SPA / TanStack Query — server cache, HTTP failures, mutations, and realtime reconciliation"
applyTo: "apps/web/src/**,packages/shared/src/**"
---

# React SPA — data flow

Follow [common coding](common-coding.instructions.md) and [browser routing](frontend-routing.instructions.md). TanStack Query owns cached server state; it is not the authority for persisted data.

## HTTP and cache ownership

- Place the shared typed Hono `hc<AppType>` client in `apps/web/src/lib/api-client.ts` and the Query client in `lib/query-client.ts`. Put HTTP calls, query options, and Query / mutation hooks such as `useMessages` / `useSendMessage` in `features/<feature>/api/`. Use the feature's `hooks/` for socket / lifecycle hooks such as `useChatSocket`. Expose only the necessary public interface through its `index.ts`. Use the client as described in [backend coding](backend-coding.instructions.md). Keep same-origin API calls on the application origin; supply cookies and CSRF material according to [security](backend-security.instructions.md).
- `fetch` / Hono RPC does not reject every non-2xx response. Query and mutation functions must check status, decode the declared error, and throw an appropriate error for failed operations so Query can enter its error state.
- Define stable query keys including every input that affects the result and the relevant actor / tenant scope. Invalidate / remove sensitive caches and cancel outstanding work when logging out or switching identity; stale responses must not repopulate another session's data.
- Reuse query options across routes and components. Do not fetch into `useEffect` + `useState` as a second server cache, or copy server lists into local state.
- Configure staleness, retries, cancellation, and focus / reconnect behavior deliberately. Do not retry permission failures or non-idempotent mutations blindly.
- After mutations, invalidate affected keys or update them from authoritative responses. Optimistic updates require rollback, concurrent-mutation handling, and a stated reconciliation rule.

## UI state and events

- Keep ephemeral UI state near its owner; lift it only when multiple children need it. Pass data downward and events upward through callbacks.
- An editable draft may copy initial server data, but must define when it resets and how incoming updates / version conflicts affect unsaved input.
- Keep shareable state in the router's validated URL parameters. Do not store secrets or session credentials in persisted client state.
- Expose loading, error, empty, and stale states explicitly; disable or otherwise handle duplicate submits without relying on UI behavior for server idempotency.

## Optional realtime

- Feed authorized realtime events into the same Query cache; do not create an independent authoritative message list.
- Reconcile by the contract's event ID, order, and cursor. Account for live events arriving before / during / after a history fetch and reject duplicate or obsolete updates.
- On reconnect or detected gaps, resume / fetch the missing range or reset from a snapshot according to the contract. Invalidate when a safe incremental merge is impossible.
- Dispose sockets and subscriptions on scope changes, reauthenticate on reconnect, and isolate events from an old user / resource. Browser backoff cannot replace server-side recovery semantics in [realtime](backend-realtime.instructions.md).
