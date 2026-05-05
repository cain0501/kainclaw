# Task Primer: vscode-extension-6af — canvas-toolbar 下沉到内容区顶部，tab 栏保持可见

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

ha8 把 canvas-toolbar 实现为替换 tab 栏的方式，经用户验收不合理：进入画布后 tab 栏消失，用户找不到「我的作品」，无法在画布内换图。

本任务把 canvas-toolbar 改为内容区顶部的固定条，tab 栏始终可见。

## Out of Scope

- 不改 canvas iframe 内部的交互逻辑
- 不改 replace-ctx bar（保持 bar-level）
- 不改 left panel

## Already Completed

- tab 栏（#mtbar-img / #mtbar-design）已存在
- canvas-toolbar 已存在，但位置错误（替换 tab 栏）
- openCanvas / exitCanvas 函数已存在，需要改行为

## Layout Change

```
变更前：
  [tab 栏 OR canvas-toolbar]  ← 互相替换
  [内容区]

变更后：
  [tab 栏]                    ← 始终可见
  [canvas-toolbar]            ← 仅画布打开时，在内容区顶部
  [iframe / 其他内容]
```

HTML 结构目标：
```html
<!-- tab 栏：始终可见 -->
<div id="mtbar-img">...</div>
<div id="mtbar-design">...</div>
<!-- replace-ctx bar：按需显示 -->
<div id="replace-ctx">...</div>
<!-- 内容区 -->
<div id="view-canvas" style="display:none; flex-direction:column">
  <div id="canvas-toolbar">查看 选择 微调 | 导出 保存 退出画布</div>
  <!-- iframe + right panel -->
</div>
```

## Code Changes

### 1. showTabBar() 
移除对 canvas-toolbar 的控制。showTabBar 只切换 #mtbar-img / #mtbar-design 的可见性。

### 2. openCanvas(projectName)
```javascript
function openCanvas(projectName) {
  S.canvasOpen = true;
  S.currentProject = projectName || S.currentProject;
  updateStateChip();
  // 不再 showTabBar('canvas')
  // tab 栏保持当前状态（设计 tab 栏）
  // canvas-toolbar 由 view-canvas 内部控制，显示 view-canvas 时自然可见
  showOnlyView('canvas');
}
```

### 3. exitCanvas()
```javascript
function exitCanvas() {
  S.canvasOpen = false;
  updateStateChip();
  showOnlyView('works');      // 回到我的作品
  designSwitchView('works');  // 确保设计 tab 栏激活状态正确
}
```

### 4. canvas-toolbar DOM
把 canvas-toolbar 从 tab 栏同级移到 #view-canvas 内部顶部（flex-direction:column 的第一个子元素）。

## Files
`electron/renderer/index.html` only  
**Test:** `npm test && npm run check && npm run build && npm run build:electron`

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

Manual test:
1. 进入设计·我的作品，点开一个设计项目进入画布
   → tab 栏仍然可见（生成预览/我的作品/提示词库）
   → canvas-toolbar 出现在 iframe 上方
   → topbar state chip 可见
2. 在画布里点「我的作品」tab
   → 切到作品列表，canvas-toolbar 不可见（view-canvas 隐藏）
   → tab 栏正常
3. 点「退出画布」
   → canvas-toolbar 消失，落到我的作品，state chip 消失

## Risk Points

- Risk: showTabBar('canvas') 调用残留导致 tab 栏被隐藏
  Guard: 全局搜索 showTabBar('canvas') 并删除所有调用
- Risk: canvas-toolbar 在 view-canvas 隐藏时仍占位影响布局
  Guard: canvas-toolbar 在 view-canvas 内部，view-canvas 隐藏时整体不可见，无需单独控制

## High-Risk Files Touched

- `electron/renderer/index.html` — showTabBar、openCanvas、exitCanvas、canvas-toolbar DOM 位置

## Reference (only load if stuck)

- Spec: `.kiro/specs/midtai-ux-v1.md` (sections 3.3, 4.4)
- Beads: `bd show vscode-extension-6af`

## Definition of Done

- [ ] 画布打开时 tab 栏始终可见
- [ ] canvas-toolbar 在 iframe 上方，不干扰 tab 栏
- [ ] 在画布内可点击其他 tab 切换内容
- [ ] 退出画布后 state chip 消失，落到我的作品
- [ ] `npm test` passes
- [ ] `npm run check` passes
- [ ] `npm run build` passes
- [ ] `npm run build:electron` passes
