# Task Primer: vscode-extension-sez - v3: project lifecycle cleanup - transient draft display + ghost row prune + formal promote trigger

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Implement the locked lifecycle rules from D1/D4: show transient drafts in Recent Works with draft affordance, prune truly empty pending ghost rows, and ensure formal project promotion happens only on first durable version save or artifact-to-design promote.

## Out of Scope

- Do not change canonical history authority beyond consuming the result of `vscode-extension-gqr`
- Do not add new renderer error contracts
- Do not touch image ownership/provenance
- Do not touch these files: `src/imageGeneration/**`

## Resume Context (MANDATORY - update after every session)

**Last session date:** 2026-05-15
**Last action taken:** Implemented transient draft visibility in `design:projects`, ghost-row auto-prune on startup/list refresh, and tightened formal project creation to first durable save or artifact promote only.
**Why it was done that way:** D1/D4 depend on keeping transient work in session/runtime only, while all actual formal rows must be either artifact-backed or version-backed so prune stays safe.
**Exact next action:** Manual Electron smoke for three paths: transient draft visibility in Recent Works, restart-driven ghost-row prune, and normal generate/artifact promote still producing a formal project.
**Known blockers / watch out:** Full `npm test` is still blocked by repository-wide dirty-baseline failures outside sez, including renderer markdown/thinking-summary suites and design-chat artifact build-turn tests.

## Already Completed

- [x] Product decision locked in pre-spec Section 6 D1/D4
- [x] Beads issue created
- [x] Queue order decided: after `vscode-extension-gqr`
- [x] Transient drafts now surface in Recent Works / design project payloads with draft marking
- [x] Empty pending ghost rows now auto-prune during ready/list/library refresh
- [x] Formal project creation is limited to first durable save and artifact/design promote paths

## Next Step (the ONLY thing to do this session)

**Do:** Wait for `vscode-extension-gqr`, then implement lifecycle cleanup in listing/promote/save paths with minimal UI/state changes.
**Files:** `electron/ElectronChatPanel.ts`, `src/design/designProjectStore.ts`, related tests only
**Test:** `npm test && npm run build`

## Verification

```bash
npm test
npm run build
```

Manual test (only if UI/Electron behavior is affected):
- Step 1: Create a new transient draft and confirm it appears in Recent Works with draft affordance.
- Step 2: Restart with a truly empty formal-pending row and confirm it is auto-pruned.

## Risk Points

- Risk: over-eager cleanup deletes recoverable user work
- Guard: only prune rows with no version, no sourceArtifactId, and empty history

## High-Risk Files Touched

- `electron/ElectronChatPanel.ts` -> only design project listing / open / save lifecycle regions

## Reference (only load if stuck)

- Spec: `.kiro/specs/v3-design-project-lifecycle-pre-spec.md`
- Beads: `bd show vscode-extension-sez`

## Definition of Done

- [x] Transient drafts appear in Recent Works with draft marking
- [x] Ghost rows are pruned only under the locked three-empty rule
- [x] Formal promotion triggers only on first durable save or artifact/design promote
- [x] Verification commands pass
