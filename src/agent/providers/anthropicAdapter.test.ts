import { describe, expect, it, vi } from "vitest";
import {
  buildUrl,
  getSingleHeaderValue,
  parseErrorMessage,
  parseRetryAfterMs,
  toAnthropicMessages,
  toAnthropicThinking,
} from "./anthropicAdapter";
import { AnthropicAdapter } from "./anthropicAdapter";

describe("Anthropic adapter helpers", () => {
  it("builds Anthropic messages URLs from different base paths", () => {
    expect(buildUrl()).toBe("https://api.anthropic.com/v1/messages");
    expect(buildUrl("https://api.anthropic.com")).toBe("https://api.anthropic.com/v1/messages");
    expect(buildUrl("https://api.anthropic.com/v1")).toBe("https://api.anthropic.com/v1/messages");
    expect(buildUrl("https://api.anthropic.com/v1/messages")).toBe("https://api.anthropic.com/v1/messages");
  });

  it("normalizes single retry-after header values", () => {
    expect(getSingleHeaderValue(undefined)).toBeNull();
    expect(getSingleHeaderValue([" 12 "])).toBe("12");
    expect(getSingleHeaderValue(" 34 ")).toBe("34");
  });

  it("parses retry-after headers as seconds or HTTP dates", () => {
    expect(parseRetryAfterMs("12")).toBe(12_000);

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-10T00:00:00Z"));
    const dateValue = "Fri, 10 Apr 2026 00:00:30 GMT";
    expect(parseRetryAfterMs(dateValue)).toBe(30_000);
    vi.useRealTimers();

    expect(parseRetryAfterMs("not-a-date")).toBeNull();
  });

  it("extracts API error messages and falls back cleanly", () => {
    expect(
      parseErrorMessage('{"error":{"message":"bad request"}}', 400),
    ).toBe("bad request");
    expect(parseErrorMessage("not-json", 529)).toBe("Anthropic request failed: 529");
  });

  it("builds adaptive and budgeted thinking configs", () => {
    expect(
      toAnthropicThinking({ thinkingConfig: { type: "adaptive" } }, 8096),
    ).toEqual({ type: "adaptive" });

    expect(
      toAnthropicThinking(
        { thinkingConfig: { type: "enabled", budgetTokens: 12_000 } },
        8_096,
      ),
    ).toEqual({ type: "enabled", budget_tokens: 8_095 });

    expect(toAnthropicThinking({}, 8_096)).toBeUndefined();
  });

  it("omits oversized historical images instead of sending them to Anthropic", () => {
    const oversizedBase64 = Buffer.alloc(5 * 1024 * 1024 + 1, 1).toString("base64");

    const messages = toAnthropicMessages([
      {
        role: "user",
        content: "Please continue from this earlier screenshot.",
        attachments: [{ data: oversizedBase64, mimeType: "image/png" }],
      },
    ]);

    expect(messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "Please continue from this earlier screenshot." },
          {
            type: "text",
            text: "[One earlier image attachment was omitted because the current Anthropic provider only accepts images up to 5 MB each.]",
          },
        ],
      },
    ]);
  });

  it("keeps valid images while only omitting oversized ones", () => {
    const validBase64 = Buffer.from("small-image").toString("base64");
    const oversizedBase64 = Buffer.alloc(5 * 1024 * 1024 + 1, 2).toString("base64");

    const messages = toAnthropicMessages([
      {
        role: "user",
        content: "Compare these.",
        attachments: [
          { data: validBase64, mimeType: "image/png" },
          { data: oversizedBase64, mimeType: "image/png" },
        ],
      },
    ]);

    expect(messages).toEqual([
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: validBase64,
            },
          },
          { type: "text", text: "Compare these." },
          {
            type: "text",
            text: "[One earlier image attachment was omitted because the current Anthropic provider only accepts images up to 5 MB each.]",
          },
        ],
      },
    ]);
  });

  it("emits lightweight request metrics before sending the Anthropic request", async () => {
    const metricsSpy = vi.fn();
    const adapter = new AnthropicAdapter(
      {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
        baseUrl: "https://api.anthropic.com",
        timeoutMs: 1,
      },
      "system prompt",
      {
        requestKind: "built-in-agent",
        onRequestMetrics: metricsSpy,
      },
    );

    await expect(
      adapter.runStep([], [], () => {}),
    ).rejects.toThrow();

    expect(metricsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "anthropic",
        requestKind: "built-in-agent",
        model: "claude-sonnet",
        toolCount: 0,
        systemPromptChars: "system prompt".length,
        usedPromptCache: false,
        promptCacheStatus: "unsupported",
      }),
    );
  });
});
