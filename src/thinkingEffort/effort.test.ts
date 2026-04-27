import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getAppliedEffortLevel,
  getDisplayedEffortLevel,
  getEffortEnvOverride,
  isEffortLevel,
  getEffortLevelDescription,
  getEffortStatusLabel,
  modelSupportsNativeEffort,
} from "./effort.js";
import type { ProviderConfig } from "../agent/providers/IProviderAdapter.js";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// Helper configs
const anthropicOpus46: ProviderConfig = {
  type: "anthropic",
  apiKey: "test",
  model: "claude-opus-4-6-20250219",
};

const anthropicSonnet46: ProviderConfig = {
  type: "anthropic",
  apiKey: "test",
  model: "claude-sonnet-4-6-20250514",
};

const anthropicSonnet35: ProviderConfig = {
  type: "anthropic",
  apiKey: "test",
  model: "claude-3-5-sonnet-20241022",
};

const openaiConfig: ProviderConfig = {
  type: "openai",
  apiKey: "test",
  model: "gpt-4o",
};

describe("isEffortLevel", () => {
  it("returns true for valid levels", () => {
    expect(isEffortLevel("low")).toBe(true);
    expect(isEffortLevel("medium")).toBe(true);
    expect(isEffortLevel("high")).toBe(true);
    expect(isEffortLevel("max")).toBe(true);
  });

  it("returns false for invalid values", () => {
    expect(isEffortLevel("turbo")).toBe(false);
    expect(isEffortLevel("")).toBe(false);
    expect(isEffortLevel("LOW")).toBe(false);
  });
});

describe("getEffortLevelDescription", () => {
  it("returns non-empty description for each level", () => {
    expect(getEffortLevelDescription("low").length).toBeGreaterThan(0);
    expect(getEffortLevelDescription("medium").length).toBeGreaterThan(0);
    expect(getEffortLevelDescription("high").length).toBeGreaterThan(0);
    expect(getEffortLevelDescription("max").length).toBeGreaterThan(0);
  });
});

describe("getEffortStatusLabel", () => {
  it('returns "auto" when undefined', () => {
    expect(getEffortStatusLabel(undefined)).toBe("auto");
  });

  it("returns the level itself when defined", () => {
    expect(getEffortStatusLabel("high")).toBe("high");
  });
});

describe("getAppliedEffortLevel", () => {
  it("returns undefined when no effort set", () => {
    expect(getAppliedEffortLevel(anthropicOpus46, undefined)).toBeUndefined();
  });

  it("downgrades max to high for non-opus-4-6 models", () => {
    expect(getAppliedEffortLevel(anthropicSonnet46, "max")).toBe("high");
  });

  it("keeps max for opus-4-6", () => {
    expect(getAppliedEffortLevel(anthropicOpus46, "max")).toBe("max");
  });

  it("passes through low/medium/high unchanged", () => {
    expect(getAppliedEffortLevel(openaiConfig, "low")).toBe("low");
    expect(getAppliedEffortLevel(openaiConfig, "high")).toBe("high");
  });

  it("lets CLAUDE_CODE_EFFORT_LEVEL override the saved effort", () => {
    process.env.CLAUDE_CODE_EFFORT_LEVEL = "low";

    expect(getEffortEnvOverride()).toBe("low");
    expect(getAppliedEffortLevel(anthropicOpus46, "high")).toBe("low");
  });

  it("treats CLAUDE_CODE_EFFORT_LEVEL=auto as clearing the explicit effort parameter", () => {
    process.env.CLAUDE_CODE_EFFORT_LEVEL = "auto";

    expect(getEffortEnvOverride()).toBeNull();
    expect(getAppliedEffortLevel(anthropicOpus46, "high")).toBeUndefined();
    expect(getDisplayedEffortLevel(anthropicOpus46, "high")).toBe("high");
  });
});

describe("modelSupportsNativeEffort", () => {
  it("returns true for opus-4-6 on official endpoint", () => {
    expect(modelSupportsNativeEffort(anthropicOpus46)).toBe(true);
  });

  it("returns true for sonnet-4-6 on official endpoint", () => {
    expect(modelSupportsNativeEffort(anthropicSonnet46)).toBe(true);
  });

  it("returns false for older Anthropic models", () => {
    expect(modelSupportsNativeEffort(anthropicSonnet35)).toBe(false);
  });

  it("returns false for OpenAI provider", () => {
    expect(modelSupportsNativeEffort(openaiConfig)).toBe(false);
  });
});
