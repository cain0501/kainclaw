import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  runtimeInstances,
  workspaceRuntimeConstructor,
  enterPlanModeWithHostMock,
  getPlanContentForWorkspaceMock,
  exitPlanModeWithHostMock,
  runVerificationFromToolWithHostMock,
  runReviewFromToolWithHostMock,
} = vi.hoisted(() => {
  const instances: Array<{
    updateEnvMap: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }> = [];
  const constructor = vi.fn(function MockWorkspaceRuntime() {
    const instance = {
      updateEnvMap: vi.fn(),
      dispose: vi.fn(async () => undefined),
    };
    instances.push(instance);
    return instance;
  });
  const enterPlanModeWithHost = vi.fn(async () => ({
    planFilePath: "plan.md",
    planContent: "plan",
  }));
  const getPlanContentForWorkspace = vi.fn(async () => "plan");
  const exitPlanModeWithHost = vi.fn(async () => ({
    planFilePath: "plan.md",
    planContent: "plan",
  }));
  const runVerificationFromToolWithHost = vi.fn(async () => ({
    taskId: "verify-1",
    verdict: "PASS" as const,
    report: "ok",
  }));
  const runReviewFromToolWithHost = vi.fn(async () => ({
    taskId: "review-1",
    report: "ok",
  }));

  return {
    runtimeInstances: instances,
    workspaceRuntimeConstructor: constructor,
    enterPlanModeWithHostMock: enterPlanModeWithHost,
    getPlanContentForWorkspaceMock: getPlanContentForWorkspace,
    exitPlanModeWithHostMock: exitPlanModeWithHost,
    runVerificationFromToolWithHostMock: runVerificationFromToolWithHost,
    runReviewFromToolWithHostMock: runReviewFromToolWithHost,
  };
});

vi.mock("./workspaceRuntimeShell", () => ({
  WorkspaceRuntime: workspaceRuntimeConstructor,
}));

vi.mock("./planModeHost", () => ({
  enterPlanModeWithHost: enterPlanModeWithHostMock,
  getPlanContentForWorkspace: getPlanContentForWorkspaceMock,
  exitPlanModeWithHost: exitPlanModeWithHostMock,
}));

vi.mock("./inspectionHost", () => ({
  runVerificationFromToolWithHost: runVerificationFromToolWithHostMock,
  runReviewFromToolWithHost: runReviewFromToolWithHostMock,
}));

import {
  createWorkspaceRuntimeHostFactory,
  WorkspaceRuntimeHost,
} from "./workspaceRuntimeHost";

beforeEach(() => {
  runtimeInstances.length = 0;
  vi.clearAllMocks();
});

describe("workspaceRuntimeHost", () => {
  function createHost() {
    const requestFileApproval = vi.fn(async () => true);
    const requestToolApproval = vi.fn(async () => true);
    const onToolLifecycle = vi.fn();
    const getPlanModeController = vi.fn((workspaceFolderPath: string) => ({
      getState: () => ({ active: true, planFilePath: `${workspaceFolderPath}/plan.md` }),
      enter: async () => ({
        planFilePath: `${workspaceFolderPath}/plan.md`,
        planContent: "plan",
      }),
      getPlanContent: async () => "plan",
      exit: async () => ({
        planFilePath: `${workspaceFolderPath}/plan.md`,
        planContent: "plan",
      }),
    }));
    const getPlanVerificationState = vi.fn(() => ({
      planFilePath: ".omx/plans/test.md",
      verificationStarted: false,
      verificationCompleted: false,
    }));
    const tasksRuntime = { kind: "tasks" } as any;
    const worktreeRuntime = { kind: "worktree" } as any;
    const getTasks = vi.fn(() => tasksRuntime);
    const getWorktree = vi.fn(() => worktreeRuntime);
    const stopBackgroundTask = vi.fn(async () => null);
    const stopSwarmWorker = vi.fn(async taskId => ({
      taskId,
      taskType: "worker",
      command: "stop",
    }));
    const runVerification = vi.fn(async () => ({
      taskId: "verify-1",
      verdict: "PASS" as const,
      report: "ok",
    }));
    const runReview = vi.fn(async () => ({
      taskId: "review-1",
      report: "ok",
    }));
    const runCommandInBackground = vi.fn(async () => ({
      taskId: "cmd-1",
      command: "npm run build",
      workspaceRoot: "E:\\repo",
    }));
    const findReusableBackgroundCommand = vi.fn(async () => null);
    const extractWebContent = vi.fn(async () => "summary");

    const host = new WorkspaceRuntimeHost({
      getWorkspaceRoot: workspaceFolderPath => `${workspaceFolderPath}\\.wt`,
      requestFileApproval,
      requestToolApproval,
      onToolLifecycle,
      getPlanModeController,
      getPlanVerificationState,
      getTasks,
      getWorktree,
      stopBackgroundTask,
      stopSwarmWorker,
      runVerification,
      runReview,
      runCommandInBackground,
      findReusableBackgroundCommand,
      extractWebContent,
    });

    return {
      host,
      requestFileApproval,
      requestToolApproval,
      onToolLifecycle,
      getPlanModeController,
      getPlanVerificationState,
      getTasks,
      getWorktree,
      stopBackgroundTask,
      stopSwarmWorker,
      runVerification,
      runReview,
      runCommandInBackground,
      findReusableBackgroundCommand,
      extractWebContent,
      tasksRuntime,
      worktreeRuntime,
    };
  }

  it("reuses cached runtimes per workspace and refreshes env on subsequent requests", async () => {
    const { host, getPlanModeController } = createHost();

    const first = await host.getRuntime("E:\\repo", { FIRST: "1" });
    const second = await host.getRuntime("E:\\repo", { SECOND: "2" });

    expect(second).toBe(first);
    expect(workspaceRuntimeConstructor).toHaveBeenCalledTimes(1);
    expect(runtimeInstances[0]?.updateEnvMap).toHaveBeenCalledWith({
      SECOND: "2",
    });
    expect(getPlanModeController).toHaveBeenCalledTimes(1);
  });

  it("wires workspace-specific callbacks into the created runtime", async () => {
    const {
      host,
      requestFileApproval,
      requestToolApproval,
      onToolLifecycle,
      getTasks,
      getWorktree,
      stopBackgroundTask,
      stopSwarmWorker,
      runVerification,
      runReview,
      runCommandInBackground,
      findReusableBackgroundCommand,
      tasksRuntime,
      worktreeRuntime,
    } = createHost();

    await host.getRuntime("E:\\repo", { TOKEN: "abc" });

    const constructorArgs = (workspaceRuntimeConstructor.mock.calls as unknown[][])[0];
    const getWorkspaceRoot = constructorArgs?.[0] as (() => string) | undefined;
    const requestFileApprovalCallback = constructorArgs?.[2] as
      | ((request: Record<string, unknown>) => Promise<boolean>)
      | undefined;
    const requestToolApprovalCallback = constructorArgs?.[3] as
      | ((request: Record<string, unknown>) => Promise<boolean>)
      | undefined;
    const onToolLifecycleCallback = constructorArgs?.[4] as
      | ((event: Record<string, unknown>) => void)
      | undefined;
    const getPlanVerificationState = constructorArgs?.[6] as
      | (() => Record<string, unknown> | undefined)
      | undefined;
    const getTasksCallback = constructorArgs?.[7] as (() => unknown) | undefined;
    const getWorktreeCallback = constructorArgs?.[8] as (() => unknown) | undefined;
    const stopBackgroundTaskCallback = constructorArgs?.[9] as
      | ((taskId: string) => Promise<Record<string, unknown>>)
      | undefined;
    const runVerificationCallback = constructorArgs?.[10] as
      | ((request: { extraGuidance?: string; diffRef?: string }) => Promise<Record<string, unknown>>)
      | undefined;
    const runReviewCallback = constructorArgs?.[11] as
      | ((request: { extraGuidance?: string; diffRef?: string }) => Promise<Record<string, unknown>>)
      | undefined;
    const runCommandInBackgroundCallback = constructorArgs?.[12] as
      | ((request: { command: string }) => Promise<Record<string, unknown>>)
      | undefined;
    const findReusableBackgroundCommandCallback = constructorArgs?.[13] as
      | ((request: { command: string }) => Promise<Record<string, unknown> | null>)
      | undefined;

    expect(getWorkspaceRoot?.()).toBe("E:\\repo\\.wt");
    await requestFileApprovalCallback?.({ filePath: "a.ts" });
    await requestToolApprovalCallback?.({ name: "tool" });
    onToolLifecycleCallback?.({ kind: "tool-start" });
    expect(getPlanVerificationState?.()).toEqual({
      planFilePath: ".omx/plans/test.md",
      verificationStarted: false,
      verificationCompleted: false,
    });
    expect(getTasksCallback?.()).toBe(tasksRuntime);
    expect(getWorktreeCallback?.()).toBe(worktreeRuntime);
    await stopBackgroundTaskCallback?.("task-1");
    await runVerificationCallback?.({ extraGuidance: "verify", diffRef: "HEAD~2..HEAD" });
    await runReviewCallback?.({ extraGuidance: "review", diffRef: "main...HEAD" });
    await runCommandInBackgroundCallback?.({ command: "npm run build" });
    await findReusableBackgroundCommandCallback?.({ command: "npm run build" });

    expect(requestFileApproval).toHaveBeenCalledWith("E:\\repo", {
      filePath: "a.ts",
    });
    expect(requestToolApproval).toHaveBeenCalledWith({ name: "tool" });
    expect(onToolLifecycle).toHaveBeenCalledWith({ kind: "tool-start" });
    expect(getTasks).toHaveBeenCalledWith("E:\\repo");
    expect(getWorktree).toHaveBeenCalledWith("E:\\repo");
    expect(stopBackgroundTask).toHaveBeenCalledWith("task-1", "E:\\repo");
    expect(stopSwarmWorker).toHaveBeenCalledWith("task-1");
    expect(runVerification).toHaveBeenCalledWith("E:\\repo", {
      extraGuidance: "verify",
      diffRef: "HEAD~2..HEAD",
    });
    expect(runReview).toHaveBeenCalledWith("E:\\repo", {
      extraGuidance: "review",
      diffRef: "main...HEAD",
    });
    expect(runCommandInBackground).toHaveBeenCalledWith("E:\\repo", {
      command: "npm run build",
    });
    expect(findReusableBackgroundCommand).toHaveBeenCalledWith("E:\\repo", {
      command: "npm run build",
    });
  });

  it("disposes cached runtimes and clears the cache", async () => {
    const { host } = createHost();

    await host.getRuntime("E:\\repo-a", {});
    await host.getRuntime("E:\\repo-b", {});
    await host.dispose();
    const freshRuntime = await host.getRuntime("E:\\repo-a", {});

    expect(runtimeInstances[0]?.dispose).toHaveBeenCalledTimes(1);
    expect(runtimeInstances[1]?.dispose).toHaveBeenCalledTimes(1);
    expect(freshRuntime).toBe(runtimeInstances[2]);
    expect(workspaceRuntimeConstructor).toHaveBeenCalledTimes(3);
  });

  it("builds a workspace-runtime host factory around plan mode and inspection host wiring", async () => {
    const requestFileApproval = vi.fn(async () => true);
    const requestToolApproval = vi.fn(async () => true);
    const onToolLifecycle = vi.fn();
    const createProviderRuntimeOptions = vi.fn(() => ({
      effortLevel: "high" as const,
    }));
    const getWorkspaceRuntime = vi.fn(async () => ({
      getToolDefinitions: async () => [],
      getMcpStatusSummary: async () => [],
      getToolContext: () => ({}) as any,
    }));
    const stopTask = vi.fn(async () => null);
    const findActiveBuiltInAgentTask = vi.fn(async () => undefined);
    const createProviderAdapter = vi.fn(() => ({ runStep: vi.fn() } as any));
    const runCommandInBackground = vi.fn(async () => ({
      taskId: "cmd-1",
      command: "npm run build",
      workspaceRoot: "E:\\repo",
    }));
    const findReusableBackgroundCommand = vi.fn(async () => null);
    const stopSwarmWorker = vi.fn(async taskId => ({
      taskId,
      taskType: "worker",
      command: "stop",
    }));
    let planModeState: {
      active: boolean;
      planFilePath?: string;
      conversationKey?: string;
    } = {
      active: false,
      planFilePath: "plan.md",
      conversationKey: "conversation-1",
    };
    const sessionMessages = [{ role: "user" as const, content: "hello" }];
    const conversationHistory = [
      { role: "user" as const, content: "hello" },
      { role: "assistant" as const, content: "world" },
    ];
    let pendingPlanVerification: any = {
      planFilePath: "plan.md",
      verificationStarted: false,
      verificationCompleted: false,
    };

    const factory = createWorkspaceRuntimeHostFactory({
      requestFileApproval,
      requestToolApproval,
      onToolLifecycle,
      resolveProviderConfig: async workspaceFolderPath => ({
        config: {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-sonnet",
        },
        envMap: { WORKSPACE: workspaceFolderPath },
      }),
      getEffortLevel: () => "high",
      createProviderRuntimeOptions,
      ensureConversationWorktreeHydrated: async () => undefined,
      getEffectiveWorkspaceRoot: workspaceFolderPath =>
        `${workspaceFolderPath}\\.wt`,
      getWorkspaceRuntime,
      backgroundTaskHost: {
        stopTask,
        runBuiltInAgentSession: vi.fn(),
      } as any,
      findActiveBuiltInAgentTask,
      createProviderAdapter,
      runCommandInBackground,
      findReusableBackgroundCommand,
    });

    const host = factory({
      getConversationKey: () => "conversation-1",
      clearSwarm: vi.fn(),
      getPlanModeState: () => planModeState,
      setPlanModeState: state => {
        planModeState = state;
      },
      clearPendingPlanVerification: vi.fn(() => {
        pendingPlanVerification = undefined;
      }),
      setPendingPlanVerification: state => {
        pendingPlanVerification = state;
      },
      postState: vi.fn(),
      getPendingPlanVerification: () => pendingPlanVerification,
      markPendingPlanVerificationStarted: vi.fn(),
      markPendingPlanVerificationCompleted: vi.fn(),
      resetPendingPlanVerificationToAwaitingStart: vi.fn(),
      getConversationHistory: () => conversationHistory,
      getSessionMessages: () => sessionMessages,
      getTasks: vi.fn(() => ({ kind: "tasks" } as any)),
      getWorktree: vi.fn(() => ({ kind: "worktree" } as any)),
      stopSwarmWorker,
    });

    await host.getRuntime("E:\\repo", { TOKEN: "abc" });

    const constructorArgs = workspaceRuntimeConstructor.mock.calls[0] as unknown[];
    const planModeController = constructorArgs?.[5] as
      | {
          enter: () => Promise<unknown>;
          getPlanContent: () => Promise<unknown>;
          exit: () => Promise<unknown>;
        }
      | undefined;
    const stopBackgroundTaskCallback = constructorArgs?.[9] as
      | ((taskId: string) => Promise<Record<string, unknown>>)
      | undefined;
    const runVerificationCallback = constructorArgs?.[10] as
      | ((request: { extraGuidance?: string; diffRef?: string }) => Promise<Record<string, unknown>>)
      | undefined;
    const runReviewCallback = constructorArgs?.[11] as
      | ((request: { extraGuidance?: string; diffRef?: string }) => Promise<Record<string, unknown>>)
      | undefined;
    const runCommandInBackgroundCallback = constructorArgs?.[12] as
      | ((request: { command: string }) => Promise<Record<string, unknown>>)
      | undefined;
    const findReusableBackgroundCommandCallback = constructorArgs?.[13] as
      | ((request: { command: string }) => Promise<Record<string, unknown> | null>)
      | undefined;

    await planModeController?.enter();
    await planModeController?.getPlanContent();
    await planModeController?.exit();
    await stopBackgroundTaskCallback?.("task-1");
    await runVerificationCallback?.({
      extraGuidance: "verify",
      diffRef: "HEAD~1..HEAD",
    });
    await runReviewCallback?.({
      extraGuidance: "review",
      diffRef: "main...HEAD",
    });
    await runCommandInBackgroundCallback?.({ command: "npm run build" });
    await findReusableBackgroundCommandCallback?.({ command: "npm run build" });

    expect(enterPlanModeWithHostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot: "E:\\repo\\.wt",
        conversationKey: "conversation-1",
      }),
    );
    expect(getPlanContentForWorkspaceMock).toHaveBeenCalledWith({
      workspaceRoot: "E:\\repo\\.wt",
      planModeState,
    });
    expect(exitPlanModeWithHostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceRoot: "E:\\repo\\.wt",
        planModeState,
        sessionMessages,
      }),
    );
    expect(stopTask).toHaveBeenCalledWith("task-1", "E:\\repo\\.wt");
    expect(stopSwarmWorker).toHaveBeenCalledWith("task-1");
    expect(runVerificationFromToolWithHostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceFolderPath: "E:\\repo",
        extraGuidance: "verify",
        diffRef: "HEAD~1..HEAD",
        sessionMessages,
      }),
    );
    expect(runReviewFromToolWithHostMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceFolderPath: "E:\\repo",
        extraGuidance: "review",
        diffRef: "main...HEAD",
        sessionMessages,
      }),
    );
    expect(runCommandInBackground).toHaveBeenCalledWith("E:\\repo", {
      command: "npm run build",
    });
    expect(findReusableBackgroundCommand).toHaveBeenCalledWith("E:\\repo", {
      command: "npm run build",
    });
  });
});
