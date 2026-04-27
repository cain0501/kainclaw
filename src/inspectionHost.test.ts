import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderResolution } from "./workspaceHost";

const {
  runVerificationInspectionSessionMock,
  runReviewInspectionSessionMock,
  launchVerificationFromToolMock,
  launchReviewFromToolMock,
  handleVerificationPromptCommandMock,
  handleReviewPromptCommandMock,
  launchHostedReviewWithHostMock,
} = vi.hoisted(() => ({
  runVerificationInspectionSessionMock: vi.fn(),
  runReviewInspectionSessionMock: vi.fn(),
  launchVerificationFromToolMock: vi.fn(),
  launchReviewFromToolMock: vi.fn(),
  handleVerificationPromptCommandMock: vi.fn(),
  handleReviewPromptCommandMock: vi.fn(),
  launchHostedReviewWithHostMock: vi.fn(),
}));

vi.mock("./inspectionSessionHost", () => ({
  runVerificationInspectionSession: runVerificationInspectionSessionMock,
  runReviewInspectionSession: runReviewInspectionSessionMock,
}));

vi.mock("./toolLaunchHost", () => ({
  runVerificationFromTool: launchVerificationFromToolMock,
  runReviewFromTool: launchReviewFromToolMock,
}));

vi.mock("./inspectionPromptHost", () => ({
  handleVerificationPromptCommand: handleVerificationPromptCommandMock,
  handleReviewPromptCommand: handleReviewPromptCommandMock,
}));

vi.mock("./remoteReviewHost", () => ({
  launchHostedReviewWithHost: launchHostedReviewWithHostMock,
}));

import {
  handleReviewCommandWithHost,
  handleUltrareviewCommandWithHost,
  handleVerificationCommandWithHost,
  runReviewFromToolWithHost,
  runReviewSessionWithHost,
  runVerificationFromToolWithHost,
  runVerificationSessionWithHost,
} from "./inspectionHost";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("inspectionHost", () => {
  const providerResolution: ProviderResolution = {
    config: {
      type: "anthropic",
      apiKey: "secret",
      model: "claude-sonnet",
    },
    envMap: {},
  };

  it("wires verification session host state into the inspection runner", async () => {
    runVerificationInspectionSessionMock.mockResolvedValue({
      taskId: "verify-1",
      report: "ok",
      verdict: "PASS",
    });

    const result = await runVerificationSessionWithHost({
      commandText: "/verify",
      workspaceRoot: "E:\\repo",
      promptForTask: "Verify the current workspace/project state.",
      config: { type: "anthropic", apiKey: "secret", model: "claude-sonnet" },
      envMap: { HELLO: "world" },
      runtime: {
        getToolContext: () =>
          ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) as any,
        getToolDefinitions: async () => [{ name: "read_file" }] as any,
        getMcpStatusSummary: async () => [] as any,
      },
      tools: [{ name: "read_file" }] as any,
      runtimeOptions: { fastMode: true },
      effortLevel: "high",
      getConversationHistory: () => [{ role: "user", content: "task" }],
      sessionMessages: [{ role: "user", content: "task" }],
      getPendingPlanVerification: () => ({
        planFilePath: ".omx/plans/test.md",
        planContent: "1. Build",
        approvedAtUserTurnCount: 2,
        verificationStarted: false,
        verificationCompleted: false,
      }),
      backgroundTaskHost: { runBuiltInAgentSession: vi.fn() } as any,
      findActiveBuiltInAgentTask: vi.fn(async () => undefined),
      createProviderAdapter: vi.fn(() => ({}) as any),
      markPendingPlanVerificationStarted: vi.fn(),
      markPendingPlanVerificationCompleted: vi.fn(),
      resetPendingPlanVerificationToAwaitingStart: vi.fn(),
    });

    const call = runVerificationInspectionSessionMock.mock.calls[0]?.[0];
    expect(call.commandText).toBe("/verify");
    expect(call.workspaceRoot).toBe("E:\\repo");
    expect(call.promptForTask).toBe("Verify the current workspace/project state.");
    expect(call.conversationHistory).toEqual([{ role: "user", content: "task" }]);
    expect(call.sessionMessages).toEqual([{ role: "user", content: "task" }]);
    expect(call.pendingPlanVerification?.planFilePath).toBe(".omx/plans/test.md");
    expect(call.createProvider("system")).toEqual({});
    expect(result).toEqual({
      taskId: "verify-1",
      report: "ok",
      verdict: "PASS",
    });
  });

  it("wires review session host state into the inspection runner", async () => {
    runReviewInspectionSessionMock.mockResolvedValue({
      taskId: "review-1",
      report: "ok",
    });

    const result = await runReviewSessionWithHost({
      commandText: "/review",
      workspaceRoot: "E:\\repo",
      config: { type: "anthropic", apiKey: "secret", model: "claude-sonnet" },
      envMap: { HELLO: "world" },
      runtime: {
        getToolContext: () =>
          ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) as any,
        getToolDefinitions: async () => [{ name: "read_file" }] as any,
        getMcpStatusSummary: async () => [] as any,
      },
      tools: [{ name: "read_file" }] as any,
      runtimeOptions: { fastMode: true },
      effortLevel: "medium",
      getConversationHistory: () => [{ role: "user", content: "task" }],
      sessionMessages: [{ role: "user", content: "task" }],
      getPendingPlanVerification: () => undefined,
      backgroundTaskHost: { runBuiltInAgentSession: vi.fn() } as any,
      findActiveBuiltInAgentTask: vi.fn(async () => undefined),
      createProviderAdapter: vi.fn(() => ({}) as any),
    });

    const call = runReviewInspectionSessionMock.mock.calls[0]?.[0];
    expect(call.commandText).toBe("/review");
    expect(call.workspaceRoot).toBe("E:\\repo");
    expect(call.pendingPlanVerification).toBeUndefined();
    expect(call.createProvider("system")).toEqual({});
    expect(result).toEqual({
      taskId: "review-1",
      report: "ok",
    });
  });

  it("adapts verification command callbacks and delegates to the prompt host", async () => {
    const onStreamingToken = vi.fn();
    const startToolExecution = vi.fn();
    const finishToolExecution = vi.fn();

    handleVerificationPromptCommandMock.mockImplementation(async (options: any) => {
      options.onToken("tok");
      options.onToolStart("read_file", { path: "src/extension.ts" }, "exec-1");
      options.onToolEnd("exec-1", "ok", false);
      expect(typeof options.runVerificationSession).toBe("function");
      return true;
    });

    const handled = await handleVerificationCommandWithHost({
      commandText: "/verify",
      workspaceRoot: "E:\\repo",
      config: { type: "anthropic", apiKey: "secret", model: "claude-sonnet" },
      envMap: { HELLO: "world" },
      runtime: {
        getToolContext: () =>
          ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) as any,
        getToolDefinitions: async () => [{ name: "read_file" }] as any,
        getMcpStatusSummary: async () => [] as any,
      },
      tools: [{ name: "read_file" }] as any,
      runtimeOptions: { fastMode: true },
      effortLevel: "high",
      sessionMessages: [{ role: "user", content: "task" }],
      blockedByPlanMode: false,
      getConversationHistory: () => [{ role: "user", content: "task" }],
      getPendingPlanVerification: () => undefined,
      backgroundTaskHost: {
        runBuiltInAgentSession: vi.fn(),
        buildFollowUpMessage: vi.fn(() => "follow-up"),
      } as any,
      findActiveBuiltInAgentTask: vi.fn(async () => undefined),
      createProviderAdapter: vi.fn(() => ({}) as any),
      onStreamingToken,
      startToolExecution,
      finishToolExecution,
      addPhaseActivity: vi.fn(() => "activity-1"),
      finishPhaseActivity: vi.fn(),
      recordAssistantReply: vi.fn(async () => undefined),
      setCompanionState: vi.fn(),
      clearStreamingText: vi.fn(),
      updateMood: vi.fn(async () => undefined),
      isAbortLikeError: vi.fn(() => false),
      markPendingPlanVerificationStarted: vi.fn(),
      markPendingPlanVerificationCompleted: vi.fn(),
      resetPendingPlanVerificationToAwaitingStart: vi.fn(),
      onUnexpectedError: vi.fn(),
    });

    expect(handled).toBe(true);
    expect(onStreamingToken).toHaveBeenCalledWith("tok");
    expect(startToolExecution).toHaveBeenCalledWith(
      "exec-1",
      "Verifying: read file",
      expect.any(String),
    );
    expect(finishToolExecution).toHaveBeenCalledWith("exec-1", "done", "ok");
  });

  it("adapts review command callbacks and delegates to the prompt host", async () => {
    const onStreamingToken = vi.fn();
    const startToolExecution = vi.fn();
    const finishToolExecution = vi.fn();

    handleReviewPromptCommandMock.mockImplementation(async (options: any) => {
      options.onToken("tok");
      options.onToolStart("grep", { pattern: "TODO" }, "exec-2");
      options.onToolEnd("exec-2", "warn", true);
      expect(typeof options.runReviewSession).toBe("function");
      return true;
    });

    const handled = await handleReviewCommandWithHost({
      commandText: "/review",
      workspaceRoot: "E:\\repo",
      config: { type: "anthropic", apiKey: "secret", model: "claude-sonnet" },
      envMap: { HELLO: "world" },
      runtime: {
        getToolContext: () =>
          ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) as any,
        getToolDefinitions: async () => [{ name: "grep" }] as any,
        getMcpStatusSummary: async () => [] as any,
      },
      tools: [{ name: "grep" }] as any,
      runtimeOptions: { fastMode: true },
      effortLevel: "medium",
      sessionMessages: [{ role: "user", content: "task" }],
      blockedByPlanMode: false,
      getConversationHistory: () => [{ role: "user", content: "task" }],
      getPendingPlanVerification: () => undefined,
      backgroundTaskHost: {
        runBuiltInAgentSession: vi.fn(),
        buildFollowUpMessage: vi.fn(() => "follow-up"),
      } as any,
      findActiveBuiltInAgentTask: vi.fn(async () => undefined),
      createProviderAdapter: vi.fn(() => ({}) as any),
      onStreamingToken,
      startToolExecution,
      finishToolExecution,
      addPhaseActivity: vi.fn(() => "activity-2"),
      finishPhaseActivity: vi.fn(),
      recordAssistantReply: vi.fn(async () => undefined),
      setCompanionState: vi.fn(),
      clearStreamingText: vi.fn(),
      updateMood: vi.fn(async () => undefined),
      isAbortLikeError: vi.fn(() => false),
    });

    expect(handled).toBe(true);
    expect(onStreamingToken).toHaveBeenCalledWith("tok");
    expect(startToolExecution).toHaveBeenCalledWith(
      "exec-2",
      "Reviewing: grep",
      expect.any(String),
    );
    expect(finishToolExecution).toHaveBeenCalledWith("exec-2", "error", "warn");
  });

  it("rejects /ultrareview when the active provider is not Claude CLI", async () => {
    const recordAssistantReply = vi.fn(async () => undefined);

    const handled = await handleUltrareviewCommandWithHost({
      commandText: "/ultrareview HEAD~2..HEAD",
      workspaceRoot: "E:\\repo",
      config: { type: "anthropic", apiKey: "secret", model: "claude-sonnet" },
      envMap: { HELLO: "world" },
      runtime: {
        getToolContext: () =>
          ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) as any,
      } as any,
      tools: [],
      runtimeOptions: { fastMode: true },
      effortLevel: "medium",
      sessionMessages: [{ role: "user", content: "请审查这个改动" }],
      blockedByPlanMode: false,
      getConversationHistory: () => [{ role: "user", content: "请审查这个改动" }],
      getPendingPlanVerification: () => undefined,
      backgroundTaskHost: {
        runBuiltInAgentSession: vi.fn(),
        buildFollowUpMessage: vi.fn(),
        runDetachedRemoteReview: vi.fn(),
      } as any,
      addPhaseActivity: vi.fn(() => "activity-ultra-1"),
      finishPhaseActivity: vi.fn(),
      recordAssistantReply,
      setCompanionState: vi.fn(),
      clearStreamingText: vi.fn(),
      updateMood: vi.fn(async () => undefined),
      isAbortLikeError: vi.fn(() => false),
    });

    expect(handled).toBe(true);
    expect(launchHostedReviewWithHostMock).not.toHaveBeenCalled();
    expect(recordAssistantReply).toHaveBeenCalledWith(
      expect.stringContaining("Claude CLI"),
      false,
    );
  });

  it("launches /ultrareview through the hosted review adapter and returns a notification-first reply", async () => {
    const recordAssistantReply = vi.fn(async () => undefined);
    const addPhaseActivity = vi.fn(() => "activity-ultra-2");
    const finishPhaseActivity = vi.fn();
    const setCompanionState = vi.fn();
    const clearStreamingText = vi.fn();
    const updateMood = vi.fn(async () => undefined);

    launchHostedReviewWithHostMock.mockResolvedValue({
      taskId: "remote-review-1",
      sessionId: "session-1",
      outputPath: "E:\\repo\\.cain\\remote-reviews\\remote-review-1\\output.log",
    });

    const handled = await handleUltrareviewCommandWithHost({
      commandText: "/ultrareview HEAD~2..HEAD focus auth regressions",
      workspaceRoot: "E:\\repo",
      config: { type: "claude-cli", model: "claude-3-7-sonnet" },
      envMap: {},
      runtime: {
        getToolContext: () =>
          ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) as any,
      } as any,
      tools: [],
      runtimeOptions: { fastMode: true },
      effortLevel: "high",
      sessionMessages: [{ role: "user", content: "请审查这个改动" }],
      blockedByPlanMode: false,
      getConversationHistory: () => [{ role: "user", content: "请审查这个改动" }],
      getPendingPlanVerification: () => ({
        planFilePath: ".omx/plans/review.md",
        planContent: "1. Inspect auth flow",
        approvedAtUserTurnCount: 3,
        verificationStarted: false,
        verificationCompleted: false,
      }),
      backgroundTaskHost: {
        runBuiltInAgentSession: vi.fn(),
        buildFollowUpMessage: vi.fn(),
        runDetachedRemoteReview: vi.fn(),
      } as any,
      addPhaseActivity,
      finishPhaseActivity,
      recordAssistantReply,
      setCompanionState,
      clearStreamingText,
      updateMood,
      isAbortLikeError: vi.fn(() => false),
    });

    expect(handled).toBe(true);
    expect(launchHostedReviewWithHostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        commandText: "/ultrareview HEAD~2..HEAD focus auth regressions",
        workspaceRoot: "E:\\repo",
        originalTask: "请审查这个改动",
        planFilePath: ".omx/plans/review.md",
        planContent: "1. Inspect auth flow",
      }),
    );
    expect(addPhaseActivity).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "running",
    );
    expect(finishPhaseActivity).toHaveBeenCalledWith(
      "activity-ultra-2",
      "done",
      expect.stringContaining("remote-review-1"),
    );
    expect(recordAssistantReply).toHaveBeenCalledWith(
      expect.stringContaining("Task ID: `remote-review-1`"),
      false,
    );
    expect(recordAssistantReply).toHaveBeenCalledWith(
      expect.stringContaining("`HEAD~2..HEAD`"),
      false,
    );
    expect(clearStreamingText).toHaveBeenCalledTimes(1);
    expect(setCompanionState).toHaveBeenCalledWith("done");
    expect(updateMood).toHaveBeenCalledWith(1, false);
  });

  it("uses Chinese review tool labels when the conversation is Chinese", async () => {
    const startToolExecution = vi.fn();

    handleReviewPromptCommandMock.mockImplementation(async (options: any) => {
      options.onToolStart("grep", { pattern: "TODO" }, "exec-zh-review");
      return true;
    });

    await handleReviewCommandWithHost({
      commandText: "/review",
      workspaceRoot: "E:\\repo",
      config: { type: "anthropic", apiKey: "secret", model: "claude-sonnet" },
      envMap: { HELLO: "world" },
      runtime: {
        getToolContext: () =>
          ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) as any,
        getToolDefinitions: async () => [{ name: "grep" }] as any,
        getMcpStatusSummary: async () => [] as any,
      },
      tools: [{ name: "grep" }] as any,
      runtimeOptions: { fastMode: true },
      effortLevel: "medium",
      sessionMessages: [{ role: "user", content: "请审查这个改动" }],
      blockedByPlanMode: false,
      getConversationHistory: () => [{ role: "user", content: "请审查这个改动" }],
      getPendingPlanVerification: () => undefined,
      backgroundTaskHost: {
        runBuiltInAgentSession: vi.fn(),
        buildFollowUpMessage: vi.fn(() => "follow-up"),
      } as any,
      findActiveBuiltInAgentTask: vi.fn(async () => undefined),
      createProviderAdapter: vi.fn(() => ({}) as any),
      onStreamingToken: vi.fn(),
      startToolExecution,
      finishToolExecution: vi.fn(),
      addPhaseActivity: vi.fn(() => "activity-zh-review"),
      finishPhaseActivity: vi.fn(),
      recordAssistantReply: vi.fn(async () => undefined),
      setCompanionState: vi.fn(),
      clearStreamingText: vi.fn(),
      updateMood: vi.fn(async () => undefined),
      isAbortLikeError: vi.fn(() => false),
    });

    expect(startToolExecution).toHaveBeenCalledWith(
      "exec-zh-review",
      "审查中：grep",
      expect.any(String),
    );
  });

  it("adapts verification tool launch callbacks to the host-backed session runner", async () => {
    launchVerificationFromToolMock.mockImplementation(async (options: any) =>
      options.runVerificationSession({
        commandText: "/verify extra",
        workspaceRoot: "E:\\repo",
        config: { type: "anthropic", apiKey: "secret", model: "claude-sonnet" },
        envMap: { HELLO: "world" },
        runtime: { getToolContext: () => ({ invokerKind: "main" }) },
        tools: [{ name: "read_file" }],
        runtimeOptions: { fastMode: true },
        effortLevel: "high",
      }),
    );
    runVerificationInspectionSessionMock.mockResolvedValue({
      taskId: "verify-2",
      report: "ok",
      verdict: "PASS",
    });

    const result = await runVerificationFromToolWithHost({
      workspaceFolderPath: "E:\\repo",
      extraGuidance: "extra",
      resolveProviderConfig: vi.fn(async () => providerResolution),
      getEffortLevel: () => "high",
      createProviderRuntimeOptions: vi.fn(() => ({ fastMode: true })),
      ensureConversationWorktreeHydrated: vi.fn(async () => undefined),
      getEffectiveWorkspaceRoot: vi.fn(path => path),
      getWorkspaceRuntime: vi.fn(async () => ({}) as any),
      getConversationHistory: () => [{ role: "user", content: "task" }],
      sessionMessages: [{ role: "user", content: "task" }],
      getPendingPlanVerification: () => undefined,
      backgroundTaskHost: { runBuiltInAgentSession: vi.fn() } as any,
      findActiveBuiltInAgentTask: vi.fn(async () => undefined),
      createProviderAdapter: vi.fn(() => ({}) as any),
      markPendingPlanVerificationStarted: vi.fn(),
      markPendingPlanVerificationCompleted: vi.fn(),
      resetPendingPlanVerificationToAwaitingStart: vi.fn(),
    });

    expect(launchVerificationFromToolMock).toHaveBeenCalledTimes(1);
    expect(runVerificationInspectionSessionMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      taskId: "verify-2",
      report: "ok",
      verdict: "PASS",
    });
  });

  it("adapts review tool launch callbacks to the host-backed session runner", async () => {
    launchReviewFromToolMock.mockImplementation(async (options: any) =>
      options.runReviewSession({
        commandText: "/review extra",
        workspaceRoot: "E:\\repo",
        config: { type: "anthropic", apiKey: "secret", model: "claude-sonnet" },
        envMap: { HELLO: "world" },
        runtime: { getToolContext: () => ({ invokerKind: "main" }) },
        tools: [{ name: "read_file" }],
        runtimeOptions: { fastMode: true },
        effortLevel: "medium",
      }),
    );
    runReviewInspectionSessionMock.mockResolvedValue({
      taskId: "review-2",
      report: "ok",
    });

    const result = await runReviewFromToolWithHost({
      workspaceFolderPath: "E:\\repo",
      extraGuidance: "extra",
      resolveProviderConfig: vi.fn(async () => providerResolution),
      getEffortLevel: () => "medium",
      createProviderRuntimeOptions: vi.fn(() => ({ fastMode: true })),
      ensureConversationWorktreeHydrated: vi.fn(async () => undefined),
      getEffectiveWorkspaceRoot: vi.fn(path => path),
      getWorkspaceRuntime: vi.fn(async () => ({}) as any),
      getConversationHistory: () => [{ role: "user", content: "task" }],
      sessionMessages: [{ role: "user", content: "task" }],
      getPendingPlanVerification: () => undefined,
      backgroundTaskHost: { runBuiltInAgentSession: vi.fn() } as any,
      findActiveBuiltInAgentTask: vi.fn(async () => undefined),
      createProviderAdapter: vi.fn(() => ({}) as any),
    });

    expect(launchReviewFromToolMock).toHaveBeenCalledTimes(1);
    expect(runReviewInspectionSessionMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      taskId: "review-2",
      report: "ok",
    });
  });
});
