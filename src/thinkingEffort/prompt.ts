import type { ProviderConfig } from "../agent/providers/IProviderAdapter";
import { getEffortLevelDescription, modelSupportsNativeEffort } from "./effort";
import type { EffortLevel } from "./types";

export function buildThinkingEffortSystemPrompt(
  basePrompt: string,
  config: ProviderConfig,
  effortLevel: EffortLevel | undefined,
): string {
  if (!effortLevel || modelSupportsNativeEffort(config)) {
    return basePrompt;
  }

  return [
    basePrompt,
    "Reasoning mode for this conversation:",
    `- Use ${effortLevel} effort.`,
    `- ${getEffortLevelDescription(effortLevel)}.`,
    "- Spend proportionate time thinking before answering, but stay practical and tool-driven.",
  ].join("\n\n");
}
