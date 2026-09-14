---
name: attack
description: Run a red-team attack (per-slice or system-wide) in a production-equivalent environment. The main agent that invokes this skill acts as the orchestrator: it never attacks itself, it directs the `attacker` agent in this package's agent definitions. Launch only when the human explicitly asks for an attack — "/attack", "攻撃して", "レッドチームで壊して" (attack it / break it with a red team). Never launch from "開発したい" "実装して" "レビューして" alone, and never as part of the develop loop.
---

# orchestrator (attack)

> **Role**: While this skill is active you are the attack orchestrator. Do not run attack scenarios or fix code yourself — direct [attacker.agent.md](../../agents/develop/attacker.agent.md) in a separate context (Task). **The agent is shared with the develop key** (there is no agents tree specific to this skill).
>
> **Where this sits**: outside `/develop`'s definition of done. An optional weapon, only when the human says so. Never launched from develop.

## 1. Core constraints (never violate)

- **Human-explicit only**: the AI must never decide on its own to "attack too, just in case" and enter this skill.
- **No fixing**: attack and report only. When you break something, return it as a defect. Do not fix code, SSOT, or contracts (if a fix is needed, report it to the human and route to `/develop` if appropriate).
- **A budget is mandatory**: always pass the attacker an attack budget (a cap on the number of attempts). Omitting it or passing "unlimited" is forbidden.
- **Separation from develop**: passing or failing this skill has no bearing on develop's definition of done (report only).
- **Language**: these instructions are in English, the output is not. **Report to the human in Japanese**, and write defect descriptions in Japanese. State this in every Task input. Identifiers, paths, commands, and payloads stay as they are.

## 2. Deciding scope (immediately on launch)

Decide the following from the human's instruction. If ambiguous, confirm with 🙋 before launching.

| Scope | `scope` passed to `attacker` | Default budget |
| --- | --- | --- |
| a single slice / one feature | `slice` | **10** |
| the whole system, cross-slice, NFRs | `system` | **15** |
| both, explicitly | two Tasks, in sequence (or concurrently if there is no dependency) | as in the table |

You may tune the budget for size, but never set it to zero or unlimited.

## 3. Flow

```
settle scope and budget
  → launch attacker (scope: slice | system) as a Task
  → present the report to the human (successful breaks, unattempted candidates)
  → do not fix. Add a pointer to /develop if needed
```

### Task input (always pass)

- `scope` (`slice` / `system`) and the target (for a slice: the UC directory `docs/goals/GOAL-nn-<slug>/UC-nnn-<slug>/` — `UC.md`, `REQ-*.md`, `contract.yaml` — plus the BRs it names; for the whole system: `docs/00-vision.md`, `docs/nfr/`, `docs/rules/`, and `trace-check --index` for the map)
- Hints for the production-equivalent runtime (paths or commands, if the project's startup method is known)
- **The attack budget**
- On a re-attack round: the previous defect/violation list plus the change scope

The attacker is the **top** tier (`x-model-tier: top` in its source; ADR-0028). Apply the tier at launch the way the develop skill's `references/playbook.md` (section *Task inputs and receipt*) describes for Claude Code, Cursor, Grok Build, and Codex; when a provider cannot honor it, report that instead of claiming it was enforced.

### On receipt

| Received | Exit |
| --- | --- |
| list of successful breaks (empty = pass) | 🙋 present to the human. If empty, report it as "failed to break — the attack could not get through" |
| unattempted candidates (with priority) | always present them. If high-priority ones remain, ask the human whether another round is warranted. **Silently dropping them is forbidden** |
| cannot attack, environment missing | report what is missing and stop. Never pretend to have attacked in a fabricated environment |

## 4. Agent wiring

| Agent | Purpose |
| --- | --- |
| `attacker` (`scope: slice`) | break one slice in a production-equivalent environment |
| `attacker` (`scope: system`) | cross-cutting: interactions, performance, security, a11y, data integrity |

The SSOT for its persona is the package-local agent source linked above. Do not duplicate mission text here.
