import { SYSTEM_PROMPT } from "./agent/agentRunner";
import { AnthropicAdapter } from "./agent/providers/anthropicAdapter";
import { ClaudeCliAdapter } from "./agent/providers/claudeCliAdapter";
import type {
  ProviderConfig as AdapterProviderConfig,
} from "./agent/providers/IProviderAdapter";
import { OpenAIAdapter } from "./agent/providers/openAIAdapter";
import { loadEnvFallbackConfig } from "./legacyEnvFallback";
import { SettingsRepository } from "./storage/settingsRepository";
import type { ProviderRuntimeOptions } from "./thinkingEffort/types";

export async function resolveProviderConfig(
  settings: SettingsRepository,
  workspaceRoot: string,
): Promise<{ config: AdapterProviderConfig; envMap: Record<string, string> }> {
  const fromSettings = await settings.getActiveProviderConfig();
  if (fromSettings) {
    return {
      config: fromSettings,
      envMap: {},
    };
  }

  const legacy = await loadEnvFallbackConfig(workspaceRoot);
  if (!legacy) {
    throw new Error("未找到 Provider 配置。请先在设置面板完成 Provider 配置。");
  }

  for (const [key, value] of Object.entries(legacy.envMap)) {
    process.env[key] = value;
  }

  if (legacy.provider === "openai") {
    return {
      envMap: legacy.envMap,
      config: {
        type: "openai",
        apiKey: legacy.apiKey!,
        model: legacy.model!,
        baseUrl: legacy.baseURL,
        timeoutMs: legacy.timeoutMs,
      },
    };
  }

  if (legacy.provider === "claude-cli") {
    return {
      envMap: legacy.envMap,
      config: {
        type: "claude-cli",
        model: legacy.model,
        cliPath: legacy.cliPath,
        timeoutMs: legacy.timeoutMs,
      },
    };
  }

  return {
    envMap: legacy.envMap,
    config: {
      type: "anthropic",
      apiKey: legacy.apiKey!,
      model: legacy.model!,
      baseUrl: legacy.baseURL,
      timeoutMs: legacy.timeoutMs,
    },
  };
}

export function buildProviderAdapter(
  config: AdapterProviderConfig,
  workspaceRoot: string,
  systemPrompt = SYSTEM_PROMPT,
  envMap: Record<string, string> = {},
  runtimeOptions: ProviderRuntimeOptions = {},
) {
  if (config.type === "openai" || config.type === "openai-compatible") {
    return new OpenAIAdapter(config, systemPrompt, runtimeOptions);
  }

  if (config.type === "claude-cli") {
    return new ClaudeCliAdapter(
      config,
      workspaceRoot,
      envMap,
      systemPrompt,
      runtimeOptions,
    );
  }

  return new AnthropicAdapter(config, systemPrompt, runtimeOptions);
}
