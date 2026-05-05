# Task Primer: vscode-extension-o3l - img popover 自动推算容器比例并传入 Image Lab

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Make the img patch popover expose the inferred container ratio before handoff and pass that ratio into Image Lab so the size preset is auto-selected when the user clicks "去 Image Lab 生成图". This keeps image replacement aligned with the rendered layout instead of forcing the user to choose a ratio manually.

## Out of Scope

- Do not redesign the overall popover layout
- Do not change patchEngine or text-node patch behavior
- Do not change image generation backend behavior
- Do not touch `src/webviewHtml.ts`

## Already Completed

- [x] img and non-img popover actions are already separated in `electron/renderer/index.html`
- [x] Design -> Image Lab handoff already supports a `replaceCtx`

## Next Step (the ONLY thing to do this session)

Add inferred ratio labeling to the img popover and wire the Image Lab open path to consume an `inferredRatio` route field for automatic preset selection.

**Do:** update the renderer img popover click path plus Midtai route payload typing/forwarding so inferred ratio is displayed and auto-applied
**Files:** `electron/renderer/index.html`, `src/midtaiRoute.ts`, `electron/ElectronChatPanel.ts`, `electron/rendererSettings.test.ts`
**Test:** `npm test && npm run check && npm run build && npm run build:electron`

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

Manual test:
- Step 1: select a square / landscape / portrait `img` and confirm the popover shows the inferred ratio label
- Step 2: click "去 Image Lab 生成图" and confirm the Image Lab size preset is auto-selected, while still remaining editable

## Risk Points

- Risk: renderer inline script regression in `index.html` -> Guard: keep the change local to popover/Image Lab helpers and run `npm run build:electron` immediately
- Risk: route payload shape drift between renderer and Electron host -> Guard: update `src/midtaiRoute.ts` and `ElectronChatPanel.ts` together

## High-Risk Files Touched

- `electron/renderer/index.html` -> only the img popover rendering block, ratio inference helpers, and Midtai open/preselect helpers

## Reference (only load if stuck)

- Beads: `bd show vscode-extension-o3l`

## Definition of Done

- [ ] img popover shows the inferred ratio label
- [ ] Image Lab auto-selects the inferred ratio when opened from an img popover
- [ ] users can still manually change the size preset afterwards
- [ ] `npm test` passes
- [ ] `npm run check` passes
- [ ] `npm run build` passes
- [ ] `npm run build:electron` passes
