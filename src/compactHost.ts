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
  MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES,
  shouldAutoCompact,
} from "./compact/autoCompact";
import { getPartialCompactPrompt } from "./compact/prompt";
import type { CompactBoundarySessionState } from "./storage/sessionRepository";

type ActivityStatus = "done" | "error";

type ConversationHistoryMessage = Extract<
  NormalizedMessage,
  { role: "user" | "assistant" }
>;

export function formatCompactTokenCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function buildCompactBoundarySessionState(options: {
  result: CompactConversationResult;
  trigger: CompactBoundarySessionState["trigger"];
  transcriptPath?: string;
  compactedAt?: number;
}): CompactBoundarySessionState {
  return {
    trigger: options.trigger,
    compactedAt: options.compactedAt ?? Date.now(),
    preTokens: options.result.estimatedTokensBefore,
    postTokens: options.result.estimatedTokensAfter,
    messagesSummarized: options.result.messagesCompacted,
    messagesKept: options.result.messagesKept,
    preservedRecentMessages: options.result.messagesKept > 0,
    ...(options.transcriptPath ? { transcriptPath: options.transcriptPath } : {}),
  };
}

export async function performConversationCompaction(options: {
  workspaceRoot: string;
  config: ProviderConfig;
  envMap: Record<string, string>;
  customInstructions?: string;
  compactTrigger?: CompactBoundarySessionState["trigger"];
  getConversationHistory: () => NormalizedMessage[];
  getTranscriptPath: () => string | undefined;
  replaceConversationHistory: (
    compactedHistory: CompactConversationMessage[],
    compactBoundary?: CompactBoundarySessionState,
  ) => void | Promise<void>;
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

  const transcriptPath = options.getTranscriptPath();
  const result = await compactConversationHistory({
    provider: compactProvider,
    messages: options.getConversationHistory(),
    transcriptPath,
  });

  if (result.wasCompacted) {
    await options.replaceConversationHistory(
      result.compactedHistory,
      buildCompactBoundarySessionState({
        result,
        trigger: options.compactTrigger ?? "manual",
        transcriptPath,
      }),
    );
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
    compactBoundary?: CompactBoundarySessionState,
  ) => void | Promise<void>;
  createProviderAdapter: (args: {
    config: ProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
  }) => IProviderAdapter;
};

type AutoCompactFailureTrackingOptions = {
  getAutoCompactConsecutiveFailures?: () => number;
  setAutoCompactConsecutiveFailures?: (failureCount: number) => void;
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
  let consecutiveFailures = 0;

  return (workspaceRoot, config, envMap) =>
    maybeAutoCompactConversationWithHost({
      ...options,
      workspaceRoot,
      config,
      envMap,
      getAutoCompactConsecutiveFailures: () => consecutiveFailures,
      setAutoCompactConsecutiveFailures: failureCount => {
        consecutiveFailures = failureCount;
      },
    });
}

export async function performConversationCompactionWithHost(
  options: SharedCompactionHostOptions & {
    customInstructions?: string;
    compactTrigger?: CompactBoundarySessionState["trigger"];
  },
): Promise<CompactConversationResult> {
  return performConversationCompaction({
    workspaceRoot: options.workspaceRoot,
    config: options.config,
    envMap: options.envMap,
    customInstructions: options.customInstructions,
    compactTrigger: options.compactTrigger,
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
} & AutoCompactFailureTrackingOptions): Promise<void> {
  if (
    (options.getAutoCompactConsecutiveFailures?.() ?? 0) >=
    MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES
  ) {
    return;
  }

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

    options.setAutoCompactConsecutiveFailures?.(0);

    options.finishPhaseActivity(
      compactActivityId,
      "done",
      `Estimated tokens ${formatCompactTokenCount(result.estimatedTokensBefore)} -> ${formatCompactTokenCount(result.estimatedTokensAfter)}`,
    );
  } catch (error) {
    options.setAutoCompactConsecutiveFailures?.(
      (options.getAutoCompactConsecutiveFailures?.() ?? 0) + 1,
    );
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
  } & AutoCompactFailureTrackingOptions,
): Promise<void> {
  return maybeAutoCompactConversation({
    config: options.config,
    getConversationHistory: options.getConversationHistory,
    performConversationCompaction: () =>
      performConversationCompactionWithHost({
        ...options,
        compactTrigger: "auto",
      }),
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
        compactTrigger: "manual",
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
