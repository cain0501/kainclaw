import type { ProviderConfig } from "../agent/providers/IProviderAdapter";
import { isFastModeActive } from "./fastMode";
import { hasOfficialAnthropicEndpoint, normalizeProviderModel } from "./providerSupport";
import type { EffortLevel, ProviderRuntimeOptions, ThinkingConfig } from "./types";

export const INTERLEAVED_THINKING_BETA_HEADER = "interleaved-thinking-2025-05-14";
export const EFFORT_BETA_HEADER = "effort-2025-11-24";

function getThinkingBudgetForEffort(effortLevel: EffortLevel | undefined): number {
  switch (effortLevel) {
    case "low":
      return 2_048;
    case "medium":
      return 4_096;
    case "high":
      return 8_192;
    case "max":
      return 12_000;
    default:
      return 4_096;
  }
}

export function modelSupportsThinking(config: ProviderConfig): boolean {
  if (config.type !== "anthropic" || !hasOfficialAnthropicEndpoint(config.baseUrl)) {
    return false;
  }

  const model = normalizeProviderModel(config.model);
  return !!model && !model.includes("claude-3-");
}

export function modelSupportsAdaptiveThinking(config: ProviderConfig): boolean {
  if (config.type !== "anthropic" || !hasOfficialAnthropicEndpoint(config.baseUrl)) {
    return false;
  }

  const model = normalizeProviderModel(config.model);
  if (model.includes("opus-4-6") || model.includes("sonnet-4-6")) {
    return true;
  }
  if (model.includes("opus") || model.includes("sonnet") || model.includes("haiku")) {
    return false;
  }
  return false;
}

export function resolveThinkingConfig(
  config: ProviderConfig,
  effortLevel: EffortLevel | undefined,
): ThinkingConfig | undefined {
  if (!modelSupportsThinking(config)) {
    return undefined;
  }

  if (modelSupportsAdaptiveThinking(config)) {
    return { type: "adaptive" };
  }

  return {
    type: "enabled",
    budgetTokens: getThinkingBudgetForEffort(effortLevel),
  };
}

export function buildProviderRuntimeOptions(
  config: ProviderConfig,
  effortLevel: EffortLevel | undefined,
  fastMode: boolean | undefined,
): ProviderRuntimeOptions {
  return {
    effortLevel,
    thinkingConfig: resolveThinkingConfig(config, effortLevel),
    fastMode: isFastModeActive(config, fastMode),
  };
}
