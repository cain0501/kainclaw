import type { ProviderConfig } from "../agent/providers/IProviderAdapter";
import { EFFORT_LEVELS, type EffortLevel } from "./types";
import { hasOfficialAnthropicEndpoint, normalizeProviderModel } from "./providerSupport";

export function isEffortLevel(value: string): value is EffortLevel {
  return (EFFORT_LEVELS as readonly string[]).includes(value);
}

export function getEffortLevelDescription(level: EffortLevel): string {
  switch (level) {
    case "low":
      return "更快、更直接，尽量减少额外推演";
    case "medium":
      return "平衡速度与稳妥度";
    case "high":
      return "更充分地分析、验证和收敛";
    case "max":
      return "尽可能深地推演复杂问题";
  }
}

export function modelSupportsNativeEffort(config: ProviderConfig): boolean {
  if (config.type !== "anthropic" || !hasOfficialAnthropicEndpoint(config.baseUrl)) {
    return false;
  }

  const model = normalizeProviderModel(config.model);
  if (model.includes("opus-4-6") || model.includes("sonnet-4-6")) {
    return true;
  }
  if (model.includes("haiku") || model.includes("sonnet") || model.includes("opus")) {
    return false;
  }
  return false;
}

export function modelSupportsMaxEffort(config: ProviderConfig): boolean {
  return config.type === "anthropic" && normalizeProviderModel(config.model).includes("opus-4-6");
}

export function getAppliedEffortLevel(
  config: ProviderConfig,
  effortLevel: EffortLevel | undefined,
): EffortLevel | undefined {
  if (!effortLevel) {
    return undefined;
  }
  if (effortLevel === "max" && !modelSupportsMaxEffort(config)) {
    return "high";
  }
  return effortLevel;
}

export function getEffortStatusLabel(effortLevel: EffortLevel | undefined): string {
  return effortLevel ?? "auto";
}

function getTransportMessage(
  config: ProviderConfig,
  effortLevel: EffortLevel | undefined,
): string {
  if (modelSupportsNativeEffort(config)) {
    if (!effortLevel) {
      return "当前模型将按 Anthropic 官方默认 effort 运行。";
    }
    const applied = getAppliedEffortLevel(config, effortLevel);
    if (applied !== effortLevel) {
      return `当前模型不支持原生 ${effortLevel}，请求层会按 ${applied} 发送。`;
    }
    return "当前模型会走 Anthropic 原生 effort 参数。";
  }

  if (config.type === "claude-cli") {
    return "当前 claude-cli 适配层暂不支持原生 effort 参数，会通过 system prompt 做兼容降级。";
  }

  if (config.type === "openai" || config.type === "openai-compatible") {
    return "当前 OpenAI 路径先不引入额外 provider 专属实现，会通过 system prompt 做兼容降级。";
  }

  return "当前 provider 暂不支持原生 effort 参数，会通过 system prompt 做兼容降级。";
}

export type EffortCommandOutput = {
  changed: boolean;
  message: string;
  nextValue?: EffortLevel;
};

export function executeEffortCommand(
  rawArgs: string,
  currentValue: EffortLevel | undefined,
  config: ProviderConfig,
): EffortCommandOutput {
  const args = rawArgs.trim().toLowerCase();

  if (!args || args === "current" || args === "status") {
    const applied = getAppliedEffortLevel(config, currentValue);
    const appliedNote =
      currentValue && applied && applied !== currentValue
        ? ` 当前模型实际会按 ${applied} 执行。`
        : "";
    return {
      changed: false,
      message: `当前 Effort：${getEffortStatusLabel(currentValue)}。${getTransportMessage(config, currentValue)}${appliedNote}`,
    };
  }

  if (args === "auto" || args === "unset") {
    return {
      changed: true,
      message: `Effort 已切换为 auto。${getTransportMessage(config, undefined)}`,
    };
  }

  if (!isEffortLevel(args)) {
    return {
      changed: false,
      message: "用法：`/effort [low|medium|high|max|auto|status]`",
    };
  }

  const nextValue = args;
  return {
    changed: nextValue !== currentValue,
    nextValue,
    message:
      `Effort 已设置为 ${nextValue}。${getEffortLevelDescription(nextValue)}。` +
      getTransportMessage(config, nextValue),
  };
}
