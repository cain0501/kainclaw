import { describe, expect, it, vi } from "vitest";
import { runAgent } from "./agentRunner";
import type { IProviderAdapter, NormalizedMessage, NormalizedStep } from "./providers/IProviderAdapter";
import type { ProviderConfig } from "./providers/IProviderAdapter";
import type { ToolContext, ToolDefinition } from "../toolRuntime";
import type { ProviderRuntimeOptions } from "../thinkingEffort/types";

class ScriptedProvider implements IProviderAdapter {
  private index = 0;

  constructor(private readonly steps: NormalizedStep[]) {}

  async runStep(): Promise<NormalizedStep> {
    const next = this.steps[this.index];
    this.index += 1;
    if (!next) {
      throw new Error("No scripted step available");
    }
    return next;
  }
}

describe("agentRunner", () => {
  it("returns the final assistant text when the provider is done", async () => {
    const provider = new ScriptedProvider([
      {
        text: "final answer",
        toolCalls: [],
        done: true,
      },
    ]);

    const result = await runAgent([], {
      provider,
      tools: [],
      toolContext: { workspaceRoot: "E:\\claudecodejingiang\\vscode-extension" },
    });

    expect(result.text).toBe("final answer");
  });

  it("surfaces thinking summaries and executes regular tools", async () => {
    const provider = new ScriptedProvider([
      {
        text: "need a tool",
        thinkingText: "brief thinking",
        toolCalls: [{ id: "tool-1", name: "read_file", input: { path: "README.md" } }],
        done: false,
      },
      {
        text: "done now",
        toolCalls: [],
        done: true,
      },
    ]);

    const onThinkingSummary = vi.fn();
    const onToolStart = vi.fn();
    const onToolEnd = vi.fn();
    const toolContext: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
    };

    const tools: ToolDefinition[] = [
      {
        name: "read_file",
        description: "Read a file",
        input_schema: { type: "object", properties: {} },
      },
    ];

    const executeSpy = vi.spyOn(await import("../toolRuntime.js"), "executeTool").mockResolvedValue({
      summary: "Read README.md",
      content: "content",
    });

    try {
      const result = await runAgent([], {
        provider,
        tools,
        toolContext,
        onThinkingSummary,
        onToolStart,
        onToolEnd,
      });

      expect(result.text).toBe("done now");
      expect(onThinkingSummary).toHaveBeenCalledWith("brief thinking");
      expect(onToolStart).toHaveBeenCalledTimes(1);
      expect(onToolEnd).toHaveBeenCalledTimes(1);
      expect(executeSpy).toHaveBeenCalledWith("read_file", { path: "README.md" }, toolContext);
    } finally {
      executeSpy.mockRestore();
    }
  });

  it("deduplicates tool definitions by name before sending the payload to the provider", async () => {
    let seenTools: unknown[] = [];
    const provider: IProviderAdapter = {
      async runStep(_messages, tools) {
        seenTools = tools;
        return {
          text: "done",
          toolCalls: [],
          done: true,
        };
      },
    };

    const duplicateTools: ToolDefinition[] = [
      {
        name: "mcp__notion__notion-get-users",
        description: "First copy",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "mcp__notion__notion-get-users",
        description: "Second copy",
        input_schema: { type: "object", properties: {} },
      },
    ];

    await runAgent([], {
      provider,
      tools: duplicateTools,
      toolContext: { workspaceRoot: "E:\\claudecodejingiang\\vscode-extension" },
    });

    expect(seenTools).toHaveLength(1);
    expect(seenTools[0]).toMatchObject({
      type: "function",
      function: {
        name: "mcp__notion__notion-get-users",
      },
    });
  });

  it("routes swarm tool calls through the swarm coordinator", async () => {
    const provider = new ScriptedProvider([
      {
        text: "delegating",
        toolCalls: [{ id: "tool-1", name: "spawn_agent", input: { name: "w1" } }],
        done: false,
      },
      {
        text: "all done",
        toolCalls: [],
        done: true,
      },
    ]);

    const swarm = {
      getSwarmToolDefinitions: () =>
        [
          {
            name: "spawn_agent",
            description: "spawn",
            input_schema: { type: "object", properties: {} },
          },
        ] satisfies ToolDefinition[],
      drainCoordinatorInbox: () => null,
      executeSwarmTool: vi.fn().mockResolvedValue({
        summary: "spawned worker",
        content: '{"worker_id":"worker-0"}',
      }),
    };

    const result = await runAgent([], {
      provider,
      tools: [],
      toolContext: { workspaceRoot: "E:\\claudecodejingiang\\vscode-extension" },
      swarm: swarm as any,
    });

    expect(result.text).toBe("all done");
    expect(swarm.executeSwarmTool).toHaveBeenCalledWith("spawn_agent", { name: "w1" });
  });

  it("injects coordinator inbox messages back into the conversation", async () => {
    const seenMessages: NormalizedMessage[][] = [];
    const provider: IProviderAdapter = {
      async runStep(messages) {
        seenMessages.push(messages);
        return {
          text: "done",
          toolCalls: [],
          done: true,
        };
      },
    };

    const swarm = {
      getSwarmToolDefinitions: () => [],
      drainCoordinatorInbox: () => "[来自 worker-1]: finished slice",
      executeSwarmTool: vi.fn(),
    };

    await runAgent([{ role: "user", content: "start" }], {
      provider,
      tools: [],
      toolContext: { workspaceRoot: "E:\\claudecodejingiang\\vscode-extension" },
      swarm: swarm as any,
    });

    expect(seenMessages[0]?.some(message => message.role === "user" && message.content.includes("worker-1"))).toBe(true);
  });

  it("falls back to the last tool result when the provider never emits final text", async () => {
    const provider = new ScriptedProvider([
      {
        text: "",
        toolCalls: [{ id: "tool-1", name: "read_file", input: { path: "README.md" } }],
        done: false,
      },
      {
        text: "",
        toolCalls: [],
        done: true,
      },
    ]);

    const toolContext: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
    };

    const tools: ToolDefinition[] = [
      {
        name: "read_file",
        description: "Read a file",
        input_schema: { type: "object", properties: {} },
      },
    ];

    const executeSpy = vi.spyOn(await import("../toolRuntime.js"), "executeTool").mockResolvedValue({
      summary: "Read README.md",
      content: "# heading",
    });

    try {
      const result = await runAgent([], {
        provider,
        tools,
        toolContext,
      });

      expect(result.text).toBe("Read README.md\n\n# heading");
    } finally {
      executeSpy.mockRestore();
    }
  });

  it("narrows the visible tool payload after SkillTool returns allowedToolNames", async () => {
    const seenTools: unknown[][] = [];
    const provider: IProviderAdapter = {
      async runStep(_messages, tools) {
        seenTools.push(tools);
        if (seenTools.length === 1) {
          return {
            text: "load the skill",
            toolCalls: [{ id: "tool-1", name: "SkillTool", input: { skill: "simple-skill" } }],
            done: false,
          };
        }
        return {
          text: "done",
          toolCalls: [],
          done: true,
        };
      },
    };

    const toolContext: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
    };

    const tools: ToolDefinition[] = [
      {
        name: "SkillTool",
        description: "Load installed skills",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "read_file",
        description: "Read a file",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "write_file",
        description: "Write a file",
        input_schema: { type: "object", properties: {} },
      },
    ];

    const executeSpy = vi.spyOn(await import("../toolRuntime.js"), "executeTool").mockResolvedValue({
      summary: "Loaded installed skill simple-skill",
      content: "skill body",
      allowedToolNames: ["read_file"],
    });

    try {
      const result = await runAgent([], {
        provider,
        tools,
        toolContext,
      });

      expect(result.text).toBe("done");
      expect(seenTools).toHaveLength(2);
      expect(seenTools[0]).toHaveLength(3);
      expect(seenTools[1]).toHaveLength(1);
      expect(seenTools[1]?.[0]).toMatchObject({
        type: "function",
        function: {
          name: "read_file",
        },
      });
      expect(executeSpy).toHaveBeenCalledWith(
        "SkillTool",
        { skill: "simple-skill" },
        toolContext,
      );
    } finally {
      executeSpy.mockRestore();
    }
  });

  it("runs forked installed skills in an isolated recursive agent turn", async () => {
    const seenMessages: NormalizedMessage[][] = [];
    const seenTools: unknown[][] = [];
    let callCount = 0;
    const provider: IProviderAdapter = {
      async runStep(messages, tools) {
        callCount += 1;
        seenMessages.push(messages.map(message => ({ ...message })));
        seenTools.push(tools);

        if (callCount === 1) {
          return {
            text: "run the forked skill",
            toolCalls: [{ id: "tool-1", name: "SkillTool", input: { skill: "forked-skill" } }],
            done: false,
          };
        }

        if (callCount === 2) {
          return {
            text: "forked skill result",
            toolCalls: [],
            done: true,
          };
        }

        return {
          text: "outer finished",
          toolCalls: [],
          done: true,
        };
      },
    };

    const toolContext: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
    };

    const tools: ToolDefinition[] = [
      {
        name: "SkillTool",
        description: "Load installed skills",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "read_file",
        description: "Read a file",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "write_file",
        description: "Write a file",
        input_schema: { type: "object", properties: {} },
      },
    ];

    const executeSpy = vi.spyOn(await import("../toolRuntime.js"), "executeTool").mockResolvedValue({
      summary: "Loaded installed skill forked-skill for forked execution",
      content: "fork request",
      forkedSkillRunRequest: {
        skillId: "forked-skill",
        prompt: "Run the forked helper",
        allowedToolNames: ["read_file"],
      },
    });

    try {
      const result = await runAgent([], {
        provider,
        tools,
        toolContext,
      });

      expect(result.text).toBe("outer finished");
      expect(callCount).toBe(3);
      expect(seenMessages[1]?.at(-1)).toEqual({
        role: "user",
        content: "Run the forked helper",
      });
      expect(seenTools[1]).toHaveLength(1);
      expect(seenTools[1]?.[0]).toMatchObject({
        type: "function",
        function: {
          name: "read_file",
        },
      });
      expect(executeSpy).toHaveBeenCalledWith(
        "SkillTool",
        { skill: "forked-skill" },
        toolContext,
      );
    } finally {
      executeSpy.mockRestore();
    }
  });

  it("applies installed-skill hooks returned by SkillTool to later tool calls in the same run", async () => {
    const provider = new ScriptedProvider([
      {
        text: "load a hooked skill",
        toolCalls: [{ id: "tool-1", name: "SkillTool", input: { skill: "hooked-skill" } }],
        done: false,
      },
      {
        text: "use the loaded skill",
        toolCalls: [{ id: "tool-2", name: "read_file", input: { path: "README.md" } }],
        done: false,
      },
      {
        text: "done",
        toolCalls: [],
        done: true,
      },
    ]);

    const toolContext: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
    };

    const tools: ToolDefinition[] = [
      {
        name: "SkillTool",
        description: "Load installed skills",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "read_file",
        description: "Read a file",
        input_schema: { type: "object", properties: {} },
      },
    ];

    const executeSpy = vi.spyOn(await import("../toolRuntime.js"), "executeTool");
    executeSpy.mockImplementation(async (name: string) => {
      if (name === "SkillTool") {
        return {
          summary: "Loaded installed skill hooked-skill",
          content: "hooked skill body",
          installedSkillHooks: [
            {
              id: "hook-1",
              name: "hook-1",
              type: "agent",
              description: "hook",
              events: ["PreToolCall"],
              matcher: "read_file",
              agentPrompt: "Validate the read result",
            },
          ],
        };
      }

      return {
        summary: "Read README.md",
        content: "content",
      };
    });

    const hooksSpy = vi.spyOn(await import("../hooks/hooksTrigger.js"), "triggerHooks");
    hooksSpy.mockResolvedValue({});

    try {
      const result = await runAgent([], {
        provider,
        tools,
        toolContext,
      });

      expect(result.text).toBe("done");
      expect(hooksSpy).toHaveBeenCalledWith(
        "PreToolCall",
        [
          expect.objectContaining({
            matcher: "read_file",
            agentPrompt: "Validate the read result",
          }),
        ],
        expect.objectContaining({
          workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
          toolName: "read_file",
        }),
        expect.any(Function),
      );
      expect(executeSpy).toHaveBeenCalledWith(
        "read_file",
        { path: "README.md" },
        toolContext,
      );
    } finally {
      hooksSpy.mockRestore();
      executeSpy.mockRestore();
    }
  });

  it("fires WorktreeCreate after a successful EnterWorktree tool call", async () => {
    const provider = new ScriptedProvider([
      {
        text: "create a worktree",
        toolCalls: [{ id: "tool-1", name: "EnterWorktree", input: { prompt: "feature branch" } }],
        done: false,
      },
      {
        text: "done",
        toolCalls: [],
        done: true,
      },
    ]);

    const toolContext: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
    };

    const tools: ToolDefinition[] = [
      {
        name: "EnterWorktree",
        description: "Create a worktree",
        input_schema: { type: "object", properties: {} },
      },
    ];

    const executeSpy = vi.spyOn(await import("../toolRuntime.js"), "executeTool").mockResolvedValue({
      summary: "Created worktree",
      content: "worktree ready",
    });
    const hooksSpy = vi.spyOn(await import("../hooks/hooksTrigger.js"), "triggerHooks");
    hooksSpy.mockResolvedValue({});

    try {
      const result = await runAgent([], {
        provider,
        tools,
        toolContext,
        installedSkillHooks: [
          {
            id: "hook-worktree-create",
            name: "hook-worktree-create",
            type: "prompt",
            description: "hook",
            events: ["WorktreeCreate"],
            prompt: "noop",
          },
        ],
      });

      expect(result.text).toBe("done");
      expect(hooksSpy).toHaveBeenNthCalledWith(
        1,
        "PreToolCall",
        expect.any(Array),
        expect.objectContaining({
          workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
          toolName: "EnterWorktree",
          toolInput: { prompt: "feature branch" },
        }),
        expect.any(Function),
      );
      expect(hooksSpy).toHaveBeenNthCalledWith(
        2,
        "PostToolCall",
        expect.any(Array),
        expect.objectContaining({
          workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
          toolName: "EnterWorktree",
        }),
        expect.any(Function),
      );
      expect(hooksSpy).toHaveBeenNthCalledWith(
        3,
        "WorktreeCreate",
        expect.any(Array),
        expect.objectContaining({
          workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
          toolName: "EnterWorktree",
          toolInput: { prompt: "feature branch" },
        }),
        expect.any(Function),
      );
      expect(executeSpy).toHaveBeenCalledWith(
        "EnterWorktree",
        { prompt: "feature branch" },
        toolContext,
      );
    } finally {
      hooksSpy.mockRestore();
      executeSpy.mockRestore();
    }
  });

  it("fires WorktreeRemove after a successful ExitWorktree remove action", async () => {
    const provider = new ScriptedProvider([
      {
        text: "remove the worktree",
        toolCalls: [{ id: "tool-1", name: "ExitWorktree", input: { action: "remove" } }],
        done: false,
      },
      {
        text: "done",
        toolCalls: [],
        done: true,
      },
    ]);

    const toolContext: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
    };

    const tools: ToolDefinition[] = [
      {
        name: "ExitWorktree",
        description: "Exit a worktree",
        input_schema: { type: "object", properties: {} },
      },
    ];

    const executeSpy = vi.spyOn(await import("../toolRuntime.js"), "executeTool").mockResolvedValue({
      summary: "Removed worktree",
      content: "worktree removed",
    });
    const hooksSpy = vi.spyOn(await import("../hooks/hooksTrigger.js"), "triggerHooks");
    hooksSpy.mockResolvedValue({});

    try {
      const result = await runAgent([], {
        provider,
        tools,
        toolContext,
        installedSkillHooks: [
          {
            id: "hook-worktree-remove",
            name: "hook-worktree-remove",
            type: "prompt",
            description: "hook",
            events: ["WorktreeRemove"],
            prompt: "noop",
          },
        ],
      });

      expect(result.text).toBe("done");
      expect(hooksSpy).toHaveBeenNthCalledWith(
        3,
        "WorktreeRemove",
        expect.any(Array),
        expect.objectContaining({
          workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
          toolName: "ExitWorktree",
          toolInput: { action: "remove" },
        }),
        expect.any(Function),
      );
      expect(executeSpy).toHaveBeenCalledWith(
        "ExitWorktree",
        { action: "remove" },
        toolContext,
      );
    } finally {
      hooksSpy.mockRestore();
      executeSpy.mockRestore();
    }
  });

  it("does not fire WorktreeRemove for ExitWorktree keep actions", async () => {
    const provider = new ScriptedProvider([
      {
        text: "keep the worktree",
        toolCalls: [{ id: "tool-1", name: "ExitWorktree", input: { action: "keep" } }],
        done: false,
      },
      {
        text: "done",
        toolCalls: [],
        done: true,
      },
    ]);

    const toolContext: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
    };

    const tools: ToolDefinition[] = [
      {
        name: "ExitWorktree",
        description: "Exit a worktree",
        input_schema: { type: "object", properties: {} },
      },
    ];

    const executeSpy = vi.spyOn(await import("../toolRuntime.js"), "executeTool").mockResolvedValue({
      summary: "Kept worktree",
      content: "worktree kept",
    });
    const hooksSpy = vi.spyOn(await import("../hooks/hooksTrigger.js"), "triggerHooks");
    hooksSpy.mockResolvedValue({});

    try {
      const result = await runAgent([], {
        provider,
        tools,
        toolContext,
        installedSkillHooks: [
          {
            id: "hook-worktree-remove-keep",
            name: "hook-worktree-remove-keep",
            type: "prompt",
            description: "hook",
            events: ["WorktreeRemove"],
            prompt: "noop",
          },
        ],
      });

      expect(result.text).toBe("done");
      expect(
        hooksSpy.mock.calls.some(call => call[0] === "WorktreeRemove"),
      ).toBe(false);
      expect(executeSpy).toHaveBeenCalledWith(
        "ExitWorktree",
        { action: "keep" },
        toolContext,
      );
    } finally {
      hooksSpy.mockRestore();
      executeSpy.mockRestore();
    }
  });

  it("rebuilds the active provider when SkillTool returns model/effort overrides", async () => {
    const baseProvider: IProviderAdapter = {
      async runStep(_messages, _tools) {
        return {
          text: "load override skill",
          toolCalls: [{ id: "tool-1", name: "SkillTool", input: { skill: "override-skill" } }],
          done: false,
        };
      },
    };
    const rebuiltProvider: IProviderAdapter = {
      async runStep() {
        return {
          text: "done with rebuilt provider",
          toolCalls: [],
          done: true,
        };
      },
    };

    const toolContext: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
    };

    const tools: ToolDefinition[] = [
      {
        name: "SkillTool",
        description: "Load installed skills",
        input_schema: { type: "object", properties: {} },
      },
    ];

    const buildWorkspaceSystemPrompt = vi.fn(async () => "rebuilt system prompt");
    const buildProviderAdapter = vi.fn(() => rebuiltProvider);
    const createRuntimeOptions = vi.fn(
      (_config: ProviderConfig, effortLevel: "low" | "medium" | "high" | "max" | undefined): ProviderRuntimeOptions => ({
        effortLevel,
      }),
    );

    const executeSpy = vi.spyOn(await import("../toolRuntime.js"), "executeTool").mockResolvedValue({
      summary: "Loaded installed skill override-skill",
      content: "override skill body",
      modelOverride: "claude-opus-4-6",
      effortOverride: "high",
    });

    try {
      const result = await runAgent([], {
        provider: baseProvider,
        tools,
        toolContext,
        providerRuntimeContext: {
          config: {
            type: "anthropic",
            apiKey: "secret",
            model: "claude-sonnet",
          },
          workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
          envMap: { HELLO: "world" },
          runtimeOptions: { effortLevel: "medium" },
          effortLevel: "medium",
          buildWorkspaceSystemPrompt,
          buildProviderAdapter,
          createRuntimeOptions,
        },
      });

      expect(result.text).toBe("done with rebuilt provider");
      expect(createRuntimeOptions).toHaveBeenCalledWith(
        {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-opus-4-6",
        },
        "high",
      );
      expect(buildWorkspaceSystemPrompt).toHaveBeenCalledWith(
        "E:\\claudecodejingiang\\vscode-extension",
        {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-opus-4-6",
        },
        "high",
      );
      expect(buildProviderAdapter).toHaveBeenCalledWith({
        config: {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-opus-4-6",
        },
        workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
        systemPrompt: "rebuilt system prompt",
        envMap: { HELLO: "world" },
        runtimeOptions: { effortLevel: "high" },
      });
      expect(executeSpy).toHaveBeenCalledWith(
        "SkillTool",
        { skill: "override-skill" },
        toolContext,
      );
    } finally {
      executeSpy.mockRestore();
    }
  });

  it("rebuilds the hook sub-run provider when an installed-skill agent hook requests agentModel", async () => {
    const outerProvider = new ScriptedProvider([
      {
        text: "use the hooked skill",
        toolCalls: [{ id: "tool-1", name: "read_file", input: { path: "README.md" } }],
        done: false,
      },
      {
        text: "done",
        toolCalls: [],
        done: true,
      },
    ]);
    const hookProvider: IProviderAdapter = {
      async runStep() {
        return {
          text: "hook validation complete",
          toolCalls: [],
          done: true,
        };
      },
    };

    const toolContext: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
    };

    const tools: ToolDefinition[] = [
      {
        name: "read_file",
        description: "Read a file",
        input_schema: { type: "object", properties: {} },
      },
    ];

    const executeSpy = vi.spyOn(await import("../toolRuntime.js"), "executeTool").mockResolvedValue({
      summary: "Read README.md",
      content: "content",
    });

    const buildWorkspaceSystemPrompt = vi.fn(async () => "hook system prompt");
    const buildProviderAdapter = vi.fn(() => hookProvider);
    const createRuntimeOptions = vi.fn(
      (_config: ProviderConfig, effortLevel: "low" | "medium" | "high" | "max" | undefined): ProviderRuntimeOptions => ({
        effortLevel,
      }),
    );

    try {
      const result = await runAgent([], {
        provider: outerProvider,
        tools,
        toolContext,
        installedSkillHooks: [
          {
            id: "hook-1",
            name: "hook-1",
            type: "agent",
            description: "hook",
            events: ["PreToolCall"],
            matcher: "read_file",
            agentPrompt: "Validate the read result",
            agentModel: "claude-opus-4-6",
          },
        ],
        providerRuntimeContext: {
          config: {
            type: "anthropic",
            apiKey: "secret",
            model: "claude-sonnet",
          },
          workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
          envMap: { HELLO: "world" },
          runtimeOptions: { effortLevel: "medium" },
          effortLevel: "medium",
          buildWorkspaceSystemPrompt,
          buildProviderAdapter,
          createRuntimeOptions,
        },
      });

      expect(result.text).toBe("done");
      expect(createRuntimeOptions).toHaveBeenCalledWith(
        {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-opus-4-6",
        },
        "medium",
      );
      expect(buildWorkspaceSystemPrompt).toHaveBeenCalledWith(
        "E:\\claudecodejingiang\\vscode-extension",
        {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-opus-4-6",
        },
        "medium",
      );
      expect(buildProviderAdapter).toHaveBeenCalledWith({
        config: {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-opus-4-6",
        },
        workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
        systemPrompt: "hook system prompt",
        envMap: { HELLO: "world" },
        runtimeOptions: { effortLevel: "medium" },
      });
      expect(executeSpy).toHaveBeenCalledWith(
        "read_file",
        { path: "README.md" },
        toolContext,
      );
    } finally {
      executeSpy.mockRestore();
    }
  });
});
