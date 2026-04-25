import { describe, expect, it } from "vitest";
import type { ProviderConfig } from "../agent/providers/IProviderAdapter";
import {
  AUTOCOMPACT_BUFFER_TOKENS,
  calculateTokenWarningState,
  getAutoCompactThreshold,
  getEstimatedConversationTokens,
  getEffectiveContextWindowSize,
  isAutoCompactEnabled,
  shouldAutoCompact,
} from "./autoCompact";
import { getCompactUserSummaryMessage } from "./prompt";

const anthropicConfig: ProviderConfig = {
  type: "anthropic",
  apiKey: "secret",
  model: "claude-opus-4-6",
};

const openAIConfig: ProviderConfig = {
  type: "openai",
  apiKey: "secret",
  model: "gpt-4o-mini",
};

describe("autoCompact helpers", () => {
  it("derives context windows from provider model families", () => {
    expect(getEffectiveContextWindowSize(anthropicConfig)).toBe(180_000);
    expect(getEffectiveContextWindowSize({ type: "claude-cli" })).toBe(180_000);
    expect(getEffectiveContextWindowSize(openAIConfig)).toBe(108_000);
  });

  it("computes auto-compact thresholds from the effective context window", () => {
    expect(getAutoCompactThreshold(anthropicConfig)).toBe(
      getEffectiveContextWindowSize(anthropicConfig) - AUTOCOMPACT_BUFFER_TOKENS,
    );
  });

  it("honors Claude auto-compact window and percent overrides", () => {
    const env = {
      CLAUDE_CODE_AUTO_COMPACT_WINDOW: "100000",
      CLAUDE_AUTOCOMPACT_PCT_OVERRIDE: "50",
    };

    expect(getEffectiveContextWindowSize(openAIConfig, env)).toBe(80_000);
    expect(getAutoCompactThreshold(openAIConfig, env)).toBe(40_000);
  });

  it("reports warning and error states as token usage rises", () => {
    const threshold = getAutoCompactThreshold(openAIConfig);
    const state = calculateTokenWarningState(threshold, openAIConfig);

    expect(state.isAboveWarningThreshold).toBe(true);
    expect(state.isAboveErrorThreshold).toBe(true);
    expect(state.isAboveAutoCompactThreshold).toBe(true);
  });

  it("uses the effective context threshold when auto-compact is disabled", () => {
    const env = { DISABLE_AUTO_COMPACT: "1" };
    const threshold = getAutoCompactThreshold(openAIConfig, env);
    const state = calculateTokenWarningState(threshold, openAIConfig, { env });

    expect(isAutoCompactEnabled(env)).toBe(false);
    expect(state.isAboveAutoCompactThreshold).toBe(false);
    expect(state.percentLeft).toBeGreaterThan(0);
    expect(
      shouldAutoCompact(
        Array.from({ length: 8 }, () => ({
          role: "user" as const,
          content: "x".repeat(80_000),
        })),
        openAIConfig,
        { env },
      ),
    ).toBe(false);
  });

  it("honors the blocking limit override", () => {
    const state = calculateTokenWarningState(42, openAIConfig, {
      env: { CLAUDE_CODE_BLOCKING_LIMIT_OVERRIDE: "42" },
    });

    expect(state.isAtBlockingLimit).toBe(true);
  });

  it("auto-compacts when the threshold is exceeded", () => {
    const manyLargeMessages = Array.from({ length: 8 }, () => ({
      role: "user" as const,
      content: "x".repeat(80_000),
    }));
    const belowThresholdMessages = manyLargeMessages.slice(0, 4);

    expect(shouldAutoCompact(belowThresholdMessages, openAIConfig)).toBe(false);
    expect(shouldAutoCompact(manyLargeMessages, openAIConfig)).toBe(true);
  });

  it("does not recurse into compact-owned query sources", () => {
    const manyLargeMessages = Array.from({ length: 8 }, () => ({
      role: "user" as const,
      content: "x".repeat(80_000),
    }));

    expect(
      shouldAutoCompact(manyLargeMessages, openAIConfig, {
        querySource: "compact",
      }),
    ).toBe(false);
    expect(
      shouldAutoCompact(manyLargeMessages, openAIConfig, {
        querySource: "session_memory",
      }),
    ).toBe(false);
  });

  it("allows auto micro-compact when an existing summary is followed by a short large tail", () => {
    const existingSummary = getCompactUserSummaryMessage(
      "<summary>Earlier work summary</summary>",
      true,
    );
    const messages = [
      { role: "user" as const, content: existingSummary },
      ...Array.from({ length: 4 }, () => ({
        role: "user" as const,
        content: "x".repeat(120_000),
      })),
    ];

    expect(shouldAutoCompact(messages, openAIConfig)).toBe(true);
  });

  it("estimates image attachments like Claude media blocks instead of base64 text", () => {
    const base64HeavyMessages = Array.from({ length: 8 }, () => ({
      role: "user" as const,
      content: "",
      attachments: [{ data: "a".repeat(60_000), mimeType: "image/png" }],
    }));
    const manyImageMessages = Array.from({ length: 50 }, () => ({
      role: "user" as const,
      content: "",
      attachments: [{ data: "a".repeat(60_000), mimeType: "image/png" }],
    }));

    expect(getEstimatedConversationTokens(base64HeavyMessages)).toBe(16_000);
    expect(shouldAutoCompact(base64HeavyMessages, openAIConfig)).toBe(false);
    expect(shouldAutoCompact(manyImageMessages, openAIConfig)).toBe(true);
  });

  it("ignores empty placeholder turns when estimating and gating auto-compaction", () => {
    const preservableTail = [
      { role: "user" as const, content: "x".repeat(100_000) },
      { role: "assistant" as const, content: "y".repeat(100_000) },
    ];
    const messages = [
      ...Array.from({ length: 6 }, () => ({
        role: "assistant" as const,
        content: "",
      })),
      ...preservableTail,
    ];

    expect(getEstimatedConversationTokens(messages)).toBe(
      getEstimatedConversationTokens(preservableTail),
    );
    expect(shouldAutoCompact(messages, openAIConfig)).toBe(false);
  });
});
