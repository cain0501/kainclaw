import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  runBuiltInInspectionSessionMock,
  getOriginalTaskForInspectionMock,
  getVerificationToolsMock,
  getVerificationToolContextMock,
  runVerificationAgentMock,
  getReviewToolsMock,
  getReviewToolContextMock,
  runReviewAgentMock,
} = vi.hoisted(() => ({
  runBuiltInInspectionSessionMock: vi.fn(),
  getOriginalTaskForInspectionMock: vi.fn(),
  getVerificationToolsMock: vi.fn(),
  getVerificationToolContextMock: vi.fn(),
  runVerificationAgentMock: vi.fn(),
  getReviewToolsMock: vi.fn(),
  getReviewToolContextMock: vi.fn(),
  runReviewAgentMock: vi.fn(),
}));

vi.mock("./inspectionTaskHost", () => ({
  runBuiltInInspectionSession: runBuiltInInspectionSessionMock,
  getOriginalTaskForInspection: getOriginalTaskForInspectionMock,
}));

vi.mock("./verification/runner", () => ({
  getVerificationTools: getVerificationToolsMock,
  getVerificationToolContext: getVerificationToolContextMock,
  runVerificationAgent: runVerificationAgentMock,
}));

vi.mock("./review/runner", () => ({
  getReviewTools: getReviewToolsMock,
  getReviewToolContext: getReviewToolContextMock,
  runReviewAgent: runReviewAgentMock,
}));

import {
  runReviewInspectionSession,
  runVerificationInspectionSession,
} from "./inspectionSessionHost";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("inspectionSessionHost", () => {
  it("runs verification inspection sessions with plan callbacks and verification context", async () => {
    const provider = { runStep: vi.fn() } as any;
    const createProvider = vi.fn(() => provider);
    const markStarted = vi.fn();
    const markCompleted = vi.fn();
    const resetPending = vi.fn();

    getVerificationToolsMock.mockImplementation((tools: unknown[]) =>
      tools.filter(
        tool =>
          typeof tool === "object" &&
          tool !== null &&
          "name" in tool &&
          (tool as { name: string }).name === "read_file",
      ),
    );
    getVerificationToolContextMock.mockReturnValue({ mode: "verification" });
    runVerificationAgentMock.mockResolvedValue({
      report: "verification report",
      verdict: "PASS",
    });
    runBuiltInInspectionSessionMock.mockImplementationOnce(async options => {
      expect(options.agentType).toBe("verification");
      expect(options.taskContextMetadata).toMatchObject({
        planFilePath: ".omx/plans/test.md",
        approvedAtUserTurnCount: 4,
        hasPlanContent: true,
      });
      expect(options.createProvider("system prompt")).toBe(provider);
      expect(
        options.selectTools([
          { name: "read_file" },
          { name: "write_file" },
        ]),
      ).toEqual([{ name: "read_file" }]);
      expect(options.selectToolContext({ raw: true })).toEqual({
        mode: "verification",
      });

      const result = await options.runAgentSession({
        provider,
        tools: [{ name: "read_file" }] as any,
        toolContext: { mode: "verification" } as any,
        messages: [{ role: "user", content: "history" }],
        workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
        originalTask: "Implement detached task recovery",
        extraGuidance: "focus on build and tests",
      } as any);

      options.onBeforeRun?.();
      options.onSuccess?.(result);
      expect(options.finalizeSuccess(result)).toMatchObject({
        status: "completed",
        result: "verification report",
        output: "verification report",
        metadata: {
          verificationVerdict: "PASS",
        },
      });

      return {
        taskId: "verify-1",
        result,
      };
    });

    const result = await runVerificationInspectionSession({
      commandText: "/verify focus on build and tests",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      effortLevel: "high",
      runtime: {
        getToolContext: () => ({ mode: "all" } as any),
      },
      tools: [{ name: "read_file" } as any, { name: "write_file" } as any],
      conversationHistory: [
        { role: "user", content: "Implement detached task recovery" },
      ],
      sessionMessages: [
        { role: "user", content: "Implement detached task recovery" },
      ],
      pendingPlanVerification: {
        planFilePath: ".omx/plans/test.md",
        planContent: "1. Build\n2. Test",
        approvedAtUserTurnCount: 4,
        verificationStarted: false,
        verificationCompleted: false,
      },
      backgroundTaskHost: {
        runBuiltInAgentSession: runBuiltInInspectionSessionMock,
      } as any,
      findActiveBuiltInAgentTask: async () => undefined,
      createProvider,
      markPendingPlanVerificationStarted: markStarted,
      markPendingPlanVerificationCompleted: markCompleted,
      resetPendingPlanVerificationToAwaitingStart: resetPending,
    });

    expect(runVerificationAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        originalTask: "Implement detached task recovery",
        extraGuidance: "focus on build and tests",
        planFilePath: ".omx/plans/test.md",
        planContent: "1. Build\n2. Test",
      }),
    );
    expect(markStarted).toHaveBeenCalledTimes(1);
    expect(markCompleted).toHaveBeenCalledTimes(1);
    expect(resetPending).not.toHaveBeenCalled();
    expect(result).toEqual({
      taskId: "verify-1",
      report: "verification report",
      verdict: "PASS",
    });
  });

  it("adds diffRef to verification task metadata when command text targets a git range", async () => {
    runBuiltInInspectionSessionMock.mockImplementationOnce(async options => {
      expect(options.taskContextMetadata).toMatchObject({
        diffRef: "HEAD~3..HEAD",
      });

      return {
        taskId: "verify-diff",
        result: {
          report: "verification report",
          verdict: "PASS",
        },
      };
    });

    const result = await runVerificationInspectionSession({
      commandText: "/verify HEAD~3..HEAD",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      effortLevel: undefined,
      runtime: {
        getToolContext: () => ({ mode: "all" } as any),
      },
      tools: [],
      conversationHistory: [],
      sessionMessages: [
        { role: "user", content: "Verify recent implementation" },
      ],
      backgroundTaskHost: {
        runBuiltInAgentSession: runBuiltInInspectionSessionMock,
      } as any,
      findActiveBuiltInAgentTask: async () => undefined,
      createProvider: () => ({ runStep: vi.fn() } as any),
      markPendingPlanVerificationStarted: vi.fn(),
      markPendingPlanVerificationCompleted: vi.fn(),
      resetPendingPlanVerificationToAwaitingStart: vi.fn(),
    });

    expect(result).toEqual({
      taskId: "verify-diff",
      report: "verification report",
      verdict: "PASS",
    });
  });

  it("keeps diffRef and strips it from verification extra guidance for mixed commands", async () => {
    runVerificationAgentMock.mockResolvedValue({
      report: "verification report",
      verdict: "PASS",
    });
    runBuiltInInspectionSessionMock.mockImplementationOnce(async options => {
      expect(options.taskContextMetadata).toMatchObject({
        diffRef: "HEAD~3..HEAD",
      });

      const result = await options.runAgentSession({
        provider: { runStep: vi.fn() },
        tools: [],
        toolContext: {} as any,
        messages: [],
        workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
        originalTask: "Verify recent implementation",
        extraGuidance: "focus on tests",
      } as any);

      return {
        taskId: "verify-diff-guidance",
        result,
      };
    });

    await runVerificationInspectionSession({
      commandText: "/verify HEAD~3..HEAD focus on tests",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      effortLevel: undefined,
      runtime: {
        getToolContext: () => ({ mode: "all" } as any),
      },
      tools: [],
      conversationHistory: [],
      sessionMessages: [
        { role: "user", content: "Verify recent implementation" },
      ],
      backgroundTaskHost: {
        runBuiltInAgentSession: runBuiltInInspectionSessionMock,
      } as any,
      findActiveBuiltInAgentTask: async () => undefined,
      createProvider: () => ({ runStep: vi.fn() } as any),
      markPendingPlanVerificationStarted: vi.fn(),
      markPendingPlanVerificationCompleted: vi.fn(),
      resetPendingPlanVerificationToAwaitingStart: vi.fn(),
    });

    expect(runVerificationAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        diffRef: "HEAD~3..HEAD",
        extraGuidance: "focus on tests",
      }),
    );
  });

  it("resets pending plan verification only when verification never started", async () => {
    runBuiltInInspectionSessionMock.mockImplementationOnce(async options => {
      options.onFailure?.("verification failed");
      throw new Error("verification failed");
    });

    const resetPending = vi.fn();

    await expect(
      runVerificationInspectionSession({
        commandText: "/verify",
        workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
        config: {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-sonnet",
        },
        effortLevel: undefined,
        runtime: {
          getToolContext: () => ({ mode: "all" } as any),
        },
        tools: [],
        conversationHistory: [],
        sessionMessages: [],
        pendingPlanVerification: {
          planFilePath: ".omx/plans/test.md",
          planContent: "1. Build\n2. Test",
          approvedAtUserTurnCount: 4,
          verificationStarted: false,
          verificationCompleted: false,
        },
        backgroundTaskHost: {
          runBuiltInAgentSession: runBuiltInInspectionSessionMock,
        } as any,
        findActiveBuiltInAgentTask: async () => undefined,
        createProvider: () => ({ runStep: vi.fn() } as any),
        markPendingPlanVerificationStarted: vi.fn(),
        markPendingPlanVerificationCompleted: vi.fn(),
        resetPendingPlanVerificationToAwaitingStart: resetPending,
      }),
    ).rejects.toThrow("verification failed");

    expect(resetPending).toHaveBeenCalledTimes(1);
  });

  it("resets pending plan verification when a started verification session crashes before producing a verdict", async () => {
    runBuiltInInspectionSessionMock.mockImplementationOnce(async options => {
      options.onBeforeRun?.();
      options.onFailure?.("verification crashed");
      throw new Error("verification crashed");
    });

    const markStarted = vi.fn();
    const resetPending = vi.fn();

    await expect(
      runVerificationInspectionSession({
        commandText: "/verify",
        workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
        config: {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-sonnet",
        },
        effortLevel: undefined,
        runtime: {
          getToolContext: () => ({ mode: "all" } as any),
        },
        tools: [],
        conversationHistory: [],
        sessionMessages: [],
        pendingPlanVerification: {
          planFilePath: ".omx/plans/test.md",
          planContent: "1. Build\n2. Test",
          approvedAtUserTurnCount: 4,
          verificationStarted: true,
          verificationCompleted: false,
        },
        backgroundTaskHost: {
          runBuiltInAgentSession: runBuiltInInspectionSessionMock,
        } as any,
        findActiveBuiltInAgentTask: async () => undefined,
        createProvider: () => ({ runStep: vi.fn() } as any),
        markPendingPlanVerificationStarted: markStarted,
        markPendingPlanVerificationCompleted: vi.fn(),
        resetPendingPlanVerificationToAwaitingStart: resetPending,
      }),
    ).rejects.toThrow("verification crashed");

    expect(markStarted).not.toHaveBeenCalled();
    expect(resetPending).toHaveBeenCalledTimes(1);
  });

  it("marks verification FAIL sessions as failed with verdict metadata", async () => {
    const provider = { runStep: vi.fn() } as any;
    const markCompleted = vi.fn();
    const resetPending = vi.fn();

    getVerificationToolsMock.mockReturnValue([{ name: "read_file" }]);
    getVerificationToolContextMock.mockReturnValue({ mode: "verification" });
    runVerificationAgentMock.mockResolvedValue({
      report: "verification failed report",
      verdict: "FAIL",
    });
    runBuiltInInspectionSessionMock.mockImplementationOnce(async options => {
      const result = await options.runAgentSession({
        provider,
        tools: [{ name: "read_file" }] as any,
        toolContext: { mode: "verification" } as any,
        messages: [{ role: "user", content: "history" }],
        workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
        originalTask: "Implement detached task recovery",
      } as any);

      expect(options.finalizeSuccess(result)).toMatchObject({
        status: "failed",
        result: "verification failed report",
        output: "verification failed report",
        error: "Verification finished with VERDICT: FAIL",
        metadata: {
          verificationVerdict: "FAIL",
        },
      });

      options.onBeforeRun?.();
      options.onSuccess?.(result);

      return {
        taskId: "verify-2",
        result,
      };
    });

    const result = await runVerificationInspectionSession({
      commandText: "/verify",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      effortLevel: "medium",
      runtime: {
        getToolContext: () => ({ mode: "all" } as any),
      },
      tools: [{ name: "read_file" } as any],
      conversationHistory: [
        { role: "user", content: "Implement detached task recovery" },
      ],
      sessionMessages: [
        { role: "user", content: "Implement detached task recovery" },
      ],
      pendingPlanVerification: {
        planFilePath: ".omx/plans/test.md",
        planContent: "1. Build\n2. Test",
        approvedAtUserTurnCount: 4,
        verificationStarted: false,
        verificationCompleted: false,
      },
      backgroundTaskHost: {
        runBuiltInAgentSession: runBuiltInInspectionSessionMock,
      } as any,
      findActiveBuiltInAgentTask: async () => undefined,
      createProvider: () => provider,
      markPendingPlanVerificationStarted: vi.fn(),
      markPendingPlanVerificationCompleted: markCompleted,
      resetPendingPlanVerificationToAwaitingStart: resetPending,
    });

    expect(markCompleted).not.toHaveBeenCalled();
    expect(resetPending).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      taskId: "verify-2",
      report: "verification failed report",
      verdict: "FAIL",
    });
  });

  it("treats verification PARTIAL sessions as failed and keeps plan verification pending", async () => {
    const provider = { runStep: vi.fn() } as any;
    const markStarted = vi.fn();
    const markCompleted = vi.fn();
    const resetPending = vi.fn();

    getVerificationToolsMock.mockReturnValue([{ name: "read_file" }]);
    getVerificationToolContextMock.mockReturnValue({ mode: "verification" });
    runVerificationAgentMock.mockResolvedValue({
      report: "verification partial report",
      verdict: "PARTIAL",
    });
    runBuiltInInspectionSessionMock.mockImplementationOnce(async options => {
      const result = await options.runAgentSession({
        provider,
        tools: [{ name: "read_file" }] as any,
        toolContext: { mode: "verification" } as any,
        messages: [{ role: "user", content: "history" }],
        workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
        originalTask: "Implement detached task recovery",
      } as any);

      options.onBeforeRun?.();
      options.onSuccess?.(result);

      expect(options.finalizeSuccess(result)).toMatchObject({
        status: "failed",
        result: "verification partial report",
        output: "verification partial report",
        error: "Verification finished with VERDICT: PARTIAL",
        metadata: {
          verificationVerdict: "PARTIAL",
        },
      });

      return {
        taskId: "verify-3",
        result,
      };
    });

    const result = await runVerificationInspectionSession({
      commandText: "/verify",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      effortLevel: "medium",
      runtime: {
        getToolContext: () => ({ mode: "all" } as any),
      },
      tools: [{ name: "read_file" } as any],
      conversationHistory: [
        { role: "user", content: "Implement detached task recovery" },
      ],
      sessionMessages: [
        { role: "user", content: "Implement detached task recovery" },
      ],
      pendingPlanVerification: {
        planFilePath: ".omx/plans/test.md",
        planContent: "1. Build\n2. Test",
        approvedAtUserTurnCount: 4,
        verificationStarted: false,
        verificationCompleted: false,
      },
      backgroundTaskHost: {
        runBuiltInAgentSession: runBuiltInInspectionSessionMock,
      } as any,
      findActiveBuiltInAgentTask: async () => undefined,
      createProvider: () => provider,
      markPendingPlanVerificationStarted: markStarted,
      markPendingPlanVerificationCompleted: markCompleted,
      resetPendingPlanVerificationToAwaitingStart: resetPending,
    });

    expect(markStarted).toHaveBeenCalledTimes(1);
    expect(markCompleted).not.toHaveBeenCalled();
    expect(resetPending).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      taskId: "verify-3",
      report: "verification partial report",
      verdict: "PARTIAL",
    });
  });

  it("runs review inspection sessions with review context and original-task fallback", async () => {
    const provider = { runStep: vi.fn() } as any;
    const createProvider = vi.fn(() => provider);

    getOriginalTaskForInspectionMock.mockReturnValue("Review detached task handling");
    getReviewToolsMock.mockImplementation((tools: unknown[]) =>
      tools.filter(
        tool =>
          typeof tool === "object" &&
          tool !== null &&
          "name" in tool &&
          (tool as { name: string }).name === "read_file",
      ),
    );
    getReviewToolContextMock.mockReturnValue({ mode: "review" });
    runReviewAgentMock.mockResolvedValue("review report");
    runBuiltInInspectionSessionMock.mockImplementationOnce(async options => {
      expect(options.agentType).toBe("review");
      expect(options.promptForTask).toBe("Review detached task handling");
      expect(options.taskContextMetadata).toMatchObject({
        planFilePath: ".omx/plans/review.md",
        approvedAtUserTurnCount: 7,
        hasPlanContent: true,
      });
      expect(options.createProvider("system prompt")).toBe(provider);
      expect(
        options.selectTools([
          { name: "read_file" },
          { name: "write_file" },
        ]),
      ).toEqual([{ name: "read_file" }]);
      expect(options.selectToolContext({ raw: true })).toEqual({ mode: "review" });
      expect(options.finalizeFailure?.("boom")).toMatchObject({
        status: "failed",
        error: "boom",
        result: "Review failed: boom",
      });

      const result = await options.runAgentSession({
        provider,
        tools: [{ name: "read_file" }] as any,
        toolContext: { mode: "review" } as any,
        messages: [{ role: "user", content: "history" }],
        workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
        originalTask: "Review detached task handling",
        extraGuidance: "focus on regressions",
      } as any);

      expect(options.finalizeSuccess(result)).toMatchObject({
        status: "completed",
        result: "review report",
        output: "review report",
      });

      return {
        taskId: "review-1",
        result,
      };
    });

    const result = await runReviewInspectionSession({
      commandText: "/review focus on regressions",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      effortLevel: "medium",
      runtime: {
        getToolContext: () => ({ mode: "all" } as any),
      },
      tools: [{ name: "read_file" } as any, { name: "write_file" } as any],
      conversationHistory: [
        { role: "user", content: "Review detached task handling" },
      ],
      sessionMessages: [
        { role: "user", content: "Review detached task handling" },
      ],
      pendingPlanVerification: {
        planFilePath: ".omx/plans/review.md",
        planContent: "1. Review\n2. Verify",
        approvedAtUserTurnCount: 7,
        verificationStarted: true,
        verificationCompleted: false,
      },
      backgroundTaskHost: {
        runBuiltInAgentSession: runBuiltInInspectionSessionMock,
      } as any,
      findActiveBuiltInAgentTask: async () => undefined,
      createProvider,
    });

    expect(runReviewAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        originalTask: "Review detached task handling",
        extraGuidance: "focus on regressions",
        planFilePath: ".omx/plans/review.md",
        planContent: "1. Review\n2. Verify",
      }),
    );
    expect(result).toEqual({
      taskId: "review-1",
      report: "review report",
    });
  });

  it("adds diffRef to review task metadata when command text targets a git range", async () => {
    getOriginalTaskForInspectionMock.mockReturnValue("Review recent implementation");
    runBuiltInInspectionSessionMock.mockImplementationOnce(async options => {
      expect(options.taskContextMetadata).toMatchObject({
        diffRef: "main...HEAD",
      });

      return {
        taskId: "review-diff",
        result: "review report",
      };
    });

    const result = await runReviewInspectionSession({
      commandText: "/review main...HEAD",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      effortLevel: undefined,
      runtime: {
        getToolContext: () => ({ mode: "all" } as any),
      },
      tools: [],
      conversationHistory: [],
      sessionMessages: [
        { role: "user", content: "Review recent implementation" },
      ],
      backgroundTaskHost: {
        runBuiltInAgentSession: runBuiltInInspectionSessionMock,
      } as any,
      findActiveBuiltInAgentTask: async () => undefined,
      createProvider: () => ({ runStep: vi.fn() } as any),
    });

    expect(result).toEqual({
      taskId: "review-diff",
      report: "review report",
    });
  });

  it("treats numeric review arguments as PR numbers and strips them from guidance", async () => {
    getOriginalTaskForInspectionMock.mockReturnValue("Review pull request");
    runReviewAgentMock.mockResolvedValue("review report");
    runBuiltInInspectionSessionMock.mockImplementationOnce(async options => {
      expect(options.taskContextMetadata).toMatchObject({
        reviewPrNumber: "123",
      });
      expect(options.taskContextMetadata?.diffRef).toBeUndefined();

      const result = await options.runAgentSession({
        provider: { runStep: vi.fn() },
        tools: [],
        toolContext: {} as any,
        messages: [],
        workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
        originalTask: "Review pull request",
        extraGuidance: "focus on auth regressions",
      } as any);

      return {
        taskId: "review-pr-number",
        result,
      };
    });

    await runReviewInspectionSession({
      commandText: "/review 123 focus on auth regressions",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      effortLevel: undefined,
      runtime: {
        getToolContext: () => ({ mode: "all" } as any),
      },
      tools: [],
      conversationHistory: [],
      sessionMessages: [
        { role: "user", content: "Review pull request" },
      ],
      backgroundTaskHost: {
        runBuiltInAgentSession: runBuiltInInspectionSessionMock,
      } as any,
      findActiveBuiltInAgentTask: async () => undefined,
      createProvider: () => ({ runStep: vi.fn() } as any),
    });

    expect(runReviewAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prNumber: "123",
        diffRef: undefined,
        extraGuidance: "focus on auth regressions",
      }),
    );
  });

  it("prefers explicit review promptForTask over session fallback text", async () => {
    getOriginalTaskForInspectionMock.mockReturnValue("No original task found in the current conversation.");
    runBuiltInInspectionSessionMock.mockImplementationOnce(async options => {
      expect(options.promptForTask).toBe("Review the current workspace/project changes.");

      return {
        taskId: "review-explicit-prompt",
        result: "review report",
      };
    });

    const result = await runReviewInspectionSession({
      commandText: "/review",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      promptForTask: "Review the current workspace/project changes.",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      effortLevel: undefined,
      runtime: {
        getToolContext: () => ({ mode: "all" } as any),
      },
      tools: [],
      conversationHistory: [],
      sessionMessages: [
        { role: "user", content: "/review" },
      ],
      backgroundTaskHost: {
        runBuiltInAgentSession: runBuiltInInspectionSessionMock,
      } as any,
      findActiveBuiltInAgentTask: async () => undefined,
      createProvider: () => ({ runStep: vi.fn() } as any),
    });

    expect(getOriginalTaskForInspectionMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      taskId: "review-explicit-prompt",
      report: "review report",
    });
  });

  it("keeps diffRef and strips it from review extra guidance for mixed commands", async () => {
    getOriginalTaskForInspectionMock.mockReturnValue("Review recent implementation");
    runReviewAgentMock.mockResolvedValue("review report");
    runBuiltInInspectionSessionMock.mockImplementationOnce(async options => {
      expect(options.taskContextMetadata).toMatchObject({
        diffRef: "main...HEAD",
      });

      const result = await options.runAgentSession({
        provider: { runStep: vi.fn() },
        tools: [],
        toolContext: {} as any,
        messages: [],
        workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
        originalTask: "Review recent implementation",
        extraGuidance: "focus on regressions",
      } as any);

      return {
        taskId: "review-diff-guidance",
        result,
      };
    });

    await runReviewInspectionSession({
      commandText: "/review main...HEAD focus on regressions",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      effortLevel: undefined,
      runtime: {
        getToolContext: () => ({ mode: "all" } as any),
      },
      tools: [],
      conversationHistory: [],
      sessionMessages: [
        { role: "user", content: "Review recent implementation" },
      ],
      backgroundTaskHost: {
        runBuiltInAgentSession: runBuiltInInspectionSessionMock,
      } as any,
      findActiveBuiltInAgentTask: async () => undefined,
      createProvider: () => ({ runStep: vi.fn() } as any),
    });

    expect(runReviewAgentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        diffRef: "main...HEAD",
        extraGuidance: "focus on regressions",
      }),
    );
  });
});
