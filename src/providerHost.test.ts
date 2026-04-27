import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  anthropicCtor,
  claudeCliCtor,
  loadEnvFallbackConfigMock,
  openAICtor,
} = vi.hoisted(() => ({
  anthropicCtor: vi.fn(),
  openAICtor: vi.fn(),
  claudeCliCtor: vi.fn(),
  loadEnvFallbackConfigMock: vi.fn(),
}));

vi.mock("./agent/providers/anthropicAdapter", () => ({
  AnthropicAdapter: anthropicCtor,
}));

vi.mock("./agent/providers/openAIAdapter", () => ({
  OpenAIAdapter: openAICtor,
}));

vi.mock("./agent/providers/claudeCliAdapter", () => ({
  ClaudeCliAdapter: claudeCliCtor,
}));

vi.mock("./legacyEnvFallback", () => ({
  loadEnvFallbackConfig: loadEnvFallbackConfigMock,
}));

import {
  buildKainClawRuntimeIdentityNote,
  buildProviderAdapter,
  buildProviderSystemPrompt,
  resolveProviderConfig,
} from "./providerHost";

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...originalEnv };
  anthropicCtor.mockImplementation(function mockAnthropic() {});
  openAICtor.mockImplementation(function mockOpenAI() {});
  claudeCliCtor.mockImplementation(function mockClaudeCli() {});
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("providerHost", () => {
  it("prefers persisted provider settings over legacy env fallback", async () => {
    const settings = {
      getActiveProviderConfig: vi.fn(async () => ({
        type: "anthropic" as const,
        apiKey: "secret",
        model: "claude-sonnet",
      })),
    } as any;

    const result = await resolveProviderConfig(settings, "E:\\repo");

    expect(result).toEqual({
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
    });
    expect(loadEnvFallbackConfigMock).not.toHaveBeenCalled();
  });

  it("falls back to legacy openai config and exports env vars", async () => {
    const settings = {
      getActiveProviderConfig: vi.fn(async () => undefined),
    } as any;
    loadEnvFallbackConfigMock.mockResolvedValue({
      provider: "openai",
      apiKey: "secret",
      model: "gpt-4o-mini",
      baseURL: "https://example.test/v1",
      timeoutMs: 15000,
      envMap: {
        OPENAI_API_KEY: "secret",
        OPENAI_MODEL: "gpt-4o-mini",
      },
    });

    const result = await resolveProviderConfig(settings, "E:\\repo");

    expect(result).toEqual({
      config: {
        type: "openai",
        apiKey: "secret",
        model: "gpt-4o-mini",
        baseUrl: "https://example.test/v1",
        timeoutMs: 15000,
      },
      envMap: {
        OPENAI_API_KEY: "secret",
        OPENAI_MODEL: "gpt-4o-mini",
      },
    });
    expect(process.env.OPENAI_API_KEY).toBe("secret");
  });

  it("builds provider adapters for openai-compatible, claude-cli, and anthropic configs", () => {
    buildProviderAdapter(
      {
        type: "openai-compatible",
        apiKey: "secret",
        model: "gpt-4o-mini",
        baseUrl: "https://example.test/v1",
      },
      "E:\\repo",
      "system prompt",
      {},
      { fastMode: true },
    );
    expect(openAICtor).toHaveBeenCalledWith(
      expect.objectContaining({ type: "openai-compatible" }),
      expect.stringContaining("the app is configured to use an OpenAI-compatible provider"),
      { fastMode: true },
    );

    buildProviderAdapter(
      {
        type: "claude-cli",
        model: "claude-sonnet",
        cliPath: "C:\\tools\\claude.exe",
      },
      "E:\\repo",
      "system prompt",
      { HELLO: "world" },
      { fastMode: true },
    );
    expect(claudeCliCtor).toHaveBeenCalledWith(
      expect.objectContaining({ type: "claude-cli" }),
      "E:\\repo",
      { HELLO: "world" },
      expect.stringContaining('you are currently running through Claude CLI with configured model "claude-sonnet"'),
      { fastMode: true },
    );

    buildProviderAdapter(
      {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      "E:\\repo",
      "system prompt",
      {},
      { fastMode: true },
    );
    expect(anthropicCtor).toHaveBeenCalledWith(
      expect.objectContaining({ type: "anthropic" }),
      expect.stringContaining('the app is configured to use the official Anthropic provider with model "claude-sonnet"'),
      { fastMode: true },
    );
  });

  it("builds a stable identity note and marks openai-compatible runtimes as lower confidence", () => {
    const note = buildKainClawRuntimeIdentityNote({
      type: "openai-compatible",
      apiKey: "secret",
      model: "gpt-4.1",
      baseUrl: "https://gateway.example/v1",
    });

    expect(note).toContain("Your identity is KainClaw.");
    expect(note).toContain("programming, document editing, information search, debugging, image generation, and UI/page design tasks");
    expect(note).toContain('the app is configured to use an OpenAI-compatible provider with model "gpt-4.1" via https://gateway.example/v1.');
    expect(note).toContain("The true upstream model may be replaced, aliased, or masked by the third-party gateway");
  });

  it("appends the runtime identity note to the base system prompt", () => {
    const prompt = buildProviderSystemPrompt("base prompt", {
      type: "openai",
      apiKey: "secret",
      model: "gpt-4.1",
    });

    expect(prompt).toContain("base prompt");
    expect(prompt).toContain("# Runtime Identity Note");
    expect(prompt).toContain("Your identity is KainClaw.");
    expect(prompt).toContain('the app is configured to use the official OpenAI provider with model "gpt-4.1"');
  });
});
