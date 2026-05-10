# Primer: vscode-extension-qj9
# midtai-p1c：新建作品进入临时工作态

## 阶段标记

Phase 1 / renderer-first / 不写 designProjectStore / 不进作品库

## 前置条件

依赖 p1b（vscode-extension-h82）完成：左侧作品列表已存在，「新建作品」按钮已在 DOM 里。

---

## 产品规则（必须在开始前理解）

> **"不入作品库" ≠ "不允许临时工作态存在"**

这两件事完全不同：

| | 临时工作态 | 正式作品 |
|--|---------|--------|
| 存在条件 | 用户点「新建作品」后立即 | 用户真正生成第一版 artifact 后 |
| 数据写入 | 不写 `designProjectStore` | 写 `designProject` + `designVersion` |
| 进作品列表 | **不进** | 进，正常显示 |
| 进作品库 | **不进** | 进 |
| 有 design chat | 有（空白） | 有 |
| 有 session transcript | 有（底层实现） | 有 |
| 有 designFlowState | 有（在内存/session） | 有 |

正式入库触发点（唯一）：
用户点「进入画布」或「进入 KainClaw Design」→ `saveDesignArtifactToProject()` → 作品正式创建。

---

## 目标行为

```
用户点「新建作品」
  ↓
左侧列表顶部出现临时条目（暗显样式区分）：
  [ 新作品·未命名 ]  ← 样式：虚线边框 / 灰色文字 / 无版本数
  当前选中，右侧进入空白 design chat
  ↓
用户在 design chat 里描述需求 → 生成 artifact
  ↓
用户点「进入画布」
  ↓
saveDesignArtifactToProject() 触发
  ↓
左侧临时条目升级为正式作品条目（实线边框 / 正常样式）
正式 project 进入作品列表和作品库
```

---

## 现有代码关键位置

### electron/renderer/index.html

**`sendDesignChatMessage()`**（已有）：发送 design chat 消息的入口。
**`applyMidtaiDesignMode()`**（已有）：切换小白/专业模式。
**p1b 建立的最近作品列表 DOM**：临时条目需要插入到这个列表顶部。

**需要新增的状态变量**：
```javascript
// 记录当前是否处于临时工作态
midtaiState.transientWork = null; // null 表示没有临时工作态
// 结构：{ sessionId: string, label: '新作品·未命名' }
```

### electron/ElectronChatPanel.ts

**`handleDesignChatSend()`**（已有，c68）：发送消息时如果没有活跃 design session，会调 `createNewDesignSessionSilent()`。
临时工作态的 session 就是由这个方法隐式创建的，**不需要改这个方法**。

**新增路由**：
```typescript
if (type === 'design:new-transient-work') {
  await this.handleNewTransientWork();
  return;
}
```

**新增方法 `handleNewTransientWork()`**：
```typescript
private async handleNewTransientWork(): Promise<void> {
  // 1. 清除当前 design session（或创建新的空白 session）
  await this.createNewDesignSessionSilent();
  // 2. 清空 designFlowState
  this.currentDesignFlowState = { conversationHistory: [] };
  // 3. 通知 renderer 进入临时工作态
  this.sendToRenderer({ type: 'design:transient-work-ready', sessionId: this.currentSessionId });
  // 4. 推送空的消息历史
  this.sendToRenderer({ type: 'design:chat:history', messages: [] });
}
```

### src/storage/sessionRepository.ts

**不需要修改**（临时工作态的 session 直接用现有 `sessionType: 'design'` 即可）。
如果需要标记"这个 session 是临时工作态"，可以在 `SessionRuntimeState` 里加 `isTransient?: boolean`，但只有实现确实需要时才加，不要预埋。

---

## 实现要点

### 1. 「新建作品」按钮点击

```javascript
// 在 p1b 建立的按钮 onclick 里
function onNewWorkClick() {
  send({ type: 'design:new-transient-work' });
}
```

### 2. Renderer 收到 `design:transient-work-ready` 后

```javascript
if (type === 'design:transient-work-ready') {
  midtaiState.transientWork = { sessionId: message.sessionId, label: '新作品·未命名' };
  midtaiState.currentDesignProjectId = null; // 临时态没有 projectId
  renderRecentWorksList(); // 重新渲染左侧列表，顶部加临时条目
  // 右侧进入 design chat（专业模式），已空白
  setMidtaiDesignMode('pro'); // 确保右侧是 design chat
  return;
}
```

### 3. 左侧列表渲染逻辑

```javascript
function renderRecentWorksList() {
  const list = document.getElementById('midtai-recent-works');
  if (!list) return;
  let html = '';

  // 临时工作态条目（置顶，样式区分）
  if (midtaiState.transientWork) {
    const isActive = !midtaiState.currentDesignProjectId;
    html += renderTransientWorkItem(midtaiState.transientWork, isActive);
  }

  // 正式作品条目
  const projects = midtaiState.recentProjects || [];
  projects.forEach(project => {
    const isActive = project.projectId === midtaiState.currentDesignProjectId;
    html += renderProjectItem(project, isActive);
  });

  list.innerHTML = html;
}

function renderTransientWorkItem(transientWork, isActive) {
  return `<div class="work-item transient ${isActive ? 'active' : ''}"
    style="border-style:dashed;opacity:.7;cursor:pointer"
    onclick="onTransientWorkClick()">
    <div class="work-title">${escapeHtml(transientWork.label)}</div>
    <div class="work-meta">未生成</div>
  </div>`;
}
```

### 4. 临时工作态升级为正式作品（与 pul 的接口点）

pul 任务（vscode-extension-pul）的 `saveDesignArtifactToProject()` 执行成功后，
host 发送 `design:project-created`（或类似消息）通知 renderer。

renderer 收到后：
```javascript
if (type === 'design:project-created') {
  // 临时工作态升级为正式作品
  midtaiState.transientWork = null;
  midtaiState.currentDesignProjectId = message.projectId;
  // 刷新最近作品列表（正式项目现在在列表里了）
  send({ type: 'design:load-recent-projects' });
}
```

**注意**：这个接口点在 p1c 里只需要预留 renderer 侧的处理器，host 侧由 pul 任务实现。

---

## 验收标准

1. 点「新建作品」后右侧进入空白 design chat（空态提示"描述你想要的设计"）
2. 左侧列表顶部出现临时条目，样式与正式作品有区分（暗显/虚线）
3. 临时工作态下可以正常发消息、生成 artifact
4. 未生成第一版前，临时条目不出现在作品库里
5. 切换到某个正式作品后，临时工作态条目仍然保留在顶部（用户可以切回来）
6. 生成第一版 artifact 后（pul 触发入库），临时条目升级为正式作品条目

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `electron/renderer/index.html` | 高 | 临时工作态 UI + 列表渲染逻辑 |
| `electron/ElectronChatPanel.ts` | 中 | 新增 handleNewTransientWork |
| `src/storage/sessionRepository.ts` | 低 | 只在确实需要时才加 isTransient 字段 |

---

## 明确不做

- 不写 `designProjectStore`（不创建真实 project）
- 不创建 `designVersion`
- 不进作品库或作品列表（直到 pul 触发入库）
- 不做"丢弃临时工作态"的 UI（Phase 2 决策）
- 不做临时工作态跨会话持久化（关闭后丢失是可接受的，Phase 2 决策）
