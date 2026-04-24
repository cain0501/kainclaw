import { REVIEW_AGENT } from "../agent/built-in/reviewAgent";
import {
  type ConversationMessage,
  getChangedFiles,
  getChangedFilesFromDiff,
  getDiffContent,
  getLatestAssistantSummary,
  getReadOnlyAgentToolContext,
  getReadOnlyAgentTools,
  getRecentTranscript,
  truncate,
} from "../agent/built-in/agentUtils";
import { runAgent } from "../agent/agentRunner";
import type { IProviderAdapter, NormalizedMessage } from "../agent/providers/IProviderAdapter";
import type { ToolContext, ToolDefinition } from "../toolRuntime";

export type RunReviewAgentOptions = {
  provider: IProviderAdapter;
  tools: ToolDefinition[];
  toolContext: ToolContext;
  messages: ConversationMessage[];
  workspaceRoot: string;
  originalTask: string;
  planFilePath?: string;
  planContent?: string | null;
  extraGuidance?: string;
  /**
   * When set, the review uses this git diff ref (e.g. "HEAD~3..HEAD",
   * "main...HEAD") instead of `git status` to determine changed files.
   * The actual diff content is also injected into the review request.
   */
  diffRef?: string;
  onToken?: (token: string) => void;
  onToolStart?: (toolName: string, input: Record<string, unknown>, executionId: string) => void;
  onToolEnd?: (executionId: string, summary: string, isError: boolean) => void;
  abortSignal?: AbortSignal;
};

export function buildReviewRequest(options: {
  originalTask: string;
  changedFiles: string[];
  approachSummary: string;
  transcript: string;
  planFilePath?: string;
  planContent?: string | null;
  extraGuidance?: string;
  /** When present, the review targets this git diff range (not the working tree). */
  diffRef?: string;
  /** Actual diff content from `git diff` for the diffRef range. */
  diffContent?: string;
}): string {
  const changedFilesSection =
    options.changedFiles.length > 0
      ? options.changedFiles.map(file => `- ${file}`).join("\n")
      : "- [git status unavailable or no changed files detected]";

  const intro = options.diffRef
    ? `Review the changes in \`${options.diffRef}\`.`
    : "Review the current workspace changes.";

  const parts = [
    intro,
    `## Original task\n${options.originalTask || "[missing original task]"}`,
    `## Files changed\n${changedFilesSection}`,
    `## Approach taken\n${options.approachSummary}`,
    `## Recent transcript excerpt\n${options.transcript}`,
  ];

  if (options.diffContent?.trim()) {
    parts.push(`## Diff\n\`\`\`diff\n${options.diffContent.trim()}\n\`\`\``);
  }

  if (options.planFilePath) {
    parts.push(`## Plan file\n${options.planFilePath}`);
  }

  if (options.planContent?.trim()) {
    parts.push(`## Plan excerpt\n${truncate(options.planContent.trim(), 4000)}`);
  }

  if (options.extraGuidance?.trim()) {
    parts.push(`## Extra guidance from user\n${options.extraGuidance.trim()}`);
  }

  parts.push(
    "Use the diff and surrounding code to produce a findings-first review. Prefer concrete, high-confidence issues. If you find nothing, say `No findings.` and call out residual risks or test gaps briefly.",
  );

  return parts.join("\n\n");
}

export function getReviewTools(tools: ToolDefinition[]): ToolDefinition[] {
  return getReadOnlyAgentTools(tools, REVIEW_AGENT.disallowedTools);
}

export function getReviewToolContext(context: ToolContext): ToolContext {
  return getReadOnlyAgentToolContext(context);
}

export async function runReviewAgent(
  options: RunReviewAgentOptions,
): Promise<string> {
  const [changedFiles, diffContent] = options.diffRef
    ? await Promise.all([
        getChangedFilesFromDiff(options.workspaceRoot, options.diffRef),
        getDiffContent(options.workspaceRoot, options.diffRef),
      ])
    : [await getChangedFiles(options.workspaceRoot), ""];

  const approachSummary = getLatestAssistantSummary(
    options.messages,
    "No assistant implementation summary was found in the current conversation. Use the transcript excerpt and workspace state.",
    2500,
  );
  const history: NormalizedMessage[] = [
    {
      role: "user",
      content: buildReviewRequest({
        originalTask: options.originalTask,
        changedFiles,
        approachSummary,
        transcript: getRecentTranscript(options.messages, ["/review"], 8, 1000),
        planFilePath: options.planFilePath,
        planContent: options.planContent,
        extraGuidance: options.extraGuidance,
        diffRef: options.diffRef,
        diffContent: diffContent || undefined,
      }),
    },
  ];

  return await runAgent(history, {
    provider: options.provider,
    tools: options.tools,
    toolContext: options.toolContext,
    onToken: options.onToken,
    onToolStart: options.onToolStart,
    onToolEnd: options.onToolEnd,
    abortSignal: options.abortSignal,
    maxTurns: 20,
  });
}
