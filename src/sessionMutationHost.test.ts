import { describe, expect, it } from "vitest";

import {
  clearDeletedActiveSession,
  startNewSession,
  switchToSavedSession,
} from "./sessionMutationHost";

function createSavedPayload() {
  return {
    messages: [{ role: "user", content: "hello" }],
    runtimeState: {
      modelConversation: [{ role: "assistant", content: "stored" }],
      pendingPlanVerification: {
        planFilePath: "plan.md",
        planContent: "1. Do work",
        approvedAtUserTurnCount: 1,
        verificationStarted: false,
        verificationCompleted: false,
      },
    },
    hasVisibleContent: true,
    restoredSession: {
      currentSessionId: "session-1",
      sessionMessages: [{ role: "user", content: "hello" }],
      baselineCount: 1,
    },
  };
}

describe("sessionMutationHost", () => {
  it("switches to a saved session through host callbacks", async () => {
    const calls: string[] = [];

    await switchToSavedSession({
      payload: createSavedPayload() as any,
      disposeSwarm: () => {
        calls.push("disposeSwarm");
      },
      resetActiveRuntimeControllers: () => {
        calls.push("resetRuntime");
      },
      resetPlanMode: () => {
        calls.push("resetPlan");
      },
      clearCachedTools: () => {
        calls.push("clearCache");
      },
      clearConversationBuffers: () => {
        calls.push("clearBuffers");
      },
      applySavedSessionActivation: options => {
        calls.push("applySaved");
        options.setCurrentSessionId("session-1");
        options.replaceSessionMessages([{ role: "user", content: "hello" }] as any);
        options.restoreModelConversation([{ role: "assistant", content: "stored" }]);
        options.restorePendingPlanVerification({
          planFilePath: "plan.md",
          planContent: "1. Do work",
          approvedAtUserTurnCount: 1,
          verificationStarted: false,
          verificationCompleted: false,
        });
        options.markConversationBaseline(1);
        return {
          currentSessionId: "session-1",
          sessionMessages: [{ role: "user", content: "hello" }],
          modelConversation: [{ role: "assistant", content: "stored" }],
          pendingPlanVerification: undefined,
          baselineCount: 1,
        };
      },
      setCurrentSessionId: id => {
        calls.push(`setId:${id}`);
      },
      replaceSessionMessages: messages => {
        calls.push(`messages:${messages.length}`);
      },
      restoreModelConversation: messages => {
        calls.push(`model:${messages?.length ?? 0}`);
      },
      restorePendingPlanVerification: state => {
        calls.push(`pending:${state ? "yes" : "no"}`);
      },
      markConversationBaseline: count => {
        calls.push(`baseline:${count}`);
      },
      setActiveSessionId: async id => {
        calls.push(`active:${id}`);
      },
      finalizeMutation: async () => {
        calls.push("finalize");
      },
    });

    expect(calls).toEqual([
      "disposeSwarm",
      "resetRuntime",
      "resetPlan",
      "clearCache",
      "clearBuffers",
      "applySaved",
      "setId:session-1",
      "messages:1",
      "model:1",
      "pending:yes",
      "baseline:1",
      "active:session-1",
      "finalize",
    ]);
  });

  it("clears a deleted active session through host callbacks", async () => {
    const calls: string[] = [];

    await clearDeletedActiveSession({
      disposeSwarm: () => {
        calls.push("disposeSwarm");
      },
      resetActiveRuntimeControllers: () => {
        calls.push("resetRuntime");
      },
      clearConversationBuffers: () => {
        calls.push("clearBuffers");
      },
      setCurrentSessionId: id => {
        calls.push(`setId:${id ?? "undefined"}`);
      },
      setTransientConversationId: id => {
        calls.push(`transient:${id.length}`);
      },
      resetPlanMode: () => {
        calls.push("resetPlan");
      },
      clearCachedTools: () => {
        calls.push("clearCache");
      },
      clearPendingPlanVerification: () => {
        calls.push("clearPending");
      },
      markConversationBaseline: count => {
        calls.push(`baseline:${count}`);
      },
      finalizeMutation: async () => {
        calls.push("finalize");
      },
    });

    expect(calls[0]).toBe("disposeSwarm");
    expect(calls).toContain("resetRuntime");
    expect(calls).toContain("clearBuffers");
    expect(calls).toContain("setId:undefined");
    expect(calls).toContain("resetPlan");
    expect(calls).toContain("clearPending");
    expect(calls).toContain("clearCache");
    expect(calls).toContain("baseline:0");
    expect(calls).toContain("finalize");
  });

  it("starts a new session through host callbacks", async () => {
    const calls: string[] = [];

    const result = await startNewSession({
      persistenceEnabled: true,
      workspaceHash: "hash-1",
      defaultTitle: "New Chat",
      createSession: async (id, workspaceHash, title) => {
        calls.push(`create:${id}:${workspaceHash}:${title}`);
      },
      setActiveSessionId: async id => {
        calls.push(`active:${id}`);
      },
      disposeSwarm: () => {
        calls.push("disposeSwarm");
      },
      resetActiveRuntimeControllers: () => {
        calls.push("resetRuntime");
      },
      clearConversationBuffers: () => {
        calls.push("clearBuffers");
      },
      resetPlanMode: () => {
        calls.push("resetPlan");
      },
      clearPendingPlanVerification: () => {
        calls.push("clearPending");
      },
      clearCachedTools: () => {
        calls.push("clearCache");
      },
      setCurrentSessionId: id => {
        calls.push(`setId:${id}`);
      },
      setTransientConversationId: id => {
        calls.push(`transient:${id}`);
      },
      markConversationBaseline: count => {
        calls.push(`baseline:${count}`);
      },
      finalizeMutation: async () => {
        calls.push("finalize");
      },
    });

    expect(calls[0]).toBe("disposeSwarm");
    expect(calls).toContain("resetRuntime");
    expect(calls).toContain("clearBuffers");
    expect(calls).toContain("resetPlan");
    expect(calls).toContain("clearPending");
    expect(calls).toContain("clearCache");
    expect(calls).toContain("baseline:0");
    expect(calls).toContain("finalize");
    expect(result.transient).toBe(false);
    expect(result.currentSessionId).toBeTruthy();
  });
});
