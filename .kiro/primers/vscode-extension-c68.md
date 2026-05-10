# Primer: vscode-extension-c68
# 专业模式：midtai 内嵌 design chat（替换错误的主窗口跳转实现）

## 产品全局规则（必须在开始前理解）

系统允许两种设计生成来源，互不干扰：

| 来源 | 入口 | 展示位置 | 精修入口 |
|------|------|---------|---------|
| midtai 专业页 design chat | midtai → 设计 tab → 专业 | design chat 面板内 | 直接在 midtai 内进入画布 |
| 主 chat | 主 chat 正常对话生成 artifact | 主 chat artifact panel | 点"进入 KainClaw Design" → midtai 画布 |

**c68 只负责来源 1（midtai design chat）。来源 2（主 chat）不动。**

---

## 绝对禁止

- 调用 `showPage('chat')`
- 发 `sessions:switch-to-chat`
- 在主 chat 窗口展开 design session 的消息内容
- renderer 侧维护独立永久的 design chat 消息数组（必须以 host session store 为唯一真相）

---

## 前置条件

依赖 A（by7）、B（jns）、C（04q）已完成。

317 的实现是错的（点专业 → 跳主 chat），需要完全替换。317 留下了有用的基础：
- `sessionType: 'design'` 字段（sessionRepository.ts）
- `isCurrentSessionDesignType()` helper（ElectronChatPanel.ts）
- `sessionType` 加入 `postState()` → 主 chat 侧边栏的 ✦ 图标

---

## 目标行为

### 进入专业模式
```
midtai 设计 tab → 点「专业」
  → midtai 左栏：隐藏小白表单，显示 #midtai-design-chat 面板
  → 如果有未完成的 design session：加载并重放已有消息
  → 如果没有：显示空状态
（不跳页面，不跳窗口）
```

### 发送消息
```
用户在 design chat 输入框写 brief → 回车/点发送
  → host 确认有活跃 design session（没有则创建，不跳主 chat）
  → handleDesignChatSend() → handleDesignChatLane(target:'design-chat')
  → token 流 → design:chat:token
  → 完整消息 → design:chat:append
  → renderer 渲染在 design chat 面板内
```

### 生成 artifact
```
LLM 返回 artifact HTML
  → design chat 面板显示「已生成设计」+ [进入画布] 按钮
  → 点 [进入画布] → midtai 主区打开 Phase B 画布
（artifact 入库逻辑由 pul 任务处理，c68 只管显示按钮）
```

### 切回小白模式
```
点「小白」→ 隐藏 design chat 面板，显示传统表单
（不删除当前 design session，只切换 UI）
```

### 主 chat 侧边栏点击 design session
```
侧边栏显示 design session（✦ 图标）→ 用户点击
  → host switchSession() 切换到该 session
  → renderer 不调 showPage('chat')
  → 而是 openMidtai({ contentType:'design', view:'design-preview' }) + 加载消息历史
```

---

## 消息历史：以 host session store 为唯一真相

- renderer **不得**维护独立永久 design chat 消息数组
- 每次进入专业模式：向 host 请求消息历史（`design:chat:load-history`）
- 新消息由 host append 后通过 `design:chat:append` 推给 renderer
- 流式 token 通过 `design:chat:token` 更新最后一条 assistant 消息

---

## 现有代码需要改动的位置

### electron/renderer/index.html

**`setMidtaiDesignMode(mode)` 改造**（line ~3787）：
```javascript
// 改造前（错的）：
function setMidtaiDesignMode(mode) {
  if (mode === 'pro') {
    send({ type: 'sessions:new-design' });
    return;
  }
  midtaiState.designMode = mode === 'pro' ? 'pro' : 'simple';
  localStorage.setItem('kc_design_mode', midtaiState.designMode);
  applyMidtaiDesignMode();
}

// 改造后：
function setMidtaiDesignMode(mode) {
  midtaiState.designMode = mode === 'pro' ? 'pro' : 'simple';
  localStorage.setItem('kc_design_mode', midtaiState.designMode);
  applyMidtaiDesignMode();
  if (mode === 'pro') {
    send({ type: 'design:chat:load-history' });
  }
}
```

**`applyMidtaiDesignMode()` 改造**：
```javascript
function applyMidtaiDesignMode() {
  const isPro = midtaiState.designMode === 'pro';
  const formFields = document.getElementById('midtai-design-form-fields');
  const chatPanel  = document.getElementById('midtai-design-chat');
  if (formFields) formFields.style.display = isPro ? 'none' : '';
  if (chatPanel)  chatPanel.style.display  = isPro ? 'flex' : 'none';
  const simpleBtn = document.getElementById('design-mode-simple-btn');
  const proBtn    = document.getElementById('design-mode-pro-btn');
  if (simpleBtn) { simpleBtn.style.background = isPro ? 'none' : '#c9502e'; simpleBtn.style.color = isPro ? '#78716c' : '#fff'; }
  if (proBtn)    { proBtn.style.background    = isPro ? '#c9502e' : 'none'; proBtn.style.color    = isPro ? '#fff' : '#78716c'; }
}
```

**删掉**：
```javascript
// 删除这个处理器：
if (type === 'sessions:switch-to-chat') {
  showPage('chat');
  return;
}
```

**新增 HTML：`#midtai-design-chat` 面板**（加在 `midtai-form-design` 内，紧跟小白表单区后面）：
```html
<div id="midtai-design-chat" style="display:none;flex-direction:column;flex:1;overflow:hidden;min-height:0">
  <div id="design-chat-messages"
    style="flex:1;overflow-y:auto;padding:10px 11px;display:flex;flex-direction:column;gap:10px">
    <div id="design-chat-empty" style="display:flex;flex-direction:column;align-items:center;
      justify-content:center;flex:1;gap:8px;color:#a8a29e;text-align:center;padding:20px 0">
      <div style="font-size:24px;opacity:.4">✦</div>
      <div style="font-size:13px;font-weight:500;color:#78716c">描述你想要的设计</div>
      <div style="font-size:11px;line-height:1.6">AI 会引导你完善需求，然后生成设计稿</div>
    </div>
  </div>
  <div style="padding:8px 11px 10px;border-top:1px solid #f0ebe3;flex-shrink:0">
    <textarea id="design-chat-input"
      placeholder="描述你想要的设计…"
      rows="3"
      style="width:100%;padding:8px 10px;border:1.5px solid #e5ddd0;border-radius:8px;
        font-size:12px;resize:none;font-family:inherit;line-height:1.5;background:#fdfcfb"
      onkeydown="handleDesignChatKeydown(event)"></textarea>
    <div style="display:flex;justify-content:flex-end;margin-top:5px">
      <button onclick="sendDesignChatMessage()"
        style="padding:6px 16px;background:#c94c2e;color:#fff;border:none;border-radius:7px;
          font-size:12px;font-weight:600;cursor:pointer">发送</button>
    </div>
  </div>
</div>
```

**新增 JS 函数**：
```javascript
function handleDesignChatKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDesignChatMessage(); }
}

function sendDesignChatMessage() {
  const input = document.getElementById('design-chat-input');
  const prompt = input?.value.trim();
  if (!prompt) return;
  input.value = '';
  // 不在本地 append 用户消息！host session store 是唯一真相。
  // 只进入 pending 态（可选：显示发送中 spinner），消息一律等 host 经 design:chat:append 回推。
  send({ type: 'design:chat:send', prompt });
}

// msg 完整 schema（design:chat:append / history 里的每条消息都必须带齐这些字段）：
// {
//   messageId: string,          // 唯一 ID，去重 & streaming 定位用
//   role: 'user' | 'assistant',
//   content: string,
//   timestamp: number,
//   kind: 'text' | 'question-form' | 'artifact',
//   artifactId?: string,        // kind==='artifact' 时必填，用于发 artifact:enter-design
//   designProjectId?: string,   // 入库后填入，用于 version sync / tombstone
// }
function appendDesignChatMessageToUI(msg) {
  const container = document.getElementById('design-chat-messages');
  const empty     = document.getElementById('design-chat-empty');
  if (!container) return;
  // 去重：同一个 messageId 不重复渲染
  if (msg.messageId && container.querySelector(`[data-message-id="${msg.messageId}"]`)) return;
  if (empty) empty.style.display = 'none';

  const bubble = document.createElement('div');
  bubble.style.cssText = msg.role === 'user'
    ? 'align-self:flex-end;background:#c94c2e;color:#fff;padding:8px 12px;border-radius:10px 10px 2px 10px;font-size:12px;max-width:90%;line-height:1.5'
    : 'align-self:flex-start;background:#f5f0e8;color:#1c1917;padding:8px 12px;border-radius:10px 10px 10px 2px;font-size:12px;max-width:90%;line-height:1.5';
  if (msg.messageId) bubble.dataset.messageId = msg.messageId;

  if (msg.kind === 'question-form') {
    renderDesignChatQuestionForm(bubble, msg.content);
  } else if (msg.kind === 'artifact') {
    // 用 artifactId 发 enter-design；若已入库则用 designProjectId 做 version sync
    const artifactId = msg.artifactId ?? '';
    bubble.innerHTML = '<div style="font-size:12px;font-weight:600;margin-bottom:8px">✦ 设计已生成</div>' +
      `<button onclick="send({type:'artifact:enter-design',artifactId:'${artifactId}'})"` +
      ' style="padding:6px 14px;background:#1c1917;color:#fff;border:none;border-radius:7px;font-size:12px;cursor:pointer">进入画布</button>';
    // version sync：如果已入库，请求最新版本
    if (msg.designProjectId) {
      send({ type: 'design:get-active-version', projectId: msg.designProjectId });
    }
  } else {
    bubble.textContent = msg.content;
  }

  if (msg.streamingId) bubble.dataset.streamingId = msg.streamingId;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

function updateDesignChatStreamingMessage(token, streamingId) {
  const el = document.querySelector(`[data-streaming-id="${streamingId}"]`);
  if (el) el.textContent += token;
}

function renderDesignChatQuestionForm(container, content) {
  // 用 KainClawQuestionForm.splitOnQuestionForms() 解析
  // 渲染 question-form 卡片（复用现有逻辑）
  // 提交时发 send({ type: 'design:chat:send', prompt: formattedAnswers })
}
```

**新增消息处理**：
```javascript
if (type === 'design:chat:append') {
  appendDesignChatMessageToUI(message.msg);
  return;
}
if (type === 'design:chat:token') {
  updateDesignChatStreamingMessage(message.token, message.streamingId);
  return;
}
if (type === 'design:chat:history') {
  const container = document.getElementById('design-chat-messages');
  const empty = document.getElementById('design-chat-empty');
  if (container) {
    Array.from(container.children).forEach(c => { if (c.id !== 'design-chat-empty') c.remove(); });
  }
  if (message.messages?.length) {
    if (empty) empty.style.display = 'none';
    message.messages.forEach(m => appendDesignChatMessageToUI(m));
  } else {
    if (empty) empty.style.display = '';
  }
  return;
}
```

**主 chat 侧边栏 session click 改造**（找到 session item click 逻辑）：
```javascript
// 点击 session 时，如果 sessionType === 'design'，进 midtai 专业页而不是主 chat
if (session.sessionType === 'design') {
  send({ type: 'sessions:switch', id: session.id });  // host 路由读 message.id，不是 sessionId
  // 目标：打开 midtai 设计 tab 并切到专业模式，然后加载/重放 design chat 历史。
  // 不要写死 view:'design-preview'（那是 Phase B 画布），而是打开 midtai 后直接切专业模式。
  openMidtai({ contentType: 'design' });   // 打开 midtai 设计 tab（不指定 view）
  setMidtaiDesignMode('pro');              // 切专业模式，内部会发 design:chat:load-history
  return;
}
// 普通 session：原有逻辑不变
```

---

### electron/ElectronChatPanel.ts

**删除**：
- `createNewDesignSession()` 里的 `this.sendToRenderer({ type: 'sessions:switch-to-chat' })`

**新增路由**：
```typescript
if (type === 'design:chat:send')         { await this.handleDesignChatSend(message); return; }
if (type === 'design:chat:load-history') { await this.handleDesignChatLoadHistory(); return; }
```

**新增方法**：
```typescript
private async handleDesignChatSend(message: Record<string, unknown>): Promise<void> {
  const prompt = String(message.prompt ?? '');
  if (!prompt) return;

  const isDesign = this.currentSessionId
    && (await this.sessions.loadRuntimeState(this.currentSessionId))?.sessionType === 'design';
  if (!isDesign) {
    await this.createNewDesignSessionSilent();
  }

  const userMsg = await this.appendUserMessageToSession(this.currentSessionId!, prompt);
  // Blocker 补丁：host 存完后必须立即回推用户消息，renderer 才能显示。
  // renderer 不本地 append，所以这一步不能省。
  this.sendToRenderer({
    type: 'design:chat:append',
    msg: {
      messageId: userMsg.id,          // 唯一 ID，用于去重和 streaming 定位
      role: 'user',
      content: prompt,
      timestamp: userMsg.timestamp,
      kind: 'text',
      artifactId: undefined,
      designProjectId: undefined,
    },
  });
  await this.handleDesignChatLane({ prompt, target: 'design-chat' });
}

private async createNewDesignSessionSilent(): Promise<void> {
  const workspaceRoot = this.getSelectedWorkspaceRoot();
  const session = await this.sessions.createSession(
    randomUUID(), getWorkspaceHash(workspaceRoot), '设计对话',
  );
  await this.sessions.saveRuntimeState(session.id, { workspaceRoot, sessionType: 'design' });
  await this.switchSession(session.id);
  await this.postState();  // 刷新侧边栏，不发 switch-to-chat
}

private async handleDesignChatLoadHistory(): Promise<void> {
  if (!this.currentSessionId) {
    this.sendToRenderer({ type: 'design:chat:history', messages: [] });
    return;
  }
  const state = await this.sessions.loadRuntimeState(this.currentSessionId);
  if (state.sessionType !== 'design') {
    this.sendToRenderer({ type: 'design:chat:history', messages: [] });
    return;
  }
  const msgs = await this.sessions.loadMessages(this.currentSessionId);  // 正确接口名：loadMessages，不是 getMessages
  this.sendToRenderer({ type: 'design:chat:history', messages: msgs });
}
```

**改造 `handleDesignChatLane()`**：加 `target` 参数：
```typescript
// 当 target === 'design-chat' 时：
//   token → sendToRenderer({ type: 'design:chat:token', token, streamingId })
//   完整消息 → sendToRenderer({ type: 'design:chat:append', msg: { role, content, kind } })
//   artifact 生成后 → openMidtai({ contentType:'design', view:'preview', projectId })
// 当 target 未传（普通 sendPrompt 路径）→ 保持现有行为不变
```

---

## 验收标准

1. 点「专业」→ midtai 左栏变 design chat，**页面不跳转**
2. 点「小白」→ 恢复传统表单
3. 重新进入专业模式 → 已有消息从 host 重放，不丢失
4. design chat 内：brief → question-form 卡片 → 填表 → artifact → [进入画布]
5. artifact 生成后 midtai 主区打开 Phase B 画布
6. 主 chat 侧边栏显示 design session（✦）→ 点击 → 进 midtai 专业页（不展开在主 chat）
7. 主 chat 里的普通对话完全不受影响
8. 全程不调用 `showPage('chat')`

---

## Out of scope

- 不做多个 design session 切换 UI
- 不做 design chat 内消息删除/撤回
- artifact 入库逻辑由 pul 任务处理，c68 只管显示「已生成设计」+ [进入画布]

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `electron/renderer/index.html` | 高 | setMidtaiDesignMode + design chat UI + 消息处理 + 侧边栏 click 路由 |
| `electron/ElectronChatPanel.ts` | 高 | handleDesignChatSend + handleDesignChatLane target 参数 |
| `src/storage/sessionRepository.ts` | 低 | sessionType 已有，不需改 |

---

## 实现建议

1. 先加 HTML 结构（`#midtai-design-chat`）+ `applyMidtaiDesignMode()` 切换逻辑
2. 删掉 `setMidtaiDesignMode('pro')` 里的旧跳转，删掉 `sessions:switch-to-chat` 处理器
3. 加 `sendDesignChatMessage()` + `appendDesignChatMessageToUI()` JS 函数
4. host 加 `design:chat:send` + `design:chat:load-history` 路由及对应方法
5. 改造 `handleDesignChatLane()` 加 target 参数，接通 token/message 分发
6. 接通 question-form 渲染（复用 `KainClawQuestionForm`）
7. 改造侧边栏 session click（design session → midtai 专业页）
8. 写测试：不调 showPage、消息历史重放、target 分发逻辑
