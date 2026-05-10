# Task Primer: vscode-extension-crs — Hooks: WorktreeCreate + WorktreeRemove 触发点

> **Session entry point.** Read this first.

## Task Goal

官方 HOOK_EVENTS 中 `WorktreeCreate` 和 `WorktreeRemove` 在 KainClaw 缺失。

- `WorktreeCreate`：用户通过 `EnterWorktree` 工具成功创建 worktree 后触发
- `WorktreeRemove`：用户通过 `ExitWorktree` 工具以 `action: "remove"` 成功删除 worktree 后触发

触发点在 `agentRunner.ts` 的 PostToolCall 之后，按 toolName 判断，**不需要改 ToolContext 或 worktree/runtime.ts**。

## Out of Scope

- 不改 hooksExecutor.ts 的执行逻辑
- 不改 ToolContext 类型
- 不改 worktree/runtime.ts
- 不改 Electron 文件

## Next Step

### Step 1：HookEvent 类型扩展（hooksExecutor.ts）

在当前末尾追加：
```typescript
  | "WorktreeCreate"
  | "WorktreeRemove"
```

### Step 2：SUPPORTED_HOOK_EVENTS 更新（hooksRegistry.ts）

追加：
```typescript
{ id: "WorktreeCreate", summary: "When a worktree is created via EnterWorktree." },
{ id: "WorktreeRemove", summary: "When a worktree is removed via ExitWorktree." },
```

### Step 3：alias map 更新（hooksTrigger.ts）

追加：
```typescript
WorktreeCreate: ["WorktreeCreate"],
WorktreeRemove: ["WorktreeRemove"],
```

### Step 4：触发点接线（agentRunner.ts）

定位：PostToolCall 成功路径的 triggerHooks 调用（约第 474 行）之后。

在 PostToolCall 触发块结束后，追加 worktree 专用触发逻辑：

```typescript
// PostToolCall 触发块结束后（约 line 494）：
if (activeInstalledSkillHooks.length > 0) {
  if (toolCall.name === "EnterWorktree") {
    await triggerHooks(
      "WorktreeCreate",
      activeInstalledSkillHooks,
      {
        workspaceRoot: toolContext.workspaceRoot,
        toolName: toolCall.name,
        toolInput: toolCall.input,
      },
      createInstalledSkillHookAgentRunner({
        provider: activeProvider,
        toolContext,
        tools: activeTools,
        providerRuntimeContext: activeProviderRuntimeContext,
      }),
    );
  } else if (
    toolCall.name === "ExitWorktree" &&
    toolCall.input &&
    typeof toolCall.input === "object" &&
    !Array.isArray(toolCall.input) &&
    (toolCall.input as Record<string, unknown>).action === "remove"
  ) {
    await triggerHooks(
      "WorktreeRemove",
      activeInstalledSkillHooks,
      {
        workspaceRoot: toolContext.workspaceRoot,
        toolName: toolCall.name,
        toolInput: toolCall.input,
      },
      createInstalledSkillHookAgentRunner({
        provider: activeProvider,
        toolContext,
        tools: activeTools,
        providerRuntimeContext: activeProviderRuntimeContext,
      }),
    );
  }
}
```

**注意：**
- 这段代码放在 PostToolCall 成功路径的 `if (activeInstalledSkillHooks.length > 0)` 块之后，不是在 catch 块里
- WorktreeRemove 只在 `action === "remove"` 时触发；`action === "keep"` 不触发
- 用 `typeof toolCall.input === "object" && !Array.isArray(toolCall.input)` 做类型守卫

## Verification

```bash
npm test
npm run check
npm run build
```

## Risk Points

- 只在成功路径触发，不在 catch 块里触发（worktree 创建/删除失败不触发这两个事件）
- WorktreeRemove 的 action 判断需要类型守卫，避免 TS 报错
- 这两个事件只对 `activeInstalledSkillHooks` 触发（和 PostToolCall 保持一致）

## High-Risk Files

- `src/hooks/hooksExecutor.ts`
- `src/hooksRegistry.ts`
- `src/hooks/hooksTrigger.ts`
- `src/agent/agentRunner.ts`

## Definition of Done

- [ ] `EnterWorktree` 工具调用成功后 `WorktreeCreate` 触发
- [ ] `ExitWorktree` 工具以 `action: "remove"` 调用成功后 `WorktreeRemove` 触发
- [ ] `ExitWorktree` 以 `action: "keep"` 调用时 `WorktreeRemove` 不触发
- [ ] `npm test` 通过
- [ ] `npm run check` 通过
- [ ] `npm run build` 通过
