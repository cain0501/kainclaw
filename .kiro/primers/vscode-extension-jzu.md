# Primer: vscode-extension-jzu
# midtai-p4：Unified Workbench UI 整体改造

## 阶段标记

Phase 4 / 纯 renderer 改造 / 依赖 p3a（p1y）已完成
涉及：`electron/renderer/index.html` 视觉与布局重建

参考原型：`.kiro/midtai-unified-workbench-mock.html`（在浏览器里打开对照）

---

## 背景

Phase 1-3 完成后，Midtai 的功能层已经稳定：
- 图像 tab、设计 tab、作品库 tab 各自的数据和交互协议固化
- 设计 tab 的作品切换通过 `design:switch-project` IPC（p3a）

当前 renderer 的外观是功能驱动的堆砌，没有统一的壳层设计语言。
p4 按原型重建整个 Midtai 外壳的视觉和布局，不改后端和 IPC 协议。

---

## 目标行为

```
整体布局：
  左侧 Shell sidebar（固定 286px）
    └── Logo 区
    └── 快速操作区
    └── 当前上下文区
    └── 快捷跳转区
  右侧 Workspace
    └── Topbar（78px，吸顶）
          └── 三 tab 切换（图像 / 设计 / 作品库）
          └── 标题文案（随 tab 变化）
          └── 当前目标 chip
          └── 右上操作按钮
    └── 内容区（三个 board，active 时显示）
          └── board-image（双栏）
          └── board-design（双栏）
          └── board-library（全宽）
```

---

## 设计语言（从原型提取）

```css
:root {
  --bg: #f3ede5;
  --surface: #fffdf9;
  --surface-2: #fff7ef;
  --line: #e6d9c9;
  --line-strong: #d8c3af;
  --text: #24160d;
  --muted: #8c7767;
  --accent: #d45a35;
  --accent-2: #b64728;
  --ink-soft: #5d4638;
  --shadow: 0 16px 40px rgba(62, 36, 17, 0.08);
  --radius-xl: 26px;
  --radius-lg: 18px;
  --radius-md: 12px;
  --sidebar-w: 286px;
  --left-w: 338px;
  --topbar-h: 78px;
  --font-body: "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif;
  --font-display: "Georgia", "Times New Roman", "Noto Serif SC", serif;
}
```

Body 背景：
```css
background:
  radial-gradient(circle at top left, rgba(255,255,255,.72), transparent 26%),
  linear-gradient(180deg, #f5f0e8 0%, #f0e7dc 100%);
```

---

## 实现要点

### 1. 整体网格结构

当前 Midtai 容器（`#midtai-container` 或类似根节点）改为：

```html
<div class="midtai-app">
  <aside class="midtai-shell">...</aside>
  <main class="midtai-workspace">
    <div class="midtai-topbar">...</div>
    <div class="midtai-content">
      <section class="midtai-board board-image active" data-board="image">...</section>
      <section class="midtai-board board-design" data-board="design">...</section>
      <section class="midtai-board board-library" data-board="library">...</section>
    </div>
  </main>
</div>
```

CSS 骨架：
```css
.midtai-app {
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr;
  min-height: 100%;
}
.midtai-workspace {
  display: grid;
  grid-template-rows: var(--topbar-h) 1fr;
}
.midtai-content { padding: 22px; }
.midtai-board { display: none; }
.midtai-board.active { display: grid; }
.board-image, .board-design { grid-template-columns: var(--left-w) 1fr; gap: 16px; }
.board-library { grid-template-columns: 1fr; }
```

### 2. Shell Sidebar

```html
<aside class="midtai-shell">
  <!-- Logo 区 -->
  <div class="shell-logo">
    <div class="shell-logo-k">K</div>
    <div>
      <div class="shell-logo-title">Midtai</div>
      <div class="shell-logo-sub">图像是素材流，设计是作品流</div>
    </div>
  </div>

  <!-- 快速操作 -->
  <div class="shell-section">
    <div class="shell-section-label">快速操作</div>
    <button class="btn btn-primary" onclick="handleNewDesignWork()">+ 新建作品</button>
    <button class="btn btn-secondary" onclick="showMidtaiTab('library')">打开作品库</button>
  </div>

  <!-- 当前上下文：动态渲染，绑定 midtaiState -->
  <div class="shell-section" id="shell-context">
    <div class="shell-section-label">当前上下文</div>
    <div id="shell-context-body"><!-- renderShellContext() 填充 --></div>
  </div>

  <!-- 快捷跳转 -->
  <div class="shell-section" id="shell-shortcuts">
    <div class="shell-section-label">快捷跳转</div>
    <button class="btn btn-secondary" onclick="openCurrentDesignCanvas()">当前作品画布</button>
    <button class="btn btn-secondary" onclick="showDesignChatTab('versions')">当前作品版本</button>
    <button class="btn btn-secondary" onclick="showDesignChatTab('chat')">回到设计对话</button>
  </div>
</aside>
```

新增 `renderShellContext()` 函数：
```javascript
function renderShellContext() {
  const el = document.getElementById('shell-context-body');
  if (!el) return;
  const projectName = midtaiState.currentProjectName || '（无作品）';
  el.innerHTML = `
    <div class="shell-option">当前作品：${escHtml(projectName)}</div>
    <div class="shell-option">当前 tab：${escHtml(midtaiState.activeTab || '图像')}</div>
  `;
}
```

`renderShellContext()` 在以下时机调用：
- `design:flow-context` 消息收到时
- tab 切换时

### 3. Topbar 三 tab 切换

原来的 `#midtai-tab-container` 替换为：

```html
<div class="midtai-topbar">
  <div class="midtai-tabs">
    <button class="midtai-tab active" data-board="image" onclick="showMidtaiTab('image')">图像</button>
    <button class="midtai-tab" data-board="design" onclick="showMidtaiTab('design')">设计</button>
    <button class="midtai-tab" data-board="library" onclick="showMidtaiTab('library')">作品库</button>
  </div>
  <div class="topbar-copy">
    <div class="topbar-eyebrow">Midtai</div>
    <div class="topbar-headline" id="midtai-topbar-headline">图像</div>
  </div>
  <div class="topbar-goal-chip" id="midtai-goal-chip">
    <span class="goal-dot"></span>
    <span id="midtai-goal-text">—</span>
  </div>
  <div class="topbar-actions">
    <button class="btn btn-primary" onclick="handleNewDesignWork()">+ 新建作品</button>
  </div>
</div>
```

tab 切换函数：
```javascript
const BOARD_META = {
  image:   { headline: '图像生成与素材管理', goal: () => '主对象：图片素材' },
  design:  { headline: '设计作品工作台',     goal: () => midtaiState.currentProjectName ? `当前作品：${midtaiState.currentProjectName}` : '未选择作品' },
  library: { headline: '作品库 / 素材库',    goal: () => '全量浏览与搜索' },
};

function showMidtaiTab(boardName) {
  midtaiState.activeTab = boardName;
  document.querySelectorAll('.midtai-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.board === boardName));
  document.querySelectorAll('.midtai-board').forEach(b =>
    b.classList.toggle('active', b.dataset.board === boardName));
  const meta = BOARD_META[boardName] || {};
  const headlineEl = document.getElementById('midtai-topbar-headline');
  const goalEl = document.getElementById('midtai-goal-text');
  if (headlineEl) headlineEl.textContent = meta.headline || boardName;
  if (goalEl) goalEl.textContent = typeof meta.goal === 'function' ? meta.goal() : '';
  renderShellContext();
}
```

### 4. Design Tab 双栏布局

左栏：最近作品列表（p1b 已有，复用 `renderRecentWorksList()`，改为用新样式）

```html
<section class="midtai-board board-design" data-board="design">
  <!-- 左栏：最近作品 -->
  <div class="midtai-pane">
    <div class="pane-scroll">
      <div class="section-head">
        <div class="section-title">最近设计作品</div>
        <button class="btn btn-primary" onclick="handleNewDesignWork()">+ 新建</button>
      </div>
      <div id="midtai-recent-works-list"><!-- renderRecentWorksList() 填充 --></div>
    </div>
  </div>

  <!-- 右栏：设计工作区 -->
  <div class="midtai-pane">
    <div class="pane-scroll chat-shell">
      <!-- chat sub-tabs -->
      <div class="chat-sub-tabs">
        <button class="chat-sub-tab active" onclick="showDesignChatTab('chat')">设计对话</button>
        <button class="chat-sub-tab" onclick="showDesignChatTab('canvas')">画布预览</button>
        <button class="chat-sub-tab" onclick="showDesignChatTab('versions')">版本记录</button>
      </div>
      <!-- 设计对话内容区 -->
      <div id="midtai-design-chat-pane" class="chat-sub-pane active">
        <!-- 已有的 design chat 内容，原样迁移 -->
        <div id="midtai-design-chat-messages">...</div>
        <div id="midtai-design-chat-input">...</div>
      </div>
      <!-- 画布预览 -->
      <div id="midtai-canvas-pane" class="chat-sub-pane">
        <!-- 已有的 canvas iframe，原样迁移 -->
      </div>
      <!-- 版本记录 -->
      <div id="midtai-versions-pane" class="chat-sub-pane">
        <!-- 已有的版本历史列表，原样迁移 -->
      </div>
    </div>
  </div>
</section>
```

```javascript
function showDesignChatTab(tabName) {
  document.querySelectorAll('.chat-sub-tab').forEach((t, i) => {
    const names = ['chat', 'canvas', 'versions'];
    t.classList.toggle('active', names[i] === tabName);
  });
  document.querySelectorAll('.chat-sub-pane').forEach(p => {
    p.classList.toggle('active', p.id === `midtai-${tabName === 'chat' ? 'design-chat' : tabName}-pane`);
  });
}
```

**最近作品列表点击**（p3a 之后用 IPC）：
```javascript
function onRecentWorkClick(projectId) {
  send({ type: 'design:switch-project', projectId });
  // 不在 renderer 本地立刻更新，等 host 推回 design:chat:history 和 design:flow-context
}
```

### 5. Image Tab 双栏布局

左栏：图像工具表单（已有的图像生成表单，原样迁移）
右栏：生成历史网格（已有的图片历史，原样迁移）

```html
<section class="midtai-board board-image active" data-board="image">
  <div class="midtai-pane">
    <div class="pane-scroll">
      <!-- 已有的图像工具区内容，迁移过来，不改功能 -->
      <div id="midtai-image-tool-area">...</div>
    </div>
  </div>
  <div class="midtai-pane">
    <div class="pane-scroll">
      <!-- 已有的图片历史区内容，迁移过来，不改功能 -->
      <div id="midtai-image-history-area">...</div>
    </div>
  </div>
</section>
```

### 6. Library Tab 全宽布局

```html
<section class="midtai-board board-library" data-board="library">
  <div class="midtai-pane">
    <div class="pane-scroll">
      <div class="library-sub-tabs">
        <button class="library-sub-tab active" onclick="showLibraryTab('design')">设计作品库</button>
        <button class="library-sub-tab" onclick="showLibraryTab('image')">图片素材库</button>
      </div>
      <div id="midtai-library-design" class="library-sub-pane active">
        <!-- 已有的设计作品库，原样迁移 -->
      </div>
      <div id="midtai-library-image" class="library-sub-pane">
        <!-- 已有的图片素材库，原样迁移 -->
      </div>
    </div>
  </div>
</section>
```

### 7. Pane 卡片样式

```css
.midtai-pane {
  background: linear-gradient(180deg, rgba(255,253,249,.95) 0%, rgba(255,247,239,.92) 100%);
  border: 1px solid rgba(216, 195, 175, .7);
  border-radius: 24px;
  box-shadow: var(--shadow);
  overflow: hidden;
}
.pane-scroll {
  height: 100%;
  overflow: auto;
  padding: 20px;
}
```

---

## 迁移策略

这是重布局，不是重写功能。原则：

1. **保留所有现有 ID** — `#midtai-design-chat-messages`、`#midtai-image-form` 等 DOM 节点保持 ID 不变，只是搬到新的容器结构里。
2. **不改事件处理器** — 所有 `send()`、`onclick` 调用保持不变，只迁移节点位置。
3. **渐进替换** — 先替换壳层骨架（app grid、shell、topbar），再逐个迁移 board 内容。
4. **每步验证** — 每迁完一个 board，用 `npm run build:electron` + renderer JS syntax check 验证。

---

## 验收标准

1. 整体布局：左侧 shell sidebar + 右侧 workspace，三 tab 切换正常
2. Shell 侧栏显示当前作品名称，tab 切换时更新
3. 图像 tab：双栏布局，左侧工具表单功能正常（生成、参数、参考图）
4. 设计 tab：左侧最近作品列表，点击发 `design:switch-project` IPC（p3a 已完成），右侧 chat 正常
5. 设计对话 / 画布预览 / 版本记录三子 tab 切换正常
6. 作品库 tab：设计作品库 / 图片素材库两子 tab 切换正常
7. 分流弹框（p2b）在新布局下仍然正常弹出
8. 临时工作态（p1c/p2c）进入和退出逻辑在新布局下正常

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `electron/renderer/index.html` | 高 | 单文件 renderer，全量重布局；每次改完必须跑 renderer JS syntax check |

---

## 明确不做

- 不改任何 IPC handler（`handleRendererMessage`、`sendToRenderer`）
- 不改 design chat 的消息渲染逻辑（`renderMidtaiDesignChat()`）
- 不改图像生成逻辑（`handleImageGenerate()`）
- 不改版本历史、canvas iframe 逻辑
- 不实现 mock 里标注为"示意"的内容（如 当前目标：作品 A / Hero 封面图 这类硬编码文案，实际值来自 `midtaiState`）
