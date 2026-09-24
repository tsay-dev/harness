# The default playbook (develop)

> This is the **default** flow, and it is soft: reorder, merge, or repeat steps freely when the work calls for it. Only the invariants in [SKILL.md](../SKILL.md) §2 and its §3 definition of done bind. Section headings here are stable — `SKILL.md`, the other reference files, and the rules leaves point at them by name.

## Where docs artifacts live

**One use case, one directory** (`docs/goals/GOAL-nn-<slug>/UC-nnn-<slug>/`) holds everything read to implement it: `UC.md`, its `REQ-nnn.md`, and `contract.yaml`. GOAL → UC → REQ is a tree, so the file system matches it; cross-cutting documents (BR / NFR / ADR / glossary / `_shared` / verification) stay central under `docs/`. **Indexes are generated, never committed** (`trace-check --index`). Formats are the templates (`${HARNESS_ROOT}/templates/develop/`); principles are the rules leaf [docs.instructions.md](../../../instructions/docs.instructions.md), delivered by `applyTo:` to whoever writes under `docs/` — the orchestrator included, for ADR and DEFERRED writes.

> **A slice's MIS**: `UC.md` (scenario, state × event table whose cells name the REQs, exception sweep) + `REQ-nnn.md` (one EARS sentence + partition classes in `## 検証方針`) + `contract.yaml` (operations, types, required, enum, `errors:` in evaluation order — R-1207). Rules shared by 2+ UCs live once in `docs/rules/BR-nnn.md`. **A boundary is not only HTTP**; a UC that crosses none declares `operations: {}` with a reason rather than going without a contract.

| Artifact | Location | Author |
| --- | --- | --- |
| Vision / glossary / actors | `docs/00-vision.md` / `01-glossary.md` / `02-actors.md` | `spec-author` (🙋 → `frozen` / `living` / `living`) |
| Goals | `docs/goals/GOAL-nn-<slug>/GOAL.md` (started) / `docs/goals-backlog.md` (not started) | `spec-author` (🙋 → `active`) |
| Use case (scenario, state × event table, exception sweep) | `…/UC-nnn-<slug>/UC.md` | `spec-author` (🙋 → `active`); the `phase:` line by the orchestrator |
| Requirement (one EARS sentence) + verification policy | `…/UC-nnn-<slug>/REQ-nnn.md` | `spec-author` (🙋 → `active`); `## 検証方針` by `test-author` |
| Business rule (shared by 2+ UCs) / NFR | `docs/rules/BR-nnn.md` / `docs/nfr/NFR-nnn.md` | `spec-author` (🙋 → `active`) |
| Boundary contract (any transport) | `…/UC-nnn-<slug>/contract.yaml` | `spec-author` (🤖 → `fixed` by the orchestrator) |
| Shared contract vocabulary (`$ref` targets) | `docs/_shared/components.yaml` | **orchestrator only** (producers return requests as reports) |
| Project-wide "not verified" ranges | `docs/verification/GLOBAL.md` | `test-author` |
| Deferred findings ledger (`持ち越し`) | `docs/verification/DEFERRED.md` | **orchestrator only** (template `${HARNESS_ROOT}/templates/develop/DEFERRED.md`) |
| DB design | **the host's native schema source only** (declared in the host `CLAUDE.md` / `AGENTS.md` or `traceconfig.json` `schema.files`; never a docs draft, R-102). Rule-enforcing constraints carry `@implements BR-nnn` (C13) | `implementer (mode: schema)` + framework rules |
| Design Doc (the How, present tense; optional) | `docs/design.md` | human (🙋; orchestrator may ghostwrite; reasons go to an ADR) |
| ADR | `docs/adr/ADR-nnnn-<slug>.md` | orchestrator, per [adr.md](adr.md) |
| Trace configuration | `traceconfig.json` at the host root | orchestrator seeds it once from the template; the host maintains it |

- **Never pin the DB design's location on the develop side, and never fall back to a docs draft.** If the host has not declared a native source, ask the human — a slice that owns persisted data cannot proceed without it.
- **Progress is the `phase:` line** in each `UC.md` frontmatter (`定義`→`構造`→`実装`→`検証`→`完了`); the orchestrator advances it at every transition and no producer touches it. **After advancing it, restate in one line the SKILL.md §2 invariants that bind in the next phase** — the skill was loaded once and gets crowded out.
- **Statuses**: docs nodes `draft → active → withdrawn` (`active` = a human approved; singletons `frozen` / `living`); the contract `draft → fixed`. **The orchestrator performs every status transition**; producers return drafts.

## Phase 1: definition

Before the first launch, seed `traceconfig.json` from `${HARNESS_ROOT}/templates/develop/traceconfig.json` if absent (adjust `source` / `tests` / `commands`; ask when unsure); on an existing project run `trace-check --update-baseline` once. Then launch `spec-author` per target, in dependency order, one 🙋 pass per return:

1. **Domain** — vision (measurable KPIs), glossary and actor set closed, every goal a `GOAL.md` or a backlog entry, every NFR with a measurement. On approval set `frozen` / `living` / `active`.
2. **Use cases** — one Task per UC, concurrently across UCs. Each reserves its REQ IDs with `trace-check --next req --reserve N` (atomic; no band handed out). Done when the state × event table has no empty cell, every cell names a reserved REQ, a planned UC, or `不可` with a reason, and the exception sweep covers the 4 axes. On approval `active`.
3. **Requirements** — one Task per active UC, concurrently. Done when every reserved ID is one EARS sentence with a pattern, at least one `Unwanted behaviour` per UC, and every rule shared by 2+ UCs is a BR referenced by ID. On approval `active`.

A defect report against an approved requirement goes through *Routing information* and *Rework* — never patched inline.

## Structural risk gate and the probe

Decide inline (no subagent): a structure is **high-risk** when it has **high novelty**, a **wide blast radius**, or is **expensive to undo** (production data already loaded). Otherwise go straight to Phase 3. If high-risk, pick the single riskiest cross-UC path and launch `implementer (mode: probe)`: drive it end to end with a minimal implementation reaching real I/O (no browser E2E demanded) and report whether the structure carries the behaviour. **Probe output is throwaway and never lands in the mainline.** A structural refutation returns to Phase 1/3 (🙋 when the cause is a human-oracle artifact).

## Phase 3: structure

Build the schema and the boundary contract that correspond to the use cases and make their references consistent. No UI design document (screens are in the tables; appearance is stood up in Phase 4).

1. `implementer (mode: schema)` (🙋) — pass the UC directories, the BRs whose `enforced_at` names the database, the glossary, **the schema source path**. Its guarantee-point proposals (which enforcement point is a rule's SSOT, by asymmetry) are settled at the same gate; an approved one becomes an ADR ([adr.md](adr.md)) and, if `enforced_at` changed, a `spec-author` edit of the BR. **Skip when the slice owns no persisted data**; on-device persistence (SwiftData / SQLite / Core Data) *is* persisted data.
2. **Seed `_shared`** (orchestrator, inline) — create `docs/_shared/components.yaml` from `${HARNESS_ROOT}/templates/develop/components.yaml` if absent and populate the initial shared DTOs and error codes from the settled schema.
3. `spec-author` — derive `contract.yaml` (`draft`) from the active UC directory + settled schema; concurrently per UC with identical `_shared` / existing-contract paths. Requests to add to `_shared` come back as reports; apply them yourself before the next round. Then run `spec-lint validate` (operation keys are closed; one failure example per `errors[].code`; `errors:` order is evaluation order — refuted by examples and tests, never by a `when` label).
4. `reviewer (mode: structure)` — read-only, separate context. **Recommended** for a shared-concept or structural change (pass the concept-wide scope from *Rework*, completed slices included); **optional** for a local UC. Its mission is the semantic half only — format, transport fields, vocabulary, examples (spec-lint) and placement / dead rules / IDs (trace-check) are already machine-decided. Findings carry `severity: 阻止 | 持ち越し`; loop per *Round ledger and stop rules*.
5. **Marking `fixed`** — when spec-lint passes and the review, if launched, returned zero `阻止`, **the orchestrator** sets `x-status: fixed` and advances `phase:` to `構造`. Never from a proposal review; never by a producer or judge.

## Phase 4: behaviour

Advance `phase:` to `実装` on entry. Everything below rests on the `fixed` contract; if you find yourself wanting to change it, stop and return to Phase 3.

1. **Launch the trio in one message** once the contract is `fixed`: `test-author` (declares partition classes in each REQ's `## 検証方針`, then files Red tests with `@covers REQ-nnn#class` — **never reads the implementation**); `implementer (mode: logic)` on the backend from the contract alone; `implementer (mode: appearance)` (🙋, data mocked per the contract, writes no logic). Both authors derive the entry a test calls from the contract and the rules leaf's "operation → entry" convention, never from each other.
2. **Closing rule** — BE tests are a *closing* input of the logic implementer, not a start input (the one sanctioned reader-before-writer case). When both have returned and the implementation preceded the tests, relaunch the implementer **once** with the Red tests (run reds + blast radius). The pair closes when `trace-check --only C1,C10,C11` is clean for the slice's REQs and the selection is green.
3. **Frontend wiring** — after the appearance is eyeballed, `implementer (mode: logic)` on the frontend paths wires request handling, state, and the contract's edge into it (**follow the framework's shape**; no FE tests are filed for now — types and lint verify). The FE gap is covered by the human eyeball and the reviewer; browser E2E stays outside the phases.
4. **Suites** — only the default suite (starts no external environment) is in the red-green loop; integration and system suites live in separate folders and commands (the framework testing leaves define locations; *Test-run granularity* defines when). BE contract-conformance tests belong to the default suite.
5. **Machine gate** — `node "${HARNESS_ROOT}/tools/contract-run/contract-run.mjs" --uc UC-nnn` (executes every fixed example through `commands.contract_adapter`; "未宣言" means not executed, not passed) and `node "${HARNESS_ROOT}/tools/trace-check/trace-check.mjs"`. Reds go back as constraints per *Round ledger*.
6. **Judgement** — advance `phase:` to `検証`; launch `reviewer (mode: slice)` (read-only; the slice, the UC directory, tests, change scope). At most 2 passes per slice; `阻止` findings become a test class (`test-author`) or a lint rule and go back through the machine loop; `持ち越し` rows go to `DEFERRED.md`. `attacker` is never launched here.
7. **Terminal list, then commit** — what `tools/gate-hook/stop-gate.mjs` runs: `spec-lint validate` → `trace-check` → `contract-run` → the host's `commands.typecheck` / `lint` / `test` (the whole default suite, once). All clean and the slice at zero `阻止` → commit per [commit.md](commit.md) (no Task running), advance `phase:` to `完了`.

## Routing information

Every document under `docs/` holds **only present-tense invariants**; none accumulates history, rationale, measurements, or open questions. Sort first, then hand over.

| Kind of information | Destination | Route |
| --- | --- | --- |
| Product-wide Why, KPIs, out of scope; a term or forbidden synonym; a new actor or goal | `00-vision.md` / `01-glossary.md` / `02-actors.md` / `GOAL.md` / `goals-backlog.md` | `spec-author` (🙋) |
| A new state, event, or exception path (a table cell) | `…/UC-nnn-<slug>/UC.md` | `spec-author` (🙋) |
| A change in observable behaviour | `…/UC-nnn-<slug>/REQ-nnn.md` (one sentence) | `spec-author` (🙋) |
| A rule that binds 2+ UCs, or where a rule is enforced; a cross-cutting threshold | `docs/rules/BR-nnn.md` (`enforced_at`) / `docs/nfr/NFR-nnn.md` | `spec-author` (🙋); the reasoning → ADR |
| Which inputs a requirement's tests partition, and what is not verified | the REQ's `## 検証方針` / `docs/verification/GLOBAL.md` | `test-author` |
| A change in the shape of the boundary | `…/UC-nnn-<slug>/contract.yaml` | `spec-author` |
| Contract vocabulary used by 2+ UCs | `docs/_shared/components.yaml` | orchestrator (applying producers' reports) |
| Overall structure, adopted technology, design constraints (the How) | `docs/design.md` | 🙋 (orchestrator may ghostwrite; reasons go to an ADR) |
| Reasoning, trade-offs, rejected options, measurements behind a decision | `docs/adr/` | orchestrator, per [adr.md](adr.md) |
| A judge's `持ち越し` finding (machine-undecidable, kept open) | `docs/verification/DEFERRED.md` | orchestrator (one row per finding; never re-sent within the slice) |
| A value that can be machine-readable (a threshold, an enumeration) | code constant / schema constraint (R-102); the doc says where | `implementer` (`logic` / `schema`) |
| Open questions, residual risk, awaiting human decision | issue tracking (the project's convention; otherwise ask) | orchestrator |
| The history of a revision, an explanation of the diff | the git commit message | orchestrator, per [commit.md](commit.md) |

> **Finding a defect is not, by itself, a reason to change the SSOT.** Before routing a judge's or a test's finding to `spec-author`, check whether the existing REQ sentences and BRs already refute that error. If they **can**, the SSOT is right and the implementation (or a missing partition class → `test-author`) is what changes. Only when they **cannot** is it an SSOT change. Skipping this check makes the UC directory grow with every review, and that directory is billed as context to every producer and judge of the slice. For the same reason, never route appearance nitpicks to the SSOT (their oracle is the human eyeball).

## Rework and the dispatch map

When an SSOT change becomes necessary mid-implementation, stop, fix the SSOT (upstream first, R-801), then re-derive. "Uniformly rewind to the original loop" is forbidden. **Measure before dispatch** (orchestrator, inline):

1. Search docs, the declared schema, source, and tests together (`rg -l -F -e '<ID>' -e '<term>' -e '<identifier>' <roots…>`), including shared vocabulary and completed slices; follow newly found references until no new address emerges. Generated / vendor copies are not targets; note roots the search could not cover.
2. Keep a temporary dispatch map in the working context: affected paths, intended change, responsible producer, read inputs, write targets, dependencies, re-verification scope. Hits are candidates, not edits — distinguish live dependents from withdrawn artifacts and historical explanations that must stay. A zero-hit search or a green `trace-check` is not semantic proof.
3. Apply *Decision preflight* when its trigger holds. Route the complete set with the routing table as **one coordinated batch**, grouped by producer and dependency; pass each Task its affected paths, the intent, and the predecessor outputs it waits for. One batch does not mean one launch: finish upstream writes and approvals before launching downstream readers.
4. On receipt, expand the map when a producer finds another dependent; pause affected downstream work and relaunch it against settled inputs. Never continue knowingly on stale inputs.
5. After the batch settles, re-search for missed live dependents and hand the full scope to the phase's reviewer and machine checks, once per round. Keep the map temporary, never a committed ledger.

| Kind of change | Return point and re-verification scope |
| --- | --- |
| One requirement's sentence, or a new partition class | back to the current slice (re-derive: policy → tests → implementation) |
| A new table cell, a new BR, or an SSOT change touching the frozen structure | Phase 1 (UC / REQ / BR) → re-run Phase 3 → **re-verify already-completed slices too**, using the map (`trace-check` C4 catches dead rules only) |

## Decision preflight

- **Trigger**: a proposed decision adds, changes, or withdraws a shared concept / rule, or alters an existing structural assumption (state, boundary, persistence constraint) — during definition too. A local correction derived from unchanged SSOT gets no preflight.
- After collecting the dispatch map and **before any write implementing the decision**, launch `reviewer (mode: proposal)` read-only with the before/after intent (inline only if not yet in a file), its grounds, and the concept-wide paths (UC directories, REQs with policies, BRs, glossary, `_shared`, contracts, schema, relevant source / tests); state which artifacts are not yet authored and why. Pause writers to those inputs. Ask for counterexamples across the concept, semantic dependents included.
- **On receipt**: verify the grounds, expand the map, and resolve every `阻止` or missing piece of evidence before dispatch. If design details are needed, ask the responsible producer for a proposal as a report (no artifact changes) and re-judge. Policy ambiguity → the human with the competing interpretations; the reviewer neither chooses policy nor approves. A clean proposal report permits the normal producer / gate sequence only — **never `fixed`, never a phase advance, no extra human gate**. The artifacts are reviewed again in Phase 3 over the same scope.

## Round ledger and stop rules

Every judge loop (reviewer `structure` / `slice` / `proposal`, and a red machine gate) is driven by a ledger the orchestrator keeps in the working context — one row per round: **`阻止` count, `持ち越し` count, artifacts re-derived, `same-location` (a finding at a location already listed in a previous round)**.

- **Send every `阻止` of a round in one launch, as constraints on named artifacts** (an operation, a document, a unit). The rework unit is the artifact, never the finding; never say "minimal change". A `阻止` from the slice reviewer is first converted into a test class (`test-author`) or a lint rule, then goes through the machine loop — never as prose to a producer.
- **Before the next launch, append every `持ち越し` as a row to `docs/verification/DEFERRED.md`** (template `${HARNESS_ROOT}/templates/develop/DEFERRED.md`; it defines the columns). A `持ち越し` is never re-sent within the slice.
- **At most 2 reviewer passes per slice.** Re-judgement is once per round. From the second pass on, pass "the previous findings + this round's change scope" and narrow to "confirm the fixes + rescan the blast radius of the changes" (the first pass is a full judgement; only the scope narrows).
- **If the `阻止` count does not decrease between rounds, or a `same-location` row appears, stop** and go to the human with the ledger, the counterexamples, and a diagnosis of why it is stuck. Do not spend the second pass hoping.
- **Read post-round test failures per class (per file).** A total count hides a regression: separate expected new Reds from classes that were green and turned red before sending anything back.

## Test-run granularity

The default suite is **the pool the red-green loop draws from**, not a command fired after every mutation. Treating every round as a final judgement and running the whole suite is forbidden.

| Moment | What you run | What "green" means |
| --- | --- | --- |
| A fix / rework round (including the consolidated run after an exclusive-resource skip) | the **reds of this round + their blast radius** | that selection is green |
| Declaring the slice ready to commit (after the reviewer's last pass at zero `阻止`) | the **terminal list** (`spec-lint validate`, `trace-check`, `contract-run`, then the host's `commands.typecheck` / `lint` / `test` — the whole default suite, once) | every command exits 0 and `trace-check` reports no new violation |
| CI (push, pull request, merge) | the whole default suite, spec-lint, trace-check, and whatever else CI defines | CI |

**Blast radius is neither the single failing test nor the whole default suite.** It is the tagged suites (`UC-nnn`) observing the same path as the files this round changed; suites sharing a session, a lock, a stash, a microphone, a write chain, or a similar cross-UC progression sit in each other's blast radius even under different UC IDs. When unsure, widen by neighbouring `UC-nnn` tags — never by firing the default-suite command. How to select (tag, filter flag) is in the framework testing leaves you pass; this section decides only **when**. Integration and system suites stay at a boundary or outside the phases. **The orchestrator never orders a whole-default-suite run as part of a fix round, a probe, or a reviewer pass.**

## Concurrency conditions

At every launch, **launch simultaneously (several Tasks in one message) when all 4 conditions hold**; serialize only the pairs that fail one, and name the condition. N use-case Tasks and N requirement Tasks in Phase 1, N contract Tasks in Phase 3, and `test-author` ∥ `implementer (logic)` ∥ `implementer (appearance)` in Phase 4 are instances of these conditions, not separate rules.

1. **Inputs are settled** — each Task's inputs are `active` / settled / `fixed` and wait on no other Task's output in the same round. Compare read inputs against every concurrent Task's write targets, the orchestrator's included: **never overlap a writer and a reader of the same file**. A status label does not make a file settled while it is being revised. **The one sanctioned exception**: BE tests are a *closing* input of the logic implementer (Phase 4), so `test-author` and `implementer (logic)` start together and reconcile at the closing rule.
2. **Write targets are disjoint** — never run Tasks that write the same file at the same time (`_shared`, the schema source, the domain singletons, a `UC.md` another Task reads; `_shared` and every `phase:` line are the orchestrator's alone). Two `spec-author` Tasks that both extract a BR return candidates; one of them writes.
3. **The shared vocabulary is passed identically** — the same paths for glossary, BRs, `_shared`, existing contracts to every concurrent producer.
4. **No two human gates open at once** — at most one 🙋 (spec-author / implementer schema / implementer appearance) pending.

The main arena is **concurrent independent slices**: slices with `fixed` contracts satisfying 1–4 may run **2–3 at a time**, each carrying its whole Phase 4 chain, capped so a human can still follow a rework. **Never run steps that take an exclusive execution resource at once** (the git index, a single build / run environment, a simulator). When a producer reports "skipped execution due to exclusivity", close the concurrent section, relaunch **the same implementer alone** with the skipped UC IDs + blast radius, settle that selection, and only then move on — never pass anything unexecuted to the reviewer or to a commit. This binds judges that run things too. **Never commit while any Task is running.** If condition 2 breaks mid-run, drop that slice to serial. Concurrency never touches the requirement that judges live in a separate context from producers.

## Task inputs and receipt

**Task inputs are paths, never artifact bodies.** SSOT, schema, contract, tests, appearance, and change scope are repository paths — for a slice, **the UC directory** (the agent runs `ls` and reads what is there). The only inline exceptions are things not yet in a file: the finding list with grounds, the mode, the reserved REQ IDs, and similar control information. Pass the shared vocabulary paths to every Task, state that deliverables are in Japanese, and pass the rules-leaf bundle per [bundles.md](bundles.md). On receipt, verify a judge's grounds yourself before any decision that goes outside; never fix and approve the same thing yourself; never escalate to a human what machines settle.

**Model selection is a three-tier policy.** Each agent source declares `x-model-tier: top | mid | light`; read it before launch and apply it through the launch API (ADR-0028). Claude Code: `opus` / `sonnet` / `haiku`. Cursor: pick the latest model of the matching family per Task (`inherit` is forbidden; if the family is unavailable, report the candidates and stop). Grok Build: launch each specialist through the `workflow` tool. The inline Rhai script passes `agent_type` as the agent frontmatter `name:` (`implementer` and the rest) to `agent()` or `parallel()`, and does not set `fork_context`. A concurrent batch is one `parallel()` call. Return to the parent around a human gate, and never put a gate inside the script. Pass the script inline and do not save it under `.grok/workflows/`. Follow the session's `create-workflow` skill for the grammar, and read it again if the tool rejects the script. A `spawn_subagent` call does not count as launching the specialist. If `workflow` or `agent_type` is unavailable, stop and report that the named agent was not launched; do not fall back to `general-purpose`. The child inherits the parent model, so report when the session is below a top-tier agent's tier. Codex: `spawn_agent` with the TOML `name` (as `agent_type`, or `task_name` with `fork_turns: none` and the persona named in `message`); pass `model` / `reasoning_effort` from `"${HARNESS_ROOT}/tools/codex-sync/models.json"` when offered, and report when the pin was not enforced. Never hardcode a catalog ID.

| Stop / report received | From | Exit |
| --- | --- | --- |
| Drafts + points to confirm (domain, UC, REQ / BR, NFR) | `spec-author` | 🙋 present → statuses on approval / relaunch on change requests. A `?` cell is a hole: settle it before approval. A BR that binds already-active UCs → *Rework* |
| Contract draft, or a `_shared` vocabulary request | `spec-author` | 🤖 `spec-lint validate`; apply the vocabulary yourself before the next round; then Phase 3 step 4–5 |
| Cannot settle the contract (a defect in the UC / REQ / BR / schema) | `spec-author` | 🙋 send back to the causing human-oracle artifact → re-derive after approval |
| Schema draft + guarantee-point proposals; or "no schema source declared" | `implementer (schema)` | 🙋 present → settled on approval (guarantee point → ADR; `enforced_at` change → `spec-author`). No source → ask the human where it lives and record it in the host `CLAUDE.md` / `AGENTS.md` / `traceconfig.json` |
| Structural refutation | `implementer (probe)` | structural cause (e.g. the schema) → 🙋 / otherwise rebuild in Phase 1 / 3 |
| Appearance + request to confirm | `implementer (appearance)` | 🙋 present → settled / re-implement on change requests |
| Partition classes + Red tests | `test-author` | 🤖 closing input of `implementer (logic)` — Phase 4 closing rule |
| Requirements or contract insufficient (a missing cell, a contradiction) | `test-author` | cause is the SSOT → 🙋 via `spec-author` / the contract → 🤖 `spec-author` re-derives |
| The contract falls short (mid-implementation) | `implementer` | closes within the contract → 🤖 `spec-author` re-derives / reaches a human-oracle artifact → 🙋 |
| Tests not run (skipped due to an exclusive resource) | `implementer` | 🛠 close the concurrent section, relaunch the same implementer alone on the skipped UC IDs + blast radius; never proceed to the reviewer or a commit unexecuted |
| Tests red, `trace-check` or `contract-run` violation | `implementer` | 🤖 all reds as constraints in one launch → re-test reds + blast radius; ledger row; never answer a red with the whole default suite |
| Proposal report | `reviewer (proposal)` | *Decision preflight*: `阻止` or unchecked evidence blocks dispatch. No status or phase transition |
| Findings (`阻止` / `持ち越し`) on artifacts | `reviewer (structure)` | `阻止` → constraints to `spec-author` / `implementer (schema)` in one launch, re-judge on the diff scope (≤ 2 passes); `持ち越し` → `DEFERRED.md`. **Zero `阻止` + spec-lint clean → the orchestrator marks `fixed`** |
| Findings (`阻止` / `持ち越し`) on the slice | `reviewer (slice)` | `阻止` → a test class (`test-author`) or a lint rule → machine loop; `持ち越し` → `DEFERRED.md`. **Zero `阻止` → terminal list → commit** |
| `阻止` count not decreasing, or a `same-location` row | any `reviewer` | 🙋 stop: ledger + counterexamples + diagnosis |

## Human gates

**Subagents cannot talk to the user.** A 🙋 agent never self-approves: it returns a draft plus the points the human must settle, and stops. The confirmation ritual (AskUserQuestion / plan mode) and the status transition (`active` / `frozen` / `living`, a settled appearance or schema) are performed by the orchestrator. Never embed a human gate inside a subagent.
