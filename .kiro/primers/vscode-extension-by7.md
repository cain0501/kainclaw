# Primer: vscode-extension-by7
# design chat lane + designFlowId 协议

## 任务目标

在 host 侧定义设计专用请求通道（design chat lane），并定义 `designFlowId` / project identity 协议。

保证：同一次设计对话里的追问、回答、生成、再生成、进入编辑器，始终归属同一个设计项目，自动保存时追加 version 而不是每次新建 project。

后续 B（prompt 改造）、C（inline question-form）、D（autosave）任务都依赖本任务定义的协议。

---

## 背景：为什么需要这个任务

### 现有架构（两套并存）

```
chat 系统                         设计生成系统（midtai）
─────────────────────────         ──────────────────────────────
sendPrompt → agent loop           design:requestDirections
renderMessages                    design:generate
artifacts-panel (HTML iframe)     designBridgeState
"进入 KainClaw Design" 按钮        设计编辑器
        ↓                                ↓
        └────────────────────────────────┘
               都写入 designProjectStore
```

两个入口都能进设计编辑器，但路径不同、状态不共享。

### 目标架构

chat 作为唯一设计生成入口，midtai 退为编辑器/作品库壳（过渡期保留，不删除）。

### 最大风险：project identity

如果不先定义 `designFlowId`，后续每次生成都会新建 project，作品库会爆炸。必须先解决"同一次设计对话 = 同一个 design project"的绑定问题。

---

## 现有代码关键位置

### ElectronChatPanel.ts（高风险文件）

- `private currentDesignProjectId: string | undefined` (line ~335)
  - 当前设计项目 ID，但只在 midtai 路径下被设置
  - 没有与 chat session 绑定

- `private pendingQuestion: PendingQuestionState | undefined` (line ~336)
  - 宿主级审批弹层，**不是**设计问答流
  - 不能复用为 design question-form 通道

- `design:requestDirections` handler (line ~1014)
  - 调用 `requestDesignDirections(message)`
  - 独立 IPC 通道，绕开 chat 系统

- `design:generate` handler (line ~999)
  - 调用 `generateDesignWorkbench(message)`
  - 独立 IPC 通道，绕开 chat 系统

- `generateDesignWorkbench()` (line ~3303)
  - 直接调用 `generateKainClawDesign(provider, options)`
  - 用 `buildKainClawDesignSystemPrompt()` 构建 system prompt
  - 生成后写入 `designVersionStore`

- `currentDesignProjectId` 的设置逻辑 (line ~3001)
  - 只在 `openDesignProject()` 时设置
  - 没有与 chat session / conversation 绑定

### index.html（高风险文件）

- `designBridgeState`（line ~2201）：midtai 设计生成的状态机，独立于 chat
- `generateDesignWorkbench()`（line ~6752）：renderer 侧触发设计生成
- `sendPrompt()`（line ~5570）：chat 系统的发送入口

### src/design/designPrompt.ts（高风险文件）

- `buildKainClawDesignSystemPrompt()`：构建设计专用 system prompt
- `buildKainClawDesignUserPrompt()`：构建用户 prompt
- 当前 skill patches 是硬编码约束列表（B 任务改造）

---

## 本任务需要做的事

### 1. 定义 designFlowId 数据结构

在 `ElectronChatPanel.ts` 中，为每个 chat session 增加 design flow 状态：

```typescript
interface DesignFlowState {
  flowId: string;           // 唯一标识，绑定到 chat session
  projectId: string;        // 对应 designProjectStore 中的 project
  conversationId?: string;  // 可选：绑定到具体 conversation
  createdAt: number;
}
```

- `flowId` 格式建议：`design-flow-${sessionId}-${timestamp}`
- 存储位置：`SessionRuntimeState`（已有的 session 持久化机制）

### 2. 定义 design lane 标记协议

在 renderer → host 的消息协议中，增加 design lane 标记：

```typescript
// renderer 发送设计请求时携带 lane 标记
{
  type: 'sendPrompt',
  prompt: '...',
  lane: 'design',           // 新增：标记这是设计请求
  designFlowId?: string,    // 新增：如果已有 flow，传入复用
}
```

host 侧收到 `lane: 'design'` 时：
- 如果 `designFlowId` 存在且有效 → 复用已有 project，追加 version
- 如果不存在 → 创建新 `DesignFlowState`，新建 design project

### 3. 在 SessionRuntimeState 中持久化 designFlowState

```typescript
// 现有 SessionRuntimeState 扩展
interface SessionRuntimeState {
  // ... 现有字段
  designFlowState?: DesignFlowState;  // 新增
}
```

- `loadSessionRuntimeState()` / `saveCurrentSessionRuntimeState()` 自动携带
- session 切换时，`designFlowState` 随 session 切换

### 4. host 侧路由逻辑

在 `handleRendererMessage()` 中，`sendPrompt` 消息处理增加分支：

```typescript
if (type === 'sendPrompt' && message.lane === 'design') {
  await this.handleDesignChatLane(message);
  return;
}
// 否则走现有普通 chat 路径
```

`handleDesignChatLane()` 是新方法，本任务只需要：
- 解析/创建 `designFlowState`
- 将 `designFlowId` 和 `projectId` 注入后续调用上下文
- 实际的 LLM 调用和 question-form 处理留给 B/C 任务

### 5. renderer 侧：design lane 入口

在 `index.html` 中，专业模式的"生成设计"按钮改为走 design lane：

```javascript
// 专业模式触发设计生成
send({
  type: 'sendPrompt',
  prompt: prompt,
  lane: 'design',
  designFlowId: currentDesignFlowId || undefined,
});
```

`currentDesignFlowId` 从 host 返回的 state 中读取（host 创建 flow 后通知 renderer）。

---

## 验收标准

1. `SessionRuntimeState` 中有 `designFlowState` 字段，可被持久化和恢复
2. renderer 发送 `{ type: 'sendPrompt', lane: 'design' }` 时，host 能识别并路由到 design lane
3. 同一个 chat session 内，第二次发送 design 请求时，`designFlowId` 被复用（不新建 project）
4. 切换 chat session 后，`designFlowState` 随 session 切换（不同 session 有独立的 flow）
5. 现有 midtai 路径（`design:requestDirections` / `design:generate`）不受影响

---

## Out of scope（本任务不做）

- 不实现 LLM 调用（B 任务）
- 不实现 question-form 渲染（C 任务）
- 不实现 artifact 自动入库（D 任务）
- 不删除 midtai 老入口
- 不做 index.html 全量组件化重构
- 不重写 artifact panel
- 不改造 `buildKainClawDesignSystemPrompt()`（B 任务）

---

## 高风险文件

| 文件 | 风险 | 说明 |
|------|------|------|
| `electron/ElectronChatPanel.ts` | 高 | 核心 host 逻辑，改动影响所有 IPC 消息处理 |
| `electron/renderer/index.html` | 高 | 12k 行单文件，改动容易引入回归 |
| `src/design/designPrompt.ts` | 低（本任务） | B 任务才改造，本任务只读 |

---

## 实现建议

1. **先写类型定义**：`DesignFlowState` interface，`SessionRuntimeState` 扩展，lane 消息类型
2. **再写 host 路由**：`handleDesignChatLane()` 骨架，只做 flow 创建/复用，不做 LLM 调用
3. **再写 renderer 入口**：专业模式按钮改为发送 `lane: 'design'`，保留 midtai 路径作为 fallback
4. **写测试**：`ElectronChatPanel.test.ts` 中验证 flow 创建、复用、session 切换行为

新逻辑必须抽成独立方法/模块，不能继续把逻辑塞进现有的大函数里。
