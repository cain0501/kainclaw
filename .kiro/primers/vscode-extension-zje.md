# Task Primer: vscode-extension-zje — SessionMemory: 会话内笔记服务

> **Session entry point.** Read this first.

## Task Goal

在 KainClaw 里新增 `SessionMemory` 工具，让模型可以在会话内读写便签式笔记。

KainClaw 有 beads TodoWrite 用于跨会话任务跟踪，但没有轻量级的会话内记忆工具。`SessionMemory` 填补这个空白：模型可以把中间结果、待确认项、上下文摘要等写进来，后续在同一会话里读回。

**本次交付范围（MVP）：**
- 新增 `SessionMemory` 工具，支持 `write`、`read`、`list`、`delete` 四个操作
- 存储是内存级 `Map<string, string>`，不持久化
- compact 后自动清空（注册到 `postCompactCleanup`）
- 不需要用户审批（无副作用）

## Out of Scope

- 笔记持久化到文件（这是 auto-memory 的职责）
- 多 session 共享（会话隔离）
- 加密或权限控制
- 与 beads TodoWrite 合并（用途不同，不合并）

## High-Risk Files

- `src/toolRuntime.ts` — 新增 `SessionMemory` handler + 工具定义 + 模块级存储
- `src/compact/postCompactCleanup.ts` — 新增 `clearSessionMemoryStore()` 调用

## 架构设计

```
// module-level in toolRuntime.ts
const sessionMemoryStore = new Map<string, string>();
export function clearSessionMemoryStore(): void {
  sessionMemoryStore.clear();
}

// in handlers:
async SessionMemory(input, _context) {
  // write / read / list / delete
}
```

`clearSessionMemoryStore` 注册到 `postCompactCleanup.ts`，compact 后自动清空，防止 compact 前写的内容被 compact 后复用（内容已失效）。

## 实现步骤

### Step 1：toolRuntime.ts 模块级存储

在文件顶部常量区（`DIRECTORY_SKIP_SET` 附近）新增：

```typescript
const sessionMemoryStore = new Map<string, string>();

export function clearSessionMemoryStore(): void {
  sessionMemoryStore.clear();
}
```

### Step 2：SessionMemory handler

```typescript
async SessionMemory(input, _context) {
  const operation = typeof input.operation === "string" ? input.operation : "read";
  const key = typeof input.key === "string" ? input.key.trim() : "";
  const value = typeof input.value === "string" ? input.value : undefined;

  switch (operation) {
    case "write": {
      if (!key) throw new Error("key is required for write");
      if (value === undefined) throw new Error("value is required for write");
      sessionMemoryStore.set(key, value);
      return {
        summary: `SessionMemory: wrote "${key}"`,
        content: `Wrote note "${key}".`,
      };
    }
    case "read": {
      if (!key) throw new Error("key is required for read");
      const stored = sessionMemoryStore.get(key);
      if (stored === undefined) {
        return {
          summary: `SessionMemory: "${key}" not found`,
          content: `Note "${key}" not found.`,
        };
      }
      return {
        summary: `SessionMemory: read "${key}"`,
        content: stored,
      };
    }
    case "list": {
      const keys = [...sessionMemoryStore.keys()];
      if (keys.length === 0) {
        return { summary: "SessionMemory: empty", content: "(no notes)" };
      }
      return {
        summary: `SessionMemory: ${keys.length} note(s)`,
        content: keys.join("\n"),
      };
    }
    case "delete": {
      if (!key) throw new Error("key is required for delete");
      const existed = sessionMemoryStore.delete(key);
      return {
        summary: `SessionMemory: deleted "${key}"`,
        content: existed ? `Deleted "${key}".` : `Note "${key}" not found.`,
      };
    }
    default:
      throw new Error(`Unknown operation: "${operation}". Use: write, read, list, delete`);
  }
},
```

### Step 3：工具定义

```typescript
{
  name: "SessionMemory",
  description: `Read and write short notes within the current session. Notes are cleared after compaction.

Use this to track intermediate results, context summaries, or reminders that span multiple tool calls within one session.
Do NOT use for cross-session tasks — use the beads task tracker for that.

## Operations
- write: Store a note by key
- read: Retrieve a note by key
- list: List all note keys
- delete: Remove a note by key

## Examples
- Write: { "operation": "write", "key": "plan-step", "value": "Implement the handler first, then tests" }
- Read: { "operation": "read", "key": "plan-step" }
- List: { "operation": "list" }
- Delete: { "operation": "delete", "key": "plan-step" }`,
  input_schema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["write", "read", "list", "delete"],
        description: "Operation to perform.",
      },
      key: {
        type: "string",
        description: "Note key. Required for write, read, delete.",
      },
      value: {
        type: "string",
        description: "Note content. Required for write.",
      },
    },
    required: ["operation"],
  },
  annotations: {
    readOnlyHint: false,
    title: "Session note",
  },
},
```

### Step 4：postCompactCleanup.ts 调用 clearSessionMemoryStore

在 `src/compact/postCompactCleanup.ts` 里：

```typescript
import { resetMicrocompactState, clearSessionMemoryStore } from "./microCompact";
// 注意：clearSessionMemoryStore 是从 toolRuntime.ts 导出的，不是 microCompact.ts

// 修正 import：
import { resetMicrocompactState } from "./microCompact";
import { clearSessionMemoryStore } from "../toolRuntime";

export function runPostCompactCleanup(): void {
  resetMicrocompactState();
  clearSessionMemoryStore();
}
```

**注意**：`clearSessionMemoryStore` 从 `toolRuntime.ts` 导出，`postCompactCleanup.ts` 需要 import `../toolRuntime`。确认路径正确。

## 关键实现细节

1. **不需要审批**：读写内存 Map 无副作用，不走 `requestActionApproval`
2. **compact 后清空**：compact 前的 session 内容已经被压缩，之前写入的笔记语义上已失效，必须清空
3. **invokerKind 不检查**：子 Agent 也可以写笔记，store 是全局共享的（同一进程内）。如果将来需要隔离，可以把 key 加 namespace 前缀
4. **value schema 用 string**：统一用字符串，避免 JSON 序列化/反序列化的问题。模型需要存结构化内容可以自己 JSON.stringify

## Already Completed

- 在 `src/toolRuntime.ts` 增加了模块级 `sessionMemoryStore`、`clearSessionMemoryStore()` 导出，以及 `SessionMemory` 的 write/read/list/delete handler。
- 在 `src/compact/postCompactCleanup.ts` 接入了 `clearSessionMemoryStore()`，让 compact 后自动清空会话内笔记。
- 在 `src/toolRuntime.test.ts` 和 `src/compact/postCompactCleanup.test.ts` 增加了 CRUD 与 cleanup 回归覆盖。

## Verification

```bash
npx vitest run src/compact/postCompactCleanup.test.ts
npx vitest run src/toolRuntime.test.ts src/workspaceRuntimeShell.test.ts src/workspaceRuntimeHost.test.ts src/compact/postCompactCleanup.test.ts src/compactHost.test.ts
npm run check
npm run build
```

结果：
- Focused vitest 通过（132 tests）。
- `npm run check` 通过。
- `npm run build` 通过。
- 全量 `npm test` 仍被仓库内既有无关失败阻塞：`electron/rendererMarkdown.test.ts`、`electron/rendererThinkingSummary.test.ts`、`src/design/versionStore.test.ts`、`electron/ElectronChatPanel.test.ts` 的 `__trigger_discovery__` 用例。

手动测试待 Claude/用户在桌面壳里验证：
1. `SessionMemory(operation="write", key="test", value="hello")`
2. `SessionMemory(operation="read", key="test")` → 返回 "hello"
3. `SessionMemory(operation="list")` → 返回 "test"
4. compact 后 `SessionMemory(operation="list")` → 返回 "(no notes)"

## Definition of Done

- [x] `sessionMemoryStore` 模块级 Map 在 `toolRuntime.ts` 定义
- [x] `clearSessionMemoryStore()` 从 `toolRuntime.ts` 导出
- [x] `SessionMemory` handler 支持 write/read/list/delete
- [x] `postCompactCleanup.ts` 调用 `clearSessionMemoryStore()`
- [x] 不需要用户审批
- [ ] 全量 `npm test` / `npm run check` / `npm run build` 全绿
