# Task Primer: vscode-extension-b7l — 中台图像自定义尺寸 + 批量上限扩展至8张

> **Session entry point.** Read this first.

## Task Goal

1. 图像尺寸支持自定义宽高输入（旧版有自定义字符串输入，新版只有3个固定比例按钮）
2. 批量数量上限从4扩展到8（旧版支持1~8，新版只有1/2/4三档）

**涉及文件**：`electron/renderer/index.html`

---

## 现有架构

中台图像表单（`#midtai-form-img`，line ~1083-1094）：

```html
<!-- 比例按钮（line ~1083-1086） -->
<div class="midtai-ratio-row">
  <button class="midtai-ratio-btn active" data-size="1024x1024" onclick="setMidtaiImageSize('1024x1024')">方形</button>
  <button class="midtai-ratio-btn" data-size="1536x1024" onclick="setMidtaiImageSize('1536x1024')">横版</button>
  <button class="midtai-ratio-btn" data-size="1024x1536" onclick="setMidtaiImageSize('1024x1536')">竖版</button>
</div>

<!-- 批量按钮（line ~1091-1094） -->
<div class="midtai-qty-row">
  <button class="midtai-qty-btn active" data-count="1" onclick="setMidtaiImageCount(1)">1</button>
  <button class="midtai-qty-btn" data-count="2" onclick="setMidtaiImageCount(2)">2</button>
  <button class="midtai-qty-btn" data-count="4" onclick="setMidtaiImageCount(4)">4</button>
</div>
```

`setMidtaiImageSize(size)`（line ~4004）：设置 `midtaiState.imgSize`，同步到 `imglab-size-preset`。

`setMidtaiImageCount(count)`（line ~4012）：设置 `midtaiState.imgCount`，同步到 `imglab-batchcount`。

旧版 `imglab-size-preset` select（line ~1269）有 `custom` 选项，`imglab-size` input（line ~1280 附近）接受自定义字符串如 `1200x800`。

`runMidtaiImage()`（line ~4026）把 `midtaiState.imgSize` 写入 `imglab-size-preset`，`midtaiState.imgCount` 写入 `imglab-batchcount`。

---

## 修改详情

### Fix 1：比例按钮区加「自定义」按钮

在 `midtai-ratio-row` 里加第四个按钮：

```html
<button class="midtai-ratio-btn" type="button" data-size="custom" onclick="setMidtaiImageSize('custom')">自定义</button>
```

### Fix 2：自定义尺寸输入框（条件显示）

在 `midtai-ratio-row` 下方加：

```html
<div id="midtai-custom-size-row" style="display:none;margin-top:6px">
  <input id="midtai-custom-size-input" type="text" placeholder="如 1200x800" 
    class="midtai-form-input" style="font-size:12px"
    oninput="onMidtaiCustomSizeInput(this.value)">
  <div style="font-size:10px;color:#a8a29e;margin-top:3px">格式：宽x高，如 1200x800</div>
</div>
```

### Fix 3：`setMidtaiImageSize` 修改

找到 `setMidtaiImageSize`（line ~4004），在函数里加自定义尺寸行的显示/隐藏：

```javascript
function setMidtaiImageSize(size) {
  midtaiState.imgSize = size || '1024x1024';
  document.querySelectorAll('#midtai-form-img .midtai-ratio-btn').forEach(button => {
    button.classList.toggle('active', button.dataset.size === midtaiState.imgSize);
  });
  // 控制自定义输入框显示
  const customRow = document.getElementById('midtai-custom-size-row');
  if (customRow) customRow.style.display = size === 'custom' ? 'block' : 'none';
}
```

### Fix 4：`onMidtaiCustomSizeInput` 函数

```javascript
function onMidtaiCustomSizeInput(value) {
  midtaiState.imgCustomSize = value.trim();
}
```

### Fix 5：`runMidtaiImage` 处理自定义尺寸

找到 `runMidtaiImage()`（line ~4026），修改 `sizeEl.value` 赋值逻辑：

```javascript
// 原来：
if (sizeEl) sizeEl.value = midtaiState.imgSize || '1024x1024';

// 改为：
if (sizeEl) {
  if (midtaiState.imgSize === 'custom') {
    sizeEl.value = 'custom';
    const customInput = document.getElementById('imglab-size');
    if (customInput) customInput.value = midtaiState.imgCustomSize || '1024x1024';
  } else {
    sizeEl.value = midtaiState.imgSize || '1024x1024';
  }
}
```

### Fix 6：批量按钮区加 6 和 8

在 `midtai-qty-row` 里加两个按钮：

```html
<button class="midtai-qty-btn" type="button" data-count="6" onclick="setMidtaiImageCount(6)">6</button>
<button class="midtai-qty-btn" type="button" data-count="8" onclick="setMidtaiImageCount(8)">8</button>
```

### Fix 7：`midtaiState` 加 imgCustomSize

在 `midtaiState` 初始化对象里加：

```javascript
imgCustomSize: '',
```

---

## 实现顺序

1. `midtaiState` 加 `imgCustomSize: ''`
2. HTML：比例按钮区加「自定义」按钮 + 自定义输入框
3. HTML：批量按钮区加 6 和 8
4. 修改 `setMidtaiImageSize()` — 控制自定义输入框显示
5. 加 `onMidtaiCustomSizeInput()` 函数
6. 修改 `runMidtaiImage()` — 处理 custom 尺寸

---

## Verification

```bash
npm run check && npm run build && npm run build:electron
```

手动验证：
1. 比例按钮区出现「自定义」按钮，点击后出现输入框
2. 输入 `1200x800`，点生成，图片以该尺寸生成
3. 批量按钮区出现 6 和 8，点击后生成对应数量

## Definition of Done
- [ ] 比例按钮区有「自定义」选项，选中后显示尺寸输入框
- [ ] 自定义尺寸正确传入 runImageLab()
- [ ] 批量按钮区有 6 和 8 选项
- [ ] `npm run check` + `npm run build` + `npm run build:electron` 通过
