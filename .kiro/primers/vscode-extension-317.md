# Primer: vscode-extension-317
# 专业模式入口：midtai 设计 tab 内嵌 design chat

## 产品决策（已与用户确认）

KainClaw 有两个独立 chat 窗口：
1. **主 chat**（page-chat）：全能，现有，不动
2. **设计 chat**（嵌在 midtai 设计 tab 的专业模式里）：只做设计，永不跳出 midtai

设计 chat 产生的 session 数据共享（`sessionType: 'design'`，出现在主 chat 侧边栏），但 UI 永远留在 midtai 内。

**绝对禁止**：点「专业」后调用 `showPage('chat')` 或发 `sessions:switch-to-chat`。

---

## 前置条件

依赖 A（by7）、B（jns）、C（04q）已完成。

现状：点「专业」发 `sessions:new-design` → host 创建 session → renderer 调 `showPage('chat')` 跳主窗口。**这是错的，需要完全重写。**

---

## 目标行为

```
用户在 midtai 设计 tab
    ↓
点「专业」按钮
    ↓
midtai 左栏：隐藏小白表单，显示 #midtai-design-chat 面板
（不跳页面，不跳窗口）
    ↓
用户在 design chat 输入框写 brief → 发送
    ↓
host 创建 sessionType:'design' session（如果没有活跃的）
host 通过 handleDesignChatLane() 处理
    ↓
LLM 回 question-form → 渲染在 design chat 面板
用户填表 → 提交
    ↓
LLM 生成 artifact HTML
    ↓
midtai 主区打开 Phase B 画布
设计 chat 面板显示「已生成设计」+ 进入按钮
```

点「小白」→ 恢复显示传统表单，隐藏 design chat。

---

## 现有代码关键位置

### electron/renderer/index.html

**`setMidtaiDesignMode(mode)`**（line ~3787）：
```javascript
// 现在（错的）：
function setMidtaiDesignMode(mode) {
  if (mode === 'pro') {
    send({ type: 'sessions:new-design' });
    return;
  }
  ...
}

// 改成：
function setMidtaiDesignMode(mode) {
  midtaiState.designMode = mode === 'pro' ? 'pro' : 'simple';
  localStorage.setItem('kc_design_mode', midtaiState.designMode);
  applyMidtaiDesignMode();
}
```

**`applyMidtaiDesignMode()`**（line ~3797）：加切换逻辑：
```javascript
// 小白：显示 #midtai-form-fields，隐藏 #midtai-design-chat
// 专业：隐藏 #midtai-form-fields，显示 #midtai-design-chat
```

**`midtai-form-design` div**（line ~1118）：在现有表单后面新增：
```html
<div id="midtai-design-chat" style="display:none;flex-direction:column;flex:1;overflow:hidden">
  <!-- 消息列表 -->
  <div id="design-chat-messages" style="flex:1;overflow-y:auto;padding:10px 11px;display:flex;flex-direction:column;gap:10px">
    <!-- 空状态 -->
    <div id="design-chat-empty" style="...">
      <div>描述你想要的设计</div>
      <div style="font-size:11px;color:#a8a29e">AI 会引导你完善需求，然后生成设计稿</div>
    </div>
  </div>
  <!-- 输入区 -->
  <div style="padding:10px 11px;border-top:1px solid #f0ebe3;flex-shrink:0">
    <textarea id="design-chat-input"
      placeholder="描述你想要的设计…"
      style="width:100%;min-height:60px;...resize:none"
      onkeydown="handleDesignChatKeydown(event)"></textarea>
    <button onclick="sendDesignChatMessage()" style="...">发送</button>
  </div>
</div>
```

**新增 JS 函数**：
```javascript
function handleDesignChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendDesignChatMessage();
  }
}

function sendDesignChatMessage() {
  const input = document.getElementById('design-chat-input');
  const prompt = input?.value.trim();
  if (!prompt) return;
  input.value = '';
  // 追加用户消息到 UI
  appendDesignChatMessage({ role: 'user', content: prompt });
  send({ type: 'design:chat:send', prompt });
}

function appendDesignChatMessage(msg) {
  // 渲染 text / question-form / artifact
  // 复用现有 KainClawQuestionForm + artifact 渲染逻辑
}
```

**处理 host → renderer 消息**（`sessions:switch-to-chat` 处理器**删掉**，新增）：
```javascript
if (type === 'design:chat:append') {
  appendDesignChatMessage(message.msg);
  return;
}
if (type === 'design:chat:token') {
  updateDesignChatStreamingMessage(message.token, message.messageId);
  return;
}
```

### electron/ElectronChatPanel.ts

**删除**：
- `createNewDesignSession()` 里的 `this.sendToRenderer({ type: 'sessions:switch-to-chat' })`
- `handleRendererMessage` 里 `sessions:new-design` 路由（或保留但去掉跳转）

**新增**：`handleRendererMessage` 加路由：
```typescript
if (type === 'design:chat:send') {
  await this.handleDesignChatSend(message);
  return;
}
```

**新增方法 `handleDesignChatSend()`**：
```typescript
private async handleDesignChatSend(message: Record<string, unknown>): Promise<void> {
  const prompt = String(message.prompt ?? '');
  if (!prompt) return;

  // 确保有活跃的 design session
  const hasDesignSession = this.currentSessionId
    && (await this.sessions.loadRuntimeState(this.currentSessionId))?.sessionType === 'design';

  if (!hasDesignSession) {
    // 创建新 design session，但不跳主 chat
    await this.createNewDesignSessionSilent();
  }

  // 存用户消息
  await this.appendUserMessageToSession(this.currentSessionId!, prompt);

  // 走 design chat lane，响应走 design:chat:append / design:chat:token
  await this.handleDesignChatLane({ prompt, target: 'design-chat' });
}

private async createNewDesignSessionSilent(): Promise<void> {
  const workspaceRoot = this.getSelectedWorkspaceRoot();
  const session = await this.sessions.createSession(
    randomUUID(),
    getWorkspaceHash(workspaceRoot),
    '设计对话',
  );
  await this.sessions.saveRuntimeState(session.id, {
    workspaceRoot,
    sessionType: 'design',
  });
  await this.switchSession(session.id);
  // 不发 sessions:switch-to-chat！只刷新侧边栏数据
  await this.postState();
}
```

**改造 `handleDesignChatLane()`**：支持 `target` 参数，根据 target 决定响应走哪个 IPC：
```typescript
// target === 'design-chat' 时：
// token 走 design:chat:token
// 最终消息走 design:chat:append
// artifact 生成后额外调用 openMidtai({ contentType:'design', view:'preview', ... })
// （Phase B 画布在 midtai 主区打开——这是合法的，用户已在 midtai 内）
```

### src/storage/sessionRepository.ts

`SessionRuntimeState` 加 `sessionType` 字段（317 已加，不需重复）。

---

## 需要删除/撤销的 317 旧代码

| 位置 | 删掉什么 |
|------|---------|
| `renderer/index.html` `setMidtaiDesignMode` | `send({ type: 'sessions:new-design' })` 分支 |
| `renderer/index.html` 消息处理 | `sessions:switch-to-chat` → `showPage('chat')` |
| `ElectronChatPanel.ts` `createNewDesignSession()` | `sendToRenderer({ type: 'sessions:switch-to-chat' })` |
| `ElectronChatPanel.ts` 路由 | `sessions:new-design` → `createNewDesignSession()` 调用链（可保留方法，去掉路由或保留为内部工具） |

---

## 渲染细节：design chat 内的消息类型

| 消息类型 | 渲染方式 |
|---------|---------|
| 普通文本 | 简单文本气泡 |
| `<question-form>` | 复用 `KainClawQuestionForm.splitOnQuestionForms()` + 现有 question-form 渲染 |
| `<artifact>` | 显示「设计已生成」chip + 「进入画布」按钮（点击调 `openDesignHub()`） |
| 流式 token | 追加到最后一条 assistant 消息 |

question-form 填表提交走现有 `submitQuestionForm()` 逻辑，但结果发送到 `design:chat:send`（或复用现有 `sendPrompt`，host 侧看 sessionType 路由到 `handleDesignChatLane`）。

---

## 验收标准

1. 点「专业」→ midtai 左栏变为 design chat 面板，**页面不跳转**
2. 点「小白」→ 恢复传统表单
3. 在 design chat 输入 brief → 发送 → LLM 回 question-form 卡片，渲染在 design chat 内
4. 填表提交 → LLM 生成 artifact → midtai 主区打开 Phase B 画布
5. 设计 session 出现在主 chat 侧边栏（✦ 图标）
6. 全程不调用 `showPage('chat')`
7. 普通 session 发消息不受影响

---

## Out of scope

- 不重构 index.html 整体结构
- 不做设计 chat 的历史消息加载（首次进入专业模式是空白状态）
- 不做「继续上次设计对话」功能（每次进专业模式是新 session）
- 不删除 midtai 老路径（小白模式继续走表单）

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `electron/renderer/index.html` | 高 | setMidtaiDesignMode + 新 design chat UI + 消息处理 |
| `electron/ElectronChatPanel.ts` | 高 | handleDesignChatSend + handleDesignChatLane 分发改造 |
| `src/storage/sessionRepository.ts` | 低 | sessionType 已有，不需改 |

---

## 实现建议

1. 先在 `index.html` 加 `#midtai-design-chat` HTML 结构 + `applyMidtaiDesignMode()` 切换
2. 再加 `sendDesignChatMessage()` + `appendDesignChatMessage()` JS 函数（先 stub）
3. 在 host 加 `design:chat:send` 路由 + `handleDesignChatSend()`
4. 改造 `handleDesignChatLane()` 加 target 参数
5. 接通 token 流和最终消息
6. 测试 question-form 渲染、artifact 生成
7. 写测试：`ElectronChatPanel.test.ts` 验证 `handleDesignChatSend` 不调 `showPage`
