# KainClaw Design · UX 重构规格书 v2

**版本**：v2.0  
**日期**：2026-05-03  
**状态**：待实现  
**负责人**：Codex（实现）/ Claude（PM）  
**前置规格**：`kainclaw-design.md`（引擎层，继续有效）  
**背景**：基于 Claude Design 视频调研 + 代码审查 + Claude/Codex 联合评审

---

## 一、问题陈述

现有 KainClaw Design 的功能闭环已经完整（生成→Tweaks→patch→版本→导出），但交互模式是**配置表单风格**，而不是「对话推进状态 → canvas 即时响应」的工作流。具体问题：

| 问题 | 表现 |
|---|---|
| 入口逻辑矛盾 | 右侧默认提示「先从 Artifacts 面板打开」，但左侧有直接生成按钮，两条路径并存 |
| 左侧是表单不是工作流 | 用户需要先填 输出类型/风格/模式，再生成，体验是在填表 |
| 模式切换不直觉 | 「编辑当前页面」「新建设计」两个灰色按钮并排，无视觉反馈说明当前模式 |
| 信息密度爆炸 | Sliders/版本历史/参考图/当前产物信息卡同时堆在左侧，大部分时候为空占位 |
| Sliders 位置错 | Sliders 在左侧，效果在右侧 iframe，认知分裂 |
| Patch 入口差 | 点击 iframe 元素后 popover 出现在面板底部，与元素位置距离远 |
| 两个「返回聊天」 | 顶部 × 和底部按钮重复 |
| 设计绑定会话 | 独立入口只能看到最近会话那张，无项目管理概念 |
| 无 activeVersionId | 「当前在改哪一版」不清楚，编辑可能覆盖非预期版本 |

---

## 二、核心概念定义

### 2.1 DesignProject

每个 DesignProject 代表**一张设计页面的连续演进链**。

```typescript
interface DesignProject {
  projectId: string;           // UUID，全局唯一
  name: string;                // 用户可见名称，初始由 AI 从 prompt 提取
  source: 'artifact' | 'blank';
  sourceArtifactId?: string;   // source === 'artifact' 时设置
  activeVersionId: string;     // 当前工作版本
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;        // 用于 Recent Continue 排序
}
```

**来源规则**：
- `artifact`：从 Artifacts 面板点「进入 KainClaw Design」时创建，记录 `sourceArtifactId`
- `blank`：从「新建设计」入口创建

**复用规则**：同一个 artifact 再次进入，通过 `sourceArtifactId → projectId` 映射，直接回到原 project，不新建。

### 2.2 DesignVersion

每个 DesignVersion 是 project 下的一个快照，版本历史**线性追加，不分支**。

```typescript
interface DesignVersion {
  versionId: string;
  projectId: string;
  html: string;
  sliders: Slider[];
  sliderValues: Record<string, unknown>;
  prompt: string;
  outputType: OutputType;
  style: string;
  source: 'generate' | 'patch' | 'editCurrent' | 'restore';
  baseVersionId?: string;      // 存储但 UI 不暴露分支树
  createdAt: number;
}
```

**追加规则**：从旧版本恢复后再编辑，新版本仍追加到末尾，不创建分支。`baseVersionId` 仅作审计元数据保留。

### 2.3 activeVersionId 规则

- 打开 project 时，展示 `activeVersionId` 对应的版本
- 用户在版本历史里预览旧版本时，`activeVersionId` 不变
- 用户点击「基于此版本继续」时，生成新版本并更新 `activeVersionId`
- 新生成/patch 成功后，自动更新 `activeVersionId` 为最新版本

---

## 三、持久化与路由

### 3.1 跨 session 状态

宿主（ElectronHostAdapter）持久化一个字段：

```
cain.lastOpenedDesignProjectId: string | null
```

每次打开某个 project 时更新此值。

### 3.2 入口智能路由

```
左侧导航点击「设计」
├─ lastOpenedDesignProjectId 存在且 project 在库里
│   └─ 直接打开该 project 编辑器
├─ 不存在 / project 已被删
│   └─ 进入 Design Home
└─ 用户主动点「所有设计」
    └─ 进入 Design Home
```

从 Artifacts 面板点「进入 KainClaw Design」：

```
artifact:openKainClawDesign
├─ 找到 sourceArtifactId === artifactId 的 project
│   └─ 打开该 project 编辑器（高亮「编辑当前页面」模式）
└─ 找不到
    └─ 创建新 project（source: artifact），打开编辑器
```

---

## 四、Design Home

**定位**：设计管理页，不是强制入口。只在「无当前项目」或用户主动进入时出现。

### 4.1 布局结构

```
Design Home
├─ 「新建设计」主 CTA（醒目，页面顶部）
├─ 最近继续（Recent Continue）
│   └─ 按 lastOpenedAt DESC，最多显示 8 个
│   └─ 每张卡片：名称 + 最后编辑时间 + 缩略图（可选）
└─ 所有设计
    └─ 按 updatedAt DESC，全列表
```

空状态（无任何 project）：只显示「新建设计」CTA，文案说明可以从聊天里的 Artifact 进入或直接在此新建。

---

## 五、编辑器页重构

### 5.1 整体布局

```
┌─────────────────────────────────────────────────┐
│  顶部栏：K logo | 项目名 | 模式指示器 | [Tweaks] [×] │
├──────────────┬──────────────────────────────────┤
│              │  canvas toolbar                  │
│  左侧面板    │  [View] [Select] [Tweaks]         │
│  （对话驱动）│                                  │
│              │  iframe canvas                   │
│              │                                  │
│              │  （patch popover 贴近元素浮现）   │
└──────────────┴──────────────────────────────────┘
```

### 5.2 左侧面板重构

**原则**：左侧只展示「当前最相关的操作」，不同阶段显示不同内容。

**阶段 A — 无设计内容（刚进入/新建）**：
- 设计需求输入框（主操作）
- 输出类型选择（prototype/slide/infographic/animation）
- 风格提示（可选，折叠）
- 参考图上传（可选，折叠）
- 「生成设计」按钮

**阶段 B — 有设计内容（生成后）**：
- 项目名 + 当前版本信息
- 对话式输入框（「继续修改这个设计 / 提一个新需求」）
- 模式选择：`编辑当前页面` / `新建设计`（明确高亮，有描述文字说明区别）
- 版本历史（折叠，展开显示最近 5 条）
- 导出按钮组（折叠）

**始终不在左侧显示的内容**：Sliders、patch popover（这两个移到 canvas 侧）

### 5.3 模式切换 UI

不去掉模式按钮（先做清晰），但做得很明确：

```
┌────────────────────────────────────────┐
│  ● 编辑当前页面                         │  ← 选中时高亮，显示「将在 v4 基础上生成 v5」
│  ○ 新建设计                             │  ← 未选中时灰色，显示「将创建新项目」
└────────────────────────────────────────┘
```

每个选项下方有一行小字说明此次操作会产生什么结果，消除歧义。

### 5.4 Sliders 移至右侧

Tweaks/Sliders 面板作为 canvas 右侧的**抽屉式浮动面板**：
- 默认收起，顶部栏「Tweaks」按钮展开/收起
- 展开后在 canvas 右侧浮出，不遮挡主画布
- Tweaks 按钮仅在 `editModeAvailable === true` 时启用（保持现有逻辑）

### 5.5 Patch Popover 贴近元素

用户点击 iframe 里的元素后：
- iframe 通过 postMessage 传回元素的**边界坐标**（`getBoundingClientRect`）
- 宿主根据坐标，将 patch 输入框浮现在元素附近（优先在元素下方，空间不足时在上方）
- 不再放在左侧面板底部

### 5.6 顶部模式指示器

顶部栏在项目名旁边显示当前状态 badge：

```
K | AXIOM 官网页 | [编辑中 v4] | [Tweaks] [×]
                    ↑ 状态 badge，实时更新
```

状态包括：`新建中` / `编辑中 vN` / `生成中...` / `patch 中...`

### 5.7 去掉重复导航

只保留顶部栏的 `×` 关闭按钮（返回聊天/进入 Design Home）。  
删除左侧面板底部的「返回聊天」按钮。

---

## 六、IPC 变更

### 新增消息

| 消息 | 方向 | 说明 |
|---|---|---|
| `design:listProjects` | R→M | 获取所有 project 列表 |
| `design:createProject` | R→M | 创建新 project |
| `design:openProject` | R→M | 打开指定 project，更新 lastOpenedProjectId |
| `design:getLastProject` | R→M | 获取 lastOpenedProjectId 对应的 project |
| `design:projects` | M→R | listProjects 结果 |
| `design:projectOpened` | M→R | openProject 结果，含 project + activeVersion |

### 修改消息

| 消息 | 变更 |
|---|---|
| `design:generate` | 增加 `projectId`（blank source 时传入，用于绑定版本到正确 project） |
| `design:patch` | 增加 `projectId` |
| `design:restoreVersion` | 增加：恢复后更新 `activeVersionId`，不新建 project |
| `design:result` | 增加 `projectId`、`activeVersionId` |

---

## 七、数据层变更

### 新增 DesignProjectStore

新建 `src/design/designProjectStore.ts`，基于 SQLite（与现有 `versionStore.ts` 同数据库文件）。

```sql
CREATE TABLE IF NOT EXISTS design_projects (
  project_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('artifact','blank')),
  source_artifact_id TEXT,
  active_version_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  last_opened_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_projects_artifact
  ON design_projects(source_artifact_id)
  WHERE source_artifact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_last_opened
  ON design_projects(last_opened_at DESC);
```

### DesignVersionStore 修改

现有 `versionStore.ts` 的 `currentSessionId` 替换为 `projectId`：

```sql
-- 现有表增加 project_id 列（迁移时用 currentSessionId 填充旧数据）
ALTER TABLE design_versions ADD COLUMN project_id TEXT;
ALTER TABLE design_versions ADD COLUMN base_version_id TEXT;
ALTER TABLE design_versions ADD COLUMN source TEXT DEFAULT 'generate';
```

---

## 八、实施阶段

### 阶段 1 — 工作流重构（优先实施）

1. 新建 `DesignProjectStore`，定义 project/version 数据关系
2. 迁移 `versionStore` 加 `projectId` 字段
3. 实现入口智能路由（`lastOpenedDesignProjectId` 持久化）
4. 实现 Design Home（新建 + Recent Continue + All Designs）
5. `artifact → project` 复用逻辑
6. 编辑器顶部模式指示器 + 模式选择 UI 重构（含清晰说明文字）
7. 删除左侧面板底部「返回聊天」按钮

### 阶段 2 — 编辑体验优化

1. Sliders 面板移至右侧抽屉
2. canvas 顶部 toolbar（View / Select / Tweaks 模式切换）
3. Patch popover 坐标贴近元素浮现
4. 左侧面板按阶段 A/B 分情景展示（减少信息密度）

### 阶段 3 — Claude Design 风格增强

1. Draw 涂画标注（canvas overlay + vision 模型调用）
2. Design System 品牌资产（`designSystemStore.ts` + prompt 注入）
3. Publish 发布 URL（本地 HTTP server 最小版本）
4. Wireframe → High Fidelity 两阶段流程

---

## 九、不在本规格范围内

- 实时多用户协作
- Figma 文件直接导入
- 云端同步
- AI 自动布局建议（响应式优化等）
- 版本分支树 UI（`baseVersionId` 存储但不展示）

---

## 十、验收标准

- [ ] 进入 KainClaw Design，有正在进行的 project → 直接进编辑器，不经过 Home
- [ ] 进入 KainClaw Design，无 project → 进入 Design Home
- [ ] 同一个 artifact 两次点「进入 KainClaw Design」→ 打开同一个 project
- [ ] 「编辑当前页面」生成 → 新版本追加到当前 project，`activeVersionId` 更新
- [ ] 「新建设计」→ 创建新 project，不覆盖原 project
- [ ] 从旧版本恢复后再生成 → 新版本追加到末尾，不产生分支
- [ ] 关闭 app 重开 → 自动回到上次打开的 project
- [ ] Sliders 面板在 canvas 右侧，不在左侧面板
- [ ] patch popover 贴近被点击元素出现
- [ ] 顶部只有一个关闭/返回按钮
