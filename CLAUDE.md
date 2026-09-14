# CLAUDE.md — the development guide for harness itself

This repository is the vendor-neutral source of agent skills, agents, and instructions, distributed as independently selectable APM packages. The source of truth is `packages/`, with executable assets in `tools/` and document formats in `templates/`. `.claude/` is generated output, just like `.agents/`, `.codex/`, `.cursor/`, and `.grok/`.

Read [`README.md`](./README.md) for the philosophy and package selection, and [`docs/apm.md`](./docs/apm.md) for the APM contract, migration, and verification. This file is the working guidance for modifying the harness itself.

> **Language policy.** Prompt sources under `packages/`, tool READMEs, and guidance comments inside templates are written **in English**, for token density. **Conversation with the user is in Japanese**. Deliverables under `docs/` (vision, UC, REQ, BR, ADR …), commit messages, and in-code comments are **in Japanese**. Templates retain Japanese headings and frontmatter keys. `README.md` and `docs/apm.md` are Japanese.

## 0. Invariants

- **Never break zero-residency.** Do not add a resident rules index, a router in `AGENTS.md` / `CLAUDE.md`, or automatic injection in `settings.json` (hooks such as `gate-hook` / `stop-gate` are explicit host opt-in). Do not commit a derivable docs ledger (`trace-check --index` generates the index on demand; `docs/verification/DEFERRED.md` is the one committed ledger — reviewer findings with their counterexamples, which no source can regenerate). Do not compile all installed instructions into a baseline document merely because APM can do so.
- **Never edit generated provider directories by hand.** `.claude/`, `.agents/`, `.codex/`, `.cursor/`, and `.grok/` are outputs. Change `packages/` or `tools/`, then regenerate. The root `AGENTS.md` / `CLAUDE.md` are this repository's working entrances, not generated rules routers.
- **Never make one provider's output another provider's authority.** An adapter may use temporary intermediate files, but its input must originate in selected neutral packages.
- **Never install everything by default.** There is no root all-in-one APM package. Development, translation, and each framework remain independently selectable.
- **Never add host-specific facts here.** The shared harness contains generic procedures and rules. An engagement's stack, addresses, commands, and deviations belong in that host's `AGENTS.md` or `CLAUDE.md`.
- **Never duplicate knowledge.** A document format has one source in `templates/`; spec-lint derives its required items there. Craft belongs in agent bodies — or, for a side effect the orchestrator performs itself because its only input is its own judgment (commit, ADR), in that skill's `references/*.md`. A `SKILL.md` holds invariants and flow (≈100 lines); procedures not needed at every launch live beside it in `references/` with an explicit read trigger. Nothing is copied: an agent body that moved is deleted.
- **Firm versus soft.** What must never break (the three human gates, producer ≠ judge, the terminal checklist, closed vocabularies) is enforced by hooks and lints. How to get there (order, depth, launch sequence) is a default in a skill that the orchestrator may reorder. Add a machine check before adding a procedure; add an agent only when a separate context is needed (isolation, parallelism, or independence — "does handing this to a subagent throw away the reasoning in a summary?" means fold it back).
- **Keep executable assets outside APM packages.** `tools/` and `templates/` are explicit, separately provisioned assets, not APM primitives.

## 1. Governing rules

| Principle | Meaning |
| --- | --- |
| Hierarchy represents abstraction | A leaf binds its level; a deeper directory specializes it. The axis is kind, never project. Framework and layer leaves contain only their delta on common rules. |
| Package selection precedes loading | Install only the required scene and stack. A package's presence does not authorize loading all of its text. |
| Building ≠ judging | Producer and oracle / reviewer / attacker / judge are separate agents in separate contexts. Producers never approve their own judgments. |
| Skills drive the process | The orchestrator owns the decision core, delegation, gates, and status transitions. It writes no implementation or tests; its own writes are statuses, `_shared`, `DEFERRED.md`, ADRs, and git. |
| References run one way, instructions → skill | A leaf may reference a procedure. A skill may discover only delivery metadata and addresses, never summarize or depend on the instruction body's section numbers or contents. The receiving agent reads the leaf. |

Procedure names remain stable across skills, agents, and instruction scenes. Package boundaries split distribution without changing those responsibilities. The `attack` orchestrator shares the develop agents and rules rather than duplicating them; depth for a small slice is the develop orchestrator's judgment, not a separate skill.

## 2. Where things belong

| Asset | Source | Load trigger |
| --- | --- | --- |
| Instruction leaf | `packages/<package>/.apm/instructions/*.instructions.md` | Target file addresses match its neutral `applyTo` metadata; the receiving producer reads it on demand. |
| Procedure | `packages/<package>/.apm/skills/<name>/SKILL.md` | Explicit invocation or skill description. Keep the standard Agent Skills directory layout. |
| Specialist agent | `packages/<package>/.apm/agents/**/*.agent.md` | The orchestrator launches the specialist. |
| Document scaffold | `templates/<procedure>/` | The producer reads the required format. |
| Executable / provider adapter | `tools/<name>/` | Explicit invocation. |
| Package manifest | `packages/<package>/apm.yml` | APM resolves the selected package. |

Do not flatten `.apm/` into an invented layout that APM cannot discover. Consult the official schema before changing manifest fields or primitive metadata. See `docs/apm.md` for the verified version and sources.

## 3. Extension checklist

### Adding an instruction

1. Choose its installation boundary first. Framework leaves belong only in `rules-next`, `rules-crow`, `rules-expo`, or `rules-swiftui`. Only platform-independent concerns such as docs and comments belong in `develop-core`.
2. Keep **one concern per leaf**. Preserve scene / platform / framework / layer specialization in instruction filenames; APM 0.30.0 discovers instruction files directly under `.apm/instructions/`. Do not transcribe the common rules into a layer leaf.
3. Declare **`applyTo` as the neutral delivery contract**, using a comma-separated string (not a YAML array). Enumerate exactly the files the intended recipient writes: test addresses for a test designer, native schema addresses for a DB designer, production addresses for implementers. Broad globs are valid only for a rule that binds every matching address. Excessively narrow globs silently prevent delivery.
4. Claude `paths:` is emitted by its adapter; it is not source syntax. Other providers must not be assumed to have an equivalent native lazy loader. Instructions remain available in the installed APM package for invocation-time discovery and reading.
5. A body's cross-reference has no delivery effect. Declare delegated addresses in `applyTo`. An address-to-leaf guide belongs in the relevant leaf, never a resident index or the skill body.
6. Verify the package independently and check that unrelated packages do not appear in a fresh consumer.

```yaml
---
description: Rules for the selected source addresses
applyTo: "**/crow3_*/app/classes/**"
---
```

### Adding a procedure

1. Select or add an independent APM package for the use case. Do not add a dependency on every existing package.
2. Put only the orchestration invariants, the definition of done, and the default flow in `.apm/skills/<key>/SKILL.md` (≈100 lines); move procedures to `references/*.md` in the same skill directory (APM installs the whole folder; the legacy adapter projects every file) and name the read trigger in `SKILL.md`.
3. Add an agent in `.apm/agents/<key>/*.agent.md` only when a separate context is needed (isolation, parallelism, or an independence such as "never reads the implementation"); keep producers and judges independent. A role whose input is the orchestrator's own summary is a procedure, not an agent.
4. Put applicable types and rules in `.apm/instructions/<scene>-<concern>.instructions.md`.
5. Resolve references from neutral package sources or selected packages in `apm_modules/`; do not require `.claude/` to exist. Executable assets and templates resolve from their separately provisioned root.

### Agent models and capabilities

Use stable agent names and explicit input / craft / output contracts. Oracles are read-only by default and expose defects rather than confirm agreement. Every neutral agent declares exactly one `x-model-tier: top | mid | light`; that frontmatter field is the assignment SSOT. It must not contain a provider model family or versioned catalog ID (ADR-0028).

Provider adapters map tiers, never agent names. Claude family mapping is in `tools/apm/claude-models.json`; Codex catalog IDs and reasoning effort are only in `tools/codex-sync/models.json` (ADR-0029). Native APM may preserve the extension without enforcing it, so the orchestrator reads the source tier and applies it at launch when supported. If a provider cannot honor the tier, report the limitation instead of claiming verified behavior.

## 4. Working flow

1. Identify the neutral source being changed: package manifest / instruction / skill / agent, `tools/`, `templates/`, or repository guidance.
2. Check package boundaries and duplication before moving files. Confirm current APM anatomy for format changes.
3. Edit the source. Review references, language, instructions, and the meaning of process gates.
4. Validate the package and regenerate the selected provider outputs using the commands in `docs/apm.md`. Never combine APM-managed output and legacy `init.sh` output in one consumer.
5. If the change involves a lasting design judgment, record an ADR yourself in `docs/adr/ADR-nnnn-<slug>.md`, following `packages/develop-core/.apm/skills/develop/references/adr.md`. The format is `templates/develop/ADR.md`. Reserve its number with `node tools/trace-check/trace-check.mjs --next adr`; never infer the next ID from a directory listing. `spec-lint validate` checks the result, and `trace-check --only C12` detects collisions.
6. Commit yourself, following `packages/develop-core/.apm/skills/develop/references/commit.md`, and never while a subagent Task is running. Where a release is appropriate, describe breaking changes and the migration procedure; do not imply that an old submodule host will migrate automatically.

## 5. Verification focus

| Change | Minimum check |
| --- | --- |
| Manifest / package boundary | APM recognizes the package; fresh installation contains only selected dependencies; no tools / templates are packaged. |
| Instruction | Valid `applyTo`, one concern, intended writer addresses, Claude output has `paths` without losing glob meaning. |
| Skill | Invocation works; orchestration remains separate from implementation; gates and `active` / `fixed` / `phase` transitions remain with the orchestrator; references work without `.claude/`; `references/*.md` are present in every provider's output and carry no frontmatter of their own. |
| Agent | Independent producer / judge, explicit contracts, valid `x-model-tier`, correct target conversion and model policy; the develop set stays at the five roles whose separate context is justified (`tools/apm/test_projection.py` pins the tier sets). |
| Adapters | Selected neutral inputs only, generated marker and ownership checks, no overwrite of unmanaged files, stable regeneration, no resident rules on targets without lazy loading. |
| Templates / spec-lint | Required formats derive from templates. Closed vocabularies (`status`, `phase`, `pattern`, `transport`, `direction`, the 13 operation keys and 3 `errors[]` item keys, `DEFERRED.md` row grammar) remain executable lint authority; one failure example per error code on `fixed` contracts. Preserve baseline ratchet and judgment-free conversion notes. |
| trace-check | Traceability only: C1–C14; no duplicate format checking. Preserve `--only`, monotone baseline, and `--next` reservations. |
| contract-run | Executes contract examples only through `traceconfig.json` `commands.contract_adapter`; an undeclared adapter is reported as "not executed", never as a pass; no baseline file; `skip` replies are listed, never counted as pass. |
| gate-hook / stop-gate | Explicit opt-in in host settings; no automatic injection. PreToolUse reads phase from `UC.md`; Stop runs spec-lint → trace-check → contract-run → `commands.*` from traceconfig only (never guessed), skips on an unchanged tree, releases at `--max-rounds` when `stop_hook_active`. Both append the reject log; allow docs, harness assets, `.harness-gate/`, and trace configuration writes. |
| Installation / docs | Commands match actual help, fresh install and existing-host migration are distinguished, APM and legacy ownership do not overlap. |

The quality axes are package isolation, reference integrity, zero-residency, and preserved process semantics. Packaging checks do not substitute for a real provider session when evaluating delegation or model selection.
