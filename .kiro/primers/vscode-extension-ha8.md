# Task Primer: vscode-extension-ha8 — Shell 骨架：topbar state chip + 双 tab 栏 + canvas-toolbar takeover

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Build the visible navigation shell for the midtai surface: a state chip in the topbar that appears only when a canvas is open, two independent tab bars (one for image type, one for design type), and a canvas-toolbar that completely replaces the tab bar when the canvas is open.

## Out of Scope

- Do not implement replace-ctx bar (that is P1-2)
- Do not implement design-preview empty state (that is P1-3)
- Do not change left panel form fields
- Do not touch `src/` files or `electron/ElectronChatPanel.ts` — all changes are in `electron/renderer/index.html`

## Already Completed (P0)

- [x] `midtai:open` route contract exists (`src/midtaiRoute.ts`)
- [x] `midtaiLibraryHost` exists for works data aggregation
- [x] `design:patchImageNode` IPC exists for image replacement
- [x] `openMidtai(payload)` renderer entry function exists

## Next Step (the ONLY thing to do this session)

Wire up the shell navigation layer in `electron/renderer/index.html`:

1. **state chip** — add `.state-chip` element in topbar, hidden by default, shown when `canvasOpen=true` via `updateStateChip()`
2. **dual tab bars** — ensure `#mtbar-img` and `#mtbar-design` are separate DOM elements; `showTabBar('img'|'design'|'canvas')` toggles which one is visible
3. **canvas-toolbar** — `#canvas-toolbar` is a bar-level element (same DOM level as tab bars); `openCanvas(projectName)` shows it and hides tab bar; `exitCanvas()` restores design tab bar
4. **switchType** — `switchType('design')` defaults to 我的作品 with design filter, not 生成预览

**Files:** `electron/renderer/index.html` only  
**Test:** `npm test && npm run check && npm run build && npm run build:electron`

## Key State

```javascript
// State fields relevant to this task
canvasOpen: false,
currentProject: '',   // shown in state chip
type: 'img',          // 'img' | 'design'
imgView: 'preview',   // 'preview' | 'works' | 'plib'
designView: 'works',  // 'preview' | 'works' | 'plib' — default 'works' not 'preview'
```

## Key Functions to Add / Update

```javascript
function showTabBar(which)   // 'img' | 'design' | 'canvas'
function updateStateChip()   // shows/hides .state-chip based on canvasOpen
function openCanvas(projectName)  // canvasOpen=true, showTabBar('canvas'), showOnlyView('canvas')
function exitCanvas()             // canvasOpen=false, showTabBar('design'), designSwitchView('works')
function switchType(t)            // switches type, shows correct tab bar, jumps to default view
```

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

Manual test:
- Switch to 图像 type → #mtbar-img visible with 3 tabs
- Switch to 设计 type → #mtbar-design visible, lands on 我的作品
- openCanvas() → canvas-toolbar visible, tab bar hidden, state chip visible in topbar
- exitCanvas() → design tab bar restored, state chip hidden, lands on 我的作品

## Risk Points

- Risk: canvas-toolbar is placed inside a view panel instead of at bar level
  Guard: check DOM hierarchy — canvas-toolbar must be a sibling of tab bars, not a child of any view
- Risk: switchType('design') lands on 生成预览 instead of 我的作品
  Guard: verify `designView` defaults to `'works'` and `switchType` calls `designSwitchView('works')`

## High-Risk Files Touched

- `electron/renderer/index.html` — topbar region, tab bar region, canvas-toolbar region, switchType/openCanvas/exitCanvas/showTabBar/updateStateChip functions

## Reference (only load if stuck)

- Spec: `.kiro/specs/midtai-ux-v1.md` (sections 3.1–3.3)
- Prototype: `.kiro/midtai-prototype-v2.html` (open in browser to interact)
- Beads: `bd show vscode-extension-ha8`

## Definition of Done

- [ ] `.state-chip` visible only when `canvasOpen=true`, shows "编辑中·[项目名]"
- [ ] `#mtbar-img` (图像) and `#mtbar-design` (设计) are independent tab bars
- [ ] Both tab bars have tab order: 生成预览 · 我的作品 · 提示词库
- [ ] `#canvas-toolbar` is bar-level, completely replaces tab bar when canvas open
- [ ] `switchType('design')` defaults to 我的作品 with design filter
- [ ] `exitCanvas()` restores design tab bar and lands on 我的作品
- [ ] `npm test` passes
- [ ] `npm run check` passes
- [ ] `npm run build` passes
- [ ] `npm run build:electron` passes
