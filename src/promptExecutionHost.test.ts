import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  handleLocalPromptCommandMock,
  handlePlanModePromptCommandMock,
  handleCompactCommandWithHostMock,
  handleReviewCommandWithHostMock,
  handleUltrareviewCommandWithHostMock,
  handleUltraverifyCommandWithHostMock,
  handleVerificationCommandWithHostMock,
} = vi.hoisted(() => ({
  handleLocalPromptCommandMock: vi.fn(),
  handlePlanModePromptCommandMock: vi.fn(),
  handleCompactCommandWithHostMock: vi.fn(),
  handleReviewCommandWithHostMock: vi.fn(),
  handleUltrareviewCommandWithHostMock: vi.fn(),
  handleUltraverifyCommandWithHostMock: vi.fn(),
  handleVerificationCommandWithHostMock: vi.fn(),
}));

vi.mock("./promptCommandHost", async importOriginal => {
  const original = await importOriginal<typeof import("./promptCommandHost")>();
  return {
    ...original,
    handleLocalPromptCommand: handleLocalPromptCommandMock,
    handlePlanModePromptCommand: handlePlanModePromptCommandMock,
  };
});

vi.mock("./compactHost", () => ({
  handleCompactCommandWithHost: handleCompactCommandWithHostMock,
}));

vi.mock("./inspectionHost", () => ({
  handleReviewCommandWithHost: handleReviewCommandWithHostMock,
  handleUltrareviewCommandWithHost: handleUltrareviewCommandWithHostMock,
  handleUltraverifyCommandWithHost: handleUltraverifyCommandWithHostMock,
  handleVerificationCommandWithHost: handleVerificationCommandWithHostMock,
}));

import {
  createPromptExecutionCommandHandlers,
  preparePromptExecutionStep,
} from "./promptExecutionHost";

const providerConfig = {
  type: "anthropic" as const,
  apiKey: "secret",
  model: "claude-sonnet",
};

const tempDirs: string[] = [];

describe("promptExecutionHost", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
    );
    delete process.env.CLAUDE_CONFIG_HOME;
  });

  it("creates prompt execution command adapters that delegate to the underlying hosts", async () => {
    handleLocalPromptCommandMock.mockResolvedValue("local reply");
    handlePlanModePromptCommandMock.mockResolvedValue("plan reply");
    handleCompactCommandWithHostMock.mockResolvedValue(true);
    handleReviewCommandWithHostMock.mockResolvedValue(true);
    handleUltrareviewCommandWithHostMock.mockResolvedValue(true);
    handleUltraverifyCommandWithHostMock.mockResolvedValue(true);
    handleVerificationCommandWithHostMock.mockResolvedValue(true);

    const handlers = createPromptExecutionCommandHandlers({
      workspaceFolderPath: "E:\\repo",
      getCurrentEffortLevel: () => "high",
      setEffortLevel: vi.fn(async () => undefined),
      getCurrentFastMode: () => true,
      setFastMode: vi.fn(async () => undefined),
      setActiveProviderModel: vi.fn(async () => undefined),
      refreshWorkspaceStatus: vi.fn(),
      getConversationHistory: () => [{ role: "user", content: "task" }],
      getPendingPlanVerification: () => undefined,
      sessionMessages: [{ role: "user", content: "task" }],
      blockedByPlanMode: false,
      getTranscriptPath: () => "E:\\repo\\.transcript.jsonl",
      replaceConversationHistory: vi.fn(),
      backgroundTaskHost: {
        runBuiltInAgentSession: vi.fn(),
        buildFollowUpMessage: vi.fn(() => "follow-up"),
        runDetachedRemoteReview: vi.fn(),
        runDetachedRemoteVerification: vi.fn(),
      } as any,
      findActiveBuiltInAgentTask: vi.fn(async () => undefined),
      createProviderAdapter: vi.fn(() => ({
        runStep: vi.fn(async () => ({ text: "", toolCalls: [], done: true })),
      })),
      onStreamingToken: vi.fn(),
      startToolExecution: vi.fn(),
      finishToolExecution: vi.fn(),
      addPhaseActivity: vi.fn(() => "activity-1"),
      finishPhaseActivity: vi.fn(),
      recordAssistantReply: vi.fn(async () => undefined),
      setCompanionState: vi.fn(),
      clearStreamingText: vi.fn(),
      updateMood: vi.fn(async () => undefined),
      isAbortLikeError: vi.fn(() => false),
      markPendingPlanVerificationStarted: vi.fn(),
      markPendingPlanVerificationCompleted: vi.fn(),
      resetPendingPlanVerificationToAwaitingStart: vi.fn(),
    });

    await expect(
      handlers.tryHandleLocalCommand("prompt", providerConfig),
    ).resolves.toBe("local reply");
    await expect(
      handlers.tryHandlePlanModeCommand(
        "prompt",
        { getToolContext: () => ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) } as any,
      ),
    ).resolves.toBe("plan reply");
    await expect(
      handlers.handleCompactCommand("prompt", "E:\\repo", providerConfig, {}),
    ).resolves.toBe(true);
    await expect(
      handlers.handleReviewCommand(
        "prompt",
        "E:\\repo",
        providerConfig,
        {},
        { getToolContext: () => ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) } as any,
        [],
        {},
        "medium",
      ),
    ).resolves.toBe(true);
    await expect(
      handlers.handleUltrareviewCommand(
        "prompt",
        "E:\\repo",
        providerConfig,
        {},
        { getToolContext: () => ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) } as any,
        [],
        {},
        "medium",
      ),
    ).resolves.toBe(true);
    await expect(
      handlers.handleUltraverifyCommand(
        "prompt",
        "E:\\repo",
        providerConfig,
        {},
        { getToolContext: () => ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) } as any,
        [],
        {},
        "high",
      ),
    ).resolves.toBe(true);
    await expect(
      handlers.handleVerificationCommand(
        "prompt",
        "E:\\repo",
        providerConfig,
        {},
        { getToolContext: () => ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) } as any,
        [],
        {},
        "high",
      ),
    ).resolves.toBe(true);

    expect(handleLocalPromptCommandMock).toHaveBeenCalledTimes(1);
    expect(handlePlanModePromptCommandMock).toHaveBeenCalledTimes(1);
    expect(handleCompactCommandWithHostMock).toHaveBeenCalledTimes(1);
    expect(handleReviewCommandWithHostMock).toHaveBeenCalledTimes(1);
    expect(handleUltrareviewCommandWithHostMock).toHaveBeenCalledTimes(1);
    expect(handleUltraverifyCommandWithHostMock).toHaveBeenCalledTimes(1);
    expect(handleVerificationCommandWithHostMock).toHaveBeenCalledTimes(1);
  });

  it("returns a reply when a local prompt command handles the prompt", async () => {
    const getWorkspaceRuntime = vi.fn();

    const result = await preparePromptExecutionStep({
      prompt: "/effort high",
      workspaceFolderPath: "E:\\repo",
      resolveProviderConfig: async () => ({
        config: providerConfig,
        envMap: {},
      }),
      getEffortLevel: () => "high",
      createProviderRuntimeOptions: () => ({}),
      ensureConversationWorktreeHydrated: async () => undefined,
      getEffectiveWorkspaceRoot: path => path,
      getWorkspaceRuntime: getWorkspaceRuntime as any,
      setFreshWorkspaceTools: () => undefined,
      tryHandleLocalCommand: async () => "local reply",
      tryHandlePlanModeCommand: async () => null,
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleUltraverifyCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(result).toEqual({
      kind: "reply",
      reply: "local reply",
    });
    expect(getWorkspaceRuntime).not.toHaveBeenCalled();
  });

  it("loads a fresh runtime/tools payload and returns continue state", async () => {
    const runtime = {
      getToolContext: () =>
        ({ workspaceRoot: "E:\\repo\\effective", invokerKind: "main" }) as any,
      getToolDefinitions: async () => [{ name: "read_file" }] as any,
      getMcpStatusSummary: async () => [{ name: "github" }] as any,
    };
    const setFreshWorkspaceTools = vi.fn();
    const finishActivity = vi.fn();

    const result = await preparePromptExecutionStep({
      prompt: "write code",
      workspaceFolderPath: "E:\\repo",
      resolveProviderConfig: async () => ({
        config: providerConfig,
        envMap: { HELLO: "world" },
      }),
      getEffortLevel: () => "medium",
      createProviderRuntimeOptions: () => ({ effortLevel: "medium" }),
      ensureConversationWorktreeHydrated: async () => undefined,
      getEffectiveWorkspaceRoot: path => `${path}\\effective`,
      getWorkspaceRuntime: async () => runtime,
      setFreshWorkspaceTools,
      startActivity: () => "activity-1",
      finishActivity,
      tryHandleLocalCommand: async () => null,
      tryHandlePlanModeCommand: async () => null,
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleUltraverifyCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(result).toMatchObject({
      kind: "continue",
      config: providerConfig,
      envMap: { HELLO: "world" },
      effortLevel: "medium",
      runtimeOptions: { effortLevel: "medium" },
      workspaceRoot: "E:\\repo\\effective",
      runtime,
      tools: [{ name: "read_file" }],
      effectivePrompt: "write code",
    });
    expect(setFreshWorkspaceTools).toHaveBeenCalledWith({
      tools: [{ name: "read_file" }],
      workspaceRoot: "E:\\repo\\effective",
      mcpServers: [{ name: "github" }],
      providerLabel: "anthropic · claude-sonnet · 1 tools",
    });
    expect(finishActivity).toHaveBeenCalledWith("activity-1", expect.any(String));
  });

  it("short-circuits when the prompt command chain handles the prompt", async () => {
    const runtime = {
      getToolContext: () =>
        ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) as any,
      getToolDefinitions: async () => [{ name: "read_file" }] as any,
      getMcpStatusSummary: async () => [{ name: "github" }] as any,
    };

    const result = await preparePromptExecutionStep({
      prompt: "/compact",
      workspaceFolderPath: "E:\\repo",
      resolveProviderConfig: async () => ({
        config: providerConfig,
        envMap: {},
      }),
      getEffortLevel: () => "high",
      createProviderRuntimeOptions: () => ({}),
      ensureConversationWorktreeHydrated: async () => undefined,
      getEffectiveWorkspaceRoot: path => path,
      getWorkspaceRuntime: async () => runtime,
      setFreshWorkspaceTools: () => undefined,
      tryHandleLocalCommand: async () => null,
      tryHandlePlanModeCommand: async () => null,
      handleCompactCommand: async () => true,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleUltraverifyCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(result).toEqual({ kind: "handled" });
  });

  it("rewrites MCP prompt commands into effective prompt content while keeping runtime context", async () => {
    const runtime = {
      getToolContext: () =>
        ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) as any,
      getToolDefinitions: async () => [{ name: "read_file" }] as any,
      getMcpStatusSummary: async () => [{ name: "github" }] as any,
      getMcpPromptCommands: async () => [
        {
          name: "/mcp__github__summarize_issue",
          description: "Summarize issue",
          argNames: ["issue"],
          serverName: "github",
          promptName: "summarize_issue",
          userFacingName: "github:summarize_issue (MCP)",
        },
      ],
      executeMcpPromptCommand: async () => ({
        content: "Summarize issue 123 with the latest comments.",
        attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
      }),
    };

    const result = await preparePromptExecutionStep({
      prompt: "/mcp__github__summarize_issue 123",
      workspaceFolderPath: "E:\\repo",
      resolveProviderConfig: async () => ({
        config: providerConfig,
        envMap: {},
      }),
      getEffortLevel: () => "high",
      createProviderRuntimeOptions: () => ({}),
      ensureConversationWorktreeHydrated: async () => undefined,
      getEffectiveWorkspaceRoot: path => path,
      getWorkspaceRuntime: async () => runtime,
      setFreshWorkspaceTools: () => undefined,
      tryHandleLocalCommand: async () => null,
      tryHandlePlanModeCommand: async () => null,
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleUltraverifyCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(result).toMatchObject({
      kind: "continue",
      workspaceRoot: "E:\\repo",
      effectivePrompt: "Summarize issue 123 with the latest comments.",
      effectivePromptAttachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
    });
  });

  it("applies installed skill tool/model/effort overrides to the continue state", async () => {
    const claudeHome = await fs.mkdtemp(path.join(os.tmpdir(), "cain-claude-home-"));
    tempDirs.push(claudeHome);
    process.env.CLAUDE_CONFIG_HOME = claudeHome;

    const browseSkillDir = path.join(claudeHome, "skills", "browse");
    await fs.mkdir(browseSkillDir, { recursive: true });
    await fs.writeFile(
      path.join(browseSkillDir, "SKILL.md"),
      `---
name: browse
description: Browser automation helper
allowed-tools:
  - Bash
  - Read
disable-model-invocation: true
context: fork
hooks:
  UserPromptSubmit:
    - hooks:
        - type: prompt
          prompt: Be concise.
model: claude-opus-4-6
effort: high
---

Use browser tooling from \${CLAUDE_SKILL_DIR}
Requested target: $ARGUMENTS
`,
      "utf8",
    );

    const runtime = {
      getToolContext: () =>
        ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) as any,
      getToolDefinitions: async () => [
        { name: "read_file" },
        { name: "run_command" },
        { name: "write_file" },
      ] as any,
      getMcpStatusSummary: async () => [],
    };

    const createProviderRuntimeOptions = vi.fn((config: { model?: string }) => ({
      effortLevel: "medium",
      thinkingConfig: config.model === "claude-opus-4-6"
        ? { type: "enabled", budgetTokens: 8192 }
        : undefined,
    }));

    const result = await preparePromptExecutionStep({
      prompt: "/browse https://www.baidu.com",
      workspaceFolderPath: "E:\\repo",
      resolveProviderConfig: async () => ({
        config: providerConfig,
        envMap: {},
      }),
      getEffortLevel: () => "medium",
      createProviderRuntimeOptions: createProviderRuntimeOptions as any,
      ensureConversationWorktreeHydrated: async () => undefined,
      getEffectiveWorkspaceRoot: path => path,
      getWorkspaceRuntime: async () => runtime,
      setFreshWorkspaceTools: () => undefined,
      tryHandleLocalCommand: async () => null,
      tryHandlePlanModeCommand: async () => null,
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleUltraverifyCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(result).toMatchObject({
      kind: "continue",
      effectivePrompt: expect.stringContaining("Requested target: https://www.baidu.com"),
      config: expect.objectContaining({ model: "claude-opus-4-6" }),
      effortLevel: "high",
      tools: [
        { name: "read_file" },
        { name: "run_command" },
      ],
      installedSkillExecution: expect.objectContaining({
        allowedTools: ["run_command", "read_file"],
        modelOverride: "claude-opus-4-6",
        effortOverride: "high",
        disableModelInvocation: true,
        executionContext: "fork",
        hooks: [
          expect.objectContaining({
            type: "prompt",
            events: ["PrePrompt"],
            prompt: "Be concise.",
          }),
        ],
      }),
    });
    expect(createProviderRuntimeOptions).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-opus-4-6" }),
    );
  });

  it("registers installed-skill hooks into the session store and reuses them on later prompts", async () => {
    const claudeHome = await fs.mkdtemp(path.join(os.tmpdir(), "cain-claude-home-"));
    tempDirs.push(claudeHome);
    process.env.CLAUDE_CONFIG_HOME = claudeHome;

    const browseSkillDir = path.join(claudeHome, "skills", "browse");
    await fs.mkdir(browseSkillDir, { recursive: true });
    await fs.writeFile(
      path.join(browseSkillDir, "SKILL.md"),
      `---
name: browse
description: Browser automation helper
hooks:
  UserPromptSubmit:
    - hooks:
        - type: prompt
          prompt: Be concise.
---

Requested target: $ARGUMENTS
`,
      "utf8",
    );

    const sessionHooks: Array<{
      id: string;
      type: string;
      events: string[];
      prompt?: string;
    }> = [];

    const runtime = {
      getToolContext: () =>
        ({ workspaceRoot: "E:\\repo", invokerKind: "main" }) as any,
      getToolDefinitions: async () => [{ name: "read_file" }] as any,
      getMcpStatusSummary: async () => [],
    };

    const first = await preparePromptExecutionStep({
      prompt: "/browse https://www.baidu.com",
      workspaceFolderPath: "E:\\repo",
      resolveProviderConfig: async () => ({
        config: providerConfig,
        envMap: {},
      }),
      getEffortLevel: () => "medium",
      createProviderRuntimeOptions: () => ({ effortLevel: "medium" }),
      ensureConversationWorktreeHydrated: async () => undefined,
      getEffectiveWorkspaceRoot: path => path,
      getWorkspaceRuntime: async () => runtime,
      setFreshWorkspaceTools: () => undefined,
      tryHandleLocalCommand: async () => null,
      tryHandlePlanModeCommand: async () => null,
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleUltraverifyCommand: async () => false,
      handleVerificationCommand: async () => false,
      getSessionInstalledSkillHooks: () => sessionHooks as any,
      registerSessionInstalledSkillHooks: hooks => {
        sessionHooks.splice(0, sessionHooks.length, ...(hooks as any));
        return sessionHooks as any;
      },
    });

    expect(first).toMatchObject({
      kind: "continue",
      installedSkillExecution: expect.objectContaining({
        skill: expect.objectContaining({ id: "browse" }),
        hooks: [
          expect.objectContaining({
            type: "prompt",
            events: ["PrePrompt"],
            prompt: "Be concise.",
          }),
        ],
      }),
    });
    expect(sessionHooks).toHaveLength(1);

    const second = await preparePromptExecutionStep({
      prompt: "normal prompt",
      workspaceFolderPath: "E:\\repo",
      resolveProviderConfig: async () => ({
        config: providerConfig,
        envMap: {},
      }),
      getEffortLevel: () => "medium",
      createProviderRuntimeOptions: () => ({ effortLevel: "medium" }),
      ensureConversationWorktreeHydrated: async () => undefined,
      getEffectiveWorkspaceRoot: path => path,
      getWorkspaceRuntime: async () => runtime,
      setFreshWorkspaceTools: () => undefined,
      tryHandleLocalCommand: async () => null,
      tryHandlePlanModeCommand: async () => null,
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleUltraverifyCommand: async () => false,
      handleVerificationCommand: async () => false,
      getSessionInstalledSkillHooks: () => sessionHooks as any,
      registerSessionInstalledSkillHooks: hooks => hooks as any,
    });

    expect(second).toMatchObject({
      kind: "continue",
      installedSkillHooks: [
        expect.objectContaining({
          type: "prompt",
          events: ["PrePrompt"],
          prompt: "Be concise.",
        }),
      ],
    });
  });
});
