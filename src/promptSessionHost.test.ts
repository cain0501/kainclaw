import { describe, expect, it, vi } from "vitest";

import { persistUserPromptSession } from "./promptSessionHost";

describe("promptSessionHost", () => {
  it("does nothing when session persistence is disabled", async () => {
    const createSession = vi.fn();
    const setActiveSessionId = vi.fn();
    const ensureSession = vi.fn();
    const appendMessages = vi.fn();

    const result = await persistUserPromptSession({
      enabled: false,
      currentSessionId: "session-1",
      workspaceHash: "hash-1",
      prompt: "Explain this file",
      sessionMessagesLength: 1,
      createSession,
      setActiveSessionId,
      ensureSession,
      appendMessages,
    });

    expect(result).toEqual({
      currentSessionId: "session-1",
      promptTitle: "Explain this file",
      promptPreview: "Explain this file",
    });
    expect(createSession).not.toHaveBeenCalled();
    expect(appendMessages).not.toHaveBeenCalled();
  });

  it("creates a session and persists the first user prompt", async () => {
    const createSession = vi.fn(async () => undefined);
    const setActiveSessionId = vi.fn(async () => undefined);
    const ensureSession = vi.fn(async () => undefined);
    const appendMessages = vi.fn(async () => undefined);

    const result = await persistUserPromptSession({
      enabled: true,
      workspaceHash: "hash-1",
      prompt: "Implement background task recovery",
      sessionMessagesLength: 1,
      createSession,
      setActiveSessionId,
      ensureSession,
      appendMessages,
      createSessionId: () => "session-new",
    });

    expect(createSession).toHaveBeenCalledWith(
      "session-new",
      "hash-1",
      "Implement background task recovery",
    );
    expect(setActiveSessionId).toHaveBeenCalledWith("session-new");
    expect(ensureSession).toHaveBeenCalledWith(
      "session-new",
      "hash-1",
      "Implement background task recovery",
    );
    expect(appendMessages).toHaveBeenCalledTimes(1);
    const firstAppendCall = appendMessages.mock.calls[0] as any[] | undefined;
    expect(firstAppendCall).toBeDefined();
    expect(firstAppendCall?.[0]).toBe("session-new");
    expect(firstAppendCall?.[1]).toEqual([
      { role: "user", content: "Implement background task recovery" },
    ]);
    expect(firstAppendCall?.[2]).toMatchObject({
      title: "Implement background task recovery",
      preview: "Implement background task recovery",
    });
    expect(result).toMatchObject({
      currentSessionId: "session-new",
      createdSessionId: "session-new",
      persistedSessionId: "session-new",
    });
  });

  it("reuses the current session and only updates timestamp for later prompts", async () => {
    const appendMessages = vi.fn(async () => undefined);

    const result = await persistUserPromptSession({
      enabled: true,
      currentSessionId: "session-existing",
      workspaceHash: "hash-1",
      prompt: "Follow up on the previous fix",
      sessionMessagesLength: 3,
      createSession: async () => undefined,
      setActiveSessionId: async () => undefined,
      ensureSession: async () => undefined,
      appendMessages,
    });

    expect(appendMessages).toHaveBeenCalledTimes(1);
    const firstAppendCall = appendMessages.mock.calls[0] as any[] | undefined;
    expect(firstAppendCall).toBeDefined();
    expect(firstAppendCall?.[0]).toBe("session-existing");
    expect(firstAppendCall?.[2]).toEqual({
      updatedAt: expect.any(Number),
    });
    expect(result).toMatchObject({
      currentSessionId: "session-existing",
      createdSessionId: undefined,
      persistedSessionId: "session-existing",
      promptTitle: "Follow up on the previous fix",
    });
  });
});
