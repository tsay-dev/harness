# git-lint

A zero-dependency Node tool bundled with the harness that checks **branch names and commit-message
headers** against the form the develop skill's `commit.md` prescribes (*Cutting the branch* and the format
reference). It decides only what needs no judgment. Which unit a slice belongs to, which branch it was cut
from, and whether the diff matches the name stay with the orchestrator and the reviewer (ADR-0039).

## What the host declares

The check runs only where the host's `traceconfig.json` has a `git` block. Without it the tool prints that
nothing was checked and exits `0` — a skip, never a pass.

```jsonc
"git": {}                                             // single unit: branches are <type>/<topic>
"git": { "units": { "app-a": "apps/a", "ui": "packages/ui" } }   // monorepo: <unit>/<topic>, scope is a unit
"git": { "exempt_branches": ["dependabot/**"] }        // branches left unchecked (globs: ** / * / ?)
```

- `units` maps a unit name (lowercase ASCII kebab-case) to its directory. It is also where the orchestrator
  reads the units from; nothing infers them from the layout. `repo` is reserved for changes that belong to
  no unit and cannot be declared. A unit whose directory is missing is a configuration error (the
  declaration is stale).
- `exempt_branches` is for branches no agent or human of the project names (bots). A matching branch skips
  both checks and is reported as "not checked".

## What it checks

| Code | Rule |
| --- | --- |
| `B1` | The branch is `<prefix>/<topic>` — exactly one slash. The default branch and a bare unit name fail here |
| `B2` | `<prefix>` is a declared unit or `repo` (monorepo), or a commit `type` (single unit) |
| `B3` | `<topic>` is lowercase ASCII kebab-case, two to five words |
| `M1` | The header is `<type>(<scope>): <subject>` and `type` is in the closed list (`feat` `fix` `docs` `refactor` `test` `perf` `style` `build` `ci` `chore`) |
| `M2` | The subject has no trailing period (`.` or `。`) |
| `M3` | In a monorepo, `scope` is required and is a declared unit or `repo` |

A header starting with `Merge ` or `Revert "` is text git writes; it is listed and not checked. The `type`
list is the same as the table in `commit.md`, and the test suite fails when the two drift apart.

## Usage

```bash
node git-lint.mjs branch  [--name <branch>] [--root <host root>] [--config traceconfig.json]
node git-lint.mjs message (--file <path> | --range <base>..<head>) [--branch <name>] [--root ...] [--config ...]
```

| Flag | Meaning |
| --- | --- |
| `--name` | The name to check. Defaults to the current branch; required on a detached HEAD (a CI checkout) |
| `--file` | A commit-message file, as a commit-msg hook passes it (`#` lines are ignored) |
| `--range` | Every commit in the range, merge commits excluded |
| `--branch` | The name matched against `exempt_branches`. Defaults to the current branch |

Exit codes: `0` = no violation (including "not declared" and "exempt", both stated on the line) / `1` =
violation / `2` = configuration or usage error. There is no baseline: a name or a message is fixed on the
spot.

Regression tests: `node --test "tools/git-lint/test/*.test.mjs"` (a minimal host is written to a temp dir
per case).

## Where it runs

- **CI — the one that cannot be bypassed.** The reusable workflow `.github/workflows/spec-gate.yml` runs
  both commands on every pull request (the head branch name, and each commit between base and head). A
  host that already calls that workflow needs only the `git` block. To make a failure block the merge, the
  host protects its default branch and requires the status check the workflow reports (shown as
  `spec-gate / spec-gate` when the calling job is named `spec-gate`). Branch protection is the host's
  setting; the harness does not install it. Where the host cannot protect the branch (its plan does not
  offer protection for that repository), the check still runs and shows red on the pull request but
  nothing stops the merge: the stop is then the rule in `commit.md` — never merge a pull request whose
  checks are not all green — which binds the orchestrator and, by agreement, the humans.
- **The orchestrator**, right after cutting a branch (`commit.md`). This is the cheap place to catch a
  wrong name: in CI the fix is a new branch and a new pull request.
- **Local hooks**, optional and per clone:

  ```bash
  # .git/hooks/commit-msg
  node .harness/tools/git-lint/git-lint.mjs message --file "$1"
  # .git/hooks/pre-push
  node .harness/tools/git-lint/git-lint.mjs branch
  ```

## What it does not check

- That the prefix is the *right* unit (the app where the slice's user value surfaces). A diff that touches
  `apps/a` on a `repo/…` branch can be correct (a repository-wide dependency bump), so no path rule decides it.
- That the branch was cut from the default branch and not stacked on another one.
- Subject length, mood, and language; the body and the trailers (`UC:` is `spec-lint gate`'s).
- The pull-request title.
