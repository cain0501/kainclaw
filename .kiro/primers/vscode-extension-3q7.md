# Task Primer: vscode-extension-3q7 — Midtai 画布：调节/导出/版本历史三项能力接入

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

Midtai 画布工具栏有三个 `disabled` 按钮：**调节 / 版本历史 / 导出**。
旧版设计工作台已有完整实现（零件库），数据层全部就绪。
本任务只做 UI 挂载 + bridge wiring，不改任何业务逻辑。

**所有改动只在 `electron/renderer/index.html`。**

---

## Out of Scope

- 不改 `src/extension.ts`
- 不改 `src/webviewHtml.ts`
- 不改任何 `.ts` 文件
- 不改设计 prompt 逻辑
- 不改 Midtai 图像功能

---

## 背景：可复用的零件

| 零件 | 位置 | 作用 |
|---|---|---|
| `designBridgeState.sliders` | `design:result` handler 写入（~line 2576）| CSS 变量滑块定义数组 |
| `designBridgeState.sliderValues` | 同上 | 用户已调节的值 |
| `designBridgeState.versions` | 同上 | 版本历史数组 |
| `renderDesignSlidersPanel(panel, frameEl)` | ~line 5297 | 渲染滑块 UI |
| `applyAllDesignSliderValues(frameEl)` | ~line 5358 | postMessage 到 iframe |
| `applyDesignSliderValue(sliderId, value)` | ~line 5381 | 单个滑块变更 |
| `exportDesign(format)` — IPC send | 旧版导出按钮调用，搜 `exportDesign` 找到 | 发 IPC 导出 |
| `__kc_apply_slider_values` message listener | `buildDesignPatchableSrcdoc` bridge 内（~line 4692）| 接收 postMessage 写 CSS var |

---

## 三项改动详细说明

### 1. 调节（CSS 变量滑块）

**数据层：已就绪。**

需要做的 4 件事：

#### 1a. `buildMidtaiCanvasSrcdoc` bridge 加监听器

在 `buildMidtaiCanvasSrcdoc`（~line 3544）的 `bridgeCode` 字符串里，
在已有的 `window.addEventListener('message', ...)` 块里追加对 `__kc_apply_slider_values` 的处理，
或者加第二个 `window.addEventListener('message', ...)`。

复制自 `buildDesignPatchableSrcdoc` bridge（~line 4692），逻辑一模一样：

```javascript
window.addEventListener('message', function(e) {
  const payload = e.data || {};
  if (payload.type !== '__kc_apply_slider_values' || !payload.values || typeof payload.values !== 'object') return;
  const root = document.documentElement;
  Object.entries(payload.values).forEach(function(entry) {
    if (!entry[0]) return;
    root.style.setProperty(String(entry[0]), String(entry[1]));
  });
});
```

**注意**：`buildMidtaiCanvasSrcdoc` 的 bridgeCode 是模板字符串，已有一个 `window.addEventListener('message', ...)` 处理 `__midtai_set_select_mode`。可以把新监听器合并进去（加 else if），也可以加独立第二个监听器，都可以。

#### 1b. HTML 工具栏按钮启用

当前（~line 1179）：
```html
<button id="midtai-canvas-tweak-btn" class="canvas-mode-btn" disabled title="调节模式即将支持" style="opacity:.45;cursor:not-allowed">调节</button>
```
改为：
```html
<button id="midtai-canvas-tweak-btn" class="canvas-mode-btn" onclick="setMidtaiCanvasMode('tweak')">调节</button>
```

#### 1c. 加 `midtai-sliders-panel` DOM

在 `view-canvas` 内，`midtai-canvas-shell` 里，`midtai-canvas-frame` 旁边（同级），加：

```html
<div id="midtai-sliders-panel" style="display:none;width:240px;flex-shrink:0;background:rgba(255,255,255,.97);border-left:1px solid #eadfd2;border-radius:0 20px 20px 0;padding:16px;overflow-y:auto;box-shadow:-4px 0 16px rgba(77,49,24,.07)"></div>
```

`midtai-canvas-shell` 当前是 flex 容器，直接在 `midtai-canvas-frame` 后面插入这个 div 即可。

#### 1d. `setMidtaiCanvasMode` 支持 `'tweak'`

当前实现（~line 3765）只支持 `'view'` / `'select'`，`'tweak'` 会 fallthrough 到 `'view'`。

改为支持三态：

```javascript
function setMidtaiCanvasMode(mode) {
  midtaiState.canvasMode = ['select', 'tweak'].includes(mode) ? mode : 'view';
  document.getElementById('midtai-canvas-view-btn')?.classList.toggle('active', midtaiState.canvasMode === 'view');
  document.getElementById('midtai-canvas-select-btn')?.classList.toggle('active', midtaiState.canvasMode === 'select');
  document.getElementById('midtai-canvas-tweak-btn')?.classList.toggle('active', midtaiState.canvasMode === 'tweak');

  const slidersPanel = document.getElementById('midtai-sliders-panel');
  if (midtaiState.canvasMode === 'tweak') {
    hideMidtaiNodePanel();
    postMidtaiCanvasSelectMode(false);
    if (slidersPanel) {
      const frameEl = document.getElementById('midtai-canvas-iframe');
      renderDesignSlidersPanel(slidersPanel, frameEl);
    }
  } else {
    if (slidersPanel) slidersPanel.style.display = 'none';
    if (midtaiState.canvasMode === 'view') {
      hideMidtaiNodePanel();
    }
    postMidtaiCanvasSelectMode(midtaiState.canvasMode === 'select');
  }
}
```

#### 1e. `applyDesignSliderValue` 修复 hardcoded frame

当前（~line 5381）：
```javascript
const frameEl = document.getElementById('design-bridge-frame');
applyAllDesignSliderValues(frameEl);
renderDesignBridgePage();
```

改为根据当前页面选对应 frame：

```javascript
const isMidtai = document.getElementById('page-midtai')?.classList.contains('active');
const frameEl = isMidtai
  ? document.getElementById('midtai-canvas-iframe')
  : document.getElementById('design-bridge-frame');
applyAllDesignSliderValues(frameEl);
if (!isMidtai) renderDesignBridgePage();
if (isMidtai) {
  const slidersPanel = document.getElementById('midtai-sliders-panel');
  if (slidersPanel && slidersPanel.style.display !== 'none') {
    renderDesignSlidersPanel(slidersPanel, frameEl);
  }
}
```

---

### 2. 导出

#### 2a. 找到 `exportDesign` 函数

搜索 `function exportDesign` 或 `exportDesign(` 找到旧版导出入口，确认函数签名（通常是 `exportDesign(format)` 或直接 send IPC）。

#### 2b. 启用导出按钮

当前（~line 1183）：
```html
<button class="canvas-toolbar-btn" disabled style="opacity:.45;cursor:not-allowed">导出</button>
```

改为下拉菜单或直接触发，最简单方案是弹出选择（HTML / PDF / PPTX）：

```html
<div style="position:relative;display:inline-block">
  <button class="canvas-toolbar-btn" onclick="toggleMidtaiExportMenu()">导出 ▾</button>
  <div id="midtai-export-menu" style="display:none;position:absolute;top:100%;right:0;background:#fff;border:1px solid #eadfd2;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.1);z-index:100;min-width:120px;overflow:hidden">
    <button onclick="exportDesign('html');toggleMidtaiExportMenu()" style="display:block;width:100%;text-align:left;padding:8px 14px;border:none;background:none;cursor:pointer;font-size:12px;color:#2d1f14" onmouseover="this.style.background='#f6f1ea'" onmouseout="this.style.background='none'">导出 HTML</button>
    <button onclick="exportDesign('pdf');toggleMidtaiExportMenu()" style="display:block;width:100%;text-align:left;padding:8px 14px;border:none;background:none;cursor:pointer;font-size:12px;color:#2d1f14" onmouseover="this.style.background='#f6f1ea'" onmouseout="this.style.background='none'">导出 PDF</button>
    <button onclick="exportDesign('pptx');toggleMidtaiExportMenu()" style="display:block;width:100%;text-align:left;padding:8px 14px;border:none;background:none;cursor:pointer;font-size:12px;color:#2d1f14" onmouseover="this.style.background='#f6f1ea'" onmouseout="this.style.background='none'">导出 PPTX</button>
  </div>
</div>
```

加辅助函数：
```javascript
function toggleMidtaiExportMenu() {
  const menu = document.getElementById('midtai-export-menu');
  if (menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}
```

**注意**：先搜一下旧版 `exportDesign` 的实际实现，确认函数名和参数正确再用。

---

### 3. 版本历史

#### 3a. 启用版本历史按钮

当前（~line 1182）：
```html
<button class="canvas-toolbar-btn" disabled style="opacity:.45;cursor:not-allowed">版本历史</button>
```

改为：
```html
<button class="canvas-toolbar-btn" onclick="toggleMidtaiVersionsPanel()">版本历史</button>
```

#### 3b. 加 `midtai-versions-panel` DOM

在 `midtai-sliders-panel` 同级位置（或共用右侧面板区域），加：

```html
<div id="midtai-versions-panel" style="display:none;width:240px;flex-shrink:0;background:rgba(255,255,255,.97);border-left:1px solid #eadfd2;border-radius:0 20px 20px 0;padding:16px;overflow-y:auto;box-shadow:-4px 0 16px rgba(77,49,24,.07)"></div>
```

#### 3c. `toggleMidtaiVersionsPanel` + `renderMidtaiVersionsPanel`

```javascript
function toggleMidtaiVersionsPanel() {
  const panel = document.getElementById('midtai-versions-panel');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  panel.style.display = isOpen ? 'none' : 'block';
  if (!isOpen) renderMidtaiVersionsPanel(panel);
}

function renderMidtaiVersionsPanel(panel) {
  const versions = Array.isArray(designBridgeState.versions) ? designBridgeState.versions : [];
  if (!versions.length) {
    panel.innerHTML = '<div style="font-size:12px;color:#a8998a;padding:8px 0">暂无版本记录</div>';
    return;
  }
  panel.innerHTML = [
    '<div style="font-size:12px;font-weight:700;color:#7b4a2e;letter-spacing:.04em;text-transform:uppercase;margin-bottom:10px">版本历史</div>',
    ...versions.map((v, i) => {
      const label = v.label || v.title || `版本 ${i + 1}`;
      const ts = v.ts ? new Date(v.ts).toLocaleTimeString() : '';
      return `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f0e8df">
        <div>
          <div style="font-size:12px;color:#2d1f14">${escapeHtml(label)}</div>
          ${ts ? `<div style="font-size:10px;color:#a8998a">${ts}</div>` : ''}
        </div>
        <button class="btn-secondary" style="font-size:10px;padding:3px 8px" onclick="loadMidtaiVersion(${i})">恢复</button>
      </div>`;
    }),
  ].join('');
}

function loadMidtaiVersion(index) {
  const versions = Array.isArray(designBridgeState.versions) ? designBridgeState.versions : [];
  const version = versions[index];
  if (!version) return;
  // 版本数据结构：version.html 或通过 IPC 拉取
  // 先检查 version.html 是否直接可用
  if (version.html) {
    designBridgeState.html = version.html;
    openCanvas(midtaiState.currentProject);
  }
  // 如果版本只有 id，需要 IPC：send({ type: 'design:getVersion', id: version.id })
  // 参考旧版版本历史的实现方式，保持一致
}
```

**注意**：在实现 `loadMidtaiVersion` 前，先搜旧版版本历史的加载逻辑（搜 `design:getVersion` 或 `loadVersion`），复用相同的 IPC 调用方式。

---

## 实现顺序建议

1. 先做 **调节** (1a → 1b → 1c → 1d → 1e)，完成后立即验证
2. 再做 **导出** (2a → 2b)
3. 最后做 **版本历史** (3a → 3b → 3c)

如果时间有限，调节是 P0，其余是 P1。

---

## Verification

```bash
npm run build:electron
node -e "const fs=require('fs'),html=fs.readFileSync('electron/renderer/index.html','utf8');const m=html.match(/<script>([\s\S]*?)<\/script>/g)||[];let js='';m.forEach(s=>{js+=s.replace(/<\/?script>/g,'')+'\n';});try{new Function(js);console.log('OK');}catch(e){console.error(e.message);process.exit(1);}"
```

Manual test:
- Step 1: 启动 Electron，生成一个设计
- Step 2: 进入画布，点「调节」→ 右侧面板出现滑块
- Step 3: 拖动滑块 → 画布 CSS 变量实时变化
- Step 4: 点「导出」→ 下拉菜单出现，点 HTML 触发导出
- Step 5: 点「版本历史」→ 右侧面板出现版本列表

---

## Risk Points

- `buildMidtaiCanvasSrcdoc` bridgeCode 是模板字符串，escape 要注意：用 `\\(` 而不是 `\(`（已有示例可参考）
- `midtai-canvas-shell` 是 flex 容器，`midtai-sliders-panel` 和 `midtai-versions-panel` 作为 flex 子项插入，宽度固定，不能撑满
- `applyDesignSliderValue` 修改后，旧版 Design Workbench 的滑块行为必须保持不变（`isMidtai` 为 false 时走原来逻辑）

## High-Risk Files Touched

- `electron/renderer/index.html` — 所有改动集中在此文件

## Definition of Done

- [ ] 点「调节」→ 右侧滑块面板出现，拖动滑块画布 CSS 变量实时更新
- [ ] 点「导出」→ 格式菜单出现，可触发导出
- [ ] 点「版本历史」→ 版本列表出现，可恢复版本
- [ ] 旧版 Design Workbench 滑块行为未受影响
- [ ] `npm run build:electron` 通过
- [ ] JS 语法检查通过

---

## Already Completed

- Midtai 画布工具栏已启用 `调节 / 版本历史 / 导出` 三项入口，全部复用现有 Design Workbench 数据和 IPC 路径
- `buildMidtaiCanvasSrcdoc` 已接入 `__kc_apply_slider_values` bridge 消息，Midtai 画布 iframe 可实时应用 CSS 变量滑块值
- `setMidtaiCanvasMode` 已支持 `tweak`，并新增 `midtai-sliders-panel` / `midtai-versions-panel` / `midtai-export-menu` 右侧能力面板
- `applyDesignSliderValue` 已按页面上下文分流，Midtai 画布走 `midtai-canvas-iframe`，旧版 Design Workbench 继续走原 `design-bridge-frame`
- `loadMidtaiVersion` / `exportDesign` 已作为薄封装接到现有 `restoreDesignVersion` / `exportDesignWorkbench`
- 验证通过：`npm test`、`npm run check`、`npm run build`、`npm run build:electron`、inline `<script>` JS syntax check、UTF-8 decode check
