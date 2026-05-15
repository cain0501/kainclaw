# Task Primer: vscode-extension-gqr - v3: canonical history authority

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Lock `DesignProjectStore.conversationHistory` as the only canonical persistent source for design-chat history. `SessionRuntimeState.designFlowState.conversationHistory` must become a runtime projection for hydration/routing only, not an independently persisted truth source.

## Out of Scope

- Do not change lifecycle cleanup / ghost row behavior
- Do not add renderer-facing new error contracts
- Do not touch image ownership/provenance
- Do not touch these files: `electron/renderer/index.html`, `src/webviewHtml.ts`, `src/imageGeneration/**`

## Resume Context (MANDATORY - update after every session)

**Last session date:** 2026-05-15
**Last action taken:** Implemented canonical project-store history authority, stripped persisted session-state conversationHistory, and updated regression coverage for in-memory projection plus legacy lazy backfill.
**Why it was done that way:** D2 requires project store to be the only durable source before lifecycle cleanup and binding-error work can be made reliable.
**Exact next action:** Start `vscode-extension-sez` and implement transient draft visibility + ghost-row prune + formal promote trigger on top of the new canonical history behavior.
**Known blockers / watch out:** `electron/ElectronChatPanel.ts` is high-risk; keep the edit scoped to design runtime save/restore and project-switch history repair only.

## Already Completed

- [x] Read `.kiro/CURRENT_STATE.md`
- [x] Read `.kiro/specs/v3-design-project-lifecycle-pre-spec.md` Section 6 D2
- [x] Confirmed `saveCurrentSessionRuntimeState()` currently persists `currentDesignFlowState` wholesale
- [x] Confirmed project-switch path already has one-way legacy repair when project history is empty

## Next Step (the ONLY thing to do this session)

**Do:** Make design chat history persist only through `DesignProjectStore`, with runtime-state history rebuilt as a projection during restore/switch flows.
**Files:** `electron/ElectronChatPanel.ts`, `src/storage/sessionRepository.ts`, `electron/ElectronChatPanel.test.ts`, `.kiro/CURRENT_STATE.md`
**Test:** `npm test -- electron/ElectronChatPanel.test.ts src/storage/sessionRepository.test.ts && npm run build`

## Verification

```bash
npm test -- electron/ElectronChatPanel.test.ts src/storage/sessionRepository.test.ts
npm run build
```

Manual test (only if UI/Electron behavior is affected):
- Step 1: Open a design project that already has project-level history and confirm history still appears after switch/reopen.
- Step 2: Reopen a legacy design session whose project history is empty and confirm one-way repair still backfills project history.

## Risk Points

- Risk: dropping persisted runtime history without replacement breaks design-chat restore after restart
- Guard: restore `currentDesignFlowState.conversationHistory` from project store or transcript projection before returning control
- Risk: accidental scope creep into lifecycle or renderer behavior
- Guard: only edit design runtime save/restore and related tests

## High-Risk Files Touched

- `electron/ElectronChatPanel.ts` -> only design runtime save/restore, design session hydration, and project-switch history repair blocks

## Reference (only load if stuck)

- Spec: `.kiro/specs/v3-design-project-lifecycle-pre-spec.md`
- Beads: `bd show vscode-extension-gqr`
- Related regression tests: `electron/ElectronChatPanel.test.ts`

## Definition of Done

- [x] `DesignProjectStore.conversationHistory` is the only persisted design-chat history source
- [x] Session runtime state no longer writes design `conversationHistory` as durable truth
- [x] Legacy `session -> project` backfill remains one-way repair when project history is empty
- [x] `npm test -- src/storage/sessionRepository.test.ts` passes; `electron/ElectronChatPanel.test.ts` now matches the HEAD pre-existing 9-test failure baseline after the gqr-specific lazy-migration coverage fix
- [x] `npm run build` passes
- [x] Beads notes updated with what changed + exact next step

