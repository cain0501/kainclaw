# Primer: vscode-extension-vlv
# midtai-p2c：临时工作态升级为正式作品完整流程

## 阶段标记

Phase 2 / 涉及 host + renderer / 依赖 p1c（qj9）已完成，pul（vscode-extension-pul）已关闭

---

## 背景

p1c 建立了临时工作态的 UI 框架，并预留了升级接口点：

```javascript
// p1c 预留的 renderer 处理器（占位）
if (type === 'design:project-created') {
  midtaiState.transientWork = null;
  midtaiState.currentDesignProjectId = message.projectId;
  send({ type: 'design:load-recent-projects' });
}
```

但这个流程目前是占位，不完整：
- host 侧在 `saveDesignArtifactToProject()` 成功后没有发 `design:project-created`
- renderer 侧收到消息后的过渡动画/刷新逻辑不完整
- 左侧列表的刷新时序不确定（临时条目消失和正式条目出现需要原子性）

p2c 补全这个闭环。

---

## 目标行为

```
用户点「进入画布」（pul 触发入库）
  ↓
saveDesignArtifactToProject() 执行成功
  ↓
host 发送 design:project-created：
  { projectId, name, versionCount: 1, updatedAt }
  ↓
renderer 收到后：
  1. 清除临时工作态条目（midtaiState.transientWork = null）
  2. 把新 projectId 设为当前作品（midtaiState.currentDesignProjectId = projectId）
  3. 刷新左侧最近作品列表（新 project 出现在列表顶部，高亮当前）
  4. 右侧 design chat 不变（用户仍然在聊天里）
  5. 如果用户当前在作品库 tab，刷新设计作品库列表
  ↓
整个过渡无闪烁、无白屏
```

---

## 现有代码关键位置

### pul 已完成的代码（electron/ElectronChatPanel.ts）

**`saveDesignArtifactToProject()`**（pul 实现）：
入库成功后需要在这里**补加**一条 `sendToRenderer`：
```typescript
// 在 saveDesignArtifactToProject() return 之前加：
this.sendToRenderer({
  type: 'design:project-created',
  projectId: project.projectId,
  name: project.name,
  versionCount: 1,
  updatedAt: version.createdAt,
});
```

**`handleEnterDesignFromArtifact()`**（pul 实现）：
「进入画布」的触发点，在这个方法里调 `saveDesignArtifactToProject()`，
入库成功后 `design:project-created` 消息应该在 `openMidtai()` 之前发出，
确保 renderer 先更新状态，再打开画布。

### electron/renderer/index.html

**p1c 预留的 `design:project-created` 处理器**：
```javascript
// 当前（占位，不完整）：
if (type === 'design:project-created') {
  midtaiState.transientWork = null;
  midtaiState.currentDesignProjectId = message.projectId;
  send({ type: 'design:load-recent-projects' });
}
```

需要补全为：
```javascript
if (type === 'design:project-created') {
  // 1. 清除临时工作态
  midtaiState.transientWork = null;
  // 2. 设为当前作品
  midtaiState.currentDesignProjectId = message.projectId;
  // 3. 把新 project 插入 recentProjects 顶部（直接插入，不等服务器刷新）
  const newEntry = {
    projectId: message.projectId,
    name: message.name,
    updatedAt: message.updatedAt,
    versionCount: message.versionCount,
  };
  midtaiState.recentProjects = [
    newEntry,
    ...(midtaiState.recentProjects || []).filter(p => p.projectId !== message.projectId),
  ].slice(0, 8);
  // 4. 重新渲染左侧列表
  renderRecentWorksList();
  // 5. 如果当前在作品库，刷新设计作品库
  if (midtaiState.activeTab === 'library') {
    send({ type: 'design:load-library' });
  }
  return;
}
```

**`renderRecentWorksList()`**（p1b/p1c 建立）：
确认该函数在 `midtaiState.transientWork === null` 时正确不渲染临时条目，
在 `midtaiState.currentDesignProjectId` 更新后正确高亮新项目。

---

## 实现要点

### 1. 消息发送时序

`saveDesignArtifactToProject()` 成功后，消息发送顺序：

```
1. design:project-created  ← renderer 更新左侧列表，清除临时态
2. openMidtai(...)         ← 打开画布（此时左侧状态已更新）
```

不能颠倒顺序，否则用户在画布里切回设计 tab 时，左侧还是旧状态。

### 2. 乐观更新（不等服务器刷新）

renderer 收到 `design:project-created` 后，不要先发 `design:load-recent-projects` 请求等服务器回包，而是**直接插入**新项目到 `midtaiState.recentProjects` 顶部（乐观更新），然后重新渲染。

这样左侧列表的更新是即时的，无延迟感。

可以在后台异步发一次 `design:load-recent-projects` 来确保数据一致性，但不阻塞 UI 更新。

### 3. 临时条目消失 + 正式条目出现的原子性

`renderRecentWorksList()` 只被调用一次，在这一次渲染里同时完成：
- 临时条目不渲染（`midtaiState.transientWork` 已清空）
- 新正式条目渲染并高亮（`midtaiState.currentDesignProjectId` 已更新）

不要分两步渲染，避免闪烁。

### 4. 再次入库的幂等性

如果用户对同一个 artifact 再次点「进入画布」（已入库），
pul 的 `handleEnterDesignFromArtifact()` 会直接 `openMidtai()`，
不再调 `saveDesignArtifactToProject()`，因此不会重复发 `design:project-created`。

这个已经在 pul 里实现（检查 `getProjectBySourceArtifactId`），p2c 不需要额外处理。

### 5. 临时工作态丢弃场景（用户没有生成就离开）

如果用户在临时工作态里没有生成就：
- 切换到其他正式作品
- 或关闭 Midtai

临时工作态直接丢弃（`midtaiState.transientWork = null`），不需要提示。
这是 Phase 2 的接受行为。Phase 3 可能会加"是否保留草稿"提示。

---

## 与 Phase 1 的衔接

| Phase 1 已有 | Phase 2 补全 |
|------------|------------|
| `design:project-created` 处理器（占位） | 完整的乐观更新逻辑 |
| 临时条目 UI（p1c） | 升级时清除临时条目的原子渲染 |
| `saveDesignArtifactToProject()`（pul） | 入库成功后补发 `design:project-created` |

---

## 验收标准

1. 用户在临时工作态里生成 artifact，点「进入画布」
2. → 左侧临时条目消失，正式作品条目出现并高亮（一次渲染，无闪烁）
3. → 右侧 design chat 不变（仍然可以看到刚才的对话）
4. → 画布打开
5. 再次点「进入画布」→ 不重新入库，直接打开画布（幂等）
6. 用户在临时工作态里没有生成就切到其他作品 → 临时条目消失，无错误
7. 入库后作品库的设计作品库视图（如果当前在库页）能看到新作品

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `electron/ElectronChatPanel.ts` | 中 | `saveDesignArtifactToProject()` 补发消息 |
| `electron/renderer/index.html` | 中 | `design:project-created` 处理器完整实现 |

---

## 明确不做

- 不改 `saveDesignArtifactToProject()` 的入库逻辑（只在成功后补发消息）
- 不做临时工作态跨会话持久化
- 不做"是否保留草稿"提示（Phase 3）
- 不做 version fork 数据操作（Phase 3）
- 不做 session → project 底层迁移
