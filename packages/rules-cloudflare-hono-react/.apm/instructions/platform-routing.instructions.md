---
description: "Cloudflare Static Assets — Worker dispatch, API errors, and SPA fallback"
applyTo: "**/wrangler.toml,**/wrangler.json,**/wrangler.jsonc,**/vite.config.*,apps/api/src/index.ts,apps/api/src/features/**/*.routes.ts,apps/web/public/_headers,apps/web/public/_redirects,**/tests/integration/**,**/e2e/**"
---

# Cloudflare — asset and API routing

Follow [runtime](platform-runtime.instructions.md). This leaf owns network dispatch; browser route state belongs to [frontend routing](frontend-routing.instructions.md).

- Serve the SPA and HTTP API from the same public origin. Reserve `/api/*` and a declared WebSocket namespace such as `/ws/*`; declare any different prefixes in the host before implementing either side.
- Configure Static Assets `not_found_handling` for SPA navigation and `run_worker_first` so every API / WebSocket request reaches the Worker. Use the supported selective patterns or Worker-first handling for the pinned Wrangler version; handle prefix roots such as `/api` and `/ws` explicitly.
- Dispatch API and WebSocket namespaces before assets. An unknown API returns its contract's HTTP error, normally a JSON 404; it must never fall through to `index.html` with status 200.
- A failed WebSocket upgrade remains an error. Do not send it to the SPA fallback or return an unauthenticated upgrade.
- For browser routes, direct navigation and refresh resolve to the SPA entry. Test the deployed asset routing behavior in local preview, not only Vite's browser dev server.
- Protect API responses with Worker response headers. Static asset `_headers` / `_redirects` rules do not automatically govern responses produced by Worker code.
- Content-addressed assets may be cached immutably; keep the HTML shell updateable. Do not cache private API responses in shared caches without a deliberately authorized cache design.
- Avoid permissive CORS for the same-origin API. Cross-origin capabilities such as direct R2 upload have their own explicit contract in [storage](backend-storage.instructions.md).

## Boundary verification

In integration checks, assert API success and failure status / content type, unknown API 404, rejected upgrade, direct SPA navigation, and static asset delivery.
Keep protocol failures in backend / integration tests; the browser suite remains the UC's main scenario under [system testing](system-testing.instructions.md).
