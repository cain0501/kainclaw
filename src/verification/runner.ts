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
    "## Language policy\nInfer the user's preferred language from the original task and transcript. Write the explanatory body in that language. If the user is Chinese, use Simplified Chinese. Keep these structural labels in English exactly: `### Check:`, `Command run:`, `Output observed:`, `Result: PASS/FAIL`, and the final `VERDICT:` line. Keep commands, file paths, code identifiers, and literal verdict strings unchanged.",
  );

  parts.push(
    "## Report formatting rules\nUse triple-tilde fenced code blocks for both `Command run:` and `Output observed:` so markdown characters stay literal. Do not use triple-backtick fences for these blocks. The `Output observed:` block must contain only raw command output (or `[no output]`) with no analysis or summary text mixed in. If output is long, truncate inside the fenced block and keep all reasoning in the `Result:` line.",
  );

  parts.push(
    "## Fence rule\nAlways use `~~~powershell` for `Command run:` and `~~~text` for `Output observed:`. Raw Markdown files often contain their own triple-backtick fences, so backtick fences can break the rendered report.",
  );

  parts.push(
    "## Result line rule\nKeep each `Result:` line concise: one short sentence with the verdict and the key reason only. Do not append a paragraph, changelog, or extended commentary there.",
  );

  parts.push(
    "## Verification scope gate\n`/verify` is for checking a concrete implementation or change request, not for greeting-only or generic chat turns. Before issuing PASS or FAIL, confirm that there is a real implementation target and recognizable project evidence to exercise. If the original task is only a greeting / generic chat request, or the workspace has no recognizable code/project/build evidence and no concrete implementation target can be established, do not award PASS. Explain the missing verification target and end with `VERDICT: PARTIAL`.",
  );

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

function getFenceInfo(line: string):
  | { marker: string; char: "`" | "~"; length: number }
  | undefined {
  const match = line.match(/^\s*(`{3,}|~{3,})([a-zA-Z0-9_-]*)?\s*$/);
  if (!match) {
    return undefined;
  }

  const marker = match[1];
  return {
    marker,
    char: marker[0] as "`" | "~",
    length: marker.length,
  };
}

function isClosingFenceLine(
  line: string,
  fenceChar: "`" | "~",
  fenceLength: number,
): boolean {
  const trimmed = line.trim();
  if (trimmed.length < fenceLength) {
    return false;
  }
  return [...trimmed].every(char => char === fenceChar);
}

function buildTildeFence(contentLines: string[]): string {
  let longestRun = 0;
  for (const line of contentLines) {
    for (const match of line.matchAll(/~+/g)) {
      longestRun = Math.max(longestRun, match[0].length);
    }
  }
  return "~".repeat(Math.max(3, longestRun + 1));
}

function normalizeVerificationReportBlock(options: {
  lines: string[];
  labelIndex: number;
  language: "powershell" | "text";
  isNextSectionLine: (line: string) => boolean;
}): { normalizedLines: string[]; nextIndex: number } | undefined {
  const openingFenceIndex = options.labelIndex + 1;
  const openingFence = options.lines[openingFenceIndex]
    ? getFenceInfo(options.lines[openingFenceIndex])
    : undefined;
  if (!openingFence) {
    return undefined;
  }

  let nextSectionIndex = -1;
  for (
    let lineIndex = openingFenceIndex + 1;
    lineIndex < options.lines.length;
    lineIndex += 1
  ) {
    if (options.isNextSectionLine(options.lines[lineIndex])) {
      nextSectionIndex = lineIndex;
      break;
    }
  }

  if (nextSectionIndex === -1) {
    return undefined;
  }

  let contentEndIndex = nextSectionIndex;
  if (
    contentEndIndex > openingFenceIndex + 1 &&
    isClosingFenceLine(
      options.lines[contentEndIndex - 1],
      openingFence.char,
      openingFence.length,
    )
  ) {
    contentEndIndex -= 1;
  }

  const contentLines = options.lines.slice(openingFenceIndex + 1, contentEndIndex);
  const fence = buildTildeFence(contentLines);
  return {
    normalizedLines: [
      options.lines[options.labelIndex],
      `${fence}${options.language}`,
      ...contentLines,
      fence,
    ],
    nextIndex: nextSectionIndex,
  };
}

export function normalizeVerificationReportFences(report: string): string {
  const lines = report.split(/\r?\n/);
  const normalizedLines: string[] = [];

  for (let lineIndex = 0; lineIndex < lines.length;) {
    const trimmedLine = lines[lineIndex].trim();

    if (trimmedLine === "Command run:") {
      const normalized = normalizeVerificationReportBlock({
        lines,
        labelIndex: lineIndex,
        language: "powershell",
        isNextSectionLine: line => line.trim() === "Output observed:",
      });
      if (normalized) {
        normalizedLines.push(...normalized.normalizedLines);
        lineIndex = normalized.nextIndex;
        continue;
      }
    }

    if (trimmedLine === "Output observed:") {
      const normalized = normalizeVerificationReportBlock({
        lines,
        labelIndex: lineIndex,
        language: "text",
        isNextSectionLine: line =>
          line.startsWith("Result:") ||
          line.startsWith("### Check:") ||
          line.startsWith("VERDICT:"),
      });
      if (normalized) {
        normalizedLines.push(...normalized.normalizedLines);
        lineIndex = normalized.nextIndex;
        continue;
      }
    }

    normalizedLines.push(lines[lineIndex]);
    lineIndex += 1;
  }

  return normalizedLines.join("\n");
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
  const report = normalizeVerificationReportFences(await runAgent(history, {
    provider: options.provider,
    tools: options.tools,
    toolContext: options.toolContext,
    onToken: options.onToken,
    onToolStart: options.onToolStart,
    onToolEnd: options.onToolEnd,
    abortSignal: options.abortSignal,
    maxTurns: 24,
  }));

  const verdict = extractVerificationVerdict(report) ?? "PARTIAL";
  const finalReport = extractVerificationVerdict(report)
    ? report
    : `${report.trim()}\n\nVERDICT: ${verdict}`;

  return {
    report: finalReport,
    verdict,
  };
}
