import { describe, expect, it, vi } from "vitest";
import { runAgent } from "./agentRunner";
import type { IProviderAdapter, NormalizedMessage, NormalizedStep } from "./providers/IProviderAdapter";
import type { ToolContext, ToolDefinition } from "../toolRuntime";

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

    expect(result).toBe("final answer");
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

      expect(result).toBe("done now");
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

    expect(result).toBe("all done");
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

      expect(result).toBe("Read README.md\n\n# heading");
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

      expect(result).toBe("done");
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

      expect(result).toBe("outer finished");
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

      expect(result).toBe("done");
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
});
