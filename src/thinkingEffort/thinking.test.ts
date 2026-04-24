import { describe, expect, it } from "vitest";
import type { ProviderConfig } from "../agent/providers/IProviderAdapter";
import {
  buildProviderRuntimeOptions,
  modelSupportsAdaptiveThinking,
  modelSupportsThinking,
  resolveThinkingConfig,
} from "./thinking";

const anthropicAdaptive: ProviderConfig = {
  type: "anthropic",
  apiKey: "secret",
  model: "claude-opus-4-6",
};

const anthropicLegacy: ProviderConfig = {
  type: "anthropic",
  apiKey: "secret",
  model: "claude-3-5-sonnet",
};

const openAIConfig: ProviderConfig = {
  type: "openai",
  apiKey: "secret",
  model: "gpt-4o-mini",
};

describe("thinking runtime helpers", () => {
  it("supports thinking only for official anthropic non-claude-3 models", () => {
    expect(modelSupportsThinking(anthropicAdaptive)).toBe(true);
    expect(modelSupportsThinking(anthropicLegacy)).toBe(false);
    expect(modelSupportsThinking(openAIConfig)).toBe(false);
  });

  it("recognizes adaptive-thinking capable models", () => {
    expect(modelSupportsAdaptiveThinking(anthropicAdaptive)).toBe(true);
    expect(modelSupportsAdaptiveThinking({
      ...anthropicAdaptive,
      model: "claude-sonnet-4-5",
    })).toBe(false);
  });

  it("resolves adaptive and budgeted thinking configs", () => {
    expect(resolveThinkingConfig(anthropicAdaptive, "high")).toEqual({
      type: "adaptive",
    });

    expect(
      resolveThinkingConfig(
        {
          ...anthropicAdaptive,
          model: "claude-sonnet-4-5",
        },
        "max",
      ),
    ).toEqual({
      type: "enabled",
      budgetTokens: 12_000,
    });

    expect(resolveThinkingConfig(openAIConfig, "high")).toBeUndefined();
  });

  it("builds provider runtime options with effort, thinking config, and fast mode state", () => {
    const result = buildProviderRuntimeOptions(anthropicAdaptive, "medium", true);

    expect(result.effortLevel).toBe("medium");
    expect(result.thinkingConfig).toEqual({ type: "adaptive" });
    expect(result.fastMode).toBe(true);
  });
});
