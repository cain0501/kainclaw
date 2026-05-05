# Task Primer: vscode-extension-v7z — design:patchImageNode IPC：画布图片元素替换

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Close the P0 replace loop by letting the image workbench write a chosen/generated image back into the selected design canvas `<img>` element through a deterministic IPC path. This must reuse the existing design bridge and patch infrastructure without introducing persisted replace state.

## Out of Scope

- Do not redesign the whole midtai shell
- Do not persist `replaceCtx`
- Do not rewrite `patchEngine` into a model-driven flow for image replacement
- Do not touch `src/webviewHtml.ts`

## Already Completed

- [x] `midtai:open` route contract is available
- [x] `replaceCtx` is renderer-memory state only
- [x] `midtaiLibraryHost` exists for future unified library surfaces

## Next Step (the ONLY thing to do this session)

Implement `design:patchImageNode` end-to-end and wire `insertToDesign()` from Image Lab results to the selected design image node.

**Do:** add deterministic host patch handling plus renderer request/result flow for replace insertion
**Files:** `electron/ElectronChatPanel.ts`, `electron/renderer/index.html`, `src/design/patchEngine.ts`, tests if needed (max 4 files)
**Test:** `npm test && npm run check && npm run build && npm run build:electron`

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

Manual test (only if UI/Electron behavior is affected):
- Step 1: select an image node in design canvas, jump to image flow, choose “插入到设计”, confirm the canvas image updates
- Step 2: confirm replace context clears and the design surface is shown again

## Risk Points

- Risk: selector-based replacement misses the intended `<img>` node
  Guard: reuse the current `selectedNode.selector` + `selectedNode.outerHTML` fallback path from `applyDesignPatch`
- Risk: renderer clears state before host result returns
  Guard: only clear `replaceCtx` on explicit success result

## High-Risk Files Touched

- `electron/renderer/index.html` → only the image result action rendering / replace-flow handlers / message router region
- `electron/ElectronChatPanel.ts` → only message dispatch + deterministic design image patch helper
- `src/design/patchEngine.ts` → only if a reusable deterministic image-node patch helper is added

## Reference (only load if stuck)

- Spec: `.kiro/specs/midtai-ux-v1.md`
- Beads: `bd show vscode-extension-v7z`
- Existing selected-node flow: `electron/renderer/index.html` (`__design_patch_target`, `sendDesignImageNodeToImageLab`, `applyDesignPatchRequest`)

## Definition of Done

- [ ] `design:patchImageNode` request/result IPC works
- [ ] Image results can send the chosen image back to the selected design node
- [ ] Success clears `replaceCtx`, restores the design surface, and shows a success toast
- [ ] Canceling replacement sends no patch
- [ ] `npm test` passes
- [ ] `npm run check` passes
- [ ] `npm run build` passes
- [ ] `npm run build:electron` passes

## This Session

- Added deterministic `patchDesignImageNode()` in `src/design/patchEngine.ts`, reusing selector + outerHTML fallback matching.
- Host now handles `design:patchImageNode`, creates a new design version, and returns explicit success/error results.
- Renderer image result cards now switch their primary secondary action to `插入到设计` when `replaceCtx` is active, and success clears the replace context.
- Verification passed: `npm test`, `npm run check`, `npm run build`, `npm run build:electron`.
