import { describe, expect, it } from "vitest";
import {
  hasOfficialAnthropicEndpoint,
  isAnthropicMessagesProvider,
  isOfficialAnthropicProvider,
  isOpus46Model,
  normalizeProviderModel,
} from "./providerSupport";

describe("providerSupport", () => {
  it("normalizes provider model strings", () => {
    expect(normalizeProviderModel("  Claude-Opus-4-6  ")).toBe("claude-opus-4-6");
  });

  it("detects Opus 4.6 aliases", () => {
    expect(isOpus46Model("opus")).toBe(true);
    expect(isOpus46Model("claude-opus-4-6")).toBe(true);
    expect(isOpus46Model("claude-sonnet-4-5")).toBe(false);
  });

  it("recognizes official Anthropic endpoints", () => {
    expect(hasOfficialAnthropicEndpoint(undefined)).toBe(true);
    expect(hasOfficialAnthropicEndpoint("https://api.anthropic.com/v1")).toBe(true);
    expect(hasOfficialAnthropicEndpoint("https://proxy.example.com")).toBe(false);
    expect(hasOfficialAnthropicEndpoint("not-a-url")).toBe(false);
  });

  it("recognizes anthropic provider variants", () => {
    expect(isAnthropicMessagesProvider({ type: "anthropic" })).toBe(true);
    expect(isAnthropicMessagesProvider({ type: "openai" })).toBe(false);

    expect(
      isOfficialAnthropicProvider({
        type: "anthropic",
        baseUrl: "https://api.anthropic.com/v1",
      }),
    ).toBe(true);
    expect(
      isOfficialAnthropicProvider({
        type: "anthropic",
        baseUrl: "https://proxy.example.com",
      }),
    ).toBe(false);
  });
});
