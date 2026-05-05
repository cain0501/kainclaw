# Task Primer: vscode-extension-9r6 — Design ↔ Image Lab 集成手测 + 修 bug

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Finish the UI-triggerable integration path between the design canvas and Image Lab so the replace flow can be exercised through the existing Electron shell, not only through underlying IPC support. This session focuses on the renderer-side bug that fails to set active replace context when sending a selected design image slot to Image Lab.

## Out of Scope

- Do not redesign the midtai shell
- Do not add persistence for `replaceCtx`
- Do not change unrelated image history / prompt library behavior
- Do not touch `src/webviewHtml.ts`

## Already Completed

- [x] `midtai:open` route contract exists
- [x] `design:patchImageNode` deterministic IPC exists
- [x] Image result cards can render `插入到设计` once `replaceCtx` is present

## Next Step (the ONLY thing to do this session)

Make the existing Design → Image Lab entry path set `replaceCtx` so the replace loop is reachable from the UI, then verify both directions still work.

**Do:** patch the renderer-side handoff around `sendDesignImageNodeToImageLab()` and any adjacent route helper it depends on
**Files:** `electron/renderer/index.html` only unless a tiny supporting test file is needed
**Test:** `npm test && npm run check && npm run build && npm run build:electron`

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

Manual test:
- Step 1: open a design, select an `img`, click “去 Image Lab 生成图”, confirm Image Lab opens with replace context active
- Step 2: generate or reuse an image result, confirm “插入到设计” appears

## Risk Points

- Risk: replacing route state handling here breaks ordinary `openImageLab()` entry
  Guard: keep ordinary image entry unchanged when there is no selected design image node
- Risk: stale selected node data leaves replace context pointing at the wrong target
  Guard: set replace context only from the currently selected design node at the moment of handoff

## High-Risk Files Touched

- `electron/renderer/index.html` → only `sendDesignImageNodeToImageLab()`, `openImageLab()`, and nearby route/replace state helpers

## Reference (only load if stuck)

- Beads: `bd show vscode-extension-9r6`
- Existing replace flow support: `insertToDesign()`, `midtaiState.replaceCtx`, `design:patchImageNode`

## Definition of Done

- [ ] Design → Image Lab handoff sets active replace context
- [ ] Image Lab results show “插入到设计” after coming from a selected design image
- [ ] Existing “从 Image Lab 选图作为 Design 参考图” path still works
- [ ] `npm test` passes
- [ ] `npm run check` passes
- [ ] `npm run build` passes
- [ ] `npm run build:electron` passes
