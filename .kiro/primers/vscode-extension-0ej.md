# Task Primer: vscode-extension-0ej — Midtai 新版素材库图片缩略图异步加载

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

修复 Midtai 新版 `Library -> 图片素材库` 首次打开极慢的问题。当前页面直接为所有素材卡片渲染原始大图，导致首屏一次性解码大量图片，页面需要十几秒才能可用。目标是复用旧版 `我的作品` 已有的异步缩略图加载策略：优先命中 `thumbnailCache`，未命中时先显示 shimmer，再分批异步加载/生成 320px 缩略图并回写现有缓存链路。

## Out of Scope

- 不改后端 IPC 协议
- 不改 `ElectronChatPanel.ts`、`src/midtaiLibraryHost.ts`、图片生成存储结构
- 不改设计作品库的缩略图逻辑
- 不修复与本次卡顿无关的 Midtai UI 问题

## Already Completed

- [x] 已定位卡顿入口在 `electron/renderer/index.html` 的 `renderMidtaiLibraryImagePanel()`：原先直接输出 `<img src="${result.src}">`
- [x] 已确认旧版 `renderMidtaiImageWorks()` + `observeMidtaiImageThumbs()` 已实现异步分批缩略图加载与缓存回写
- [x] 已确认 `image:state` / `image:result` 已会预填 `thumbnailCache`，可直接复用
- [x] 已将新版 `Library -> 图片素材库` 改为优先命中 `thumbnailCache`，未命中时显示 shimmer，占位后走现有异步缩略图链路
- [x] 已修正异步回填时保留 `.midtai-image-card-actions` 覆盖层，避免缩略图加载后删除按钮丢失
- [x] 已完成验证：`npm run build:electron`、renderer JS syntax check

## Next Step (the ONLY thing to do this session)

**Do:** 在 Electron App 里手测新版 `Library -> 图片素材库` 的首开 shimmer 和二次打开缓存命中速度
**Files:** `electron/renderer/index.html`
**Test:** `npm run build:electron`

## Verification

```bash
npm run build:electron
node -e "const fs=require('fs'),html=fs.readFileSync('electron/renderer/index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g)||[];let js='';m.forEach(s=>{js+=s.replace(/<\/?script>/g,'')+'\n';});try{new Function(js);console.log('JS syntax OK');}catch(e){console.error('SYNTAX ERROR:',e.message);process.exit(1);}"
```

Manual test:
- Step 1: 打开 Midtai，进入 `Library -> 图片素材库`，确认页面不再长时间卡住，先出现 shimmer 占位
- Step 2: 等待缩略图逐步填充，再次进入该页面确认已命中缓存，明显快于首次

## Risk Points

- Risk: 误伤旧版 `我的作品` 图片列表逻辑
- Guard: 复用现有 `observeMidtaiImageThumbs()`，只改它的入参适配与 `renderMidtaiLibraryImagePanel()` 的渲染方式
- Risk: renderer inline script 语法损坏
- Guard: 修改后立刻跑 `npm run build:electron` 和 renderer JS syntax check

## High-Risk Files Touched

- `electron/renderer/index.html` → only `renderMidtaiLibraryImagePanel`, `observeMidtaiImageThumbs`, and the direct call site that triggers library image rendering
- Do NOT touch any other region of this file

## Reference (only load if stuck)

- Existing image thumbnail flow: `renderMidtaiImageWorks()` / `observeMidtaiImageThumbs()` in `electron/renderer/index.html`
- Existing design thumbnail flow: `scheduleDesignThumbnailLoads()` in `electron/renderer/index.html`

## Definition of Done

- [x] `Library -> 图片素材库` 不再直接一次性渲染原始大图
- [x] 页面优先使用 `thumbnailCache`
- [x] 未命中缓存的图片先显示 shimmer，再异步分批填充
- [x] 缩略图生成后继续复用现有 `image:saveThumbnail` 回写链路
- [x] `npm run build:electron` 通过
- [x] renderer JS syntax check 通过
