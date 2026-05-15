# Task Primer: vscode-extension-ut1 - v3: recoverable error contract - DESIGN_PROJECT_BINDING_MISSING

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Standardize patch/edit/restore-like design write paths so missing active project binding returns a structured recoverable error with stable code `DESIGN_PROJECT_BINDING_MISSING`, instead of silently creating an empty project or surfacing a generic fault.

## Out of Scope

- Do not change canonical history authority
- Do not change lifecycle cleanup beyond consuming the stabilized save/binding paths
- Do not touch image provenance
- Do not touch these files: `src/imageGeneration/**`

## Resume Context (MANDATORY - update after every session)

**Last session date:** 2026-05-15
**Last action taken:** Unified host-side missing-binding handling across `design:editCurrent`, `design:patch`, `design:patchImageNode`, and `saveDesignVersion` restore-like exits; renderer now branches on `code === DESIGN_PROJECT_BINDING_MISSING`.
**Why it was done that way:** The spec decision is about a stable machine-readable contract, so the host now emits one shared payload shape and the renderer treats it as recoverable instead of a generic design fault.
**Exact next action:** Manual Electron smoke: remove active design binding, trigger patch/edit/image writeback, and confirm the UI sends the user back toward Recent Works without creating an empty project row.
**Known blockers / watch out:** Full `electron/ElectronChatPanel.test.ts` still has unrelated dirty-baseline failures in discovery/build-turn artifact paths; ut1 only removed the three patch/binding failures from that bucket.

## Already Completed

- [x] Product decision locked in pre-spec Section 6 D5
- [x] Beads issue created
- [x] Queue order decided: after `vscode-extension-sez`
- [x] Host write paths now return structured `DESIGN_PROJECT_BINDING_MISSING`
- [x] Renderer behavior now keys off `code` for recoverable binding loss
- [x] Targeted tests cover both bound success paths and binding-missing failure contract

## Next Step (the ONLY thing to do this session)

**Do:** After lifecycle cleanup lands, standardize host-side structured missing-binding errors and update renderer handling by `code`.
**Files:** `electron/ElectronChatPanel.ts`, `electron/renderer/index.html` or renderer message handling surface, related tests
**Test:** `npm test && npm run build && npm run build:electron`

## Verification

```bash
npm test
npm run build
npm run build:electron
```

Manual test (only if UI/Electron behavior is affected):
- Step 1: Trigger patch/edit without active project binding and confirm recoverable guidance appears.
- Step 2: Confirm no new empty project row is created.

## Risk Points

- Risk: partial rollout leaves some write paths generic and some structured
- Guard: enumerate patch/edit/patchImageNode/restore-like writes before changing code

## High-Risk Files Touched

- `electron/ElectronChatPanel.ts` -> only design write-path error exits
- `electron/renderer/index.html` -> only error handling/display block if needed

## Reference (only load if stuck)

- Spec: `.kiro/specs/v3-design-project-lifecycle-pre-spec.md`
- Beads: `bd show vscode-extension-ut1`

## Definition of Done

- [x] Missing binding returns `DESIGN_PROJECT_BINDING_MISSING` on all target paths
- [x] Renderer behavior keys off `code`, not fragile message matching
- [x] No empty project is created on missing-binding patch/edit calls
- [x] Verification commands pass
