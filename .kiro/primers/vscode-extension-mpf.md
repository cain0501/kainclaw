# Task Primer: vscode-extension-mpf — 路径 B：runStep 切换为受限版 runAgent

> **Session entry point.** Read this first. Load other docs only if this file explicitly tells you to.

## Task Goal

路径 B（先聊需求）当前的 `runDesignChatTurn()` 调用 `provider.runStep()` 时传空工具数组，并且遇到任何 tool call 直接报错。这意味着 AI 在路径 B 完全没有工具，只能输出文字。

本任务把 `runDesignChatTurn()` 从 `runStep` 单步调用切换到受限版 `runAgent` 循环，开放 `read_file` + `glob_files` 两个只读工具，同时保持所有原有的 artifact 解析和入库链路不变。

这是后续"Skill 文件化"（vscode-extension-xwb）的前置条件：AI 有了读文件能力，才能自主读取 skill 模板。

## Out of Scope

- 不开放 `write_file` 或任何写操作工具（现在没有消费方，开了会破坏 artifact 协议边界）
- 不改动 `extractArtifactHtmlFromDesignChatOutput` 及下游的 `saveDesignVersion` 链路
- 不修改主聊天 lane（`runAgent` 调用在 line 3686 的那条路径）
- 不修改路径 A（快速生成）的任何逻辑
- 不改 `buildDesignChatSystemPrompt` 或 `buildDesignChatUserPrompt` 的内容（prompt 优化是下一个 issue）
- 不触碰 `electron/renderer/index.html`

## Resume Context (MANDATORY — update after every session)

**Last session date:** —
**Last action taken:** 任务刚创建，未开始
**Why it was done that way:** —
**Exact next action:** 按"Next Step"实施
**Known blockers / watch out:** `runDesignChatTurn` 内部有两处需要同时改，见下文风险点

## Already Completed

- [ ] 无

## Next Step (the ONLY thing to do this session)

**Do:** 把 `runDesignChatTurn()` 从 `provider.runStep` 单步改为 `runAgent` 受限循环，工具白名单 `read_file` + `glob_files`，最终输出仍然要求 `<artifact>` 标签

**Files:**
- `electron/ElectronChatPanel.ts`（只改 `runDesignChatTurn` 函数体，lines ~2568–2684）

**Test:** `npm run build && npm test`

---

### 改法详解

**当前代码结构（lines 2568–2684）：**

```typescript
private async runDesignChatTurn(options: { ... }): Promise<DesignChatRunResult> {
  // 1. 拿 provider（createProviderForSystemPrompt）
  // 2. 组装 history
  // 3. provider.runStep(history, [], onToken, signal)   ← 改这里
  // 4. if (step.toolCalls.length > 0) throw Error       ← 删这里
  // 5. 从 rawOutput 检测 question-form 或 artifact
}
```

**改后结构：**

```typescript
private async runDesignChatTurn(options: { ... }): Promise<DesignChatRunResult> {
  // 1. 拿 config/envMap（同现在）
  // 2. 用 createPromptRuntime 建 promptRuntime，只传 designChatTools
  // 3. 组装 history（同现在）
  // 4. 用 runAgent(history, { provider, tools: designChatTools, toolContext, onToken, abortSignal })
  // 5. 从 runAgent 返回的 text 检测 question-form 或 artifact
}
```

**工具白名单的写法：**

```typescript
import { getBuiltInToolDefinitions } from "../src/toolRuntime";

const DESIGN_CHAT_ALLOWED_TOOLS = new Set(["read_file", "glob_files"]);

const designChatTools = getBuiltInToolDefinitions({ askUserQuestionAvailable: false })
  .filter(t => DESIGN_CHAT_ALLOWED_TOOLS.has(t.name));
```

**`toolContext` 怎么来：**

参考 `createPromptRuntime`（line 5267）的实现。`runDesignChatTurn` 已经有 `workspaceRoot`（`this.getSelectedWorkspaceRoot()`），用它建一个最小 toolContext 即可：

```typescript
const promptRuntime = this.createPromptRuntime(
  workspaceRoot,
  config,
  envMap,
  {},                  // runtimeOptions
  designChatTools,
  this.mcpRuntime,
  options.signal,
);
const toolContext = promptRuntime.getToolContext("main");
```

**`runAgent` 调用：**

```typescript
import { runAgent } from "../src/agent/agentRunner";

const result = await runAgent(history, {
  provider,
  tools: designChatTools,
  toolContext,
  onToken: token => {
    streamedText += token;
    this.appendStreamingToken(options.sessionId, token);
    if (target === "design-chat") {
      this.sendToRenderer({ type: "design:chat:token", token, streamingId });
    }
  },
  abortSignal: options.signal,
  maxTurns: 10,   // 路径 B 不需要很深的 tool loop
});

const rawOutput = result.text.trim();
```

**删除的两行：**

```typescript
// 删除：
if (step.toolCalls.length > 0) {
  throw new Error("Design chat lane does not support tool calls.");
}
```

**下游不变：**

`rawOutput` 拿到之后，`/<question-form\b/i.test(rawOutput)` 检测和 `extractArtifactHtmlFromDesignChatOutput(rawOutput)` 调用保持完全不变。

## Verification

```bash
npm run build
npm test
npm run check
npm run build:electron
```

手测（需要用户配合）：
1. 打开 KainClaw，进入设计对话，选"先聊需求"
2. 输入任意设计需求，确认 Turn 1 AI 仍然返回 `<question-form>`，没有报错
3. 回答表单，确认 Turn 2 AI 生成 `<artifact>` HTML，画布正常打开
4. 确认主聊天（非设计路径）行为无变化

## Risk Points

- **风险 1：`runAgent` 的 `onToken` 签名与 `runStep` 的不一样**
  → 检查 `agentRunner.ts` line 331 `onToken` 的类型，确保调用侧一致

- **风险 2：`createPromptRuntime` 构造的 toolContext 依赖 `this.mcpRuntime`，如果 design chat 调用时 mcpRuntime 未就绪**
  → `createPromptRuntime` 最后一个参数可以传 `this.mcpRuntime`，它在 class 初始化时已存在，不会 undefined

- **风险 3：`maxTurns: 10` 不够用**
  → 路径 B 的 AI 目前没有 skill 文件可读（那是下一个 issue），所以工具调用轮次很少，10 绰绰有余；等 xwb 完成后再评估是否需要调大

- **风险 4：改动区域 lines 2568–2684 附近有其他调用者**
  → `runDesignChatTurn` 是 private 方法，只被 `handleDesignChatLane` 调用（line 2727），改完只需验证这一条路径

## High-Risk Files Touched

- `electron/ElectronChatPanel.ts` → 只改 `runDesignChatTurn` 函数体（lines ~2568–2684）
- **不要碰这个文件的其他任何区域**

## Reference (only load if stuck)

- `src/agent/agentRunner.ts` line 319 — `runAgent` 签名和 loop 实现
- `electron/ElectronChatPanel.ts` line 5267 — `createPromptRuntime` 实现（toolContext 怎么建）
- `electron/ElectronChatPanel.ts` line 3686 — 主聊天 lane 的 `runAgent` 调用方式（参考写法）
- `src/toolRuntime.ts` line 2906 — `read_file` 工具
- `src/toolRuntime.ts` line 3792 — `glob_files` 工具
- `bd show vscode-extension-mpf`

## Definition of Done

> **Codex 负责验证命令，用户只做手测。提交前必须自己跑完以下命令。**

- [ ] `npm test` 通过（baseline: 168 files, 1299 tests）
- [ ] `npm run check` 通过
- [ ] `npm run build` 通过
- [ ] `npm run build:electron` 通过
- [ ] 路径 B Turn 1 仍返回 question-form，Turn 2 仍输出 artifact（手测，告知用户）
- [ ] 主聊天 lane 行为无变化（手测，告知用户）
- [ ] Beads notes 已更新
- [ ] `bd close vscode-extension-mpf` 已执行
