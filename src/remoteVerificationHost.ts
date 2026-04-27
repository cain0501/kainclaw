import { randomUUID } from "node:crypto";

import {
  getChangedFiles,
  getChangedFilesFromDiff,
  getDiffContent,
  getLatestAssistantSummary,
  getRecentTranscript,
  parseVerificationDiffRef,
  type ConversationMessage,
} from "./agent/built-in/agentUtils";
import { VERIFICATION_AGENT_SYSTEM_PROMPT } from "./agent/built-in/verificationAgent";
import type { ProviderConfig } from "./agent/providers/IProviderAdapter";
import type { BackgroundTaskHost } from "./backgroundTaskHost";
import { buildThinkingEffortSystemPrompt } from "./thinkingEffort/prompt";
import type { EffortLevel } from "./thinkingEffort/types";
import {
  buildVerificationRequest,
} from "./verification/runner";

type SessionMessage = {
  role: "user" | "assistant";
  content: string;
};

function getVerificationExtraGuidance(
  commandText: string,
  commandTarget?: string,
): string {
  const rest = commandText.slice("/ultraverify".length).trim();
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

export async function launchHostedVerificationWithHost(options: {
  commandText: string;
  workspaceRoot: string;
  config: ProviderConfig;
  effortLevel: EffortLevel | undefined;
  conversationHistory: ConversationMessage[];
  originalTask: string;
  sessionMessages: SessionMessage[];
  planFilePath?: string;
  planContent?: string | null;
  backgroundTaskHost: Pick<BackgroundTaskHost, "runDetachedRemoteVerification">;
}): Promise<{
  taskId: string;
  sessionId: string;
  outputPath: string;
}> {
  if (options.config.type !== "claude-cli") {
    throw new Error(
      "Hosted verification currently requires the Claude CLI provider in KainClaw.",
    );
  }

  const verificationCommandText = options.commandText.replace(
    /^\/ultraverify/i,
    "/verify",
  );
  const diffRef = parseVerificationDiffRef(verificationCommandText);
  const extraGuidance = getVerificationExtraGuidance(
    options.commandText,
    diffRef,
  );
  const [changedFiles, diffContent] = diffRef
    ? await Promise.all([
        getChangedFilesFromDiff(options.workspaceRoot, diffRef),
        getDiffContent(options.workspaceRoot, diffRef),
      ])
    : [await getChangedFiles(options.workspaceRoot), ""];

  const verificationRequest = buildVerificationRequest({
    originalTask: options.originalTask,
    changedFiles,
    approachSummary: getLatestAssistantSummary(
      options.conversationHistory,
      "No assistant implementation summary was found in the current conversation. Use the transcript excerpt and workspace state.",
      2500,
    ),
    transcript: getRecentTranscript(
      options.conversationHistory,
      ["/verify", "/ultraverify"],
      8,
      1200,
    ),
    planFilePath: options.planFilePath,
    planContent: options.planContent,
    ...(extraGuidance ? { extraGuidance } : {}),
    ...(diffRef ? { diffRef } : {}),
    ...(diffContent ? { diffContent } : {}),
  });
  const sessionId = randomUUID();
  const systemPrompt = buildThinkingEffortSystemPrompt(
    VERIFICATION_AGENT_SYSTEM_PROMPT,
    options.config,
    options.effortLevel,
  );

  return await options.backgroundTaskHost.runDetachedRemoteVerification({
    workspaceRoot: options.workspaceRoot,
    commandText: options.commandText.trim(),
    taskDescription: diffRef
      ? `Hosted verification: ${diffRef}`
      : "Hosted verification: current workspace state",
    verificationRequest,
    provider: {
      ...(options.config.cliPath ? { cliPath: options.config.cliPath } : {}),
      ...(options.config.model ? { model: options.config.model } : {}),
    },
    systemPrompt,
    sessionId,
    remoteTaskType: "claude_cli_verification",
    metadata: {
      ...(diffRef ? { diffRef } : {}),
      ...(extraGuidance ? { extraGuidance } : {}),
      originalTask: options.originalTask,
    },
  });
}
