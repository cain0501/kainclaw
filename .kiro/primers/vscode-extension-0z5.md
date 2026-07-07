# Task Primer: vscode-extension-0z5 - Canvas sketch annotation overlay

> Session entry point. Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Add a lightweight sketch annotation mode over the Midtai design canvas iframe so users can visually mark areas while reviewing a generated design. This is a local UI affordance for quick communication and review, not a persisted design-editing model.

## Out of Scope

- Do not persist annotations to project/version storage.
- Do not send annotations to the model or convert strokes into patch instructions.
- Do not add collaborative cursors, multi-page annotation history, undo stacks, or export.
- Do not change iframe content, design patch logic, version store, image generation, or provider code.
- Do not add dependencies.

## Resume Context

**Last session date:** 2026-07-07
**Last action taken:** Added and verified the canvas sketch annotation overlay.
**Why it was done that way:** The feature stays as a reversible renderer-only review aid: strokes are drawn on a sibling canvas above the iframe and are never persisted into project/version storage.
**Exact next action:** Manual smoke in Electron: open a design canvas, click `标注`, draw, clear strokes, switch back to `查看` / `选择`, and confirm iframe interaction resumes.
**Known blockers / watch out:** No automated visual/manual Electron smoke was run in this session; validation is syntax/build/test plus the manual checklist below.

## Already Completed

- [x] Claimed `vscode-extension-0z5`.
- [x] Created this primer because no existing primer was present.
- [x] Added `标注` mode, a clear button, and `#midtai-canvas-annotation-layer` above the design iframe.
- [x] Added pointer drawing, clear, resize, and mode synchronization logic without touching project persistence.
- [x] Verified JS syntax, UTF-8 reads, Electron build, TypeScript build/check, and full Vitest suite.

## Next Step

**Do:** Manual smoke the annotation overlay in Electron.
**Files:** `electron/renderer/index.html`
**Test:** No code change required unless manual smoke finds a visual/interaction issue.

## Verification

```bash
node -e "const fs=require('fs'),html=fs.readFileSync('electron/renderer/index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g)||[];let js='';m.forEach(s=>{js+=s.replace(/<\/?script>/g,'')+'\n';});try{new Function(js);console.log('JS syntax OK');}catch(e){console.error('SYNTAX ERROR:',e.message);process.exit(1);}"
npm run build:electron
npm run build
npm run check
npm test
```

Manual test:
- Open Midtai design canvas with a generated design loaded.
- Click the annotation / sketch mode control.
- Draw on top of the iframe, clear strokes, exit annotation mode, and confirm normal canvas selection/view modes still work.

## Risk Points

- Risk: inline renderer script syntax break. Guard: run extracted-script syntax check immediately after edit.
- Risk: overlay blocks normal iframe interaction after exit. Guard: pointer events must only be active in annotation mode.
- Risk: resizing the iframe desynchronizes drawing coordinates. Guard: resize overlay canvas to its wrapper/client size whenever mode changes or the canvas renders.

## Architecture Traps

- [x] This task does not touch image chat rendering.
- [x] This task does not depend on postImageState IPC.
- [x] `index.html` changes require `npm run build:electron`.

## High-Risk Files Touched

- `electron/renderer/index.html` -> only the Midtai design canvas area:
  - Canvas toolbar mode buttons near `#midtai-canvas-view-btn`.
  - DOM around `#midtai-canvas-iframe`.
  - JS functions near `setMidtaiCanvasMode`, `renderDesignBridgePage`, `postMidtaiCanvasSelectMode`, and iframe message handling as needed for overlay sizing.
  - CSS for `.canvas-*` / annotation overlay classes.
- Do NOT touch chat message rendering, image chat rendering, provider flows, settings, session switching, version persistence, or design patch host logic.

## Reference

- Beads: `bd show vscode-extension-0z5`
- Current state: `.kiro/CURRENT_STATE.md`

## Definition of Done

- [x] Canvas toolbar exposes an annotation/sketch mode.
- [x] Annotation mode draws visible strokes over the iframe without modifying iframe HTML.
- [x] Clear and exit behavior works without leaving the iframe blocked by code path.
- [x] Overlay resizes with the canvas wrapper.
- [x] JS syntax check passes.
- [x] `npm run build:electron` passes.
- [x] `npm run build`, `npm run check`, and `npm test` pass.
- [x] Beads notes and this primer are updated with what changed and the next step.
