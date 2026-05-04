# Task Primer: vscode-extension-8ud - patch 完成后生成中状态不清除

> Session entry point. Read this first. Keep scope limited to patch request / patch result loading state cleanup.

## Task Goal

Fix the Design patch flow so after a successful patch the left panel no longer stays stuck in the "生成中..." loading state. This matters because the patch itself completes, but the UI remains blocked and looks broken.

## Out of Scope

- Do not redesign the patch popover UI
- Do not change selector generation or patch matching here unless required by the flag cleanup fix
- Do not change Design Home, canvas toolbar, or last-opened routing
- Do not touch these files: `src/extension.ts`, `src/webviewHtml.ts`

## Already Completed

- [x] Patch target delivery from iframe to host now works
- [x] Target element matching path was repaired separately

## Next Step (the ONLY thing to do this session)

Trace which loading flag is set during patch submit and make sure the patch success path clears every relevant loading flag before re-rendering.

**Do:** inspect patch submit + patch result handlers, then clear the right combination of flags on success
**Files:** `electron/renderer/index.html`, `electron/ElectronChatPanel.ts` (only if host message type is wrong)
**Test:** `npm test && npm run check && npm run build && npm run build:electron`

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

Manual test:
- Step 1: Enter Select mode, click an element, submit a patch
- Step 2: Confirm the canvas updates and the left-panel "生成中..." state disappears

## Risk Points

- Risk: clearing the wrong flag may hide real in-flight work
  Guard: inspect both patch submit and all patch success handlers before editing
- Risk: `electron/renderer/index.html` is high-risk and easy to regress
  Guard: keep edits scoped to patch submit/result state and compile immediately

## High-Risk Files Touched

- `electron/renderer/index.html` -> only patch submit / patch result / loading-state render regions

## Reference

- Beads: `bd show vscode-extension-8ud`

## Definition of Done

- [ ] `npm test` passes
- [ ] `npm run check` passes
- [ ] `npm run build` passes
- [ ] `npm run build:electron` passes
- [ ] Patch success clears the stuck loading state
- [ ] Beads notes updated with what changed and the next step
- [ ] `bd close vscode-extension-8ud` executed if fixed end-to-end
