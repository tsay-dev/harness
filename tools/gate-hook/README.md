# gate-hook — machine enforcement of the develop gates (opt-in Claude Code hooks)

Two hooks and one shared log that turn the develop skill's persuasive stop lines into structural ones:

| Hook | Claude Code event | What it stops | Script |
| --- | --- | --- | --- |
| **Implementation-start gate** (§2) | `PreToolUse` (Write / Edit / NotebookEdit) | Writing implementation code before the UC and its REQs are `active` and the contract is `fixed` | `gate-hook.mjs` |
| **Terminal gate** | `Stop` | Ending the turn while spec-lint, trace-check, contract-run or the host's typecheck / lint / test still fail | `stop-gate.mjs` |
| **Reject log** | (shared) | Records every gate decision as one JSONL line, so "does this gate actually stop anything?" is answered from data | `gate-log.mjs` |

- **The develop process works without them** (§2 is a self-check, and the spec-lint gate is a post-hoc
  check at commit time). The hooks add a third net: **a stop line that physically halts at the moment of
  writing, and one that halts at the moment of stopping**.
- **Enabling them is up to the host project.** The harness bundles only the scripts and these
  instructions (installation — the wiring into settings — is each project's responsibility; see the
  "bundled machine checks" section of the README).

## gate-hook — the implementation-start gate (PreToolUse)

1. The hook fires immediately before Write / Edit / NotebookEdit and receives the target path.
2. If the target is "implementation code" (it matches a `--code` glob), it reads the `phase:` frontmatter of every `docs/goals/**/UC-*/UC.md` (the progress ledger lives there — no ledger file is committed, R-1003).
3. It verifies, **for every UC whose phase is 実装 (implement) or 検証 (verify)**, that the UC is `active`, none of its REQs is still `draft`, and its `contract.yaml` is `fixed`.
4. If anything is missing it **blocks the tool call with exit 2** and sends the reason (which UC is missing what, and the return-point phase) back to the AI on stderr. This halts regardless of the AI's intent.

Because the UC's own frontmatter is the machine-readable gate state, **there is no extra state file**. As
long as the orchestrator advances `phase:` per the SKILL's procedure, that is exactly what the hook judges from.

### Decision rules

| Write target | Decision | Logged |
| --- | --- | --- |
| Under `docs/` (UC, REQ, contract), `traceconfig.json`, `.trace-baseline.json`, `.harness-gate/` | Always allowed (writing the SSOT is the gate's precondition) | no |
| Under `.claude/` / `.agents/` / `.codex/` / `.cursor/` / `.grok/` / `apm_modules/` / `.harness/`, matching `--exclude`, or not matching `--code` | Allowed (outside the gate) | no |
| Implementation code + no `docs/goals` | **Blocked** (`no-goals` → Phase 1) | yes |
| Implementation code + no UC with phase 実装\|検証 | **Blocked** (`no-active-phase`; advance the UC's `phase:` before starting) | yes |
| Implementation code + an in-progress UC not `active`, a `draft` REQ in it, or its contract absent / not `fixed` | **Blocked** (`uc-not-active` / `req-draft` / `contract-missing` / `contract-not-fixed` → Phase 1 / Phase 3) | yes |
| All of the above satisfied | Allowed (`pass` / `ok`) | yes |

Only writes that reach the gate judgment are logged, so the log's denominator is "gated writes" and the block rate reads directly.

An internal error in the hook itself (malformed stdin and the like) **fails open** (allows) — a bug in
the hook must not break the session. The gate decision itself, conversely, **fails closed** — with no
SSOT, it halts.

### Arguments (all configuration lives here; no config file is added)

| Argument | Meaning |
| --- | --- |
| `--code <glob>` | Paths treated as implementation code, i.e. gated (repeatable, **required**). e.g. `'src/**'` `'app/**'` `'db/schema.*'` |
| `--exclude <glob>` | Paths excluded from `--code` (repeatable). e.g. the skeleton's workspace `'skeleton/**'` |
| `--docs <dir>` | The docs root (default `docs`) |
| `--log <path>` | The reject log (default `.harness-gate/log.jsonl` under the project root). Relative paths resolve against the project root |

- Enabled without `--code`, it blocks nothing and only warns (exit 1 — for detecting a misinstallation; logged as `skip` / `misconfig`).
- The globs are a minimal implementation supporting only `**` / `*` / `?` (matched against paths relative to the project root).

## stop-gate — the terminal gate (Stop)

Fires when the main agent is about to end its turn. It runs the host's verification suite and, if
anything fails, **blocks the stop with exit 2** and feeds the failing steps' tail output back to the
model as the reason to continue. The model then fixes what failed and tries to stop again.

### Run order

| # | Step | Runs when | On failure |
| --- | --- | --- | --- |
| 1 | `spec-lint validate --docs <docs>` | always | collected |
| 2 | `trace-check` | `traceconfig.json` exists (else `skip: traceconfig.json 無し`) | collected |
| 3 | `contract-run` | `commands.contract_adapter` is declared (else `skip: commands.contract_adapter 未宣言 — 契約の実行検査は行われていない`) | collected |
| 4 | `commands.typecheck` → `commands.lint` → `commands.test` | each key that is declared (else `skip: commands.<k> 未宣言`) | stops at the first failure |

Steps 1–3 always run so that every failure is reported at once. Step 4 stops early because running
tests on code that does not typecheck is noise. A step that exceeds `--timeout` is a failure named
`timeout:<step>`.

**Commands come only from `traceconfig.json`'s `commands` block and are never guessed.** An absent key
is reported as skipped on stdout (shown to the user as context), never invented from `package.json` or
the like. Bundled tools resolve relative to this script's own directory, so they work from `.harness/`.

### Skip rules and convergence

- **No changes**: the hook hashes `git rev-parse HEAD` + `git status --porcelain` + `git diff HEAD`
  (excluding its own state directory). If the hash equals the one recorded at the last pass, it prints
  `[stop-gate] 変更なし（最終合格 <ts>）` and allows the stop without re-running anything. `--force`
  disables this.
- **Wrong event**: anything other than `hook_event_name: "Stop"` is allowed and logged as `skip` / `wrong-event`.
- **Round cap**: Claude Code sets `stop_hook_active: true` when the model is already continuing because
  a Stop hook blocked it. When that is set and the session has already failed `--max-rounds` times in a
  row, the hook **releases** (exit 0) with `[stop-gate] 非収束: ...` instead of blocking again, and the
  remaining failures go to a human. The same release happens when the failure set has not shrunk for
  two consecutive rounds (`non-decreasing`). Rounds reset when the session id changes, on a pass, and
  after a release.
- State (`last_pass` fingerprint, per-session round count and failure history) lives in
  `state.json` next to the log (default `.harness-gate/state.json`). Add `.harness-gate/` to the host's
  `.gitignore`.

### Fail-open vs fail-closed

| Situation | Result |
| --- | --- |
| A verification step fails or times out | **Blocked** (exit 2) — the gate's own judgment is fail-closed |
| stdin unreadable, an exception inside the hook | Allowed (exit 0, logged as `internal-error`) — a broken hook must not wreck the session |
| Unknown `--` argument | exit 2 with a usage line (a misinstallation should be visible immediately) |

### Arguments

| Argument | Meaning |
| --- | --- |
| `--docs <dir>` | The docs root passed to spec-lint (default `docs`) |
| `--config <path>` | The trace configuration (default `traceconfig.json` under the project root) |
| `--log <path>` | The reject log (default `.harness-gate/log.jsonl`). `state.json` is kept in the same directory |
| `--max-rounds <n>` | Consecutive blocked rounds per session before releasing to a human (default `2`) |
| `--timeout <sec>` | Per-step timeout (default `300`). Keep the hook's own `timeout` in settings above the sum you expect |
| `--tail <n>` | Lines of each failing step's output fed back to the model (default `15`) |
| `--force` | Re-run even when the tree is unchanged since the last pass |

## Installation (in the host project)

Add this to `.claude/settings.local.json` (personal, uncommitted; stays within the host project even
under a submodule placement):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/.harness/tools/gate-hook/gate-hook.mjs\" --code 'src/**' --code 'app/**'"
          }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/.harness/tools/gate-hook/stop-gate.mjs\"",
            "timeout": 600
          }
        ]
      }
    ]
  }
}
```

The `Stop` entry has no `matcher` — it fires on every stop. Either hook can be installed alone.

Keep these opt-in hooks in the host's `.claude/settings.local.json`. Do not modify generated prompt directories or turn `settings.json` into a rules router.

## Reject log

Both hooks append one JSON line per decision to `.harness-gate/log.jsonl` (override with `--log`).
A logging failure never stops a gate. Record shape (keys in this fixed order):

| Key | Value |
| --- | --- |
| `ts` | ISO timestamp |
| `hook` | `gate-hook` \| `stop-gate` |
| `event` | `PreToolUse` \| `Stop` |
| `session` | Claude Code `session_id`, or `null` |
| `decision` | `block` \| `pass` \| `skip` \| `release` |
| `reason` | gate-hook: `misconfig` `no-goals` `no-active-phase` `uc-not-active` `req-draft` `contract-missing` `contract-not-fixed` `ok`. stop-gate: `ok` `no-changes` `wrong-event` `round-cap` `non-decreasing` `internal-error`, or on a block the first failed step name (`spec-lint` `trace-check` `contract-run` `typecheck` `lint` `test`, `timeout:<step>`) |
| `target` | gate-hook: the gated file path relative to the root. Otherwise `null` |
| `uc` | gate-hook: the ids of the in-progress UCs that were checked. Otherwise `null` |
| `round` | stop-gate: the round number on a block / release. Otherwise `null` |
| `failures` | stop-gate: every failed step name on a block / release. Otherwise `null` |
| `ms` | Milliseconds the decision took |

### Summarising

```bash
node .harness/tools/gate-hook/gate-log.mjs --summary [--log .harness-gate/log.jsonl] [--since 14]
```

prints, per hook, gated / block counts (gate-hook), runs / block / release / skip counts (stop-gate), a
breakdown of block reasons, and the marker `降格候補` (demotion candidate) after any hook with zero blocks
in the window.

A `jq` one-liner for the same question:

```bash
jq -r 'select(.decision=="block") | "\(.ts) \(.hook) \(.reason) \(.target // (.failures|join(",")))"' .harness-gate/log.jsonl
```

**Rule:** a gate with zero blocks over roughly 14 days of real use is a demotion candidate — it may be
costing latency without catching anything. The decision to demote (or to keep it as insurance) is made
by a human from this data; the tool only surfaces the count.

## Limits (use them knowing these)

- **Writes via Bash (`sed -i`, redirects, and so on) pass straight through** the PreToolUse gate, because
  the matcher covers only the Write/Edit family. A design that also blocks Bash misfires too often
  (obstructing builds and test runs), so it is deliberately out of scope.
- **Neither hook distinguishes the main agent from subagents** for PreToolUse. A legitimate Write by an
  implementation producer passes the same check, but legitimate implementation only happens once the UC,
  its REQs, and its contract are all in place, so the extra net is harmless (indeed it also stops a
  producer that strays).
- **`Stop` does not fire for subagent stops** (that is `SubagentStop`, which stop-gate ignores). The
  terminal gate judges the main agent's turn only.
- **Suite duration is the host's responsibility.** stop-gate runs whatever `commands` declares, on every
  stop with changes. Keep the declared commands fast (or scoped) and set `--timeout` / the hook `timeout`
  accordingly; a slow suite makes every turn slow.
- **Without git, stop-gate runs every time** — change detection needs a repository with at least one commit.
- **The walking skeleton** (§3; the explicit exception that writes behavior before the contract is fixed)
  should work outside the mainline code tree (e.g. `skeleton/`) and be excluded with `--exclude`, or be
  placed outside the gated globs.
- If a UC's `phase:` or a status drifts from reality, the PreToolUse decision drifts with it.
  spec-lint (`../spec-lint/`) and trace-check (`../trace-check/`) confirm consistency at commit time.

## Checking that it works

```bash
# PreToolUse gate
echo '{"tool_input":{"file_path":"src/x.js"},"cwd":"/path/to/project","session_id":"manual"}' \
  | node tools/gate-hook/gate-hook.mjs --code 'src/**'
echo $?   # 2 unless an in-progress UC, its REQs, and its contract are all in place (the block reason goes to stderr)

# Stop gate
echo '{"session_id":"manual","cwd":"/path/to/project","hook_event_name":"Stop","stop_hook_active":false}' \
  | CLAUDE_PROJECT_DIR=/path/to/project node tools/gate-hook/stop-gate.mjs
echo $?   # 0 when every declared check passes (skips are listed on stdout); 2 with the failing steps' tail on stderr

# Regression tests (temp directories only; nothing on disk is touched)
node --test 'tools/gate-hook/test/*.test.mjs'
```
