# Task Primer: vscode-extension-6zc - inferredRatio 映射到真实支持的生图 size

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Make Image Lab stop claiming an inferred ratio has been preselected unless that ratio is actually mapped to a real backend-supported size. The fix must use the image backend's currently supported size enum and align both the UI copy and the concrete `size` parameter sent downstream.

## Out of Scope

- Do not redesign the Image Lab UI
- Do not add new backend endpoints or provider-specific branching
- Do not change patchEngine or non-image design patch behavior
- Do not touch `src/webviewHtml.ts`

## Already Completed

- [x] `img` popover already infers a semantic ratio and passes `inferredRatio` through `replaceCtx`
- [x] Image Lab already auto-selects a preset from that ratio, but the mapping is currently misleading

## Next Step (the ONLY thing to do this session)

Replace the loose ratio-to-size behavior with an explicit mapping table derived from the currently supported backend sizes, and update the UI text so it advertises the mapped real size/spec rather than an unsupported raw ratio.

**Do:** inspect supported image size enums, define one mapping table, wire `inferredRatio` through that mapping, and correct the Image Lab preselect copy
**Files:** `electron/renderer/index.html`, `src/imageGeneration/imagePromptSizing.ts`, `src/imageGeneration/imagePromptSizing.test.ts`
**Test:** `npm test && npm run check && npm run build && npm run build:electron`

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

Manual test:
- Step 1: select a wide `img` near 2:1 and confirm the popover advertises the nearest supported generated spec, not raw `2:1`
- Step 2: open Image Lab from square / landscape / portrait img slots and confirm the preset matches the advertised supported size and remains editable

## Risk Points

- Risk: renderer inline-script regressions -> Guard: keep changes local to ratio helpers / Image Lab preselect copy and run `npm run build:electron` immediately
- Risk: prompt-based size inference drifting from UI ratio inference -> Guard: reuse the same supported-size mapping policy in `src/imageGeneration/imagePromptSizing.ts`

## High-Risk Files Touched

- `electron/renderer/index.html` -> only the inferred ratio helpers, img popover copy, and Image Lab preselection path

## Reference (only load if stuck)

- Beads: `bd show vscode-extension-6zc`

## Definition of Done

- [ ] inferred ratios map to real supported backend sizes only
- [ ] UI copy shows the real mapped supported size/spec instead of an unsupported raw ratio
- [ ] prompt-based ratio parsing follows the same supported-size policy
- [ ] `npm test` passes
- [ ] `npm run check` passes
- [ ] `npm run build` passes
- [ ] `npm run build:electron` passes
