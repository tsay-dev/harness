# Passing rules leaves by path (scene-wide rules + framework-specific rules)

Rules (leaves) are never inlined; **passing paths** in the Task input is authoritative. The orchestrator judges the target, resolves the paths of the applicable leaves, and passes them in each producer's input (never make the agent walk a catalog itself). **Even when the framework cannot be identified, always deliver the scene-wide rules** (never skip this procedure wholesale). If several leaves apply, pass all of them. Keep the leaf as the single SSOT; never copy its content and let it drift.

> **Why by path.** Claude's generated `paths:` gate is lazy and its addressing is left to globs, which can arrive too late for a greenfield `test-author`. Explicit handoff is authoritative, and the paths gate is a free safety net. Inlining bloats the prompt and splits the SSOT, so keep it as a fallback for the rare case where paths are unstable.
>
> **Do not write any specific framework name or list of leaf files in this file.** Naming them pollutes context even on projects that use no such framework. What this file holds is only **how to decide the destination**.
>
> **References run one way: rules → skill.** All the skill may look at about a leaf is **the leaf's path (to enumerate it) and its frontmatter `applyTo:` (to decide the destination)**.
> **Do not read a leaf's body. Do not depend on the meaning of a file name. Do not write a leaf's summary, excerpt, or section heading into the skill.**
> **What rules to write, under what file names, split how, is entirely up to the rules side**, and the skill must deliver correctly without knowing any of it.
> Knowing the content of a rule is the job of the agent that receives the leaf, not of the one delivering it. Conversely, **a leaf referencing the skill is fine** (the rules side writing "the procedure is authoritative in the skill" is the correct direction).

## Assembling a bundle

1. Find the installed `develop-core` package manifest under `apm_modules/` and enumerate its `.apm/instructions/*.instructions.md` (scene-wide rules). In legacy mode use only the packages recorded in `.harness-legacy.json` and their source checkout. **Never drop the common leaves merely because the framework is unknown.**
2. Enumerate `.apm/instructions/*.instructions.md` only from the explicitly installed `rules-*` packages in `apm_modules/` (or the explicit legacy selection). Package selection is authoritative: do not search an external checkout for unselected stacks or other scenes. The source uses the official APM `applyTo` comma-separated glob field; Claude `paths` is only an output adaptation.
3. Read **only the `applyTo:` frontmatter** of each leaf (never open the body).
4. For each producer, list **the paths of the files that producer will create or edit in this launch**.
5. Pass that producer **every** leaf whose `applyTo:` matches any of the paths from step 4 (see *Deciding the destination*).

A host with no `rules-*` package installed declares its own "operation → entry" convention (which file and export a test calls for a contract operation) in its `CLAUDE.md` / `AGENTS.md`; the orchestrator passes that file as the leaf to `test-author` and `implementer` so both derive the entry from the contract and that convention, never from each other.

## Deciding the destination

Decided by `applyTo:` alone.

| Recipient | What counts as "paths it writes" |
| --- | --- |
| `spec-author` | the paths of the **docs files** created or edited in that launch (under `docs/`) |
| `test-author` | the paths of the **test files** created in that slice; plus the **docs paths** of the REQs whose `## 検証方針` it declares |
| `implementer` (`logic` / `appearance` / `probe`) | the paths of the **production code** created or edited in that slice |
| `implementer` (`schema`) | the path of the **schema source** (the host's native DB design — *Where docs artifacts live* in [playbook.md](playbook.md)) |
| the orchestrator, for its own docs writes (ADR / `DEFERRED.md`) | the **docs paths** it writes — it is the receiving agent of the matching leaves and reads them before writing |

- **Never decide the destination from a leaf's file name.** Let matching alone settle it.
- **When nothing matches at all, the narrowing is probably wrong.** Pass the common leaves **plus every leaf from the selected stack packages** (too many beats too few — code written in ignorance of a rule cannot be caught in verification). Do the same when the paths to be written cannot be determined in advance.
- **Never split a bundle.** When several implementers work in the same layer (appearance and logic), pass both the same bundle. Narrowing by written paths is not "splitting" (implementers that write the same paths get the same bundle).
- **Cross-layer delegation is also declared by `applyTo:`.** When a rule also binds addresses in another layer, that shows up as **that leaf including those addresses in its `applyTo:`**. This procedure never infers it from a leaf's body.
- If an implementer ends up writing an unplanned path mid-implementation, **it opens the leaves whose `applyTo:` match that path itself, before writing** (no need to come back to the orchestrator).
- **Tracks launched for now**: `test-author` writes **BE tests only**. Bundles for UI / FE test tracks are **not assembled and not passed**.
- Naming a new instruction and narrowing its `applyTo` is covered in the harness repository's `CLAUDE.md`. **Bundle composition is authoritative in this file.**
