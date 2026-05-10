# Primer: vscode-extension-1vp
# midtai-p3b：conversationHistory 从 session 迁移到 project 层

## 阶段标记

Phase 3 / 数据迁移 / 依赖 p3a（vscode-extension-p1y）已完成
涉及：host + sessionRepository + designProjectStore + 数据迁移

---

## 背景

p3a 建立了"选 project → 切换 chat 上下文"的路由，但 conversationHistory 还是存在 `SessionRuntimeState.designFlowState` 里（session 层）。

这带来的问题：
- session 和 project 的关联是间接的（通过遍历 session 查 `designFlowState.projectId`）
- 如果 session 被清理/切换，该 project 的对话历史就断了
- 一个 project 对应一个 session，这个映射不显式

p3b 把 conversationHistory 显式持久化到 project 层，`DesignProjectRecord` 直接持有对话历史。

---

## 数据模型变更

### 当前（session 层）

```
SessionRuntimeState.designFlowState.conversationHistory: DesignChatHistoryMessage[]
```

### 目标（project 层）

```
DesignProjectRecord.conversationHistory?: DesignChatHistoryMessage[]
```

---

## 实现要点

### 1. DesignProjectRecord 加字段

```typescript
// src/design/designProjectStore.ts
export type DesignProjectRecord = {
  projectId: string;
  name: string;
  source: DesignProjectSource;
  activeVersionId: string;
  conversationHistory?: DesignChatHistoryMessage[];  // 新增
  updatedAt?: number;
  lastOpenedAt?: number;
};
```

### 2. designProjectStore 加持久化方法

```typescript
// 保存对话历史到 project
async saveConversationHistory(
  projectId: string,
  history: DesignChatHistoryMessage[]
): Promise<void>

// 从 project 读取对话历史
async loadConversationHistory(
  projectId: string
): Promise<DesignChatHistoryMessage[]>
```

SQLite 侧：`design_projects` 表加 `conversation_history TEXT`（JSON 序列化）。

需要 migration（参考 designProjectStore 里现有的 `requiredColumns` 模式）：
```typescript
{ name: 'conversation_history', addSql: 'ALTER TABLE design_projects ADD COLUMN conversation_history TEXT' }
```

### 3. 写入时机

`handleDesignChatLane()` 里每轮 LLM 完成后更新 `currentDesignFlowState.conversationHistory`，
同时异步写入 project：

```typescript
// 在更新 currentDesignFlowState 之后：
this.currentDesignFlowState = {
  ...context.flow,
  conversationHistory: result.history,
};
// 新增：持久化到 project
if (this.currentDesignProjectId) {
  await this.designProjectStore.saveConversationHistory(
    this.currentDesignProjectId,
    result.history,
  );
}
```

### 4. 读取时机

`handleSwitchDesignProject()`（p3a 新增）里，
优先从 project 读，fallback 到 session 的 designFlowState：

```typescript
// 恢复 currentDesignFlowState
const projectHistory = await this.designProjectStore.loadConversationHistory(projectId);
if (projectHistory.length > 0) {
  // project 层有历史，直接用
  this.currentDesignFlowState = {
    flowId: `design-flow-${projectId}`,
    projectId,
    createdAt: Date.now(),
    conversationHistory: projectHistory,
  };
} else {
  // fallback：从 session 层读（兼容旧数据，p3b 的迁移兜底）
  const state = await this.sessions.loadRuntimeState(this.currentSessionId!);
  this.currentDesignFlowState = state?.designFlowState ?? undefined;
}
```

### 5. 数据迁移策略（已有数据处理）

采用**懒迁移**（lazy migration）：
- 不在启动时全量迁移
- 每次加载 project 时，如果 project 层没有 conversationHistory，
  尝试从 session 层读取并写入 project 层（一次性迁移）
- 这样旧数据不会丢失，新数据自动走 project 层

```typescript
// 在 handleSwitchDesignProject 里：
const projectHistory = await this.designProjectStore.loadConversationHistory(projectId);
if (projectHistory.length === 0) {
  // 尝试从 session 层迁移
  const state = this.currentSessionId
    ? await this.sessions.loadRuntimeState(this.currentSessionId)
    : null;
  const legacyHistory = state?.designFlowState?.conversationHistory ?? [];
  if (legacyHistory.length > 0) {
    await this.designProjectStore.saveConversationHistory(projectId, legacyHistory);
    return legacyHistory;
  }
}
return projectHistory;
```

---

## 与 p3a 的衔接

| p3a 已有 | p3b 的变化 |
|---------|---------|
| `findSessionByProjectId()`（遍历 sessions） | 完成后可以废弃（project 层直接有 history）|
| `handleSwitchDesignProject()` 从 session 读 history | 改为优先从 project 层读 |
| `currentDesignFlowState` 更新 | 同时写入 project 持久化 |

---

## 验收标准

1. design chat 里完成一轮生成后，关闭 Midtai 再重新打开 → 对话历史恢复
2. 切换到另一个作品 → 各自显示自己的历史，不互相串
3. 旧 project（p3b 之前创建的）切换时 → history 从 session 迁移过来，不丢失
4. `designProjectStore` 能正确存取 `conversationHistory`
5. 数据库 migration 在升级时自动执行，不破坏现有 project 数据

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `src/design/designProjectStore.ts` | 高 | 新增字段 + DB migration + 存取方法 |
| `electron/ElectronChatPanel.ts` | 高 | 写入时机 + 读取时机 + 懒迁移逻辑 |
| `src/storage/sessionRepository.ts` | 低 | 不改，只是读取旧数据 |

---

## 明确不做

- 不删除 session 里的 `designFlowState`（保留兼容，p3c 后可再清理）
- 不做全量一次性迁移（懒迁移即可）
- 不改 renderer 侧的任何逻辑（p3b 纯后端）
- 不清理主 chat 侧栏（p3c）
