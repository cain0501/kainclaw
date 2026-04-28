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
});
