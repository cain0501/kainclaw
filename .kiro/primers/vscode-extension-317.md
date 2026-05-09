# Primer: vscode-extension-317
# 专业模式入口：点「专业」直接进设计专用 chat session

## 前置条件

依赖 A（by7）、B（jns）、C（04q）已完成。

现状：点「专业」只是切换 midtai 表单里的高级字段显示（`setMidtaiDesignMode('pro')`），用户根本进不了 chat 流程。A/B/C 的后端协议和渲染逻辑全部就绪，缺的是入口。

---

## 产品决策

**专业模式 = 设计专用 chat session。**

- 点「专业」→ 新建 `sessionType: 'design'` 的 session → 跳到 chat 界面
- 这个 session 的所有消息自动走 `handleDesignChatLane()`，不需要前端带任何 `lane` 标记
- system prompt 限定只处理设计需求，其他请求一律拒绝
- 小白模式不动，继续走 midtai 老路径

---

## 现有代码关键位置

### electron/renderer/index.html

**专业按钮**（line ~1124）：
```javascript
<button id="design-mode-pro-btn" onclick="setMidtaiDesignMode('pro')">专业</button>
```

**setMidtaiDesignMode()**（line ~3778）：
```javascript
function setMidtaiDesignMode(mode) {
  midtaiState.designMode = mode === 'pro' ? 'pro' : 'simple';
  localStorage.setItem('kc_design_mode', midtaiState.designMode);
  applyMidtaiDesignMode();
}
```
→ 改造：`mode === 'pro'` 时改为 `send({ type: 'sessions:new-design' })`，不再切换表单字段。

**sendPrompt()**（line ~5576）：当前所有消息都从这里发出，不带 lane 标记。设计 session 里不需要改这里，host 侧看 session 类型路由。

**showPage()**（line ~5007）：切换页面的函数，`showPage('chat')` 跳到 chat 界面。

**session 列表渲染**：搜索 `renderSessionList` 或 `sessions:data`，找到 session item 渲染逻辑，加设计图标。

**chat 输入框 placeholder**：搜索 `chat-input` 或 `sendPrompt` 附近的 placeholder，设计 session 里改为「描述你想要的设计…」。

### electron/ElectronChatPanel.ts

**handleRendererMessage() sendPrompt 路由**（line ~940）：
```typescript
const lane = message.lane === "design" ? "design" : "default";
if (lane === "design") {
  await this.handleDesignChatLane(message);
  return;
}
```
→ 改造：不再看 `message.lane`，改看当前 session 的 `sessionType`：
```typescript
const isDesignSession = await this.isCurrentSessionDesignType();
if (isDesignSession) {
  await this.handleDesignChatLane(message);
  return;
}
```

**createNewSession()**（line ~1210）：新增 `createNewDesignSession()` 方法，创建 session 时写入 `sessionType: 'design'`。

**handleRendererMessage() sessions 路由**（line ~803-809）：加一行：
```typescript
if (type === "sessions:new-design") { await this.createNewDesignSession(); return; }
```

### src/storage/sessionRepository.ts

**SessionRuntimeState**（line ~94）：加 `sessionType` 字段：
```typescript
export type SessionRuntimeState = {
  // ...现有字段
  sessionType?: 'design' | 'default';
};
```
序列化/反序列化要同步更新（参考 `designFlowState` 的处理方式）。

---

## 本任务需要做的事

### 1. 扩展 SessionRuntimeState

```typescript
// src/storage/sessionRepository.ts
export type SessionRuntimeState = {
  pendingPlanVerification?: PendingPlanVerificationSessionState;
  modelConversation?: PersistedConversationMessage[];
  compactBoundary?: CompactBoundarySessionState;
  artifactPanel?: ArtifactPanelSessionState;
  designFlowState?: DesignFlowState;
  workspaceRoot?: string;
  sessionType?: 'design' | 'default';  // 新增
};
```

序列化时加入 `sessionType`，反序列化时验证值为 `'design'` 或 `'default'`。

### 2. host 新增 createNewDesignSession()

```typescript
private async createNewDesignSession(): Promise<void> {
  const workspaceRoot = this.getSelectedWorkspaceRoot();
  const session = await this.sessions.createSession(
    randomUUID(),
    getWorkspaceHash(workspaceRoot),
    '设计对话',  // 默认标题
  );
  await this.sessions.saveRuntimeState(session.id, {
    workspaceRoot,
    sessionType: 'design',
  });
  await this.switchSession(session.id);
  // 通知 renderer 跳到 chat 界面
  this.sendToRenderer({ type: 'sessions:switch-to-chat' });
}
```

### 3. host 新增 isCurrentSessionDesignType()

```typescript
private async isCurrentSessionDesignType(): Promise<boolean> {
  if (!this.currentSessionId) return false;
  const state = await this.sessions.loadRuntimeState(this.currentSessionId);
  return state.sessionType === 'design';
}
```

### 4. host 改造 sendPrompt 路由

```typescript
if (type === 'sendPrompt') {
  const isDesignSession = await this.isCurrentSessionDesignType();
  if (isDesignSession) {
    await this.handleDesignChatLane(message);
    return;
  }
  await this.routePrompt(...);
  return;
}
```

同时在 `sessions:new-design` 加路由：
```typescript
if (type === 'sessions:new-design') { await this.createNewDesignSession(); return; }
```

### 5. renderer 改造 setMidtaiDesignMode()

```javascript
function setMidtaiDesignMode(mode) {
  if (mode === 'pro') {
    send({ type: 'sessions:new-design' });
    return;
  }
  // 小白模式保持原样
  midtaiState.designMode = 'simple';
  localStorage.setItem('kc_design_mode', 'simple');
  applyMidtaiDesignMode();
}
```

### 6. renderer 处理 sessions:switch-to-chat

在 host → renderer 消息处理里加：
```javascript
if (type === 'sessions:switch-to-chat') {
  showPage('chat');
  return;
}
```

### 7. renderer chat 输入框 placeholder

设计 session 里 placeholder 改为「描述你想要的设计…」。
判断方式：`appState.sessionType === 'design'`（host 在 `postState()` 里带上 sessionType）。

host `postState()` 需要把 `sessionType` 加入发给 renderer 的 state 对象。

### 8. renderer session 列表视觉区分

session item 渲染时，`sessionType === 'design'` 的 session 在标题前加设计图标（用 SVG 或 emoji 均可，保持和现有 session item 风格一致）。

---

## 验收标准

1. 点「专业」→ 新建设计 session → 自动跳到 chat 界面
2. 在设计 session 里发消息 → 自动走 `handleDesignChatLane()`，LLM 第一轮返回 `<question-form>` 卡片
3. 填表提交 → LLM 第二轮生成 `<artifact>`
4. 发非设计请求（如"帮我写代码"）→ LLM 拒绝（system prompt 限定）
5. chat 侧边栏设计 session 有视觉区分（图标或标签）
6. 设计 session 输入框 placeholder 为「描述你想要的设计…」
7. 小白模式不受影响，点「小白」继续走 midtai 老路径
8. 普通 session 发消息走普通路径，不受影响

---

## Out of scope

- 不做 D 任务（artifact 入库）
- 不删除 midtai 老入口
- 不重构 index.html
- 不实现设计 session 的特殊 UI（只改入口和路由）

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `electron/ElectronChatPanel.ts` | 高 | sendPrompt 路由改动影响所有消息处理 |
| `electron/renderer/index.html` | 高 | setMidtaiDesignMode 改动影响专业/小白切换 |
| `src/storage/sessionRepository.ts` | 中 | 加字段，序列化要同步 |

---

## 实现建议

1. **先加 sessionType 字段**：sessionRepository.ts，序列化/反序列化同步
2. **再写 host 方法**：`createNewDesignSession()`、`isCurrentSessionDesignType()`
3. **再改路由**：`sendPrompt` 路由 + `sessions:new-design` 路由
4. **再改 renderer**：`setMidtaiDesignMode()` + `sessions:switch-to-chat` 处理
5. **最后加视觉**：placeholder + session 列表图标
6. **写测试**：`ElectronChatPanel.test.ts` 验证设计 session 路由行为
