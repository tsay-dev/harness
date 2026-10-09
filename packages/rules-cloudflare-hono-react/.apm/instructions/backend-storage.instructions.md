---
description: "R2 — private objects, authorized uploads / downloads, and consistency"
applyTo: "apps/api/src/features/**/*.repository.ts,apps/api/src/features/**/*.routes.ts,apps/api/src/features/**/*.service.ts,apps/api/src/lib/**,apps/web/src/features/**/api/**,**/wrangler.toml,**/wrangler.json,**/wrangler.jsonc,**/tests/integration/**"
---

# R2 — object storage

Apply only when R2 is selected. Use the boundaries in [backend coding](backend-coding.instructions.md) and the authorization policy in [security](backend-security.instructions.md).

- Keep application-owned private content in private buckets. Do not enable a public bucket / domain to bypass authorization or browser CORS failures.
- Authorize reads and writes for the actor, tenant, resource, and object before using the binding or issuing a signed capability. An opaque object key is not an authorization mechanism.
- Generate object keys server-side; keep tenant ownership in authoritative metadata. Do not use a user filename as a trusted storage path or ownership claim.
- Bound file size, accepted content types, and upload rate. Validate actual content / metadata as required by the contract, not only the supplied extension or `Content-Type` header.
- Serve downloads with deliberate content type, disposition, and caching headers. Prevent user-provided active content from executing under the application origin.
- Do not expose R2 credentials or Worker bindings to the browser. Use an authenticated Worker upload / download path by default.

## Optional direct uploads

- A presigned S3 API URL is a time-limited bearer capability: restrict the method and object, use a short expiry, and avoid logging it. Generate it only after authorization.
- Direct browser uploads to an R2 S3 endpoint are cross-origin even when the application API is same-origin. Configure bucket CORS for the exact application origins, methods, and required headers; CORS is not authorization.
- Do not assume presigned URLs work on an arbitrary R2 custom domain or provide one-time use. Confirm supported endpoints and signing behavior for the selected flow.
- Finalize uploads through the server: check object ownership, existence, size, and required validation before publishing its metadata. Enforce cleanup for abandoned / rejected uploads and use a quarantine stage where needed.
- R2 object writes and D1 metadata writes are not one transaction. Use idempotent finalization and reconciliation rather than claiming an atomic upload.

The host declares retention, deletion, scanning, public distribution exceptions, and any upload capabilities. Verify the selected flow in [integration tests](backend-testing.instructions.md).
