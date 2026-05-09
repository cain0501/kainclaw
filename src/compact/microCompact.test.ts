import { describe, expect, it } from "vitest";

import type { NormalizedMessage } from "../agent/providers/IProviderAdapter";
import {
  MICRO_COMPACT_CLEARED_MESSAGE,
  MICRO_COMPACT_TRIGGER_BUFFER_TOKENS,
  microCompactMessages,
  shouldMicroCompact,
} from "./microCompact";

function buildToolHistory(count: number): NormalizedMessage[] {
  const messages: NormalizedMessage[] = [];
  for (let index = 0; index < count; index += 1) {
    messages.push({
      role: "assistant",
      content: "",
      toolCalls: [
        {
          id: `tool-${index}`,
          name: "read_file",
          input: { path: `file-${index}.ts` },
        },
      ],
    });
    messages.push({
      role: "tool_result",
      toolCallId: `tool-${index}`,
      content: `tool-result-${index}-` + "x".repeat(200),
    });
  }
  return messages;
}

describe("microCompact", () => {
  it("clears old compactable tool results and keeps the most recent five", () => {
    const result = microCompactMessages(buildToolHistory(8));

    expect(result).not.toBeNull();
    expect(result?.toolsCleared).toBe(3);
    expect(
      result?.messages.filter(
        message =>
          message.role === "tool_result" &&
          message.content === MICRO_COMPACT_CLEARED_MESSAGE,
      ),
    ).toHaveLength(3);
    expect(
      result?.messages.filter(
        message =>
          message.role === "tool_result" &&
          message.content !== MICRO_COMPACT_CLEARED_MESSAGE,
      ),
    ).toHaveLength(5);
  });

  it("returns null when there are not enough tool results to compact", () => {
    expect(microCompactMessages(buildToolHistory(5))).toBeNull();
  });

  it("does not recount tool results that are already cleared", () => {
    const history = buildToolHistory(8);
    const firstToolResult = history.find(
      message => message.role === "tool_result",
    );
    if (!firstToolResult || firstToolResult.role !== "tool_result") {
      throw new Error("expected tool result");
    }
    firstToolResult.content = MICRO_COMPACT_CLEARED_MESSAGE;

    const result = microCompactMessages(history);
    expect(result?.toolsCleared).toBe(2);
  });

  it("triggers before auto-compact threshold and stays off below it", () => {
    const threshold = 100_000;
    const overThresholdMessages: NormalizedMessage[] = [
      { role: "user", content: "x".repeat((threshold - MICRO_COMPACT_TRIGGER_BUFFER_TOKENS) * 4) },
    ];
    const belowThresholdMessages: NormalizedMessage[] = [
      {
        role: "user",
        content:
          "x".repeat((threshold - MICRO_COMPACT_TRIGGER_BUFFER_TOKENS - 5_000) * 4),
      },
    ];

    expect(shouldMicroCompact(overThresholdMessages, threshold)).toBe(true);
    expect(shouldMicroCompact(belowThresholdMessages, threshold)).toBe(false);
  });
});
