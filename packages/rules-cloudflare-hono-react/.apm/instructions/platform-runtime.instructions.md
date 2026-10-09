---
description: "Cloudflare Workers — runtime compatibility, bindings, secrets, and environment configuration"
applyTo: "**/wrangler.toml,**/wrangler.json,**/wrangler.jsonc,**/vite.config.*,**/worker-configuration.d.ts,apps/api/src/**,**/tests/integration/**,**/vitest.config.*"
---

# Cloudflare Workers — runtime

Follow [common coding](common-coding.instructions.md). This leaf governs Worker runtime assumptions, not application policy.

## Runtime and toolchain

- Use the Cloudflare Vite plugin for the Vite / Workers development flow. Record the actual dev, build, preview, deploy, and type-generation commands in the host.
- Pin a deliberate `compatibility_date`. Add `nodejs_compat` only for required APIs; verify each dependency in workerd. The flag does not provide a normal Node process, persistent local disk, or every Node API.
- Run checks against the Worker build as well as the browser build. Passing Node-based unit tests does not establish Workers compatibility.
- Generate environment types with the host's `wrangler types` command for its selected configuration and environment. `apps/api/src/types/env.ts` composes the generated bindings with Hono variables; do not maintain conflicting handwritten binding declarations.
- Declare D1, optional Durable Object namespaces, optional R2, and assets bindings for each required environment. Confirm non-inherited environment settings explicitly; never assume preview and production share identifiers.

## Bindings and secrets

- Receive bindings through Worker / Hono context and compose infrastructure at the request boundary. Never read per-request secrets from a module-level singleton or leak request / user state across requests.
- Use Cloudflare secrets for sensitive deployed values and ignored local configuration for development. Commit names and examples without values; never put credentials in `vars` or source control.
- Every `VITE_*` value is public browser build input. No signing keys, service credentials, database access, or admin tokens belong there.
- Do not serialize bindings into API responses, browser props, logs, or exception reports. Redact tokens and personal data from structured logs.

## Lifetime and resource limits

- Await writes that determine request success. `waitUntil` extends work after the response but is not a durable job queue; use an appropriate persistent mechanism when completion must survive failure.
- Module memory is a cache only. Define limits for body size, payloads, concurrency, and upstream timeouts; cancel abandoned work where supported.
- `limits.cpu_ms` limits CPU time, not wall time or total billing. Requests, storage, network, and other services need their own operational controls.
- Keep plan selection, budget, retention, regions, and resource identifiers in host configuration / ADRs.

For asset dispatch read [routing](platform-routing.instructions.md); for persistence read [D1](backend-database.instructions.md) or [Durable Objects](backend-realtime.instructions.md).
