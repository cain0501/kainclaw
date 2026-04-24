import { VERIFICATION_AGENT } from "../agent/built-in/verificationAgent";
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
import {
  extractVerificationVerdict,
  type VerificationVerdict,
} from "./prompt";

export type RunVerificationAgentOptions = {
  provider: IProviderAdapter;
  tools: ToolDefinition[];
  toolContext: ToolContext;
  messages: ConversationMessage[];
  workspaceRoot: string;
  originalTask: string;
  extraGuidance?: string;
  planFilePath?: string;
  planContent?: string | null;
  /**
   * When set, the verification targets this git diff range (e.g. "HEAD~3..HEAD",
   * "main...HEAD") instead of the current working-tree state.
   * Changed files and diff content are derived from this ref.
   */
  diffRef?: string;
  onToken?: (token: string) => void;
  onToolStart?: (toolName: string, input: Record<string, unknown>, executionId: string) => void;
  onToolEnd?: (executionId: string, summary: string, isError: boolean) => void;
  abortSignal?: AbortSignal;
};

export function getApproachSummary(messages: ConversationMessage[]): string {
  return getLatestAssistantSummary(
    messages,
    "No assistant implementation summary was found in the current conversation. Use the transcript excerpt and workspace state.",
    2500,
  );
}

export function buildVerificationRequest(options: {
  originalTask: string;
  changedFiles: string[];
  approachSummary: string;
  transcript: string;
  extraGuidance?: string;
  planFilePath?: string;
  planContent?: string | null;
  /** When present, the verification targets this git diff range (not the working tree). */
  diffRef?: string;
  /** Actual diff content from `git diff` for the diffRef range. */
  diffContent?: string;
}): string {
  const changedFilesSection =
    options.changedFiles.length > 0
      ? options.changedFiles.map(file => `- ${file}`).join("\n")
      : "- [git status unavailable or no changed files detected]";

  const intro = options.diffRef
    ? `Verify the changes in \`${options.diffRef}\` for the following implementation.`
    : "Verify the current workspace state for the following implementation.";

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
    "Focus on direct verification of the workspace as it exists now. Do not trust transcript claims without running checks.",
  );

  return parts.join("\n\n");
}

export function getVerificationTools(tools: ToolDefinition[]): ToolDefinition[] {
  return getReadOnlyAgentTools(tools, VERIFICATION_AGENT.disallowedTools);
}

export function getVerificationToolContext(context: ToolContext): ToolContext {
  return getReadOnlyAgentToolContext(context);
}

export async function runVerificationAgent(
  options: RunVerificationAgentOptions,
): Promise<{ report: string; verdict: VerificationVerdict }> {
  const [changedFiles, diffContent] = options.diffRef
    ? await Promise.all([
        getChangedFilesFromDiff(options.workspaceRoot, options.diffRef),
        getDiffContent(options.workspaceRoot, options.diffRef),
      ])
    : [await getChangedFiles(options.workspaceRoot), ""];

  const request = buildVerificationRequest({
    originalTask: options.originalTask,
    changedFiles,
    approachSummary: getApproachSummary(options.messages),
    transcript: getRecentTranscript(options.messages, ["/verify"], 8, 1200),
    extraGuidance: options.extraGuidance,
    planFilePath: options.planFilePath,
    planContent: options.planContent,
    diffRef: options.diffRef,
    diffContent: diffContent || undefined,
  });

  const history: NormalizedMessage[] = [{ role: "user", content: request }];
  const report = await runAgent(history, {
    provider: options.provider,
    tools: options.tools,
    toolContext: options.toolContext,
    onToken: options.onToken,
    onToolStart: options.onToolStart,
    onToolEnd: options.onToolEnd,
    abortSignal: options.abortSignal,
    maxTurns: 24,
  });

  const verdict = extractVerificationVerdict(report) ?? "PARTIAL";
  const finalReport = extractVerificationVerdict(report)
    ? report
    : `${report.trim()}\n\nVERDICT: ${verdict}`;

  return {
    report: finalReport,
    verdict,
  };
}
