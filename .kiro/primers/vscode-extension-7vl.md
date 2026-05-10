# Task Primer: vscode-extension-7vl — Hooks: SubagentStart/Stop + TaskCreated/TaskCompleted 触发点

> **Session entry point.** Read this first.

## Task Goal

官方 HOOK_EVENTS 中的以下四个事件在 KainClaw 完全缺失：

- `SubagentStart`：子代理（review/verify/built-in agent）开始时触发
- `SubagentStop`：子代理结束时触发（成功或失败均触发）
- `TaskCreated`：后台任务注册成功时触发
- `TaskCompleted`：后台任务成功完成时触发

触发点集中在 `backgroundTaskHost.ts` 的 `runBuiltInAgentSession`，通过给 `BuiltInAgentSessionOptions` 加可选 `hooks?`/`sessionId?` 字段实现，**不强制更新所有调用方**。

## Out of Scope

- 不改 hooksExecutor.ts 的执行逻辑
- 不处理 PermissionRequest / PermissionDenied（需要 Electron UI，另议）
- 不改 Electron 文件

## Next Step

### Step 1：HookEvent 类型扩展（hooksExecutor.ts）

在当前末尾追加四个：
```typescript
  | "SubagentStart"
  | "SubagentStop"
  | "TaskCreated"
  | "TaskCompleted"
```

### Step 2：SUPPORTED_HOOK_EVENTS 更新（hooksRegistry.ts）

追加：
```typescript
{ id: "SubagentStart", summary: "When a built-in agent session begins." },
{ id: "SubagentStop", summary: "When a built-in agent session ends (success or failure)." },
{ id: "TaskCreated", summary: "When a background task is registered." },
{ id: "TaskCompleted", summary: "When a background task completes successfully." },
```

### Step 3：alias map 更新（hooksTrigger.ts）

在现有 alias map 末尾追加：
```typescript
SubagentStart: ["SubagentStart"],
SubagentStop: ["SubagentStop"],
TaskCreated: ["TaskCreated"],
TaskCompleted: ["TaskCompleted"],
```

### Step 4：BuiltInAgentSessionOptions 类型扩展（backgroundTaskHost.ts）

在 `BuiltInAgentSessionOptions<TResult>` 类型（约第 24 行）中加两个可选字段：
```typescript
hooks?: import("./hooksRegistry").HookDefinition[];
sessionId?: string;
```

同时在文件顶部补充导入：
```typescript
import { triggerHooks } from "./hooks/hooksTrigger";
```

### Step 5：在 runBuiltInAgentSession 中接线四个触发点（backgroundTaskHost.ts）

定位 `runBuiltInAgentSession`（约第 261 行），在现有逻辑里找四个触发位置：

```typescript
async runBuiltInAgentSession<TResult>(
  options: BuiltInAgentSessionOptions<TResult>,
): Promise<TResult> {
  const hooks = options.hooks ?? [];
  const hookCtx = {
    workspaceRoot: options.workspaceRoot,
    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
  };

  // ...（registerBackgroundTask 调用，约 line 268）
  await taskRuntime.registerBackgroundTask({ ... });

  // TaskCreated：任务注册成功后
  if (hooks.length > 0) {
    await triggerHooks("TaskCreated", hooks, {
      ...hookCtx,
      toolName: options.taskId,
      toolInput: { agentType: options.agentType, description: options.taskDescription },
    });
  }

  options.onBeforeRun?.();

  try {
    // SubagentStart：run() 调用前
    if (hooks.length > 0) {
      await triggerHooks("SubagentStart", hooks, {
        ...hookCtx,
        toolName: options.agentType,
        toolInput: { taskId: options.taskId },
      });
    }

    const result = await options.run({ ... }, abortController.signal);

    // SubagentStop（成功）：run() 完成后
    if (hooks.length > 0) {
      await triggerHooks("SubagentStop", hooks, {
        ...hookCtx,
        toolName: options.agentType,
        toolOutput: { taskId: options.taskId, status: "success" },
      });
    }

    // ...（finalizeSuccess + updateBackgroundTask，约 line 313-345）
    const finalStatus = ...;
    await taskRuntime.updateBackgroundTask(...);

    // TaskCompleted：updateBackgroundTask 完成后
    if (hooks.length > 0) {
      await triggerHooks("TaskCompleted", hooks, {
        ...hookCtx,
        toolName: options.taskId,
        toolOutput: { agentType: options.agentType, status: finalStatus },
      });
    }

    // ...（onSuccess, skillDistill 等）
    return result;

  } catch (error) {
    // SubagentStop（失败）：catch 里
    if (hooks.length > 0) {
      await triggerHooks("SubagentStop", hooks, {
        ...hookCtx,
        toolName: options.agentType,
        toolOutput: { taskId: options.taskId, status: "error" },
      });
    }

    // ...（原有 updateBackgroundTask + onFailure 逻辑，不变）
    throw error;
  }
}
```

**注意：** SubagentStop 要在 try 的成功路径和 catch 的失败路径各触发一次，不能只加一处。

### Step 6：更新关键调用方传入 hooks（promptEntryHost.ts）

搜索 `promptEntryHost.ts` 里所有调用 `backgroundTaskHost.runBuiltInAgentSession(...)` 的地方。如果调用方上下文中有 `activePromptHooks` 或已加载的 hooks 列表，追加：
```typescript
hooks: activeHooksOrUserHooks,
sessionId: currentSessionId,
```
没有 hooks 上下文的调用方**不必改**（hooks 可选，不传则 4 个事件不触发，这是预期行为）。

## Verification

```bash
npm test
npm run check
npm run build
```

## Risk Points

- SubagentStop 必须在成功和失败两条路径都触发
- hooks 和 sessionId 是可选字段；没有传入的调用方保持原有行为不变
- triggerHooks 导入路径：`"./hooks/hooksTrigger"`
- HookDefinition 类型导入用 `import type`（避免循环依赖）

## High-Risk Files

- `src/hooks/hooksExecutor.ts`
- `src/hooksRegistry.ts`
- `src/hooks/hooksTrigger.ts`
- `src/backgroundTaskHost.ts` — 主要改动文件

## Definition of Done

- [ ] `/review` 或 `/verify` 运行时（如果传了 hooks）SubagentStart/Stop 和 TaskCreated/Completed 触发
- [ ] SubagentStop 在 task 成功和失败路径都触发
- [ ] `npm test` 通过
- [ ] `npm run check` 通过
- [ ] `npm run build` 通过
