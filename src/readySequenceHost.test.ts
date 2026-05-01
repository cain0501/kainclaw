import { describe, expect, it, vi } from "vitest";

import {
  applyReadySequenceAction,
  createReadySequenceController,
  createReadySequenceControllerFactory,
  createReadySequenceRunner,
  createReadySequenceRunnerFactory,
  resolveReadySequenceAction,
  runReadySequenceWithHost,
} from "./readySequenceHost";

describe("readySequenceHost", () => {
  it("creates a ready sequence controller that deduplicates in-flight work and caches readiness", async () => {
    let resolveRun: (() => void) | undefined;
    let runCount = 0;
    const controller = createReadySequenceController({
      runReadySequence: async () => {
        runCount += 1;
        await new Promise<void>(resolve => {
          resolveRun = resolve;
        });
      },
    });

    const first = controller.ensureReadySequence();
    const second = controller.ensureReadySequence();

    expect(runCount).toBe(1);
    expect(controller.isReady()).toBe(false);

    resolveRun?.();
    await Promise.all([first, second]);

    expect(controller.isReady()).toBe(true);
    await controller.ensureReadySequence();
    expect(runCount).toBe(1);

    controller.reset();
    const rerun = controller.ensureReadySequence();
    resolveRun?.();
    await rerun;
    expect(runCount).toBe(2);
    expect(controller.isReady()).toBe(true);
  });

  it("clears in-flight state after ready sequence failure so a retry can run", async () => {
    let attempts = 0;
    const controller = createReadySequenceController({
      runReadySequence: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("boom");
        }
      },
    });

    await expect(controller.ensureReadySequence()).rejects.toThrow("boom");
    expect(controller.isReady()).toBe(false);

    await controller.ensureReadySequence();
    expect(attempts).toBe(2);
    expect(controller.isReady()).toBe(true);
  });

  it("creates a ready sequence runner that performs extension preflight before host flow", async () => {
    const calls: string[] = [];
    const runner = createReadySequenceRunner({
      restoreLicenseFlags: async () => {
        calls.push("restoreLicense");
      },
      initializeCompanion: async () => {
        calls.push("initializeCompanion");
      },
      getOnboardingDone: () => true,
      getSessionPersistenceEnabled: () => true,
      getWorkspaceRoot: () => "E:\\repo",
      getWorkspaceHash: workspaceRoot => `hash:${workspaceRoot ?? "none"}`,
      getLastSessionId: () => "session-1",
      readIndex: async () => ({ sessions: [] }),
      tryRestoreSavedSession: async () => false,
      setActiveSessionId: async () => undefined,
      showOnboarding: () => {
        calls.push("showOnboarding");
      },
      logReady: details => {
        calls.push(`ready:${details.workspaceRoot}:${details.workspaceHash}:${details.lastSessionId}`);
      },
      postLicenseRequired: feature => {
        calls.push(`license:${feature}`);
      },
      postState: () => {
        calls.push("postState");
      },
      refreshWorkspaceStatus: () => {
        calls.push("refresh");
      },
      logRestoreMissed: details => {
        calls.push(`restoreMissed:${details.workspaceHash}`);
      },
      ensureConversationWorktreeHydrated: async workspaceRoot => {
        calls.push(`hydrate:${workspaceRoot}`);
      },
      shouldRefreshSessionsList: () => false,
      handleSessionsLoad: async () => {
        calls.push("sessionsLoad");
      },
    });

    const result = await runner();

    expect(result).toEqual({ kind: "continue", restored: false });
    expect(calls).toEqual([
      "restoreLicense",
      "initializeCompanion",
      "ready:E:\\repo:hash:E:\\repo:session-1",
      "restoreMissed:hash:E:\\repo",
      "hydrate:E:\\repo",
      "postState",
      "refresh",
    ]);
  });

  it("builds a ready sequence runner factory around saved-session host bindings", async () => {
    const calls: string[] = [];
    let currentSessionId: string | undefined;
    let baselineCount = 0;
    let restoredModelConversation: Array<{ role: string; content: string }> | undefined;
    let restoredPendingPlanVerification: { planFilePath: string } | undefined;
    let restoredCompactBoundary:
      | {
          trigger: "manual" | "auto";
          compactedAt: number;
          preTokens: number;
          postTokens: number;
          messagesSummarized: number;
          messagesKept: number;
          preservedRecentMessages: boolean;
        }
      | undefined;
    const restoredSessionMessages: Array<{ role: string; content: string }> = [];

    const runner = createReadySequenceRunnerFactory({
      restoreLicenseFlags: async () => {
        calls.push("restoreLicense");
      },
      initializeCompanion: async () => {
        calls.push("initializeCompanion");
      },
      getOnboardingDone: () => true,
      getSessionPersistenceEnabled: () => true,
      getWorkspaceRoot: () => "E:\\repo",
      getWorkspaceHash: workspaceRoot => `hash:${workspaceRoot ?? "none"}`,
      getLastSessionId: () => "session-1",
      readIndex: async () => ({ sessions: [] }),
      loadMessages: async () => [{ role: "assistant", content: "restored" }],
      loadRuntimeState: async () => ({
        modelConversation: [{ role: "assistant", content: "model-restored" }],
        pendingPlanVerification: {
          planFilePath: "E:\\repo\\.omx\\plans\\test-spec.md",
        },
        compactBoundary: {
          trigger: "manual",
          compactedAt: 1,
          preTokens: 200,
          postTokens: 120,
          messagesSummarized: 4,
          messagesKept: 2,
          preservedRecentMessages: true,
        },
      }),
      savedSessionActivationBindings: {
        clearConversationBuffers: () => {
          calls.push("clearBuffers");
        },
        setCurrentSessionId: sessionId => {
          currentSessionId = sessionId;
          calls.push(`current:${sessionId ?? "undefined"}`);
        },
        replaceSessionMessages: messages => {
          restoredSessionMessages.push(...messages);
          calls.push(`messages:${messages.length}`);
        },
        restoreModelConversation: modelConversation => {
          restoredModelConversation = modelConversation as Array<{
            role: string;
            content: string;
          }>;
          calls.push(`model:${modelConversation?.length ?? 0}`);
        },
        restorePendingPlanVerification: pendingPlanVerification => {
          restoredPendingPlanVerification = pendingPlanVerification as {
            planFilePath: string;
          };
          calls.push(`pending:${pendingPlanVerification ? "yes" : "no"}`);
        },
        restoreCompactBoundary: compactBoundary => {
          restoredCompactBoundary = compactBoundary as {
            trigger: "manual" | "auto";
            compactedAt: number;
            preTokens: number;
            postTokens: number;
            messagesSummarized: number;
            messagesKept: number;
            preservedRecentMessages: boolean;
          };
          calls.push(`compact:${compactBoundary ? "yes" : "no"}`);
        },
        markConversationBaseline: count => {
          baselineCount = count;
          calls.push(`baseline:${count}`);
        },
      },
      setActiveSessionId: async () => undefined,
      showOnboarding: () => {
        calls.push("onboarding");
      },
      logReady: details => {
        calls.push(`ready:${details.workspaceRoot}:${details.workspaceHash}:${details.lastSessionId}`);
      },
      postLicenseRequired: feature => {
        calls.push(`license:${feature}`);
      },
      postState: () => {
        calls.push("postState");
      },
      refreshWorkspaceStatus: () => {
        calls.push("refresh");
      },
      logRestoreMissed: details => {
        calls.push(`restoreMissed:${details.workspaceHash}`);
      },
      logRestoreSkippedEmpty: details => {
        calls.push(`restoreSkipped:${details.source}:${details.sessionId}`);
      },
      logRestoreSuccess: details => {
        calls.push(`restoreSuccess:${details.source}:${details.sessionId}:${details.messageCount}`);
      },
      ensureConversationWorktreeHydrated: async workspaceRoot => {
        calls.push(`hydrate:${workspaceRoot}`);
      },
      shouldRefreshSessionsList: () => false,
      handleSessionsLoad: async () => {
        calls.push("sessionsLoad");
      },
    });

    const result = await runner();

    expect(result).toEqual({
      kind: "continue",
      restored: true,
      restoredSessionId: "session-1",
      restoredSource: "active",
    });
    expect(currentSessionId).toBe("session-1");
    expect(restoredSessionMessages).toEqual([
      { role: "assistant", content: "restored" },
    ]);
    expect(restoredModelConversation).toEqual([
      { role: "assistant", content: "model-restored" },
    ]);
    expect(restoredPendingPlanVerification).toEqual({
      planFilePath: "E:\\repo\\.omx\\plans\\test-spec.md",
    });
    expect(restoredCompactBoundary).toEqual({
      trigger: "manual",
      compactedAt: 1,
      preTokens: 200,
      postTokens: 120,
      messagesSummarized: 4,
      messagesKept: 2,
      preservedRecentMessages: true,
    });
    expect(baselineCount).toBe(1);
    expect(calls).toEqual([
      "restoreLicense",
      "initializeCompanion",
      "clearBuffers",
      "current:session-1",
      "messages:1",
      "model:1",
      "pending:yes",
      "compact:yes",
      "baseline:1",
      "restoreSuccess:active:session-1:1",
      "ready:E:\\repo:hash:E:\\repo:session-1",
      "hydrate:E:\\repo",
      "postState",
      "refresh",
    ]);
  });

  it("builds a ready sequence controller factory that encapsulates saved-session host wiring", async () => {
    const calls: string[] = [];
    let currentSessionId: string | undefined;
    let baselineCount = 0;
    let restoredModelConversation:
      | Array<{ role: string; content: string }>
      | undefined;
    let restoredPendingPlanVerification:
      | { planFilePath: string }
      | undefined;
    let restoredCompactBoundary:
      | {
          trigger: "manual" | "auto";
          compactedAt: number;
          preTokens: number;
          postTokens: number;
          messagesSummarized: number;
          messagesKept: number;
          preservedRecentMessages: boolean;
        }
      | undefined;
    const sessionMessages: Array<{ role: "user" | "assistant"; content: string }> = [
      { role: "assistant", content: "stale" },
    ];
    const savedSessionActivationBindings = {
      clearConversationBuffers: () => {
        sessionMessages.length = 0;
        calls.push("clearBuffers");
      },
      setCurrentSessionId: (sessionId: string | undefined) => {
        currentSessionId = sessionId;
        calls.push(`current:${sessionId ?? "undefined"}`);
      },
      replaceSessionMessages: (
        messages: Array<{ role: "user" | "assistant"; content: string }>,
      ) => {
        sessionMessages.push(...messages);
      },
      restoreModelConversation: (modelConversation: unknown) => {
        restoredModelConversation = modelConversation as Array<{
          role: string;
          content: string;
        }>;
        calls.push(`model:${restoredModelConversation?.length ?? 0}`);
      },
      restorePendingPlanVerification: (pendingPlanVerification: unknown) => {
        restoredPendingPlanVerification = pendingPlanVerification as {
          planFilePath: string;
        };
        calls.push(`pending:${pendingPlanVerification ? "yes" : "no"}`);
      },
      restoreCompactBoundary: (compactBoundary: unknown) => {
        restoredCompactBoundary = compactBoundary as {
          trigger: "manual" | "auto";
          compactedAt: number;
          preTokens: number;
          postTokens: number;
          messagesSummarized: number;
          messagesKept: number;
          preservedRecentMessages: boolean;
        };
        calls.push(`compact:${compactBoundary ? "yes" : "no"}`);
      },
      markConversationBaseline: (count: number) => {
        baselineCount = count;
        calls.push(`baseline:${count}`);
      },
    };

    const controllerFactory = createReadySequenceControllerFactory({
      restoreLicenseFlags: async () => {
        calls.push("restoreLicense");
      },
      initializeCompanion: async () => {
        calls.push("initializeCompanion");
      },
      getOnboardingDone: () => true,
      getSessionPersistenceEnabled: () => true,
      getWorkspaceRoot: () => "E:\\repo",
      getWorkspaceHash: workspaceRoot => `hash:${workspaceRoot ?? "none"}`,
      getLastSessionId: () => "session-1",
      readIndex: async () => ({ sessions: [] }),
      loadMessages: async () => [{ role: "assistant", content: "restored" }],
      loadRuntimeState: async () => ({
        modelConversation: [{ role: "assistant", content: "model-restored" }],
        pendingPlanVerification: {
          planFilePath: "E:\\repo\\.omx\\plans\\test-spec.md",
        },
        compactBoundary: {
          trigger: "manual",
          compactedAt: 1,
          preTokens: 200,
          postTokens: 120,
          messagesSummarized: 4,
          messagesKept: 2,
          preservedRecentMessages: true,
        },
      }),
      savedSessionActivationBindings,
      setActiveSessionId: async () => undefined,
      postLicenseRequired: feature => {
        calls.push(`license:${feature}`);
      },
      postState: () => {
        calls.push("postState");
      },
      refreshWorkspaceStatus: () => {
        calls.push("refresh");
      },
      ensureConversationWorktreeHydrated: async workspaceRoot => {
        calls.push(`hydrate:${workspaceRoot}`);
      },
    });

    const controller = controllerFactory({
      showOnboarding: () => {
        calls.push("onboarding");
      },
      logReady: details => {
        calls.push(`ready:${details.workspaceRoot}:${details.workspaceHash}:${details.lastSessionId}`);
      },
      logRestoreMissed: details => {
        calls.push(`restoreMissed:${details.workspaceHash}`);
      },
      logRestoreSkippedEmpty: details => {
        calls.push(`restoreSkipped:${details.source}:${details.sessionId}`);
      },
      logRestoreSuccess: details => {
        calls.push(`restoreSuccess:${details.source}:${details.sessionId}:${details.messageCount}`);
      },
      shouldRefreshSessionsList: () => false,
      handleSessionsLoad: async () => {
        calls.push("sessionsLoad");
      },
    });

    await controller.ensureReadySequence();

    expect(controller.isReady()).toBe(true);
    expect(currentSessionId).toBe("session-1");
    expect(sessionMessages).toEqual([
      { role: "assistant", content: "restored" },
    ]);
    expect(restoredModelConversation).toEqual([
      { role: "assistant", content: "model-restored" },
    ]);
    expect(restoredPendingPlanVerification).toEqual({
      planFilePath: "E:\\repo\\.omx\\plans\\test-spec.md",
    });
    expect(restoredCompactBoundary).toEqual({
      trigger: "manual",
      compactedAt: 1,
      preTokens: 200,
      postTokens: 120,
      messagesSummarized: 4,
      messagesKept: 2,
      preservedRecentMessages: true,
    });
    expect(baselineCount).toBe(1);
    expect(calls).toEqual([
      "restoreLicense",
      "initializeCompanion",
      "clearBuffers",
      "current:session-1",
      "model:1",
      "pending:yes",
      "compact:yes",
      "baseline:1",
      "restoreSuccess:active:session-1:1",
      "ready:E:\\repo:hash:E:\\repo:session-1",
      "hydrate:E:\\repo",
      "postState",
      "refresh",
    ]);
  });

  it("requests onboarding before any restore work", async () => {
    const result = await resolveReadySequenceAction({
      onboardingDone: false,
      sessionPersistenceEnabled: true,
      lastSessionId: "session-1",
      workspaceHash: "hash-1",
      readIndex: async () => ({ sessions: [] }),
      tryRestoreSavedSession: async () => {
        throw new Error("should not restore");
      },
      setActiveSessionId: async () => undefined,
    });

    expect(result).toEqual({ kind: "show_onboarding" });
  });

  it("requests a license gate when a saved session exists but persistence is disabled", async () => {
    const result = await resolveReadySequenceAction({
      onboardingDone: true,
      sessionPersistenceEnabled: false,
      lastSessionId: "session-1",
      workspaceHash: "hash-1",
      readIndex: async () => ({ sessions: [] }),
      tryRestoreSavedSession: async () => false,
      setActiveSessionId: async () => undefined,
    });

    expect(result).toEqual({ kind: "license_required" });
  });

  it("restores the active session first when available", async () => {
    const tryRestoreSavedSession = vi.fn(async () => true);

    const result = await resolveReadySequenceAction({
      onboardingDone: true,
      sessionPersistenceEnabled: true,
      lastSessionId: "session-1",
      workspaceHash: "hash-1",
      readIndex: async () => ({ sessions: [] }),
      tryRestoreSavedSession,
      setActiveSessionId: async () => undefined,
    });

    expect(result).toEqual({
      kind: "continue",
      restored: true,
      restoredSessionId: "session-1",
      restoredSource: "active",
    });
    expect(tryRestoreSavedSession).toHaveBeenCalledWith("session-1", "active");
  });

  it("falls back to a workspace-matching session and reassigns active id", async () => {
    const setActiveSessionId = vi.fn(async () => undefined);

    const result = await resolveReadySequenceAction({
      onboardingDone: true,
      sessionPersistenceEnabled: true,
      lastSessionId: "session-old",
      workspaceHash: "hash-1",
      readIndex: async () => ({
        sessions: [
          {
            id: "session-new",
            title: "Recovered",
            createdAt: 1,
            updatedAt: 2,
            workspaceHash: "hash-1",
            preview: "",
            messageCount: 1,
          },
        ],
      }),
      tryRestoreSavedSession: async (_sessionId, source) => source === "workspace-fallback",
      setActiveSessionId,
    });

    expect(result).toEqual({
      kind: "continue",
      restored: true,
      restoredSessionId: "session-new",
      restoredSource: "workspace-fallback",
    });
    expect(setActiveSessionId).toHaveBeenCalledWith("session-new");
  });

  it("continues without restore when no candidate can be restored", async () => {
    const result = await resolveReadySequenceAction({
      onboardingDone: true,
      sessionPersistenceEnabled: true,
      lastSessionId: "session-old",
      workspaceHash: "hash-1",
      readIndex: async () => ({ sessions: [] }),
      tryRestoreSavedSession: async () => false,
      setActiveSessionId: async () => undefined,
    });

    expect(result).toEqual({
      kind: "continue",
      restored: false,
    });
  });

  it("applies show_onboarding without running host follow-up work", async () => {
    const calls: string[] = [];

    await applyReadySequenceAction({
      readyAction: { kind: "show_onboarding" },
      workspaceHash: "hash-1",
      postOnboarding: () => {
        calls.push("onboarding");
      },
      logReady: () => {
        calls.push("logReady");
      },
      postLicenseRequired: () => {
        calls.push("license");
      },
      postState: () => {
        calls.push("postState");
      },
      refreshWorkspaceStatus: () => {
        calls.push("refresh");
      },
      logRestoreMissed: () => {
        calls.push("restoreMissed");
      },
      ensureConversationWorktreeHydrated: async () => {
        calls.push("hydrate");
      },
      shouldRefreshSessionsList: () => true,
      handleSessionsLoad: async () => {
        calls.push("sessionsLoad");
      },
    });

    expect(calls).toEqual(["onboarding"]);
  });

  it("applies continue flow with hydration, state post, session refresh, and workspace refresh", async () => {
    const calls: string[] = [];

    await applyReadySequenceAction({
      readyAction: { kind: "continue", restored: false },
      workspaceRoot: "E:\\repo",
      workspaceHash: "hash-1",
      lastSessionId: "session-1",
      postOnboarding: () => {
        calls.push("onboarding");
      },
      logReady: details => {
        calls.push(`ready:${details.workspaceRoot}:${details.workspaceHash}:${details.lastSessionId}`);
      },
      postLicenseRequired: () => {
        calls.push("license");
      },
      postState: () => {
        calls.push("postState");
      },
      refreshWorkspaceStatus: () => {
        calls.push("refresh");
      },
      logRestoreMissed: details => {
        calls.push(`restoreMissed:${details.workspaceHash}`);
      },
      ensureConversationWorktreeHydrated: async workspaceRoot => {
        calls.push(`hydrate:${workspaceRoot}`);
      },
      shouldRefreshSessionsList: () => true,
      handleSessionsLoad: async () => {
        calls.push("sessionsLoad");
      },
    });

    expect(calls).toEqual([
      "ready:E:\\repo:hash-1:session-1",
      "restoreMissed:hash-1",
      "hydrate:E:\\repo",
      "postState",
      "sessionsLoad",
      "refresh",
    ]);
  });

  it("applies license_required with state post and workspace refresh only", async () => {
    const calls: string[] = [];

    await applyReadySequenceAction({
      readyAction: { kind: "license_required" },
      workspaceHash: "hash-1",
      postOnboarding: () => {
        calls.push("onboarding");
      },
      logReady: () => {
        calls.push("logReady");
      },
      postLicenseRequired: feature => {
        calls.push(`license:${feature}`);
      },
      postState: () => {
        calls.push("postState");
      },
      refreshWorkspaceStatus: () => {
        calls.push("refresh");
      },
      logRestoreMissed: () => {
        calls.push("restoreMissed");
      },
      ensureConversationWorktreeHydrated: async () => {
        calls.push("hydrate");
      },
      shouldRefreshSessionsList: () => true,
      handleSessionsLoad: async () => {
        calls.push("sessionsLoad");
      },
    });

    expect(calls).toEqual([
      "logReady",
      "license:sessionPersistence",
      "postState",
      "refresh",
    ]);
  });

  it("runs the full ready sequence and returns the resolved action", async () => {
    const calls: string[] = [];

    const result = await runReadySequenceWithHost({
      onboardingDone: true,
      sessionPersistenceEnabled: true,
      workspaceRoot: "E:\\repo",
      workspaceHash: "hash-1",
      lastSessionId: "session-1",
      readIndex: async () => ({ sessions: [] }),
      tryRestoreSavedSession: async () => false,
      setActiveSessionId: async () => undefined,
      showOnboarding: () => {
        calls.push("onboarding");
      },
      logReady: details => {
        calls.push(`ready:${details.workspaceRoot}:${details.workspaceHash}:${details.lastSessionId}`);
      },
      postLicenseRequired: feature => {
        calls.push(`license:${feature}`);
      },
      postState: () => {
        calls.push("postState");
      },
      refreshWorkspaceStatus: () => {
        calls.push("refresh");
      },
      logRestoreMissed: details => {
        calls.push(`restoreMissed:${details.workspaceHash}`);
      },
      ensureConversationWorktreeHydrated: async workspaceRoot => {
        calls.push(`hydrate:${workspaceRoot}`);
      },
      shouldRefreshSessionsList: () => true,
      handleSessionsLoad: async () => {
        calls.push("sessionsLoad");
      },
    });

    expect(result).toEqual({ kind: "continue", restored: false });
    expect(calls).toEqual([
      "ready:E:\\repo:hash-1:session-1",
      "restoreMissed:hash-1",
      "hydrate:E:\\repo",
      "postState",
      "sessionsLoad",
      "refresh",
    ]);
  });

  it("runs onboarding path through the full ready sequence", async () => {
    const showOnboarding = vi.fn();

    const result = await runReadySequenceWithHost({
      onboardingDone: false,
      sessionPersistenceEnabled: true,
      workspaceHash: "hash-1",
      readIndex: async () => ({ sessions: [] }),
      tryRestoreSavedSession: async () => false,
      setActiveSessionId: async () => undefined,
      showOnboarding,
      logReady: () => undefined,
      postLicenseRequired: () => undefined,
      postState: () => undefined,
      refreshWorkspaceStatus: () => undefined,
      logRestoreMissed: () => undefined,
      ensureConversationWorktreeHydrated: async () => undefined,
      shouldRefreshSessionsList: () => false,
      handleSessionsLoad: async () => undefined,
    });

    expect(result).toEqual({ kind: "show_onboarding" });
    expect(showOnboarding).toHaveBeenCalledTimes(1);
  });
});
