# Committing (the orchestrator runs git itself)

You, the orchestrator, land a slice as git commits (and a PR when the human asks). There is no committer agent: you hold the intent, so you decide the split and write the message. The format reference at the end of this file is the SSOT for commit messages and PRs.

> **Language**: write commit messages and PR bodies in Japanese (the `type`, the scope, and the trailers stay in English).

## When you may commit

- **Only after the terminal list passes** (*Phase 4: behaviour* in [playbook.md](playbook.md): `spec-lint validate`, `trace-check`, `contract-run`, then the host's `commands.typecheck` / `lint` / `test`) **and the slice's reviewer pass is at zero `阻止`**. Green tests alone are not the condition.
- **Only while no Task is running.** The git index is an exclusive resource; a producer writing mid-commit corrupts the diff. Close every concurrent section first, and commit slices one at a time in order of completion.
- **One commit, one logical change.** Never mix formatting with logic; never mix two slices. You know which round produced which files — split along that line, and stack several commits when a slice landed several logical changes.
- **Conventional Commits** (`type(scope): subject`): imperative subject, no trailing period, around 50 characters; the body carries the why; the footer carries `Refs:` / `ADR-nnnn` / `UC: UC-nnn` and `BREAKING CHANGE:`. Opt in to the machine check of the `UC:` trailer with `node "${HARNESS_ROOT}/tools/spec-lint/spec-lint.mjs" gate --message <file>` (it verifies that the named UC and its REQs are `active` and its contract `fixed`).
- **A PR is one slice = one user value.** Fill in the body following the template (`.github/pull_request_template.md` if the project has one).

## Guardrails (never cross these)

- **Never commit directly to the default branch (main, etc.).** If you are on it, cut a branch first.
- **Push and PR creation happen only when the human explicitly asks.** Absent that, stop at the commit.
- **Never use `--no-verify`.** Do not bypass commit-msg / pre-commit hooks — let them run.
- Never perform destructive or irreversible operations such as `reset --hard`, `push --force`, or `clean -f`.
- If secrets (keys, tokens) appear in the diff, do not commit — stop and report.
- Limit what you commit to the slice's diff. Confirm with `git status` / `git diff` before staging, and never sweep in unrelated changes.

## Stop and route

| Condition | What you do |
| --- | --- |
| A hook fails and the fix needs code or spec changes | do not patch it yourself: send it as a constraint to the owning producer (`implementer` / `test-author` / `spec-author`), re-run the terminal list, then commit |
| Secrets in the diff | stop; the human decides (rotate, then re-stage without them) |
| Changes no round of this slice produced (stray edits, another slice's files) | leave them out of the commit; if their origin is unknown, ask the human before touching them |
| The diff contains several logical changes | split into several commits along the rounds that produced them — never one lump |

Record the sha and subject of each commit in the round ledger; commit success or failure is never escalated to the human by itself.

---

# Format reference — Git rules (commit messages / PRs)

> The format for commit messages and Pull Requests. **The SSOT for this format is this text.**
> **A PR is issued per "one slice = one user value"** (a vertical slice). Related ADRs are referenced by their ID in `docs/adr/` (`ADR-XXXX`).

## Commit message rules (Conventional Commits)

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

- Everything except **type** (required) and **subject** (required) is optional. `scope` is the area affected (e.g. `auth`, `docs`).

### The types

| type | When to use it |
| --- | --- |
| `feat` | adding a feature |
| `fix` | fixing a bug |
| `docs` | documentation only |
| `refactor` | internal improvement that does not change behavior |
| `test` | adding or fixing tests |
| `perf` | performance improvement |
| `style` | formatting only (logic unchanged) |
| `build` / `ci` | build and CI configuration |
| `chore` | other chores (dependency updates, etc.) |

### Rules for the subject (the summary line)

- **One commit, one logical change.** Never mix formatting with a logic change.
- Write it in the imperative, present tense ("〜する", "add"). No trailing period.
- Around 50 characters. What changed must be visible at a glance.
- Keep the language consistent within the team (a Japanese subject is fine, but `type` stays in English).

### body / footer

- **body**: why you changed it, and the background (what you changed is visible in the diff). Wrap around 72 characters.
- **footer**:
  - Reference related issues / ADRs: `Refs: #123` / `ADR-0007`
  - Name the corresponding use case: `UC: UC-012` (the UC ID of `docs/goals/**/UC-012-<slug>/`). That this UC and its REQs are
    `active` and its contract `fixed` is machine-verified by the spec-lint tool (`"${HARNESS_ROOT}/tools/spec-lint/spec-lint.mjs" gate --message <file>`)
    (so implementation does not proceed on a draft). Opt-in in practice.
  - Breaking changes: `BREAKING CHANGE: <description>`
  - Commits an AI took part in may carry a `Co-Authored-By:` trailer (optional).

### Example

```
feat(reservation): 予約フォームの入力検証を追加

未入力・桁あふれ・不正文字を弾く。REQ-046（Unwanted behaviour）に対応。
入力値は i_ 変数として受け、check_value で判定する。

Refs: #142
UC: UC-012
```

## Pull Request rules

- **One PR = one slice (one user value).** Keep it small and reviewable. Always issue it with **that user value running vertically through the stack**.
- **The title** follows the same rules as a commit (`type(scope): summary`).
- The body follows the template below. In a project, place it as `.github/pull_request_template.md`.

### PR template

```markdown
## 目的 / Why
<!-- この PR で達成すること。解決する課題。 -->

## 変更点 / What
-

## スライス
<!-- どのユーザー価値を縦貫させたか。縦に通る 1 本か。 -->

## テスト
- [ ] 追加/更新したテストと観点（失敗・空・境界・権限を含む）
- [ ] ローカルで緑（テスト緑は前提であって完成条件ではない）
- [ ] `trace-check` に新規違反なし（マージ条件 R-803）

## 関連
- Issue: #
- ADR: ADR-XXXX

## セルフレビュー
- [ ] 1 スライス（1 価値）に絞られている
- [ ] コーディング規約に沿っている
- [ ] 仕様変更は docs/goals（UC.md／REQ／contract.yaml）と docs/rules（BR）を正として更新した（逆流ルール R-801）
```

## ✅ Checklist before commit / PR

- [ ] Is this commit one logical change (no formatting mixed with logic)?
- [ ] Is the subject imperative and concise, with an appropriate `type`?
- [ ] Are breaking changes and related issues / ADRs in the footer?
- [ ] Is the PR narrowed to one slice, with that user value running vertically?
- [ ] Is every item of the PR template filled in?
