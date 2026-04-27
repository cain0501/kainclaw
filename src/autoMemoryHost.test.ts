import { describe, expect, it, vi } from "vitest";

import {
  buildAutoMemoryHistory,
  createAutoMemoryHostBindings,
  createAutoMemoryHostBindingsFactory,
} from "./autoMemoryHost";

describe("autoMemoryHost", () => {
  it("builds normalized history from session messages", () => {
    expect(
      buildAutoMemoryHistory([
        { role: "user", content: "hello" },
        { role: "assistant", content: "done", kind: "error" },
      ]),
    ).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "done" },
    ]);
  });

  it("marks the current conversation baseline using the live conversation key", () => {
    let conversationKey = "session-1";
    const markConversationBaseline = vi.fn();

    const bindings = createAutoMemoryHostBindings({
      getConversationKey: () => conversationKey,
      getPlanModeState: () => ({ active: false }),
      getSessionMessages: () => [],
      createProviderAdapter: () => ({ runStep: vi.fn() } as any),
      autoMemory: {
        markConversationBaseline,
        resetConversation: vi.fn(),
        queueExtraction: vi.fn(),
      },
    });

    bindings.markCurrentConversationBaseline(3);
    conversationKey = "session-2";
    bindings.markCurrentConversationBaseline(5);

    expect(markConversationBaseline).toHaveBeenNthCalledWith(1, "session-1", 3);
    expect(markConversationBaseline).toHaveBeenNthCalledWith(2, "session-2", 5);
  });

  it("forwards explicit conversation resets to auto-memory runtime", () => {
    const resetConversation = vi.fn();

    const bindings = createAutoMemoryHostBindings({
      getConversationKey: () => "session-1",
      getPlanModeState: () => ({ active: false }),
      getSessionMessages: () => [],
      createProviderAdapter: () => ({ runStep: vi.fn() } as any),
      autoMemory: {
        markConversationBaseline: vi.fn(),
        resetConversation,
        queueExtraction: vi.fn(),
      },
    });

    bindings.resetConversation("session-7");

    expect(resetConversation).toHaveBeenCalledWith("session-7");
  });

  it("skips queueing auto-memory extraction while plan mode is active", () => {
    const queueExtraction = vi.fn();

    const bindings = createAutoMemoryHostBindings({
      getConversationKey: () => "session-1",
      getPlanModeState: () => ({ active: true }),
      getSessionMessages: () => [{ role: "user", content: "hello" }],
      createProviderAdapter: () => ({ runStep: vi.fn() } as any),
      autoMemory: {
        markConversationBaseline: vi.fn(),
        resetConversation: vi.fn(),
        queueExtraction,
      },
    });

    bindings.queueAutoMemoryExtraction({
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: { TEST: "1" },
    });

    expect(queueExtraction).not.toHaveBeenCalled();
  });

  it("queues extraction with normalized history and provider factory wiring", () => {
    const queueExtraction = vi.fn();
    const provider = { runStep: vi.fn() } as any;
    const createProviderAdapter = vi.fn(() => provider);

    const bindings = createAutoMemoryHostBindings({
      getConversationKey: () => "session-3",
      getPlanModeState: () => ({ active: false }),
      getSessionMessages: () => [
        { role: "user", content: "hello" },
        { role: "assistant", content: "done", kind: "thinking" },
      ],
      createProviderAdapter,
      autoMemory: {
        markConversationBaseline: vi.fn(),
        resetConversation: vi.fn(),
        queueExtraction,
      },
    });

    bindings.queueAutoMemoryExtraction({
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      config: {
        type: "openai",
        apiKey: "secret",
        model: "gpt-4.1",
      },
      envMap: { OPENAI_API_KEY: "secret" },
    });

    expect(queueExtraction).toHaveBeenCalledTimes(1);
    const request = queueExtraction.mock.calls[0]?.[0];
    expect(request).toMatchObject({
      conversationKey: "session-3",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      history: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "done" },
      ],
    });
    expect(request.createProvider("system prompt")).toBe(provider);
    expect(createProviderAdapter).toHaveBeenCalledWith({
      config: {
        type: "openai",
        apiKey: "secret",
        model: "gpt-4.1",
      },
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      systemPrompt: "system prompt",
      envMap: { OPENAI_API_KEY: "secret" },
    });
  });

  it("builds auto-memory bindings from a stable factory", () => {
    const queueExtraction = vi.fn();
    const provider = { runStep: vi.fn() } as any;
    const createProviderAdapter = vi.fn(() => provider);
    let conversationKey = "session-3";
    let planModeActive = false;
    const sessionMessages = [
      { role: "user" as const, content: "hello" },
      { role: "assistant" as const, content: "done", kind: "thinking" as const },
    ];

    const factory = createAutoMemoryHostBindingsFactory({
      createProviderAdapter,
      autoMemory: {
        markConversationBaseline: vi.fn(),
        resetConversation: vi.fn(),
        queueExtraction,
      },
    });
    const bindings = factory({
      getConversationKey: () => conversationKey,
      getPlanModeState: () => ({ active: planModeActive }),
      getSessionMessages: () => sessionMessages,
    });

    bindings.queueAutoMemoryExtraction({
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      config: {
        type: "openai",
        apiKey: "secret",
        model: "gpt-4.1",
      },
      envMap: { OPENAI_API_KEY: "secret" },
    });

    expect(queueExtraction).toHaveBeenCalledTimes(1);
    expect(queueExtraction.mock.calls[0]?.[0]).toMatchObject({
      conversationKey: "session-3",
      history: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "done" },
      ],
    });

    queueExtraction.mockClear();
    conversationKey = "session-4";
    planModeActive = true;
    bindings.queueAutoMemoryExtraction({
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      config: {
        type: "openai",
        apiKey: "secret",
        model: "gpt-4.1",
      },
      envMap: { OPENAI_API_KEY: "secret" },
    });
    expect(queueExtraction).not.toHaveBeenCalled();
  });
});
