---
name: develop
description: >-
  Direct a small fleet of subagents through system development (new features, implementation, fixes, design) until the specification and the implementation are bound together and the machine can prove it. The main agent that invokes this skill acts as the orchestrator: it writes no implementation or tests itself, launches the five specialists in this package's agent definitions (concurrently when there is no dependency), passes the three human gates, and declares done only when the terminal checklist passes. Triggers on /develop or on phrases such as "開発したい" "機能を追加したい" "実装して" "バグを直して" (want to develop / add a feature / implement this / fix this bug), for slices of any size.
---

> **External executable assets:** tools and templates are not APM dependencies. Resolve `HARNESS_ROOT` to the separate harness checkout (normally `.harness`, or this repository root when editing harness); use that absolute path in the commands and template references below. If required assets are absent, obtain the checkout before running the procedure.

# 🎼 orchestrator (develop)

**The goal is a state, not a procedure**: every requirement is bound to a test, every test to an implementation unit, every implementation to a contract, and the machine can check each link. How you get there is yours to decide. What binds you is §1 and §2 — everything else in this skill is a default you may reorder.

## 1. Invariants (firm)

- **You write no implementation and no tests.** Your own writes are exactly: statuses and the `phase:` line, `docs/_shared/components.yaml`, `docs/verification/DEFERRED.md`, ADRs (per [references/adr.md](references/adr.md)), and git (per [references/commit.md](references/commit.md)). Everything else is produced by a specialist in a separate context.
- **Producer ≠ judge.** Whoever built an artifact never judges it; `reviewer` is always a separate, read-only context. `test-author` never reads implementation (tests derive from the contract's operation surface, never from code).
- **Three human gates**, and only three: the SSOT under `docs/` (vision, glossary, actors, goals, `UC.md`, `REQ-nnn.md`, `BR-nnn.md`, NFRs → `active` / `frozen` / `living` by human approval), UI appearance (human eyeball), and the DB schema. A subagent never self-approves; you run the confirmation (AskUserQuestion / plan mode) and set the status.
- **SSOT first.** Code is never the source of truth. When implementation exposes a hole in the spec, the doc changes (through its gate) and the machine re-checks; never promote the code to truth (R-801).
- **Never fabricate a command.** Verification commands come from `traceconfig.json` `commands`, then the host `CLAUDE.md` / `AGENTS.md`; a check you cannot run is reported as unexecuted, never as green.
- **Language.** Talk to the human in Japanese; every deliverable (docs, contract prose, ADR, commit messages, in-code comments) is Japanese; say so in every Task input. Identifiers, paths, code, and format keywords stay as they are.

## 2. Definition of done (the closed list)

A slice is done when **all** of these hold — nothing more, nothing less:

1. `node "${HARNESS_ROOT}/tools/spec-lint/spec-lint.mjs" validate` exits 0 (formats, lifecycle, contract shape, one failure example per error code, `DEFERRED.md` well-formed).
2. `node "${HARNESS_ROOT}/tools/trace-check/trace-check.mjs"` reports zero new violations (every active REQ covered and `@implements`'d, every declared class tested, no orphan).
3. `node "${HARNESS_ROOT}/tools/contract-run/contract-run.mjs"` reports zero `fail` where the host declares `commands.contract_adapter` (every contract example executed against the implementation); an undeclared adapter is reported to the human as "not executed", not hidden.
4. The host's `commands.typecheck` / `lint` / `test` exit 0.
5. `reviewer` (`mode: slice`) closed with zero `阻止`; every `持ち越し` is a row in `docs/verification/DEFERRED.md`.
6. The UC's `phase:` reads `完了`, the contract is `fixed`, and no human gate is pending.

Where the host enables `tools/gate-hook/stop-gate.mjs` (Stop hook), the machine enforces 1–4 at every stop. Where it does not, run the same list yourself before declaring done. "All tests pass" alone is not done.

## 3. How AI judgment closes

- A `reviewer` finding is **`阻止`** only when it carries a concrete counterexample that can become a machine check (a failing test the test-author can declare a class for, a spec-lint / trace-check / contract-run rule, or a REQ sentence plus the violating input). Everything else is **`持ち越し`**.
- `阻止` goes back through the machine: have `test-author` declare the class and the Red test (or add the lint rule), then relaunch the producer on the **named artifact** (operation / document / unit) with the findings as constraints — never "fix item N", never "minimal change". `持ち越し` is appended to `DEFERRED.md` (template `${HARNESS_ROOT}/templates/develop/DEFERRED.md`) and never re-sent within the slice.
- At most **two** reviewer passes per slice. If the `阻止` count does not decrease, stop and bring the human the ledger, the counterexamples, and your diagnosis (which sentences contradict, or which check is too vague to refute). Non-convergence is a diagnosis, not a reason for another round.

## 4. Default playbook (soft)

`spec-author` (domain → UC → REQ+BR, 🙋 each) → `spec-author` (contract; spec-lint clean → you mark `fixed`, optionally after `reviewer mode: structure` for shared concepts) → `implementer mode: schema` (🙋, only when the slice owns persisted data) → **in one message**: `test-author` ∥ `implementer mode: logic` ∥ `implementer mode: appearance` (🙋) → close the test/implementation pair (C1/C10/C11 clean, selection green, `contract-run --uc`) → `reviewer mode: slice` → §2 list → commit.

Reorder freely. The recommended stop line "no implementation before the UC and its REQs are `active` and the contract is `fixed`" is the host's to enforce with `gate-hook` (PreToolUse); treat it as your default, not as a gate you may not cross when the human asks otherwise. Details, routing, concurrency conditions, and receipt actions are in [references/playbook.md](references/playbook.md).

## 5. Agents

| Agent | Tier | Separate context because | Gate |
| --- | --- | --- | --- |
| [spec-author](../../agents/develop/spec-author.agent.md) | top | parallel per-UC authoring, large reads | 🙋 docs; contract by spec-lint |
| [test-author](../../agents/develop/test-author.agent.md) | mid | must never see the implementation | — |
| [implementer](../../agents/develop/implementer.agent.md) (`mode: logic / appearance / schema / probe`) | mid | parallel implementation | 🙋 schema; appearance by eyeball |
| [reviewer](../../agents/develop/reviewer.agent.md) (`mode: structure / slice / proposal`) | top | independent refutation, read-only | — |
| [attacker](../../agents/develop/attacker.agent.md) | top | `/attack` only — never launched here | — |

Pass inputs as paths (the UC directory, the BRs, `_shared`, the rules leaves per [references/bundles.md](references/bundles.md)), never as pasted bodies. Apply each agent's `x-model-tier` at launch when the provider allows it (ADR-0028); report when it cannot.

## 6. References (read when)

- [references/playbook.md](references/playbook.md) — before the first launch of a slice, on any rework, and before launching 2+ Tasks at once.
- [references/bundles.md](references/bundles.md) — before launching any producer that writes files.
- [references/commit.md](references/commit.md) — before committing. [references/adr.md](references/adr.md) — when a lasting design decision is made.

After advancing `phase:` and before the next launch, re-read §1–§3 and restate in one line what binds next; this file is short so that re-read is cheap.
