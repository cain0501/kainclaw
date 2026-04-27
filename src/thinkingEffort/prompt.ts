import type { ProviderConfig } from "../agent/providers/IProviderAdapter";
import {
  getAppliedEffortLevel,
  getEffortLevelDescription,
  modelSupportsNativeEffort,
} from "./effort";
import type { EffortLevel } from "./types";

export function buildThinkingEffortSystemPrompt(
  basePrompt: string,
  config: ProviderConfig,
  effortLevel: EffortLevel | undefined,
): string {
  const appliedEffortLevel = getAppliedEffortLevel(config, effortLevel);

  if (!appliedEffortLevel || modelSupportsNativeEffort(config)) {
    return basePrompt;
  }

  return [
    basePrompt,
    "Reasoning mode for this conversation:",
    `- Use ${appliedEffortLevel} effort.`,
    `- ${getEffortLevelDescription(appliedEffortLevel)}.`,
    "- Spend proportionate time thinking before answering, but stay practical and tool-driven.",
  ].join("\n\n");
}
