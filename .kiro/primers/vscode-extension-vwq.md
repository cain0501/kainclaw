# Task Primer: vscode-extension-vwq — Hooks: 支持官方事件名 PreToolUse/PostToolUse + 补 Notification/SessionStart

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

官方 Claude Code 使用 `PreToolUse` / `PostToolUse` 作为 hook 事件名，KainClaw 用 `PreToolCall` / `PostToolCall`。
用户从官方文档复制的 hook 配置放到 KainClaw 里不会触发。

官方还有 `Notification`（Claude 产出回复时）和 `SessionStart`（session ready 时）两个常用事件，KainClaw 完全没有。

本任务：
1. 加 `PreToolUse` / `PostToolUse` 作为 `PreToolCall` / `PostToolCall` 的别名
2. 加 `Notification` 事件，在 Claude 回复完成后触发
3. 加 `SessionStart` 事件，在 session ready 后触发

**前置条件：** vscode-extension-lca 应先完成（用户 hook 接入触发链），否则新事件加了也不会触发。但两个任务可以同时实施，只要 lca 先合并。

## Out of Scope

- 不读 settings.json（官方格式）—— 只改 `.cain/hooks.json` 的兼容性
- 不删除 PreToolCall / PostToolCall —— 只加别名，向后兼容
- 不加 Stop/SessionEnd/SubagentStart 等其他事件（单独任务）
- 不改 Electron 文件

## Already Completed

（无）

## Next Step (the ONLY thing to do this session)

### Step 1：HookEvent 类型扩展（hooksExecutor.ts）

```typescript
// 从：
export type HookEvent = "PreToolCall" | "PostToolCall" | "PrePrompt" | "PostPrompt";

// 改为：
export type HookEvent =
  | "PreToolCall" | "PostToolCall" | "PrePrompt" | "PostPrompt"  // 原有
  | "PreToolUse" | "PostToolUse"                                  // 官方别名
  | "Notification"                                                // 新增
  | "SessionStart";                                               // 新增
```

### Step 2：resolveMatchQuery 处理别名（hooksTrigger.ts）

```typescript
function resolveMatchQuery(event: HookEvent, context: ...): string[] {
  switch (event) {
    case "PreToolCall":
    case "PreToolUse":       // 别名
    case "PostToolCall":
    case "PostToolUse":      // 别名
      return getToolMatcherCandidates(context.toolName);
    default:
      return [];
  }
}
```

同时在 `triggerHooks` 的过滤逻辑里，使用别名展开：当 hook 的 events 包含 `PreToolUse` 时，它应该匹配 `PreToolCall` 触发点，反之亦然。

实现方案：在 `triggerHooks` 里加一个别名映射：
```typescript
const ALIAS_MAP: Record<string, string[]> = {
  "PreToolCall": ["PreToolUse"],
  "PreToolUse": ["PreToolCall"],
  "PostToolCall": ["PostToolUse"],
  "PostToolUse": ["PostToolCall"],
};
// 过滤时：hook.events.includes(event) || (ALIAS_MAP[event] ?? []).some(alias => hook.events.includes(alias))
```

### Step 3：触发 Notification 事件

在 `promptFlowHost.ts` 的 PostPrompt 触发后，再触发一次 `Notification`，payload 带 reply 文本：

```typescript
// 在 PostPrompt triggerHooks 之后：
await triggerHooks("Notification", allHooks, { ...context, reply: finalReply });
```

（allHooks = installedSkillHooks + 用户 hook，依赖 lca 完成）

### Step 4：触发 SessionStart 事件

在 `readySequenceHost.ts` 的 ready 完成回调（或 extension.ts 里 session ready 后），触发：

```typescript
await triggerHooks("SessionStart", sessionHooks, { workspaceRoot, sessionId });
```

### Step 5：SUPPORTED_HOOK_EVENTS 同步更新（hooksRegistry.ts）

在 UI 可见列表里加上：
- `{ id: "PreToolUse", summary: "Before tool execution (official alias for PreToolCall)." }`
- `{ id: "PostToolUse", summary: "After tool execution (official alias for PostToolCall)." }`
- `{ id: "Notification", summary: "After Claude produces a response." }`
- `{ id: "SessionStart", summary: "When a session becomes ready." }`

## Verification

```bash
npm test
npm run check
npm run build
```

## Risk Points

- 别名逻辑必须双向：PreToolUse 触发时匹配 PreToolCall 配置的 hook，反之亦然
- Notification 触发点需要 reply 内容，确认 PostPrompt 完成后 reply 可得
- SessionStart 触发点在 ready 完成后，确认 workspaceRoot 可得

## High-Risk Files Touched

- `src/hooks/hooksExecutor.ts` — HookEvent 类型
- `src/hooks/hooksTrigger.ts` — resolveMatchQuery + 别名过滤逻辑
- `src/promptFlowHost.ts` — Notification 触发点
- `src/readySequenceHost.ts` — SessionStart 触发点

## Reference (only load if stuck)

- 官方事件定义：`E:\claudecodejingiang\src\entrypoints\sdk\coreTypes.ts`（HOOK_EVENTS 常量）
- Beads: `bd show vscode-extension-vwq`

## Definition of Done

- [ ] 配置 `events: ["PreToolUse"]` 的 hook，工具调用时触发
- [ ] 配置 `events: ["Notification"]` 的 hook，Claude 回复后触发
- [ ] 配置 `events: ["SessionStart"]` 的 hook，session ready 后触发
- [ ] `npm test` 通过
- [ ] `npm run check` 通过
- [ ] `npm run build` 通过
