import { describe, expect, it, vi } from "vitest";

import {
  buildAssistantReplyPlan,
  createAssistantReplyBindings,
  createAssistantReplyBindingsFactory,
  persistAssistantReply,
  recordAssistantReplyWithHost,
} from "./assistantReplyHost";

describe("assistantReplyHost", () => {
  it("builds assistant reply messages with optional thinking summaries", () => {
    const result = buildAssistantReplyPlan({
      reply: "final answer",
      includeInConversation: true,
      thinkingSummary: "  short thinking  ",
      showThinkingSummaries: true,
    });

    expect(result).toEqual({
      normalizedThinkingSummary: "short thinking",
      sessionMessages: [
        { role: "assistant", content: "short thinking", kind: "thinking" },
        { role: "assistant", content: "final answer" },
      ],
      persistedMessages: [
        { role: "assistant", content: "short thinking", kind: "thinking" },
        { role: "assistant", content: "final answer" },
      ],
      conversationMessage: { role: "assistant", content: "final answer" },
      preview: "final answer",
    });
  });

  it("omits thinking summaries and conversation writes when disabled", () => {
    const result = buildAssistantReplyPlan({
      reply: "final answer",
      includeInConversation: false,
      thinkingSummary: "thinking",
      showThinkingSummaries: false,
    });

    expect(result).toEqual({
      normalizedThinkingSummary: undefined,
      sessionMessages: [{ role: "assistant", content: "final answer" }],
      persistedMessages: [{ role: "assistant", content: "final answer" }],
      preview: "final answer",
    });
  });

  it("persists assistant replies only when a session is active", async () => {
    const appendMessages = vi.fn(async () => undefined);
    const logPersisted = vi.fn();

    const persisted = await persistAssistantReply({
      enabled: true,
      currentSessionId: "session-1",
      persistedMessages: [{ role: "assistant", content: "final answer" }],
      preview: "final answer",
      appendMessages,
      logPersisted,
      hasThinkingSummary: false,
    });

    expect(persisted).toBe(true);
    expect(appendMessages).toHaveBeenCalledTimes(1);
    expect(logPersisted).toHaveBeenCalledWith({
      sessionId: "session-1",
      hasThinkingSummary: false,
      replyPreview: "final answer",
    });
  });

  it("skips persistence cleanly when session persistence is unavailable", async () => {
    const appendMessages = vi.fn(async () => undefined);

    const persisted = await persistAssistantReply({
      enabled: false,
      currentSessionId: undefined,
      persistedMessages: [{ role: "assistant", content: "final answer" }],
      preview: "final answer",
      appendMessages,
      hasThinkingSummary: false,
    });

    expect(persisted).toBe(false);
    expect(appendMessages).not.toHaveBeenCalled();
  });

  it("records assistant replies through host bindings and persists runtime state", async () => {
    const appendMessages = vi.fn(async () => undefined);
    const appendSessionMessages = vi.fn();
    const appendConversationMessage = vi.fn();
    const persistCurrentSessionRuntimeState = vi.fn();
    const logPersisted = vi.fn();

    await recordAssistantReplyWithHost({
      reply: "final answer",
      includeInConversation: true,
      thinkingSummary: "  short thinking  ",
      showThinkingSummaries: true,
      appendSessionMessages,
      appendConversationMessage,
      persistCurrentSessionRuntimeState,
      persistenceEnabled: true,
      currentSessionId: "session-1",
      appendMessages,
      logPersisted,
    });

    expect(appendSessionMessages).toHaveBeenCalledWith([
      { role: "assistant", content: "short thinking", kind: "thinking" },
      { role: "assistant", content: "final answer" },
    ]);
    expect(appendConversationMessage).toHaveBeenCalledWith({
      role: "assistant",
      content: "final answer",
    });
    expect(persistCurrentSessionRuntimeState).toHaveBeenCalledTimes(1);
    expect(appendMessages).toHaveBeenCalledWith(
      "session-1",
      [
        { role: "assistant", content: "short thinking", kind: "thinking" },
        { role: "assistant", content: "final answer" },
      ],
      expect.objectContaining({
        preview: "final answer",
      }),
    );
    expect(logPersisted).toHaveBeenCalledWith({
      sessionId: "session-1",
      hasThinkingSummary: true,
      replyPreview: "final answer",
    });
  });

  it("creates assistant reply bindings from live getters", async () => {
    let showThinkingSummaries = false;
    let persistenceEnabled = false;
    let currentSessionId: string | undefined;
    const appendMessages = vi.fn(async () => undefined);
    const appendSessionMessages = vi.fn();
    const appendConversationMessage = vi.fn();
    const persistCurrentSessionRuntimeState = vi.fn();

    const bindings = createAssistantReplyBindings({
      getShowThinkingSummaries: () => showThinkingSummaries,
      appendSessionMessages,
      appendConversationMessage,
      persistCurrentSessionRuntimeState,
      getPersistenceEnabled: () => persistenceEnabled,
      getCurrentSessionId: () => currentSessionId,
      appendMessages,
    });

    await bindings.recordAssistantReply("first answer", true, "thinking");
    expect(appendSessionMessages).toHaveBeenLastCalledWith([
      { role: "assistant", content: "first answer" },
    ]);
    expect(appendMessages).not.toHaveBeenCalled();

    showThinkingSummaries = true;
    persistenceEnabled = true;
    currentSessionId = "session-2";

    await bindings.recordAssistantReply("second answer", false, "thinking");
    expect(appendSessionMessages).toHaveBeenLastCalledWith([
      { role: "assistant", content: "thinking", kind: "thinking" },
      { role: "assistant", content: "second answer" },
    ]);
    expect(appendMessages).toHaveBeenCalledWith(
      "session-2",
      [
        { role: "assistant", content: "thinking", kind: "thinking" },
        { role: "assistant", content: "second answer" },
      ],
      expect.objectContaining({
        preview: "second answer",
      }),
    );
  });

  it("builds assistant reply bindings from a stable factory", async () => {
    let showThinkingSummaries = false;
    let persistenceEnabled = false;
    let currentSessionId: string | undefined;
    const appendMessages = vi.fn(async () => undefined);
    const appendSessionMessages = vi.fn();
    const appendConversationMessage = vi.fn();
    const persistCurrentSessionRuntimeState = vi.fn();

    const factory = createAssistantReplyBindingsFactory({
      getShowThinkingSummaries: () => showThinkingSummaries,
      persistCurrentSessionRuntimeState,
      getPersistenceEnabled: () => persistenceEnabled,
      getCurrentSessionId: () => currentSessionId,
      appendMessages,
    });
    const bindings = factory({
      appendSessionMessages,
      appendConversationMessage,
    });

    await bindings.recordAssistantReply("first answer", true, "thinking");
    expect(appendSessionMessages).toHaveBeenLastCalledWith([
      { role: "assistant", content: "first answer" },
    ]);

    showThinkingSummaries = true;
    persistenceEnabled = true;
    currentSessionId = "session-2";

    await bindings.recordAssistantReply("second answer", false, "thinking");
    expect(appendSessionMessages).toHaveBeenLastCalledWith([
      { role: "assistant", content: "thinking", kind: "thinking" },
      { role: "assistant", content: "second answer" },
    ]);
    expect(appendMessages).toHaveBeenCalledWith(
      "session-2",
      [
        { role: "assistant", content: "thinking", kind: "thinking" },
        { role: "assistant", content: "second answer" },
      ],
      expect.objectContaining({
        preview: "second answer",
      }),
    );
  });
});
