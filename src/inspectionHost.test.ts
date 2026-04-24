import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderResolution } from "./workspaceHost";

const {
  runVerificationInspectionSessionMock,
  runReviewInspectionSessionMock,
  launchVerificationFromToolMock,
  launchReviewFromToolMock,
  handleVerificationPromptCommandMock,
  handleReviewPromptCommandMock,
} = vi.hoisted(() => ({
  runVerificationInspectionSessionMock: vi.fn(),
  runReviewInspectionSessionMock: vi.fn(),
  launchVerificationFromToolMock: vi.fn(),
  launchReviewFromToolMock: vi.fn(),
  handleVerificationPromptCommandMock: vi.fn(),
  handleReviewPromptCommandMock: vi.fn(),
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

import {
  handleReviewCommandWithHost,
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
      "正在执行 read file",
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
      "瀹℃煡涓細grep",
      expect.any(String),
    );
    expect(finishToolExecution).toHaveBeenCalledWith("exec-2", "error", "warn");
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
