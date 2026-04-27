import { executeTool, type ToolContext } from "./toolRuntime";
import type { InstalledSkillShell } from "./installedSkillsRegistry";

const BLOCK_PATTERN = /```!\s*\n?([\s\S]*?)\n?```/g;
// eslint-disable-next-line require-unicode-regexp -- mirrors Claude's skill inline shell pattern
const INLINE_PATTERN = /(?<=^|\s)!`([^`]+)`/gm;

function buildShellExecutionError(
  slashCommandName: string,
  pattern: string,
  error: unknown,
): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(
    `Installed skill ${slashCommandName} shell command failed for pattern "${pattern}": ${message}`,
  );
}

export async function expandInstalledSkillShellCommands(options: {
  prompt: string;
  slashCommandName: string;
  toolContext: ToolContext;
  shell?: InstalledSkillShell;
}): Promise<string> {
  let result = options.prompt;
  const blockMatches = [...options.prompt.matchAll(BLOCK_PATTERN)];
  const inlineMatches = options.prompt.includes("!`")
    ? [...options.prompt.matchAll(INLINE_PATTERN)]
    : [];
  const matches = [...blockMatches, ...inlineMatches];

  if (matches.length === 0) {
    return result;
  }

  if (options.shell === "bash") {
    throw new Error(
      `Installed skill ${options.slashCommandName} requests shell:bash, but KainClaw installed-skill shell expansion currently supports only powershell-backed execution.`,
    );
  }

  for (const match of matches) {
    const command = match[1]?.trim();
    if (!command) {
      continue;
    }

    try {
      const toolResult = await executeTool(
        "run_command",
        { command },
        options.toolContext,
      );
      result = result.replace(match[0], () => toolResult.content);
    } catch (error) {
      throw buildShellExecutionError(
        options.slashCommandName,
        match[0],
        error,
      );
    }
  }

  return result;
}
