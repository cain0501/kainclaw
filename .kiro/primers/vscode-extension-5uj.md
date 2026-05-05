# Task Primer: vscode-extension-5uj — 设计生成预览：空态 + 加载动画入口

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

The 设计·生成预览 tab must be a new-design entry point, not a project gallery. It shows an empty state prompting the user to fill in the left panel and generate, switches to a loading animation when generation starts, and auto-opens the canvas when generation completes. Any existing project-grid content inside this tab must be removed.

## Out of Scope

- Do not touch the 我的作品 tab (that is where existing design projects live)
- Do not implement replace-ctx bar (P1-2)
- Do not change left panel form fields
- Do not touch `src/` files

## Already Completed

- [x] Shell tab bars operational (P1-1 / vscode-extension-ha8)
- [x] `openCanvas(projectName)` function exists (P1-1)
- [x] `designSwitchView('works')` routes to 我的作品

## Next Step (the ONLY thing to do this session)

Rework the 设计·生成预览 view in `electron/renderer/index.html`:

### View structure (`#view-design-preview`)

```
#view-design-preview
  ├── #dpv-empty       (default visible)
  └── #dpv-loading     (hidden by default)
```

### Empty state (`#dpv-empty`)
- Large icon: ◼ (opacity 0.3)
- Title: 「新建设计稿」
- Sub: 「在左侧填写设计需求、选择风格和输出类型\n点击「生成设计」开始创作\n\n或者从「我的作品」打开已有设计继续编辑」
- CTA button: 「查看我的作品 →」→ calls `designSwitchView('works')`
- Background: #f5f0e8, centered vertically

### Loading state (`#dpv-loading`)
- Spinning icon (CSS animation, not emoji spinner)
- Text: 「正在生成设计稿...」
- Sub: 「通常需要 10～30 秒」

### Wiring
- Left panel「生成设计」button click:
  1. Show `#dpv-loading`, hide `#dpv-empty`
  2. Call existing design generation logic
  3. On complete: call `openCanvas(projectName)` — do NOT stay on loading screen
- `designSwitchView('preview')` when generation is not in progress: show empty state

### Cleanup
- Remove any project-grid / design-card listing from inside `#view-design-preview`
- Design projects belong only in `#view-works` (我的作品)

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
- Switch to 设计·生成预览 → see empty state (icon + text + CTA), no project cards
- Click「查看我的作品 →」→ switches to 设计·我的作品
- Click「生成设计」in left panel → loading animation appears
- Generation completes → canvas opens automatically, loading state clears

## Risk Points

- Risk: existing design generation code renders a project card inside the preview view after success
  Guard: intercept the post-generation callback, call `openCanvas()` instead of rendering a card
- Risk: `#dpv-loading` stays visible if generation errors
  Guard: on error, hide loading + show empty state + display error message

## High-Risk Files Touched

- `electron/renderer/index.html` — `#view-design-preview` DOM structure, CSS for empty/loading states, design generation trigger + completion handler

## Reference (only load if stuck)

- Spec: `.kiro/specs/midtai-ux-v1.md` (section 4.1 设计 生成预览)
- Prototype: `.kiro/midtai-prototype-v2.html` (open in browser — 设计 tab → 生成预览)
- Beads: `bd show vscode-extension-5uj`

## Definition of Done

- [ ] 设计·生成预览 shows empty state by default (no project grid)
- [ ] Empty state has icon, title, sub-text, and "查看我的作品 →" CTA
- [ ] Clicking CTA switches to 设计·我的作品
- [ ] Clicking 生成设计 shows loading animation
- [ ] Generation complete → `openCanvas()` called, loading clears
- [ ] Generation error → loading clears, empty state + error message shown
- [ ] `npm test` passes
- [ ] `npm run check` passes
- [ ] `npm run build` passes
- [ ] `npm run build:electron` passes
