import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProviderConfig } from "../agent/providers/IProviderAdapter";
import { buildThinkingEffortSystemPrompt } from "./prompt";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

const anthropicNativeConfig: ProviderConfig = {
  type: "anthropic",
  apiKey: "secret",
  model: "claude-opus-4-6",
};

const openAIConfig: ProviderConfig = {
  type: "openai",
  apiKey: "secret",
  model: "gpt-4o-mini",
};

describe("thinking effort prompt", () => {
  it("returns the base prompt unchanged when effort is unset", () => {
    expect(buildThinkingEffortSystemPrompt("Base prompt", openAIConfig, undefined)).toBe(
      "Base prompt",
    );
  });

  it("returns the base prompt unchanged for native-effort Anthropic models", () => {
    expect(buildThinkingEffortSystemPrompt("Base prompt", anthropicNativeConfig, "high")).toBe(
      "Base prompt",
    );
  });

  it("appends a reasoning-mode section for non-native providers", () => {
    const result = buildThinkingEffortSystemPrompt("Base prompt", openAIConfig, "high");

    expect(result).toContain("Base prompt");
    expect(result).toContain("Reasoning mode for this conversation:");
    expect(result).toContain("Use high effort.");
    expect(result).toContain("tool-driven");
  });

  it("uses the env-overridden applied effort level in the fallback system prompt", () => {
    process.env.CLAUDE_CODE_EFFORT_LEVEL = "low";

    const result = buildThinkingEffortSystemPrompt("Base prompt", openAIConfig, "high");

    expect(result).toContain("Use low effort.");
    expect(result).not.toContain("Use high effort.");
  });
});
