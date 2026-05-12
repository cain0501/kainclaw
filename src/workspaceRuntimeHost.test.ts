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
      getToolDefinitions: vi.fn(async () => []),
      getToolContext: vi.fn(() => ({ workspaceRoot: "E:\\repo", invokerKind: "worker" })),
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
    const spawnSubAgent = vi.fn(async () => ({
      text: "subagent result",
    }));
    const runCommandInBackground = vi.fn(async () => ({
      taskId: "cmd-1",
      command: "npm run build",
      workspaceRoot: "E:\\repo",
    }));
    const findReusableBackgroundCommand = vi.fn(async () => null);
    const extractWebContent = vi.fn(async () => "summary");
    const readConfig = vi.fn((key: string) => (key === "fastMode" ? true : undefined));
    const writeConfig = vi.fn(async () => undefined);

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
      spawnSubAgent,
      runCommandInBackground,
      findReusableBackgroundCommand,
      extractWebContent,
      readConfig,
      writeConfig,
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
      spawnSubAgent,
      runCommandInBackground,
      findReusableBackgroundCommand,
      extractWebContent,
      readConfig,
      writeConfig,
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
      spawnSubAgent,
      runCommandInBackground,
      findReusableBackgroundCommand,
      writeConfig,
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
    const spawnSubAgentCallback = constructorArgs?.[12] as
      | ((request: {
          agentType: string;
          prompt: string;
          description?: string;
        }) => Promise<Record<string, unknown>>)
      | undefined;
    const runCommandInBackgroundCallback = constructorArgs?.[13] as
      | ((request: { command: string }) => Promise<Record<string, unknown>>)
      | undefined;
    const findReusableBackgroundCommandCallback = constructorArgs?.[14] as
      | ((request: { command: string }) => Promise<Record<string, unknown> | null>)
      | undefined;
    const readConfigCallback = constructorArgs?.[21] as
      | ((key: string) => unknown)
      | undefined;
    const writeConfigCallback = constructorArgs?.[22] as
      | ((key: string, value: unknown) => Promise<void>)
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
    await spawnSubAgentCallback?.({
      agentType: "general-purpose",
      prompt: "inspect the workspace",
      description: "Inspect workspace",
    });
    await runCommandInBackgroundCallback?.({ command: "npm run build" });
    await findReusableBackgroundCommandCallback?.({ command: "npm run build" });
    expect(readConfigCallback?.("fastMode")).toBe(true);
    await writeConfigCallback?.("fastMode", false);

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
    expect(spawnSubAgent).toHaveBeenCalledWith("E:\\repo", {
      agentType: "general-purpose",
      prompt: "inspect the workspace",
      description: "Inspect workspace",
    });
    expect(runCommandInBackground).toHaveBeenCalledWith("E:\\repo", {
      command: "npm run build",
    });
    expect(findReusableBackgroundCommand).toHaveBeenCalledWith("E:\\repo", {
      command: "npm run build",
    });
    expect(writeConfig).toHaveBeenCalledWith("fastMode", false);
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
      getToolContext: () =>
        ({ workspaceRoot: "E:\\repo\\.wt", invokerKind: "worker" as const }) as any,
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
    const readConfig = vi.fn((key: string) => (key === "model" ? "claude-sonnet" : undefined));
    const writeConfig = vi.fn(async () => undefined);
    const stopSwarmWorker = vi.fn(async taskId => ({
      taskId,
      taskType: "worker",
      command: "stop",
    }));
    const spawnSubAgent = vi.fn(async () => ({
      text: "subagent result",
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
      readConfig,
      writeConfig,
      getSessionInstalledSkillHooks: () => [],
      registerSessionInstalledSkillHooks: (
        hooks: import("./hooksRegistry").HookDefinition[],
      ) => hooks,
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
      getSessionInstalledSkillHooks: () => [],
      registerSessionInstalledSkillHooks: (
        hooks: import("./hooksRegistry").HookDefinition[],
      ) => hooks,
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
    const spawnSubAgentCallback = constructorArgs?.[12] as
      | ((request: {
          agentType: string;
          prompt: string;
          description?: string;
        }) => Promise<Record<string, unknown>>)
      | undefined;
    const runCommandInBackgroundCallback = constructorArgs?.[13] as
      | ((request: { command: string }) => Promise<Record<string, unknown>>)
      | undefined;
    const findReusableBackgroundCommandCallback = constructorArgs?.[14] as
      | ((request: { command: string }) => Promise<Record<string, unknown> | null>)
      | undefined;
    const readConfigCallback = constructorArgs?.[21] as
      | ((key: string) => unknown)
      | undefined;
    const writeConfigCallback = constructorArgs?.[22] as
      | ((key: string, value: unknown) => Promise<void>)
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
    expect(readConfigCallback?.("model")).toBe("claude-sonnet");
    await writeConfigCallback?.("fastMode", true);

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
    expect(writeConfig).toHaveBeenCalledWith("fastMode", true);
  });

  it("filters Explore subagent tools down to read-only tools and excludes Agent", async () => {
    const createProviderRuntimeOptions = vi.fn(() => ({
      effortLevel: "high" as const,
    }));
    const getWorkspaceRuntime = vi.fn(async () => ({
      getToolDefinitions: async () => [
        { name: "list_files", annotations: { readOnlyHint: true } },
        { name: "read_file", annotations: { readOnlyHint: true } },
        { name: "search_files", annotations: { readOnlyHint: true } },
        { name: "glob_files", annotations: { readOnlyHint: true } },
        { name: "run_command", annotations: { readOnlyHint: true } },
        { name: "Agent", annotations: { readOnlyHint: true } },
        { name: "write_file", annotations: { destructiveHint: true } },
      ] as any,
      getMcpStatusSummary: async () => [],
      getToolContext: vi.fn(() => ({
        workspaceRoot: "E:\\repo\\.wt",
        invokerKind: "worker" as const,
      })),
    }));
    const createProviderAdapter = vi.fn(() => ({ runStep: vi.fn() } as any));

    const factory = createWorkspaceRuntimeHostFactory({
      requestFileApproval: vi.fn(async () => true),
      requestToolApproval: vi.fn(async () => true),
      onToolLifecycle: vi.fn(),
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
        stopTask: vi.fn(async () => null),
        runBuiltInAgentSession: vi.fn(),
      } as any,
      findActiveBuiltInAgentTask: vi.fn(async () => undefined),
      createProviderAdapter,
      runCommandInBackground: vi.fn(async () => ({
        taskId: "cmd-1",
        command: "npm run build",
        workspaceRoot: "E:\\repo",
      })),
      findReusableBackgroundCommand: vi.fn(async () => null),
      getSessionInstalledSkillHooks: () => [],
      registerSessionInstalledSkillHooks: hooks => hooks,
    });

    const host = factory({
      getConversationKey: () => "conversation-1",
      clearSwarm: vi.fn(),
      getPlanModeState: () => ({ active: false }),
      setPlanModeState: vi.fn(),
      clearPendingPlanVerification: vi.fn(),
      setPendingPlanVerification: vi.fn(),
      postState: vi.fn(),
      getPendingPlanVerification: () => undefined,
      markPendingPlanVerificationStarted: vi.fn(),
      markPendingPlanVerificationCompleted: vi.fn(),
      resetPendingPlanVerificationToAwaitingStart: vi.fn(),
      getConversationHistory: () => [],
      getSessionInstalledSkillHooks: () => [],
      registerSessionInstalledSkillHooks: hooks => hooks,
      getSessionMessages: () => [],
      getTasks: vi.fn(() => ({ kind: "tasks" } as any)),
      getWorktree: vi.fn(() => ({ kind: "worktree" } as any)),
      stopSwarmWorker: vi.fn(async taskId => ({
        taskId,
        taskType: "worker",
        command: "stop",
      })),
    });

    await host.getRuntime("E:\\repo", { TOKEN: "abc" });
    const constructorArgs = workspaceRuntimeConstructor.mock.calls.at(-1) as unknown[];
    const spawnSubAgentCallback = constructorArgs?.[12] as
      | ((request: {
          agentType: string;
          prompt: string;
          description?: string;
        }) => Promise<Record<string, unknown>>)
      | undefined;

    const runAgentSpy = vi
      .spyOn(await import("./agent/agentRunner.js"), "runAgent")
      .mockResolvedValue({
        text: "explore result",
        messages: [],
      });

    try {
      const result = await spawnSubAgentCallback?.({
        agentType: "Explore",
        prompt: "Find compact files",
      });

      expect(result).toEqual({ text: "explore result" });
      expect(runAgentSpy).toHaveBeenCalledTimes(1);
      const runAgentOptions = runAgentSpy.mock.calls[0]?.[1];
      expect(runAgentOptions?.toolContext?.invokerKind).toBe("worker");
      expect(runAgentOptions?.tools.map((tool: { name: string }) => tool.name)).toEqual([
        "list_files",
        "read_file",
        "search_files",
        "glob_files",
        "run_command",
      ]);
    } finally {
      runAgentSpy.mockRestore();
    }
  });
});
