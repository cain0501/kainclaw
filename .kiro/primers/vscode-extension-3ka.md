# Task Primer: vscode-extension-3ka - v3: image ownership writeback - light provenance on use

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Add light image provenance so an image record remembers the most recent design project that actually used it, without turning generation-time gallery items into project-owned assets.

## Out of Scope

- Do not add hard project ownership at generation time
- Do not backfill historical gallery items heuristically
- Do not change lifecycle cleanup or history authority
- Do not touch these files: `electron/renderer/index.html` unless strictly required for display only

## Resume Context (MANDATORY - update after every session)

**Last session date:** 2026-05-15
**Last action taken:** Added optional `lastUsedByProjectId` to image gallery items and wrote it back only from the successful `design:patchImageNode` path.
**Why it was done that way:** D3 explicitly allows only light provenance on actual use, so generation-time items stay globally unowned and no historical gallery backfill is attempted.
**Exact next action:** Manual Electron smoke: generate one image without using it, then write a different image into a design and confirm only the used record gains `lastUsedByProjectId` in `gallery.json`.
**Known blockers / watch out:** Full `npm test` still fails in unrelated dirty-baseline suites (`rendererMarkdown`, `rendererThinkingSummary`, and existing design-chat artifact tests); 3ka-specific focused checks are green.

## Already Completed

- [x] Product decision locked in pre-spec Section 6 D3
- [x] Beads issue created
- [x] Queue order decided: after `vscode-extension-ut1`
- [x] `ImageLabResultItem` now supports optional light project provenance
- [x] Only successful design image writeback updates `lastUsedByProjectId`
- [x] Focused tests cover gallery persistence and patch-image provenance writeback

## Next Step (the ONLY thing to do this session)

**Do:** After binding-contract work lands, add light project-use provenance on image insert/replace flows only.
**Files:** `src/imageGeneration/imageLabGalleryStore.ts`, `src/imageGeneration/imageLabRuntime.ts`, `electron/ElectronChatPanel.ts`, related tests
**Test:** `npm test && npm run build`

## Verification

```bash
npm test
npm run build
```

Manual test (only if UI/Electron behavior is affected):
- Step 1: Insert or replace an image in a design project and confirm the gallery record stores the last used project id.
- Step 2: Generate a new image without using it and confirm no project ownership is written.

## Risk Points

- Risk: accidentally makes gallery items project-owned at creation time
- Guard: only write provenance in insert/replace handlers, never in generation result creation

## High-Risk Files Touched

- `electron/ElectronChatPanel.ts` -> only design/image bridge handlers

## Reference (only load if stuck)

- Spec: `.kiro/specs/v3-design-project-lifecycle-pre-spec.md`
- Beads: `bd show vscode-extension-3ka`

## Definition of Done

- [x] Image usage writes light last-used project provenance
- [x] Generation-time gallery records remain globally unowned
- [x] No historical backfill is attempted
- [x] Verification commands pass
