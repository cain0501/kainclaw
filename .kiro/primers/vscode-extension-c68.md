# Primer: vscode-extension-c68
# 设计入口重构：弹框引导替换 小白/专业 toggle

## 背景与产品决策

旧方案（小白/专业 tab toggle）因概念模糊被废弃。

**新方案**：进入设计区域时弹出一个引导弹框，让用户一键选择路径，无需输入文字。

```
进入 midtai 设计 tab
  → 弹出 DesignEntryDialog（居中蒙层）
  → 两个大按钮：
      [ 快速生成一稿 ]  ←  填 3 个核心问题，直接生成
      [ 先聊需求，再生成 ]  ←  走完整 discovery 表单流程
```

---

## 绝对禁止

- 保留任何 小白/专业 tab 按钮或 toggle
- 调用 `showPage('chat')`、发 `sessions:switch-to-chat`
- renderer 侧维护独立永久的 design chat 消息数组

---

## 前置说明

p1-p4（jzu 及其前置）已完成：
- `#midtai-design-chat` 面板已存在
- design:chat:send / design:chat:append / design:chat:token / design:chat:load-history IPC 已接通
- `handleDesignChatSend()` / `handleDesignChatLane()` / `handleDesignChatLoadHistory()` 已实现
- `setMidtaiDesignMode()` / `applyMidtaiDesignMode()` 已实现

**c68 只做入口层改造，不动 design chat 本身的消息/IPC 逻辑。**

---

## 目标行为

### 1. 弹框触发时机

每次用户打开 midtai 设计 tab（且当前无进行中的 design session）时弹出。
若已有 design session 进行中，直接跳过弹框，进入 design chat 面板。

### 2. 弹框 UI（DesignEntryDialog）

```
┌─────────────────────────────────────┐
│  你想怎么开始？                        │
│                                       │
│  ┌─────────────────────────────────┐ │
│  │  ⚡ 快速生成一稿                   │ │
│  │  回答 3 个问题，AI 直接出稿        │ │
│  └─────────────────────────────────┘ │
│                                       │
│  ┌─────────────────────────────────┐ │
│  │  ✦ 先聊需求，再生成              │ │
│  │  AI 引导你确认细节，再生成       │ │
│  └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

点击任一按钮后弹框消失，不再出现（同一 session 内）。

### 3. 快速路径（Quick）

弹框消失后，在 design chat 面板内显示一个简短的 3 问表单：

| 问题 | 字段 | 类型 |
|------|------|------|
| 你想做什么？ | surface | 单选：落地页 / 移动 App / 后台界面 / 演示 PPT / 其他 |
| 主要给谁看？ | audience | 单行文本（placeholder: 如：投资人、消费者、内部团队） |
| 视觉感觉？ | direction | 单选：简洁现代 / 温暖亲切 / 科技感 / 高端品牌 |

用户填完点「生成」→ 拼成 prompt 发送到 design chat（走现有 `handleDesignChatSend`）。

### 4. 详细路径（Detailed）

弹框消失后，直接触发 design chat 的 AI 首轮问题（发一条空 trigger 消息）。
AI 按现有 discovery prompt 流程走：question-form → 填表 → 生成。

### 5. 已有 session 时的行为

再次进入 design tab 时如果已有 design session：
- 不弹弹框
- 直接显示 design chat 面板并重放消息历史
- 提供「新建设计」按钮，点击后清空 session 并重新弹出弹框

---

## 需要改动的位置

### electron/renderer/index.html

**1. 删除** 小白/专业 toggle 按钮的 HTML（找 `design-mode-simple-btn` / `design-mode-pro-btn`，整段删掉）。

**2. 删除** `applyMidtaiDesignMode()` 中对 simple/pro 按钮样式的切换逻辑（因为按钮已删）。

**3. 新增** `DesignEntryDialog` HTML（蒙层 + 弹框，加在 `#midtai-form-design` 内部顶部）：

```html
<div id="design-entry-dialog"
  style="display:none;position:absolute;inset:0;background:rgba(28,25,23,.45);
    z-index:100;align-items:center;justify-content:center">
  <div style="background:#fdfcfb;border-radius:14px;padding:24px 22px;width:280px;
    box-shadow:0 8px 32px rgba(0,0,0,.18)">
    <div style="font-size:14px;font-weight:700;color:#1c1917;margin-bottom:16px;text-align:center">
      你想怎么开始？
    </div>
    <button onclick="chooseDesignEntryPath('quick')"
      style="width:100%;padding:14px 16px;background:#fdf8f2;border:1.5px solid #e5ddd0;
        border-radius:10px;text-align:left;cursor:pointer;margin-bottom:10px;display:block">
      <div style="font-size:13px;font-weight:600;color:#1c1917;margin-bottom:3px">⚡ 快速生成一稿</div>
      <div style="font-size:11px;color:#78716c">回答 3 个问题，AI 直接出稿</div>
    </button>
    <button onclick="chooseDesignEntryPath('detailed')"
      style="width:100%;padding:14px 16px;background:#fdf8f2;border:1.5px solid #e5ddd0;
        border-radius:10px;text-align:left;cursor:pointer;display:block">
      <div style="font-size:13px;font-weight:600;color:#1c1917;margin-bottom:3px">✦ 先聊需求，再生成</div>
      <div style="font-size:11px;color:#78716c">AI 引导你确认细节，再生成</div>
    </button>
  </div>
</div>
```

**4. 新增** Quick 路径的 3 问表单 HTML（加在 `#design-chat-messages` 之前，默认隐藏）：

```html
<div id="design-quick-form"
  style="display:none;padding:14px 12px;border-bottom:1px solid #f0ebe3">
  <div style="font-size:12px;font-weight:600;color:#1c1917;margin-bottom:12px">快速生成 · 3 个问题</div>

  <div style="margin-bottom:10px">
    <div style="font-size:11px;color:#78716c;margin-bottom:4px">你想做什么？</div>
    <select id="dqf-surface"
      style="width:100%;padding:6px 8px;border:1.5px solid #e5ddd0;border-radius:7px;font-size:12px;background:#fdfcfb">
      <option value="">请选择…</option>
      <option value="落地页">落地页</option>
      <option value="移动 App">移动 App</option>
      <option value="后台界面">后台界面</option>
      <option value="演示 PPT">演示 PPT</option>
      <option value="其他">其他</option>
    </select>
  </div>

  <div style="margin-bottom:10px">
    <div style="font-size:11px;color:#78716c;margin-bottom:4px">主要给谁看？</div>
    <input id="dqf-audience" type="text" placeholder="如：投资人、消费者、内部团队"
      style="width:100%;padding:6px 8px;border:1.5px solid #e5ddd0;border-radius:7px;
        font-size:12px;background:#fdfcfb;box-sizing:border-box">
  </div>

  <div style="margin-bottom:14px">
    <div style="font-size:11px;color:#78716c;margin-bottom:4px">视觉感觉？</div>
    <select id="dqf-direction"
      style="width:100%;padding:6px 8px;border:1.5px solid #e5ddd0;border-radius:7px;font-size:12px;background:#fdfcfb">
      <option value="">请选择…</option>
      <option value="简洁现代">简洁现代</option>
      <option value="温暖亲切">温暖亲切</option>
      <option value="科技感">科技感</option>
      <option value="高端品牌">高端品牌</option>
    </select>
  </div>

  <button onclick="submitDesignQuickForm()"
    style="width:100%;padding:8px;background:#c94c2e;color:#fff;border:none;border-radius:8px;
      font-size:12px;font-weight:600;cursor:pointer">生成</button>
</div>
```

**5. 新增 JS 函数**：

```javascript
function showDesignEntryDialog() {
  const dialog = document.getElementById('design-entry-dialog');
  if (dialog) {
    dialog.style.display = 'flex';
    // 确保 design chat 面板可见（dialog 叠在上方）
    const chatPanel = document.getElementById('midtai-design-chat');
    if (chatPanel) chatPanel.style.display = 'flex';
  }
}

function hideDesignEntryDialog() {
  const dialog = document.getElementById('design-entry-dialog');
  if (dialog) dialog.style.display = 'none';
}

function chooseDesignEntryPath(path) {
  hideDesignEntryDialog();
  if (path === 'quick') {
    const form = document.getElementById('design-quick-form');
    if (form) form.style.display = 'block';
  } else {
    // detailed: 触发 AI 首轮问题
    send({ type: 'design:chat:send', prompt: '__trigger_discovery__' });
  }
}

function submitDesignQuickForm() {
  const surface   = document.getElementById('dqf-surface')?.value;
  const audience  = document.getElementById('dqf-audience')?.value?.trim();
  const direction = document.getElementById('dqf-direction')?.value;
  if (!surface || !audience || !direction) {
    alert('请填写全部 3 个问题');
    return;
  }
  const form = document.getElementById('design-quick-form');
  if (form) form.style.display = 'none';
  const prompt = `我想做一个${surface}，主要给${audience}看，视觉风格是${direction}。`;
  send({ type: 'design:chat:send', prompt });
}
```

**6. 改造 `setMidtaiDesignMode()` 或 midtai 设计 tab 入口逻辑**：

```javascript
// 进入设计 tab 时：
// - 如果有进行中的 design session → 跳过弹框，加载历史
// - 如果无 design session → 显示弹框
function onMidtaiDesignTabOpen() {
  // 检查是否已有 design session（通过 host 状态或 midtaiState.currentDesignSessionId）
  const hasSession = !!midtaiState.currentDesignSessionId;
  if (hasSession) {
    send({ type: 'design:chat:load-history' });
  } else {
    showDesignEntryDialog();
  }
}
```

**7. 新增「新建设计」按钮**（在 design chat 面板顶部区域，替换原来可能存在的标题区）：

```html
<div style="padding:8px 12px;border-bottom:1px solid #f0ebe3;display:flex;
  align-items:center;justify-content:space-between;flex-shrink:0">
  <span style="font-size:12px;font-weight:600;color:#78716c">设计对话</span>
  <button onclick="resetDesignSession()"
    style="font-size:11px;color:#78716c;background:none;border:none;cursor:pointer;padding:2px 6px">
    新建设计
  </button>
</div>
```

```javascript
function resetDesignSession() {
  // 清空当前 design session，重新弹出入口弹框
  midtaiState.currentDesignSessionId = null;
  const container = document.getElementById('design-chat-messages');
  const empty = document.getElementById('design-chat-empty');
  if (container) {
    Array.from(container.children).forEach(c => {
      if (c.id !== 'design-chat-empty') c.remove();
    });
  }
  if (empty) empty.style.display = '';
  showDesignEntryDialog();
  send({ type: 'design:session:reset' });  // host 侧退出当前 design session
}
```

---

### electron/ElectronChatPanel.ts

**新增路由**：

```typescript
if (type === 'design:session:reset') {
  // 退出当前 design session，回到 no-session 状态
  // 不删除历史，只解除 currentSessionId 与 design 的绑定
  // 下次 design:chat:send 时会新建
  this.currentSessionId = null;
  await this.postState();
  return;
}
```

**改造 `handleDesignChatSend()`**：
当 prompt 为 `'__trigger_discovery__'` 时，发一条系统 trigger，让 AI 按 discovery prompt 发出第一个 question-form，而不是把 trigger 字符串直接追加到会话：

```typescript
private async handleDesignChatSend(message: Record<string, unknown>): Promise<void> {
  const rawPrompt = String(message.prompt ?? '');
  const isDiscoveryTrigger = rawPrompt === '__trigger_discovery__';
  const prompt = isDiscoveryTrigger ? '' : rawPrompt;

  // ... 原有 session 创建 / 切换逻辑 ...

  if (!isDiscoveryTrigger) {
    const userMsg = await this.appendUserMessageToSession(this.currentSessionId!, prompt);
    this.sendToRenderer({ type: 'design:chat:append', msg: { ...userMsg, kind: 'text' } });
  }

  await this.handleDesignChatLane({
    prompt: isDiscoveryTrigger ? '' : prompt,
    target: 'design-chat',
    triggerDiscovery: isDiscoveryTrigger,
  });
}
```

---

## 验收标准

1. 进入设计 tab（无 session）→ 弹框出现，显示两个大按钮
2. 点「快速生成一稿」→ 弹框消失，3 问表单出现
3. 填完 3 问点「生成」→ 表单消失，prompt 发送，AI 开始回复
4. 点「先聊需求，再生成」→ 弹框消失，AI 发出 discovery question-form
5. 再次进入设计 tab（有进行中 session）→ 不弹弹框，直接加载历史
6. 点「新建设计」→ 清空对话，重新弹出弹框
7. **不存在** 小白/专业 tab 按钮
8. 主 chat 侧边栏 design session 点击 → 进 midtai 设计页（p1-p4 已覆盖，回归验证即可）
9. `npm run build:electron` + renderer JS syntax check 通过

---

## Out of scope

- 不改 design chat IPC 协议（已由 p1-p4 实现）
- 不改 discovery question-form 内容（`buildDesignChatSystemPrompt` 已有）
- 不做 3 问表单内容的 AI 个性化（静态选项即可）
- 不做方向选择器（OD 复刻放后续 issue）
- artifact 入库逻辑由 pul 任务处理

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `electron/renderer/index.html` | 高 | 弹框 + 3 问表单 + JS 函数 + tab 入口逻辑 |
| `electron/ElectronChatPanel.ts` | 低 | design:session:reset + __trigger_discovery__ 处理 |
