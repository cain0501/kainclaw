# Task Primer: vscode-extension-ahb — Hooks: Stop + SessionEnd + UserPromptSubmit 三个官方高频事件

> **Session entry point.** Read this first.

## Task Goal

官方 HOOK_EVENTS 中 `Stop`、`SessionEnd`、`UserPromptSubmit` 是用户最常配置的三个事件，KainClaw 当前完全缺失。

- `UserPromptSubmit`：用户提交 prompt 时触发（早于 PrePrompt，携带原始 prompt 文本）
- `Stop`：Claude 完整结束一轮 turn 后触发（晚于 Notification）
- `SessionEnd`：session 关闭/重置时触发（对称 SessionStart）

## Out of Scope

- 不改 hooksExecutor.ts 的执行逻辑
- 不改 hooksTrigger.ts 的 resolveMatchQuery（这三个事件无 toolName 匹配逻辑）
- 不改 Electron 文件
- 不扩大 user hooks 在 agentRunner.ts 里的穿透范围

## Next Step

### Step 1：HookEvent 类型扩展（hooksExecutor.ts）

当前类型（第 9-17 行）：
```typescript
export type HookEvent =
  | "PreToolCall" | "PostToolCall" | "PreToolUse" | "PostToolUse"
  | "PrePrompt" | "PostPrompt"
  | "Notification"
  | "SessionStart";
```

改为（追加三个）：
```typescript
export type HookEvent =
  | "PreToolCall" | "PostToolCall" | "PreToolUse" | "PostToolUse"
  | "PrePrompt" | "PostPrompt"
  | "Notification"
  | "SessionStart"
  | "UserPromptSubmit"
  | "Stop"
  | "SessionEnd";
```

### Step 2：SUPPORTED_HOOK_EVENTS 更新（hooksRegistry.ts）

在已有 SessionStart 条目后追加：
```typescript
{ id: "UserPromptSubmit", summary: "When the user submits a prompt, before any processing." },
{ id: "Stop", summary: "When Claude finishes a complete response turn." },
{ id: "SessionEnd", summary: "When the session is closed or reset." },
```

### Step 3：UserPromptSubmit 触发（promptFlowHost.ts）

定位：`activePromptHooks` 构建后、`PrePrompt` triggerHooks 调用前（约第 820-825 行）。

```typescript
// 紧接 activePromptHooks 构建后，PrePrompt 之前：
if (activePromptHooks.length > 0) {
  await triggerHooks("UserPromptSubmit", activePromptHooks, {
    workspaceRoot: continuePromptExecution.workspaceRoot,
    prompt: effectivePrompt,
  });
}
```

注意：文件里有两处 PrePrompt 触发点，确认是主 prompt 流那处（activePromptHooks 那段，约 820 行），另一处是 prePromptHooks 段（约 203 行），那段不加 UserPromptSubmit。

### Step 4：Stop 触发（promptFlowHost.ts）

定位：Notification triggerHooks 块（约第 928-936 行）的 `if (latestReply)` 后面、整个 prompt 处理函数的末尾 `}` 之前。

```typescript
// 在 Notification 块结束后：
await triggerHooks("Stop", activePromptHooks, {
  workspaceRoot: continuePromptExecution.workspaceRoot,
});
```

Stop 无条件触发（不像 Notification 要求有 reply）。

### Step 5：SessionEnd 触发（extension.ts）

定位：找 `SessionStart` 的 triggerHooks 调用（约第 866 行）。在同一个类/作用域内，找 session 清除/重置的地方（方法名类似 `clearSession`、`resetSession`、`handleClear`、或 `dispose`）。在那里加：

```typescript
// 在 session 清除完成后：
const sessionEndHooks = [...(getSessionInstalledSkillHooks() ?? []), ...userHooks];
if (sessionEndHooks.length > 0) {
  await triggerHooks("SessionEnd", sessionEndHooks, {
    workspaceRoot: workspaceRoot ?? "",
    sessionId: currentSessionId,
  });
}
```

`userHooks` 的获取方式参照同文件 SessionStart 的实现（`loadHooks(workspaceRoot)`）。

如果 extension.ts 里确认没有明确的 session 结束回调，可以加在 `dispose()` 方法中（extension 卸载时）。

## Verification

```bash
npm test
npm run check
npm run build
```

## Risk Points

- promptFlowHost.ts 里有两处 PrePrompt 触发；只在 activePromptHooks 那段加 UserPromptSubmit，另一段不加
- Stop 无条件触发，不做 `if (latestReply)` 条件判断
- SessionEnd 触发的 hooks 列表获取方式需和 SessionStart 保持一致

## High-Risk Files

- `src/hooks/hooksExecutor.ts`
- `src/hooksRegistry.ts`
- `src/promptFlowHost.ts`
- `src/extension.ts`

## Definition of Done

- [ ] 配置 `events: ["UserPromptSubmit"]` 的 hook，提交 prompt 时触发
- [ ] 配置 `events: ["Stop"]` 的 hook，Claude 完成一轮后触发
- [ ] 配置 `events: ["SessionEnd"]` 的 hook，session 清除时触发
- [ ] `npm test` 通过
- [ ] `npm run check` 通过
- [ ] `npm run build` 通过
