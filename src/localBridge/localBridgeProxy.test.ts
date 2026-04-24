import { describe, expect, it, vi } from "vitest";
import type { IProviderAdapter, NormalizedStep } from "../agent/providers/IProviderAdapter";
import { createLocalBridgeProxyHandler } from "./localBridgeProxy";

const { buildProviderAdapterMock } = vi.hoisted(() => ({
  buildProviderAdapterMock: vi.fn(),
}));

vi.mock("../providerHost", () => ({
  buildProviderAdapter: buildProviderAdapterMock,
}));

describe("createLocalBridgeProxyHandler", () => {
  it("builds the configured provider adapter and forwards the proxy request", async () => {
    const step: NormalizedStep = {
      text: "proxy reply",
      toolCalls: [],
      done: true,
    };
    const runStep = vi.fn<IProviderAdapter["runStep"]>(async (_messages, _tools, onToken, abortSignal) => {
      onToken("chunk-1");
      expect(abortSignal).toBeDefined();
      return step;
    });

    buildProviderAdapterMock.mockReturnValue({
      runStep,
    } satisfies IProviderAdapter);

    const handler = createLocalBridgeProxyHandler({
      resolveRuntimeContext: async () => ({
        config: {
          type: "openai",
          apiKey: "test-key",
          model: "gpt-5",
        },
        workspaceRoot: "E:\\repo",
        envMap: {
          OPENAI_API_KEY: "test-key",
        },
        systemPrompt: "bridge system prompt",
      }),
    });

    const onToken = vi.fn();
    const abortController = new AbortController();
    const request = {
      messages: [{ role: "user" as const, content: "hello" }],
      tools: [{ type: "function", function: { name: "echo" } }],
      stream: true,
    };

    const result = await handler(request, {
      onToken,
      abortSignal: abortController.signal,
    });

    expect(buildProviderAdapterMock).toHaveBeenCalledWith(
      {
        type: "openai",
        apiKey: "test-key",
        model: "gpt-5",
      },
      "E:\\repo",
      "bridge system prompt",
      {
        OPENAI_API_KEY: "test-key",
      },
    );
    expect(runStep).toHaveBeenCalledWith(
      request.messages,
      request.tools,
      onToken,
      abortController.signal,
    );
    expect(onToken).toHaveBeenCalledWith("chunk-1");
    expect(result).toEqual(step);
  });
});
