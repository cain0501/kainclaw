import { describe, expect, it } from "vitest";
import { validateProviderKey } from "./providerValidation";

describe("providerValidation", () => {
  it("skips validation for claude-cli", async () => {
    await expect(validateProviderKey("claude-cli", "unused")).resolves.toBeUndefined();
  });

  it("requires baseUrl for openai-compatible", async () => {
    await expect(
      validateProviderKey("openai-compatible", "secret", ""),
    ).rejects.toThrow("openai-compatible 类型必须填写 Base URL，例如 https://api.deepseek.com/v1");
  });

  it("treats anthropic 401/403 as invalid API keys", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ status: 401 }) as any) as typeof fetch;

    try {
      await expect(validateProviderKey("anthropic", "secret")).rejects.toThrow(
        "API Key 无效，请检查后重试。",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("accepts openai-compatible validation when /models succeeds", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount += 1;
      return { ok: true, status: 200 } as any;
    }) as typeof fetch;

    try {
      await expect(
        validateProviderKey("openai-compatible", "secret", "https://api.deepseek.com/v1"),
      ).resolves.toBeUndefined();
      expect(callCount).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("falls back to chat completions when /models is unavailable", async () => {
    const originalFetch = globalThis.fetch;
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount += 1;
      if (callCount === 1) {
        return { ok: false, status: 404 } as any;
      }
      return { status: 200 } as any;
    }) as typeof fetch;

    try {
      await expect(validateProviderKey("openai", "secret")).resolves.toBeUndefined();
      expect(callCount).toBe(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("surfaces invalid API keys from the OpenAI branch", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({ ok: false, status: 403 }) as any) as typeof fetch;

    try {
      await expect(validateProviderKey("openai", "secret")).rejects.toThrow(
        "API Key 无效，请检查后重试。",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
