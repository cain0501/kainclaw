import { SYSTEM_PROMPT } from "./agent/agentRunner";
import { AnthropicAdapter } from "./agent/providers/anthropicAdapter";
import { ClaudeCliAdapter } from "./agent/providers/claudeCliAdapter";
import type {
  NormalizedMessage,
  ProviderConfig as AdapterProviderConfig,
} from "./agent/providers/IProviderAdapter";
import { OpenAIAdapter } from "./agent/providers/openAIAdapter";
import { loadEnvFallbackConfig } from "./legacyEnvFallback";
import { SettingsRepository } from "./storage/settingsRepository";
import type { ProviderRuntimeOptions } from "./thinkingEffort/types";

const WEB_FETCH_EXTRACTION_SYSTEM_PROMPT = `You extract useful information from fetched web content.

Answer only from the supplied content.
Ignore boilerplate, CSS, scripts, analytics noise, and navigation chrome unless the request explicitly asks for them.
Do not call tools.
Keep the response concise and directly useful for the user's extraction request.`;

function appendSystemPromptSection(
  basePrompt: string,
  heading: string,
  lines: string[],
): string {
  const section = [`# ${heading}`, ...lines].join("\n");
  return `${basePrompt.trimEnd()}\n\n${section}`;
}

export function buildKainClawRuntimeIdentityNote(
  config: AdapterProviderConfig,
): string {
  const lines = [
    "Your identity is KainClaw. If the user asks who you are, answer that you are KainClaw, a multifunctional AI assistant.",
    "You can say that you help with programming, document editing, information search, debugging, image generation, and UI/page design tasks.",
    "When the user asks what model or provider is currently in use, do not guess. Use only the runtime facts below.",
  ];

  if (config.type === "claude-cli") {
    lines.push(
      config.model?.trim()
        ? `Current runtime fact: you are currently running through Claude CLI with configured model "${config.model.trim()}".`
        : "Current runtime fact: you are currently running through Claude CLI. If the user asks for the exact model name, explain that no explicit model is configured in the app and the local Claude CLI may choose the effective model.",
    );
  } else if (config.type === "anthropic") {
    lines.push(
      `Current runtime fact: the app is configured to use the official Anthropic provider${config.model?.trim() ? ` with model "${config.model.trim()}"` : ""}.`,
    );
  } else if (config.type === "openai") {
    lines.push(
      `Current runtime fact: the app is configured to use the official OpenAI provider${config.model?.trim() ? ` with model "${config.model.trim()}"` : ""}.`,
    );
  } else {
    const modelPart = config.model?.trim()
      ? ` model "${config.model.trim()}"`
      : " an unspecified model";
    const baseUrlPart = config.baseUrl?.trim()
      ? ` via ${config.baseUrl.trim()}`
      : "";
    lines.push(
      `Current runtime fact: the app is configured to use an OpenAI-compatible provider with${modelPart}${baseUrlPart}.`,
    );
    lines.push(
      "The true upstream model may be replaced, aliased, or masked by the third-party gateway, so you must not claim full certainty about the real upstream LLM unless the user separately confirms it.",
    );
  }

  lines.push(
    "Do not freely claim that you are Claude, GPT, DeepSeek, or another model family as your identity. Keep your identity as KainClaw, then describe the configured runtime when asked about the current model/provider.",
  );

  return lines.join("\n");
}

export function buildProviderSystemPrompt(
  baseSystemPrompt: string,
  config: AdapterProviderConfig,
  options: { includeRuntimeIdentityNote?: boolean } = {},
): string {
  if (options.includeRuntimeIdentityNote === false) {
    return baseSystemPrompt;
  }
  return appendSystemPromptSection(
    baseSystemPrompt,
    "Runtime Identity Note",
    buildKainClawRuntimeIdentityNote(config).split("\n"),
  );
}

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
  options: { includeRuntimeIdentityNote?: boolean } = {},
) {
  const resolvedSystemPrompt = buildProviderSystemPrompt(systemPrompt, config, options);
  if (config.type === "openai" || config.type === "openai-compatible") {
    return new OpenAIAdapter(config, resolvedSystemPrompt, runtimeOptions);
  }

  if (config.type === "claude-cli") {
    return new ClaudeCliAdapter(
      config,
      workspaceRoot,
      envMap,
      resolvedSystemPrompt,
      runtimeOptions,
    );
  }

  return new AnthropicAdapter(config, resolvedSystemPrompt, runtimeOptions);
}

export async function runProviderExtractionStep(options: {
  config: AdapterProviderConfig;
  workspaceRoot: string;
  envMap?: Record<string, string>;
  runtimeOptions?: ProviderRuntimeOptions;
  userPrompt: string;
  abortSignal?: AbortSignal;
}): Promise<string> {
  const provider = buildProviderAdapter(
    options.config,
    options.workspaceRoot,
    WEB_FETCH_EXTRACTION_SYSTEM_PROMPT,
    options.envMap ?? {},
    options.runtimeOptions ?? {},
  );

  const messages: NormalizedMessage[] = [
    {
      role: "user",
      content: options.userPrompt,
    },
  ];

  let streamedText = "";
  const step = await provider.runStep(
    messages,
    [],
    token => {
      streamedText += token;
    },
    options.abortSignal,
  );

  return (step.text || streamedText || "").trim();
}
