# Midtai 图像整合规格书

**版本**：v1.0  
**日期**：2026-05-06  
**状态**：草稿 · 待 Claude PM 确认  
**背景**：中台图像 Tab 当前是纯壳，左侧表单没有绑定任何逻辑，`view-img-preview` 内容区是空占位。Image Lab 的完整生成管道（shimmer、loading、结果卡片、参考图、batchCount）已在 `page-imageLab` 实现，本规格目标是将其**复用接入 Midtai**，不重复造轮子。

---

## 一、设计原则

- **共享 imageLabState**，不新建独立状态。Midtai 图像生成和 Image Lab 共用同一个状态对象，结果统一进 `imageLabState.resultBatches`。
- **渲染分离**：新增 `renderMidtaiImagePreview()` 函数，从 `imageLabState` 读数据，渲染到 `#view-img-preview`，与 `renderImageLabResults()`（渲染到 `#imglab-results`）并存。
- **按钮复用**：Midtai「生成图片」按钮直接调用 `runImageLab()`，无需重写生成逻辑。
- **首版控件精简**：左侧只做描述、比例、数量三个核心控件，风格/参考图是 Phase 2。

---

## 二、左侧表单改动（`midtai-form-img`）

### 现状
```html
<textarea placeholder="在这里生成图片..."></textarea>
<button class="btn-red">生成图片</button>
```
textarea 无 ID，按钮无事件。

### 目标 DOM
```html
<div id="midtai-form-img" style="display:flex;flex-direction:column">
  <div class="midtai-form">
    <!-- 描述 -->
    <div class="midtai-form-group">
      <label class="midtai-form-label">图像描述</label>
      <textarea id="midtai-img-prompt" class="midtai-form-textarea"
        placeholder="描述你想要的图像..."></textarea>
    </div>
    <!-- 比例 -->
    <div class="midtai-form-group">
      <label class="midtai-form-label">比例</label>
      <div class="midtai-ratio-row">
        <button class="midtai-ratio-btn active" data-size="1024x1024">方形</button>
        <button class="midtai-ratio-btn" data-size="1792x1024">横版</button>
        <button class="midtai-ratio-btn" data-size="1024x1792">竖版</button>
      </div>
    </div>
    <!-- 数量 -->
    <div class="midtai-form-group">
      <label class="midtai-form-label">数量</label>
      <div class="midtai-qty-row">
        <button class="midtai-qty-btn active" data-count="1">1</button>
        <button class="midtai-qty-btn" data-count="2">2</button>
        <button class="midtai-qty-btn" data-count="4">4</button>
      </div>
    </div>
  </div>
  <div class="midtai-cta-wrap">
    <button class="btn-red" onclick="runMidtaiImage()">✦ 生成图片</button>
  </div>
</div>
```

### 状态
```javascript
// midtaiState 新增字段
midtaiState.imgSize = '1024x1024';   // 当前选中比例
midtaiState.imgCount = 1;            // 当前选中数量
```

---

## 三、生成触发函数 `runMidtaiImage()`

```javascript
function runMidtaiImage() {
  const prompt = document.getElementById('midtai-img-prompt')?.value.trim();
  if (!prompt) return;

  // 把 Midtai 参数同步到 Image Lab 共享的 DOM 元素，使 buildImageLabPayload() 能读到
  const sizeEl = document.getElementById('imglab-size-preset');
  const batchEl = document.getElementById('imglab-batchcount');
  if (sizeEl) sizeEl.value = midtaiState.imgSize || '1024x1024';
  if (batchEl) batchEl.value = String(midtaiState.imgCount || 1);

  // 同步 prompt 到 Image Lab textarea（runImageLab 从这里读）
  const promptEl = document.getElementById('imglab-prompt');
  if (promptEl) promptEl.value = prompt;

  // 切到生成预览并调用生成
  imgSwitchView('preview');
  runImageLab();
}
```

---

## 四、内容区 `view-img-preview` 渲染

### `renderMidtaiImagePreview()` 函数

在 `image:result`、`image:loading`、`image:error` 消息处理完后追加调用此函数（仅当 Midtai 激活时）。

渲染逻辑：

| 状态 | 显示内容 |
|---|---|
| `imageLabState.busy === true` | shimmer 占位卡片（复用 Image Lab 的 `imglab-loading-card` HTML） |
| `resultBatches.length > 0` | 结果图片网格（见下） |
| 空 | 空态：「✦ 图像生成预览 / 先在左侧输入描述，点击生成」 |

### 结果卡片 HTML（简化版）

```html
<div class="midtai-img-card">
  <img src="{url}" class="midtai-img-thumb" />
  <div class="midtai-img-actions">
    <!-- replaceCtx 为 null 时 -->
    <button onclick="insertImageToConversation('{id}')">插入到对话</button>
    <!-- replaceCtx 不为 null 时 -->
    <button class="btn-green" onclick="insertToDesign('{url}')">✓ 插入到设计</button>
  </div>
</div>
```

卡片布局：`display:grid; grid-template-columns: repeat(auto-fill, minmax(158px,1fr))`，与我的作品图片网格保持一致。

---

## 五、`image:result` 消息处理补丁

在现有 `case 'image:result':` 处理末尾追加：

```javascript
if (document.getElementById('page-midtai')?.classList.contains('active')
    && midtaiState.type === 'img') {
  renderMidtaiImagePreview();
}
```

同理在 `image:loading`、`image:error` 的处理末尾追加相同的判断。

---

## 六、提示词库 Tab（`view-plib` 图像模式）

**首版用静态数据**，不接后端。

### 数据结构
```javascript
const MIDTAI_PLIB_IMG = [
  { cat: '人像', prompts: [
    { title: '电影感人像', text: 'cinematic portrait, soft rim light, shallow depth of field, film grain' },
    { title: '极简白底', text: 'minimal product portrait, pure white background, high key lighting' },
  ]},
  { cat: '产品', prompts: [...] },
  { cat: '场景', prompts: [...] },
  { cat: '插画', prompts: [...] },
];
```

### 交互
- 分类 chips 横向滚动，点击过滤
- 卡片 hover 显示「使用」按钮
- 点击「使用」→ 把 `text` 填入 `#midtai-img-prompt`，切换到生成预览 Tab

---

## 七、比例 / 数量控件 CSS

```css
.midtai-ratio-row, .midtai-qty-row {
  display: flex; gap: 6px;
}
.midtai-ratio-btn, .midtai-qty-btn {
  flex: 1; padding: 5px 0; border: 1.5px solid #e5ddd0;
  border-radius: 7px; background: none; font-size: 12px;
  color: #57534e; cursor: pointer;
}
.midtai-ratio-btn.active, .midtai-qty-btn.active {
  border-color: #c0392b; color: #c0392b; background: #fff5f5;
}
```

---

## 八、验收标准

1. 在 Midtai 图像 Tab 输入描述，选比例/数量，点「✦ 生成图片」→ `view-img-preview` 出现 shimmer 占位
2. 生成完成 → shimmer 变为真实图片网格
3. `replaceCtx` 为 null 时：hover 显示「插入到对话」
4. `replaceCtx` 不为 null 时：hover 显示「✓ 插入到设计」，点击后画布目标元素替换
5. 提示词库：点分类 chip 过滤，点「使用」填入 prompt 并切回生成预览
6. Image Lab 原有功能不受影响（共享 state 但 DOM 渲染是分开的）

---

## 九、Out of Scope（Phase 2）

- 参考图上传
- 风格卡片（写实/平面/插画/胶片）
- 专家模式（5步进度 + 质量分 chip）
- 提示词库后端接入

---

## 十、文件改动范围

| 文件 | 改动 |
|---|---|
| `electron/renderer/index.html` | 左侧表单 DOM、`runMidtaiImage()`、`renderMidtaiImagePreview()`、`image:result` 补丁、提示词库静态数据 + 渲染、CSS |
| 其他文件 | 无 |
