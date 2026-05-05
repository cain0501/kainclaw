# KainClaw 中台 · UX 规格书 v1

**版本**：v1.0  
**日期**：2026-05-05  
**状态**：已冻结 · Codex 评审完成（2026-05-05）  
**负责人**：Codex（技术评审 + 实现）/ Claude（PM）  
**原型参考**：`.kiro/midtai-prototype-v2.html`（v7，可在浏览器直接运行）  
**背景**：用户需要一个独立于聊天会话的「内容中台」，统一管理图像生成和设计稿，并支持将中台产物回注设计画布（替换目标元素）

---

## 一、产品定位

中台是 KainClaw 的**专注创作工作台**，从聊天对话点「进入中台」后打开，解决：

| 问题 | 中台方案 |
|---|---|
| 对话界面空间有限，图像生成体验弱 | 专属图像生成工作台，多图预览、尺寸/风格控制 |
| 设计稿管理散落在各个会话 artifact 里 | 统一 我的作品 管理所有设计项目 |
| 从对话生成的图像无法直接替换设计稿里的元素 | Replace 流：画布 → 触发 replaceCtx → 中台选图 → 插入 |
| 提示词沉淀难 | 提示词库 Tab，图像提示词 + 网页模板两类 |

---

## 二、入口与路由

```
聊天对话
  ├─ artifact 图片 → hover「在中台精调」→ 中台（图像·生成预览，带当前图片）
  ├─ artifact 设计稿 → hover「进入中台编辑」→ 中台（设计·画布已打开）
  └─ 顶栏「中台」快捷入口 → 中台（上次离开时的状态）
```

返回：顶栏右侧「← 返回对话」，不影响会话状态。

---

## 三、整体布局

```
┌─────────────────────────────────────────────────────┐
│  [KC] KainClaw  [编辑中·项目名 ●]          [← 返回对话]  │  44px topbar
├──────────┬──────────────────────────────────────────┤
│          │  [生成预览] [我的作品] [提示词库]  ← tab bar  │  44px
│  左侧    │  [🎯 替换目标：项目·元素  × 取消]  ← ctx bar │  32px（可选）
│  操作    ├──────────────────────────────────────────┤
│  面板    │                                          │
│  220px   │         内容区                           │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```

### 3.1 Topbar

- 左：Logo
- 中：`.state-chip`（仅 `canvasOpen=true` 时可见，绿点 + "编辑中·项目名"）
- 右：`← 返回对话` 按钮

**没有**全局模式开关、没有全局 Replace 切换。

### 3.2 左侧面板

顶部：`图像` | `设计` 类型 Tab（切换类型不影响 我的作品 的真实数据，只影响视图焦点）

**图像模式**左侧表单：
- 描述（textarea）
- 参考图（上传按钮区）
- 风格（4 卡片：写实/平面/插画/胶片）
- 比例（横版/方形/竖版）
- 数量（1/2/4）
- 模式（初级/专家 toggle）
  - 专家模式额外显示：5步生成进度 + 质量分 chip
- 底部 CTA：「✦ 开始生成」（主）+ 「在对话中生成」（次）

**设计模式**左侧表单：
- 需求描述（textarea）
- 参考网址（input）
- 输出类型（落地页/仪表盘/移动端/PPT）
- 风格（现代简约/数据驱动/极简/大胆）
- 模式（初级/专家 toggle）
- 底部 CTA：「✦ 生成设计」（主）

### 3.3 Tab 栏规则

**两套独立 Tab 栏**（非共用）：

| 类型 | Tab 顺序 |
|---|---|
| 图像 | 生成预览 · 我的作品 · 提示词库 |
| 设计（无画布时） | 生成预览 · 我的作品 · 提示词库 |
| 设计（画布打开时） | **Tab 栏不变**，canvas-toolbar 显示在内容区顶部（iframe 上方） |

**Tab 栏在画布打开时始终可见**——用户在画布里想换素材，直接点「我的作品」tab 即可，不会迷失。

canvas-toolbar 位置：内容区顶部（tab 栏下方、iframe 上方），内容：`查看` `选择` `微调` ──── `导出` `保存` `退出画布`

### 3.4 替换上下文条（replace-ctx bar）

- 高 32px，琥珀色背景（`#fffbeb`），`#fbbf24` 下边框
- 位置：Tab 栏正下方，内容区正上方
- 格式：`🎯 替换目标：[项目名] · [元素名]  [× 取消替换]`
- **仅当 `replaceCtx !== null` 时显示**
- 触发来源：画布右侧面板「去图像工作台生成」或「从我的作品选择」按钮

---

## 四、各 Tab 详细行为

### 4.1 生成预览

**图像**：
- 空态：「还没有生成任何图片 / 在左侧输入描述，点击开始生成」
- 生成中：左侧按钮变为「生成中...」，内容区 shimmer 占位（1/2/4 格）
- 结果态：图片网格（1/2/4 格），悬浮显示「收藏」「插入到对话」按钮
  - 若 `replaceCtx !== null`：悬浮按钮变为「✓ 插入到设计」（绿色主按钮）

**设计**：
- 空态：`◼ 新建设计稿 / 在左侧填写设计需求... / [查看我的作品 →]`
- 生成中：`⟳ 正在生成设计稿... / 通常需要 10～30 秒`
- 生成完成：自动跳转打开画布（`openCanvas(projectName)`）

> 设计 生成预览 **不展示**已有设计项目网格，那是 我的作品 的职责。

### 4.2 我的作品

**正常状态**：
- 标题：「我的作品」
- 过滤器：全部 · 图像 · 设计 · 来自对话 · 来自中台
- 图像区块：小图网格（158px），悬浮显示「收藏」「插入到对话」
- 设计区块：大卡片（210px），显示缩略图 + 名称 + 版本号，悬浮显示「打开编辑」

**替换模式**（`replaceCtx !== null`）：
- 标题变为：「为《[项目名] · [元素名]》选图」
- 过滤器行**隐藏**，自动过滤只显示图像
- 悬浮按钮变为：`✓ 选用此图`（绿色）

### 4.3 提示词库

- 顶部 toggle：`图像提示词` | `网页模板`
- 分类 chips 横向滚动
- 卡片网格，悬浮显示「使用」，点击填入左侧 textarea

### 4.4 设计画布

触发条件：
- 从 我的作品 点「打开编辑」→ `openCanvas(projectName)`
- 设计生成完成 → 自动 `openCanvas(projectName)`

画布状态：
- Tab 栏**保持可见**，用户可随时点击切换到其他 tab 找素材
- canvas-toolbar 出现在内容区顶部（iframe 上方），包含查看/选择/微调/导出/保存/退出画布
- Topbar state chip 变为可见（绿点 + "编辑中·项目名"）
- 内容区：canvas-toolbar + iframe 展示设计稿 + 右侧属性面板（默认收起）

点击画布中 img 元素：
- 右侧面板展开，显示：元素信息 + 「替换图片」区块
  - `✦ 去图像工作台生成` → 调用 `goReplaceInImageLab()` → 切到图像·生成预览 + 设置 replaceCtx
  - `🗂 从我的作品选择` → 调用 `goReplaceInWorks()` → 切到我的作品 + 设置 replaceCtx

退出画布（「退出画布」按钮）：
- `exitCanvas()` → 清除 canvasOpen，隐藏 canvas-toolbar，隐藏 state chip，落到 我的作品（设计过滤）
- Tab 栏本身无需切换（始终可见）

---

## 五、Replace 流完整链路

```
1. 画布打开，canvasMode = 'select'
2. 用户点击 img 元素 → 右侧面板展开
3. 点「去图像工作台生成」或「从我的作品选择」
   → showReplaceCtx(project, element)
   → replaceCtx = { project: 'SaaS 落地页', element: '产品主图' }
   → replace-ctx bar 变为可见，显示 "🎯 替换目标：SaaS 落地页 · 产品主图"
   → 切换到对应 Tab（图像生成预览 or 我的作品）
4. 用户在图像工作台生成图片，或在我的作品选图
   → 悬浮出现「✓ 插入到设计」/「✓ 选用此图」
5. 点击插入 → insertToDesign(imgUrl)
   → 回到画布，目标元素替换为新图
   → replaceCtx = null，replace-ctx bar 消失
   → toast: "已替换 产品主图"
6. 用户也可随时点「× 取消替换」→ cancelReplace()
   → replaceCtx = null，bar 消失，一切恢复正常
```

---

## 六、状态机

```javascript
const S = {
  type: 'img',           // 'img' | 'design'
  imgView: 'preview',    // 'preview' | 'works' | 'plib'
  designView: 'preview', // 'preview' | 'works' | 'plib'
  canvasOpen: false,
  currentProject: '',    // 当前画布打开的项目名
  canvasMode: 'view',    // 'view' | 'select' | 'tweak'
  designMode: 'beginner',// 'beginner' | 'expert'
  replaceCtx: null,      // null | { project: string, element: string }
  plibTab: 'img',        // 'img' | 'design'
  plibCat: '全部',
  worksFilter: 'all',    // 'all' | 'image' | 'design' | 'chat' | 'midtai'
  genQty: 1,
};
```

**状态约束**：
- `replaceCtx !== null` 时，`canvasOpen` 一定为 false（replace 流在图像/作品 Tab 里进行）
- `canvasOpen = true` 时，Tab 栏必须是 canvas-toolbar
- `designView` 改变时，若 `canvasOpen = true`，先调 `exitCanvas()` 再切 Tab

---

## 七、不在此规格范围内（Out of Scope）

- 实际图像生成 API 对接（沿用现有 imageGalleryStore）
- 实际设计生成 API 对接（沿用现有 designProjectStore）
- 画布内的实际 patch 机制（沿用现有 patchEngine）
- 提示词库数据后端（本期用静态数据）
- 多用户协作、权限管理

---

## 八、Codex 评审结论（2026-05-05）

| # | 问题 | 结论 |
|---|---|---|
| 1 | `replaceCtx` 是否持久化 | **不持久化**，保持 renderer 内存态。瞬时任务上下文，持久化后易出现重开后指向失效 target 的脏状态。P0/P1 不进 store |
| 2 | DesignPanel iframe 复用 | **复用现有方案**（bridge / selection / tweaks / patch / project hydration 全部继承），无需重建容器 |
| 3 | canvas-toolbar 动画 | **首版不做动画**，直接显隐切换。过早上动画有 iframe flicker / selection state 错乱风险 |
| 4 | 聚合逻辑层级 | **新建 `src/midtaiLibraryHost`**，把 imageGalleryStore + designProjectStore 归一成 DTO 列表，由 ElectronChatPanel 喂给 renderer |
| 5 | 中台路由机制 | **新增显式 `midtai:open` contract**：`{ type, view, projectId?, artifactId?, replaceCtx? }`。现有通道能力够用，问题在 renderer 的 page-centric 路由需升级 |

**分期**：
- **P0**：route contract + midtaiLibraryHost + replaceCtx 内存态 + `design:patchImageNode` IPC
- **P1**：统一中台壳（topbar、双 tab 逻辑、replace-ctx bar、works/plib 统一入口、canvas-toolbar takeover）
- **P2**：动画、remember last surface、进度与质量 UI polish
