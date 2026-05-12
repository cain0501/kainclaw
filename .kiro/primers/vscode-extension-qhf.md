# Task Primer: vscode-extension-qhf — SleepTool: 自主循环等待工具

> **Session entry point.** Read this first.

## Task Goal

在 KainClaw 里新增 `Sleep` 工具，让模型可以等待指定时长后继续执行，不占用 shell 进程。

对标官方 `SleepTool`。主要用于自主循环场景：等待构建完成、轮询外部状态、按用户要求暂停等。

**本次交付范围（MVP）：**
- 新增 `Sleep` 工具，接受 `duration`（必填，毫秒数）
- 基于 `setTimeout` 实现，不使用 shell
- 支持 `abortSignal` 中断（用户取消时提前返回）
- 不实现：tick 提示、progress indicator

## Out of Scope

- 官方的 `<tick>` 周期检查机制（那是 REPL scheduler 层的功能）
- 最大等待时长超过 5 分钟（超过 prompt cache TTL 无意义）
- 并发安全（模型应避免并发调用 Sleep）

## High-Risk Files

- `src/toolRuntime.ts` — 新增 `Sleep` handler + 工具定义

## 官方参考

- `E:\claudecodejingiang\src\tools\SleepTool\prompt.ts` — 完整描述

## 实现步骤

### Step 1：Sleep handler

在 toolRuntime.ts 的 handlers 对象里新增：

```typescript
async Sleep(input, _context) {
  const duration = typeof input.duration === "number"
    ? Math.max(0, Math.min(input.duration, 300_000))
    : 0;

  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, duration);
    if (_context.abortSignal) {
      _context.abortSignal.addEventListener("abort", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    }
  });

  return {
    summary: `Slept for ${duration}ms`,
    content: `Waited ${duration}ms.`,
  };
},
```

### Step 2：工具定义

在工具定义数组里新增：

```typescript
{
  name: "Sleep",
  description: `Wait for a specified duration in milliseconds.

Use this when:
- Waiting for a background process or build to complete
- Polling for state that's about to change
- Following user instruction to pause

Prefer this over PowerShell(Start-Sleep ...) — it does not hold a shell process.

Maximum duration: 300000ms (5 minutes). Longer sleeps waste prompt cache TTL.`,
  input_schema: {
    type: "object",
    properties: {
      duration: {
        type: "number",
        description: "Duration to wait in milliseconds (max 300000).",
      },
    },
    required: ["duration"],
  },
  annotations: {
    readOnlyHint: true,
    title: "Wait",
  },
},
```

## 关键实现细节

1. **上限 300_000ms（5 分钟）**：官方描述里提到 prompt cache TTL 5 分钟，超过这个值睡眠没有意义，直接 clamp
2. **abortSignal 中断**：用户取消时 `resolve()` 而不是 `reject()`，避免触发错误处理
3. **不需要审批**：Sleep 无副作用，不走 `requestActionApproval`

## Already Completed

- 在 `src/toolRuntime.ts` 实现了 `Sleep` handler，包含 `setTimeout` 等待、`300_000ms` clamp、`abortSignal` 提前返回。
- 在 `src/toolRuntime.ts` 注册了 `Sleep` 工具定义。
- 在 `src/toolRuntime.test.ts` 增加了 `Sleep` 的 focused 回归测试。

## Verification

```bash
npx vitest run src/toolRuntime.test.ts src/workspaceRuntimeShell.test.ts src/workspaceRuntimeHost.test.ts src/compact/postCompactCleanup.test.ts src/compactHost.test.ts
npm run check
npm run build
```

结果：
- Focused vitest 通过（132 tests）。
- `npm run check` 通过。
- `npm run build` 通过。
- 全量 `npm test` 仍被仓库内既有无关失败阻塞：`electron/rendererMarkdown.test.ts`、`electron/rendererThinkingSummary.test.ts`、`src/design/versionStore.test.ts`、`electron/ElectronChatPanel.test.ts` 的 `__trigger_discovery__` 用例。

手动测试待 Claude/用户在桌面壳里验证：让模型调用 `Sleep(duration=2000)`，确认约 2 秒后返回。

## Definition of Done

- [x] `Sleep` handler 在 `toolRuntime.ts` 注册
- [x] 上限 300_000ms
- [x] `abortSignal` 中断支持
- [x] 不需要用户审批
- [ ] 全量 `npm test` / `npm run check` / `npm run build` 全绿
