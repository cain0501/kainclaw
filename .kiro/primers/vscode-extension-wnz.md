# Task Primer: vscode-extension-wnz — Midtai 画布：滑块面板浮层化 + 版本历史按当前项目过滤

> **Session entry point.** Read this first.

## Task Goal

手测 vscode-extension-3q7 后发现两个 UI bug，需修复：

1. **滑块面板**（`midtai-sliders-panel`）固定在左下角 → 改为 `position:fixed` 可拖拽浮层
2. **版本历史**（`renderMidtaiVersionsPanel`）把所有项目的版本都混在一起展示 → 只显示当前项目的版本

**所有改动只在 `electron/renderer/index.html`。**

---

## Out of Scope

- 不改任何 `.ts` 文件
- 不改导出功能（已验证正常）
- 不改 `midtai-node-panel`（选择模式浮层，已正常）

## Already Completed

- [x] `electron/renderer/index.html:1195` 将 `midtai-sliders-panel` 改为 `position:fixed` 右上角浮层，保留 node panel 的更高 z-index。
- [x] `electron/renderer/index.html:5386` 新增 `makeDraggable()`，只允许通过标题栏 `data-drag-handle` 拖动，避免误伤按钮和输入控件。
- [x] `electron/renderer/index.html:5416` 为 `renderDesignSlidersPanel()` 增加标题栏拖拽手柄、关闭按钮和滚动内容区，并在渲染后初始化拖拽。
- [x] `electron/renderer/index.html:5680` 让 `loadDesignVersions()` 带上 `designHomeState.currentProjectId` 请求后端过滤版本。
- [x] `electron/renderer/index.html:5376` 新增 `getMidtaiVisibleVersions()`，作为 `renderMidtaiVersionsPanel()` 和 `loadMidtaiVersion()` 共用的前端过滤安全网。
- [x] 回归修复：`electron/renderer/index.html:4128` 新增 `syncMidtaiDesignPayload(payload)`，确保 `midtai:open` 切到设计视图前把 `activeVersion.html/sliders/sliderValues` 注入 `designBridgeState`，否则调节面板会因为 `sliders=[]` 被立即隐藏。
- [x] 回归测试：`electron/rendererSettings.test.ts` 断言 Midtai 打开设计 payload 时会 hydrate 共享 design bridge state。
- [x] 验证通过：`npm test`、`npm run check`、`npm run build`、`npm run build:electron`、UTF-8 decode、inline `<script>` JS 语法检查。

## Next Step (the ONLY thing to do this session)

已完成，无后续编码步骤。本任务可交给 Claude PM 验收并关闭 beads。

---

## Bug 1：滑块面板浮层化 + 可拖拽

### 根因

`midtai-sliders-panel` 当前是 `midtai-canvas-shell`（flex 容器）的子项，flex 布局导致它被挤到角落。

### 修复方式

**Step 1：把 DOM 移出 flex 容器**

当前位置（~line 1195）：
```html
<div id="midtai-sliders-panel" style="display:none;width:240px;flex-shrink:0;..."></div>
<div id="midtai-versions-panel" style="display:none;width:240px;flex-shrink:0;..."></div>
```
这两个 div 是 `midtai-canvas-shell` 的 flex 子项，需要把它们移到 `view-canvas` 层级下（`midtai-node-panel` 旁边），或者直接改成 `position:fixed`。

**最简单方案：把样式改成 fixed 浮层**，不需要移动 DOM 位置。把 `midtai-sliders-panel` 的样式改为：

```html
<div id="midtai-sliders-panel" style="display:none;position:fixed;z-index:9998;width:260px;max-height:70vh;background:rgba(255,255,255,.97);border:1px solid #eadfd2;border-radius:12px;padding:0;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.14);top:80px;right:24px;"></div>
```

注意：`z-index:9998`，比 `midtai-node-panel`（9999）低一级，不遮挡节点面板。

**Step 2：加拖拽支持**

在 `setMidtaiCanvasMode` 的 `'tweak'` 分支里，调用 `renderDesignSlidersPanel` 之后加拖拽初始化：

```javascript
makeDraggable(document.getElementById('midtai-sliders-panel'));
```

实现 `makeDraggable`（如果文件里没有，加一个）：

```javascript
function makeDraggable(el) {
  if (!el || el.__kcDraggable) return;
  el.__kcDraggable = true;
  const handle = el.querySelector('[data-drag-handle]') || el;
  let startX, startY, startLeft, startTop;
  handle.style.cursor = 'move';
  handle.addEventListener('mousedown', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return;
    e.preventDefault();
    const rect = el.getBoundingClientRect();
    startX = e.clientX; startY = e.clientY;
    startLeft = rect.left; startTop = rect.top;
    function onMove(ev) {
      el.style.left = (startLeft + ev.clientX - startX) + 'px';
      el.style.top = (startTop + ev.clientY - startY) + 'px';
      el.style.right = 'auto';
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}
```

**Step 3：加标题栏拖拽手柄**

在 `renderDesignSlidersPanel`（~line 5400）最顶部加一个拖拽手柄行，方便用户拖动：

在 `panel.innerHTML = [...]` 的最前面插入：
```javascript
`<div data-drag-handle style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px 8px;border-bottom:1px solid #f0e8df;cursor:move;user-select:none">
  <span style="font-size:11px;font-weight:700;color:#7b4a2e;letter-spacing:.04em;text-transform:uppercase">${isEnglishUi() ? 'Design sliders' : '设计调节'}</span>
  <button onclick="setMidtaiCanvasMode('view')" style="border:none;background:none;cursor:pointer;color:#a8998a;font-size:16px;padding:0 2px;line-height:1">×</button>
</div>`,
`<div style="padding:14px">`,
```

然后在 `panel.innerHTML` 末尾加 `'</div>'` 闭合内容区。

同时在 `renderDesignSlidersPanel` 调用末尾补：
```javascript
makeDraggable(panel);
```

---

## Bug 2：版本历史只显示当前项目的版本

### 根因

`designBridgeState.versions` 是全局数组，由后端通过 `design:versions` IPC 返回所有项目的版本列表（`loadDesignVersions()` 不带 projectId 过滤）。Midtai 画布打开时，`midtaiState.currentProject` 记录了当前项目名。

版本数据结构（从现有渲染代码可知）：
```javascript
{
  id: string,
  prompt: string,      // 生成 prompt（用作标签）
  createdAt: string,   // ISO 时间
  projectId?: string,  // 可能有，也可能没有
}
```

### 修复方式

**方案 A（推荐，改动最小）：`loadDesignVersions` 带上当前 projectId**

在 `openCanvas` 调用 `loadDesignVersions()` 时，先确认 `designHomeState.currentProjectId` 是否已设置。如果有 projectId，在 `loadDesignVersions` 里带上：

```javascript
function loadDesignVersions() {
  send({
    type: 'design:loadVersions',
    projectId: designHomeState.currentProjectId || undefined,
  });
}
```

这样后端返回的版本列表本身就是过滤好的。

**方案 B（纯前端 fallback，如果后端不支持 projectId 过滤）：在 `renderMidtaiVersionsPanel` 里过滤**

```javascript
function renderMidtaiVersionsPanel(panel) {
  let versions = Array.isArray(designBridgeState.versions) ? designBridgeState.versions : [];
  
  // 按当前项目过滤：如果版本有 projectId，只显示匹配的
  const currentProjectId = designHomeState.currentProjectId;
  if (currentProjectId) {
    const filtered = versions.filter(v => !v.projectId || v.projectId === currentProjectId);
    // 只在过滤后有结果时才用，防止 projectId 字段缺失导致全清空
    if (filtered.length > 0) versions = filtered;
  }
  
  if (!versions.length) {
    panel.innerHTML = '<div style="font-size:12px;color:#a8998a;padding:8px 0">暂无版本记录</div>';
    return;
  }
  // ... 其余渲染不变
}
```

**建议同时做方案 A + B**：A 让后端少传数据，B 作为前端安全网。

---

## 实现顺序

1. Bug 1：先改 `midtai-sliders-panel` style → 再加 `makeDraggable` → 再改 `renderDesignSlidersPanel` 加手柄
2. Bug 2：改 `loadDesignVersions` + `renderMidtaiVersionsPanel`

---

## Verification

```bash
npm run build:electron
node -e "const fs=require('fs'),html=fs.readFileSync('electron/renderer/index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g)||[];let js='';m.forEach(s=>{js+=s.replace(/<\/?script>/g,'')+'\n';});try{new Function(js);console.log('OK');}catch(e){console.error(e.message);process.exit(1);}"
```

Manual test：
- 进 Midtai 生成一个设计 → 进画布 → 点「调节」
  - 滑块面板应出现在右上角浮层，可拖动，不贴角落
- 点「版本历史」
  - 只显示当前这个设计的版本，不出现其他设计的版本

## High-Risk Files Touched

- `electron/renderer/index.html` — 只改此文件

## Definition of Done

- [x] 调节面板以浮层形式出现，位置合理，可拖拽
- [x] 版本历史只展示当前项目版本
- [x] `npm run build:electron` 通过
- [x] JS 语法检查通过
- [x] 旧版 Design Workbench 功能未受影响
