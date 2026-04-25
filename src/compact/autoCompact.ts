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
const MAX_OUTPUT_TOKENS_DEFAULT = 32_000;

export const AUTOCOMPACT_BUFFER_TOKENS = 13_000;
export const WARNING_THRESHOLD_BUFFER_TOKENS = 20_000;
export const ERROR_THRESHOLD_BUFFER_TOKENS = 20_000;
export const MANUAL_COMPACT_BUFFER_TOKENS = 3_000;
export const MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3;

type ConversationMessage = Extract<NormalizedMessage, { role: "user" | "assistant" }>;
type AutoCompactEnvironment = Record<string, string | undefined>;
type AutoCompactEvaluationOptions = {
  env?: AutoCompactEnvironment;
  querySource?: string;
  snipTokensFreed?: number;
};

function getModelName(config: ProviderConfig): string {
  return "model" in config && typeof config.model === "string"
    ? config.model.toLowerCase()
    : "";
}

function inferContextWindow(config: ProviderConfig): number {
  if (config.type === "claude-cli") {
    return CLAUDE_CONTEXT_WINDOW_TOKENS;
  }

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

function inferMaxOutputTokens(config: ProviderConfig): number {
  if (config.type === "claude-cli") {
    return MAX_OUTPUT_TOKENS_DEFAULT;
  }

  const modelName = getModelName(config);

  if (modelName.includes("claude-3-opus")) {
    return 4_096;
  }

  if (modelName.includes("claude-3-sonnet")) {
    return 8_192;
  }

  if (modelName.includes("claude-3-haiku")) {
    return 4_096;
  }

  if (modelName.includes("3-5-sonnet") || modelName.includes("3-5-haiku")) {
    return 8_192;
  }

  return MAX_OUTPUT_TOKENS_DEFAULT;
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
}

function parsePercentOverride(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) || parsed <= 0 || parsed > 100 ? null : parsed;
}

function isEnvTruthy(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalizedValue = value.trim().toLowerCase();
  if (!normalizedValue) {
    return false;
  }

  return !["0", "false", "no", "off"].includes(normalizedValue);
}

export function isAutoCompactEnabled(
  env: AutoCompactEnvironment = process.env,
): boolean {
  if (isEnvTruthy(env.DISABLE_COMPACT)) {
    return false;
  }

  if (isEnvTruthy(env.DISABLE_AUTO_COMPACT)) {
    return false;
  }

  return true;
}

export function getEffectiveContextWindowSize(
  config: ProviderConfig,
  env: AutoCompactEnvironment = process.env,
): number {
  const reservedTokensForSummary = Math.min(
    inferMaxOutputTokens(config),
    MAX_OUTPUT_TOKENS_FOR_SUMMARY,
  );
  const autoCompactWindow = parsePositiveInteger(
    env.CLAUDE_CODE_AUTO_COMPACT_WINDOW,
  );
  const contextWindow = autoCompactWindow
    ? Math.min(inferContextWindow(config), autoCompactWindow)
    : inferContextWindow(config);

  return contextWindow - reservedTokensForSummary;
}

export function getAutoCompactThreshold(
  config: ProviderConfig,
  env: AutoCompactEnvironment = process.env,
): number {
  const effectiveContextWindow = getEffectiveContextWindowSize(config, env);
  const autocompactThreshold =
    effectiveContextWindow - AUTOCOMPACT_BUFFER_TOKENS;
  const percentOverride = parsePercentOverride(
    env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE,
  );

  if (percentOverride !== null) {
    return Math.min(
      Math.floor(effectiveContextWindow * (percentOverride / 100)),
      autocompactThreshold,
    );
  }

  return autocompactThreshold;
}

export function calculateTokenWarningState(
  tokenUsage: number,
  config: ProviderConfig,
  options: { env?: AutoCompactEnvironment } = {},
): {
  percentLeft: number;
  isAboveWarningThreshold: boolean;
  isAboveErrorThreshold: boolean;
  isAboveAutoCompactThreshold: boolean;
  isAtBlockingLimit: boolean;
} {
  const env = options.env ?? process.env;
  const autoCompactThreshold = getAutoCompactThreshold(config, env);
  const threshold = isAutoCompactEnabled(env)
    ? autoCompactThreshold
    : getEffectiveContextWindowSize(config, env);
  const percentLeft = Math.max(
    0,
    Math.round(((threshold - tokenUsage) / threshold) * 100),
  );

  const warningThreshold = threshold - WARNING_THRESHOLD_BUFFER_TOKENS;
  const errorThreshold = threshold - ERROR_THRESHOLD_BUFFER_TOKENS;
  const blockingLimitOverride = parsePositiveInteger(
    env.CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE,
  );
  const blockingLimit =
    blockingLimitOverride ??
    getEffectiveContextWindowSize(config, env) - MANUAL_COMPACT_BUFFER_TOKENS;

  return {
    percentLeft,
    isAboveWarningThreshold: tokenUsage >= warningThreshold,
    isAboveErrorThreshold: tokenUsage >= errorThreshold,
    isAboveAutoCompactThreshold:
      isAutoCompactEnabled(env) && tokenUsage >= autoCompactThreshold,
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
  options: AutoCompactEvaluationOptions = {},
): boolean {
  if (
    options.querySource === "session_memory" ||
    options.querySource === "compact"
  ) {
    return false;
  }

  const env = options.env ?? process.env;
  if (!isAutoCompactEnabled(env)) {
    return false;
  }

  const normalizedMessages = normalizeConversationMessages(messages);
  if (
    normalizedMessages[0]?.role === "user" &&
    isCompactUserSummaryMessage(normalizedMessages[0].content) &&
    normalizedMessages.length === 1
  ) {
    return false;
  }

  const tokenUsage = Math.max(
    0,
    estimateMessageTokens(normalizedMessages) - (options.snipTokensFreed ?? 0),
  );
  return calculateTokenWarningState(tokenUsage, config, { env })
    .isAboveAutoCompactThreshold;
}
