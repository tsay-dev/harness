# AGENTS.md — Codex entry for this repository

Read [`CLAUDE.md`](./CLAUDE.md) before modifying this repository. The source of truth is the vendor-neutral APM packages under `packages/`, plus `tools/` and `templates/`. Conversation, deliverables under `docs/`, commit messages, and in-code comments are in Japanese.

- **Never hand-edit generated provider directories:** `.claude/`, `.agents/`, `.codex/`, `.cursor/`, and `.grok/`. Change the neutral source, then regenerate the selected packages. `.claude/` is not an authority for any target.
- Follow [`docs/apm.md`](./docs/apm.md) for package selection, generation, and verification. There is no default all-in-one package. Do not combine APM and legacy `init.sh` output in the same consumer.
- Legacy Codex model catalog IDs live in `tools/codex-sync/models.json`; regenerate after changing that file. Native APM and the legacy adapter have different model handling; do not patch installed agents by hand.
- Host-specific facts belong in that host's `AGENTS.md` or `CLAUDE.md`. This file is only the harness repository's working entry and does not duplicate its working guide.
