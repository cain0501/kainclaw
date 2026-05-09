# Task Primer: vscode-extension-vrw — AgentTool: 通用子 Agent 派发工具

> **Session entry point.** Read this first.

## Task Goal

在 KainClaw 里实现通用 `Agent` 工具，让模型可以按 `subagent_type` 派发子 Agent（Explore / general-purpose / verification 等）。

官方 `AgentTool` 是 Plan Mode V2 并发探索的基础，也是 `claude-code-guide`、`statusline-setup` 等专用 Agent 的入口。KainClaw 目前只有 `RunVerification`/`RunReview` 两个专用 Agent，缺少通用派发能力。

**本次交付范围（MVP）：**
- 新增 `Agent` 工具，接受 `subagent_type`（可选）+ `prompt`（必填）+ `description`（可选）
- 支持 3 种内置 agent type：`general-purpose`、`Explore`、`verification`
- 子 Agent 在独立上下文中运行（调用 `runAgent()`），结果返回主 Agent
- 不实现：并发多 Agent、background 模式、streaming UI、worktree 隔离

## Out of Scope

- 并发 Agent 派发（Plan Mode V2 的多视角探索）
- background: true 的 Agent（RunVerification 已有）
- `claude-code-guide`、`statusline-setup` 等专用 Agent（后续扩展）
- Agent 颜色管理、agentMemory、agentDisplay 等 UI 功能

## High-Risk Files

- `src/agent/built-in/exploreAgent.ts` — 新建
- `src/agent/built-in/generalPurposeAgent.ts` — 新建
- `src/agent/builtInAgents.ts` — 注册新 Agent
- `src/toolRuntime.ts` — 新增 Agent 工具定义 + handler + ToolContext 字段
- `src/workspaceRuntimeShell.ts` — 新增 `spawnSubAgent` 回调

## 官方参考

- `E:\claudecodejingiang\src\tools\AgentTool\built-in\exploreAgent.ts` — Explore agent 系统提示词
- `E:\claudecodejingiang\src\tools\AgentTool\built-in\generalPurposeAgent.ts` — general-purpose 系统提示词
- `E:\claudecodejingiang\src\tools\AgentTool\AgentTool.tsx` 第 85 行 — `subagent_type` schema
- `E:\claudecodejingiang\src\tools\AgentTool\prompt.ts` — Agent 工具描述文本

## 架构设计

KainClaw 的 Agent 工具采用与 `RunVerification`/`RunReview` 相同的回调模式：

```
toolRuntime.ts (Agent handler)
  → context.spawnSubAgent(agentType, prompt)
    → workspaceRuntimeShell.ts (spawnSubAgent 实现)
      → getBuiltInAgent(agentType).getSystemPrompt()
      → createProviderAdapter(systemPrompt)
      → runAgent([{ role: "user", content: prompt }], options)
      → return finalText
```

## 实现步骤

### Step 1：新建 Explore agent 定义

`src/agent/built-in/exploreAgent.ts`：

```typescript
import type { BuiltInAgentDefinition } from "./types";

export const EXPLORE_AGENT: BuiltInAgentDefinition = {
  agentType: "Explore",
  whenToUse: "Fast read-only search agent for locating code. Use it to find files by pattern, grep for symbols or keywords, or answer 'where is X defined / which files reference Y.' Do NOT use it for code review, design-doc auditing, cross-file consistency checks, or open-ended analysis.",
  color: "blue",
  source: "built-in",
  getSystemPrompt: () => `You are a fast, read-only code exploration agent. Your job is to locate code, understand structure, and answer questions about the codebase.

You have access to read-only tools: Glob, Grep, Read, and read-only Bash commands.
NEVER use tools that modify files or run commands with side effects.

Be concise. Return findings directly without preamble.`,
};
```

### Step 2：新建 general-purpose agent 定义

`src/agent/built-in/generalPurposeAgent.ts`：

```typescript
import type { BuiltInAgentDefinition } from "./types";
import { SYSTEM_PROMPT } from "../agentRunner";

export const GENERAL_PURPOSE_AGENT: BuiltInAgentDefinition = {
  agentType: "general-purpose",
  whenToUse: "General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks.",
  color: "blue",
  source: "built-in",
  getSystemPrompt: () => SYSTEM_PROMPT,
};
```

### Step 3：注册新 Agent

`src/agent/builtInAgents.ts`：

```typescript
import { EXPLORE_AGENT } from "./built-in/exploreAgent";
import { GENERAL_PURPOSE_AGENT } from "./built-in/generalPurposeAgent";

const BUILT_IN_AGENTS: BuiltInAgentDefinition[] = [
  VERIFICATION_AGENT,
  REVIEW_AGENT,
  EXPLORE_AGENT,
  GENERAL_PURPOSE_AGENT,
];
```

### Step 4：ToolContext 新增 spawnSubAgent

`src/toolRuntime.ts` 的 `ToolContext` 类型（第 320 行附近）新增：

```typescript
spawnSubAgent?: (request: {
  agentType: string;
  prompt: string;
}) => Promise<{ text: string }>;
```

### Step 5：toolRuntime.ts 新增 Agent handler

在 `toolRuntime.ts` 的 handler 对象里新增：

```typescript
async Agent(input, context) {
  if (context.invokerKind === "worker") {
    throw new Error("Agent is only available to the main session.");
  }
  if (typeof context.spawnSubAgent !== "function") {
    throw new Error("Agent spawning is unavailable in the current session.");
  }

  const agentType = typeof input.subagent_type === "string" && input.subagent_type.trim()
    ? input.subagent_type.trim()
    : "general-purpose";
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  if (!prompt) {
    throw new Error("prompt is required");
  }

  const result = await context.spawnSubAgent({ agentType, prompt });
  return {
    summary: `Agent (${agentType}) completed`,
    content: result.text,
  };
},
```

在工具定义数组里新增：

```typescript
{
  name: "Agent",
  description: "Launch a new agent to handle complex, multi-step tasks. Each agent type has specific capabilities. Available subagent_type values: 'general-purpose' (default), 'Explore' (fast read-only code search), 'verification' (build/test verification).",
  inputSchema: {
    type: "object",
    properties: {
      subagent_type: {
        type: "string",
        description: "The type of specialized agent to use. Defaults to 'general-purpose'.",
      },
      prompt: {
        type: "string",
        description: "The task for the agent to perform.",
      },
      description: {
        type: "string",
        description: "A short description of what the agent will do (for display purposes).",
      },
    },
    required: ["prompt"],
  },
},
```

### Step 6：workspaceRuntimeShell.ts 实现 spawnSubAgent

在 `WorkspaceRuntimeShell` 构造函数参数里新增 `spawnSubAgent` 回调，并在 `buildToolContext()` 里传入：

```typescript
private readonly spawnSubAgent: (request: {
  agentType: string;
  prompt: string;
}) => Promise<{ text: string }>,
```

在 `buildToolContext()` 里：

```typescript
spawnSubAgent: this.spawnSubAgent,
```

### Step 7：调用方（extension.ts 或 promptFlowHost.ts）实现 spawnSubAgent

在创建 `WorkspaceRuntimeShell` 的地方传入 `spawnSubAgent` 实现：

```typescript
spawnSubAgent: async ({ agentType, prompt }) => {
  const agentDef = getBuiltInAgent(agentType);
  if (!agentDef) {
    throw new Error(`Unknown agent type: ${agentType}. Available: general-purpose, Explore, verification`);
  }
  const systemPrompt = agentDef.getSystemPrompt();
  const provider = createProviderAdapter({
    config: resolvedConfig,
    workspaceRoot,
    systemPrompt,
    envMap,
  });
  const result = await runAgent(
    [{ role: "user", content: [{ type: "text", text: prompt }] }],
    {
      provider,
      tools: buildAgentTools(agentDef),  // Explore: read-only tools; general-purpose: full tools
      toolContext: buildSubAgentToolContext(),
      maxTurns: 30,
    },
  );
  return { text: result.text };
},
```

**注意**：`buildAgentTools` 需要根据 `agentType` 限制工具集：
- `Explore`：只给 read-only 工具（list_files, read_file, search_files, glob_files）
- `general-purpose`：给完整工具集（但不包括 Agent 本身，防止递归）
- `verification`：复用 RunVerification 的工具集

## 关键实现细节

1. **防止递归**：子 Agent 的工具集里不包含 `Agent` 工具本身
2. **invokerKind**：子 Agent 的 `toolContext.invokerKind` 设为 `"worker"`，防止子 Agent 再次调用 RunVerification/RunReview/Agent
3. **错误处理**：未知 agentType 抛出明确错误，列出可用类型
4. **工具集构建**：参考 `inspectionHost.ts` 里 RunVerification 的工具集构建方式

## Verification

```bash
npm test
npm run check
npm run build
```

手动测试：在 KainClaw 里让模型调用 `Agent(subagent_type="Explore", prompt="Find all TypeScript files in src/compact/")`，验证返回文件列表。

## Definition of Done

- [ ] `EXPLORE_AGENT`、`GENERAL_PURPOSE_AGENT` 定义存在
- [ ] `Agent` 工具在 toolRuntime.ts 里注册
- [ ] `spawnSubAgent` 回调在 workspaceRuntimeShell.ts 里实现
- [ ] 子 Agent 的 `invokerKind` 为 `"worker"`（防止递归）
- [ ] Explore agent 只有 read-only 工具
- [ ] `npm test` / `npm run check` / `npm run build` 通过
