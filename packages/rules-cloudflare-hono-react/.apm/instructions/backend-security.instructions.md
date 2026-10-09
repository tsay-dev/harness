---
description: "Hono / Workers — session, CSRF, authorization, and WebSocket security boundaries"
applyTo: "apps/api/src/**,apps/web/src/lib/api-client.ts,apps/web/src/features/auth/**,**/tests/backend/**,**/tests/integration/**"
---

# Hono / Workers — security

Apply at authenticated / untrusted boundaries described in [backend coding](backend-coding.instructions.md). Same-origin deployment is not a substitute for security checks.

## Sessions and HTTP

- Prefer server-managed sessions carried by cookies with `HttpOnly`, `Secure` in HTTPS environments, and a deliberate `SameSite` policy. Scope path / domain narrowly; use a host-only cookie where possible.
- Rotate session identifiers at authentication transitions, enforce expiry and revocation server-side, and invalidate the session on logout. Do not place session credentials in browser local storage or URLs.
- For cookie-authenticated unsafe requests, verify `Origin` against the configured public origin and implement the host's CSRF token / trusted-source policy where needed. Reject unexpected or absent origins unless the contract defines a separate authenticated non-browser flow. Never treat CORS or `SameSite` alone as the whole CSRF defense.
- Keep GET / HEAD safe. Handle login CSRF and logout transitions deliberately; do not defer all checking until after an expensive operation.
- Authenticate at the entry, then authorize the resource / tenant / action at the use case. A guessed ID or authenticated user is not authorization. Never trust an input owner / tenant field as the actor identity.
- Apply payload limits and appropriate rate limits before expensive parsing or writes. Do not log credentials or return security-sensitive details in errors.

## WebSockets

- Authenticate the upgrade and verify the browser `Origin` against the configured public origin. Define separate authentication rules for supported non-browser clients; missing origin is not automatic trust.
- Authorize the target before selecting / forwarding to a Durable Object. Use a trusted internal path for actor identity; never accept an arbitrary client-supplied actor header as verified identity.
- Recheck operation-level authorization for messages. Enforce session expiry / revocation and membership changes during long-lived connections, with a declared maximum revalidation delay and disconnection behavior.
- Do not place long-lived credentials in query strings. Validate each frame's schema, size, and supported operation before dispatch; bound message rates and outbound queues.
- A private Object ID or stub does not authenticate the caller. Ensure all externally reachable paths enforce the same boundary.

For connection lifetime / resumption read [realtime](backend-realtime.instructions.md); for cache isolation read [frontend data flow](frontend-dataflow.instructions.md); for uploads read [storage](backend-storage.instructions.md).
