import { describe, expect, it } from "vitest";
import type { ProviderConfig } from "../agent/providers/IProviderAdapter";
import {
  AUTOCOMPACT_BUFFER_TOKENS,
  calculateTokenWarningState,
  getAutoCompactThreshold,
  getEstimatedConversationTokens,
  getEffectiveContextWindowSize,
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
    expect(getEffectiveContextWindowSize(openAIConfig)).toBe(108_000);
  });

  it("computes auto-compact thresholds from the effective context window", () => {
    expect(getAutoCompactThreshold(anthropicConfig)).toBe(
      getEffectiveContextWindowSize(anthropicConfig) - AUTOCOMPACT_BUFFER_TOKENS,
    );
  });

  it("reports warning and error states as token usage rises", () => {
    const threshold = getAutoCompactThreshold(openAIConfig);
    const state = calculateTokenWarningState(threshold, openAIConfig);

    expect(state.isAboveWarningThreshold).toBe(true);
    expect(state.isAboveErrorThreshold).toBe(true);
    expect(state.isAboveAutoCompactThreshold).toBe(true);
  });

  it("only auto-compacts when enough messages exist and the threshold is exceeded", () => {
    const manyLargeMessages = Array.from({ length: 8 }, () => ({
      role: "user" as const,
      content: "x".repeat(80_000),
    }));
    const tooFewMessages = manyLargeMessages.slice(0, 4);

    expect(shouldAutoCompact(tooFewMessages, openAIConfig)).toBe(false);
    expect(shouldAutoCompact(manyLargeMessages, openAIConfig)).toBe(true);
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
        content: "x".repeat(80_000),
      })),
    ];

    expect(shouldAutoCompact(messages, openAIConfig)).toBe(true);
  });

  it("auto-compacts attachment-heavy conversations even when text content is empty", () => {
    const messages = Array.from({ length: 8 }, () => ({
      role: "user" as const,
      content: "",
      attachments: [{ data: "a".repeat(60_000), mimeType: "image/png" }],
    }));

    expect(shouldAutoCompact(messages, openAIConfig)).toBe(true);
  });

  it("ignores empty placeholder turns when estimating and gating auto-compaction", () => {
    const preservableTail = [
      { role: "user" as const, content: "x".repeat(200_000) },
      { role: "assistant" as const, content: "y".repeat(200_000) },
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
