# P3 · Hooks 执行链

**版本**：v1.0  
**日期**：2026-04-15  
**状态**：已冻结，待实现  
**负责人**：Claude（PM + Spec）/ Kiro（实现）

---

## 一、目标

当前 Hooks 只能读取 `.cain/hooks.json` 配置，能列出 Hook 定义，但完全没有执行链。本 spec 冻结 Hooks 执行链的完整语义：触发点接线、四类 Hook 的执行逻辑、错误处理和超时控制。

---

## 二、当前状态

已完成：
- `src/hooksRegistry.ts`：读取 `.cain/hooks.json`，提供 `listHooks / getHook` 能力
- `/hooks`、`/hooks types`、`/hooks events` 命令：展示配置和类型目录
- 支持的 Hook 类型定义：Command / HTTP / Prompt / Agent

未完成：
- 没有任何触发点接线
- 没有 Hook 执行逻辑
- 没有错误处理、超时、日志

---

## 三、Hook 类型与执行语义

### 3.1 Command Hook（shell 命令）

```json
{
  "type": "command",
  "event": "PostToolCall",
  "command": "echo 'tool finished'",
  "timeout": 5000,
  "blocking": false
}
```

- 执行方式：`child_process.spawn(shell, ['-c', command])`，shell 与平台一致（win32 用 `cmd /c`）
- `blocking: true`：等待命令完成，失败时中断后续流程（仅 PreToolCall 有意义）
- `blocking: false`（默认）：fire-and-forget，错误只记日志
- `timeout`：毫秒，默认 5000，超时强制 kill 进程树

### 3.2 HTTP Hook（webhook）

```json
{
  "type": "http",
  "event": "PostPrompt",
  "url": "https://your-server.com/hooks/kain",
  "method": "POST",
  "headers": { "Authorization": "Bearer xxx" },
  "timeout": 3000,
  "blocking": false
}
```

- 执行方式：`fetch(url, { method, headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(timeout) })`
- payload 结构：`{ event, workspaceRoot, sessionId, timestamp, context: {...} }`
- 非 2xx 响应：记日志，不抛出（`blocking: false` 时）
- `blocking: true`：等待响应，非 2xx 时中断后续流程

### 3.3 Prompt Hook（注入下一次 prompt）

```json
{
  "type": "prompt",
  "event": "PrePrompt",
  "inject": "请注意：当前工作区有未提交的变更，建议先确认是否需要保存。",
  "position": "prefix"
}
```

- `position: "prefix"`：在用户 prompt 前追加
- `position: "suffix"`（默认）：在用户 prompt 后追加
- 执行方式：在 `promptCommandHost.ts` 的 prompt 预处理阶段，把 `inject` 拼入 prompt 字符串
- 此类 Hook 始终同步执行，无 timeout 概念

### 3.4 Agent Hook（派生子 Agent）

```json
{
  "type": "agent",
  "event": "PostPrompt",
  "agentRef": "code-reviewer",
  "blocking": false
}
```

- `agentRef`：引用 `.cain/agents.json` 中定义的 custom agent 名称，或内置 agent（`verification` / `review`）
- 执行方式：通过 `backgroundTaskHost.ts` 的 `runBuiltInAgentSession` / custom agent runner 派生后台任务
- `blocking: false`（默认）：fire-and-forget，任务 ID 记入日志
- `blocking: true`：等待 agent 任务完成，结果注入后续 prompt 上下文

---

## 四、触发事件

| 事件 | 触发位置 | 可用 context |
|---|---|---|
| `PreToolCall` | `toolRuntime.ts` 工具执行前 | `toolName, toolInput, workspaceRoot, sessionId` |
| `PostToolCall` | `toolRuntime.ts` 工具执行后 | `toolName, toolInput, toolOutput, duration, workspaceRoot, sessionId` |
| `PrePrompt` | `promptCommandHost.ts` prompt 预处理前 | `prompt, workspaceRoot, sessionId` |
| `PostPrompt` | `promptTurnHost.ts` 主模型回合结束后 | `prompt, reply, toolsUsed, workspaceRoot, sessionId` |

---

## 五、架构设计

### 新增文件

```
src/hooks/
├── hooksExecutor.ts     # 四类 Hook 执行器核心逻辑
├── hooksTrigger.ts      # 触发点封装：triggerHooks(event, context)
└── hooksExecutor.test.ts
```

### 修改文件

| 文件 | 改动 |
|---|---|
| `src/toolRuntime.ts` | 在工具执行前后调用 `triggerHooks("PreToolCall" / "PostToolCall", ...)` |
| `src/promptCommandHost.ts` | 在 prompt 预处理阶段调用 `triggerHooks("PrePrompt", ...)` 并处理 Prompt Hook 注入 |
| `src/promptTurnHost.ts` | 在主模型回合结束后调用 `triggerHooks("PostPrompt", ...)` |
| `src/workspaceRuntimeShell.ts` | 把 `hooksRegistry` 传给 tool context |

### hooksExecutor.ts 核心接口

```typescript
export interface HookContext {
  event: HookEvent;
  workspaceRoot: string;
  sessionId?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  prompt?: string;
  reply?: string;
}

export async function executeHook(
  hook: HookDefinition,
  context: HookContext,
): Promise<{ blocked: boolean; injected?: string }>;
```

### hooksTrigger.ts 核心接口

```typescript
export async function triggerHooks(
  event: HookEvent,
  hooks: HookDefinition[],
  context: Omit<HookContext, "event">,
): Promise<{ promptInjection?: string }>;
```

---

## 六、错误处理原则

- Command / HTTP / Agent Hook 的非 blocking 执行：捕获所有错误，只写日志，不影响主流程
- blocking Hook 执行失败：向调用方返回错误，由触发点决定是中断还是降级
- 超时：Command Hook 强制 kill 进程树；HTTP Hook 用 `AbortSignal.timeout()`；Agent Hook 超时视为 fire-and-forget 完成（不等结果）
- Hook 配置格式错误：跳过该条 Hook，记日志，不崩溃

---

## 七、安全边界

- Command Hook 的 shell 命令不做沙箱，完全信任用户配置；这是 VS Code 扩展的常规风险模型（与 tasks.json 相同）
- HTTP Hook 的 URL 不做白名单校验；用户自负其责
- Agent Hook 的 `agentRef` 必须引用存在的 agent，不存在时跳过并记日志

---

## 八、不在本 spec 范围内

- Hook 的 VS Code UI 配置面板
- Hook 执行历史 / 可观测性面板
- 远程 Hook（由远端服务器推送 Hook 定义）
- Hook 的条件表达式（if/unless 过滤）

---

## 九、验收标准

- [ ] `PreToolCall` / `PostToolCall` Hook 能在工具执行前后触发 Command 和 HTTP Hook
- [ ] `PrePrompt` Hook 的 Prompt 类型能把 inject 内容前缀/后缀到用户 prompt
- [ ] `PostPrompt` Agent Hook 能 fire-and-forget 派生后台 agent 任务
- [ ] blocking Command Hook 执行失败时，工具执行或 prompt 处理中断并返回错误
- [ ] 超时的 Command Hook 进程被强制终止，不残留僵尸进程
- [ ] 配置格式错误的 Hook 条目被跳过，不影响其他 Hook 和主流程
- [ ] `hooksExecutor.test.ts` 覆盖四类 Hook 的正常路径和错误路径
- [ ] `npm test` / `npm run check` / `npm run build` 全部通过
