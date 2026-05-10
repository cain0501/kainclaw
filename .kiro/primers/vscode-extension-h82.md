# Primer: vscode-extension-h82
# midtai-p1b：设计 tab 左侧最近作品列表

## 阶段标记

Phase 1 / renderer-first / 不做 session→project 底层迁移

---

## 背景

当前设计 tab 左侧是 prompt 表单 + design chat 面板，用户切换设计上下文的主要入口还在主 chat 侧边栏，导致设计工作流分裂。

产品决议已拍板：
- 设计 tab 的主对象是**作品**（不是会话）
- 左侧改成最近作品列表，用户通过 Midtai 内部切换设计上下文
- 主 chat 侧栏不再作为设计工作流主入口（短期保留实现，但不再强化）

---

## 目标行为

```
设计 tab 左侧：
  ┌─────────────────────────────┐
  │  最近作品（最多 5~8 个）     │
  │  ┌──────────────────────┐   │
  │  │ [当前] 小红书图文作品 │   │  ← 高亮当前作品
  │  └──────────────────────┘   │
  │  ┌──────────────────────┐   │
  │  │  官网首页             │   │
  │  └──────────────────────┘   │
  │  ┌──────────────────────┐   │
  │  │  App Landing          │   │
  │  └──────────────────────┘   │
  │  [+ 新建作品]               │  ← 点击后交由 p1c 处理
  └─────────────────────────────┘

设计 tab 右侧：当前作品的 chat / 画布 / 版本（三 tab 结构，已有）
```

---

## 现有代码关键位置

### src/storage 相关

**`designProjectStore`**：已有 project 的 CRUD，包含：
- `listProjects()`：列出所有正式 project（按时间倒序）
- `getProject(projectId)`：获取单个 project

**`postMidtaiDesignLibrary()` 或类似方法**（在 `ElectronChatPanel.ts` 或 `midtaiLibraryHost.ts` 里）：
已有把设计项目推给 renderer 的机制，核实接口名和 payload 格式。

### electron/renderer/index.html

**设计 tab 当前结构**（搜索 `midtai-form-design`、`midtaiState.designMode`）：
- 当前左侧是小白表单 + 专业 design chat 面板的切换
- `applyMidtaiDesignMode()` 控制小白/专业切换
- 需要在此基础上在最上方加入最近作品列表区域

**已有设计相关 IPC 消息类型**（搜索 `loadDesignVersions`、`design:project`）：
核实已有哪些设计项目相关消息可以复用。

### electron/ElectronChatPanel.ts

搜索 `postMidtaiDesignLibrary` / `midtai:design` 找到已有的设计库推送逻辑。

---

## 实现要点

### 1. 最近作品列表数据来源

推荐方式：
- host 在进入 Midtai 设计 tab 时，推送最近 8 个正式 project 给 renderer
- IPC 消息：`design:recent-projects`，payload：`{ projects: DesignProjectSummary[] }`
- renderer 渲染在左侧列表

`DesignProjectSummary`（最小够用字段）：
```typescript
{
  projectId: string;
  name: string;
  updatedAt: number;     // 用于排序和显示"2分钟前"
  activeVersionId: string;
  versionCount?: number; // 显示 v3 等版本标记
}
```

### 2. 当前作品状态管理

- `midtaiState.currentDesignProjectId` 记录当前选中的 project
- 点击作品条目 → 切换 `currentDesignProjectId` → 右侧切换到该作品的 chat/画布/版本
- 左侧高亮当前作品条目

### 3. 切换作品后右侧的联动

切换到某个作品时：
1. 加载该作品的 design chat 历史（复用已有的 `design:chat:load-history` 或等价）
2. 更新右侧三个子视图（chat / 画布预览 / 版本记录）绑定到新 projectId

注意：切换作品**不能**触发 `showPage('chat')`，只在 Midtai 内部切换。

### 4. 「新建作品」按钮

Phase 1b 里只需要按钮存在，点击行为由 **p1c** 实现。
p1b 里按钮点击可以先 no-op 或显示"p1c 待实现"占位。

### 5. 完整历史入口

左侧最多显示 5~8 个，加一个"查看全部作品"链接，指向 p1d 的作品库页（Phase 1 可先占位）。

---

## 验收标准

1. 设计 tab 左侧展示最近 5~8 个正式设计作品
2. 点击作品条目切换当前作品上下文，右侧内容对应更新
3. 左侧高亮当前选中作品
4. 临时工作态（未生成）的 project 不出现在列表里
5. 主 chat 侧栏不作为切换设计上下文的主要演示路径
6. 小白/专业切换逻辑（`applyMidtaiDesignMode`）不受影响

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `electron/renderer/index.html` | 高 | 设计 tab 左侧布局重构 |
| `electron/ElectronChatPanel.ts` | 中 | 新增 design:recent-projects 推送 |
| `src/storage/designProjectStore.ts` | 低 | 只读，复用 listProjects |

---

## 明确不做

- 不做 session → project 的底层迁移
- 不做多 design session 的全局切换 UI（那是 Phase 3）
- 不做"临时工作态"条目的显示（那是 p1c）
- 不改 `saveDesignVersion()` / `saveDesignArtifactToProject()` 的入库逻辑
