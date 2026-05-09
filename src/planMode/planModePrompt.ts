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
