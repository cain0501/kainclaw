import { describe, expect, it, vi } from "vitest";

import {
  buildProviderLabel,
  loadWorkspaceTools,
  prepareHydratedWorkspaceRuntime,
  prepareProviderExecutionContext,
  prepareWorkspaceInspectionContext,
  shouldReuseCachedWorkspaceTools,
} from "./workspaceHost";

describe("workspaceHost helpers", () => {
  it("builds provider labels with model and tool counts", () => {
    expect(
      buildProviderLabel({
        type: "anthropic",
        model: "claude-sonnet",
      }, 12),
    ).toBe("anthropic · claude-sonnet · 12 tools");
  });

  it("prepares provider execution context with effort and runtime options", async () => {
    const createProviderRuntimeOptions = vi.fn(() => ({ fastMode: true }));

    const result = await prepareProviderExecutionContext({
      resolveProviderConfig: async () => ({
        config: {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-sonnet",
        },
        envMap: { FOO: "bar" },
      }),
      getEffortLevel: () => "high",
      createProviderRuntimeOptions,
    });

    expect(result).toEqual({
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: { FOO: "bar" },
      effortLevel: "high",
      runtimeOptions: { fastMode: true },
    });
    expect(createProviderRuntimeOptions).toHaveBeenCalledTimes(1);
  });

  it("hydrates the workspace before resolving runtime and effective root", async () => {
    const order: string[] = [];
    const runtime = {
      getToolDefinitions: async () => [],
      getMcpStatusSummary: async () => [],
    };

    const result = await prepareHydratedWorkspaceRuntime({
      workspaceFolderPath: "E:\\repo",
      envMap: { FOO: "bar" },
      ensureConversationWorktreeHydrated: async path => {
        order.push(`hydrate:${path}`);
      },
      getEffectiveWorkspaceRoot: path => {
        order.push(`root:${path}`);
        return `${path}\\effective`;
      },
      getWorkspaceRuntime: async envMap => {
        order.push(`runtime:${envMap.FOO}`);
        return runtime;
      },
    });

    expect(result).toEqual({
      workspaceRoot: "E:\\repo\\effective",
      runtime,
    });
    expect(order).toEqual([
      "hydrate:E:\\repo",
      "root:E:\\repo",
      "runtime:bar",
    ]);
  });

  it("prepares inspection context and loads tools", async () => {
    const runtime = {
      getToolDefinitions: async () => [{ name: "read_file" }] as any,
      getMcpStatusSummary: async () => [{ name: "github" }] as any,
    };

    const result = await prepareWorkspaceInspectionContext({
      workspaceFolderPath: "E:\\repo",
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
    });

    expect(result.workspaceRoot).toBe("E:\\repo\\effective");
    expect(result.tools).toEqual([{ name: "read_file" }]);
    expect(result.runtime).toBe(runtime);
    expect(result.runtimeOptions).toEqual({ effortLevel: "medium" });
  });

  it("loads fresh workspace tools and returns mcp/provider metadata", async () => {
    const runtime = {
      getToolDefinitions: async () => [{ name: "read_file" }] as any,
      getMcpStatusSummary: async () => [{ name: "github" }] as any,
    };

    const result = await loadWorkspaceTools({
      runtime,
      config: {
        type: "anthropic",
        model: "claude-sonnet",
      },
      workspaceRoot: "E:\\repo",
    });

    expect(result).toEqual({
      tools: [{ name: "read_file" }],
      reusedCache: false,
      mcpServers: [{ name: "github" }],
      providerLabel: "anthropic · claude-sonnet · 1 tools",
    });
  });

  it("reuses cached workspace tools without reloading runtime data", async () => {
    const runtime = {
      getToolDefinitions: vi.fn(async () => [{ name: "fresh" }] as any),
      getMcpStatusSummary: vi.fn(async () => [{ name: "fresh" }] as any),
    };

    const result = await loadWorkspaceTools({
      runtime,
      config: {
        type: "anthropic",
        model: "claude-sonnet",
      },
      workspaceRoot: "E:\\repo",
      cachedTools: [{ name: "cached" }] as any,
      cachedToolsWorkspaceRoot: "E:\\repo",
    });

    expect(result).toEqual({
      tools: [{ name: "cached" }],
      reusedCache: true,
    });
    expect(runtime.getToolDefinitions).not.toHaveBeenCalled();
    expect(runtime.getMcpStatusSummary).not.toHaveBeenCalled();
  });

  it("reuses cached workspace tools only when the root matches", () => {
    expect(
      shouldReuseCachedWorkspaceTools({
        cachedTools: [{ name: "read_file" } as any],
        cachedToolsWorkspaceRoot: "E:\\repo",
        workspaceRoot: "E:\\repo",
      }),
    ).toBe(true);

    expect(
      shouldReuseCachedWorkspaceTools({
        cachedTools: [{ name: "read_file" } as any],
        cachedToolsWorkspaceRoot: "E:\\repo-a",
        workspaceRoot: "E:\\repo-b",
      }),
    ).toBe(false);
  });
});
