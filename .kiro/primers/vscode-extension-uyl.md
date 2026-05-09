# Task Primer: vscode-extension-uyl — Plan Mode V2 多阶段规划提示词升级

> **Session entry point.** Read this first.

## Task Goal

将 KainClaw 的 Plan Mode 提示词从 V1（单阶段）升级到 V2（两阶段：Explore → Design），对齐官方 `src/utils/messages.ts` 里的 `getPlanModeSystemPrompt` 逻辑。

官方 V2 核心结构：
- **Phase 1 (Explore)**：先用 Explore agent 探索代码库，理解架构和复用点
- **Phase 2 (Design)**：再用 Plan agent 从不同视角设计实现方案
- 两个阶段都支持并发 agent（最多 3 个），但 KainClaw 当前没有通用 Agent 工具，所以 **本次只升级提示词结构**，不实现并发 agent 派发

**本次交付**：更新 `planModePrompt.ts`，让模型在 plan mode 下自然遵循 Phase 1 → Phase 2 的两阶段工作流，即使没有并发 agent 也能获得结构化收益。

## Out of Scope

- 并发 agent 派发（需要新增 `RunPlanAgent` 工具，是独立任务）
- `isPlanModeInterviewPhaseEnabled`（官方实验性功能，GrowthBook 控制）
- `getPewterLedgerVariant`（官方 plan 文件大小实验）
- 不改 `planModeHost.ts`、`planMode.ts`、`ExitPlanMode` handler
- 不改 Electron 文件

## High-Risk Files

- `src/planMode/planModePrompt.ts` — 唯一改动文件

## 官方参考

- `E:\claudecodejingiang\src\utils\messages.ts` 第 3221 行附近 — `getPlanModeSystemPrompt` 函数
- `E:\claudecodejingiang\src\tools\AgentTool\built-in\planAgent.ts` — Plan agent 系统提示词
- `E:\claudecodejingiang\src\utils\planModeV2.ts` — `getPlanModeV2AgentCount` / `getPlanModeV2ExploreAgentCount`

## 当前 V1 提示词（src/planMode/planModePrompt.ts）

```typescript
export function buildPlanModeSystemPrompt(
  baseSystemPrompt: string,
  options: PlanModePromptOptions,
): string {
  const planFileInfo = options.planHasContent
    ? `A plan file already exists at ${options.planFilePath}. Read it and update it incrementally as you learn more.`
    : `A plan file is reserved at ${options.planFilePath}. Fill it in as you explore the codebase.`;

  const planModeInstructions = `Plan mode is active. ...
## Planning Workflow
1. Explore the codebase with read-only tools...
2. Update the plan file as you learn...
3. If a requirement or tradeoff cannot be resolved...
4. When the plan is complete, call ExitPlanMode...
...`;
  return `${baseSystemPrompt}\n\n${planModeInstructions}`;
}
```

## 目标 V2 提示词

完整替换 `buildPlanModeSystemPrompt` 函数体，改为两阶段结构：

```typescript
export type PlanModePromptOptions = {
  planFilePath: string;
  planHasContent: boolean;
};

export function buildPlanModeSystemPrompt(
  baseSystemPrompt: string,
  options: PlanModePromptOptions,
): string {
  const planFileInfo = options.planHasContent
    ? `A plan file already exists at ${options.planFilePath}. You can read it and make incremental edits.`
    : `No plan file exists yet. You should create your plan at ${options.planFilePath}.`;

  const planModeInstructions = `Plan mode is active. The user indicated that they do not want you to execute yet -- you MUST NOT make any edits (with the exception of the plan file mentioned below), run any non-readonly tools, or otherwise make any changes to the system. This supersedes any other instructions you have received.

## Plan File Info:
${planFileInfo}
You should build your plan incrementally by writing to or editing this file. NOTE that this is the only file you are allowed to edit - other than this you are only allowed to take READ-ONLY actions.

## Plan Workflow

### Phase 1: Initial Understanding
Goal: Gain a comprehensive understanding of the user's request by reading through code and asking them questions.

1. Focus on understanding the user's request and the code associated with their request. Actively search for existing functions, utilities, and patterns that can be reused — avoid proposing new code when suitable implementations already exist.

2. Explore the codebase thoroughly using read-only tools (Glob, Grep, Read, Bash with read-only commands):
   - Find existing patterns and conventions
   - Understand the current architecture
   - Identify similar features as reference
   - Trace through relevant code paths
   - NEVER use Bash for: mkdir, touch, rm, cp, mv, git add, git commit, npm install, or any file creation/modification

3. If a requirement or tradeoff cannot be resolved from code alone, ask the user in plain text and remain in plan mode.

### Phase 2: Design
Goal: Design an implementation approach based on your Phase 1 exploration.

1. Create a concrete implementation plan that:
   - Explains what will change and why
   - Lists the critical files that need to be modified (3-5 files)
   - References existing code paths or utilities that should be reused
   - Includes concrete verification steps

2. Consider trade-offs and architectural decisions. For complex tasks, explore multiple approaches before committing to one.

3. Write your plan to ${options.planFilePath} incrementally as you design. Do not wait until the end.

### Phase 3: Present Plan
When the plan is complete, call ExitPlanMode to present it for approval.

Do not ask for plan approval in plain text. Use ExitPlanMode when the plan is ready.

## Plan Requirements
- Explain what will change and why
- List the critical files that need to be modified
- Reference existing code paths or utilities that should be reused
- Include concrete verification steps for implementation`;

  return `${baseSystemPrompt}\n\n${planModeInstructions}`;
}
```

## Step 1：更新 planModePrompt.ts

直接替换整个文件内容为上面的 V2 版本。

## Step 2：更新 planModePrompt.test.ts

检查现有测试是否仍然通过。如果测试里有对 V1 提示词文本的精确匹配，需要更新为 V2 文本。

关键测试点：
- `buildPlanModeSystemPrompt` 返回的字符串包含 `Plan mode is active`
- 包含 `planFilePath`
- 包含 `ExitPlanMode`
- 包含 `Phase 1` 和 `Phase 2`（新增断言）

## Verification

```bash
npm test -- src/planMode/planModePrompt.test.ts
npm test
npm run check
npm run build
```

## Risk Points

- `planModePrompt.test.ts` 里可能有对 V1 文本的精确匹配，需要更新
- V2 提示词比 V1 长，但不影响功能
- 官方 V2 提示词里引用了 `EXPLORE_AGENT.agentType`（"Explore"）和 `PLAN_AGENT.agentType`（"Plan"）— KainClaw 没有这两个 agent 类型，所以 V2 提示词里不提 agent 派发，只描述两阶段工作流
- 官方 V2 里 `agentCount > 1` 时有额外的多视角指导文本 — KainClaw 当前 agentCount=1，所以省略这部分

## Future Work（不在本 issue 范围）

并发 agent 支持需要：
1. 新增 `RunPlanAgent` 工具（类似 `RunVerification`），接受 `prompt` 和 `perspective` 参数
2. 在 `agentRunner.ts` 里加 Plan agent 系统提示词（参考官方 `planAgent.ts`）
3. 更新 `planModePrompt.ts` 加入 agent 派发指导（`Launch up to N Plan agents IN PARALLEL`）

## Definition of Done

- [ ] `buildPlanModeSystemPrompt` 输出包含 Phase 1 / Phase 2 两阶段结构
- [ ] 现有 planModePrompt 测试通过（或已更新）
- [ ] `npm test` 通过
- [ ] `npm run check` 通过
- [ ] `npm run build` 通过
