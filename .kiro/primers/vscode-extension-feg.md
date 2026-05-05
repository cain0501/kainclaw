# Task Primer: vscode-extension-feg — img 元素 patch 返回空 + popover 按钮混淆

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Make the design patch popover match actual capability boundaries: image nodes should only offer image replacement actions, while non-image nodes should only offer text/style patch actions. This removes the current misleading mixed UI and prevents users from sending impossible img patch requests into the LLM patch flow.

## Out of Scope

- Do not redesign the overall design shell
- Do not change host-side `patchEngine` behavior beyond what the UI exposes
- Do not touch `src/webviewHtml.ts`

## Already Completed

- [x] `design:patchImageNode` deterministic image replacement IPC exists
- [x] Design -> Image Lab handoff now preserves replace context
- [x] Popover now gates controls by selected node type in `electron/renderer/index.html`
- [x] IMG selections now expose Image Lab + upload image only
- [x] Non-IMG selections now keep textarea + apply only

## Next Step (the ONLY thing to do this session)

Gate the design patch popover UI by selected node type so `img` and non-`img` nodes show different controls.

**Do:** update `renderDesignBridgePage()` and adjacent helpers so img nodes show image actions only, non-img nodes show patch textarea/apply only
**Files:** `electron/renderer/index.html` only
**Test:** `npm test && npm run check && npm run build && npm run build:electron`

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

Manual test:
- Step 1: select an `img`, confirm textarea + 应用改写 disappear
- Step 2: select a text node, confirm 去 Image Lab disappears and 应用改写 remains

## High-Risk Files Touched

- `electron/renderer/index.html` → only `renderDesignBridgePage()` and nearby patch popover display helpers

## Definition of Done

- [ ] img selection shows only image replacement controls
- [ ] non-img selection shows only patch textarea + 应用改写
- [ ] img path no longer allows the empty patchEngine error to be triggered from the UI
- [ ] `npm test` passes
- [ ] `npm run check` passes
- [ ] `npm run build` passes
- [ ] `npm run build:electron` passes
