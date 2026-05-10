# Task Primer: vscode-extension-buv — 中台图像重生成/停止生成按钮

> **Session entry point.** Read this first.

## Task Goal

图像生成中加「停止」按钮；生成完成后加「重新生成」按钮（用相同参数再生成一次）。

**涉及文件**：`electron/renderer/index.html`

---

## 现有架构

旧版停止：`stopImageLab()`（line ~8921）发送 `image:abort`。  
旧版重生成：`rerunImageLab()`（line ~9053）复用 `imageLabState.lastRequest` 再调 `runImageLab()`。

中台图像生成走 `runMidtaiImage()` → `runImageLab()`，生成状态在 `imageLabState.busy`。

中台图像预览区由 `renderMidtaiImagePreview()`（line ~4042）渲染，生成中显示 pending batch。

---

## 修改详情

### Fix 1：生成中显示「停止」按钮

在 `renderMidtaiImagePreview()` 里，当 `imageLabState.busy === true` 时，在预览区顶部加停止按钮：

```javascript
// 在 renderMidtaiImagePreview() 的 container.innerHTML 拼接里，busy 时加：
if (imageLabState.busy) {
  container.innerHTML = `
    <div style="display:flex;justify-content:flex-end;padding:8px 12px 0">
      <button onclick="stopMidtaiImage()" style="font-size:12px;color:#c9502e;border:1px solid #c9502e;background:#fff;border-radius:6px;padding:4px 12px;cursor:pointer">■ 停止生成</button>
    </div>
    ${container.innerHTML}
  `;
}
```

实际上更好的做法是在 `renderMidtaiImagePreview` 的 HTML 模板里条件渲染，而不是二次修改 innerHTML。找到该函数的渲染逻辑，在合适位置插入停止按钮。

### Fix 2：`stopMidtaiImage` 函数

```javascript
function stopMidtaiImage() {
  stopImageLab(); // 复用旧版函数，发 image:abort
}
```

### Fix 3：生成完成后显示「重新生成」按钮

在 `renderMidtaiImagePreview()` 里，当 `!imageLabState.busy && batches.length > 0` 时，在预览区顶部加重新生成按钮：

```javascript
function rerunMidtaiImage() {
  if (!imageLabState.lastRequest) return;
  // 把上次请求的参数填回中台表单
  const promptEl = document.getElementById('midtai-img-prompt');
  if (promptEl && imageLabState.lastRequest.prompt) {
    promptEl.value = imageLabState.lastRequest.prompt;
  }
  runMidtaiImage();
}
```

在预览区有结果时渲染重新生成按钮：
```html
<button onclick="rerunMidtaiImage()" style="font-size:12px;color:#78716c;border:1px solid #eadfd2;background:#fff;border-radius:6px;padding:4px 12px;cursor:pointer">↺ 重新生成</button>
```

---

## 实现顺序

1. 加 `stopMidtaiImage()` 函数
2. 加 `rerunMidtaiImage()` 函数  
3. `renderMidtaiImagePreview()` 里条件渲染两个按钮

---

## Verification

```bash
npm run check && npm run build && npm run build:electron
```

手动验证：
1. 点生成 → 生成中出现「停止生成」按钮 → 点击停止，生成中断
2. 生成完成后出现「重新生成」按钮 → 点击，用相同 prompt 再生成一次

## Definition of Done
- [ ] 生成中显示「停止生成」按钮，点击有效
- [ ] 生成完成后显示「重新生成」按钮，点击复用上次参数
- [ ] `npm run check` + `npm run build` + `npm run build:electron` 通过
