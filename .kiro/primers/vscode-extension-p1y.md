# Primer: vscode-extension-p1y
# midtai-p3a：design chat 与 project 真绑定

## 阶段标记

Phase 3 / 架构变更 / 涉及 host + renderer + IPC 协议
**不做 conversationHistory 存储迁移（那是 p3b）**
**不做主 chat 侧栏清理（那是 p3c）**

---

## 背景

当前状态：
- `currentDesignProjectId` 记录当前选中的 project（`ElectronChatPanel.ts` line 382）
- `currentDesignFlowState` 记录当前对话流状态，包含 `conversationHistory`（line 383）
- 但这两个变量**互相独立**：切换 project 时，`currentDesignFlowState` 不会自动跟着切换
- 导致：点左侧切换到另一个作品，右侧 design chat 加载的历史可能还是上一个作品的

p3a 的任务：建立"选中 project → design chat 上下文跟着切换"的绑定关系。

切换 project 时，host 需要：
1. 加载该 project 对应的 conversationHistory（目前从 session 的 designFlowState 里取）
2. 把历史推给 renderer
3. 更新 `currentDesignFlowState` 为该 project 的状态

---

## 目标行为

```
用户点左侧作品列表里的某个作品
  ↓
renderer 发 design:switch-project { projectId }
  ↓
host:
  1. 更新 currentDesignProjectId = projectId
  2. 找到该 project 关联的 session（或从 project 记录取 conversationHistory）
  3. 重建 currentDesignFlowState（含 conversationHistory）
  4. 加载该 project 的 chat message history（sessionMessages）
  5. 发 design:chat:history { messages }
  6. 发 design:flow-context { hasVersion: bool, projectName }
  ↓
renderer:
  右侧 design chat 重新渲染该 project 的消息历史
  分流弹框判断基于新的 project 状态
```

---

## 现有代码关键位置

### electron/ElectronChatPanel.ts

**`currentDesignProjectId`**（line 382）：已有，记录当前 project。

**`currentDesignFlowState`**（line 383）：已有，记录当前对话流。
切换作品时要同步更新这里。

**`switchSession(sessionId)`**（已有）：切换 session。
p3a 不要求废弃 session，但切换 project 时需要同步切换到该 project 关联的 session。

**`resolveDesignLaneRequestContext()`**（line 2486）：
构建 design lane 的上下文，里面会用到 `currentDesignFlowState`。
p3a 要确保切换 project 后这里拿到的是正确 project 的 flow。

**`handleDesignChatLoadHistory()`**（c68 实现）：
加载当前 session 的消息历史。
p3a 需要类似的逻辑，但按 projectId 来加载，不只是按当前 session。

### src/design/designProjectStore.ts

**`DesignProjectRecord`**：
```typescript
{
  projectId: string;
  name: string;
  source: 'artifact' | 'blank';
  activeVersionId: string;
  // Phase 3b 会在这里加 conversationHistory
}
```

目前没有"找到 project 关联的 session"的字段。
p3a 需要一个方法把 projectId 映射到 sessionId。

---

## 实现要点

### 1. project → session 的映射

当前 session 的 `SessionRuntimeState` 里有 `designFlowState.projectId`，
可以反向查：给定 projectId，找到对应的 session。

```typescript
private async findSessionByProjectId(projectId: string): Promise<string | undefined> {
  const sessions = await this.sessions.listSessions();
  for (const session of sessions) {
    const state = await this.sessions.loadRuntimeState(session.id);
    if (state?.sessionType === 'design' && state?.designFlowState?.projectId === projectId) {
      return session.id;
    }
  }
  return undefined;
}
```

注意：这个查找是 O(n) 遍历，sessions 数量通常很少（<20），可接受。
p3b 会把这个映射显式化（conversationHistory 直接存在 project 里），不再需要遍历。

### 2. 新增 IPC 路由

```typescript
// handleRendererMessage 里加：
if (type === 'design:switch-project') {
  await this.handleSwitchDesignProject(String(message.projectId ?? ''));
  return;
}
```

### 3. handleSwitchDesignProject()

```typescript
private async handleSwitchDesignProject(projectId: string): Promise<void> {
  if (!projectId) return;

  // 1. 更新 currentDesignProjectId
  this.currentDesignProjectId = projectId;

  // 2. 找到关联 session 并切换
  const sessionId = await this.findSessionByProjectId(projectId);
  if (sessionId && sessionId !== this.currentSessionId) {
    await this.switchSession(sessionId);
  }

  // 3. 从 session 的 designFlowState 恢复 currentDesignFlowState
  if (this.currentSessionId) {
    const state = await this.sessions.loadRuntimeState(this.currentSessionId);
    this.currentDesignFlowState = state?.designFlowState ?? undefined;
  }

  // 4. 加载该作品的 chat message history
  const msgs = this.currentSessionId
    ? await this.sessions.loadMessages(this.currentSessionId)
    : [];
  this.sendToRenderer({ type: 'design:chat:history', messages: msgs });

  // 5. 推送 project 上下文给 renderer（用于分流弹框判断）
  const project = await this.designProjectStore.getProject(projectId);
  const hasVersion = !!(project?.activeVersionId && project.activeVersionId !== 'pending-version');
  this.sendToRenderer({
    type: 'design:flow-context',
    projectId,
    projectName: project?.name ?? '',
    hasVersion,
  });
}
```

### 4. Renderer 侧：发送 design:switch-project

p1b/Phase 2 建立的"点击左侧作品条目"逻辑，当前可能直接在 renderer 里更新 `midtaiState.currentDesignProjectId`。
p3a 改为：发 IPC 给 host，让 host 完成切换，host 再推历史给 renderer。

```javascript
function onProjectItemClick(projectId) {
  send({ type: 'design:switch-project', projectId });
  // 不要在 renderer 本地立刻更新 currentDesignProjectId
  // 等 host 推 design:chat:history 和 design:flow-context 回来
}
```

### 5. Renderer 侧：处理 design:flow-context

```javascript
if (type === 'design:flow-context') {
  midtaiState.currentDesignProjectId = message.projectId;
  midtaiState.currentProjectName = message.projectName;
  midtaiState.currentProjectHasVersion = message.hasVersion;
  renderRecentWorksList(); // 刷新左侧高亮
  return;
}
```

---

## 与 Phase 2 的衔接

| Phase 2 已有 | Phase 3a 的变化 |
|------------|---------------|
| 点击作品切换（renderer 本地状态）| 改为 host 驱动的双向切换 |
| 分流弹框触发用 `currentDesignProjectId` 查 project | 同，但现在切换后 project 状态是最新的 |
| `handleDesignChatLoadHistory()` 加载当前 session | 新增 `handleSwitchDesignProject()` 按 project 切换 |

---

## 验收标准

1. 点左侧作品 A → 右侧 design chat 显示 A 的历史，不显示 B 的
2. 点左侧作品 B → 右侧切换到 B 的历史
3. 切换作品后发新 brief → 分流弹框判断基于新作品的版本状态（不是旧作品的）
4. 没有关联 session 的作品（新作品）→ 右侧显示空白 design chat
5. 切换不触发 `showPage('chat')` 或任何主 chat 相关导航

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `electron/ElectronChatPanel.ts` | 高 | handleSwitchDesignProject + findSessionByProjectId |
| `electron/renderer/index.html` | 中 | 点击作品条目改为发 IPC |

---

## 明确不做

- 不把 conversationHistory 搬到 project 记录里（那是 p3b）
- 不删除 session 概念（session 仍然是底层存储，p3a 只是建立路由关系）
- 不清理主 chat 侧栏（那是 p3c）
- 不改 handleDesignChatLane 的内部逻辑
