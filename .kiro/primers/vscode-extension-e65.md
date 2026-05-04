# Task Primer: vscode-extension-e65 - patch 提交报 Target element could not be located

> Session entry point. Read this first. Do not expand beyond the selector generation / patch matching path.

## Task Goal

Fix the Design patch flow so selecting an element in the canvas and submitting a patch no longer fails with "Target element could not be located in the current HTML". This matters because the patch loop is currently blocked even though element selection and popover display work.

## Out of Scope

- Do not redesign the patch popover UI
- Do not change Design Home, canvas toolbar, or Tweaks drawer behavior
- Do not change unrelated Electron routing or persistence logic
- Do not touch these files unless required by the fix: `src/extension.ts`, `src/webviewHtml.ts`

## Already Completed

- [x] Canvas Select mode now reaches the host and surfaces `__design_patch_target`
- [x] Popover render/position path was diagnosed; current blocker is selector matching during patch apply

## Next Step (the ONLY thing to do this session)

Fix the patch handler path so the selector generated from the iframe can reliably locate the same element in the stored HTML.

**Do:** inspect selector generation and patch matching, then normalize the mismatch with the smallest safe fix
**Files:** `electron/renderer/index.html`, `src/design/patchEngine.ts`, `electron/ElectronChatPanel.ts` (only if host wiring truly needs adjustment)
**Test:** `npm test && npm run check && npm run build && npm run build:electron`

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

Manual test:
- Step 1: Enter Select mode and click a canvas element
- Step 2: Submit a patch request and confirm the design updates instead of failing with "Target element could not be located in the current HTML"

## Risk Points

- Risk: fixing selector matching too broadly may patch the wrong node
  Guard: keep the change local to selector normalization/matching and verify with current patch tests
- Risk: touching `electron/renderer/index.html` can break runtime wiring
  Guard: only modify selector generation / patch target payload if needed and compile immediately

## High-Risk Files Touched

- `electron/renderer/index.html` -> only selector generation / patch target payload code in `buildDesignPatchableSrcdoc`

## Reference

- Beads: `bd show vscode-extension-e65`

## Definition of Done

- [ ] `npm test` passes
- [ ] `npm run check` passes
- [ ] `npm run build` passes
- [ ] `npm run build:electron` passes
- [ ] Select -> patch submit updates the design instead of failing with target-not-found
- [ ] Beads notes updated with what changed and the next step
- [ ] `bd close vscode-extension-e65` executed if the bug is fixed end-to-end
