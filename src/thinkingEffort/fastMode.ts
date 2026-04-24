import type { ProviderConfig } from "../agent/providers/IProviderAdapter";
import {
  isAnthropicMessagesProvider,
  isOpus46Model,
} from "./providerSupport";

export const FAST_MODE_BETA_HEADER = "fast-mode-2026-02-01";
export const FAST_MODE_MODEL_DISPLAY = "Opus 4.6";
export const FAST_MODE_PROVIDER_MODEL = "claude-opus-4-6";
const DEFAULT_FAST_MODE_FALLBACK_HOLD_MS = 30 * 60 * 1000;
const MIN_COOLDOWN_MS = 10 * 60 * 1000;
const NON_PERSISTENT_OVERAGE_REASONS = new Set([
  "org_level_disabled_until",
  "out_of_credits",
]);

type FastModeConfigLike = {
  type: ProviderConfig["type"];
  model?: string;
  baseUrl?: string;
};

export type FastModeIndicatorState = {
  label: string;
  connected: boolean;
};

export type CooldownReason = "rate_limit" | "overloaded";

export type FastModeRuntimeState =
  | { status: "active" }
  | { status: "cooldown"; resetAt: number; reason: CooldownReason };

let runtimeState: FastModeRuntimeState = { status: "active" };
let cooldownTimer: ReturnType<typeof setTimeout> | undefined;
const runtimeStateListeners = new Set<() => void>();

function emitRuntimeStateChanged(): void {
  for (const listener of [...runtimeStateListeners]) {
    try {
      listener();
    } catch {
      // Ignore listener failures so fast-mode state remains authoritative.
    }
  }
}

function resetCooldownTimer(): void {
  if (cooldownTimer) {
    clearTimeout(cooldownTimer);
    cooldownTimer = undefined;
  }

  if (runtimeState.status !== "cooldown") {
    return;
  }

  const delayMs = Math.max(0, runtimeState.resetAt - Date.now());
  cooldownTimer = setTimeout(() => {
    getFastModeRuntimeState();
  }, delayMs);
}

function isTruthyEnv(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test((value ?? "").trim());
}

export function isFastModeEnabled(): boolean {
  return !isTruthyEnv(process.env.CLAUDE_CODE_DISABLE_FAST_MODE);
}

export function getFastModeRuntimeState(): FastModeRuntimeState {
  if (runtimeState.status === "cooldown" && Date.now() >= runtimeState.resetAt) {
    runtimeState = { status: "active" };
    resetCooldownTimer();
    emitRuntimeStateChanged();
  }

  return runtimeState;
}

export function onFastModeRuntimeStateChanged(listener: () => void): () => void {
  runtimeStateListeners.add(listener);
  return () => {
    runtimeStateListeners.delete(listener);
  };
}

export function isFastModeCooldown(): boolean {
  return getFastModeRuntimeState().status === "cooldown";
}

export function triggerFastModeCooldown(
  resetAt: number,
  reason: CooldownReason,
): void {
  if (!isFastModeEnabled()) {
    return;
  }

  runtimeState = { status: "cooldown", resetAt, reason };
  resetCooldownTimer();
  emitRuntimeStateChanged();
}

export function clearFastModeCooldown(): void {
  runtimeState = { status: "active" };
  resetCooldownTimer();
  emitRuntimeStateChanged();
}

export function getFastModeCooldownResetAt(retryAfterMs: number | null): number {
  const cooldownMs = Math.max(
    retryAfterMs ?? DEFAULT_FAST_MODE_FALLBACK_HOLD_MS,
    MIN_COOLDOWN_MS,
  );
  return Date.now() + cooldownMs;
}

export function getFastModeOverageDisabledMessage(reason: string | null): string {
  switch (reason) {
    case "out_of_credits":
      return "Fast mode 已禁用：额外用量额度已耗尽。";
    case "org_level_disabled":
    case "org_service_level_disabled":
      return "Fast mode 已禁用：组织层已关闭额外用量。";
    case "org_level_disabled_until":
      return "Fast mode 已禁用：额外用量消费上限已触达。";
    case "member_level_disabled":
      return "Fast mode 已禁用：当前账号已关闭额外用量。";
    case "seat_tier_level_disabled":
    case "seat_tier_zero_credit_limit":
    case "member_zero_credit_limit":
      return "Fast mode 已禁用：当前套餐不提供额外用量。";
    case "overage_not_provisioned":
    case "no_limits_configured":
      return "Fast mode 需要先启用额外用量计费。";
    default:
      return "Fast mode 已禁用：当前不可用额外用量。";
  }
}

export function shouldPersistFastModeOffForOverage(reason: string | null): boolean {
  return !NON_PERSISTENT_OVERAGE_REASONS.has(reason ?? "");
}

export function isFastModeRejectedByApi(
  statusCode: number,
  message: string | undefined,
): boolean {
  return (
    statusCode === 400 &&
    (message ?? "").toLowerCase().includes("fast mode is not enabled")
  );
}

export function modelSupportsFastMode(config: FastModeConfigLike): boolean {
  if (!isAnthropicMessagesProvider(config)) {
    return false;
  }

  return isOpus46Model(config.model);
}

export function getFastModeUnavailableReason(config: FastModeConfigLike): string | null {
  if (!isFastModeEnabled()) {
    return "Fast mode 已被环境配置关闭。";
  }

  if (!isAnthropicMessagesProvider(config)) {
    return "Fast mode 当前只支持 Anthropic-compatible Messages API。";
  }

  return null;
}

export function getFastModeAutoSwitchModel(
  config: FastModeConfigLike,
): string | null {
  if (!isAnthropicMessagesProvider(config)) {
    return null;
  }

  if (modelSupportsFastMode(config)) {
    return null;
  }

  return FAST_MODE_PROVIDER_MODEL;
}

export function isFastModeActive(
  config: FastModeConfigLike,
  fastMode: boolean | undefined,
): boolean {
  return (
    fastMode === true &&
    getFastModeUnavailableReason(config) === null &&
    getFastModeAutoSwitchModel(config) === null &&
    !isFastModeCooldown()
  );
}

export function getFastModeStatusLabel(
  config: FastModeConfigLike,
  fastMode: boolean | undefined,
): string {
  const unavailableReason = getFastModeUnavailableReason(config);
  const autoSwitchModel = getFastModeAutoSwitchModel(config);
  const runtime = getFastModeRuntimeState();

  if (fastMode === true && unavailableReason === null && autoSwitchModel === null) {
    if (runtime.status === "cooldown") {
      return "cooldown";
    }

    return "on";
  }

  if (fastMode === true && autoSwitchModel !== null) {
    return "configured but unavailable";
  }

  if (unavailableReason) {
    return "unavailable";
  }

  return "off";
}

function getTransportMessage(
  config: FastModeConfigLike,
  fastMode: boolean | undefined,
): string {
  const unavailableReason = getFastModeUnavailableReason(config);
  const autoSwitchModel = getFastModeAutoSwitchModel(config);
  const runtime = getFastModeRuntimeState();

  if (unavailableReason) {
    if (fastMode === true) {
      return `设置里已开启 Fast mode，但它对当前 provider 不生效：${unavailableReason} 请求将走标准响应路径。`;
    }

    return `${unavailableReason} 请求将走标准响应路径。`;
  }

  if (fastMode !== true) {
    if (autoSwitchModel) {
      return `请求将走标准响应路径。开启 Fast mode 后，会把当前 provider model 切到 ${FAST_MODE_MODEL_DISPLAY}。`;
    }

    return "请求将走标准响应路径。";
  }

  if (autoSwitchModel) {
    return `设置里已开启 Fast mode，但当前 provider model 不是 ${FAST_MODE_MODEL_DISPLAY}。重新执行 \`/fast on\` 可切换模型。请求将走标准响应路径。`;
  }

  if (runtime.status === "cooldown") {
    const reasonText =
      runtime.reason === "overloaded"
        ? "临时过载"
        : "速率限制";
    return `Fast mode 因 ${reasonText} 进入冷却。冷却结束前，请求将走标准响应路径。`;
  }

  return "请求会携带 Anthropic fast-mode beta header，并使用 `speed: \"fast\"`。";
}

export function getFastModeIndicatorState(
  config: FastModeConfigLike | undefined,
  fastMode: boolean | undefined,
): FastModeIndicatorState {
  if (!config) {
    return {
      label: fastMode === true ? "configured" : "off",
      connected: false,
    };
  }

  if (isFastModeActive(config, fastMode)) {
    return { label: "on", connected: true };
  }

  const unavailableReason = getFastModeUnavailableReason(config);
  if (unavailableReason) {
    return { label: "unavailable", connected: false };
  }

  if (fastMode === true && getFastModeAutoSwitchModel(config) !== null) {
    return { label: "configured", connected: false };
  }

  if (fastMode === true && getFastModeRuntimeState().status === "cooldown") {
    return { label: "cooldown", connected: false };
  }

  return { label: "off", connected: false };
}

export type FastModeCommandOutput = {
  changed: boolean;
  message: string;
  nextValue?: boolean;
  nextModel?: string;
};

export function executeFastModeCommand(
  rawArgs: string,
  currentValue: boolean | undefined,
  config: FastModeConfigLike,
): FastModeCommandOutput {
  const args = rawArgs.trim().toLowerCase();
  const autoSwitchModel = getFastModeAutoSwitchModel(config);

  if (args === "current" || args === "status") {
    return {
      changed: false,
      message: `Fast mode：${getFastModeStatusLabel(config, currentValue)}。${getTransportMessage(config, currentValue)}`,
    };
  }

  const shouldEnable =
    !args
      ? currentValue !== true || autoSwitchModel !== null
      : args === "on" || args === "enable";

  if (shouldEnable) {
    clearFastModeCooldown();
    const unavailableReason = getFastModeUnavailableReason(config);
    if (unavailableReason) {
      return {
        changed: false,
        message: `Fast mode 无法开启。${unavailableReason}`,
      };
    }

    const nextModel = autoSwitchModel ?? undefined;
    const modelUpdated = nextModel
      ? ` 当前 provider model 已切到 ${FAST_MODE_MODEL_DISPLAY}。`
      : "";

    return {
      changed: currentValue !== true || !!nextModel,
      nextValue: true,
      nextModel,
      message: `Fast mode 已开启。${modelUpdated} ${getTransportMessage(
        nextModel ? { ...config, model: nextModel } : config,
        true,
      )}`,
    };
  }

  const shouldDisable =
    !args
      ? currentValue === true
      : args === "off" || args === "disable";

  if (shouldDisable) {
    clearFastModeCooldown();
    return {
      changed: currentValue === true,
      nextValue: false,
      message: "Fast mode 已关闭。请求将走标准响应路径。",
    };
  }

  return {
    changed: false,
    message: "用法：`/fast [on|off|status]`",
  };
}
