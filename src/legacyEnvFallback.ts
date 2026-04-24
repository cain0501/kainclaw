import { promises as fs } from "node:fs";
import path from "node:path";

export type LegacyProviderName = "anthropic" | "openai" | "claude-cli";

export type LegacyProviderConfig = {
  provider: LegacyProviderName;
  apiKey?: string;
  model?: string;
  baseURL?: string;
  timeoutMs?: number;
  cliPath?: string;
  envMap: Record<string, string>;
};

export function getOptionalEnv(
  envMap: Record<string, string>,
  names: string[],
): string | undefined {
  for (const name of names) {
    const value = envMap[name]?.trim() || process.env[name]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function getRequiredEnv(
  envMap: Record<string, string>,
  names: string[],
  label: string,
): string {
  const value = getOptionalEnv(envMap, names);
  if (!value) {
    throw new Error(`Missing ${label}: expected one of ${names.join(", ")}`);
  }
  return value;
}

export function parseEnvFile(content: string): Record<string, string> {
  const envMap: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const eq = line.indexOf("=");
    if (eq === -1) {
      continue;
    }

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    envMap[key] = value;
  }

  return envMap;
}

export async function loadEnvFallbackConfig(
  workspaceRoot: string,
): Promise<LegacyProviderConfig | undefined> {
  let currentPath = workspaceRoot;
  let envPath: string | undefined;

  while (true) {
    const candidate = path.join(currentPath, ".env");
    try {
      await fs.access(candidate);
      envPath = candidate;
      break;
    } catch {
      // Continue walking upward.
    }

    const parent = path.dirname(currentPath);
    if (parent === currentPath) {
      break;
    }
    currentPath = parent;
  }

  if (!envPath) {
    return undefined;
  }

  const content = await fs.readFile(envPath, "utf8");
  const envMap = parseEnvFile(content);

  const rawProvider = getOptionalEnv(envMap, [
    "LLM_PROVIDER",
    "API_COMPAT_MODE",
  ])?.toLowerCase();

  let provider: LegacyProviderName = "anthropic";
  if (rawProvider === "openai") {
    provider = "openai";
  } else if (
    rawProvider === "claude-cli" ||
    rawProvider === "claude_cli" ||
    rawProvider === "claude"
  ) {
    provider = "claude-cli";
  }

  const timeoutRaw = getOptionalEnv(envMap, ["LLM_TIMEOUT_MS", "API_TIMEOUT_MS"]);
  const timeoutMs = timeoutRaw ? Number.parseInt(timeoutRaw, 10) || undefined : undefined;

  if (provider === "openai") {
    return {
      provider,
      timeoutMs,
      envMap,
      apiKey: getRequiredEnv(
        envMap,
        ["OPENAI_API_KEY", "LLM_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY"],
        "OpenAI-compatible API key",
      ),
      model: getRequiredEnv(
        envMap,
        [
          "OPENAI_MODEL",
          "LLM_MODEL",
          "ANTHROPIC_MODEL",
          "ANTHROPIC_DEFAULT_SONNET_MODEL",
          "ANTHROPIC_DEFAULT_OPUS_MODEL",
          "ANTHROPIC_DEFAULT_HAIKU_MODEL",
        ],
        "OpenAI-compatible model",
      ),
      baseURL: getRequiredEnv(
        envMap,
        ["OPENAI_BASE_URL", "LLM_BASE_URL"],
        "OpenAI-compatible base URL",
      ),
    };
  }

  if (provider === "claude-cli") {
    return {
      provider,
      timeoutMs,
      envMap,
      model: getOptionalEnv(envMap, ["CLAUDE_MODEL", "ANTHROPIC_MODEL"]),
      cliPath: getOptionalEnv(envMap, ["CLAUDE_CLI_PATH"]),
    };
  }

  return {
    provider,
    timeoutMs,
    envMap,
    apiKey: getRequiredEnv(
      envMap,
      ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "LLM_API_KEY"],
      "Anthropic API key",
    ),
    model: getRequiredEnv(
      envMap,
      [
        "ANTHROPIC_MODEL",
        "ANTHROPIC_DEFAULT_SONNET_MODEL",
        "ANTHROPIC_DEFAULT_OPUS_MODEL",
        "ANTHROPIC_DEFAULT_HAIKU_MODEL",
        "LLM_MODEL",
      ],
      "Anthropic model",
    ),
    baseURL: getOptionalEnv(envMap, ["ANTHROPIC_BASE_URL"]),
  };
}
