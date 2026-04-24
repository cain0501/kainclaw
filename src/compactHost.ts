import type {
  IProviderAdapter,
  NormalizedMessage,
  ProviderConfig,
} from "./agent/providers/IProviderAdapter";
import {
  compactConversationHistory,
  type CompactConversationMessage,
  type CompactConversationResult,
} from "./compact/compact";
import {
  calculateTokenWarningState,
  getEstimatedConversationTokens,
  shouldAutoCompact,
} from "./compact/autoCompact";
import { getPartialCompactPrompt } from "./compact/prompt";

type ActivityStatus = "done" | "error";

type ConversationHistoryMessage = Extract<
  NormalizedMessage,
  { role: "user" | "assistant" }
>;

export function formatCompactTokenCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export async function performConversationCompaction(options: {
  workspaceRoot: string;
  config: ProviderConfig;
  envMap: Record<string, string>;
  customInstructions?: string;
  getConversationHistory: () => NormalizedMessage[];
  getTranscriptPath: () => string | undefined;
  replaceConversationHistory: (
    compactedHistory: CompactConversationMessage[],
  ) => void;
  createProvider: (args: {
    config: ProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
  }) => IProviderAdapter;
}): Promise<CompactConversationResult> {
  const compactProvider = options.createProvider({
    config: options.config,
    workspaceRoot: options.workspaceRoot,
    systemPrompt: getPartialCompactPrompt(options.customInstructions, "up_to"),
    envMap: options.envMap,
  });

  const result = await compactConversationHistory({
    provider: compactProvider,
    messages: options.getConversationHistory(),
    transcriptPath: options.getTranscriptPath(),
  });

  if (result.wasCompacted) {
    options.replaceConversationHistory(result.compactedHistory);
  }

  return result;
}

type SharedCompactionHostOptions = {
  workspaceRoot: string;
  config: ProviderConfig;
  envMap: Record<string, string>;
  getConversationHistory: () => NormalizedMessage[];
  getTranscriptPath: () => string | undefined;
  replaceConversationHistory: (
    compactedHistory: CompactConversationMessage[],
  ) => void;
  createProviderAdapter: (args: {
    config: ProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
  }) => IProviderAdapter;
};

export function createAutoCompactConversationRunner(
  options: Omit<
    SharedCompactionHostOptions,
    "workspaceRoot" | "config" | "envMap"
  > & {
    addPhaseActivity: (
      label: string,
      detail: string,
      status: "running",
    ) => string;
    finishPhaseActivity: (
      activityId: string,
      status: ActivityStatus,
      detail?: string,
    ) => void;
    toErrorMessage: (error: unknown) => string;
  },
): (
  workspaceRoot: string,
  config: ProviderConfig,
  envMap: Record<string, string>,
) => Promise<void> {
  return (workspaceRoot, config, envMap) =>
    maybeAutoCompactConversationWithHost({
      ...options,
      workspaceRoot,
      config,
      envMap,
    });
}

export async function performConversationCompactionWithHost(
  options: SharedCompactionHostOptions & {
    customInstructions?: string;
  },
): Promise<CompactConversationResult> {
  return performConversationCompaction({
    workspaceRoot: options.workspaceRoot,
    config: options.config,
    envMap: options.envMap,
    customInstructions: options.customInstructions,
    getConversationHistory: options.getConversationHistory,
    getTranscriptPath: options.getTranscriptPath,
    replaceConversationHistory: options.replaceConversationHistory,
    createProvider: providerOptions =>
      options.createProviderAdapter(providerOptions),
  });
}

export async function maybeAutoCompactConversation(options: {
  config: ProviderConfig;
  getConversationHistory: () => NormalizedMessage[];
  performConversationCompaction: () => Promise<CompactConversationResult>;
  addPhaseActivity: (
    label: string,
    detail: string,
    status: "running",
  ) => string;
  finishPhaseActivity: (
    activityId: string,
    status: ActivityStatus,
    detail?: string,
  ) => void;
  toErrorMessage: (error: unknown) => string;
}): Promise<void> {
  const conversationHistory = toConversationHistoryMessages(
    options.getConversationHistory(),
  );
  if (!shouldAutoCompact(conversationHistory, options.config)) {
    return;
  }

  const estimatedTokens = getEstimatedConversationTokens(conversationHistory);
  const warningState = calculateTokenWarningState(
    estimatedTokens,
    options.config,
  );
  const compactActivityId = options.addPhaseActivity(
    "正在压缩上下文",
    `Estimated context ${formatCompactTokenCount(estimatedTokens)} tokens, ${warningState.percentLeft}% headroom left`,
    "running",
  );

  try {
    const result = await options.performConversationCompaction();

    if (!result.wasCompacted) {
      options.finishPhaseActivity(
        compactActivityId,
        "done",
        result.reason ?? "No compaction was needed.",
      );
      return;
    }

    options.finishPhaseActivity(
      compactActivityId,
      "done",
      `Estimated tokens ${formatCompactTokenCount(result.estimatedTokensBefore)} -> ${formatCompactTokenCount(result.estimatedTokensAfter)}`,
    );
  } catch (error) {
    options.finishPhaseActivity(
      compactActivityId,
      "error",
      options.toErrorMessage(error),
    );
  }
}

export async function maybeAutoCompactConversationWithHost(
  options: SharedCompactionHostOptions & {
    addPhaseActivity: (
      label: string,
      detail: string,
      status: "running",
    ) => string;
    finishPhaseActivity: (
      activityId: string,
      status: ActivityStatus,
      detail?: string,
    ) => void;
    toErrorMessage: (error: unknown) => string;
  },
): Promise<void> {
  return maybeAutoCompactConversation({
    config: options.config,
    getConversationHistory: options.getConversationHistory,
    performConversationCompaction: () =>
      performConversationCompactionWithHost(options),
    addPhaseActivity: options.addPhaseActivity,
    finishPhaseActivity: options.finishPhaseActivity,
    toErrorMessage: options.toErrorMessage,
  });
}

export async function handleCompactCommand(options: {
  commandText: string;
  performConversationCompaction: (
    customInstructions?: string,
  ) => Promise<CompactConversationResult>;
  addPhaseActivity: (
    label: string,
    detail: string,
    status: "running",
  ) => string;
  finishPhaseActivity: (
    activityId: string,
    status: ActivityStatus,
    detail?: string,
  ) => void;
  recordAssistantReply: (
    reply: string,
    includeInConversation?: boolean,
  ) => Promise<void>;
  setCompanionState: (state: "thinking" | "working" | "done" | "idle") => void;
  updateMood: (delta: number, countConversation?: boolean) => Promise<void>;
  toErrorMessage: (error: unknown) => string;
}): Promise<boolean> {
  if (!options.commandText.startsWith("/compact")) {
    return false;
  }

  const extraInstructions =
    options.commandText.slice("/compact".length).trim() || undefined;
  const compactActivityId = options.addPhaseActivity(
    "正在压缩上下文",
    "总结较早上下文并保留最近消息",
    "running",
  );
  options.setCompanionState("thinking");

  try {
    const result = await options.performConversationCompaction(extraInstructions);

    if (!result.wasCompacted) {
      options.finishPhaseActivity(
        compactActivityId,
        "done",
        result.reason ?? "No compaction was needed.",
      );
      await options.recordAssistantReply(
        result.reason ?? "No compaction was needed.",
        false,
      );
      options.setCompanionState("done");
      return true;
    }

    options.finishPhaseActivity(
      compactActivityId,
      "done",
      `Estimated tokens ${formatCompactTokenCount(result.estimatedTokensBefore)} -> ${formatCompactTokenCount(result.estimatedTokensAfter)}`,
    );
    await options.recordAssistantReply(
      `Context compacted. Summarized ${result.messagesCompacted} earlier messages and preserved ${result.messagesKept} recent messages. Estimated tokens ${formatCompactTokenCount(result.estimatedTokensBefore)} -> ${formatCompactTokenCount(result.estimatedTokensAfter)}.`,
      false,
    );
    options.setCompanionState("done");
    await options.updateMood(1, false);
    return true;
  } catch (error) {
    const message = options.toErrorMessage(error);
    options.finishPhaseActivity(compactActivityId, "error", message);
    await options.recordAssistantReply(`Context compaction failed: ${message}`, false);
    options.setCompanionState("idle");
    await options.updateMood(-1, false);
    return true;
  }
}

export async function handleCompactCommandWithHost(
  options: SharedCompactionHostOptions & {
    commandText: string;
    addPhaseActivity: (
      label: string,
      detail: string,
      status: "running",
    ) => string;
    finishPhaseActivity: (
      activityId: string,
      status: ActivityStatus,
      detail?: string,
    ) => void;
    recordAssistantReply: (
      reply: string,
      includeInConversation?: boolean,
    ) => Promise<void>;
    setCompanionState: (
      state: "thinking" | "working" | "done" | "idle",
    ) => void;
    updateMood: (delta: number, countConversation?: boolean) => Promise<void>;
    toErrorMessage: (error: unknown) => string;
  },
): Promise<boolean> {
  return handleCompactCommand({
    commandText: options.commandText,
    performConversationCompaction: customInstructions =>
      performConversationCompactionWithHost({
        ...options,
        customInstructions,
      }),
    addPhaseActivity: options.addPhaseActivity,
    finishPhaseActivity: options.finishPhaseActivity,
    recordAssistantReply: options.recordAssistantReply,
    setCompanionState: options.setCompanionState,
    updateMood: options.updateMood,
    toErrorMessage: options.toErrorMessage,
  });
}

function toConversationHistoryMessages(
  messages: NormalizedMessage[],
): ConversationHistoryMessage[] {
  return messages.filter(
    (message): message is ConversationHistoryMessage =>
      (message.role === "user" || message.role === "assistant") &&
      message.content.trim().length > 0,
  );
}
