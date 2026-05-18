import { describe, expect, it, vi } from "vitest";
import type { ToolContext, ToolDefinition } from "../../toolRuntime";
import type { ProviderConfig as AdapterProviderConfig } from "../providers/IProviderAdapter";
import { runBuiltInSubAgent } from "./runBuiltInSubAgent";

vi.mock("../agentRunner", () => ({
  runAgent: vi.fn(),
  SYSTEM_PROMPT: "",
}));

const config: AdapterProviderConfig = {
  type: "anthropic",
  apiKey: "secret",
  model: "claude-sonnet",
};

const runtimeOptions = {
  effortLevel: "high",
} as const;

const tools: ToolDefinition[] = [
  {
    name: "list_files",
    description: "list",
    input_schema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "read_file",
    description: "read",
    input_schema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "search_files",
    description: "search",
    input_schema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "glob_files",
    description: "glob",
    input_schema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "run_command",
    description: "run",
    input_schema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "Agent",
    description: "agent",
    input_schema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "RunReview",
    description: "review",
    input_schema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true },
  },
  {
    name: "TaskCreate",
    description: "task create",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "write_file",
    description: "write",
    input_schema: { type: "object", properties: {} },
    annotations: { destructiveHint: true },
  },
  {
    name: "replace_in_file",
    description: "replace",
    input_schema: { type: "object", properties: {} },
    annotations: { destructiveHint: true },
  },
];

function createWorkerToolContext(): ToolContext {
  return {
    workspaceRoot: "E:\\repo",
    invokerKind: "worker",
    requestFileApproval: async () => true,
    requestToolApproval: async () => true,
  };
}

describe("runBuiltInSubAgent", () => {
  it("keeps general-purpose writable tools but excludes Agent", async () => {
    const { runAgent } = await import("../agentRunner.js");
    vi.mocked(runAgent).mockResolvedValueOnce({ text: "gp result", messages: [] });
    const buildProviderAdapter = vi.fn(() => ({ runStep: vi.fn() } as any));

    const result = await runBuiltInSubAgent({
      request: { agentType: "general-purpose", prompt: "do work" },
      workspaceRoot: "E:\\repo",
      config,
      envMap: {},
      runtimeOptions,
      effortLevel: "high",
      tools,
      getWorkerToolContext: createWorkerToolContext,
      buildProviderAdapter,
    });

    expect(result).toEqual({ text: "gp result" });
    const options = vi.mocked(runAgent).mock.calls.at(-1)?.[1];
    expect(options?.tools.map((tool: ToolDefinition) => tool.name)).toEqual([
      "list_files",
      "read_file",
      "search_files",
      "glob_files",
      "run_command",
      "TaskCreate",
      "write_file",
      "replace_in_file",
    ]);
    expect(options?.toolContext.requestFileApproval).toBeDefined();
    expect(buildProviderAdapter).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeOptions: expect.objectContaining({
          requestKind: "built-in-agent",
        }),
      }),
    );
    expect(buildProviderAdapter).toHaveBeenCalledTimes(1);
  });

  it("limits Explore to read-only file/search tools and strips approvals", async () => {
    const { runAgent } = await import("../agentRunner.js");
    vi.mocked(runAgent).mockResolvedValueOnce({ text: "explore result", messages: [] });

    await runBuiltInSubAgent({
      request: { agentType: "Explore", prompt: "inspect" },
      workspaceRoot: "E:\\repo",
      config,
      envMap: {},
      runtimeOptions,
      effortLevel: "high",
      tools,
      getWorkerToolContext: createWorkerToolContext,
      buildProviderAdapter: vi.fn(() => ({ runStep: vi.fn() } as any)),
    });

    const options = vi.mocked(runAgent).mock.calls.at(-1)?.[1];
    expect(options?.tools.map((tool: ToolDefinition) => tool.name)).toEqual([
      "list_files",
      "read_file",
      "search_files",
      "glob_files",
      "run_command",
    ]);
    expect(options?.toolContext.requestFileApproval).toBeUndefined();
    expect(options?.toolContext.requestToolApproval).toBeUndefined();
    expect(options?.toolContext.verificationMode).toEqual({ active: true });
  });

  it("keeps verification read-only and removes Agent", async () => {
    const { runAgent } = await import("../agentRunner.js");
    vi.mocked(runAgent).mockResolvedValueOnce({ text: "verify result", messages: [] });

    await runBuiltInSubAgent({
      request: { agentType: "verification", prompt: "verify" },
      workspaceRoot: "E:\\repo",
      config,
      envMap: {},
      runtimeOptions,
      effortLevel: "high",
      tools,
      getWorkerToolContext: createWorkerToolContext,
      buildProviderAdapter: vi.fn(() => ({ runStep: vi.fn() } as any)),
    });

    const options = vi.mocked(runAgent).mock.calls.at(-1)?.[1];
    expect(options?.tools.map((tool: ToolDefinition) => tool.name)).toEqual([
      "list_files",
      "read_file",
      "search_files",
      "glob_files",
      "run_command",
      "TaskCreate",
    ]);
    expect(options?.toolContext.verificationMode).toEqual({ active: true });
  });
});
