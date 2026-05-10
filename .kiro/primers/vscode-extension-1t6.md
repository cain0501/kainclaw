# Primer: vscode-extension-1t6
# midtai-p3c：主 chat 侧栏 design session 下沉

## 阶段标记

Phase 3 / 依赖 p3a（p1y）和 p3b（1vp）已完成
涉及：renderer + host（postState 过滤）

---

## 背景

产品决议（规则 4）：
> 主 chat 侧边栏不再承担设计工作流管理职责。

当前状态：
- `sessionType: 'design'` 的 session 出现在主 chat 左侧 session 列表
- 用户能通过点击侧栏来切换设计上下文（这是错误的主入口）
- p3a/p3b 完成后，设计上下文的切换已经完全通过 Midtai 内部完成，侧栏入口可以安全移除

p3c 让 design session 从主 chat 侧栏消失，用户只能通过 Midtai 管理设计工作流。

---

## 目标行为

```
主 chat 左侧 session 列表：
  - 只显示 sessionType !== 'design' 的 session
  - design session 不出现，不占位，不计入总数

Midtai 设计 tab：
  - 左侧作品列表是切换设计上下文的唯一入口
  - 不受影响
```

---

## 实现要点

### 1. Host 侧：postState 过滤 design session

`postState()` 方法里把 `sessionType: 'design'` 的 session 从 sessions 列表里过滤掉，不推给 renderer。

```typescript
// 在 postState() 里过滤：
const allSessions = await this.sessions.listSessions();
const visibleSessions = allSessions.filter(async session => {
  const state = await this.sessions.loadRuntimeState(session.id);
  return state?.sessionType !== 'design';
});
// 用 visibleSessions 构建 payload，不用 allSessions
```

注意：`listSessions()` 返回的是不带 runtimeState 的 session summary，
需要确认是否有 `sessionType` 字段在 summary 里。
如果没有，需要在 `listSessions()` 的返回里带上 sessionType 字段（或在 postState 里批量加载 runtimeState）。

**备选方案（更高效）**：
在 session summary 里直接加 `sessionType` 字段，避免逐条加载 runtimeState。
搜索 `listSessions` 返回类型，确认是否可以扩展。

### 2. Renderer 侧：防御性过滤

即使 host 已经过滤，renderer 侧也加一层防御：

```javascript
// 渲染 session 列表时：
const visibleSessions = (appState.sessions || []).filter(
  session => session.sessionType !== 'design'
);
// 用 visibleSessions 渲染，不用 appState.sessions
```

### 3. 删除侧栏 design session click 逻辑

c68 里建立的侧栏 design session click 路由（点击 design session → openMidtai）：

```javascript
// c68 代码（待删除）：
if (session.sessionType === 'design') {
  send({ type: 'sessions:switch', id: session.id });
  openMidtai({ contentType: 'design' });
  setMidtaiDesignMode('pro');
  return;
}
```

p3c 里可以删掉这段——design session 不会出现在列表里，这段代码死代码化，直接移除。

### 4. 新建 session 时不影响 design session

用户在主 chat 里新建 session 的逻辑不变，只过滤显示。

### 5. session 计数的一致性

如果主 chat 有"X 个会话"计数，确保这个数字也只计 non-design session。

---

## 迁移注意事项

p3c 依赖 p3a/p3b 完成的理由：
- p3a 之前：用户需要通过侧栏切换设计上下文（侧栏是主入口，不能先删）
- p3a 之后：切换设计上下文已经通过 Midtai 内部完成，侧栏入口成为冗余

如果测试时发现切换设计上下文有问题，先回退 p3c，不要同时 debug p3a 和 p3c。

---

## 与 p3a/p3b 的衔接

| p3a/p3b 已有 | p3c 的变化 |
|------------|---------|
| 通过 Midtai 内部切换 project | 侧栏 design session 可以安全移除 |
| design session click 路由（c68） | 删除（死代码） |
| postState 推全量 sessions | 过滤掉 design sessions |

---

## 验收标准

1. 主 chat 左侧 session 列表不显示任何 `sessionType: 'design'` 的 session
2. 创建新设计作品后，主 chat 侧栏不出现新 session 条目
3. Midtai 设计 tab 左侧作品列表正常工作，不受影响
4. 主 chat 的普通对话 session 不受影响
5. 主 chat 新建 session 的功能不受影响

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `electron/ElectronChatPanel.ts` | 高 | postState 过滤 design session |
| `electron/renderer/index.html` | 中 | 渲染层防御过滤 + 删除 c68 click 路由 |
| `src/storage/sessionRepository.ts` | 低 | 如需在 listSessions 返回里加 sessionType 字段 |

---

## 明确不做

- 不删除 design session 的 session 数据（只是不在 UI 显示）
- 不删除 `sessionType: 'design'` 的持久化逻辑（session 仍然是底层存储）
- 不改 Midtai 内部的设计工作流
- 不做 session 数据清理（用户的历史 design session 数据保留）
