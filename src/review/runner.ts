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
   * Claude /review treats a numeric argument as a GitHub PR number, not as a
   * git diff ref. The review agent should inspect it with `gh pr view/diff`.
   */
  prNumber?: string;
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
  /** Numeric PR number from Claude-compatible `/review <number>` commands. */
  prNumber?: string;
  /** When present, the review targets this git diff range (not the working tree). */
  diffRef?: string;
  /** Actual diff content from `git diff` for the diffRef range. */
  diffContent?: string;
}): string {
  const changedFilesSection =
    options.changedFiles.length > 0
      ? options.changedFiles.map(file => `- ${file}`).join("\n")
      : "- [git status unavailable or no changed files detected]";

  const intro = options.prNumber
    ? `Review pull request #${options.prNumber}.`
    : options.diffRef
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

  if (options.prNumber) {
    parts.push(
      [
        "## Claude /review PR workflow",
        `PR number: ${options.prNumber}`,
        `Run \`gh pr view ${options.prNumber}\` to get PR details.`,
        `Run \`gh pr diff ${options.prNumber}\` to get the PR diff.`,
        "Use the PR details, diff, and surrounding code to produce the review.",
        "If the GitHub CLI command is unavailable or fails, report that limitation instead of silently reviewing unrelated workspace changes.",
      ].join("\n"),
    );
  } else if (!options.diffRef) {
    parts.push(
      [
        "## Claude /review local workflow",
        "Claude's local `/review` command lists open PRs with `gh pr list` when no PR number is provided.",
        "KainClaw may also review the current workspace changes when the host supplied a concrete workspace-change target.",
        "If the user clearly wants a PR review and no PR number was provided, run `gh pr list` and ask for the PR number instead of guessing.",
      ].join("\n"),
    );
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
    "## Language policy\nInfer the user's preferred language from the original task and transcript. Write the review body in that language. If the user is Chinese, use Simplified Chinese. Keep file paths, code identifiers, commands, and literal keywords unchanged. If there are no findings and the user is Chinese, say exactly `未发现问题。`.",
  );

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
    : options.prNumber
      ? [[], ""]
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
        prNumber: options.prNumber,
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
