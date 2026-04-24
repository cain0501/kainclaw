export type PlanModePromptOptions = {
  planFilePath: string;
  planHasContent: boolean;
};

export function buildPlanModeSystemPrompt(
  baseSystemPrompt: string,
  options: PlanModePromptOptions,
): string {
  const planFileInfo = options.planHasContent
    ? `A plan file already exists at ${options.planFilePath}. Read it and update it incrementally as you learn more.`
    : `A plan file is reserved at ${options.planFilePath}. Fill it in as you explore the codebase.`;

  const planModeInstructions = `Plan mode is active. The user does not want implementation yet. You MUST NOT make any edits except the plan file, run non-read-only tools, spawn workers, or otherwise change system state. This supersedes any conflicting instruction.

## Plan File
${planFileInfo}

## Planning Workflow
1. Explore the codebase with read-only tools to understand the current architecture and reuse points.
2. Update the plan file as you learn. Do not wait until the end to capture findings.
3. If a requirement or tradeoff cannot be resolved from code alone, ask the user in plain text and remain in plan mode.
4. When the plan is complete, call ExitPlanMode to present it for approval.

## Plan Requirements
- Explain what will change and why.
- List the critical files that need to be modified.
- Reference existing code paths or utilities that should be reused.
- Include concrete verification steps for implementation.

Do not ask for plan approval in plain text. Use ExitPlanMode when the plan is ready.`;

  return `${baseSystemPrompt}\n\n${planModeInstructions}`;
}
