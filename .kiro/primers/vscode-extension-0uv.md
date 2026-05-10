# Primer: vscode-extension-0uv
# midtai-p1d：顶部作品库入口与壳层页

## 阶段标记

Phase 1 / renderer-first / 只做入口和基本页结构 / 不做深度筛选

## 前置条件

建议在 p1a / p1b 完成后实施，可以并行开发但 UI 整合时需要协调。

---

## 背景

当前 Midtai 图像"我的作品"和设计"我的作品"是两个独立视图，没有统一的全局库页。
左侧不应承载全量历史浏览职责（那会造成左侧过载）。

产品决议已拍板：
- 顶部加独立的「作品库」tab/入口
- 进入后分两个子视图：**设计作品库** / **图片素材库**
- 左侧只放最近项和当前上下文，不放全量历史

---

## 目标行为

```
顶部 tab 导航：
  [ 图像 ]  [ 设计 ]  [ 作品库 ]  ← 新增

点「作品库」后主区显示：
  ┌─────────────────────────────┐
  │  [ 设计作品库 ] [ 图片素材库 ] │  ← 子视图切换 tab
  ├─────────────────────────────┤
  │  设计作品库视图（默认）      │
  │  ┌──────────┐ ┌──────────┐  │
  │  │ 作品卡片  │ │ 作品卡片  │  │
  │  └──────────┘ └──────────┘  │
  │  ...                        │
  └─────────────────────────────┘
```

---

## 现有代码关键位置

### src/midtaiLibraryHost.ts（或类似文件）

已有把图像/设计项目聚合成库项的能力：
- `postMidtaiLibrary()`：推送混合库数据给 renderer
- `postMidtaiDesignLibrary()`：推送设计库数据

确认这两个方法的实际返回 payload 格式，作为渲染依据。

### electron/renderer/index.html

**Midtai tab 导航**（搜索 `midtai-tab`、`data-tab`、`setMidtaiTab()` 等）：
找到当前图像/设计两个 tab 的切换机制，在同样的位置加「作品库」tab。

**已有图像库视图**（搜索 `renderMidtaiImageWorks()`）：
图片素材库子视图可以复用或参考这里的渲染逻辑。

**已有设计库视图**（搜索 `renderMidtaiDesignWorks()` 或 `design-works`）：
设计作品库子视图可以复用或参考。

---

## 实现要点

### 1. 顶部 tab 导航加「作品库」

在现有图像/设计 tab 旁边加第三个 tab，点击切换到作品库视图。

```javascript
// 在 tab 切换逻辑里加：
case 'library':
  document.getElementById('midtai-tab-library')?.classList.add('active');
  renderMidtaiLibraryView();
  break;
```

### 2. 作品库视图结构

```html
<div id="midtai-board-library" style="display:none">
  <!-- 子视图切换 tab -->
  <div id="library-subtabs">
    <button class="library-subtab active" data-subtab="design"
      onclick="setLibrarySubtab('design')">设计作品库</button>
    <button class="library-subtab" data-subtab="image"
      onclick="setLibrarySubtab('image')">图片素材库</button>
  </div>

  <!-- 设计作品库 -->
  <div id="library-panel-design" class="library-panel active">
    <!-- renderDesignLibrary() 填充 -->
  </div>

  <!-- 图片素材库 -->
  <div id="library-panel-image" class="library-panel">
    <!-- renderImageLibrary() 填充 -->
  </div>
</div>
```

### 3. 数据来源

**设计作品库**：
- host 推送：复用或扩展 `postMidtaiDesignLibrary()` 的 IPC
- renderer 渲染设计 project 列表（含名称、版本数、更新时间、预览图）
- 每个卡片操作：「打开编辑」→ 切换到设计 tab 并选中该作品

**图片素材库**：
- host 推送：复用或扩展 `postMidtaiLibrary()` 的图像部分
- renderer 渲染图片网格（含缩略图、prompt 摘要）
- 每个卡片操作：「下载」、「用于当前设计」（调 `insertToDesign(imageUrl)`）

### 4. 左侧占位处理

进入「作品库」tab 后，左侧面板可以：
- 显示统计信息（设计作品数 / 素材数）
- 或显示简单提示
- 不需要复杂的左侧结构（Phase 1 只需要主区可用）

### 5. 从左侧"查看全部作品"跳转

p1b 的最近作品列表底部有"查看全部作品"链接，点击 → 切换到「作品库」tab 的设计作品库子视图。

```javascript
function openDesignLibrary() {
  setMidtaiTab('library');
  setLibrarySubtab('design');
}
```

---

## 验收标准

1. 顶部可以切换到「作品库」tab
2. 作品库内分「设计作品库」和「图片素材库」两个子视图
3. 设计作品库显示所有正式入库的设计作品（不显示临时工作态）
4. 图片素材库显示图像历史记录
5. 点「打开编辑」可以跳转回设计 tab 并切换当前作品
6. 图像 tab 和设计 tab 左侧不再承担全量历史浏览职责

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `electron/renderer/index.html` | 高 | 顶部 tab 导航 + 作品库视图结构 |
| `electron/ElectronChatPanel.ts` | 中 | 作品库 tab 激活时触发数据推送 |
| `src/midtaiLibraryHost.ts` | 低 | 复用现有推送，如需扩展 payload 才改 |

---

## 明确不做

- 不做作品库的搜索 / 筛选 / 标签（Phase 2）
- 不做素材收藏 / 标记（Phase 2）
- 不做跨作品的版本对比（Phase 3）
- 不做作品删除 UI（只做浏览）
- 不改图像或设计的底层数据模型
