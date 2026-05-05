# Task Primer: vscode-extension-7z2 — Replace 流 UI：amber ctx bar + 我的作品上下文化

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Make the replace flow visible in the midtai UI. When the user triggers "replace" from the design canvas right panel, a 32px amber bar appears below the tab bar to lock in the target context. The 我的作品 view adapts its title, filters, and card actions to serve the replace flow.

## Out of Scope

- Do not rebuild the canvas or right panel (already exists)
- Do not persist `replaceCtx` to store or disk — renderer memory only
- Do not implement design-preview empty state (P1-3)
- Do not touch `src/` files

## Already Completed

- [x] Shell tab bars and canvas-toolbar takeover (P1-1 / vscode-extension-ha8)
- [x] `design:patchImageNode` IPC for writing the chosen image back to canvas (P0)
- [x] `openMidtai(payload)` route entry exists

## Next Step (the ONLY thing to do this session)

Implement the replace-flow UI layer in `electron/renderer/index.html`:

1. **Replace-ctx bar** — 32px amber strip between tab bar and content area:
   - CSS: `background:#fffbeb; border-bottom:1.5px solid #fbbf24; height:32px`
   - Content: `🎯 替换目标：[project] · [element]  [× 取消替换]`
   - `showReplaceCtx(project, element)` → sets `replaceCtx`, shows bar
   - `cancelReplace()` → clears `replaceCtx`, hides bar

2. **我的作品上下文化** — `updateWorksForContext()` called whenever 我的作品 renders:
   - Normal: title="我的作品", filter row visible, card hover shows "收藏"/"插入到对话"
   - Replace mode: title="为《[project]·[element]》选图", filter row hidden, only images shown, card hover shows "✓ 选用此图" (green)

3. **Trigger wiring** — canvas right panel buttons:
   - 「去 Image Lab 生成图」→ `goReplaceInImageLab()`: `showReplaceCtx()` + `imgSwitchView('preview')`
   - 「从我的作品选择」→ `goReplaceInWorks()`: `showReplaceCtx()` + switch to 我的作品

4. **Insertion** — `insertToDesign(imgUrl)`:
   - Sends `design:patchImageNode` IPC (already implemented in P0)
   - On success: `cancelReplace()` + `exitCanvas()` equivalent (return to canvas) + toast "已替换 [element]"

**Files:** `electron/renderer/index.html` only  
**Test:** `npm test && npm run check && npm run build && npm run build:electron`

## Key State

```javascript
replaceCtx: null,  // null | { project: string, element: string }
```

## Replace Flow Sequence

```
canvas → click img element → right panel opens
  → click "去 Image Lab 生成图"
    → showReplaceCtx('SaaS 落地页', '产品主图')
    → replace-ctx bar visible: "🎯 替换目标：SaaS 落地页 · 产品主图  × 取消"
    → imgSwitchView('preview')
  → user generates image → hovers result → "✓ 插入到设计" button
    → insertToDesign(imgUrl)
    → patchImageNode IPC
    → success: cancelReplace() + back to canvas + toast
```

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

Manual test:
- Open canvas, click an img element, click "去 Image Lab 生成图"
  → amber bar appears with correct target text, view switches to 图像·生成预览
- Click "× 取消替换" → bar disappears, normal state restored
- In replace mode, go to 我的作品 → title shows "为《...》选图", no filter row, cards show "选用此图"
- Click "选用此图" → canvas image updates, bar disappears, toast shows

## Risk Points

- Risk: replace-ctx bar placed inside a view instead of at bar level
  Guard: bar must be a sibling of the tab bar and content area, not inside any view div
- Risk: `updateWorksForContext()` not called when switching to 我的作品 during replace mode
  Guard: call it from both `imgSwitchView('works')` and `designSwitchView('works')` code paths

## High-Risk Files Touched

- `electron/renderer/index.html` — replace-ctx bar DOM + CSS, showReplaceCtx/cancelReplace/goReplaceInImageLab/goReplaceInWorks/insertToDesign functions, 我的作品 render logic

## Reference (only load if stuck)

- Spec: `.kiro/specs/midtai-ux-v1.md` (sections 4.2, 5)
- Prototype: `.kiro/midtai-prototype-v2.html` (open in browser — amber bar demo in replace flow)
- Beads: `bd show vscode-extension-7z2`

## Definition of Done

- [ ] Replace-ctx bar appears below tab bar only when `replaceCtx !== null`
- [ ] Bar shows correct project + element names
- [ ] "× 取消替换" clears state and hides bar
- [ ] 我的作品 title/filter/card buttons change correctly in replace mode
- [ ] `goReplaceInImageLab()` sets ctx + switches to image preview
- [ ] `goReplaceInWorks()` sets ctx + switches to 我的作品 (image-only)
- [ ] `insertToDesign()` triggers patchImageNode, then clears ctx + shows toast
- [ ] `npm test` passes
- [ ] `npm run check` passes
- [ ] `npm run build` passes
- [ ] `npm run build:electron` passes
