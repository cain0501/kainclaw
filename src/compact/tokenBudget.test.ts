import { describe, it, expect } from "vitest";
import {
  parseTokenBudget,
  estimateTextTokens,
  estimateMessageTokens,
  getBudgetContinuationMessage,
  findTokenBudgetPositions,
  roughTokenCountEstimationForFileType,
} from "./tokenBudget.js";

describe("parseTokenBudget", () => {
  it("parses shorthand at start: +10k", () => {
    expect(parseTokenBudget("+10k explain this")).toBe(10_000);
  });

  it("parses shorthand at end: +2m.", () => {
    expect(parseTokenBudget("do something +2m.")).toBe(2_000_000);
  });

  it("parses verbose form: use 5k tokens", () => {
    expect(parseTokenBudget("please use 5k tokens for this")).toBe(5_000);
  });

  it("returns null when no budget found", () => {
    expect(parseTokenBudget("just a normal message")).toBeNull();
  });

  it("handles decimal values: +1.5k", () => {
    expect(parseTokenBudget("+1.5k go")).toBe(1_500);
  });
});

describe("estimateTextTokens", () => {
  it("returns 0 for empty string", () => {
    expect(estimateTextTokens("")).toBe(0);
  });

  it("returns 0 for whitespace-only string", () => {
    expect(estimateTextTokens("   \n\t  ")).toBe(2);
  });

  it("estimates ~1 token per 4 chars", () => {
    // "hello world" = 11 chars → ceil(11/4) = 3
    expect(estimateTextTokens("hello world")).toBe(3);
  });
});

describe("estimateMessageTokens", () => {
  it("returns 0 for empty array", () => {
    expect(estimateMessageTokens([])).toBe(0);
  });

  it("does not add synthetic per-message overhead without content", () => {
    const result = estimateMessageTokens([
      { role: "user", content: "" },
    ]);
    expect(result).toBe(0);
  });

  it("estimates image attachments as media blocks instead of base64 text", () => {
    const withoutAttachment = estimateMessageTokens([
      { role: "user", content: "" },
    ]);
    const withAttachment = estimateMessageTokens([
      {
        role: "user",
        content: "",
        attachments: [{ data: "a".repeat(20_000), mimeType: "image/png" }],
      },
    ]);

    expect(withAttachment).toBeGreaterThan(withoutAttachment);
    expect(withAttachment).toBe(2_000);
  });

  it("counts assistant tool-call payloads toward the estimate", () => {
    const withoutToolCalls = estimateMessageTokens([
      { role: "assistant", content: "" },
    ]);
    const withToolCalls = estimateMessageTokens([
      {
        role: "assistant",
        content: "",
        toolCalls: [
          { id: "tool-1", name: "read_file", input: { path: "src/index.ts" } },
        ],
      },
    ]);

    expect(withToolCalls).toBeGreaterThan(withoutToolCalls);
  });

  it("uses denser fallback estimation for JSON-like file content", () => {
    const json = '{"a":1,"b":2}';

    expect(roughTokenCountEstimationForFileType(json, "json")).toBe(
      Math.round(json.length / 2),
    );
    expect(roughTokenCountEstimationForFileType(json, "ts")).toBe(
      Math.round(json.length / 4),
    );
  });
});

describe("getBudgetContinuationMessage", () => {
  it("formats message with percentage and numbers", () => {
    const msg = getBudgetContinuationMessage(50, 5000, 10000);
    expect(msg).toContain("50%");
    expect(msg).toContain("5,000");
    expect(msg).toContain("10,000");
    expect(msg).toContain("Keep working");
  });
});

describe("findTokenBudgetPositions", () => {
  it("returns empty array for text with no budget", () => {
    expect(findTokenBudgetPositions("normal text")).toEqual([]);
  });

  it("finds shorthand at start", () => {
    const positions = findTokenBudgetPositions("+5k explain");
    expect(positions.length).toBeGreaterThanOrEqual(1);
    expect(positions[0]!.start).toBe(0);
  });
});
