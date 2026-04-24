import { describe, expect, it, vi } from "vitest";

import { createPromptSharedBindings } from "./promptBindingsHost";

describe("promptBindingsHost", () => {
  it("creates shared prompt bindings for history, transcript access, provider creation, and phase activity", () => {
    const getConversationHistory = vi.fn(() => [
      { role: "user" as const, content: "hello" },
    ]);
    const getCurrentSessionId = vi.fn(() => "session-1");
    const getTranscriptFilePath = vi.fn(() => "E:\\repo\\.transcript.jsonl");
    const buildProviderAdapter = vi.fn(() => ({ runStep: vi.fn() }));
    const addPhaseActivity = vi.fn(() => "activity-1");
    const finishPhaseActivity = vi.fn();

    const bindings = createPromptSharedBindings({
      getConversationHistory,
      isSessionPersistenceEnabled: () => true,
      getCurrentSessionId,
      getTranscriptFilePath,
      buildProviderAdapter,
      addPhaseActivity,
      finishPhaseActivity,
    });

    expect(bindings.getConversationHistory()).toEqual([
      { role: "user", content: "hello" },
    ]);
    expect(bindings.getTranscriptPath()).toBe("E:\\repo\\.transcript.jsonl");
    expect(getTranscriptFilePath).toHaveBeenCalledWith("session-1");

    bindings.createProviderAdapter({
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      workspaceRoot: "E:\\repo",
      systemPrompt: "system prompt",
      envMap: { HELLO: "world" },
    });
    bindings.addPhaseActivity("label", "detail", "running");
    bindings.finishPhaseActivity("activity-1", "done", "ok");

    expect(buildProviderAdapter).toHaveBeenCalledWith({
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      workspaceRoot: "E:\\repo",
      systemPrompt: "system prompt",
      envMap: { HELLO: "world" },
    });
    expect(addPhaseActivity).toHaveBeenCalledWith("label", "detail", "running");
    expect(finishPhaseActivity).toHaveBeenCalledWith("activity-1", "done", "ok");
  });

  it("omits transcript path when persistence is disabled or missing a session id", () => {
    const noPersistence = createPromptSharedBindings({
      getConversationHistory: () => [],
      isSessionPersistenceEnabled: () => false,
      getCurrentSessionId: () => "session-1",
      getTranscriptFilePath: vi.fn(),
      buildProviderAdapter: vi.fn(() => ({ runStep: vi.fn() })),
      addPhaseActivity: vi.fn(() => "activity-1"),
      finishPhaseActivity: vi.fn(),
    });
    const noSession = createPromptSharedBindings({
      getConversationHistory: () => [],
      isSessionPersistenceEnabled: () => true,
      getCurrentSessionId: () => undefined,
      getTranscriptFilePath: vi.fn(),
      buildProviderAdapter: vi.fn(() => ({ runStep: vi.fn() })),
      addPhaseActivity: vi.fn(() => "activity-1"),
      finishPhaseActivity: vi.fn(),
    });

    expect(noPersistence.getTranscriptPath()).toBeUndefined();
    expect(noSession.getTranscriptPath()).toBeUndefined();
  });
});
