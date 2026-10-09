---
description: "D1 / Drizzle — schemas, reviewed SQL migrations, queries, and atomicity"
applyTo: "**/drizzle.config.*,apps/api/migrations/**,apps/api/src/db/**,apps/api/src/features/**/*.repository.ts,**/wrangler.toml,**/wrangler.json,**/wrangler.jsonc,**/tests/integration/**"
---

# D1 / Drizzle — persistence

This leaf applies to D1-backed relational persistence. Follow [backend boundaries](backend-coding.instructions.md); Durable Object SQLite is a separate store under [realtime](backend-realtime.instructions.md).

## Schema and migration ownership

- Use Drizzle's SQLite schema definitions as the schema source and `drizzle-orm/d1` over the actual D1 binding for runtime queries.
- Put D1 schemas in `apps/api/src/db/schema/*.ts`, client construction in `db/client.ts`, and queries in each feature's `<feature>.repository.ts`. Services and browser modules must not expose D1 types, Drizzle query builders, or inferred row types as public contracts.
- Generate versioned SQL with Drizzle Kit into `apps/api/migrations/`, review it, and commit it together with schema changes. Use this same host-declared directory in the generator and Wrangler's D1 migration configuration.
- Apply migration files through the host's declared D1 migration workflow, explicitly selecting local / preview / production and its binding. Normal production deployment does not use schema `push` or unreviewed ad hoc changes.
- Test migration from a fresh database and from the preceding supported schema. Separate destructive steps, backfills, and rollout compatibility; record recovery procedures before production application.
- Do not rewrite an already applied migration to hide drift. Generated SQL still needs review for constraints, defaults, indexes, data preservation, and D1 support.

## Queries and consistency

- Inject a repository boundary into services. Parameterize SQL; any necessary raw SQL remains in the repository with a clear reason and bounded result size.
- Choose indexes from filtering, joins, ordering, selectivity, and query plans. Avoid unbounded reads and N+1 queries; define stable pagination ordering and tie breakers.
- Use database constraints to enforce persisted invariants, including uniqueness and references. Encode concurrent updates using supported conditional SQL or an explicit concurrency strategy.
- Do not assume a general interactive transaction API is supported by D1. For multi-statement atomic work, use the D1 / Drizzle batch behavior actually supported by pinned versions and verify rollback on failure.
- A read followed by a separate batch is not automatically isolated from competing writers. If the decision depends on the read, use conditional writes / constraints or redesign the serialization boundary.
- If D1 read replication is enabled, declare the required consistency and use the supported session / bookmark mechanism where read-after-write is needed.
- D1 and a Durable Object cannot share an atomic transaction. Define the authoritative record, idempotent propagation, retry, and repair for any cross-store update.
- Drizzle does not make SQLite schema or queries automatically portable to PostgreSQL. Keep dialect assumptions explicit; a database migration is a separate design and validation task.

Use [backend testing](backend-testing.instructions.md) for local D1 integration checks; unit tests substitute the repository boundary.
