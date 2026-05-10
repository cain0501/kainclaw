# Task Primer: vscode-extension-flz — 中台图像识图反推 prompt

> **Session entry point.** Read this first.
> **依赖**：vscode-extension-1yr（参考图上传）必须先完成。

## Task Goal

上传参考图后，提供「AI 反推 prompt」按钮，调用视觉模型分析图片内容，自动填入描述输入框。

**涉及文件**：`electron/renderer/index.html`

---

## 现有架构

旧版识图反推：`inferImageLabPrompt()`（line ~4854）发送 `image:inferPrompt`，后端调用 `inferPromptFromReferenceImages`（`src/imageGeneration/imagePromptInference.ts`）。

后端返回 `image:inferredPrompt` 消息，renderer 收到后填入 prompt 输入框。

`imageLabState.referenceImages` 在 vscode-extension-1yr 完成后已有数据。

---

## 修改详情

### Fix 1：参考图上传区加「反推 prompt」按钮

在 vscode-extension-1yr 加的 `#midtai-img-refs` 区域里，上传按钮旁边加：

```html
<button id="midtai-infer-prompt-btn" onclick="inferMidtaiPrompt()" 
  style="font-size:11px;color:#78716c;border:1px solid #eadfd2;background:#fff;border-radius:6px;padding:4px 10px;cursor:pointer;display:none">
  ✦ AI 反推描述
</button>
```

当 `imageLabState.referenceImages.length > 0` 时显示该按钮（在 `renderMidtaiImageRefList()` 里控制 display）。

### Fix 2：`inferMidtaiPrompt` 函数

```javascript
function inferMidtaiPrompt() {
  const refs = imageLabState.referenceImages || [];
  if (!refs.length) return;
  const btn = document.getElementById('midtai-infer-prompt-btn');
  if (btn) { btn.disabled = true; btn.textContent = '分析中…'; }
  // 复用旧版逻辑：填入 imglab-ref 字段再调旧版函数
  inferImageLabPrompt(); // 旧版函数，发 image:inferPrompt
}
```

### Fix 3：`image:inferredPrompt` handler 里同步填入中台表单

找到 `image:inferredPrompt` 的 handleMessage case（旧版已有），在填入 `imglab-prompt` 的同时，也填入中台的 `midtai-img-prompt`：

```javascript
case 'image:inferredPrompt': {
  // 旧版已有的逻辑...
  const midtaiPromptEl = document.getElementById('midtai-img-prompt');
  if (midtaiPromptEl && typeof msg.prompt === 'string') {
    midtaiPromptEl.value = msg.prompt;
  }
  // 恢复按钮
  const btn = document.getElementById('midtai-infer-prompt-btn');
  if (btn) { btn.disabled = false; btn.textContent = '✦ AI 反推描述'; }
  break;
}
```

---

## Verification

```bash
npm run check && npm run build && npm run build:electron
```

手动验证：
1. 上传参考图后，出现「AI 反推描述」按钮
2. 点击后按钮变为「分析中…」
3. 分析完成后，描述框自动填入 AI 生成的 prompt

## Definition of Done
- [ ] 有参考图时显示「AI 反推描述」按钮
- [ ] 点击后调用 inferImageLabPrompt()
- [ ] 结果填入中台描述框
- [ ] `npm run check` + `npm run build` + `npm run build:electron` 通过
