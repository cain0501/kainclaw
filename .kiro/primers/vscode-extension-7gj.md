# Task Primer: vscode-extension-7gj - Restore full design history when switching recent works

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

When a user opens an existing design project from Recent works, the renderer must receive the project's full persisted conversation history. This prevents the design chat from showing only the final session message after a project switch.

## Out of Scope

- Do not redesign design-project persistence or session ownership.
- Do not change renderer code, message card rendering, or normal chat history behavior.
- Do not modify project metadata, image results, or the deferred project-first v3 migration.

## Resume Context

**Last session date:** 2026-07-23
**Last action taken:** Updated design-history IPC to prefer project history and added focused regression coverage for persisted, legacy-backfilled, and empty-history projects.
**Why it was done that way:** Project-level history is already the authoritative persisted source for a design project; session messages remain a compatibility fallback only.
**Exact next action:** Manually open a multi-turn saved design project from Recent works and verify every turn appears after switching away and back.
**Known blockers / watch out:** No automated blocker. Manual validation requires an existing multi-turn saved project in the Electron app.

## Already Completed

- [x] Located the data-boundary mismatch between project-history loading and renderer IPC emission.
- [x] Changed `postDesignChatHistoryForSession()` to emit project history before the session-transcript fallback.
- [x] Added ElectronChatPanel regression coverage for persisted, migrated legacy, and empty-history fallback paths.
- [x] Ran focused/full tests, typecheck, main build, and Electron build.

## Next Step

**Do:** Manually verify a multi-turn Recent works project renders all saved messages after switching projects.
**Files:** None
**Test:** Electron manual check only

## Verification

```bash
npm test -- electron/ElectronChatPanel.test.ts
npm test
npm run check
npm run build
npm run build:electron
```

Manual test:
- Open a design project in Recent works that contains multiple prompt/response turns.
- Confirm every stored turn appears in the left design chat, then switch to another project and back.

## Risk Points

- Risk: Legacy projects may not contain project-level history. Guard: retain session-transcript fallback when project history is empty.
- Risk: Project history entries and `ChatMessage` have different shapes. Guard: use the existing renderer-message conversion path with a minimal, stable adapter.

## High-Risk Files Touched

- None. `electron/ElectronChatPanel.ts` is in scope only for `postDesignChatHistoryForSession()` and its local message conversion helper, if needed.

## Definition of Done

- [x] Design project history is preferred over an incomplete session transcript when emitting `design:chat:history`.
- [x] Empty project history still falls back to the session transcript.
- [x] Focused and full test suites, typecheck, main build, and Electron build pass.
- [x] Beads, current state, and this primer are updated with the concrete next step.
