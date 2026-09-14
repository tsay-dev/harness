# Writing an ADR (the orchestrator writes it itself)

You, the orchestrator, record Architecture Decision Records — one file per decision, preserving "why this design or implementation was chosen" so it can be traced later. There is no adr-writer agent: the decision context is already in your working context, so you land it yourself. Typical triggers: an approved guarantee point from the schema gate, a rule's enforcement point, a framework or testing-strategy choice, a superseded decision.

> **Language**: write the ADR body (Context, Decision, Consequences, 却下した選択肢) in Japanese; the section headings stay as the template has them.
> `applyTo: docs/**` matches `docs/adr/`, so **you are the receiving agent of [docs.instructions.md](../../../instructions/docs.instructions.md)** — read it before writing (R-802, R-901, R-1001, and the ADR row of its "what each document may hold" table bind you).

## Only a settled decision is recorded

- **Write only a decision settled with the human.** An ADR is not where a decision is made. If the decision, its trade-offs, or the options considered are unsettled or unknown, **ask the human — never fabricate an option or a consequence to fill the template.** If several decisions are mixed together, split them into several ADRs.
- Status starts at `proposed` unless the human has already accepted the decision. An ADR never records the current design state (that lives in code, `docs/design.md`, and the contracts); it is a decision at a point in time.

## Craft

- **Template**: `${HARNESS_ROOT}/templates/develop/ADR.md` is the scaffold. The file is `docs/adr/ADR-nnnn-<slug>.md` (slug in lower kebab-case; the file-name prefix equals the frontmatter `id`).
- **Number** with `node "${HARNESS_ROOT}/tools/trace-check/trace-check.mjs" --next adr` (atomic reservation; never infer the next number from a directory listing). Numbers are never skipped or reused.
- **One ADR, one decision.**
- **The rejected options are the substance.** Context → Decision → Consequences → 却下した選択肢, written so the reasoning can be traced later: every option that was considered appears under 却下した選択肢 with at least one sentence on why it lost. **An ADR with zero bad consequences was not examined** — write the cost, not only the gain.
- **Name where the decision is enforced** (a type, a constraint, a check, a lint rule) in the Decision. A decision only prose enforces is persuasive control (R-901); say so explicitly.
- **Superseding** (R-802): write `supersedes: ADR-nnnn` on the new record and set the old record's frontmatter `status: superseded`. **Never delete or rewrite the old body**; nothing else in the old file changes.

## Before moving on

Run `node "${HARNESS_ROOT}/tools/spec-lint/spec-lint.mjs" validate` and `node "${HARNESS_ROOT}/tools/trace-check/trace-check.mjs" --only C12` (ID collisions), and fix every error concerning the file you wrote. Reference the ADR by ID from the commit footer of the slice it belongs to ([commit.md](commit.md)).
