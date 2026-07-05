# Task Primer: vscode-extension-26q - Kanban view for My Works

> Session entry point. Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Add a narrow Kanban/board mode to Midtai "My Works" so users can scan saved design works by workflow status instead of only seeing a flat grid. This is a P3 usability improvement for the existing library surface, not a new project model.

## Out of Scope

- Do not change project persistence, project status semantics, or design generation behavior.
- Do not add new dependencies.
- Do not redesign the whole Midtai library shell.
- Do not touch image generation/provider dirty files.
- Do not move product logic into Electron renderer beyond lightweight view grouping already needed for this UI surface.

## Resume Context

**Last session date:** 2026-07-06
**Last action taken:** Added and verified the My Works / design library grid-board toggle and Kanban rendering.
**Why it was done that way:** The visible current entry is the Midtai design library panel, so the change stays in the existing renderer display layer and derives columns from current/draft/versioned item fields without writing new persisted status.
**Exact next action:** Manual smoke in Electron: open Midtai -> Works library -> Design works, switch Grid/Board, open a work, and confirm delete/open controls still behave.
**Known blockers / watch out:** No automated visual browser smoke was run; validation is syntax/build/test plus the manual checklist below.

## Already Completed

- [x] Claimed `vscode-extension-26q`.
- [x] Created this primer because no existing primer was present.
- [x] Added `designLibraryViewMode`, a grid/board mode toggle, and Kanban columns for current/draft/versioned design works in `electron/renderer/index.html`.
- [x] Verified JS syntax, UTF-8 reads, Electron build, TypeScript build/check, and full Vitest suite.

## Next Step

**Do:** Manual smoke the Kanban mode in Electron and continue with `vscode-extension-0z5` if accepted.
**Files:** `electron/renderer/index.html`, optional tests/docs only if an existing targeted test seam is found.
**Test:** No code change required unless the manual smoke finds a visual/interaction issue.

## Verification

```bash
node -e "const fs=require('fs'),html=fs.readFileSync('electron/renderer/index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g)||[];let js='';m.forEach(s=>{js+=s.replace(/<\/?script>/g,'')+'\n';});try{new Function(js);console.log('JS syntax OK');}catch(e){console.error('SYNTAX ERROR:',e.message);process.exit(1);}"
npm run build:electron
npm run build
npm run check
npm test
```

Manual test:
- Open Midtai / My Works.
- Switch Design library between grid and board modes.
- Confirm design works appear in columns, empty columns show a calm empty state, and opening a work still functions.

## Risk Points

- Risk: inline renderer script syntax break. Guard: run the extracted-script `new Function` syntax check immediately after edit.
- Risk: broad renderer churn. Guard: only edit My Works / Midtai library CSS, state, and render helpers.
- Risk: invented status semantics. Guard: derive columns from existing item fields with fallback buckets; do not write new persisted status.

## Architecture Traps

- [x] This task does not touch image chat rendering.
- [x] This task does not depend on postImageState IPC.
- [x] `index.html` changes require `npm run build:electron`.

## High-Risk Files Touched

- `electron/renderer/index.html` -> only the Midtai library / My Works design panel area:
  - CSS for `.midtai-library-*` and `.design-wcard*` adjacent view-mode styles.
  - State fields near `midtaiState.designLibraryItems`.
  - Render helpers that build `#midtai-library-panel-design` / design library cards.
  - Event handlers for the added grid/board toggle.
- Do NOT touch chat message rendering, image chat rendering, settings, session switching, provider flows, or unrelated IPC handlers.

## Reference

- Beads: `bd show vscode-extension-26q`
- Current state: `.kiro/CURRENT_STATE.md`

## Definition of Done

- [x] My Works design library has a visible grid/board mode control.
- [x] Board mode groups existing design works into stable columns without mutating persisted data.
- [x] Empty and populated board states render without overlap on desktop widths by CSS constraints.
- [x] Existing work-card open/delete actions continue to use existing handlers.
- [x] JS syntax check passes.
- [x] `npm run build:electron` passes.
- [x] `npm run build`, `npm run check`, and `npm test` pass.
- [x] Beads notes and this primer are updated with what changed and the next step.
