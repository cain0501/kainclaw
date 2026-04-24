import { describe, expect, it, vi } from "vitest";

import {
  beginPromptTurn,
  createBeginPromptTurnBindings,
  createFinalizePromptTurnBindings,
  createPromptTurnFailureBindings,
  finalizePromptTurn,
  handlePromptTurnFailure,
  preparePromptTurn,
  resolvePromptTurnContinuation,
  runPromptTurnExecution,
} from "./promptLifecycleHost";

describe("promptLifecycleHost", () => {
  it("skips empty or blocked prompt turns and starts valid turns", async () => {
    const appendSessionMessage = vi.fn();
    const clearStreamingState = vi.fn();
    const resetActivityTracker = vi.fn();
    const setBusy = vi.fn();
    const addPhaseActivity = vi.fn(() => "activity-1");
    const postState = vi.fn();
    const showErrorMessage = vi.fn();

    expect(
      await beginPromptTurn({
        prompt: "   ",
        isBusy: false,
        hasPendingApproval: false,
        ensureReadySequence: async () => undefined,
        workspaceFolderPath: "E:\\repo",
        appendSessionMessage,
        clearStreamingState,
        resetActivityTracker,
        setBusy,
        addPhaseActivity,
        postState,
        showErrorMessage,
        toErrorMessage: error => String(error),
      }),
    ).toEqual({ kind: "skip" });

    const blocked = await beginPromptTurn({
      prompt: "hello",
      isBusy: false,
      hasPendingApproval: false,
      ensureReadySequence: async () => {
        throw new Error("not ready");
      },
      workspaceFolderPath: "E:\\repo",
      appendSessionMessage,
      clearStreamingState,
      resetActivityTracker,
      setBusy,
      addPhaseActivity,
      postState,
      showErrorMessage,
      toErrorMessage: error =>
        error instanceof Error ? error.message : String(error),
    });
    expect(blocked).toEqual({ kind: "blocked" });
    expect(showErrorMessage).toHaveBeenCalledWith("not ready");

    const noWorkspace = await beginPromptTurn({
      prompt: "hello",
      isBusy: false,
      hasPendingApproval: false,
      ensureReadySequence: async () => undefined,
      appendSessionMessage,
      clearStreamingState,
      resetActivityTracker,
      setBusy,
      addPhaseActivity,
      postState,
      showErrorMessage,
      toErrorMessage: error => String(error),
    });
    expect(noWorkspace).toEqual({ kind: "blocked" });
    expect(appendSessionMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "assistant",
        kind: "error",
      }),
    );

    vi.clearAllMocks();

    const started = await beginPromptTurn({
      prompt: " hello world ",
      isBusy: false,
      hasPendingApproval: false,
      ensureReadySequence: async () => undefined,
      workspaceFolderPath: "E:\\repo",
      appendSessionMessage,
      clearStreamingState,
      resetActivityTracker,
      setBusy,
      addPhaseActivity,
      postState,
      showErrorMessage,
      toErrorMessage: error => String(error),
    });

    expect(started).toEqual({
      kind: "continue",
      trimmedPrompt: "hello world",
      workspaceFolderPath: "E:\\repo",
      analyzeActivityId: "activity-1",
    });
    expect(appendSessionMessage).toHaveBeenCalledWith({
      role: "user",
      content: "hello world",
    });
    expect(clearStreamingState).toHaveBeenCalled();
    expect(resetActivityTracker).toHaveBeenCalled();
    expect(setBusy).toHaveBeenCalledWith(true);
    expect(postState).toHaveBeenCalled();
  });

  it("handles prompt turn failures with mood and session error output", async () => {
    const addFailureActivity = vi.fn();
    const appendSessionMessage = vi.fn();
    const setCompanionState = vi.fn();
    const updateMood = vi.fn(async () => undefined);
    const showErrorMessage = vi.fn();

    await handlePromptTurnFailure({
      error: new Error("boom"),
      addFailureActivity,
      appendSessionMessage,
      setCompanionState,
      updateMood,
      moodPenaltyApplied: false,
      showErrorMessage,
      toErrorMessage: error =>
        error instanceof Error ? error.message : String(error),
    });

    expect(addFailureActivity).toHaveBeenCalledWith("boom");
    expect(appendSessionMessage).toHaveBeenCalledWith({
      role: "assistant",
      content: "boom",
      kind: "error",
    });
    expect(setCompanionState).toHaveBeenCalledWith("idle");
    expect(updateMood).toHaveBeenCalledWith(-2);
    expect(showErrorMessage).toHaveBeenCalledWith("boom");
  });

  it("finalizes prompt turns by flushing, clearing, and resetting busy state", async () => {
    const calls: string[] = [];

    await finalizePromptTurn({
      flushSessions: async () => {
        calls.push("flush");
      },
      archiveActivityTracker: () => {
        calls.push("archive");
      },
      clearStreamingState: () => {
        calls.push("clearStreaming");
      },
      setBusy: busy => {
        calls.push(`busy:${busy}`);
      },
      postState: () => {
        calls.push("postState");
      },
    });

    expect(calls).toEqual([
      "flush",
      "archive",
      "clearStreaming",
      "busy:false",
      "postState",
    ]);
  });

  it("builds begin bindings that reuse session and activity state", async () => {
    const sessionMessages: Array<{ role: "user" | "assistant"; content: string; kind?: "error" }> = [];
    const activityTracker = {
      reset: vi.fn(),
      add: vi.fn(() => "activity-2"),
    };
    const setBusy = vi.fn();
    const postState = vi.fn();
    const showErrorMessage = vi.fn();

    const result = await beginPromptTurn(
      createBeginPromptTurnBindings({
        prompt: " ship it ",
        isBusy: false,
        hasPendingApproval: false,
        ensureReadySequence: async () => undefined,
        workspaceFolderPath: "E:\\repo",
        sessionMessages,
        clearStreamingState: vi.fn(),
        activityTracker,
        setBusy,
        postState,
        showErrorMessage,
        toErrorMessage: error => String(error),
      }),
    );

    expect(result).toEqual({
      kind: "continue",
      trimmedPrompt: "ship it",
      workspaceFolderPath: "E:\\repo",
      analyzeActivityId: "activity-2",
    });
    expect(sessionMessages).toEqual([{ role: "user", content: "ship it" }]);
    expect(activityTracker.reset).toHaveBeenCalled();
    expect(activityTracker.add).toHaveBeenCalledWith(
      "phase",
      "正在理解你的请求",
      "准备当前工作区上下文",
      "running",
    );
    expect(setBusy).toHaveBeenCalledWith(true);
    expect(postState).toHaveBeenCalled();
    expect(showErrorMessage).not.toHaveBeenCalled();
  });

  it("includes normalized attachments when beginning a prompt turn", async () => {
    const sessionMessages: Array<{
      role: "user" | "assistant";
      content: string;
      kind?: "error";
      attachments?: Array<{ data: string; mimeType: string }>;
    }> = [];

    await beginPromptTurn(
      createBeginPromptTurnBindings({
        prompt: "inspect image",
        attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
        isBusy: false,
        hasPendingApproval: false,
        ensureReadySequence: async () => undefined,
        workspaceFolderPath: "E:\\repo",
        sessionMessages,
        clearStreamingState: vi.fn(),
        activityTracker: {
          reset: vi.fn(),
          add: vi.fn(() => "activity-attachments"),
        } as any,
        setBusy: vi.fn(),
        postState: vi.fn(),
        showErrorMessage: vi.fn(),
        toErrorMessage: error => String(error),
      }),
    );

    expect(sessionMessages).toEqual([
      {
        role: "user",
        content: "inspect image",
        attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
      },
    ]);
  });

  it("builds failure bindings that record phase failure via the tracker", async () => {
    const sessionMessages: Array<{ role: "user" | "assistant"; content: string; kind?: "error" }> = [];
    const activityTracker = {
      add: vi.fn(),
    };
    const setCompanionState = vi.fn();
    const updateMood = vi.fn(async () => undefined);
    const showErrorMessage = vi.fn();

    await handlePromptTurnFailure(
      createPromptTurnFailureBindings({
        error: new Error("bad turn"),
        sessionMessages,
        activityTracker,
        getFailureActivityLabel: () => "失败",
        setCompanionState,
        updateMood,
        moodPenaltyApplied: false,
        showErrorMessage,
        toErrorMessage: error =>
          error instanceof Error ? error.message : String(error),
      }),
    );

    expect(activityTracker.add).toHaveBeenCalledWith(
      "phase",
      "失败",
      "bad turn",
      "error",
    );
    expect(sessionMessages).toEqual([
      {
        role: "assistant",
        content: "bad turn",
        kind: "error",
      },
    ]);
    expect(setCompanionState).toHaveBeenCalledWith("idle");
    expect(updateMood).toHaveBeenCalledWith(-2);
    expect(showErrorMessage).toHaveBeenCalledWith("bad turn");
  });

  it("builds finalize bindings that archive the activity tracker", async () => {
    const calls: string[] = [];
    const activityTracker = {
      archiveCurrentRun: vi.fn(() => {
        calls.push("archive");
      }),
    };

    await finalizePromptTurn(
      createFinalizePromptTurnBindings({
        flushSessions: async () => {
          calls.push("flush");
        },
        activityTracker,
        clearStreamingState: () => {
          calls.push("clearStreaming");
        },
        setBusy: busy => {
          calls.push(`busy:${busy}`);
        },
        postState: () => {
          calls.push("postState");
        },
      }),
    );

    expect(calls).toEqual([
      "flush",
      "archive",
      "clearStreaming",
      "busy:false",
      "postState",
    ]);
    expect(activityTracker.archiveCurrentRun).toHaveBeenCalled();
  });

  it("stops continuation when the active workspace no longer matches", () => {
    const postLicenseRequired = vi.fn();
    const setBusy = vi.fn();
    const postState = vi.fn();

    const result = resolvePromptTurnContinuation({
      begin: {
        kind: "continue",
        trimmedPrompt: "ship it",
        workspaceFolderPath: "E:\\repo-a",
        analyzeActivityId: "activity-3",
      },
      workspaceFolder: {
        uri: {
          fsPath: "E:\\repo-b",
        },
      },
      hasExplicitSwarmIntent: vi.fn(() => false),
      isSwarmEnabled: true,
      postLicenseRequired,
      setBusy,
      postState,
    });

    expect(result).toEqual({ kind: "stop" });
    expect(postLicenseRequired).not.toHaveBeenCalled();
    expect(setBusy).not.toHaveBeenCalled();
    expect(postState).not.toHaveBeenCalled();
  });

  it("blocks explicit swarm intent when the feature is not licensed", () => {
    const postLicenseRequired = vi.fn();
    const setBusy = vi.fn();
    const postState = vi.fn();

    const result = resolvePromptTurnContinuation({
      begin: {
        kind: "continue",
        trimmedPrompt: "use swarm for this",
        workspaceFolderPath: "E:\\repo",
        analyzeActivityId: "activity-4",
      },
      workspaceFolder: {
        uri: {
          fsPath: "E:\\repo",
        },
      },
      hasExplicitSwarmIntent: vi.fn(() => true),
      isSwarmEnabled: false,
      postLicenseRequired,
      setBusy,
      postState,
    });

    expect(result).toEqual({ kind: "stop" });
    expect(postLicenseRequired).toHaveBeenCalledWith("swarm");
    expect(setBusy).toHaveBeenCalledWith(false);
    expect(postState).toHaveBeenCalled();
  });

  it("continues when workspace and license guards pass", () => {
    const workspaceFolder = {
      uri: {
        fsPath: "E:\\repo",
      },
    };

    const result = resolvePromptTurnContinuation({
      begin: {
        kind: "continue",
        trimmedPrompt: "continue work",
        workspaceFolderPath: "E:\\repo",
        analyzeActivityId: "activity-5",
      },
      workspaceFolder,
      hasExplicitSwarmIntent: vi.fn(() => false),
      isSwarmEnabled: true,
      postLicenseRequired: vi.fn(),
      setBusy: vi.fn(),
      postState: vi.fn(),
    });

    expect(result).toEqual({
      kind: "continue",
      trimmedPrompt: "continue work",
      workspaceFolder,
    });
  });

  it("runs prompt execution, failure handling, and finalization in one helper", async () => {
    const calls: string[] = [];
    const sessionMessages: Array<{
      role: "user" | "assistant";
      content: string;
      kind?: "error";
    }> = [];

    await runPromptTurnExecution({
      analyzeActivityId: "activity-6",
      finishAnalyzeActivity: activityId => {
        calls.push(`finish:${activityId}`);
      },
      runPromptRequest: async () => {
        calls.push("run");
      },
      buildFailureBindings: error =>
        createPromptTurnFailureBindings({
          error,
          sessionMessages,
          activityTracker: {
            add: () => {
              calls.push("failure");
              return "ignored";
            },
          },
          getFailureActivityLabel: () => "失败",
          setCompanionState: () => {
            calls.push("companion");
          },
          updateMood: async () => {
            calls.push("mood");
          },
          moodPenaltyApplied: true,
          showErrorMessage: () => {
            calls.push("showError");
          },
          toErrorMessage: value => String(value),
        }),
      finalizeBindings: createFinalizePromptTurnBindings({
        flushSessions: async () => {
          calls.push("flush");
        },
        activityTracker: {
          archiveCurrentRun: () => {
            calls.push("archive");
          },
        } as any,
        clearStreamingState: () => {
          calls.push("clear");
        },
        setBusy: busy => {
          calls.push(`busy:${busy}`);
        },
        postState: () => {
          calls.push("postState");
        },
      }),
    });

    expect(calls).toEqual([
      "finish:activity-6",
      "run",
      "flush",
      "archive",
      "clear",
      "busy:false",
      "postState",
    ]);
    expect(sessionMessages).toEqual([]);
  });

  it("routes prompt execution failures through the shared failure and finalize handlers", async () => {
    const calls: string[] = [];
    const sessionMessages: Array<{
      role: "user" | "assistant";
      content: string;
      kind?: "error";
    }> = [];

    await runPromptTurnExecution({
      analyzeActivityId: "activity-7",
      finishAnalyzeActivity: activityId => {
        calls.push(`finish:${activityId}`);
      },
      runPromptRequest: async () => {
        calls.push("run");
        throw new Error("boom");
      },
      buildFailureBindings: error =>
        createPromptTurnFailureBindings({
          error,
          sessionMessages,
          activityTracker: {
            add: (_kind, label, detail) => {
              calls.push(`failure:${label}:${detail}`);
              return "ignored";
            },
          },
          getFailureActivityLabel: () => "失败",
          setCompanionState: () => {
            calls.push("companion");
          },
          updateMood: async delta => {
            calls.push(`mood:${delta}`);
          },
          moodPenaltyApplied: false,
          showErrorMessage: message => {
            calls.push(`showError:${message}`);
          },
          toErrorMessage: value =>
            value instanceof Error ? value.message : String(value),
        }),
      finalizeBindings: createFinalizePromptTurnBindings({
        flushSessions: async () => {
          calls.push("flush");
        },
        activityTracker: {
          archiveCurrentRun: () => {
            calls.push("archive");
          },
        } as any,
        clearStreamingState: () => {
          calls.push("clear");
        },
        setBusy: busy => {
          calls.push(`busy:${busy}`);
        },
        postState: () => {
          calls.push("postState");
        },
      }),
    });

    expect(calls).toEqual([
      "finish:activity-7",
      "run",
      "failure:失败:boom",
      "companion",
      "mood:-2",
      "showError:boom",
      "flush",
      "archive",
      "clear",
      "busy:false",
      "postState",
    ]);
    expect(sessionMessages).toEqual([
      {
        role: "assistant",
        content: "boom",
        kind: "error",
      },
    ]);
  });

  it("prepares a prompt turn by combining begin and continuation guards", async () => {
    const sessionMessages: Array<{
      role: "user" | "assistant";
      content: string;
      kind?: "error";
    }> = [];
    const workspaceFolder = {
      uri: {
        fsPath: "E:\\repo",
      },
    };

    const result = await preparePromptTurn({
      beginBindings: createBeginPromptTurnBindings({
        prompt: " continue work ",
        isBusy: false,
        hasPendingApproval: false,
        ensureReadySequence: async () => undefined,
        workspaceFolderPath: "E:\\repo",
        sessionMessages,
        clearStreamingState: vi.fn(),
        activityTracker: {
          reset: vi.fn(),
          add: vi.fn(() => "activity-8"),
        } as any,
        setBusy: vi.fn(),
        postState: vi.fn(),
        showErrorMessage: vi.fn(),
        toErrorMessage: error => String(error),
      }),
      workspaceFolder,
      hasExplicitSwarmIntent: vi.fn(() => false),
      isSwarmEnabled: true,
      postLicenseRequired: vi.fn(),
      setBusy: vi.fn(),
      postState: vi.fn(),
    });

    expect(result).toEqual({
      kind: "continue",
      analyzeActivityId: "activity-8",
      trimmedPrompt: "continue work",
      workspaceFolder,
    });
    expect(sessionMessages).toEqual([
      {
        role: "user",
        content: "continue work",
      },
    ]);
  });

  it("stops prepared prompt turns when continuation guard blocks swarm intent", async () => {
    const postLicenseRequired = vi.fn();
    const setBusy = vi.fn();
    const postState = vi.fn();

    const result = await preparePromptTurn({
      beginBindings: createBeginPromptTurnBindings({
        prompt: " swarm this ",
        isBusy: false,
        hasPendingApproval: false,
        ensureReadySequence: async () => undefined,
        workspaceFolderPath: "E:\\repo",
        sessionMessages: [],
        clearStreamingState: vi.fn(),
        activityTracker: {
          reset: vi.fn(),
          add: vi.fn(() => "activity-9"),
        } as any,
        setBusy: vi.fn(),
        postState: vi.fn(),
        showErrorMessage: vi.fn(),
        toErrorMessage: error => String(error),
      }),
      workspaceFolder: {
        uri: {
          fsPath: "E:\\repo",
        },
      },
      hasExplicitSwarmIntent: vi.fn(() => true),
      isSwarmEnabled: false,
      postLicenseRequired,
      setBusy,
      postState,
    });

    expect(result).toEqual({ kind: "stop" });
    expect(postLicenseRequired).toHaveBeenCalledWith("swarm");
    expect(setBusy).toHaveBeenCalledWith(false);
    expect(postState).toHaveBeenCalled();
  });
});
