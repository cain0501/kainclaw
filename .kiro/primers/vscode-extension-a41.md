# Task Primer: vscode-extension-a41 — Hooks: PostToolUseFailure + PreCompact + PostCompact 触发点

> **Session entry point.** Read this first.

## Task Goal

补齐三个官方 HOOK_EVENTS 的类型定义 + 触发点接线：

- `PostToolUseFailure`：工具执行失败时触发（官方: 区别于成功时的 PostToolUse）
- `PreCompact`：context compact 开始前触发
- `PostCompact`：context compact 完成后触发

## Out of Scope

- 不改 hooksExecutor.ts 的执行逻辑
- 不扩大 agentRunner.ts 里 user hooks 的穿透范围（已知 gap，单独任务）
- 不改 Electron 文件

## Next Step

### Step 1：HookEvent 类型扩展（hooksExecutor.ts）

在当前 HookEvent union 末尾追加三个（在 ahb 任务的基础上，确认 Stop/SessionEnd/UserPromptSubmit 已存在）：

```typescript
  | "PostToolUseFailure"
  | "PreCompact"
  | "PostCompact"
```

### Step 2：SUPPORTED_HOOK_EVENTS 更新（hooksRegistry.ts）

追加：
```typescript
{ id: "PostToolUseFailure", summary: "After a tool execution fails." },
{ id: "PreCompact", summary: "Before context compaction begins." },
{ id: "PostCompact", summary: "After context compaction completes." },
```

### Step 3：PostToolUseFailure 触发（agentRunner.ts）

定位：catch 块（约第 530 行），现在已有一个 `PostToolCall` triggerHooks 调用（在错误路径上）。

在该 `PostToolCall` 调用之后，追加 `PostToolUseFailure`：

```typescript
} catch (error) {
  const msg = error instanceof Error ? error.message : String(error);
  if (activeInstalledSkillHooks.length > 0) {
    await triggerHooks(
      "PostToolCall",            // 保留：向后兼容
      activeInstalledSkillHooks,
      { workspaceRoot: ..., toolName: ..., toolInput: ..., toolOutput: msg, reply: msg },
      createInstalledSkillHookAgentRunner(...),
    );
    await triggerHooks(
      "PostToolUseFailure",      // 新增：官方错误专用事件
      activeInstalledSkillHooks,
      { workspaceRoot: ..., toolName: ..., toolInput: ..., toolOutput: msg },
      createInstalledSkillHookAgentRunner(...),
    );
  }
  // ...
```

直接复制 PostToolCall 调用块，改事件名为 `PostToolUseFailure`，移除 `reply` 字段即可（错误路径 reply 无意义）。

### Step 4：PreCompact / PostCompact 触发（compactHost.ts）

**4a. 扩展 SharedCompactionHostOptions 类型（约第 96 行）**

在 `SharedCompactionHostOptions` 中追加可选字段：
```typescript
type SharedCompactionHostOptions = {
  // ... 现有字段 ...
  hooks?: import("./hooksRegistry").HookDefinition[];
  sessionId?: string;
};
```

**4b. 在 performConversationCompactionWithHost 中触发（约第 156 行）**

导入：
```typescript
import { triggerHooks } from "./hooks/hooksTrigger";
```

在 `return performConversationCompaction({...})` 改写为：

```typescript
export async function performConversationCompactionWithHost(
  options: SharedCompactionHostOptions & { ... },
): Promise<CompactConversationResult> {
  const hookCtx = {
    workspaceRoot: options.workspaceRoot,
    sessionId: options.sessionId,
  };
  const hooks = options.hooks ?? [];

  if (hooks.length > 0) {
    await triggerHooks("PreCompact", hooks, hookCtx);
  }

  const result = await performConversationCompaction({ ... });  // 现有逻辑不变

  if (hooks.length > 0) {
    await triggerHooks("PostCompact", hooks, {
      ...hookCtx,
      toolOutput: result.wasCompacted
        ? { tokensBefore: result.estimatedTokensBefore, tokensAfter: result.estimatedTokensAfter }
        : undefined,
    });
  }

  return result;
}
```

**4c. 同样处理 handleCompactCommandWithHost（约第 352 行）**

该函数委托给 `handleCompactCommand`，而 `handleCompactCommand` 调用 `performConversationCompaction`（低层）。最简单做法：在 `handleCompactCommandWithHost` 里调用 `handleCompactCommand` 之前/之后 也触发 Pre/PostCompact，使用同样的 `options.hooks` 和 `options.sessionId`。

**4d. 调用方（extension.ts / promptFlowHost.ts）**

找所有调用 `performConversationCompactionWithHost` 和 `handleCompactCommandWithHost` 的地方，补充传入：
```typescript
hooks: activePromptHooks,   // 或当时可用的 hook 列表
sessionId: currentSessionId,
```

如果调用方没有 hooks 上下文（测试环境等），不传即可（字段是可选的）。

## Verification

```bash
npm test
npm run check
npm run build
```

## Risk Points

- PostToolUseFailure 要在 catch 块里，PostToolCall（成功路径，约第 474 行）不要动
- compactHost.ts 引入 triggerHooks 后，确认导入路径正确（相对路径 `"./hooks/hooksTrigger"`）
- HookDefinition 的类型导入用 `import type` 避免循环依赖

## High-Risk Files

- `src/hooks/hooksExecutor.ts`
- `src/hooksRegistry.ts`
- `src/agent/agentRunner.ts`
- `src/compactHost.ts`

## Definition of Done

- [ ] 工具执行抛异常时 `PostToolUseFailure` 触发
- [ ] `/compact` 或 auto-compact 时 `PreCompact` / `PostCompact` 触发
- [ ] `npm test` 通过
- [ ] `npm run check` 通过
- [ ] `npm run build` 通过
