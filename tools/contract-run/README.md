# contract-run

A zero-dependency Node tool bundled with the harness that **executes** the boundary contracts against the
host implementation. `../spec-lint/` proves a contract has the right *format*; `../trace-check/` proves the
*references* between docs and code resolve; this tool closes the remaining gap — that the implementation
actually answers the way the contract says it does.

## What it checks

Every `fixed` contract (`docs/goals/**/UC-*/contract.yaml`) already carries `examples` with real values: at
least one success and, for every `errors[].code`, one failure per operation (spec-lint enforces this). Those
examples are the fixtures. contract-run feeds each one to the implementation through a **host-written
adapter process**, and judges the reply against the example:

- a success example (`response:` and no `error:`) must come back as a response whose shape contains the
  example's response (subset match, see below)
- a failure example (`error: CODE`) must come back as an error with exactly that code

So the contract ↔ implementation link is checked by machine instead of by an agent reading both. What it
does **not** check is meaning: a `response: { status: ok }` that matches proves the shape, not that the REQ
behind it is satisfied. That remains the job of the tests declared in each REQ's `## 検証方針`.

## Usage

```bash
node tools/contract-run/contract-run.mjs [--root <host root>] [--config traceconfig.json] [--docs docs]
                                          [--uc UC-012 ...] [--all] [--include-external] [--json] [--timeout 120]
```

| Flag | Meaning |
| --- | --- |
| `--root` | Host root (default: the current directory). The adapter runs with this as its cwd |
| `--config` | `traceconfig.json` to read (default: `<root>/traceconfig.json`). Missing config is exit `2`; the tool never scans for it |
| `--docs` | Docs directory relative to root (default: `docs`); contracts are found under `<docs>/goals/**/UC-*/contract.yaml` |
| `--uc` | Only contracts whose `x-uc` matches (repeatable, or comma-separated) |
| `--all` | Run `draft` contracts too (default: only `x-status: fixed`) |
| `--include-external` | Run `owned: false` operations too (default: only `owned: true`). External boundaries are transcribed, not ours, so they are opt-in |
| `--json` | Print `{ results: [{uc, operation, case, verdict, detail}], summary: {pass, fail, skip} }` instead of text |
| `--timeout` | Seconds for the whole run, adapter included (default `120`) |

Text output is one line per example, then a summary:

```
pass  UC-012 createItem.ok
fail  UC-012 createItem.ok  items[0].status: 期待 "ok" / 実際 "pending"
pass  UC-012 createItem.invalid  error INVALID_INPUT
skip  UC-012 openItem.ok  reachable only through XCTest
pass 2 / fail 1 / skip 1 (skipped は検査されていない)
```

Exit codes: `0` = no `fail` (skips are allowed and listed) / `1` = at least one `fail` / `2` = configuration
or adapter error (missing `traceconfig.json`, an unparsable contract, adapter crashed / timed out / broke the
protocol). Operations under `operations: {}` are skipped silently. An example with neither `response` nor
`error` is itself reported as `fail` (a malformed example; it is never sent to the adapter).

When `commands.contract_adapter` is **not declared**, the tool prints

```
[contract-run] commands.contract_adapter 未宣言: 契約の実行検査は行われていない
```

and exits `0`. That line is a **skip, not a pass** — nothing was executed. It exists so a host can adopt the
rest of the harness before it has written an adapter, without pretending the link is verified.

## The adapter contract

The adapter is the only thing that knows how to reach the host's implementation. contract-run:

1. spawns `commands.contract_adapter` **once per run** (`shell: true`, `cwd` = host root),
2. writes **one JSON line per example** to its stdin, in contract order, then closes stdin,
3. reads its stdout **line by line**, matching replies to requests by `id`,
4. waits for it to exit.

Request line (one per example):

```json
{"id":1,"uc":"UC-012","operation":"createItem","transport":"http","direction":"outbound","owned":true,
 "auth":"bearer","wire":{"method":"POST","path":"/items","success":201},"entry":null,
 "request":{"title":"abc"},"case":"ok"}
```

`wire`, `entry`, and `request` are `null` when the contract does not have them. `auth` is the scheme name from
the contract (`none` or a `_shared` `authSchemes` key).

Reply line — exactly one of the three, with the request's `id`:

```json
{"id":1,"response":{"id":42,"status":"ok"}}
{"id":1,"error":"INVALID_INPUT"}
{"id":1,"skip":"reachable only through XCTest"}
```

Rules:

- Replies may arrive in any order, but every request needs exactly one reply. A missing, unknown, or duplicated
  `id`, a non-JSON line on stdout, a reply with none of `response` / `error` / `skip`, or a non-zero exit is an
  **adapter error**: exit `2`, with the last 20 lines of the adapter's stderr echoed for diagnosis.
- Anything the adapter prints for itself must go to **stderr**; stdout is the protocol channel.
- `skip` carries a one-line reason. It is counted and listed, never treated as a pass.
- The adapter does not need to read the contract; everything it needs to dispatch is in the request line.

## Writing an adapter

The adapter is host code and lives in the host repository (e.g. `scripts/contract-adapter.ts`). It is a
small dispatcher: read stdin line by line, pick the implementation by `operation` (and `uc` if names repeat
across UCs), call it, map the outcome to a reply. Guidance by stack:

- **Next.js** — import the route handler or server action directly and call it **in-process**: build a
  `Request` (or the action's argument) from `request`, run against an in-memory or transactional test
  database so examples do not depend on each other, and read the JSON body into `response`. Map a thrown
  domain error, or a returned error body, to the contract `code` (the host already has a single error-code
  source — `traceconfig.json`'s `contract.error_source` — so the mapping is usually a one-liner). Do not
  start the dev server and hit it over HTTP; the point is the shape of the boundary, not the network.
- **PHP (Crow / plain)** — bootstrap the framework once, include the module that owns the operation, and call
  its action function with the decoded `request`. Capture the returned array / thrown exception and map it
  to `response` / `error`. Use a transaction that is rolled back per example, or a throwaway database.
- **Swift / SwiftUI** — when an operation can be reached from a plain executable target (a use-case type in
  a SwiftPM library), call it there. When it can **only** be reached through XCTest (UI-bound code, device
  capabilities), reply `skip` with that reason for those operations. contract-run lists the skips; they are
  visible, not hidden, and a reviewer decides whether that debt is acceptable.
- **External boundaries** (`owned: false`) — run them only under `--include-external`, against a recorded
  fixture or a sandbox account, never against production. Reply `skip` when neither exists.

An adapter that answers every example with `skip` is legal and useless; the summary line makes that visible.

## Judgment rules

For a **success example** the reply must be a `response`, and `subset(example.response, reply.response)` must
hold:

- primitives (string / number / boolean / null) must be strictly equal (`===`),
- arrays must have the **same length**, and each element must be a subset of the element at the same index,
- objects: every key of the example must be present in the reply and be a subset of it; **extra keys in the
  reply are allowed** (the contract's `additionalProperties` is spec-lint's concern, not this tool's).

The first mismatch is reported by path: `items[0].status: 期待 "ok" / 実際 "pending"`; a missing key shows as
`実際 (無し)`; a length mismatch as `期待 長さ 2 / 実際 長さ 3`. An `error` reply to a success example fails
with `期待: 正常 / 実際: error CODE`.

For a **failure example** the reply must be an `error` with the **same code**. A `response` reply fails
(`期待: error CODE / 実際: 正常`); a different code fails (`期待: error A / 実際: error B`).

## Relationship to the other checks

| Tool | Proves | Does not prove |
| --- | --- | --- |
| `spec-lint` | the contract's format and lifecycle (vocabularies, `examples` present and consistent with `request`) | that any code exists |
| `trace-check` | references resolve: `@covers` / `@implements`, error codes ⊆ `_shared` `errorCodes` (C7), layering | that the code behaves |
| **`contract-run`** | the implementation answers each example with the contracted **shape** and **code** | the **meaning** of a REQ |
| tests (`## 検証方針`) | the REQ's semantics per partition class | — |

contract-run executes shapes. A green run plus green tests plus zero trace-check violations is the state
"docs and implementation agree within what machines can check".

## Declaration in `traceconfig.json`

```json
"commands": {
  "typecheck": "npx tsc --noEmit",
  "lint": "npx eslint .",
  "test": "npm test --silent",
  "contract_adapter": "npx tsx scripts/contract-adapter.ts"
}
```

The `commands` block is read by `tools/gate-hook` (the terminal gate) and by this tool only; trace-check
ignores it. Omit `contract_adapter` until the adapter exists — the tool then says so instead of guessing.

## Limits

- The adapter is host code: its correctness (right handler, isolated data, honest error mapping) is the host's
  responsibility. contract-run trusts what it is told.
- There is **no baseline file**. Execution results are not debt to be ledgered; a `fail` is fixed at the source
  (contract or implementation) or the example is wrong.
- Skips are visible debt. They keep the exit code at `0` so adoption is incremental, but the summary always
  says how many examples were not executed.
- One process per run: the adapter is expected to handle every example in one lifetime. If examples must be
  isolated from each other, the adapter does the isolation (transaction per line, fresh in-memory store).
- The YAML reader is the same strict subset as spec-lint's (anchors, aliases, and block scalars are errors). A
  contract that spec-lint rejects is exit `2` here, not a `fail`.
