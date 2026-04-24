import { describe, expect, it, vi } from "vitest";

import {
  beginNewConversationSession,
  buildClearedConversationState,
  buildDeletedActiveSessionState,
  buildSavedSessionRestoreState,
  clearConversationHostState,
  finalizeSessionMutation,
  mapSessionViewMessages,
} from "./sessionLifecycleHost";

describe("sessionLifecycleHost", () => {
  const uuidLike = "11111111-1111-1111-1111-111111111111" as const;
  const uuidLike2 = "22222222-2222-2222-2222-222222222222" as const;

  it("builds a cleared conversation state with a fresh transient id", () => {
    expect(buildClearedConversationState(() => uuidLike)).toEqual({
      currentSessionId: undefined,
      transientConversationId: uuidLike,
    });
  });

  it("starts a persistent new session when session persistence is enabled", async () => {
    const createSession = vi.fn(async () => undefined);
    const setActiveSessionId = vi.fn(async () => undefined);

    const result = await beginNewConversationSession({
      persistenceEnabled: true,
      workspaceHash: "hash-1",
      defaultTitle: "New Chat",
      createSession,
      setActiveSessionId,
      createConversationId: () => uuidLike,
    });

    expect(createSession).toHaveBeenCalledWith(uuidLike, "hash-1", "New Chat");
    expect(setActiveSessionId).toHaveBeenCalledWith(uuidLike);
    expect(result).toEqual({
      currentSessionId: uuidLike,
      createdSessionId: uuidLike,
      transient: false,
    });
  });

  it("starts a transient conversation when persistence is disabled", async () => {
    const setActiveSessionId = vi.fn(async () => undefined);

    const result = await beginNewConversationSession({
      persistenceEnabled: false,
      workspaceHash: "hash-1",
      defaultTitle: "New Chat",
      createSession: async () => undefined,
      setActiveSessionId,
      createConversationId: () => uuidLike2,
    });

    expect(setActiveSessionId).toHaveBeenCalledWith("");
    expect(result).toEqual({
      currentSessionId: undefined,
      transientConversationId: uuidLike2,
      transient: true,
    });
  });

  it("maps stored messages into session-view rows", () => {
    expect(
      mapSessionViewMessages([
        { role: "user", content: "hello" },
        { role: "assistant", content: "done", kind: "thinking" },
      ]),
    ).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "done", kind: "thinking" },
    ]);
  });

  it("builds saved-session restore state with mapped messages and baseline count", () => {
    const result = buildSavedSessionRestoreState({
      sessionId: "session-1",
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "done", kind: "thinking" },
      ],
    });

    expect(result).toEqual({
      currentSessionId: "session-1",
      sessionMessages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "done", kind: "thinking" },
      ],
      baselineCount: 2,
    });
  });

  it("builds the deleted-active-session state with a fresh transient id", () => {
    expect(
      buildDeletedActiveSessionState(() => uuidLike2),
    ).toEqual({
      currentSessionId: undefined,
      transientConversationId: uuidLike2,
      baselineCount: 0,
    });
  });

  it("finalizes a hydrated session mutation and reloads the session list when needed", async () => {
    const calls: string[] = [];

    await finalizeSessionMutation({
      workspaceRoot: "E:\\repo",
      hydrateWorkspace: true,
      ensureConversationWorktreeHydrated: async workspaceRoot => {
        calls.push(`hydrate:${workspaceRoot}`);
      },
      postState: () => {
        calls.push("post");
      },
      refreshWorkspaceStatus: () => {
        calls.push("refresh");
      },
      shouldRefreshSessionsList: () => true,
      handleSessionsLoad: async () => {
        calls.push("sessions");
      },
    });

    expect(calls).toEqual([
      "hydrate:E:\\repo",
      "post",
      "refresh",
      "sessions",
    ]);
  });

  it("clears conversation host state in the expected order", () => {
    const calls: string[] = [];
    let currentSessionId: string | undefined = "session-1";
    let transientConversationId = "old-transient";

    clearConversationHostState({
      resetAutoMemoryConversation: () => {
        calls.push("resetAutoMemory");
      },
      resetActiveRuntimeControllers: () => {
        calls.push("resetControllers");
      },
      clearConversationBuffers: () => {
        calls.push("clearBuffers");
      },
      setCurrentSessionId: id => {
        currentSessionId = id;
        calls.push(`current:${id ?? "undefined"}`);
      },
      setTransientConversationId: id => {
        transientConversationId = id;
        calls.push(`transient:${id}`);
      },
      resetPlanMode: () => {
        calls.push("resetPlanMode");
      },
      clearPendingPlanVerification: () => {
        calls.push("clearPendingPlanVerification");
      },
      clearPendingPromptAttachments: () => {
        calls.push("clearPendingPromptAttachments");
      },
      markConversationBaseline: count => {
        calls.push(`baseline:${count}`);
      },
      clearStreamingState: () => {
        calls.push("clearStreamingState");
      },
      clearStreamingText: () => {
        calls.push("clearStreamingText");
      },
      resetActivities: () => {
        calls.push("resetActivities");
      },
      clearCachedTools: () => {
        calls.push("clearCachedTools");
      },
      disposeSwarm: () => {
        calls.push("disposeSwarm");
      },
      postState: () => {
        calls.push("postState");
      },
      createConversationId: () => uuidLike,
    });

    expect(currentSessionId).toBeUndefined();
    expect(transientConversationId).toBe(uuidLike);
    expect(calls).toEqual([
      "resetAutoMemory",
      "resetControllers",
      "clearBuffers",
      "current:undefined",
      `transient:${uuidLike}`,
      "resetPlanMode",
      "clearPendingPlanVerification",
      "clearPendingPromptAttachments",
      "baseline:0",
      "clearStreamingState",
      "clearStreamingText",
      "resetActivities",
      "clearCachedTools",
      "disposeSwarm",
      "postState",
    ]);
  });
});
