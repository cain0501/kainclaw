# Task Primer: vscode-extension-dgu — 中台设计参考图上传

> **Session entry point.** Read this first.

## Task Goal

中台设计生成表单加参考图上传入口，对齐旧版 page-design 能力。上传的图片作为设计生成的视觉参考。

**涉及文件**：`electron/renderer/index.html`

---

## 现有架构

中台设计表单（HTML line ~1102-1124，`#midtai-form-design`）：
- 输出类型 select
- 设计需求 textarea
- 视觉方向选择器
- 生成按钮 `generateDesignWorkbench()`

`generateDesignWorkbench()`（搜索该函数名）发送 `design:generate` IPC，参数包含 `referenceImageDataUrl`（旧版已支持）。

旧版 page-design 的参考图上传逻辑：用户上传图片 → 读取为 base64 dataUrl → 存入 `designBridgeState.referenceImageDataUrl` → `generateDesignWorkbench()` 发送时带入。

---

## 修改详情

### Fix 1：中台设计表单加参考图上传区（HTML，line ~1102-1124）

在 `#midtai-form-design` 的设计需求 textarea 下方、视觉方向选择器上方，加参考图上传区：

```html
<div style="margin-bottom:10px">
  <div style="font-size:11px;color:#78716c;margin-bottom:6px">参考图（可选）</div>
  <div id="midtai-design-ref-preview" style="display:none;margin-bottom:6px;position:relative;width:80px;height:60px">
    <img id="midtai-design-ref-img" style="width:80px;height:60px;object-fit:cover;border-radius:6px;border:1px solid #eadfd2">
    <button onclick="clearMidtaiDesignRef()" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:#c9502e;color:#fff;border:none;cursor:pointer;font-size:10px;line-height:1;padding:0">×</button>
  </div>
  <label id="midtai-design-ref-label" style="cursor:pointer;font-size:11px;color:#c9502e;border:1px dashed #c9502e;border-radius:6px;padding:4px 10px;display:inline-block">
    + 上传参考图
    <input type="file" id="midtai-design-ref-input" accept="image/*" style="display:none" onchange="handleMidtaiDesignRefUpload(event)">
  </label>
</div>
```

### Fix 2：`handleMidtaiDesignRefUpload` 函数

```javascript
function handleMidtaiDesignRefUpload(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target?.result;
    if (typeof dataUrl !== 'string') return;
    designBridgeState.referenceImageDataUrl = dataUrl;
    designBridgeState.referenceImageMimeType = file.type || 'image/png';
    // 显示预览
    const preview = document.getElementById('midtai-design-ref-preview');
    const img = document.getElementById('midtai-design-ref-img');
    const label = document.getElementById('midtai-design-ref-label');
    if (img) img.src = dataUrl;
    if (preview) preview.style.display = 'block';
    if (label) label.style.display = 'none';
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function clearMidtaiDesignRef() {
  designBridgeState.referenceImageDataUrl = '';
  designBridgeState.referenceImageMimeType = '';
  const preview = document.getElementById('midtai-design-ref-preview');
  const label = document.getElementById('midtai-design-ref-label');
  if (preview) preview.style.display = 'none';
  if (label) label.style.display = 'inline-block';
}
```

### Fix 3：确认 `generateDesignWorkbench()` 已带入参考图

检查 `generateDesignWorkbench()` 发送 `design:generate` 时是否已包含 `referenceImageDataUrl: designBridgeState.referenceImageDataUrl`。若已有则无需改动；若无则补加。

---

## Verification

```bash
npm run check && npm run build && npm run build:electron
```

手动验证：
1. 中台设计表单出现「参考图（可选）」上传区
2. 上传图片后显示缩略图，× 可删除
3. 点生成，设计稿以参考图为视觉基础生成

## Definition of Done
- [ ] 中台设计表单有参考图上传区（单张）
- [ ] 上传后显示缩略图，可删除
- [ ] `generateDesignWorkbench()` 发送时带入 referenceImageDataUrl
- [ ] `npm run check` + `npm run build` + `npm run build:electron` 通过
