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

## Working Rules

- Full project rules and workflow are in `AGENTS.md`. Read that first.
- Use `bd` for task state, claiming, and dependencies.
- Use Claude memory system (`~/.claude/projects/.../memory/`) for user preferences and cross-session context.
- Use `.kiro/implementation-memory.md` and `.kiro/official-gap-analysis.md` for long-term implementation conclusions and parity boundaries.
- Push to remote only when the user requests it, at phase checkpoints, or when AGENTS.md explicitly requires it (every 5 user-facing items).
