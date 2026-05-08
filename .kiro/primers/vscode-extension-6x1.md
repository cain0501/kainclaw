# Task Primer: vscode-extension-6x1 — 中台画布元素选择逻辑修复

> **Session entry point.** Read this first.

## Task Goal

中台画布选择模式下，点击 div 容器类元素（如 `div.hero-copy`、`div.container`）选不中，只能选到 img、h1/h2/h3、li 等叶子节点。

**根因**：`buildMidtaiCanvasSrcdoc` 的 click handler 会往上找 6 层寻找 IMG 或背景图元素，跑偏了选中目标。

**修法**：改回旧版 `closest('body *')` 逻辑，图片判断只用来决定显示哪个面板，不影响选中哪个元素。

**涉及文件**：`electron/renderer/index.html`（仅改 `buildMidtaiCanvasSrcdoc` 里的 bridge script）

---

## 对比：旧版 vs 新版

### 旧版（`buildDesignPatchableSrcdoc` line ~4908，正确）

```javascript
document.addEventListener('click', event => {
  const el = event.target instanceof Element ? event.target.closest('body *') : null;
  if (!el) return;
  event.preventDefault();
  event.stopPropagation();
  // el 就是用户点的那个元素，直接用
  const selector = buildSelector(el);
  // ...发消息
}, true);
```

### 新版（`buildMidtaiCanvasSrcdoc` line ~3636，有问题）

```javascript
document.addEventListener('click', function(e) {
  if (!window.__kcSelectMode) return;
  const target = e.target;
  let found = target;
  let node = target;
  for (let i = 0; i < 6 && node && node !== document.documentElement; i++) {
    if (node.tagName === 'IMG') { found = node; break; }          // ← 往上找图片，跑偏
    const bg = window.getComputedStyle(node).backgroundImage;
    if (bg && bg !== 'none' && bg !== '') { found = node; break; } // ← 往上找背景图，跑偏
    node = node.parentElement;
  }
  // found 可能不是用户想选的元素
```

---

## 修改详情

### `buildMidtaiCanvasSrcdoc` 的 click handler（`electron/renderer/index.html` line ~3636）

**改前**（整个 click handler 的选择逻辑）：
```javascript
document.addEventListener('click', function(e) {
  if (!window.__kcSelectMode) return;
  const target = e.target;
  if (!target || target === document.documentElement) return;
  // Prefer image/bg-image elements; fall back to the clicked target
  let found = target;
  let node = target;
  for (let i = 0; i < 6 && node && node !== document.documentElement; i++) {
    if (node.tagName === 'IMG') { found = node; break; }
    const bg = window.getComputedStyle(node).backgroundImage;
    if (bg && bg !== 'none' && bg !== '') { found = node; break; }
    node = node.parentElement;
  }
  e.preventDefault();
  e.stopPropagation();
  // ... 后续用 found
```

**改后**：
```javascript
document.addEventListener('click', function(e) {
  if (!window.__kcSelectMode) return;
  const found = e.target instanceof Element ? e.target.closest('body *') : null;
  if (!found) return;
  e.preventDefault();
  e.stopPropagation();
  // ... 后续用 found（其余代码不变）
```

`isImg` 判断（用于决定显示「替换图片」还是「改写元素」面板）改为：
```javascript
// 改前（依赖 found 的 tagName/src）：
const isImgNode = String(payload.tagName || '').toUpperCase() === 'IMG' || ...

// 改后（在 click handler 里直接判断）：
const isImg = found.tagName === 'IMG' ||
  (window.getComputedStyle(found).backgroundImage || '').includes('url(');
```

然后把 `isImg` 加入 postMessage payload：
```javascript
window.parent.postMessage({
  type: '__midtai_node_selected',
  tagName: found.tagName,
  isImg,           // ← 新增，让外层直接用，不用再猜
  src: found.src || readBackgroundImageUrl(found) || '',
  selector: buildSelector(found),
  // ... 其余不变
}, '*');
```

`handleMidtaiCanvasFrameMessage`（line ~3747）里的 `isImgNode` 判断改为优先用 `payload.isImg`：
```javascript
const isImgNode = typeof payload.isImg === 'boolean'
  ? payload.isImg
  : String(payload.tagName || '').toUpperCase() === 'IMG' || (typeof payload.src === 'string' && payload.src.length > 0);
```

---

## 实现顺序

1. `buildMidtaiCanvasSrcdoc` click handler：改为 `closest('body *')`，删掉 6 层往上找的循环
2. click handler 里计算 `isImg`，加入 postMessage payload
3. `handleMidtaiCanvasFrameMessage` 里优先用 `payload.isImg`

---

## 不需要做的事

- **不改 `buildDesignPatchableSrcdoc`**：旧版逻辑本来就对，不动
- **不改 `buildSelector`**：选择器生成逻辑已经正确（有 nth-of-type）
- **不改后端**：纯 renderer 改动

---

## Verification

```bash
npm run check
npm run build
npm run build:electron
```

手动验证：
1. 进中台 → 打开设计画布 → 切换到选择模式
2. 点击 div 容器（如 hero section、card 容器）→ 应能选中该 div，弹出改写面板
3. 点击 img 元素 → 应弹出「替换图片」面板
4. 点击有背景图的 div → 应弹出「替换图片」面板（isImg=true）
5. 点击文字段落 → 应选中该 p/span，弹出改写面板

---

## Definition of Done

- [ ] 点击任意 div 容器能正确选中该元素
- [ ] img 和有背景图的元素仍显示「替换图片」面板
- [ ] 普通 div/p/span 显示「改写元素」面板
- [ ] `buildSelector` 生成的选择器与选中元素一致
- [ ] `npm run check` + `npm run build` + `npm run build:electron` 通过
