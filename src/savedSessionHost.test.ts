import { describe, expect, it } from "vitest";

import {
  applySavedSessionActivation,
  buildSavedSessionActivationState,
  createSavedSessionActivationBindings,
  createSavedSessionActivationBindingsFactory,
  loadSavedSessionPayload,
  tryRestoreSavedSessionWithHost,
} from "./savedSessionHost";

describe("savedSessionHost", () => {
  it("loads saved session payloads and reports visible content", async () => {
    const result = await loadSavedSessionPayload({
      sessionId: "session-1",
      loadMessages: async () => [
        { role: "user", content: "hello" },
        { role: "assistant", content: "done", kind: "thinking" },
      ],
      loadRuntimeState: async () => ({
        modelConversation: [{ role: "user", content: "hello" }],
      }),
    });

    expect(result.hasVisibleContent).toBe(true);
    expect(result.restoredSession).toEqual({
      currentSessionId: "session-1",
      sessionMessages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "done", kind: "thinking" },
      ],
      baselineCount: 2,
    });
  });

  it("treats pending plan verification as visible content even without transcript messages", async () => {
    const result = await loadSavedSessionPayload({
      sessionId: "session-1",
      loadMessages: async () => [],
      loadRuntimeState: async () => ({
        pendingPlanVerification: {
          planFilePath: "plan.md",
          planContent: "1. Do work",
          approvedAtUserTurnCount: 1,
          verificationStarted: false,
          verificationCompleted: false,
        },
        compactBoundary: {
          trigger: "manual",
          compactedAt: 1700000000000,
          preTokens: 20000,
          postTokens: 8000,
          messagesSummarized: 12,
          messagesKept: 6,
          preservedRecentMessages: true,
        },
      }),
    });

    expect(result.hasVisibleContent).toBe(true);
    expect(result.restoredSession.baselineCount).toBe(0);
  });

  it("reports empty payloads when there are no transcript messages and no pending verification", async () => {
    const result = await loadSavedSessionPayload({
      sessionId: "session-1",
      loadMessages: async () => [],
      loadRuntimeState: async () => ({}),
    });

    expect(result.hasVisibleContent).toBe(false);
    expect(result.restoredSession).toEqual({
      currentSessionId: "session-1",
      sessionMessages: [],
      baselineCount: 0,
    });
  });

  it("builds a saved-session activation state from the loaded payload", async () => {
    const payload = await loadSavedSessionPayload({
      sessionId: "session-1",
      loadMessages: async () => [
        { role: "user", content: "hello" },
      ],
      loadRuntimeState: async () => ({
        pendingPlanVerification: {
          planFilePath: "plan.md",
          planContent: "1. Do work",
          approvedAtUserTurnCount: 1,
          verificationStarted: false,
          verificationCompleted: false,
        },
        compactBoundary: {
          trigger: "manual",
          compactedAt: 1700000000000,
          preTokens: 20000,
          postTokens: 8000,
          messagesSummarized: 12,
          messagesKept: 6,
          preservedRecentMessages: true,
        },
      }),
    });

    expect(buildSavedSessionActivationState({ payload })).toEqual({
      currentSessionId: "session-1",
      sessionMessages: [
        { role: "user", content: "hello" },
      ],
      modelConversation: undefined,
      pendingPlanVerification: {
        planFilePath: "plan.md",
        planContent: "1. Do work",
        approvedAtUserTurnCount: 1,
        verificationStarted: false,
        verificationCompleted: false,
      },
      compactBoundary: {
        trigger: "manual",
        compactedAt: 1700000000000,
        preTokens: 20000,
        postTokens: 8000,
        messagesSummarized: 12,
        messagesKept: 6,
        preservedRecentMessages: true,
      },
      baselineCount: 1,
    });
  });

  it("applies a saved-session activation through callbacks", async () => {
    const payload = await loadSavedSessionPayload({
      sessionId: "session-1",
      loadMessages: async () => [
        { role: "user", content: "hello" },
      ],
      loadRuntimeState: async () => ({
        modelConversation: [{ role: "assistant", content: "stored" }],
      }),
    });

    const calls: string[] = [];
    const result = applySavedSessionActivation({
      payload,
      clearConversationBuffers: () => {
        calls.push("clear");
      },
      setCurrentSessionId: sessionId => {
        calls.push(`id:${sessionId}`);
      },
      replaceSessionMessages: messages => {
        calls.push(`messages:${messages.length}`);
      },
      restoreModelConversation: modelConversation => {
        calls.push(`model:${modelConversation?.length ?? 0}`);
      },
      restorePendingPlanVerification: pending => {
        calls.push(`pending:${pending ? "yes" : "no"}`);
      },
      restoreCompactBoundary: compactBoundary => {
        calls.push(`compact:${compactBoundary ? "yes" : "no"}`);
      },
      markConversationBaseline: count => {
        calls.push(`baseline:${count}`);
      },
    });

    expect(result.currentSessionId).toBe("session-1");
    expect(calls).toEqual([
      "clear",
      "id:session-1",
      "messages:1",
      "model:1",
      "pending:no",
      "compact:no",
      "baseline:1",
    ]);
  });

  it("builds reusable saved-session activation bindings", () => {
    const sessionMessages: Array<{ role: "user" | "assistant"; content: string }> =
      [];
    const calls: string[] = [];

    const bindings = createSavedSessionActivationBindings({
      clearConversationBuffers: () => {
        calls.push("clear");
      },
      setCurrentSessionId: sessionId => {
        calls.push(`id:${sessionId}`);
      },
      sessionMessages,
      restoreModelConversation: modelConversation => {
        calls.push(`model:${modelConversation?.length ?? 0}`);
      },
      restorePendingPlanVerification: pendingPlanVerification => {
        calls.push(`pending:${pendingPlanVerification ? "yes" : "no"}`);
      },
      restoreCompactBoundary: compactBoundary => {
        calls.push(`compact:${compactBoundary ? "yes" : "no"}`);
      },
      markConversationBaseline: count => {
        calls.push(`baseline:${count}`);
      },
    });

    bindings.clearConversationBuffers();
    bindings.setCurrentSessionId("session-1");
    bindings.replaceSessionMessages([{ role: "user", content: "hello" }]);
    bindings.restoreModelConversation([{ role: "assistant", content: "stored" }]);
    bindings.restorePendingPlanVerification(undefined);
    bindings.restoreCompactBoundary(undefined);
    bindings.markConversationBaseline(2);

    expect(sessionMessages).toEqual([{ role: "user", content: "hello" }]);
    expect(calls).toEqual([
      "clear",
      "id:session-1",
      "model:1",
      "pending:no",
      "compact:no",
      "baseline:2",
    ]);
  });

  it("builds a saved-session activation bindings factory around stable host callbacks", () => {
    const sessionMessages: Array<{ role: "user" | "assistant"; content: string }> =
      [];
    const calls: string[] = [];

    const factory = createSavedSessionActivationBindingsFactory({
      clearConversationBuffers: () => {
        calls.push("clear");
      },
      restoreModelConversation: modelConversation => {
        calls.push(`model:${modelConversation?.length ?? 0}`);
      },
      restorePendingPlanVerification: pendingPlanVerification => {
        calls.push(`pending:${pendingPlanVerification ? "yes" : "no"}`);
      },
      restoreCompactBoundary: compactBoundary => {
        calls.push(`compact:${compactBoundary ? "yes" : "no"}`);
      },
      markConversationBaseline: count => {
        calls.push(`baseline:${count}`);
      },
    });

    const bindings = factory({
      setCurrentSessionId: sessionId => {
        calls.push(`id:${sessionId}`);
      },
      sessionMessages,
    });

    bindings.clearConversationBuffers();
    bindings.setCurrentSessionId("session-1");
    bindings.replaceSessionMessages([{ role: "user", content: "hello" }]);
    bindings.restoreModelConversation([{ role: "assistant", content: "stored" }]);
    bindings.restorePendingPlanVerification(undefined);
    bindings.restoreCompactBoundary(undefined);
    bindings.markConversationBaseline(2);

    expect(sessionMessages).toEqual([{ role: "user", content: "hello" }]);
    expect(calls).toEqual([
      "clear",
      "id:session-1",
      "model:1",
      "pending:no",
      "compact:no",
      "baseline:2",
    ]);
  });

  it("tries restoring saved sessions through host callbacks and logs success", async () => {
    const calls: string[] = [];

    const restored = await tryRestoreSavedSessionWithHost({
      sessionId: "session-1",
      source: "active",
      loadMessages: async () => [{ role: "user", content: "hello" }],
      loadRuntimeState: async () => ({
        pendingPlanVerification: {
          planFilePath: "plan.md",
          planContent: "1. Do work",
          approvedAtUserTurnCount: 1,
          verificationStarted: false,
          verificationCompleted: false,
        },
      }),
      clearConversationBuffers: () => {
        calls.push("clear");
      },
      setCurrentSessionId: sessionId => {
        calls.push(`id:${sessionId}`);
      },
      replaceSessionMessages: messages => {
        calls.push(`messages:${messages.length}`);
      },
      restoreModelConversation: modelConversation => {
        calls.push(`model:${modelConversation?.length ?? 0}`);
      },
      restorePendingPlanVerification: pendingPlanVerification => {
        calls.push(`pending:${pendingPlanVerification ? "yes" : "no"}`);
      },
      restoreCompactBoundary: compactBoundary => {
        calls.push(`compact:${compactBoundary ? "yes" : "no"}`);
      },
      markConversationBaseline: count => {
        calls.push(`baseline:${count}`);
      },
      logRestoreSkippedEmpty: details => {
        calls.push(`skip:${details.source}:${details.sessionId}`);
      },
      logRestoreSuccess: details => {
        calls.push(
          `success:${details.source}:${details.sessionId}:${details.messageCount}:${details.hasPendingPlanVerification}`,
        );
      },
    });

    expect(restored).toBe(true);
    expect(calls).toEqual([
      "clear",
      "id:session-1",
      "messages:1",
      "model:0",
      "pending:yes",
      "compact:no",
      "baseline:1",
      "success:active:session-1:1:true",
    ]);
  });

  it("skips empty saved sessions and logs the skip", async () => {
    const calls: string[] = [];

    const restored = await tryRestoreSavedSessionWithHost({
      sessionId: "session-1",
      source: "workspace-fallback",
      loadMessages: async () => [],
      loadRuntimeState: async () => ({}),
      clearConversationBuffers: () => {
        calls.push("clear");
      },
      setCurrentSessionId: sessionId => {
        calls.push(`id:${sessionId}`);
      },
      replaceSessionMessages: messages => {
        calls.push(`messages:${messages.length}`);
      },
      restoreModelConversation: modelConversation => {
        calls.push(`model:${modelConversation?.length ?? 0}`);
      },
      restorePendingPlanVerification: pendingPlanVerification => {
        calls.push(`pending:${pendingPlanVerification ? "yes" : "no"}`);
      },
      restoreCompactBoundary: compactBoundary => {
        calls.push(`compact:${compactBoundary ? "yes" : "no"}`);
      },
      markConversationBaseline: count => {
        calls.push(`baseline:${count}`);
      },
      logRestoreSkippedEmpty: details => {
        calls.push(`skip:${details.source}:${details.sessionId}`);
      },
      logRestoreSuccess: details => {
        calls.push(`success:${details.source}:${details.sessionId}`);
      },
    });

    expect(restored).toBe(false);
    expect(calls).toEqual(["skip:workspace-fallback:session-1"]);
  });
});
