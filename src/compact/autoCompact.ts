import type { ProviderConfig } from "../agent/providers/IProviderAdapter";
import type { NormalizedMessage } from "../agent/providers/IProviderAdapter";
import { normalizeConversationMessages } from "./compact";
import { isCompactUserSummaryMessage } from "./prompt";
import { estimateMessageTokens } from "./tokenBudget";

const DEFAULT_CONTEXT_WINDOW_TOKENS = 120_000;
const CLAUDE_CONTEXT_WINDOW_TOKENS = 200_000;
const LARGE_CONTEXT_WINDOW_TOKENS = 1_000_000;
const GPT_CONTEXT_WINDOW_TOKENS = 128_000;
const MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20_000;

export const AUTOCOMPACT_BUFFER_TOKENS = 13_000;
export const WARNING_THRESHOLD_BUFFER_TOKENS = 20_000;
export const ERROR_THRESHOLD_BUFFER_TOKENS = 20_000;
export const MANUAL_COMPACT_BUFFER_TOKENS = 3_000;
const MIN_MESSAGES_FOR_AUTO_COMPACT = 8;
const MIN_MESSAGES_FOR_AUTO_MICRO_COMPACT = 4;

type ConversationMessage = Extract<NormalizedMessage, { role: "user" | "assistant" }>;

function getModelName(config: ProviderConfig): string {
  return "model" in config && typeof config.model === "string"
    ? config.model.toLowerCase()
    : "";
}

function inferContextWindow(config: ProviderConfig): number {
  const modelName = getModelName(config);

  if (modelName.includes("1m")) {
    return LARGE_CONTEXT_WINDOW_TOKENS;
  }

  if (modelName.includes("claude")) {
    return CLAUDE_CONTEXT_WINDOW_TOKENS;
  }

  if (
    modelName.includes("gpt") ||
    modelName.includes("o1") ||
    modelName.includes("o3") ||
    modelName.includes("o4") ||
    modelName.includes("deepseek") ||
    modelName.includes("qwen")
  ) {
    return GPT_CONTEXT_WINDOW_TOKENS;
  }

  return DEFAULT_CONTEXT_WINDOW_TOKENS;
}

export function getEffectiveContextWindowSize(config: ProviderConfig): number {
  return Math.max(
    40_000,
    inferContextWindow(config) - MAX_OUTPUT_TOKENS_FOR_SUMMARY,
  );
}

export function getAutoCompactThreshold(config: ProviderConfig): number {
  return getEffectiveContextWindowSize(config) - AUTOCOMPACT_BUFFER_TOKENS;
}

export function calculateTokenWarningState(
  tokenUsage: number,
  config: ProviderConfig,
): {
  percentLeft: number;
  isAboveWarningThreshold: boolean;
  isAboveErrorThreshold: boolean;
  isAboveAutoCompactThreshold: boolean;
  isAtBlockingLimit: boolean;
} {
  const autoCompactThreshold = getAutoCompactThreshold(config);
  const percentLeft = Math.max(
    0,
    Math.round(((autoCompactThreshold - tokenUsage) / autoCompactThreshold) * 100),
  );

  const warningThreshold = autoCompactThreshold - WARNING_THRESHOLD_BUFFER_TOKENS;
  const errorThreshold = autoCompactThreshold - ERROR_THRESHOLD_BUFFER_TOKENS;
  const blockingLimit =
    getEffectiveContextWindowSize(config) - MANUAL_COMPACT_BUFFER_TOKENS;

  return {
    percentLeft,
    isAboveWarningThreshold: tokenUsage >= warningThreshold,
    isAboveErrorThreshold: tokenUsage >= errorThreshold,
    isAboveAutoCompactThreshold: tokenUsage >= autoCompactThreshold,
    isAtBlockingLimit: tokenUsage >= blockingLimit,
  };
}

export function getEstimatedConversationTokens(
  messages: ConversationMessage[],
): number {
  return estimateMessageTokens(normalizeConversationMessages(messages));
}

export function shouldAutoCompact(
  messages: ConversationMessage[],
  config: ProviderConfig,
): boolean {
  const normalizedMessages = normalizeConversationMessages(messages);
  const existingSummaryMessage =
    normalizedMessages[0]?.role === "user" &&
    isCompactUserSummaryMessage(normalizedMessages[0].content);
  const candidateMessageCount = existingSummaryMessage
    ? normalizedMessages.length - 1
    : normalizedMessages.length;
  const minimumMessages = existingSummaryMessage
    ? MIN_MESSAGES_FOR_AUTO_MICRO_COMPACT
    : MIN_MESSAGES_FOR_AUTO_COMPACT;

  if (candidateMessageCount < minimumMessages) {
    return false;
  }

  const tokenUsage = estimateMessageTokens(normalizedMessages);
  return calculateTokenWarningState(tokenUsage, config).isAboveAutoCompactThreshold;
}
