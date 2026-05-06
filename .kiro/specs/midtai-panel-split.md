# Midtai 面板拆分 + 缩略图懒加载 + 数据源解耦

**Beads ID**：vscode-extension-4bi  
**版本**：v1.1  
**日期**：2026-05-06  
**状态**：草稿

---

## 一、背景与目标

### 现状问题

1. **状态互串**：图像和设计共用 `showOnlyMidtaiView()` + `showTabBar()`，切换时需要判断 `midtaiState.type`，一旦 type 判断出错就显示错误的视图（如打开设计时 type tab 跑到图像）。

2. **我的作品混排**：`renderMidtaiWorks()` 把设计卡片和图像卡片混合渲染，耦合两套数据源。

3. **缩略图卡顿**：渲染「我的作品」时把所有缩略图的 base64 字符串直接拼进 `innerHTML`，浏览器一次性解码所有图片，主线程卡顿。已加载过的缩略图下次进页面还是重新解码。

4. **数据源混用**：`midtaiState.libraryItems` 是一个数组，设计项目和图像批次混装，渲染时靠 `filter(type==='design')` 分拣。两个面板耦合同一个数据源，后端一次返回全部。

### 目标

- 图像和设计变成两个完全独立的面板，切 type tab = 整块换面板，内部状态互不干扰
- 我的作品按面板分开，各显各的
- 缩略图内存缓存 + 懒加载，首次异步填入，再次进页面秒显示
- 数据源彻底解耦：设计库和图像库各自独立，各自订阅各自的更新

---

## 二、新 DOM 结构

```html
<!-- 中台右侧内容区 -->
<div id="midtai-content">

  <!-- ① 图像面板 -->
  <div id="midtai-panel-img" class="midtai-panel">
    <div id="mtbar-img" class="midtai-tabbar">
      <button class="mt-tab active" data-view="img-preview">生成预览</button>
      <button class="mt-tab" data-view="img-works">我的作品</button>
      <button class="mt-tab" data-view="img-plib">提示词库</button>
    </div>
    <div id="view-img-preview" class="midtai-view"></div>
    <div id="view-img-works"   class="midtai-view" style="display:none"></div>
    <div id="view-img-plib"    class="midtai-view" style="display:none"></div>
  </div>

  <!-- ② 设计面板 -->
  <div id="midtai-panel-design" class="midtai-panel" style="display:none">
    <div id="mtbar-design" class="midtai-tabbar">
      <button class="mt-tab active" data-view="design-preview">生成预览</button>
      <button class="mt-tab" data-view="design-works">我的作品</button>
      <button class="mt-tab" data-view="design-plib">提示词库</button>
    </div>
    <div id="view-design-preview" class="midtai-view"></div>
    <div id="view-design-works"   class="midtai-view" style="display:none"></div>
    <div id="view-canvas"         class="midtai-view" style="display:none"></div>
    <div id="view-design-plib"    class="midtai-view" style="display:none"></div>
  </div>

</div>
```

**规则**：
- 切 type tab（图像/设计）→ 切 `midtai-panel-img` / `midtai-panel-design` 的 display
- 面板内部的 tab 只控制自己面板内的视图，不影响另一个面板
- `#view-canvas` 属于设计面板，永远不出现在图像面板里

---

## 三、状态变更

```javascript
// midtaiState 新增，替代旧的 imgView / designView
midtaiState.imgTabView    = 'img-preview';   // 'img-preview' | 'img-works' | 'img-plib'
midtaiState.designTabView = 'design-preview'; // 'design-preview' | 'design-works' | 'design-plib' | 'canvas'

// 删除
// midtaiState.imgView      ← 废弃
// midtaiState.designView   ← 废弃
```

---

## 四、核心函数替换

### 4.1 面板切换（替换 showTabBar）

```javascript
function switchMidtaiType(type) {
  midtaiState.type = type;
  document.getElementById('midtai-panel-img').style.display    = type === 'img'    ? '' : 'none';
  document.getElementById('midtai-panel-design').style.display = type === 'design' ? '' : 'none';
  // 更新顶部 type tab 高亮
  document.querySelectorAll('.midtai-type-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
}
```

### 4.2 图像面板视图切换（替换 showOnlyMidtaiView 的图像部分）

```javascript
function showImgView(view) {
  midtaiState.imgTabView = view;
  ['img-preview','img-works','img-plib'].forEach(v => {
    document.getElementById('view-' + v).style.display = v === view ? '' : 'none';
  });
  document.querySelectorAll('#mtbar-img .mt-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
}
```

### 4.3 设计面板视图切换（替换 showOnlyMidtaiView 的设计部分）

```javascript
function showDesignView(view) {
  midtaiState.designTabView = view;
  ['design-preview','design-works','canvas','design-plib'].forEach(v => {
    document.getElementById('view-' + v).style.display = v === view ? '' : 'none';
  });
  document.querySelectorAll('#mtbar-design .mt-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  // canvas 视图时隐藏 tab bar
  document.getElementById('mtbar-design').style.display = view === 'canvas' ? 'none' : '';
}
```

### 4.4 删除旧函数

- `showOnlyMidtaiView()` — 删除
- `showTabBar()` — 删除（功能已拆入上面两个函数）
- `imgSwitchView()` — 改为调用 `showImgView()`
- `designSwitchView()` — 改为调用 `showDesignView()`

---

## 五、我的作品拆分

### 5.1 图像我的作品

```javascript
function renderMidtaiImageWorks() {
  const container = document.getElementById('view-img-works');
  if (!container) return;
  const batches = imageLabState.resultBatches;
  if (!batches.length) {
    container.innerHTML = '<div class="midtai-works-empty">还没有生成过图像</div>';
    return;
  }
  container.innerHTML = batches.map(batch => batch.images.map(img => `
    <div class="midtai-img-card">
      <img src="${img.url}" class="midtai-img-thumb" loading="lazy" />
      <div class="midtai-img-actions">
        <button onclick="insertImageToConversation('${img.id}')">插入到对话</button>
      </div>
    </div>
  `).join('')).join('');
}
```

注：图像直接用 `loading="lazy"` 浏览器原生懒加载即可，无需额外缓存逻辑。

### 5.2 设计我的作品（含缩略图懒加载）

见第六节。

---

## 六、缩略图懒加载 + 内存缓存

### 6.1 缓存结构

```javascript
// 渲染器顶层，页面生命周期内持久存在
const thumbnailCache = new Map(); // versionId → "data:image/jpeg;base64,..."
```

### 6.2 library-update 时只存缓存，不立即渲染图片

```javascript
case 'midtai:library-update':
  midtaiState.libraryItems = message.items;
  // 把本次 payload 里带来的缩略图存入缓存（不管当前是否在作品页）
  for (const item of message.items) {
    if (item.type === 'design' && item.thumbnail && !thumbnailCache.has(item.versionId)) {
      thumbnailCache.set(item.versionId, item.thumbnail);
    }
  }
  if (midtaiState.designTabView === 'design-works') {
    renderMidtaiDesignWorks();
  }
  break;
```

### 6.3 renderMidtaiDesignWorks

```javascript
function renderMidtaiDesignWorks() {
  const container = document.getElementById('view-design-works');
  if (!container) return;

  const items = (midtaiState.libraryItems || []).filter(i => i.type === 'design');
  if (!items.length) {
    container.innerHTML = '<div class="midtai-works-empty">还没有生成过设计</div>';
    return;
  }

  // 渲染骨架，缩略图先用 shimmer 占位
  container.innerHTML = items.map(item => `
    <div class="design-wcard" data-version-id="${item.versionId}">
      <div class="wcard-thumb">
        ${thumbnailCache.has(item.versionId)
          ? `<img src="${thumbnailCache.get(item.versionId)}">`
          : `<div class="thumb-shimmer"></div>`}
      </div>
      <div class="wcard-meta">
        <div class="wcard-title">${escapeHtml(item.title || '未命名')}</div>
        <div class="wcard-source-badge source-${item.source || 'generate'}">
          ${item.source === 'midtai' ? '来自中台' : '来自设计台'}
        </div>
      </div>
      <div class="wcard-actions">
        <button onclick="openDesignProjectFromHome('${item.projectId}')">打开编辑</button>
      </div>
    </div>
  `).join('');

  // 异步填入未缓存的缩略图（逐张，不阻塞主线程）
  const missing = items.filter(item => !thumbnailCache.has(item.versionId));
  if (missing.length) {
    loadThumbnailsSequentially(missing, container);
  }
}

function loadThumbnailsSequentially(items, container) {
  let i = 0;
  function next() {
    if (i >= items.length) return;
    const item = items[i++];
    send({ type: 'design:getThumbnail', versionId: item.versionId });
    // 下一张在收到响应后触发，见 design:thumbnail handler
  }
  // 先并发发出前 3 张，其余串行
  next(); next(); next();
}
```

### 6.4 IPC 响应处理

```javascript
case 'design:thumbnail':
  thumbnailCache.set(message.versionId, message.dataUrl);
  // 找到对应卡片，替换 shimmer
  const card = document.querySelector(`[data-version-id="${message.versionId}"]`);
  if (card) {
    const thumb = card.querySelector('.wcard-thumb');
    if (thumb && !thumb.querySelector('img')) {
      thumb.innerHTML = `<img src="${message.dataUrl}">`;
    }
  }
  // 继续加载下一张
  loadThumbnailsSequentially(/* remaining */);  // 见实现细节
  break;
```

实现细节：`loadThumbnailsSequentially` 用闭包维护队列，每收到一个 `design:thumbnail` 响应就出队下一张。

### 6.5 ElectronChatPanel.ts 新增 handler

```typescript
case 'design:getThumbnail': {
  const { versionId } = message;
  const version = await this.versionStore.getVersion(versionId);
  if (version?.html) {
    try {
      const dataUrl = await captureDesignThumbnail(version.html);
      this.panel.webview.postMessage({ type: 'design:thumbnail', versionId, dataUrl });
    } catch {
      // 静默失败，卡片保持 shimmer
    }
  }
  break;
}
```

> 注：如果版本记录里已经有预存的 thumbnail 字段（pmh 阶段添加的），优先用存储值，不重新渲染 HTML。

---

## 七、openCanvas 适配

`openCanvas()` 现在改为调用 `showDesignView('canvas')` 而不是 `showOnlyMidtaiView('canvas')`：

```javascript
function openCanvas() {
  // ... 创建 iframe ...
  midtaiState.canvasOpen = true;
  if (document.getElementById('page-midtai')?.classList.contains('active')) {
    showDesignView('canvas');
  }
}
```

---

## 八、openDesignProjectFromHome 适配

```javascript
function openDesignProjectFromHome(projectId) {
  if (!projectId) return;
  if (document.getElementById('page-midtai')?.classList.contains('active')) {
    // 不改 type — 面板拆分后设计卡片只出现在设计面板
    // 用户能点到「打开编辑」说明已在设计面板，无需切换
    midtaiState.canvasOpen = false;
    showDesignView('canvas');
    const mcEmpty = document.getElementById('midtai-canvas-empty');
    const mcFrame = document.getElementById('midtai-canvas-iframe');
    if (mcEmpty) { mcEmpty.style.display = 'flex'; mcEmpty.textContent = '正在加载...'; }
    if (mcFrame) mcFrame.style.display = 'none';
  }
  send({ type: 'design:openProject', projectId });
}
```

> **注意**：这里 `switchMidtaiType('design')` 是合理的——用户从「我的作品」点「打开编辑」，意图就是进入设计面板看画布。与之前的 bug（在图像 tab 生成触发了 type 切换）是不同的场景。

---

## 九、数据源解耦

### 9.1 状态变更

```javascript
// 删除
midtaiState.libraryItems   // ← 废弃，不再使用

// 新增
midtaiState.designLibraryItems = [];  // 只存设计项目
// 图像批次直接读 imageLabState.resultBatches，不再放 midtaiState 里
```

### 9.2 IPC 消息重命名

| 旧消息 | 新消息 | 说明 |
|--------|--------|------|
| `midtai:request-library` | `midtai:request-design-library` | 只请求设计项目 |
| `midtai:library-update` | `midtai:design-library-update` | 只返回设计项目 |

图像批次不需要新 IPC——图像面板的「我的作品」直接读 `imageLabState.resultBatches`，
该数据在 `image:loadState` 响应时已经更新。

### 9.3 前端触发时机

```javascript
// 图像面板切到「我的作品」
function showImgView(view) {
  ...
  if (view === 'img-works') {
    send({ type: 'image:loadState' });   // 刷新图像批次
    renderMidtaiImageWorks();
  }
}

// 设计面板切到「我的作品」
function showDesignView(view) {
  ...
  if (view === 'design-works') {
    send({ type: 'midtai:request-design-library' });  // 刷新设计项目
    renderMidtaiDesignWorks();   // 先用缓存数据渲染，IPC 回来后再刷新
  }
}
```

### 9.4 IPC 响应处理

```javascript
case 'midtai:design-library-update':
  midtaiState.designLibraryItems = message.items;
  // 存缩略图缓存
  for (const item of message.items) {
    if (item.thumbnail && !thumbnailCache.has(item.versionId)) {
      thumbnailCache.set(item.versionId, item.thumbnail);
    }
  }
  if (midtaiState.designTabView === 'design-works') {
    renderMidtaiDesignWorks();
  }
  break;
```

### 9.5 ElectronChatPanel.ts

```typescript
// 旧 handler
case 'midtai:request-library': ...

// 改为
case 'midtai:request-design-library': {
  await this.postMidtaiDesignLibrary();
  break;
}
```

`postMidtaiDesignLibrary()` 只返回设计项目（原 `postMidtaiLibrary` 的设计部分），
图像批次不再打包进这个响应。

---

## 十、CSS 补充

```css
.midtai-panel { display: flex; flex-direction: column; height: 100%; }
.midtai-view  { flex: 1; overflow-y: auto; }

.thumb-shimmer {
  width: 100%; height: 100%;
  background: linear-gradient(90deg, #f0ebe3 25%, #e8e2da 50%, #f0ebe3 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
}
```

---

## 十、验收标准

1. 在图像模式下点「打开编辑」→ 自动切到设计面板，图像面板状态保留，再切回来图像内容不丢失
2. 在设计模式下生成图像 → 图像结果只出现在图像面板，不影响设计面板
3. 首次进「我的作品（设计）」→ 卡片骨架立即出现，缩略图逐张填入，无卡顿
4. 离开「我的作品」再回来 → 缩略图秒显示（来自缓存）
5. 图像「我的作品」只显示图像批次，设计「我的作品」只显示设计项目
6. 切到图像「我的作品」→ 只发 `image:loadState`，不触发设计库请求
7. 切到设计「我的作品」→ 只发 `midtai:request-design-library`，不触发图像状态请求
8. Image Lab 原有功能不受影响

---

## 十一、文件改动范围

| 文件 | 改动 |
|------|------|
| `electron/renderer/index.html` | DOM 重构、新函数、删旧函数、缩略图缓存逻辑、数据源解耦 |
| `electron/ElectronChatPanel.ts` | 新增 `design:getThumbnail` handler、`midtai:request-library` 改为 `midtai:request-design-library` |
| 其他文件 | 无 |
