# Task Primer: vscode-extension-8jn — postCompactCleanup: 压缩后状态清理

> **Session entry point.** Read this first.

## Task Goal

在 KainClaw 的 compact 流程里加入 `runPostCompactCleanup()`，对齐官方 `src/services/compact/postCompactCleanup.ts` 的模式。

官方在每次 compact（auto/manual/clear）后调用 `runPostCompactCleanup()`，清理被 compact 失效的模块级状态。KainClaw 的 micro-compact（650）已实现但缺少 `resetMicrocompactState()` 导出，且 `compactHost.ts` 里没有统一的 cleanup 调用点。

## Out of Scope

- `clearSystemPromptSections`、`clearClassifierApprovals`、`clearSpeculativeChecks`、`resetGetMemoryFilesCache` — KainClaw 没有这些系统，不实现
- SessionMemory compaction（独立 issue vscode-extension-zje）
- `/clear` 命令的 cleanup（KainClaw 目前没有 /clear 命令）

## High-Risk Files

- `src/compact/microCompact.ts` — 新增 `resetMicrocompactState()` 导出
- `src/compact/postCompactCleanup.ts` — 新建
- `src/compactHost.ts` — 调用 `runPostCompactCleanup()`

## 官方参考

- `E:\claudecodejingiang\src\services\compact\postCompactCleanup.ts` — 完整实现
- `E:\claudecodejingiang\src\services\compact\microCompact.ts` 第 130 行 — `resetMicrocompactState()`

## 当前状态分析

**`src/compact/microCompact.ts`（KainClaw）：**
- 有 `microCompactMessages()`、`shouldMicroCompact()`、`MICRO_COMPACT_CLEARED_MESSAGE` 等导出
- **缺少** `resetMicrocompactState()` — 需要新增

**`src/compactHost.ts`（KainClaw）：**
- `performConversationCompaction()` 在 `result.wasCompacted` 后调用 `replaceConversationHistory`，但没有 cleanup
- `performConversationCompactionWithHost()` 在 compact 完成后触发 PostCompact hook，但没有 cleanup
- **插入点**：`performConversationCompaction()` 的 `result.wasCompacted` 分支结束后（第 93 行附近）

## 实现步骤

### Step 1：microCompact.ts 新增 resetMicrocompactState

KainClaw 的 microCompact 用模块级变量追踪状态（`MICRO_COMPACT_TRIGGER_BUFFER_TOKENS`、`KEEP_RECENT_TOOL_RESULTS` 等是常量，不需要重置）。

检查 `microCompact.ts` 里有哪些模块级可变状态（如 `lastMicrocompactMessageCount` 之类的变量），然后新增：

```typescript
export function resetMicrocompactState(): void {
  // 重置所有模块级可变状态
  // 如果没有可变状态，这是一个空函数占位，供 postCompactCleanup 调用
}
```

### Step 2：新建 src/compact/postCompactCleanup.ts

```typescript
import { resetMicrocompactState } from "./microCompact";

/**
 * Run cleanup of caches and tracking state after compaction.
 * Call this after both auto-compact and manual /compact.
 */
export function runPostCompactCleanup(): void {
  resetMicrocompactState();
}
```

如果后续有更多需要在 compact 后清理的状态（如 SessionMemory、systemPromptSections 等），统一在这里扩展。

### Step 3：compactHost.ts 调用 runPostCompactCleanup

在 `performConversationCompaction()` 的 `result.wasCompacted` 分支里，`replaceConversationHistory` 调用之后加入：

```typescript
import { runPostCompactCleanup } from "./postCompactCleanup";

// 在 result.wasCompacted 分支里：
if (result.wasCompacted) {
  await options.replaceConversationHistory(
    result.compactedHistory,
    buildCompactBoundarySessionState({ ... }),
  );
  runPostCompactCleanup();  // ← 新增
}
```

## Verification

```bash
npx vitest run src/compact/microCompact.test.ts
npm test
npm run check
npm run build
```

## Definition of Done

- [ ] `microCompact.ts` 导出 `resetMicrocompactState()`
- [ ] `src/compact/postCompactCleanup.ts` 存在，导出 `runPostCompactCleanup()`
- [ ] `compactHost.ts` 在 `wasCompacted` 后调用 `runPostCompactCleanup()`
- [ ] 现有 compact 测试通过
- [ ] `npm test` / `npm run check` / `npm run build` 通过
