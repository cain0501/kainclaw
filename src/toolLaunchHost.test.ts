import { describe, expect, it, vi } from "vitest";

const { prepareWorkspaceInspectionContextMock } = vi.hoisted(() => ({
  prepareWorkspaceInspectionContextMock: vi.fn(),
}));

vi.mock("./workspaceHost", async () => {
  const actual = await vi.importActual<typeof import("./workspaceHost")>("./workspaceHost");
  return {
    ...actual,
    prepareWorkspaceInspectionContext: prepareWorkspaceInspectionContextMock,
  };
});

import {
  createBackgroundCommandToolLaunchBindings,
  findReusableBackgroundCommandForWorkspace,
  runBackgroundCommandFromTool,
  runReviewFromTool,
  runVerificationFromTool,
} from "./toolLaunchHost";

describe("toolLaunchHost", () => {
  it("prepares inspection context and launches verification from tools", async () => {
    const runtime = {
      getToolDefinitions: async () => [],
      getMcpStatusSummary: async () => [],
    };
    const verificationResult = {
      taskId: "verify-1",
      report: "verification report",
      verdict: "PASS" as const,
    };
    const runVerificationSession = vi.fn(async () => verificationResult);

    prepareWorkspaceInspectionContextMock.mockResolvedValueOnce({
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: { HELLO: "world" },
      effortLevel: "high",
      runtimeOptions: { fastMode: true },
      workspaceRoot: "E:\\repo\\effective",
      runtime,
      tools: [{ name: "read_file" }],
    });

    const result = await runVerificationFromTool({
      workspaceFolderPath: "E:\\repo",
      extraGuidance: "focus on tests",
      resolveProviderConfig: async () => ({
        config: {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-sonnet",
        },
        envMap: {},
      }),
      getEffortLevel: () => "high",
      createProviderRuntimeOptions: () => ({ fastMode: true }),
      ensureConversationWorktreeHydrated: async () => undefined,
      getEffectiveWorkspaceRoot: path => `${path}\\effective`,
      getWorkspaceRuntime: async () => runtime,
      runVerificationSession,
    });

    expect(runVerificationSession).toHaveBeenCalledWith({
      commandText: "/verify focus on tests",
      workspaceRoot: "E:\\repo\\effective",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: { HELLO: "world" },
      runtime,
      tools: [{ name: "read_file" }],
      runtimeOptions: { fastMode: true },
      effortLevel: "high",
    });
    expect(result).toBe(verificationResult);
  });

  it("builds diff-aware verification command text for tool launches", async () => {
    const runtime = {
      getToolDefinitions: async () => [],
      getMcpStatusSummary: async () => [],
    };
    const runVerificationSession = vi.fn(async () => ({
      taskId: "verify-diff",
      report: "verification report",
      verdict: "PASS" as const,
    }));

    prepareWorkspaceInspectionContextMock.mockResolvedValueOnce({
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
      effortLevel: "high",
      runtimeOptions: { fastMode: true },
      workspaceRoot: "E:\\repo\\effective",
      runtime,
      tools: [],
    });

    await runVerificationFromTool({
      workspaceFolderPath: "E:\\repo",
      diffRef: "HEAD~2..HEAD",
      extraGuidance: "focus on tests",
      resolveProviderConfig: async () => ({
        config: {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-sonnet",
        },
        envMap: {},
      }),
      getEffortLevel: () => "high",
      createProviderRuntimeOptions: () => ({ fastMode: true }),
      ensureConversationWorktreeHydrated: async () => undefined,
      getEffectiveWorkspaceRoot: path => `${path}\\effective`,
      getWorkspaceRuntime: async () => runtime,
      runVerificationSession,
    });

    expect(runVerificationSession).toHaveBeenCalledWith(
      expect.objectContaining({
        commandText: "/verify HEAD~2..HEAD -- focus on tests",
      }),
    );
  });

  it("normalizes leading separator markers from diff-aware verification guidance", async () => {
    const runtime = {
      getToolDefinitions: async () => [],
      getMcpStatusSummary: async () => [],
    };
    const runVerificationSession = vi.fn(async () => ({
      taskId: "verify-diff-guidance-normalized",
      report: "verification report",
      verdict: "PASS" as const,
    }));

    prepareWorkspaceInspectionContextMock.mockResolvedValueOnce({
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
      effortLevel: "high",
      runtimeOptions: { fastMode: true },
      workspaceRoot: "E:\\repo\\effective",
      runtime,
      tools: [],
    });

    await runVerificationFromTool({
      workspaceFolderPath: "E:\\repo",
      diffRef: "HEAD~2..HEAD",
      extraGuidance: "-- focus on tests",
      resolveProviderConfig: async () => ({
        config: {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-sonnet",
        },
        envMap: {},
      }),
      getEffortLevel: () => "high",
      createProviderRuntimeOptions: () => ({ fastMode: true }),
      ensureConversationWorktreeHydrated: async () => undefined,
      getEffectiveWorkspaceRoot: path => `${path}\\effective`,
      getWorkspaceRuntime: async () => runtime,
      runVerificationSession,
    });

    expect(runVerificationSession).toHaveBeenCalledWith(
      expect.objectContaining({
        commandText: "/verify HEAD~2..HEAD -- focus on tests",
      }),
    );
  });

  it("prepares inspection context and launches review from tools", async () => {
    const runtime = {
      getToolDefinitions: async () => [],
      getMcpStatusSummary: async () => [],
    };
    const runReviewSession = vi.fn(async () => ({
      taskId: "review-1",
      report: "review report",
    }));

    prepareWorkspaceInspectionContextMock.mockResolvedValueOnce({
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
      effortLevel: "medium",
      runtimeOptions: { effortLevel: "medium" },
      workspaceRoot: "E:\\repo\\effective",
      runtime,
      tools: [{ name: "read_file" }],
    });

    const result = await runReviewFromTool({
      workspaceFolderPath: "E:\\repo",
      resolveProviderConfig: async () => ({
        config: {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-sonnet",
        },
        envMap: {},
      }),
      getEffortLevel: () => "medium",
      createProviderRuntimeOptions: () => ({ effortLevel: "medium" }),
      ensureConversationWorktreeHydrated: async () => undefined,
      getEffectiveWorkspaceRoot: path => `${path}\\effective`,
      getWorkspaceRuntime: async () => runtime,
      runReviewSession,
    });

    expect(runReviewSession).toHaveBeenCalledWith({
      commandText: "/review",
      workspaceRoot: "E:\\repo\\effective",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
      runtime,
      tools: [{ name: "read_file" }],
      runtimeOptions: { effortLevel: "medium" },
      effortLevel: "medium",
    });
    expect(result).toEqual({
      taskId: "review-1",
      report: "review report",
    });
  });

  it("builds diff-aware review command text for tool launches", async () => {
    const runtime = {
      getToolDefinitions: async () => [],
      getMcpStatusSummary: async () => [],
    };
    const runReviewSession = vi.fn(async () => ({
      taskId: "review-diff",
      report: "review report",
    }));

    prepareWorkspaceInspectionContextMock.mockResolvedValueOnce({
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
      effortLevel: "medium",
      runtimeOptions: { effortLevel: "medium" },
      workspaceRoot: "E:\\repo\\effective",
      runtime,
      tools: [],
    });

    await runReviewFromTool({
      workspaceFolderPath: "E:\\repo",
      diffRef: "main...HEAD",
      extraGuidance: "focus on regressions",
      resolveProviderConfig: async () => ({
        config: {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-sonnet",
        },
        envMap: {},
      }),
      getEffortLevel: () => "medium",
      createProviderRuntimeOptions: () => ({ effortLevel: "medium" }),
      ensureConversationWorktreeHydrated: async () => undefined,
      getEffectiveWorkspaceRoot: path => `${path}\\effective`,
      getWorkspaceRuntime: async () => runtime,
      runReviewSession,
    });

    expect(runReviewSession).toHaveBeenCalledWith(
      expect.objectContaining({
        commandText: "/review main...HEAD -- focus on regressions",
      }),
    );
  });

  it("normalizes leading separator markers from diff-aware review guidance", async () => {
    const runtime = {
      getToolDefinitions: async () => [],
      getMcpStatusSummary: async () => [],
    };
    const runReviewSession = vi.fn(async () => ({
      taskId: "review-diff-guidance-normalized",
      report: "review report",
    }));

    prepareWorkspaceInspectionContextMock.mockResolvedValueOnce({
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
      effortLevel: "medium",
      runtimeOptions: { effortLevel: "medium" },
      workspaceRoot: "E:\\repo\\effective",
      runtime,
      tools: [],
    });

    await runReviewFromTool({
      workspaceFolderPath: "E:\\repo",
      diffRef: "main...HEAD",
      extraGuidance: "-- focus on regressions",
      resolveProviderConfig: async () => ({
        config: {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-sonnet",
        },
        envMap: {},
      }),
      getEffortLevel: () => "medium",
      createProviderRuntimeOptions: () => ({ effortLevel: "medium" }),
      ensureConversationWorktreeHydrated: async () => undefined,
      getEffectiveWorkspaceRoot: path => `${path}\\effective`,
      getWorkspaceRuntime: async () => runtime,
      runReviewSession,
    });

    expect(runReviewSession).toHaveBeenCalledWith(
      expect.objectContaining({
        commandText: "/review main...HEAD -- focus on regressions",
      }),
    );
  });

  it("hydrates and looks up reusable background commands in workspace scope", async () => {
    const order: string[] = [];
    const result = await findReusableBackgroundCommandForWorkspace({
      workspaceFolderPath: "E:\\repo",
      command: "npm run build",
      ensureConversationWorktreeHydrated: async path => {
        order.push(`hydrate:${path}`);
      },
      getEffectiveWorkspaceRoot: path => {
        order.push(`root:${path}`);
        return `${path}\\effective`;
      },
      backgroundTaskHost: {
        findReusableBackgroundCommand: async (
          workspaceRoot: string,
          command: string,
        ) => {
          order.push(`find:${workspaceRoot}:${command}`);
          return {
            taskId: "cmd-1",
            command,
            workspaceRoot,
          };
        },
      } as any,
    });

    expect(order).toEqual([
      "hydrate:E:\\repo",
      "root:E:\\repo",
      "find:E:\\repo\\effective:npm run build",
    ]);
    expect(result).toEqual({
      taskId: "cmd-1",
      command: "npm run build",
      workspaceRoot: "E:\\repo\\effective",
    });
  });

  it("reuses or launches background commands from tools", async () => {
    const reuseResult = await runBackgroundCommandFromTool({
      workspaceFolderPath: "E:\\repo",
      command: "npm run build",
      ensureConversationWorktreeHydrated: async () => undefined,
      getEffectiveWorkspaceRoot: path => `${path}\\effective`,
      backgroundTaskHost: {
        findReusableBackgroundCommand: async () => ({
          taskId: "cmd-1",
          command: "npm run build",
          workspaceRoot: "E:\\repo\\effective",
        }),
        runBackgroundCommand: vi.fn(),
      } as any,
    });

    expect(reuseResult).toEqual({
      taskId: "cmd-1",
      command: "npm run build",
      workspaceRoot: "E:\\repo\\effective",
      alreadyRunning: true,
    });

    const runBackgroundCommand = vi.fn(async ({ workspaceRoot, command }) => ({
      taskId: "cmd-2",
      workspaceRoot,
      command,
    }));
    const launchResult = await runBackgroundCommandFromTool({
      workspaceFolderPath: "E:\\repo",
      command: "npm run test",
      ensureConversationWorktreeHydrated: async () => undefined,
      getEffectiveWorkspaceRoot: path => `${path}\\effective`,
      backgroundTaskHost: {
        findReusableBackgroundCommand: async () => undefined,
        runBackgroundCommand,
      } as any,
    });

    expect(runBackgroundCommand).toHaveBeenCalledWith({
      workspaceRoot: "E:\\repo\\effective",
      command: "npm run test",
    });
    expect(launchResult).toEqual({
      taskId: "cmd-2",
      workspaceRoot: "E:\\repo\\effective",
      command: "npm run test",
    });
  });

  it("creates reusable background-command launch bindings", async () => {
    const bindings = createBackgroundCommandToolLaunchBindings({
      ensureConversationWorktreeHydrated: async () => undefined,
      getEffectiveWorkspaceRoot: path => `${path}\\effective`,
      backgroundTaskHost: {
        findReusableBackgroundCommand: async (
          _workspaceRoot: string,
          command: string,
        ) =>
          command === "npm run build"
            ? {
                taskId: "cmd-1",
                command,
                workspaceRoot: "E:\\repo\\effective",
              }
            : undefined,
        runBackgroundCommand: async ({
          workspaceRoot,
          command,
        }: {
          workspaceRoot: string;
          command: string;
        }) => ({
          taskId: "cmd-2",
          workspaceRoot,
          command,
        }),
      } as any,
    });

    const reused = await bindings.findReusableBackgroundCommand(
      "E:\\repo",
      "npm run build",
    );
    const launched = await bindings.runBackgroundCommandFromTool(
      "E:\\repo",
      "npm run test",
    );

    expect(reused).toEqual({
      taskId: "cmd-1",
      command: "npm run build",
      workspaceRoot: "E:\\repo\\effective",
    });
    expect(launched).toEqual({
      taskId: "cmd-2",
      command: "npm run test",
      workspaceRoot: "E:\\repo\\effective",
    });
  });
});
