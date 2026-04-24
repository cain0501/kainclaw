import type { ProviderConfig } from "../agent/providers/IProviderAdapter";

type ProviderConfigLike = {
  type: ProviderConfig["type"];
  model?: string;
  baseUrl?: string;
};

export function normalizeProviderModel(model: string | undefined): string {
  return (model ?? "").trim().toLowerCase();
}

export function isAnthropicMessagesProvider(
  config: ProviderConfigLike,
): config is ProviderConfigLike & { type: "anthropic" } {
  return config.type === "anthropic";
}

export function isOpus46Model(model: string | undefined): boolean {
  const normalized = normalizeProviderModel(model);
  if (!normalized) {
    return false;
  }

  return (
    normalized === "opus" ||
    normalized.startsWith("opus[") ||
    normalized.includes("opus-4-6")
  );
}

export function hasOfficialAnthropicEndpoint(baseUrl: string | undefined): boolean {
  if (!baseUrl) {
    return true;
  }

  try {
    const url = new URL(baseUrl);
    return /(^|\.)anthropic\.com$/i.test(url.hostname);
  } catch {
    return false;
  }
}

export function isOfficialAnthropicProvider(
  config: ProviderConfigLike,
): config is ProviderConfigLike & { type: "anthropic" } {
  return config.type === "anthropic" && hasOfficialAnthropicEndpoint(config.baseUrl);
}
