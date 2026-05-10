# Primer: vscode-extension-kfr
# midtai-p2a：作品库统一页完善

## 阶段标记

Phase 2 / renderer-first / 依赖 p1d（vscode-extension-0uv）已完成

---

## 背景

p1d 建立了作品库的基础壳层：顶部「作品库」tab、两个子视图切换、数据复用现有推送。
p2a 在此基础上补全完整交互：卡片设计、操作按钮、空状态、跨 tab 跳转，让作品库达到可日常使用的状态。

UI 风格参考：`.kiro/midtai-unified-workbench-mock.html`（保留该版设计语言）。

---

## 产品规则（必须遵守）

- **未生成的作品（临时工作态）不进入作品库**
- 作品库只展示有至少一个正式版本的 `designProject`
- 图片素材库展示 `imageGalleryStore` 里的历史记录

---

## 目标行为

### 设计作品库子视图

```
每张设计作品卡片：
  ┌──────────────────────────────┐
  │  [缩略图占位 / 版本预览]      │
  │  作品名称                    │
  │  v3 · 今天更新               │
  │  [打开编辑]                  │  ← 跳到设计 tab 并切换当前作品
  └──────────────────────────────┘

空状态（无作品时）：
  "你还没有设计作品。去设计 tab 开始创作吧。"
  [前往设计 tab]
```

### 图片素材库子视图

```
图片卡片（密集网格）：
  ┌────────────────┐
  │  [缩略图]       │
  │  prompt 摘要   │
  │  今天          │
  │  [下载] [插入] │  ← 插入 = insertToDesign(imageUrl)
  └────────────────┘

空状态（无图片时）：
  "还没有生成过图片。去图像 tab 试试吧。"
  [前往图像 tab]
```

### 从左侧「查看全部作品」跳转

设计 tab 左侧最近作品列表底部的"查看全部"链接 →
切换到作品库 tab，自动激活「设计作品库」子视图。

---

## 现有代码关键位置

### p1d 建立的结构（electron/renderer/index.html）

- `#midtai-board-library`：作品库主容器
- `#library-panel-design`：设计作品库面板
- `#library-panel-image`：图片素材库面板
- `setLibrarySubtab(subtab)`：切换子视图的函数
- `renderDesignLibrary()` / `renderImageLibrary()`：数据渲染函数（p1d 已建，p2a 补全）

### 数据来源（electron/ElectronChatPanel.ts）

设计作品库数据推送（已有或需补）：
```typescript
// 搜索 postMidtaiDesignLibrary / design:library 相关 IPC
// payload 需要包含：projectId, name, updatedAt, versionCount, activeVersionId
```

图片素材库数据推送（已有）：
```typescript
// 搜索 postMidtaiLibrary / image:gallery 相关 IPC
// payload: imageUrl, prompt, createdAt, batchId
```

### 跨 tab 跳转（已有）

```javascript
// 切换到设计 tab 并选中作品：
setMidtaiTab('design');
setCurrentDesignProject(projectId); // p1b 已建立
```

```javascript
// 切换到图像 tab：
setMidtaiTab('image');
```

---

## 实现要点

### 1. 设计作品卡片样式

参考 mock 的卡片设计语言：
- 暖白背景 `#fffdfb`
- 边框 `1px solid #eadfd2`，圆角 `12px`
- 版本标签：`v3` 小 badge（暖橙色 `#c94c2e` 背景，白字）
- 卡片悬浮：轻投影 `box-shadow: 0 2px 12px rgba(0,0,0,.06)`

缩略图区：
- Phase 2 先用占位色块（避免缩略图加载慢的问题，用户已确认先不阻塞）
- 占位色：根据作品名字生成一个固定的暖色调（简单 hash → 颜色）

### 2. 图片素材卡片样式

- 密集网格（3列或4列，具体看容器宽度）
- 缩略图直接用 `<img>` 加 `loading="lazy"`
- prompt 摘要截断（最多 40 字）
- 「插入当前设计」只在有当前设计作品时可用（`midtaiState.currentDesignProjectId` 不为空），否则 disabled

### 3. 空状态

设计作品库空状态：
```html
<div class="library-empty">
  <div class="empty-icon">✦</div>
  <div class="empty-title">还没有设计作品</div>
  <div class="empty-sub">在设计 tab 里创作，生成后自动出现在这里</div>
  <button onclick="setMidtaiTab('design')">前往设计</button>
</div>
```

### 4. 「打开编辑」行为

点击设计作品卡片「打开编辑」：
1. `setMidtaiTab('design')` 切换到设计 tab
2. `setCurrentDesignProject(projectId)` 选中该作品
3. 右侧自动显示该作品的 chat/画布/版本

### 5. 作品库 tab 激活时触发数据刷新

```javascript
// 进入作品库 tab 时：
function onLibraryTabActivated() {
  send({ type: 'design:load-library' });   // 刷新设计作品库
  send({ type: 'image:load-library' });    // 刷新图片素材库
}
```

---

## 与 Phase 1 的衔接

| Phase 1 已有 | Phase 2 补全 |
|------------|------------|
| 基础页结构（两个子视图切换） | 卡片完整设计和样式 |
| 数据推送接口（占位） | 完整渲染函数 |
| 顶部 tab 导航 | 跨 tab 跳转行为 |
| "查看全部"占位链接 | 真实跳转逻辑 |

---

## 验收标准

1. 设计作品库显示所有正式入库作品（有版本的），不显示临时工作态
2. 图片素材库显示历史图片网格
3. 两个子视图都有空状态
4. 「打开编辑」可以跳回设计 tab 并切换当前作品
5. 「插入当前设计」在有当前作品时可用，无当前作品时 disabled
6. 设计 tab 左侧"查看全部"链接跳到作品库并自动激活设计作品库子视图
7. 卡片样式与 `.kiro/midtai-unified-workbench-mock.html` 设计语言一致

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `electron/renderer/index.html` | 中 | 卡片渲染 + 跨 tab 跳转 |
| `electron/ElectronChatPanel.ts` | 低 | 如需补 library payload 字段 |
| `src/midtaiLibraryHost.ts` | 低 | 复用现有推送，按需扩展 |

---

## 明确不做

- 不做作品删除 / 重命名 UI
- 不做搜索 / 筛选 / 排序（Phase 3）
- 不做缩略图真实渲染（缩略图慢问题单独修，不阻塞此任务）
- 不改图像或设计底层数据模型
- 不做 session → project 底层迁移
