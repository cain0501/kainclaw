import { describe, expect, it, vi } from "vitest";

import {
  buildSessionRuntimeState,
  countConversationUserTurnsForPlanReminder,
  createConversationRuntimeStateBindings,
  deserializePendingPlanVerificationState,
  getPendingPlanVerificationReminderTurnCount,
  markPendingPlanVerificationCompleted,
  markPendingPlanVerificationStarted,
  persistSessionRuntimeState,
  resetPendingPlanVerificationToAwaitingStart,
  restoreModelConversation,
  serializeModelConversation,
  serializePendingPlanVerificationState,
} from "./conversationRuntimeStateHost";
import type { CompactBoundarySessionState } from "./storage/sessionRepository";

const pendingPlanVerification = {
  planFilePath: ".omx/plans/test.md",
  planContent: "1. Build\n2. Verify",
  approvedAtUserTurnCount: 2,
  verificationStarted: false,
  verificationCompleted: false,
};

const compactBoundary = {
  trigger: "manual" as const,
  compactedAt: 1700000000000,
  preTokens: 20000,
  postTokens: 8000,
  messagesSummarized: 12,
  messagesKept: 6,
  preservedRecentMessages: true,
  transcriptPath: "E:\\repo\\.transcript.jsonl",
};

describe("conversationRuntimeStateHost", () => {
  it("counts user turns while skipping history commands", () => {
    const turnCount = countConversationUserTurnsForPlanReminder({
      sessionMessages: [
        { role: "user", content: "/review" },
        { role: "assistant", content: "ignored" },
        { role: "user", content: "Implement feature" },
        { role: "user", content: "/compact" },
        { role: "user", content: "Verify result" },
      ],
      getHistoryCommandBehavior: prompt =>
        prompt.startsWith("/") ? "exclude" : null,
    });

    expect(turnCount).toBe(2);
  });

  it("computes pending verification reminders and lifecycle transitions", () => {
    const reminderTurnCount = getPendingPlanVerificationReminderTurnCount({
      pendingPlanVerification,
      sessionMessages: [
        { role: "user", content: "Implement feature" },
        { role: "user", content: "Verify result" },
        { role: "user", content: "Another turn" },
        { role: "user", content: "Fourth turn" },
      ],
      turnsBetweenReminders: 2,
      getHistoryCommandBehavior: () => null,
    });

    expect(reminderTurnCount).toBe(2);
    expect(markPendingPlanVerificationStarted(pendingPlanVerification)).toMatchObject({
      verificationStarted: true,
      verificationCompleted: false,
    });
    expect(markPendingPlanVerificationCompleted(pendingPlanVerification)).toMatchObject({
      verificationStarted: true,
      verificationCompleted: true,
    });
    expect(
      resetPendingPlanVerificationToAwaitingStart({
        ...pendingPlanVerification,
        verificationStarted: true,
        verificationCompleted: true,
      }),
    ).toMatchObject({
      verificationStarted: false,
      verificationCompleted: false,
    });
  });

  it("serializes and restores pending verification and model conversation state", () => {
    expect(
      deserializePendingPlanVerificationState(
        serializePendingPlanVerificationState(pendingPlanVerification),
      ),
    ).toEqual(pendingPlanVerification);

    const conversationMessages = [
      {
        role: "user" as const,
        content: "hello",
        attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
      },
      { role: "assistant" as const, content: "world" },
    ];
    expect(serializeModelConversation(conversationMessages)).toEqual([
      {
        role: "user",
        content: "hello",
        attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
      },
      { role: "assistant", content: "world" },
    ]);

    const target = [{ role: "user" as const, content: "old" }];
    restoreModelConversation({
      modelConversation: [
        {
          role: "assistant",
          content: "restored",
          attachments: [{ data: "RUZHSA==", mimeType: "image/jpeg" }],
        },
      ],
      conversationMessages: target,
      rebuildConversationMessagesFromSession: () => {
        throw new Error("should not rebuild");
      },
    });
    expect(target).toEqual([
      {
        role: "assistant",
        content: "restored",
        attachments: [{ data: "RUZHSA==", mimeType: "image/jpeg" }],
      },
    ]);
  });

  it("builds and persists runtime state only when persistence is enabled", () => {
    const saveRuntimeState = vi.fn(async () => undefined);
    const conversationMessages = [
      {
        role: "user" as const,
        content: "hello",
        attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
      },
    ];

    expect(
      buildSessionRuntimeState({
        pendingPlanVerification,
        conversationMessages,
        compactBoundary,
      }),
    ).toEqual({
      pendingPlanVerification,
      compactBoundary,
      modelConversation: [
        {
          role: "user",
          content: "hello",
          attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
        },
      ],
    });

    const persisted = persistSessionRuntimeState({
      enabled: true,
      currentSessionId: "session-1",
      pendingPlanVerification,
      conversationMessages,
      compactBoundary,
      saveRuntimeState,
    });
    expect(persisted).toBe(true);
    expect(saveRuntimeState).toHaveBeenCalledWith("session-1", {
      pendingPlanVerification,
      compactBoundary,
      modelConversation: [
        {
          role: "user",
          content: "hello",
          attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
        },
      ],
    });

    expect(
      persistSessionRuntimeState({
        enabled: false,
        currentSessionId: "session-1",
        pendingPlanVerification,
        conversationMessages,
        saveRuntimeState,
      }),
    ).toBe(false);
  });

  it("creates live bindings for pending plan verification state transitions", () => {
    let currentState = { ...pendingPlanVerification };
    const persist = vi.fn();
    const saveRuntimeState = vi.fn(async () => undefined);
    const conversationMessages = [{ role: "assistant" as const, content: "existing" }];
    const rebuildConversationMessagesFromSession = vi.fn();
    let currentCompactBoundary: CompactBoundarySessionState | undefined =
      compactBoundary;

    const bindings = createConversationRuntimeStateBindings({
      getPendingPlanVerification: () => currentState,
      setPendingPlanVerification: nextState => {
        currentState = nextState!;
      },
      getCompactBoundary: () => currentCompactBoundary,
      setCompactBoundary: nextBoundary => {
        currentCompactBoundary = nextBoundary!;
      },
      persist,
      getPersistenceEnabled: () => true,
      getCurrentSessionId: () => "session-1",
      getSessionMessages: () => [
        { role: "user", content: "first" },
        { role: "user", content: "second" },
        { role: "user", content: "third" },
        { role: "user", content: "fourth" },
      ],
      getConversationMessages: () => conversationMessages,
      saveRuntimeState,
      rebuildConversationMessagesFromSession,
      getTurnsBetweenReminders: () => 2,
      getHistoryCommandBehavior: () => null,
    });

    expect(bindings.getPendingPlanVerificationReminderTurnCount()).toBe(2);

    bindings.markPendingPlanVerificationStarted();
    expect(currentState.verificationStarted).toBe(true);

    bindings.resetPendingPlanVerificationToAwaitingStart();
    expect(currentState.verificationStarted).toBe(false);
    expect(currentState.verificationCompleted).toBe(false);

    bindings.markPendingPlanVerificationCompleted();
    expect(currentState.verificationCompleted).toBe(true);

    bindings.setPendingPlanVerificationState(undefined, { persist: false });
    expect(currentState).toBeUndefined();
    expect(persist).toHaveBeenCalledTimes(3);

    expect(bindings.persistCurrentSessionRuntimeState()).toBe(true);
    expect(saveRuntimeState).toHaveBeenCalledWith("session-1", {
      pendingPlanVerification: undefined,
      compactBoundary,
      modelConversation: [{ role: "assistant", content: "existing" }],
    });

    bindings.restoreModelConversationFromRuntime(undefined);
    expect(rebuildConversationMessagesFromSession).toHaveBeenCalledTimes(1);

    bindings.restoreCompactBoundaryFromRuntime(undefined);
    expect(currentCompactBoundary).toBeUndefined();
  });
});
