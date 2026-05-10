# Task Primer: vscode-extension-1yr — 中台图像参考图上传

> **Session entry point.** Read this first.

## Task Goal

中台图像生成表单加参考图上传入口，支持最多 4 张图联合改图，对齐旧版 page-image-lab 能力。

**涉及文件**：`electron/renderer/index.html`

---

## 现有架构（重要）

`runMidtaiImage()`（line ~4018）是中台图像的提交函数，它把中台表单的值填入旧版 imglab 字段，再调 `runImageLab()`：

```javascript
function runMidtaiImage() {
  const prompt = document.getElementById('midtai-img-prompt')?.value.trim();
  // 填入旧版字段
  document.getElementById('imglab-prompt').value = prompt;
  document.getElementById('imglab-size-preset').value = midtaiState.imgSize || '1024x1024';
  document.getElementById('imglab-batchcount').value = String(midtaiState.imgCount || 1);
  midtaiState.imgPreviewSession = true;
  imgSwitchView('preview');
  runImageLab();  // ← 旧版函数，已支持 referenceImages
}
```

旧版 `runImageLab()` 发送 `image:run` 时带 `referenceImages: imageLabState.referenceImages`（line ~9045）。

旧版参考图存在 `imageLabState.referenceImages[]`，最多 4 张（line ~7463）。

---

## 修改详情

### Fix 1：中台图像表单加参考图上传区（HTML，line ~1075-1101）

在 `#midtai-form-img` 的描述 textarea 下方、比例按钮上方，加参考图上传区：

```html
<div id="midtai-img-refs" style="margin-bottom:10px">
  <div style="font-size:11px;color:#78716c;margin-bottom:6px">参考图（可选，最多4张）</div>
  <div id="midtai-img-ref-list" style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px"></div>
  <label style="cursor:pointer;font-size:11px;color:#c9502e;border:1px dashed #c9502e;border-radius:6px;padding:4px 10px;display:inline-block">
    + 上传参考图
    <input type="file" id="midtai-img-ref-input" accept="image/*" multiple style="display:none" onchange="handleMidtaiImageRefUpload(event)">
  </label>
</div>
```

### Fix 2：`handleMidtaiImageRefUpload` 函数

```javascript
function handleMidtaiImageRefUpload(event) {
  const files = Array.from(event.target.files || []);
  const current = imageLabState.referenceImages || [];
  const remaining = 4 - current.length;
  if (remaining <= 0) return;
  const toAdd = files.slice(0, remaining);
  toAdd.forEach(file => {
    const reader = new FileReader();
    reader.onload = e => {
      const dataUrl = e.target?.result;
      if (typeof dataUrl !== 'string') return;
      imageLabState.referenceImages = [
        ...(imageLabState.referenceImages || []),
        { dataUrl, mimeType: file.type || 'image/png', name: file.name },
      ].slice(0, 4);
      renderMidtaiImageRefList();
    };
    reader.readAsDataURL(file);
  });
  event.target.value = '';
}
```

### Fix 3：`renderMidtaiImageRefList` 函数

渲染已上传的参考图缩略图，每张带删除按钮：

```javascript
function renderMidtaiImageRefList() {
  const list = document.getElementById('midtai-img-ref-list');
  if (!list) return;
  const refs = imageLabState.referenceImages || [];
  list.innerHTML = refs.map((ref, i) => `
    <div style="position:relative;width:48px;height:48px">
      <img src="${ref.dataUrl}" style="width:48px;height:48px;object-fit:cover;border-radius:4px;border:1px solid #eadfd2">
      <button onclick="removeMidtaiImageRef(${i})" style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:#c9502e;color:#fff;border:none;cursor:pointer;font-size:10px;line-height:1;padding:0">×</button>
    </div>
  `).join('');
}

function removeMidtaiImageRef(index) {
  imageLabState.referenceImages = (imageLabState.referenceImages || []).filter((_, i) => i !== index);
  renderMidtaiImageRefList();
}
```

### Fix 4：`runMidtaiImage` 清空参考图后重置列表

在 `runMidtaiImage()` 调用 `runImageLab()` 之后，不清空参考图（让用户可以继续用同一组参考图再生成）。但在 `showImgView('img-works')` 切换时重置：无需额外操作，`imageLabState.referenceImages` 已由旧版逻辑管理。

---

## 实现顺序

1. HTML：在 `#midtai-form-img` 加参考图上传区
2. JS：加 `handleMidtaiImageRefUpload`、`renderMidtaiImageRefList`、`removeMidtaiImageRef`
3. 确认 `runMidtaiImage()` 不需要额外改动（`runImageLab()` 已读 `imageLabState.referenceImages`）

---

## Verification

```bash
npm run check
npm run build
npm run build:electron
```

手动验证：
1. 中台图像表单出现「参考图（可选）」上传区
2. 上传1-4张图，缩略图正常显示，可删除
3. 点生成，图片以参考图为基础生成（走 image_edit 路径）
4. 超过4张时不再接受新上传

## Definition of Done
- [ ] 中台图像表单有参考图上传区
- [ ] 最多4张，有缩略图预览和删除按钮
- [ ] 生成时参考图传入 runImageLab()
- [ ] `npm run check` + `npm run build` + `npm run build:electron` 通过
