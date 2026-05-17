import { describe, expect, it } from "vitest";
import type { ProviderConfig } from "./IProviderAdapter";
import {
  buildUrl,
  extractTextFromContent,
  finalizeOpenAIStep,
  normalizeOpenAIProviderErrorMessage,
  supportsImageUrlInputs,
  toOpenAIMessages,
} from "./openAIAdapter";

const openAIConfig: ProviderConfig = {
  type: "openai",
  apiKey: "secret",
  model: "gpt-4o-mini",
};

const compatibleConfig: ProviderConfig = {
  type: "openai-compatible",
  apiKey: "secret",
  model: "deepseek-chat",
  baseUrl: "https://api.deepseek.com/v1",
};

describe("OpenAI adapter helpers", () => {
  it("builds chat completion URLs for openai and compatible providers", () => {
    expect(buildUrl(openAIConfig)).toBe("https://api.openai.com/v1/chat/completions");
    expect(buildUrl(compatibleConfig)).toBe("https://api.deepseek.com/v1/chat/completions");
  });

  it("rejects openai-compatible configs without a baseUrl", () => {
    expect(() =>
      buildUrl({
        type: "openai-compatible",
        apiKey: "secret",
        model: "demo",
        baseUrl: "",
      }),
    ).toThrow(/缺少 baseUrl/);
  });

  it("converts normalized messages into OpenAI chat messages", () => {
    const result = toOpenAIMessages(
      [
        { role: "user", content: "hello" },
        {
          role: "assistant",
          content: "calling tool",
          toolCalls: [{ id: "tool-1", name: "read_file", input: { path: "a.ts" } }],
        },
        { role: "tool_result", toolCallId: "tool-1", content: "file content" },
      ],
      "system prompt",
      openAIConfig,
    );

    expect(result[0]).toEqual({ role: "system", content: "system prompt" });
    expect(result[1]).toEqual({ role: "user", content: "hello" });
    expect((result[2] as any).tool_calls?.[0]?.function?.name).toBe("read_file");
    expect(result[3]).toEqual({
      role: "tool",
      tool_call_id: "tool-1",
      content: "file content",
    });
  });

  it("omits image_url parts for text-only openai-compatible providers", () => {
    const result = toOpenAIMessages(
      [
        {
          role: "user",
          content: "",
          attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
        },
      ],
      "system prompt",
      compatibleConfig,
    );

    expect(result[1]).toEqual({
      role: "user",
      content: "[Image attachments omitted because the current provider only accepts text inputs.]",
    });
  });

  it("keeps image_url parts for providers that support multimodal input", () => {
    const result = toOpenAIMessages(
      [
        {
          role: "user",
          content: "look at this",
          attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
        },
      ],
      "system prompt",
      openAIConfig,
    );

    expect(result[1]).toEqual({
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64,QUJDRA==" },
        },
        {
          type: "text",
          text: "look at this",
        },
      ],
    });
  });

  it("recognizes which providers support image_url inputs", () => {
    expect(supportsImageUrlInputs(openAIConfig)).toBe(true);
    expect(supportsImageUrlInputs(compatibleConfig)).toBe(false);
    expect(
      supportsImageUrlInputs({
        type: "openai-compatible",
        apiKey: "secret",
        model: "gemini-2.0-flash",
        baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
      }),
    ).toBe(true);
    expect(
      supportsImageUrlInputs({
        type: "openai-compatible",
        apiKey: "secret",
        model: "gpt-5.4",
        baseUrl: "https://gateway.example.com/v1",
      }),
    ).toBe(true);
  });

  it("keeps image_url parts for openai-compatible GPT-class models", () => {
    const result = toOpenAIMessages(
      [
        {
          role: "user",
          content: "count images",
          attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
        },
      ],
      "system prompt",
      {
        type: "openai-compatible",
        apiKey: "secret",
        model: "gpt-5.4",
        baseUrl: "https://gateway.example.com/v1",
      },
    );

    expect(result[1]).toEqual({
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: "data:image/png;base64,QUJDRA==" },
        },
        {
          type: "text",
          text: "count images",
        },
      ],
    });
  });

  it("marks a streamed tool-call turn as not done so the runner executes tools", () => {
    const result = finalizeOpenAIStep("", {
      0: {
        id: "tool-1",
        name: "list_files",
        arguments: '{"path":"."}',
      },
    });

    expect(result).toEqual({
      text: "",
      toolCalls: [
        {
          id: "tool-1",
          name: "list_files",
          input: { path: "." },
        },
      ],
      done: false,
    });
  });

  it("marks a plain text turn as done when no tool calls are present", () => {
    expect(finalizeOpenAIStep("hello", {})).toEqual({
      text: "hello",
      toolCalls: [],
      done: true,
    });
  });

  it("drops malformed streamed tool-call JSON instead of throwing", () => {
    expect(() =>
      finalizeOpenAIStep("partial", {
        0: {
          id: "tool-1",
          name: "ask_user",
          arguments: '{"question":"unterminated',
        },
      }),
    ).not.toThrow();

    expect(
      finalizeOpenAIStep("partial", {
        0: {
          id: "tool-1",
          name: "ask_user",
          arguments: '{"question":"unterminated',
        },
      }),
    ).toEqual({
      text: "partial\n\n当前上游 provider 返回了损坏的工具参数，已中断本轮请求。请重试一次；如果反复出现，请切换 provider 或检查上游网关稳定性。",
      toolCalls: [],
      done: true,
    });
  });

  it("normalizes auth, quota, and malformed JSON provider errors into readable user-facing messages", () => {
    expect(
      normalizeOpenAIProviderErrorMessage("invalid_api_key", 401),
    ).toContain("鉴权失败");
    expect(
      normalizeOpenAIProviderErrorMessage("insufficient_quota", 429),
    ).toContain("额度、余额或频率限制");
    expect(
      normalizeOpenAIProviderErrorMessage("Unterminated string in JSON at position 25"),
    ).toContain("损坏的工具参数");
  });

  it("extracts text from string and array-style content blocks", () => {
    expect(extractTextFromContent("plain text")).toBe("plain text");
    expect(
      extractTextFromContent([
        { text: "hello " },
        { text: { value: "world" } },
        "!",
      ]),
    ).toBe("hello world!");
    expect(extractTextFromContent({})).toBe("");
  });
});
