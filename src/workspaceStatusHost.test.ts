import { describe, expect, it, vi } from "vitest";

import {
  createWorkspaceStatusController,
  createWorkspaceStatusControllerFactory,
  createWorkspaceStatusInvalidationBindings,
  createWorkspaceStatusRefreshBindings,
  invalidateWorkspaceStatusCaches,
  refreshWorkspaceStatus,
} from "./workspaceStatusHost";

describe("workspaceStatusHost", () => {
  it("returns workspace status invalidation bindings unchanged", () => {
    const clearCachedTools = vi.fn();
    const refreshWorkspaceStatus = vi.fn();
    const runtimes = [{ markMcpConfigDirty: vi.fn() }];

    const bindings = createWorkspaceStatusInvalidationBindings({
      clearCachedTools,
      runtimes,
      refreshWorkspaceStatus,
    });

    bindings.clearCachedTools();
    bindings.refreshWorkspaceStatus();

    expect(bindings.runtimes).toBe(runtimes);
    expect(clearCachedTools).toHaveBeenCalledTimes(1);
    expect(refreshWorkspaceStatus).toHaveBeenCalledTimes(1);
  });

  it("returns workspace status refresh bindings unchanged", async () => {
    const resolveProviderConfig = vi.fn(async () => ({
      config: {
        type: "anthropic" as const,
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: { HELLO: "world" },
    }));
    const bindings = createWorkspaceStatusRefreshBindings({
      resolveProviderConfig,
      getEffortLevel: () => "high",
      createProviderRuntimeOptions: vi.fn(() => ({ fastMode: true })),
      ensureConversationWorktreeHydrated: vi.fn(async () => undefined),
      getEffectiveWorkspaceRoot: vi.fn(path => path),
      getWorkspaceRuntime: vi.fn(async () => ({
        getToolDefinitions: async () => [],
        getMcpStatusSummary: async () => [],
      })),
      applyWorkspaceStatus: vi.fn(),
      postState: vi.fn(),
    });

    const providerResolution = await bindings.resolveProviderConfig();
    expect(providerResolution.config.type).toBe("anthropic");
    expect(bindings.getEffortLevel()).toBe("high");
  });

  it("invalidates cached tools, dirties runtimes, and triggers refresh", () => {
    const clearCachedTools = vi.fn();
    const refresh = vi.fn();
    const runtimeA = { markMcpConfigDirty: vi.fn() };
    const runtimeB = { markMcpConfigDirty: vi.fn() };

    invalidateWorkspaceStatusCaches({
      clearCachedTools,
      runtimes: [runtimeA, runtimeB],
      refreshWorkspaceStatus: refresh,
    });

    expect(clearCachedTools).toHaveBeenCalledTimes(1);
    expect(runtimeA.markMcpConfigDirty).toHaveBeenCalledTimes(1);
    expect(runtimeB.markMcpConfigDirty).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("skips refresh when unavailable or blocked", async () => {
    const applyWorkspaceStatus = vi.fn();
    const postState = vi.fn();

    expect(
      await refreshWorkspaceStatus({
        workspaceFolderPath: undefined,
        isBusy: false,
        hasPendingApproval: false,
        resolveProviderConfig: async () => {
          throw new Error("should not run");
        },
        getEffortLevel: () => "high",
        createProviderRuntimeOptions: () => ({}),
        ensureConversationWorktreeHydrated: async () => undefined,
        getEffectiveWorkspaceRoot: path => path,
        getWorkspaceRuntime: async () => ({
          getToolDefinitions: async () => [],
          getMcpStatusSummary: async () => [],
        }),
        applyWorkspaceStatus,
        postState,
      }),
    ).toBe(false);

    expect(
      await refreshWorkspaceStatus({
        workspaceFolderPath: "E:\\repo",
        isBusy: true,
        hasPendingApproval: false,
        resolveProviderConfig: async () => {
          throw new Error("should not run");
        },
        getEffortLevel: () => "high",
        createProviderRuntimeOptions: () => ({}),
        ensureConversationWorktreeHydrated: async () => undefined,
        getEffectiveWorkspaceRoot: path => path,
        getWorkspaceRuntime: async () => ({
          getToolDefinitions: async () => [],
          getMcpStatusSummary: async () => [],
        }),
        applyWorkspaceStatus,
        postState,
      }),
    ).toBe(false);

    expect(applyWorkspaceStatus).not.toHaveBeenCalled();
    expect(postState).not.toHaveBeenCalled();
  });

  it("refreshes workspace status and applies provider/mcp labels", async () => {
    const runtime = {
      getToolDefinitions: async () => [{ name: "read_file" }] as any,
      getMcpStatusSummary: async () => [{ name: "github" }] as any,
    };
    const applyWorkspaceStatus = vi.fn();
    const postState = vi.fn();

    const refreshed = await refreshWorkspaceStatus({
      workspaceFolderPath: "E:\\repo",
      isBusy: false,
      hasPendingApproval: false,
      resolveProviderConfig: async () => ({
        config: {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-sonnet",
        },
        envMap: { HELLO: "world" },
      }),
      getEffortLevel: () => "medium",
      createProviderRuntimeOptions: () => ({ effortLevel: "medium" }),
      ensureConversationWorktreeHydrated: async () => undefined,
      getEffectiveWorkspaceRoot: path => `${path}\\effective`,
      getWorkspaceRuntime: async () => runtime,
      applyWorkspaceStatus,
      postState,
    });

    expect(refreshed).toBe(true);
    expect(applyWorkspaceStatus).toHaveBeenCalledWith({
      mcpServers: [{ name: "github" }],
      providerLabel: "anthropic · claude-sonnet · 1 tools",
    });
    expect(postState).toHaveBeenCalledTimes(1);
  });

  it("creates a controller that refreshes using live workspace state", async () => {
    const applyWorkspaceStatus = vi.fn();
    const postState = vi.fn();

    const controller = createWorkspaceStatusController({
      getWorkspaceFolderPath: () => "E:\\repo",
      getIsBusy: () => false,
      getHasPendingApproval: () => false,
      refreshBindings: createWorkspaceStatusRefreshBindings({
        resolveProviderConfig: async () => ({
          config: {
            type: "anthropic",
            apiKey: "secret",
            model: "claude-sonnet",
          },
          envMap: { HELLO: "world" },
        }),
        getEffortLevel: () => "medium",
        createProviderRuntimeOptions: () => ({ effortLevel: "medium" }),
        ensureConversationWorktreeHydrated: async () => undefined,
        getEffectiveWorkspaceRoot: path => `${path}\\effective`,
        getWorkspaceRuntime: async () => ({
          getToolDefinitions: async () => [{ name: "read_file" }] as any,
          getMcpStatusSummary: async () => [{ name: "github" }] as any,
        }),
        applyWorkspaceStatus,
        postState,
      }),
      invalidationBindings: {
        clearCachedTools: vi.fn(),
        runtimes: [],
      },
    });

    await controller.refresh();

    expect(applyWorkspaceStatus).toHaveBeenCalledWith({
      mcpServers: [{ name: "github" }],
      providerLabel: "anthropic · claude-sonnet · 1 tools",
    });
    expect(postState).toHaveBeenCalledTimes(1);
  });

  it("builds a reusable workspace status controller factory around stable refresh deps", async () => {
    const applyWorkspaceStatus = vi.fn();
    const postState = vi.fn();
    const clearCachedTools = vi.fn();
    const runtime = { markMcpConfigDirty: vi.fn() };

    const factory = createWorkspaceStatusControllerFactory({
      resolveProviderConfig: async () => ({
        config: {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-sonnet",
        },
        envMap: { HELLO: "world" },
      }),
      getEffortLevel: () => "medium",
      createProviderRuntimeOptions: () => ({ effortLevel: "medium" }),
      ensureConversationWorktreeHydrated: async () => undefined,
      getEffectiveWorkspaceRoot: path => `${path}\\effective`,
      getWorkspaceRuntime: async () => ({
        getToolDefinitions: async () => [{ name: "read_file" }] as any,
        getMcpStatusSummary: async () => [{ name: "github" }] as any,
      }),
    });

    const controller = factory({
      getWorkspaceFolderPath: () => "E:\\repo",
      getIsBusy: () => false,
      getHasPendingApproval: () => false,
      applyWorkspaceStatus,
      postState,
      clearCachedTools,
      runtimes: [runtime],
    });

    await controller.refresh();
    expect(applyWorkspaceStatus).toHaveBeenCalledWith({
      mcpServers: [{ name: "github" }],
      providerLabel: "anthropic · claude-sonnet · 1 tools",
    });
    expect(postState).toHaveBeenCalledTimes(1);

    applyWorkspaceStatus.mockClear();
    controller.invalidate();
    await vi.waitFor(() => {
      expect(applyWorkspaceStatus).toHaveBeenCalledTimes(1);
    });
    expect(clearCachedTools).toHaveBeenCalledTimes(1);
    expect(runtime.markMcpConfigDirty).toHaveBeenCalledTimes(1);
  });

  it("creates a controller that invalidates and schedules a refresh", async () => {
    const clearCachedTools = vi.fn();
    const runtime = { markMcpConfigDirty: vi.fn() };
    const resolveProviderConfig = vi.fn(async () => ({
      config: {
        type: "anthropic" as const,
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: { HELLO: "world" },
    }));
    const applyWorkspaceStatus = vi.fn();

    const controller = createWorkspaceStatusController({
      getWorkspaceFolderPath: () => "E:\\repo",
      getIsBusy: () => false,
      getHasPendingApproval: () => false,
      refreshBindings: createWorkspaceStatusRefreshBindings({
        resolveProviderConfig,
        getEffortLevel: () => "high",
        createProviderRuntimeOptions: () => ({ fastMode: true }),
        ensureConversationWorktreeHydrated: async () => undefined,
        getEffectiveWorkspaceRoot: path => path,
        getWorkspaceRuntime: async () => ({
          getToolDefinitions: async () => [],
          getMcpStatusSummary: async () => [],
        }),
        applyWorkspaceStatus,
        postState: vi.fn(),
      }),
      invalidationBindings: {
        clearCachedTools,
        runtimes: [runtime],
      },
    });

    controller.invalidate();
    await vi.waitFor(() => {
      expect(applyWorkspaceStatus).toHaveBeenCalledTimes(1);
    });

    expect(clearCachedTools).toHaveBeenCalledTimes(1);
    expect(runtime.markMcpConfigDirty).toHaveBeenCalledTimes(1);
    expect(resolveProviderConfig).toHaveBeenCalledTimes(1);
  });
});
