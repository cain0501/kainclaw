# Task Primer: vscode-extension-fo7 — midtai 画布选择模式 + Replace 流

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

midtai 画布的 `midtai-canvas-iframe` 是纯 HTML iframe，不支持节点选中。本任务让用户在 midtai 画布里点击图片元素，弹出右侧面板，从而触发 Replace 流（去 Image Lab 生成图 / 从我的作品选择）。

## Out of Scope

- 不改 `src/` 下任何文件
- 不重建 `design-bridge-frame`（旧页面的画布不动）
- 不做文字节点的 patch 改写（只做图片替换）
- 不做调节模式（Tweaks）

## Already Completed

- `midtai-canvas-iframe` 已存在于 `#view-canvas`，`openCanvas()` 时写入 srcdoc
- `showReplaceCtx()` / `cancelReplace()` / `goReplaceInImageLab()` / `goReplaceInWorks()` 已实现
- `insertToDesign(imgUrl)` 已实现，发送 `design:patchImageNode` IPC
- 「选择」按钮已存在（`id="midtai-canvas-select-btn"`），目前 disabled

## Next Step (the ONLY thing to do this session)

**Files:** `electron/renderer/index.html` only

### 1. openCanvas() 时注入 bridge script

在 `openCanvas()` 里，iframe srcdoc 写入后，通过 `postMessage` 向 iframe 注入选择模式脚本。由于 iframe sandbox 只有 `allow-scripts`，注入方式：将 bridge 代码追加到 srcdoc HTML 的 `<body>` 末尾（在写 srcdoc 之前拼接）。

Bridge 脚本功能：
```javascript
// 注入到 iframe body 末尾的 <script>
document.addEventListener('click', function(e) {
  const img = e.target.closest('img, [style*="background-image"]');
  if (!img || !window.__kcSelectMode) return;
  e.preventDefault();
  e.stopPropagation();
  const rect = img.getBoundingClientRect();
  const src = img.src || (window.getComputedStyle(img).backgroundImage.match(/url\(["']?([^"')]+)/) || [])[1] || '';
  window.parent.postMessage({
    type: '__midtai_node_selected',
    tagName: img.tagName,
    src,
    selector: img.id ? '#' + img.id : img.className ? '.' + img.className.split(' ')[0] : img.tagName.toLowerCase(),
    outerHTML: img.outerHTML.slice(0, 300),
  }, '*');
}, true);
window.addEventListener('message', function(e) {
  if (e.data && e.data.type === '__midtai_set_select_mode') {
    window.__kcSelectMode = e.data.active;
    document.body.style.cursor = e.data.active ? 'crosshair' : '';
  }
});
```

### 2. 启用「选择」按钮

`setMidtaiCanvasMode('select')` 时，向 iframe postMessage `{ type: '__midtai_set_select_mode', active: true }`。`view` 模式时发 `active: false`。去掉「选择」按钮的 disabled 状态。

### 3. 接收节点选中消息

在 `window.addEventListener('message', ...)` 里处理 `__midtai_node_selected`：
- 存储选中节点信息到 `midtaiState.selectedCanvasNode`
- 调用 `showMidtaiNodePanel(node)` 显示右侧面板

### 4. 右侧面板 `#midtai-node-panel`

DOM 结构（加到 `#view-canvas` 内，与 `midtai-canvas-shell` 并列）：
```html
<div id="midtai-node-panel" style="display:none;width:220px;flex-shrink:0;background:#fff;border-left:1px solid #e5ddd0;padding:16px;overflow-y:auto">
  <div id="mnp-tag" style="font-size:11px;color:#a8998a;margin-bottom:8px"></div>
  <div style="font-weight:600;margin-bottom:12px">替换图片</div>
  <button onclick="goReplaceInImageLab()" class="btn-red" style="width:100%;margin-bottom:8px">✦ 去 Image Lab 生成图</button>
  <button onclick="goReplaceInWorks()" class="btn-secondary" style="width:100%">🗂 从我的作品选择</button>
</div>
```

`showMidtaiNodePanel(node)` → 显示面板，填入标签名。
`hideMidtaiNodePanel()` → 隐藏面板，在切回 view 模式或 exitCanvas 时调用。

### 5. `goReplaceInImageLab()` / `goReplaceInWorks()` 取 selectedCanvasNode

这两个函数已存在但用的是占位 project/element。改为从 `midtaiState.selectedCanvasNode` 取真实信息：
```javascript
const node = midtaiState.selectedCanvasNode;
showReplaceCtx(midtaiState.currentProject, node?.selector || '图片元素');
```

**Test:** `npm test && npm run check && npm run build && npm run build:electron`

## Verification

```bash
npm test
npm run check
npm run build
npm run build:electron
```

Manual test（告知用户手测）:
1. 生成一个含图片的设计稿，进入画布
2. 点「选择」按钮 → 鼠标变成十字
3. 点击设计里的图片元素 → 右侧面板出现，显示「替换图片」
4. 点「去 Image Lab 生成图」→ tab 栏下方出现黄色替换目标条，切到图像生成预览
5. 点「× 取消替换」→ 黄色条消失
6. 再次进入选择，点「从我的作品选择」→ 切到我的作品，标题变为替换语境

## Risk Points

- Risk: iframe srcdoc 修改后 bridge script 的 `window.parent` 被 sandbox 限制
  Guard: `allow-scripts` 允许 `window.parent.postMessage`，测试确认消息能到 renderer
- Risk: 选中的不是图片（点到文字等）时面板不应弹出
  Guard: bridge 只响应 `img` 或有 `background-image` 的元素，其他元素不触发

## High-Risk Files Touched

- `electron/renderer/index.html` — openCanvas srcdoc 拼接、message handler、midtai-node-panel DOM、setMidtaiCanvasMode、goReplaceInImageLab/goReplaceInWorks

## Reference (only load if stuck)

- 现有 bridge 实现参考：`electron/renderer/index.html` 内 `design-bridge-frame` 的 message handler
- Spec: `.kiro/specs/midtai-ux-v1.md` section 4.4
- Beads: `bd show vscode-extension-fo7`

## Definition of Done

- [ ] 画布里点「选择」按钮，鼠标变十字
- [ ] 点击图片元素，右侧面板出现
- [ ] 点「去 Image Lab」→ amber bar 出现，切到图像生成预览
- [ ] 点「从我的作品选择」→ 切到替换语境的 My Works
- [ ] 「× 取消替换」→ amber bar 消失
- [ ] `npm test` passes
- [ ] `npm run check` passes
- [ ] `npm run build` passes
- [ ] `npm run build:electron` passes
