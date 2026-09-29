# goal-status

A zero-dependency Node tool bundled with the harness that **derives, for every `active` GOAL, whether it
holds right now** — so a human can see where a project stands without asking the AI (why: `docs/adr/ADR-0038`).

- **The denominator is the human's**: the `active` GOALs. Promoting a GOAL out of the backlog and turning
  it `active` are human gates, so nothing the AI writes can grow or shrink what is being measured
- **The numerator is the machine's**: the terminal list's results and trace-check's violations. `phase:` in
  `UC.md` is the orchestrator's own claim, so it **never decides a state**; it is shown, and a claim that
  disagrees with the observation is counted
- **It is a report, not a gate.** It blocks nothing and its exit code does not reflect the state. The gate
  is `../gate-hook/stop-gate.mjs`; both run the same list (`../gate-hook/suite.mjs`)
- **What it generates** is derived and never stored: no file is written, nothing is committed (R-1003).
  Every report carries the time of observation and the commit it observed

```bash
node goal-status.mjs [--root .] [--config traceconfig.json] [--docs docs]   # the table, for a human
node goal-status.mjs --json                                                 # one JSON object, for an aggregator
node goal-status.mjs --no-run                                               # do not execute the host's commands
node goal-status.mjs --timeout 600                                          # seconds per step (default 600)
```

Exit codes: `0` = a report was produced, **whatever the states are** / `2` = usage or configuration error
(no `traceconfig.json`, unreadable trace-check output). Node only.

## The three states

| State | Holds when |
| --- | --- |
| `true` | the GOAL has conditions (at least one `active` REQ under an `active` UC), no violation names anything in its subtree, **and** the terminal list ran and passed with `commands.test` actually executed |
| `false` | a trace-check violation names the GOAL, one of its UCs, or one of its REQs — **baselined violations included** |
| `unobserved` | neither can be said. The reason is one of the closed vocabulary below |

| Reason | Meaning | Whose move |
| --- | --- | --- |
| `no-conditions` | no `active` REQ exists under the GOAL (or under one of its `active` UCs — `detail` names them). There is nothing to observe yet. A GOAL with no UC at all lands here, never on `true` | the human's: define and approve the spec |
| `gate-red` | a step of the terminal list failed or timed out (`detail` names the steps). A red suite does not say whose test failed, so no GOAL without a violation of its own is judged | the AI's: make the list green |
| `not-executed` | the tests did not run: `commands.test` is undeclared, or `--no-run` was given. An undeclared command is never a pass | the host's: declare `commands.test` |

The order is fixed: `no-conditions` → `false` → `gate-red` → `not-executed` → `true`. A GOAL's state is
decided from its whole subtree; each `active` UC under it carries its own state by the same rule.

**The baseline does not make anything true.** `.trace-baseline.json` exists so that known debt does not
block; it is not evidence. A baselined "REQ-012 has no test" keeps the terminal list green and keeps its
GOAL `false`.

## What is read, and what is run

| Input | Source |
| --- | --- |
| The tree (GOAL → UC → REQ), statuses, `phase:`, and violations with the IDs they name | `trace-check --json` — goal-status parses no docs itself |
| The terminal list's results | `../gate-hook/suite.mjs`: spec-lint → trace-check → contract-run → `commands.typecheck` → `lint` → `test` → `system`, from `traceconfig.json` only, never guessed |
| Deferred findings | the rows of `docs.verification_deferred` (default `docs/verification/DEFERRED.md`); a row whose target path lies under a GOAL's directory is counted on that GOAL |
| Commit, branch, uncommitted paths | `git`, read before the list runs. All `null` outside a repository |

Deferred findings are shown beside the states and change none of them: they are what the machine cannot
judge, not violations.

## Output

The table lists every `active` GOAL on one line and expands only the ones that are not `true`. Violations
are capped per UC; `--json` carries all of them.

```
goal-status: my-app @ 3f2a1bc（main、未コミット 4 件）  観測 2026-09-30T01:20:11.000Z
終端リスト: 緑  spec-lint:pass trace-check:pass contract-run:skip typecheck:pass lint:pass test:pass system:skip
成立 2 / 4（偽 1、未観測 1）  保留 3 件  申告との食い違い 1 件

  真      GOAL-01  案件を登録したい
  偽      GOAL-02  案件を検索したい
            UC-004 [完了] 偽  条件 6 / 違反 1  ← 申告は完了
              [C1] REQ-031 を被覆するテストが存在しない（未検証の要件）（baseline 済み）
  真      GOAL-03  案件を共有したい
  未観測  GOAL-04  案件を集計したい（条件が未定義）
            active な UC が無い（draft 1 件）
```

`--json` prints one object:

| Key | Content |
| --- | --- |
| `schema` | `1`. Raised on a breaking change to this shape |
| `project` | the root directory's name |
| `observed_at` | ISO 8601, the moment the run started |
| `commit` / `branch` / `dirty` | the observed commit, its branch, and the number of uncommitted paths (`null` outside git) |
| `gate` | `{ ok, executed, failed: [step], steps: [{ step, state, why?, ms? }] }` — `state` is `pass` \| `fail` \| `timeout` \| `skip` (undeclared) \| `not-run` (declared, not executed) |
| `summary` | `{ goals, true, false, unobserved, deferred, phase_disagreements }` |
| `goals[]` | `{ id, dir, statement, state, reason, detail, conditions, drafts, deferred, violations, ucs }`. `violations` holds the ones naming the GOAL itself or a UC that is not listed (draft / withdrawn) |
| `goals[].ucs[]` | the `active` UCs: `{ id, title, phase, state, reason, detail, conditions, phase_disagrees, violations }` |
| `unattributed[]` | violations naming nothing in the tree (a dead BR, a layering breach, an unannotated test …) |

Each violation is `{ check, ids, message, baselined }`, exactly as trace-check emitted it.

`phase_disagrees` is `true` when a UC claims `phase: 完了` while the machine found a violation in it or
found no condition at all. It is not counted while the list is red or not executed — there is no
observation to disagree with.

## What a state does and does not tell

- **Granularity is the suite.** `commands.test` is one shell line with one exit code, so a red run cannot
  be pinned on a GOAL. goal-status then reports `gate-red` for every GOAL that has no violation of its
  own rather than guessing. Per-test attribution is not implemented
- **`true` is "established by the definition of done", not "correct".** It inherits everything
  trace-check's green leaves to review (`../trace-check/README.md`, *What green does and does not
  guarantee*) and everything `docs/verification/GLOBAL.md` declares unverified
- **The observation is of the working tree**, not of `HEAD`. `dirty` says how far the two are apart; an
  aggregator that wants the state of a commit runs this in a clean checkout (CI)
- **GOALs cover behaviour.** Release, deployment, and KPI are outside the tree and outside this report

Regression tests: `node --test "tools/goal-status/test/*.test.mjs"` (a minimal docs tree is written to a
temp dir per case).
