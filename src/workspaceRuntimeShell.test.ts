import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  browserRuntimeMock,
  mcpRuntimeMock,
  lspRuntimeMock,
} = vi.hoisted(() => ({
  browserRuntimeMock: {
    dispose: vi.fn(async () => undefined),
  },
  mcpRuntimeMock: {
    setEnvMap: vi.fn(),
    markConfigDirty: vi.fn(),
    getToolDefinitions: vi.fn(async () => [{ name: "mcp_tool" }]),
    getStatusSummary: vi.fn(async () => [{ name: "github" }]),
    dispose: vi.fn(async () => undefined),
  },
  lspRuntimeMock: {},
}));

vi.mock("./browserRuntime", () => ({
  BrowserRuntime: vi.fn(() => browserRuntimeMock),
}));

vi.mock("./mcpRuntime", () => ({
  McpRuntime: vi.fn(() => mcpRuntimeMock),
}));

vi.mock("./lsp/lspRuntime", () => ({
  VsCodeLspRuntime: vi.fn(() => lspRuntimeMock),
}));

vi.mock("./toolRuntime", () => ({
  getBuiltInToolDefinitions: (
    { lspAvailable = true }: { lspAvailable?: boolean } = {},
  ) =>
    [
      { name: "read_file" },
      ...(lspAvailable ? [{ name: "LSP" }] : []),
    ],
}));

import { WorkspaceRuntime } from "./workspaceRuntimeShell";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("workspaceRuntimeShell", () => {
  it("exposes a tool context wired to plan mode, plan verification, and host callbacks", () => {
    const requestFileApproval = vi.fn(async () => true);
    const requestToolApproval = vi.fn(async () => true);
    const onToolLifecycle = vi.fn();
    const tasksRuntime = { listBackgroundTasks: vi.fn(async () => []) } as any;
    const worktreeRuntime = { getEffectiveWorkspaceRoot: vi.fn(() => "E:\\repo") } as any;
    const getTasks = vi.fn(() => tasksRuntime);
    const getWorktree = vi.fn(() => worktreeRuntime);
    const stopBackgroundTask = vi.fn(async () => ({
      taskId: "task-1",
      taskType: "local_agent",
      command: "npm run build",
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

    const runtime = new WorkspaceRuntime(
      () => "E:\\repo",
      {},
      requestFileApproval,
      requestToolApproval,
      onToolLifecycle,
      {
        getState: () => ({ active: true, planFilePath: ".omx/plans/test.md" }),
        enter: async () => ({ planFilePath: ".omx/plans/test.md", planContent: "" }),
        getPlanContent: async () => "content",
        exit: async () => ({ planFilePath: ".omx/plans/test.md", planContent: "" }),
      },
      () => ({
        planFilePath: ".omx/plans/test.md",
        verificationStarted: true,
        verificationCompleted: false,
      }),
      getTasks,
      getWorktree,
      stopBackgroundTask,
      runVerification,
      runReview,
      runCommandInBackground,
      findReusableBackgroundCommand,
    );

    const toolContext = runtime.getToolContext("main");

    expect(toolContext.workspaceRoot).toBe("E:\\repo");
    expect(toolContext.invokerKind).toBe("main");
    expect(toolContext.planMode?.active).toBe(true);
    expect(toolContext.planMode?.planFilePath).toBe(".omx/plans/test.md");
    expect(toolContext.planVerification?.pending).toBe(true);
    expect(toolContext.planVerification?.verificationStarted).toBe(true);
    expect(toolContext.planVerification?.verificationCompleted).toBe(false);
    expect(toolContext.requestFileApproval).toBe(requestFileApproval);
    expect(toolContext.requestToolApproval).toBe(requestToolApproval);
    expect(toolContext.onToolLifecycle).toBe(onToolLifecycle);
    expect(toolContext.tasks).toBe(tasksRuntime);
    expect(toolContext.worktree).toBe(worktreeRuntime);
    expect(toolContext.stopBackgroundTask).toBe(stopBackgroundTask);
    expect(toolContext.runVerification).toBe(runVerification);
    expect(toolContext.runReview).toBe(runReview);
    expect(toolContext.runCommandInBackground).toBe(runCommandInBackground);
    expect(toolContext.findReusableBackgroundCommand).toBe(findReusableBackgroundCommand);
  });

  it("forwards env changes, MCP invalidation, tool lookups, and dispose to runtime dependencies", async () => {
    const runtime = new WorkspaceRuntime(
      () => "E:\\repo",
      {},
      vi.fn(async () => true),
      vi.fn(async () => true),
      vi.fn(),
      {
        getState: () => ({ active: false }),
        enter: async () => ({ planFilePath: "", planContent: "" }),
        getPlanContent: async () => null,
        exit: async () => ({ planFilePath: "", planContent: "" }),
      },
      () => undefined,
      () => ({}) as any,
      () => ({}) as any,
      vi.fn(async () => ({ taskId: "", taskType: "", command: "" })),
      vi.fn(async () => ({ taskId: "", verdict: "PASS" as const, report: "" })),
      vi.fn(async () => ({ taskId: "", report: "" })),
      vi.fn(async () => ({ taskId: "", command: "", workspaceRoot: "" })),
      vi.fn(async () => null),
    );

    runtime.updateEnvMap({ HELLO: "world" });
    runtime.markMcpConfigDirty();

    await expect(runtime.getToolDefinitions()).resolves.toEqual([
      { name: "read_file" },
      { name: "LSP" },
      { name: "mcp_tool" },
    ]);
    await expect(runtime.getMcpStatusSummary()).resolves.toEqual([
      { name: "github" },
    ]);
    await runtime.dispose();

    expect(mcpRuntimeMock.setEnvMap).toHaveBeenCalledWith({ HELLO: "world" });
    expect(mcpRuntimeMock.markConfigDirty).toHaveBeenCalledTimes(1);
    expect(browserRuntimeMock.dispose).toHaveBeenCalledTimes(1);
    expect(mcpRuntimeMock.dispose).toHaveBeenCalledTimes(1);
  });

  it("omits the LSP tool when LSP runtime is disabled", async () => {
    const runtime = new WorkspaceRuntime(
      () => "E:\\repo",
      {},
      vi.fn(async () => true),
      vi.fn(async () => true),
      vi.fn(),
      {
        getState: () => ({ active: false }),
        enter: async () => ({ planFilePath: "", planContent: "" }),
        getPlanContent: async () => null,
        exit: async () => ({ planFilePath: "", planContent: "" }),
      },
      () => undefined,
      () => ({}) as any,
      () => ({}) as any,
      vi.fn(async () => ({ taskId: "", taskType: "", command: "" })),
      vi.fn(async () => ({ taskId: "", verdict: "PASS" as const, report: "" })),
      vi.fn(async () => ({ taskId: "", report: "" })),
      vi.fn(async () => ({ taskId: "", command: "", workspaceRoot: "" })),
      vi.fn(async () => null),
      undefined,
      false,
    );

    await expect(runtime.getToolDefinitions()).resolves.toEqual([
      { name: "read_file" },
      { name: "mcp_tool" },
    ]);
  });
});
