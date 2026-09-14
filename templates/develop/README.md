# templates/develop — templates for docs artifacts (the SSOT for format)

Each template is **the single format definition shared by the producer (who writes) and the lints
(who verify)**. spec-lint derives required frontmatter keys and required sections from the templates
in this directory, so revising a format means editing the template and the lint follows (no duplication).
The principles behind the layout (single parent, ID grammar, EARS, partition classes …) are the
rules leaf `packages/develop-core/.apm/instructions/docs.instructions.md` (optional package; use its installed copy), delivered by its `paths:` to whoever writes under `docs/`.

| Template | Generated into (the host project) | Author |
| --- | --- | --- |
| `00-vision.md` | `docs/00-vision.md` | spec-author (🙋 human gate → `frozen`) |
| `01-glossary.md` | `docs/01-glossary.md` | spec-author (🙋 → `living`) |
| `02-actors.md` | `docs/02-actors.md` | spec-author (🙋 → `living`) |
| `goals-backlog.md` | `docs/goals-backlog.md` | spec-author |
| `GOAL.md` | `docs/goals/GOAL-nn-<slug>/GOAL.md` | spec-author (🙋 → `active`) |
| `UC.md` | `docs/goals/GOAL-nn-<slug>/UC-nnn-<slug>/UC.md` | spec-author (🙋 → `active`); the `phase:` line by the orchestrator |
| `REQ.md` | `…/UC-nnn-<slug>/REQ-nnn.md` | spec-author (🙋 → `active`); `## 検証方針` by test-author |
| `BR.md` | `docs/rules/BR-nnn.md` | spec-author (🙋 → `active`) |
| `NFR.md` | `docs/nfr/NFR-nnn.md` | spec-author (🙋 → `active`) |
| `contract.yaml` | `…/UC-nnn-<slug>/contract.yaml` (the shape of the boundary — HTTP and non-HTTP alike) | spec-author (🤖 → `fixed` by the orchestrator) |
| `components.yaml` | `docs/_shared/components.yaml` | orchestrator only (producers report requests to add) |
| `ADR.md` | `docs/adr/ADR-nnnn-<slug>.md` | orchestrator (the develop skill's `references/adr.md`) |
| `verification-GLOBAL.md` | `docs/verification/GLOBAL.md` | test-author |
| `DEFERRED.md` | `docs/verification/DEFERRED.md` (optional) | orchestrator only — the ledger of reviewer findings that cannot become a machine check |
| `design.md` | `docs/design.md` (optional) | human (orchestrator may ghostwrite) |
| `traceconfig.json` | `traceconfig.json` at the host root | orchestrator seeds it once; the host maintains it (`commands` names the host's own checks and the contract adapter) |

A UC directory (`UC.md` + `REQ-*.md` + `contract.yaml`) is one vertical slice's SSOT, and `ls` on it
defines the slice's scope. The shape of the columns and keys comes from these templates; the judgment of
what not to write comes from each producer's craft.

- Status vocabularies: docs nodes go `draft → active → withdrawn` (`active` means a human approved it;
  the singletons use `frozen` / `living` instead of `active`); the contract goes `draft → fixed`
  (`fixed` means spec-lint is clean and, where a reviewer was launched, it found no `阻止`). A producer never advances a status itself.
- Placeholders (`GOAL-00` / `UC-000` / `REQ-000` / `BR-000` / `NFR-000` / `ADR-0000` / `ACT-00` /
  `KPI-00` / `YYYY-MM-DD` / `<...>`) must be replaced before something leaves `draft` (spec-lint verifies this).
- A frontmatter line whose comment says `optional` is optional; every other key in a template is required.
- A contract may carry a top-level `schemas:` for shapes shared by 2+ operations of that one UC
  (`$ref: "#/schemas/<Name>"`); a shape shared by 2+ UCs goes to `_shared/components.yaml`. An operation with
  `errors: []` declares that it has no failure path, and spec-lint then requires no failure example (omitting
  `errors` is not that declaration). A failure example may carry keys the request forbids.
- The keys under an operation are a closed set (spec-lint is the authority: `transport` / `direction` / `owned` /
  `source` / `auth` / `summary` / `wire` / `entry` / `requires` / `request` / `response` / `errors` / `examples`; an
  `errors` item holds only `code` / `when` / `wire`). `x-*` is rejected at the operation level. The order of `errors`
  is the evaluation order (R-1207), and a `fixed` contract carries one failure example per `errors[]` code —
  `tools/contract-run` executes every example through the host's contract adapter.
- An ADR whose comparison was never recorded (written after the fact) fills `## 却下した選択肢` with exactly
  `- **記録なし**: 当時の比較は記録されていない（移行時に付した記録）`; spec-lint accepts it, and inventing options is forbidden.
- The judgment rules for how to write (the negative lists, the craft) are not written into templates. Each producer's agent body holds them.
- **The generated artifacts are written in Japanese.** The templates carry Japanese headings and frontmatter values for exactly that reason; the English text inside them is guidance for the producer and is not part of the artifact.
