import { describe, expect, it, vi } from "vitest";

import {
  findOriginalTaskForInspection,
  getOriginalTaskForInspection,
  isDuplicateBuiltInAgentRunError,
  runBuiltInInspectionSession,
} from "./inspectionTaskHost";

describe("inspectionTaskHost helpers", () => {
  it("finds the first real user task and skips current slash commands", () => {
    const task = findOriginalTaskForInspection([
      { role: "user", content: "/effort high" },
      { role: "user", content: "/commands" },
      { role: "user", content: "/tools review" },
      { role: "user", content: "/skills debug" },
      { role: "user", content: "/files add src/inspectionTaskHost.ts" },
      { role: "user", content: "/verify" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "Implement detached task recovery" },
    ]);

    expect(task).toBe("Implement detached task recovery");
  });

  it("skips future slash commands instead of treating them as the original task", () => {
    const task = findOriginalTaskForInspection([
      { role: "user", content: "/future-command alpha beta" },
      { role: "user", content: "Investigate detached task recovery parity" },
    ]);

    expect(task).toBe("Investigate detached task recovery parity");
  });

  it("returns the fallback original-task label when none exists", () => {
    expect(
      getOriginalTaskForInspection([
        { role: "user", content: "/review" },
        { role: "user", content: "/future-command alpha beta" },
      ]),
    ).toContain("No original task found");
  });

  it("detects duplicate built-in agent run errors", () => {
    expect(
      isDuplicateBuiltInAgentRunError(
        new Error(
          'A verification agent is already running for this conversation (verify-1). Use TaskOutput with task_id "verify-1" to inspect it instead of launching another one.',
        ),
      ),
    ).toBe(true);
    expect(isDuplicateBuiltInAgentRunError(new Error("plain error"))).toBe(false);
  });

  it("prepares and launches a shared built-in inspection session", async () => {
    const createProvider = vi.fn(() => ({ runStep: vi.fn() }));
    const runBuiltInAgentSession = vi.fn(async (options) => {
      expect(options.agentType).toBe("review");
      expect(options.workspaceRoot).toBe("E:\\claudecodejingiang\\vscode-extension");
      expect(options.taskDescription).toContain("Review agent");
      expect(options.taskStartOutput).toContain("/review focus on regressions");
      expect(options.taskMetadata.metadata).toMatchObject({
        originalTask: "Fix background task review flow",
        extraGuidance: "focus on regressions",
        commandText: "/review focus on regressions",
      });
      return await options.run(
        {
          onToolStart: () => undefined,
          onToolEnd: () => undefined,
        },
        new AbortController().signal,
      );
    });
    const runAgentSession = vi.fn(async (options) => {
      expect(options.originalTask).toBe("Fix background task review flow");
      expect(options.extraGuidance).toBe("focus on regressions");
      expect(options.tools).toEqual([{ name: "read_file" }]);
      expect(options.toolContext).toEqual({ mode: "review" });
      return "review report";
    });

    const result = await runBuiltInInspectionSession({
      agentType: "review",
      agentLabel: "Review agent",
      taskIdPrefix: "review",
      commandPrefix: "/review",
      commandText: "/review focus on regressions",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      effortLevel: "high",
      tools: [{ name: "read_file" } as any, { name: "write_file" } as any],
      runtimeToolContext: { mode: "all" } as any,
      conversationHistory: [
        { role: "user", content: "Fix background task review flow" },
      ],
      sessionMessages: [
        { role: "user", content: "/commands" },
        { role: "user", content: "/tools review" },
        { role: "user", content: "Fix background task review flow" },
      ],
      taskContextMetadata: {
        source: "test",
      },
      backgroundTaskHost: {
        runBuiltInAgentSession,
      } as any,
      findActiveBuiltInAgentTask: async () => undefined,
      createProvider,
      selectTools: tools => tools.filter(tool => tool.name === "read_file"),
      selectToolContext: () => ({ mode: "review" } as any),
      runAgentSession,
      finalizeSuccess: report => ({
        status: "completed",
        result: report,
        output: report,
      }),
    });

    expect(createProvider).toHaveBeenCalledTimes(1);
    expect(runBuiltInAgentSession).toHaveBeenCalledTimes(1);
    expect(runAgentSession).toHaveBeenCalledTimes(1);
    expect(result.taskId).toContain("review-");
    expect(result.result).toBe("review report");
    expect(result.originalTask).toBe("Fix background task review flow");
    expect(runBuiltInAgentSession.mock.calls[0]?.[0]?.taskMetadata?.metadata).toMatchObject({
      source: "test",
    });
  });

  it("rejects duplicate built-in inspection sessions before launching", async () => {
    const runBuiltInAgentSession = vi.fn();

    await expect(
      runBuiltInInspectionSession({
        agentType: "verification",
        agentLabel: "Verification agent",
        taskIdPrefix: "verify",
        commandPrefix: "/verify",
        commandText: "/verify",
        workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
        config: {
          type: "anthropic",
          apiKey: "secret",
          model: "claude-sonnet",
        },
        effortLevel: undefined,
        tools: [],
        runtimeToolContext: {} as any,
        conversationHistory: [
          { role: "user", content: "Implement verification flow" },
        ],
        sessionMessages: [
          { role: "user", content: "Implement verification flow" },
        ],
        backgroundTaskHost: {
          runBuiltInAgentSession,
        } as any,
        findActiveBuiltInAgentTask: async () => ({ id: "verify-123" }),
        createProvider: () => ({ runStep: vi.fn() }),
        selectTools: tools => tools,
        selectToolContext: context => context,
        runAgentSession: async () => "never reached",
        finalizeSuccess: result => ({
          status: "completed",
          result,
          output: result,
        }),
      }),
    ).rejects.toThrow(/already running for this conversation/);

    expect(runBuiltInAgentSession).not.toHaveBeenCalled();
  });

  it("passes diffRef from taskContextMetadata to findActiveBuiltInAgentTask and rejects same-diffRef duplicate", async () => {
    const findActiveBuiltInAgentTask = vi.fn(async () => ({ id: "review-abc" }));

    await expect(
      runBuiltInInspectionSession({
        agentType: "review",
        agentLabel: "Review agent",
        taskIdPrefix: "review",
        commandPrefix: "/review",
        commandText: "/review main...HEAD",
        workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
        config: { type: "anthropic", apiKey: "secret", model: "claude-sonnet" },
        effortLevel: undefined,
        tools: [],
        runtimeToolContext: {} as any,
        conversationHistory: [{ role: "user", content: "Ship the feature" }],
        sessionMessages: [{ role: "user", content: "Ship the feature" }],
        taskContextMetadata: { diffRef: "main...HEAD" },
        backgroundTaskHost: { runBuiltInAgentSession: vi.fn() } as any,
        findActiveBuiltInAgentTask,
        createProvider: () => ({ runStep: vi.fn() }),
        selectTools: tools => tools,
        selectToolContext: context => context,
        runAgentSession: async () => "never reached",
        finalizeSuccess: result => ({ status: "completed", result, output: result }),
      }),
    ).rejects.toThrow(/already running for this conversation/);

    expect(findActiveBuiltInAgentTask).toHaveBeenCalledWith(
      "E:\\claudecodejingiang\\vscode-extension",
      "review",
      "main...HEAD",
    );
  });

  it("allows different diffRef for same agentType to launch without duplicate error", async () => {
    const findActiveBuiltInAgentTask = vi.fn(async () => undefined);
    const runBuiltInAgentSession = vi.fn(async (options: any) => {
      return await options.run(
        { onToolStart: () => undefined, onToolEnd: () => undefined },
        new AbortController().signal,
      );
    });
    const runAgentSession = vi.fn(async () => "ok");

    const result = await runBuiltInInspectionSession({
      agentType: "review",
      agentLabel: "Review agent",
      taskIdPrefix: "review",
      commandPrefix: "/review",
      commandText: "/review HEAD~1..HEAD",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      config: { type: "anthropic", apiKey: "secret", model: "claude-sonnet" },
      effortLevel: undefined,
      tools: [],
      runtimeToolContext: {} as any,
      conversationHistory: [{ role: "user", content: "Ship the feature" }],
      sessionMessages: [{ role: "user", content: "Ship the feature" }],
      taskContextMetadata: { diffRef: "HEAD~1..HEAD" },
      backgroundTaskHost: { runBuiltInAgentSession } as any,
      findActiveBuiltInAgentTask,
      createProvider: () => ({ runStep: vi.fn() }),
      selectTools: tools => tools,
      selectToolContext: context => context,
      runAgentSession,
      finalizeSuccess: r => ({ status: "completed", result: r, output: r }),
    });

    expect(findActiveBuiltInAgentTask).toHaveBeenCalledWith(
      "E:\\claudecodejingiang\\vscode-extension",
      "review",
      "HEAD~1..HEAD",
    );
    expect(result.taskId).toContain("review-");
    expect(runAgentSession).toHaveBeenCalledTimes(1);
  });

  it("strips diffRef from extraGuidance for mixed diff-aware commands", async () => {
    const runBuiltInAgentSession = vi.fn(async (options: any) => {
      expect(options.taskDescription).toBe("Review agent: focus on auth regressions");
      expect(options.taskMetadata.metadata).toMatchObject({
        diffRef: "HEAD~2..HEAD",
        extraGuidance: "focus on auth regressions",
        commandText: "/review HEAD~2..HEAD focus on auth regressions",
      });
      return await options.run(
        { onToolStart: () => undefined, onToolEnd: () => undefined },
        new AbortController().signal,
      );
    });
    const runAgentSession = vi.fn(async (options: any) => {
      expect(options.extraGuidance).toBe("focus on auth regressions");
      return "review report";
    });

    const result = await runBuiltInInspectionSession({
      agentType: "review",
      agentLabel: "Review agent",
      taskIdPrefix: "review",
      commandPrefix: "/review",
      commandText: "/review HEAD~2..HEAD focus on auth regressions",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      config: { type: "anthropic", apiKey: "secret", model: "claude-sonnet" },
      effortLevel: undefined,
      tools: [],
      runtimeToolContext: {} as any,
      conversationHistory: [{ role: "user", content: "Ship the feature" }],
      sessionMessages: [{ role: "user", content: "Ship the feature" }],
      taskContextMetadata: { diffRef: "HEAD~2..HEAD" },
      backgroundTaskHost: { runBuiltInAgentSession } as any,
      findActiveBuiltInAgentTask: async () => undefined,
      createProvider: () => ({ runStep: vi.fn() }),
      selectTools: tools => tools,
      selectToolContext: context => context,
      runAgentSession,
      finalizeSuccess: report => ({ status: "completed", result: report, output: report }),
    });

    expect(result.result).toBe("review report");
    expect(runAgentSession).toHaveBeenCalledTimes(1);
  });

  it("strips an explicit separator from non-diff inspection guidance", async () => {
    const runBuiltInAgentSession = vi.fn(async (options: any) => {
      expect(options.taskDescription).toBe("Review agent: focus on auth regressions");
      expect(options.taskMetadata.metadata).toMatchObject({
        extraGuidance: "focus on auth regressions",
        commandText: "/review -- focus on auth regressions",
      });
      return await options.run(
        { onToolStart: () => undefined, onToolEnd: () => undefined },
        new AbortController().signal,
      );
    });
    const runAgentSession = vi.fn(async (options: any) => {
      expect(options.extraGuidance).toBe("focus on auth regressions");
      return "review report";
    });

    await runBuiltInInspectionSession({
      agentType: "review",
      agentLabel: "Review agent",
      taskIdPrefix: "review",
      commandPrefix: "/review",
      commandText: "/review -- focus on auth regressions",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      config: { type: "anthropic", apiKey: "secret", model: "claude-sonnet" },
      effortLevel: undefined,
      tools: [],
      runtimeToolContext: {} as any,
      conversationHistory: [{ role: "user", content: "Ship the feature" }],
      sessionMessages: [{ role: "user", content: "Ship the feature" }],
      backgroundTaskHost: { runBuiltInAgentSession } as any,
      findActiveBuiltInAgentTask: async () => undefined,
      createProvider: () => ({ runStep: vi.fn() }),
      selectTools: tools => tools,
      selectToolContext: context => context,
      runAgentSession,
      finalizeSuccess: report => ({ status: "completed", result: report, output: report }),
    });

    expect(runAgentSession).toHaveBeenCalledTimes(1);
  });

  it("strips an explicit separator after diffRef in mixed inspection commands", async () => {
    const runBuiltInAgentSession = vi.fn(async (options: any) => {
      expect(options.taskDescription).toBe("Review agent: focus on auth regressions");
      expect(options.taskMetadata.metadata).toMatchObject({
        diffRef: "HEAD~2..HEAD",
        extraGuidance: "focus on auth regressions",
        commandText: "/review HEAD~2..HEAD -- focus on auth regressions",
      });
      return await options.run(
        { onToolStart: () => undefined, onToolEnd: () => undefined },
        new AbortController().signal,
      );
    });
    const runAgentSession = vi.fn(async (options: any) => {
      expect(options.extraGuidance).toBe("focus on auth regressions");
      return "review report";
    });

    await runBuiltInInspectionSession({
      agentType: "review",
      agentLabel: "Review agent",
      taskIdPrefix: "review",
      commandPrefix: "/review",
      commandText: "/review HEAD~2..HEAD -- focus on auth regressions",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      config: { type: "anthropic", apiKey: "secret", model: "claude-sonnet" },
      effortLevel: undefined,
      tools: [],
      runtimeToolContext: {} as any,
      conversationHistory: [{ role: "user", content: "Ship the feature" }],
      sessionMessages: [{ role: "user", content: "Ship the feature" }],
      taskContextMetadata: { diffRef: "HEAD~2..HEAD" },
      backgroundTaskHost: { runBuiltInAgentSession } as any,
      findActiveBuiltInAgentTask: async () => undefined,
      createProvider: () => ({ runStep: vi.fn() }),
      selectTools: tools => tools,
      selectToolContext: context => context,
      runAgentSession,
      finalizeSuccess: report => ({ status: "completed", result: report, output: report }),
    });

    expect(runAgentSession).toHaveBeenCalledTimes(1);
  });
});
