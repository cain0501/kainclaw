import { randomUUID } from "node:crypto";

import {
  parseReviewDiffRef,
  parseReviewPrNumber,
  getChangedFiles,
  getChangedFilesFromDiff,
  getDiffContent,
  getLatestAssistantSummary,
  getRecentTranscript,
  type ConversationMessage,
} from "./agent/built-in/agentUtils";
import { REVIEW_AGENT_SYSTEM_PROMPT } from "./agent/built-in/reviewAgent";
import type { BackgroundTaskHost } from "./backgroundTaskHost";
import { buildReviewRequest } from "./review/runner";
import { buildThinkingEffortSystemPrompt } from "./thinkingEffort/prompt";
import type { EffortLevel } from "./thinkingEffort/types";
import type { ProviderConfig } from "./agent/providers/IProviderAdapter";

type SessionMessage = {
  role: "user" | "assistant";
  content: string;
};

function getReviewExtraGuidance(
  commandText: string,
  commandTarget?: string,
): string {
  const rest = commandText.slice("/ultrareview".length).trim();
  if (!rest) {
    return "";
  }

  const guidance = !commandTarget
    ? rest
    : rest.startsWith(commandTarget)
      ? rest.slice(commandTarget.length).trim()
      : rest;

  return guidance.replace(/^--\s*/, "").trim();
}

export async function launchHostedReviewWithHost(options: {
  commandText: string;
  workspaceRoot: string;
  config: ProviderConfig;
  effortLevel: EffortLevel | undefined;
  conversationHistory: ConversationMessage[];
  originalTask: string;
  sessionMessages: SessionMessage[];
  planFilePath?: string;
  planContent?: string | null;
  backgroundTaskHost: Pick<BackgroundTaskHost, "runDetachedRemoteReview">;
}): Promise<{
  taskId: string;
  sessionId: string;
  outputPath: string;
}> {
  if (options.config.type !== "claude-cli") {
    throw new Error(
      "Hosted review currently requires the Claude CLI provider in KainClaw.",
    );
  }

  const reviewCommandText = options.commandText.replace(
    /^\/ultrareview/i,
    "/review",
  );
  const prNumber = parseReviewPrNumber(reviewCommandText);
  const diffRef = parseReviewDiffRef(reviewCommandText);
  const commandTarget = diffRef ?? prNumber;
  const extraGuidance = getReviewExtraGuidance(
    options.commandText,
    commandTarget,
  );
  const [changedFiles, diffContent] = diffRef
    ? await Promise.all([
        getChangedFilesFromDiff(options.workspaceRoot, diffRef),
        getDiffContent(options.workspaceRoot, diffRef),
      ])
    : prNumber
      ? [[], ""]
      : [await getChangedFiles(options.workspaceRoot), ""];

  const reviewRequest = buildReviewRequest({
    originalTask: options.originalTask,
    changedFiles,
    approachSummary: getLatestAssistantSummary(
      options.conversationHistory,
      "No assistant implementation summary was found in the current conversation. Use the transcript excerpt and workspace state.",
      2500,
    ),
    transcript: getRecentTranscript(options.conversationHistory, ["/review", "/ultrareview"], 8, 1000),
    planFilePath: options.planFilePath,
    planContent: options.planContent,
    ...(extraGuidance ? { extraGuidance } : {}),
    ...(prNumber ? { prNumber } : {}),
    ...(diffRef ? { diffRef } : {}),
    ...(diffContent ? { diffContent } : {}),
  });
  const sessionId = randomUUID();
  const systemPrompt = buildThinkingEffortSystemPrompt(
    REVIEW_AGENT_SYSTEM_PROMPT,
    options.config,
    options.effortLevel,
  );

  return await options.backgroundTaskHost.runDetachedRemoteReview({
    workspaceRoot: options.workspaceRoot,
    commandText: options.commandText.trim(),
    taskDescription: prNumber
      ? `Hosted review: PR #${prNumber}`
      : diffRef
        ? `Hosted review: ${diffRef}`
        : "Hosted review: current workspace changes",
    reviewRequest,
    provider: {
      ...(options.config.cliPath ? { cliPath: options.config.cliPath } : {}),
      ...(options.config.model ? { model: options.config.model } : {}),
    },
    systemPrompt,
    sessionId,
    remoteTaskType: "claude_cli_review",
    metadata: {
      ...(prNumber ? { reviewPrNumber: prNumber } : {}),
      ...(diffRef ? { diffRef } : {}),
      ...(extraGuidance ? { extraGuidance } : {}),
      originalTask: options.originalTask,
    },
  });
}
