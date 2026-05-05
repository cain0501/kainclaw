# Project Instructions for AI Agents

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for task tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```
<!-- END BEADS INTEGRATION -->

## Session Start — Read In This Order

1. `AGENTS.md` — rules and constraints (always)
2. `.kiro/CURRENT_STATE.md` — active task + test baseline (always)
3. `.kiro/primers/<beads-id>.md` — task-specific session entry point (always)
4. Other `.kiro/` docs only if the primer explicitly requests them

**Do NOT load `CLAUDE_HANDOFF.md` or `implementation-memory.md` by default.**

## Working Rules

- Full project rules and workflow are in `AGENTS.md`.
- Use `bd` for task state, claiming, and dependencies.
- Use Claude memory system (`~/.claude/projects/.../memory/`) for user preferences and cross-session context.
- `.kiro/implementation-memory.md` — long-term implementation conclusions (load on-demand only)
- `.kiro/official-gap-analysis.md` — parity boundaries (load only for Claude parity work)
- Push to remote only when the user requests it, at phase checkpoints, or when AGENTS.md explicitly requires it (every 5 user-facing items).
