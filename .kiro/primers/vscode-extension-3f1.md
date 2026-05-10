# Primer: vscode-extension-3f1
# midtai-p2b：分流弹框

## 阶段标记

Phase 2 / 涉及 host + renderer / 依赖 p1b（h82）、p1c（qj9）、c68 已完成

---

## 背景

产品决议已拍板（`midtai-unified-workbench-decision.md`，规则 3）：

> 同一个 design chat 默认只服务一个作品。
> 当前作品已生成过至少一个版本，用户又发了新 brief → 不做意图识别，直接弹分流框。

触发条件是**纯状态判断**，不是 NLP 意图识别：
- `当前 design project 有 activeVersionId（且不是 'pending-version'）` = 有正式版本
- 用户发了新 brief = `handleDesignChatSend()` 被调用

---

## 目标行为

### 触发条件

```
handleDesignChatSend() 被调用
  ↓
检查：midtaiState.currentDesignProjectId 存在
  AND 该 project 有至少一个正式版本
  ↓
弹出分流框（不直接进入 handleDesignChatLane）
```

未触发情况（直接继续，不弹框）：
- 当前没有正式作品（临时工作态）
- 当前作品尚未生成过任何版本
- 用户是在回复 question-form（prompt 以 `[form answers - discovery]` 开头）

### 分流框 UI

```
┌──────────────────────────────────────┐
│  你想如何继续？                       │
│  当前作品：[作品名称]                 │
│                                      │
│  [继续当前作品]                       │  ← 把这条 brief 当对当前作品的迭代
│  [新建作品]                           │  ← 清空上下文，进入新的临时工作态
│  [基于当前作品另起一版]               │  ← 保留当前作品，新起一条对话链
│                                      │
│  取消                                │
└──────────────────────────────────────┘
```

样式：参考 mock 的弹框/overlay 设计语言（暖白背景、圆角、轻投影）。

### 三个选项的行为

| 选项 | 行为 |
|------|------|
| 继续当前作品 | 直接调 `handleDesignChatLane()`，新生成将作为当前作品的新版本 |
| 新建作品 | 先调 `handleNewTransientWork()`，再以该 brief 发送到新工作态 |
| 基于当前作品另起一版 | 新建一个以当前 project 为来源的临时工作态，然后发 brief（见下面详述） |

### 「基于当前作品另起一版」的具体行为

```
1. 新建临时工作态（同"新建作品"）
2. 在新工作态的 design chat 顶部追加一条系统提示：
   "正在基于《[原作品名]》另起一版"
3. 发送用户的 brief
```

不做"版本 fork"的底层数据操作。Phase 2 只是新建临时工作态并提供上下文提示。
真正的版本 fork 是 Phase 3 的工作。

---

## 现有代码关键位置

### electron/ElectronChatPanel.ts

**`handleDesignChatSend()`**（c68 实现，line ~1000 附近）：
这是分流判断的插入点，在调用 `handleDesignChatLane()` 之前加检查逻辑。

**`designProjectStore.getProject(projectId)`**（已有）：
用来查当前作品是否有正式版本：
```typescript
const project = await this.designProjectStore.getProject(this.currentDesignProjectId!);
const hasVersion = project?.activeVersionId && project.activeVersionId !== 'pending-version';
```

**`handleNewTransientWork()`**（p1c 新增）：
「新建作品」和「另起一版」都要调这个方法。

**新增路由**：
```typescript
if (type === 'design:diversion-choice') {
  await this.handleDiversionChoice(message);
  return;
}
```

### electron/renderer/index.html

**`sendDesignChatMessage()`**（c68 已有）：
用户发消息的入口，不改这里；分流在 host 侧触发。

**新增分流弹框 DOM**：
```html
<div id="design-diversion-modal" style="display:none;position:fixed;inset:0;...">
  <!-- 弹框内容 -->
</div>
```

**新增消息处理器**：
```javascript
if (type === 'design:show-diversion') {
  showDiversionModal(message.projectName, message.pendingPrompt);
  return;
}
```

---

## 实现要点

### 1. Host 侧：分流检查逻辑

在 `handleDesignChatSend()` 里，用户消息存入 session 之后、调 `handleDesignChatLane()` 之前插入：

```typescript
private async handleDesignChatSend(message: Record<string, unknown>): Promise<void> {
  const prompt = String(message.prompt ?? '').trim();
  if (!prompt) return;

  // 已有 design session 且是 form answers → 直接继续，不分流
  const isFormAnswer = /^\[form answers\s*-\s*discovery\]/i.test(prompt);

  if (!isFormAnswer && this.currentDesignProjectId) {
    const project = await this.designProjectStore.getProject(this.currentDesignProjectId);
    const hasVersion = project?.activeVersionId
      && project.activeVersionId !== 'pending-version';
    if (hasVersion) {
      // 存用户消息，但先不继续生成
      const userMsg = await this.appendUserMessageToSession(this.currentSessionId!, prompt);
      this.sendToRenderer({
        type: 'design:chat:append',
        msg: { messageId: userMsg.id, role: 'user', content: prompt,
               timestamp: userMsg.timestamp, kind: 'text' },
      });
      // 触发分流弹框
      this.pendingDiversionPrompt = prompt;
      this.sendToRenderer({
        type: 'design:show-diversion',
        projectName: project.name,
        pendingPrompt: prompt,
      });
      return;
    }
  }

  // 正常路径（原有逻辑）
  ...
}
```

注意：用户消息先存入 session 并回显到 design chat（让用户看到自己发的内容），再等分流选择。

### 2. Host 侧：处理分流选择

```typescript
private async handleDiversionChoice(
  message: Record<string, unknown>
): Promise<void> {
  const choice = String(message.choice ?? '');
  const prompt = this.pendingDiversionPrompt ?? '';
  this.pendingDiversionPrompt = undefined;
  if (!prompt) return;

  if (choice === 'continue') {
    // 继续当前作品：直接走 lane
    await this.handleDesignChatLane({ prompt, target: 'design-chat' });

  } else if (choice === 'new-work') {
    // 新建作品：清空上下文，然后发送
    await this.handleNewTransientWork();
    await this.handleDesignChatLane({ prompt, target: 'design-chat' });

  } else if (choice === 'fork') {
    // 另起一版：新建临时工作态，追加上下文提示，然后发送
    const originalName = this.currentDesignProjectName ?? '原作品';
    await this.handleNewTransientWork();
    // 系统提示
    this.sendToRenderer({
      type: 'design:chat:append',
      msg: {
        messageId: `fork-notice-${Date.now()}`,
        role: 'assistant',
        content: `正在基于《${originalName}》另起一版。`,
        timestamp: Date.now(),
        kind: 'text',
      },
    });
    await this.handleDesignChatLane({ prompt, target: 'design-chat' });

  } else if (choice === 'cancel') {
    // 取消：不做任何事
    this.pendingDiversionPrompt = undefined;
  }
}
```

### 3. Renderer 侧：分流弹框

```javascript
function showDiversionModal(projectName, pendingPrompt) {
  const modal = document.getElementById('design-diversion-modal');
  if (!modal) return;
  document.getElementById('diversion-project-name').textContent = projectName;
  modal.style.display = 'flex';
  modal._pendingPrompt = pendingPrompt;
}

function hideDiversionModal() {
  const modal = document.getElementById('design-diversion-modal');
  if (modal) modal.style.display = 'none';
}

function onDiversionChoice(choice) {
  hideDiversionModal();
  send({ type: 'design:diversion-choice', choice });
}
```

弹框 DOM 结构（参考 mock 设计语言）：
```html
<div id="design-diversion-modal"
  style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.35);
         z-index:9999;align-items:center;justify-content:center">
  <div style="background:#fffdfb;border-radius:16px;padding:24px 24px 20px;
              width:320px;box-shadow:0 8px 40px rgba(0,0,0,.15)">
    <div style="font-size:14px;font-weight:700;color:#1c1917;margin-bottom:4px">
      你想如何继续？
    </div>
    <div style="font-size:12px;color:#78716c;margin-bottom:18px">
      当前作品：<span id="diversion-project-name"></span>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px">
      <button class="btn-diversion-primary"
        onclick="onDiversionChoice('continue')">继续当前作品</button>
      <button class="btn-diversion-secondary"
        onclick="onDiversionChoice('new-work')">新建作品</button>
      <button class="btn-diversion-secondary"
        onclick="onDiversionChoice('fork')">基于当前作品另起一版</button>
      <button class="btn-diversion-cancel"
        onclick="onDiversionChoice('cancel')">取消</button>
    </div>
  </div>
</div>
```

---

## 与 Phase 1 的衔接

| Phase 1 已有 | Phase 2 补全 |
|------------|------------|
| `handleDesignChatSend()` 主路径 | 分流判断插入点 |
| `handleNewTransientWork()` | 「新建作品」和「另起一版」复用 |
| design chat 消息回显 | 用户消息先存再等分流（不丢失） |

---

## 验收标准

1. 当前作品无版本时发 brief → 不弹框，正常进入 design chat
2. 当前作品有正式版本时发 brief → 弹出分流框，显示作品名
3. 选「继续当前作品」→ brief 在当前作品上继续生成
4. 选「新建作品」→ 进入新临时工作态，brief 在新工作态发送
5. 选「另起一版」→ 进入新临时工作态，chat 顶部有"基于《原作品》另起一版"提示，brief 正常发送
6. 选「取消」→ 弹框关闭，不触发任何生成，用户消息已显示在 chat 里（已存入 session）
7. 回复 question-form（`[form answers - discovery]` 开头）→ 不触发分流，直接继续

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `electron/ElectronChatPanel.ts` | 高 | handleDesignChatSend 分流逻辑 + handleDiversionChoice |
| `electron/renderer/index.html` | 中 | 分流弹框 DOM + 消息处理器 |

---

## 明确不做

- 不做意图识别（触发是纯状态判断）
- 不做「另起一版」的真实版本 fork 数据操作（Phase 3）
- 不改 handleDesignChatLane 的内部逻辑
- 不改 pul 的入库流程
- 不做 session → project 底层迁移
