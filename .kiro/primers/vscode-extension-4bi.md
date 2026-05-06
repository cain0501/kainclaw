# Primer: vscode-extension-4bi
# Midtai 面板拆分 + 缩略图懒加载 + 数据源解耦

## Spec
`.kiro/specs/midtai-panel-split.md` — 必读，所有实现细节在那里

## 核心目标
把中台图像和设计从共用一套视图逻辑，改成两个完全独立的面板。
同时：设计我的作品缩略图懒加载 + 内存缓存；数据源 IPC 拆分。

---

## 并行执行方案（节省时间）

**index.html 和 ElectronChatPanel.ts 是不同文件，可以同时开两个 Codex session 并行做。**

```
Codex Session A（index.html）     Codex Session B（ElectronChatPanel.ts）
  Phase 1: DOM + 函数重构            全部 ElectronChatPanel 改动
  Phase 2: Works 渲染 + 缓存         （等 Session A 完成后合并）
  Phase 3: 数据源 state 变更
```

---

## Session A — index.html（3个 Phase 顺序执行）

### Phase 1：DOM 重构 + 视图切换函数

**目标**：建立两个独立面板的骨架，新函数替换旧函数。

1. 在 `#midtai-content`（中台右侧内容区）里，用以下结构替换现有的视图容器：

```html
<div id="midtai-panel-img" class="midtai-panel">
  <div id="mtbar-img" class="midtai-tabbar">
    <button class="mt-tab active" data-view="img-preview" onclick="showImgView('img-preview')">生成预览</button>
    <button class="mt-tab" data-view="img-works" onclick="showImgView('img-works')">我的作品</button>
    <button class="mt-tab" data-view="img-plib" onclick="showImgView('img-plib')">提示词库</button>
  </div>
  <div id="view-img-preview" class="midtai-view"></div>
  <div id="view-img-works"   class="midtai-view" style="display:none"></div>
  <div id="view-img-plib"    class="midtai-view" style="display:none"></div>
</div>

<div id="midtai-panel-design" class="midtai-panel" style="display:none">
  <div id="mtbar-design" class="midtai-tabbar">
    <button class="mt-tab active" data-view="design-preview" onclick="showDesignView('design-preview')">生成预览</button>
    <button class="mt-tab" data-view="design-works" onclick="showDesignView('design-works')">我的作品</button>
    <button class="mt-tab" data-view="design-plib" onclick="showDesignView('design-plib')">提示词库</button>
  </div>
  <div id="view-design-preview" class="midtai-view"></div>
  <div id="view-design-works"   class="midtai-view" style="display:none"></div>
  <div id="view-canvas"         class="midtai-view" style="display:none"></div>
  <div id="view-design-plib"    class="midtai-view" style="display:none"></div>
</div>
```

2. 新增函数 `switchMidtaiType(type)`：
```javascript
function switchMidtaiType(type) {
  midtaiState.type = type;
  document.getElementById('midtai-panel-img').style.display    = type === 'img'    ? '' : 'none';
  document.getElementById('midtai-panel-design').style.display = type === 'design' ? '' : 'none';
  document.querySelectorAll('.midtai-type-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
}
```

3. 新增函数 `showImgView(view)`：
```javascript
function showImgView(view) {
  midtaiState.imgTabView = view;
  ['img-preview','img-works','img-plib'].forEach(v => {
    document.getElementById('view-' + v).style.display = v === view ? '' : 'none';
  });
  document.querySelectorAll('#mtbar-img .mt-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  if (view === 'img-works') {
    send({ type: 'image:loadState' });
    renderMidtaiImageWorks();
  }
}
```

4. 新增函数 `showDesignView(view)`：
```javascript
function showDesignView(view) {
  midtaiState.designTabView = view;
  ['design-preview','design-works','canvas','design-plib'].forEach(v => {
    document.getElementById('view-' + v).style.display = v === view ? '' : 'none';
  });
  document.querySelectorAll('#mtbar-design .mt-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });
  document.getElementById('mtbar-design').style.display = view === 'canvas' ? 'none' : '';
  if (view === 'design-works') {
    send({ type: 'midtai:request-design-library' });
    renderMidtaiDesignWorks();
  }
}
```

5. 顶部 type tab 按钮的 onclick 改为 `switchMidtaiType('img')` / `switchMidtaiType('design')`

6. **删除旧函数**（全局搜索确认无其他引用后删除）：
   - `showOnlyMidtaiView()`
   - `showTabBar()`

7. 把所有调用 `showOnlyMidtaiView(...)` 和 `showTabBar(...)` 的地方替换：
   - `showOnlyMidtaiView('img-preview')` → `showImgView('img-preview')`
   - `showOnlyMidtaiView('design-preview')` → `showDesignView('design-preview')`
   - `showOnlyMidtaiView('canvas')` → `showDesignView('canvas')`
   - `showOnlyMidtaiView('works')` + 图像上下文 → `showImgView('img-works')`
   - `showOnlyMidtaiView('works')` + 设计上下文 → `showDesignView('design-works')`
   - `showTabBar('img')` → 删除（showImgView 内已处理）
   - `showTabBar('design')` → 删除（showDesignView 内已处理）

8. 更新 `openCanvas()`，把 `showOnlyMidtaiView('canvas')` 改为 `showDesignView('canvas')`

9. 更新 `openDesignProjectFromHome()`：
```javascript
function openDesignProjectFromHome(projectId) {
  if (!projectId) return;
  if (document.getElementById('page-midtai')?.classList.contains('active')) {
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

10. `imgSwitchView(view)` 改为内部调用 `showImgView('img-' + view)`（或直接替换所有调用点）
11. `designSwitchView(view)` 改为内部调用 `showDesignView('design-' + view)`（canvas 特殊处理）

12. `midtaiState` 初始化新增：
```javascript
midtaiState.imgTabView    = 'img-preview';
midtaiState.designTabView = 'design-preview';
```

13. 新增 CSS：
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

**Phase 1 验收**：切 type tab 正常，图像/设计面板独立显示，功能 tab 切换各自的视图，画布能打开，控制台无报错。

---

### Phase 2：Works 渲染 + 缩略图缓存

**目标**：拆分我的作品渲染，实现缩略图懒加载。

1. 在渲染器顶层（`midtaiState` 初始化附近）新增缓存：
```javascript
const thumbnailCache = new Map(); // versionId → dataUrl
```

2. 新增 `renderMidtaiImageWorks()`：
```javascript
function renderMidtaiImageWorks() {
  const container = document.getElementById('view-img-works');
  if (!container) return;
  const batches = imageLabState.resultBatches || [];
  if (!batches.length) {
    container.innerHTML = '<div class="midtai-works-empty">还没有生成过图像</div>';
    return;
  }
  container.innerHTML = batches.map(batch =>
    (batch.images || []).map(img => `
      <div class="midtai-img-card">
        <img src="${img.url}" class="midtai-img-thumb" loading="lazy" />
        <div class="midtai-img-actions">
          <button onclick="insertImageToConversation('${img.id}')">插入到对话</button>
        </div>
      </div>
    `).join('')
  ).join('');
}
```

3. 新增 `renderMidtaiDesignWorks()`（带缩略图懒加载）：
```javascript
function renderMidtaiDesignWorks() {
  const container = document.getElementById('view-design-works');
  if (!container) return;
  const items = (midtaiState.designLibraryItems || []);
  if (!items.length) {
    container.innerHTML = '<div class="midtai-works-empty">还没有生成过设计</div>';
    return;
  }
  container.innerHTML = items.map(item => `
    <div class="design-wcard" data-version-id="${escapeHtml(item.versionId)}">
      <div class="wcard-thumb">
        ${thumbnailCache.has(item.versionId)
          ? `<img src="${thumbnailCache.get(item.versionId)}">`
          : `<div class="thumb-shimmer"></div>`}
      </div>
      <div class="wcard-meta">
        <div class="wcard-title">${escapeHtml(item.title || '未命名')}</div>
        <div class="wcard-source-badge source-${escapeHtml(item.source || 'generate')}">
          ${item.source === 'midtai' ? '来自中台' : '来自设计台'}
        </div>
      </div>
      <div class="wcard-actions">
        <button onclick="openDesignProjectFromHome('${escapeHtml(item.projectId)}')">打开编辑</button>
      </div>
    </div>
  `).join('');

  // 异步加载未缓存的缩略图
  const missing = items.filter(item => !thumbnailCache.has(item.versionId));
  if (missing.length) {
    let queue = [...missing];
    let inFlight = 0;
    const MAX_CONCURRENT = 3;
    function next() {
      while (inFlight < MAX_CONCURRENT && queue.length) {
        const item = queue.shift();
        inFlight++;
        send({ type: 'design:getThumbnail', versionId: item.versionId });
      }
    }
    // 存队列到 midtaiState 以便 design:thumbnail 响应时继续
    midtaiState._thumbQueue = queue;
    midtaiState._thumbInFlight = inFlight;
    midtaiState._thumbNext = next;
    next();
  }
}
```

4. `design:thumbnail` IPC 响应处理（在 message handler 的 switch 里新增）：
```javascript
case 'design:thumbnail': {
  thumbnailCache.set(message.versionId, message.dataUrl);
  const card = document.querySelector(`[data-version-id="${message.versionId}"]`);
  if (card) {
    const thumb = card.querySelector('.wcard-thumb');
    if (thumb && !thumb.querySelector('img')) {
      thumb.innerHTML = `<img src="${message.dataUrl}">`;
    }
  }
  // 继续加载队列里的下一张
  if (midtaiState._thumbNext) {
    midtaiState._thumbInFlight = Math.max(0, (midtaiState._thumbInFlight || 1) - 1);
    midtaiState._thumbNext();
  }
  break;
}
```

5. 旧的 `renderMidtaiWorks()` 函数：确认新函数覆盖所有调用点后删除。

**Phase 2 验收**：图像我的作品只显示图像，设计我的作品只显示设计卡片，缩略图逐张填入，无卡顿。

---

### Phase 3：数据源 state 变更

**目标**：`midtaiState.libraryItems` 拆成独立字段，IPC 消息重命名。

1. `midtaiState` 初始化：
   - 删除 `libraryItems: []`
   - 新增 `designLibraryItems: []`

2. `midtai:design-library-update` 响应处理（替换旧的 `midtai:library-update`）：
```javascript
case 'midtai:design-library-update':
  midtaiState.designLibraryItems = message.items || [];
  for (const item of midtaiState.designLibraryItems) {
    if (item.thumbnail && !thumbnailCache.has(item.versionId)) {
      thumbnailCache.set(item.versionId, item.thumbnail);
    }
  }
  if (midtaiState.designTabView === 'design-works') {
    renderMidtaiDesignWorks();
  }
  break;
```

3. 删除旧的 `midtai:library-update` handler。

4. 全局搜索 `midtaiState.libraryItems`，确认所有引用已替换为 `midtaiState.designLibraryItems`（图像相关的改为读 `imageLabState.resultBatches`）。

**Phase 3 验收**：切到设计我的作品只发 `midtai:request-design-library`，切到图像我的作品只发 `image:loadState`，控制台无旧消息名。

---

## Session B — ElectronChatPanel.ts（与 Session A 并行）

**目标**：新增 `design:getThumbnail` handler，重命名 library IPC。

### 改动 1：重命名 library handler

```typescript
// 旧
case 'midtai:request-library':
  await this.postMidtaiLibrary();
  break;

// 改为
case 'midtai:request-design-library':
  await this.postMidtaiDesignLibrary();
  break;
```

`postMidtaiDesignLibrary()` 实现：把原 `postMidtaiLibrary()` 里的设计项目部分单独提出，
发送消息类型改为 `midtai:design-library-update`（替换 `midtai:library-update`）。
图像批次不再打包进这个响应。

### 改动 2：新增 getThumbnail handler

```typescript
case 'design:getThumbnail': {
  const { versionId } = message as { versionId: string };
  if (!versionId) break;
  try {
    const version = await this.versionStore.getVersion(versionId);
    if (version?.html) {
      const dataUrl = await captureDesignThumbnail(version.html);
      this.panel.webview.postMessage({ type: 'design:thumbnail', versionId, dataUrl });
    }
  } catch {
    // 静默失败，卡片保持 shimmer
  }
  break;
}
```

**验收**：发 `design:getThumbnail` 能收到 `design:thumbnail` 响应；发 `midtai:request-design-library` 能收到 `midtai:design-library-update` 响应，且响应里只有设计项目。

---

## 合并顺序

1. Session A Phase 1 完成 → 先跑 `npm run build:electron` 验证编译
2. Session B 完成 → 跑 `npm run build:electron` 验证编译
3. Session A Phase 2 完成（依赖 Phase 1）
4. Session A Phase 3 完成（依赖 Phase 2）
5. 最终合并后跑完整 build + 手测验收标准

## 注意事项

- `goReplaceInWorks()` 和 `goReplaceInImageLab()` 里有 `midtaiState.type = 'img'`，这是**故意的**（Replace 流跨面板跳转），不要改
- 删旧函数前必须全局搜索确认无遗漏引用
- `imgSwitchView` / `designSwitchView` 可以保留作为薄封装，内部调用新函数，也可以全部替换调用点——取决于引用数量
- ElectronChatPanel 里如果原 `postMidtaiLibrary` 还有其他调用者，需要保留旧函数，只新增 `postMidtaiDesignLibrary`
