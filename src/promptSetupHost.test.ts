import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAutoMemoryDirMock,
  readAutoMemoryEntrypointMock,
  buildAutoMemorySystemPromptMock,
  loadContextConfigMock,
  buildContextSystemPromptMock,
  loadModelInvocableInstalledSkillsMock,
  buildInstalledSkillsSystemPromptMock,
  buildPlanModeSystemPromptMock,
  buildPendingPlanVerificationSystemPromptMock,
  buildThinkingEffortSystemPromptMock,
} = vi.hoisted(() => ({
  getAutoMemoryDirMock: vi.fn(() => "E:\\repo\\.auto-memory"),
  readAutoMemoryEntrypointMock: vi.fn(async () => "memory entrypoint"),
  buildAutoMemorySystemPromptMock: vi.fn(() => "auto memory prompt"),
  loadContextConfigMock: vi.fn(async () => ({
    extraDirectories: ["docs"],
    pinnedFiles: [],
  })),
  buildContextSystemPromptMock: vi.fn(() => "context prompt"),
  loadModelInvocableInstalledSkillsMock: vi.fn(async () => []),
  buildInstalledSkillsSystemPromptMock: vi.fn(() => "installed skills prompt"),
  buildPlanModeSystemPromptMock: vi.fn(() => "plan prompt"),
  buildPendingPlanVerificationSystemPromptMock: vi.fn(
    () => "verification prompt",
  ),
  buildThinkingEffortSystemPromptMock: vi.fn(() => "thinking prompt"),
}));

vi.mock("./agent/agentRunner", () => ({
  SYSTEM_PROMPT: "base prompt",
}));

vi.mock("./autoMemory/paths", () => ({
  getAutoMemoryDir: getAutoMemoryDirMock,
  readAutoMemoryEntrypoint: readAutoMemoryEntrypointMock,
}));

vi.mock("./autoMemory/prompt", () => ({
  buildAutoMemorySystemPrompt: buildAutoMemorySystemPromptMock,
}));

vi.mock("./contextRegistry", () => ({
  loadContextConfig: loadContextConfigMock,
  buildContextSystemPrompt: buildContextSystemPromptMock,
}));

vi.mock("./installedSkillModelRegistry", () => ({
  loadModelInvocableInstalledSkills: loadModelInvocableInstalledSkillsMock,
  buildInstalledSkillsSystemPrompt: buildInstalledSkillsSystemPromptMock,
}));

vi.mock("./planMode/planModePrompt", () => ({
  buildPlanModeSystemPrompt: buildPlanModeSystemPromptMock,
}));

vi.mock("./thinkingEffort/prompt", () => ({
  buildThinkingEffortSystemPrompt: buildThinkingEffortSystemPromptMock,
}));

vi.mock("./verification/prompt", () => ({
  buildPendingPlanVerificationSystemPrompt:
    buildPendingPlanVerificationSystemPromptMock,
}));

import {
  applyPromptTurnUserContext,
  buildWorkspaceSystemPrompt,
  createWorkspaceSystemPromptBuilder,
  preparePromptTurnDependencies,
} from "./promptSetupHost";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("promptSetupHost", () => {
  it("builds the workspace system prompt through memory, context, plan, reminder, and effort layers", async () => {
    const result = await buildWorkspaceSystemPrompt({
      workspaceRoot: "E:\\repo",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      effortLevel: "high",
      planModeState: {
        active: true,
        planFilePath: ".omx/plans/test.md",
      },
      pendingPlanVerification: {
        planFilePath: ".omx/plans/test.md",
        planContent: "1. Build",
        approvedAtUserTurnCount: 2,
        verificationStarted: false,
        verificationCompleted: false,
      },
      pendingPlanVerificationReminderTurns: 4,
      getPlanContent: async () => "1. Build",
    });

    expect(getAutoMemoryDirMock).toHaveBeenCalledWith("E:\\repo");
    expect(readAutoMemoryEntrypointMock).toHaveBeenCalledWith("E:\\repo");
    expect(buildAutoMemorySystemPromptMock).toHaveBeenCalledWith(
      "base prompt",
      {
        memoryDir: "E:\\repo\\.auto-memory",
        entrypointContent: "memory entrypoint",
      },
    );
    expect(loadContextConfigMock).toHaveBeenCalledWith("E:\\repo");
    expect(buildContextSystemPromptMock).toHaveBeenCalledWith(
      "auto memory prompt",
      {
        workspaceRoot: "E:\\repo",
        extraDirectories: ["docs"],
      },
    );
    expect(loadModelInvocableInstalledSkillsMock).toHaveBeenCalledWith("E:\\repo");
    expect(buildInstalledSkillsSystemPromptMock).toHaveBeenCalledWith(
      "context prompt",
      [],
    );
    expect(buildPlanModeSystemPromptMock).toHaveBeenCalledWith("installed skills prompt", {
      planFilePath: ".omx/plans/test.md",
      planHasContent: true,
    });
    expect(buildPendingPlanVerificationSystemPromptMock).toHaveBeenCalledWith(
      "plan prompt",
      {
        planFilePath: ".omx/plans/test.md",
        turnsSinceApproval: 4,
      },
    );
    expect(buildThinkingEffortSystemPromptMock).toHaveBeenCalledWith(
      "verification prompt",
      {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      "high",
    );
    expect(result).toBe("thinking prompt");
  });

  it("skips plan and reminder layers when inactive", async () => {
    const result = await buildWorkspaceSystemPrompt({
      workspaceRoot: "E:\\repo",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      effortLevel: undefined,
      planModeState: {
        active: false,
      },
      pendingPlanVerification: undefined,
      pendingPlanVerificationReminderTurns: null,
      getPlanContent: async () => {
        throw new Error("should not read plan content");
      },
    });

    expect(buildPlanModeSystemPromptMock).not.toHaveBeenCalled();
    expect(buildPendingPlanVerificationSystemPromptMock).not.toHaveBeenCalled();
    expect(buildThinkingEffortSystemPromptMock).toHaveBeenCalledWith(
      "installed skills prompt",
      {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      undefined,
    );
    expect(result).toBe("thinking prompt");
  });

  it("applies prompt turn user context, mention context, and auto-compact in order", async () => {
    const calls: string[] = [];
    const appended: Array<{
      role: "user" | "assistant";
      content: string;
      attachments?: Array<{ data: string; mimeType: string }>;
    }> = [];

    await applyPromptTurnUserContext({
      prompt: "fix @src/extension.ts",
      attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
      workspaceRoot: "E:\\repo",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: { HELLO: "world" },
      appendConversationMessage: message => {
        calls.push(`append:${message.content.slice(0, 12)}`);
        appended.push(message);
      },
      buildPromptFileMentionContext: async ({ prompt, workspaceRoot }) => {
        calls.push(`mentions:${workspaceRoot}:${prompt}`);
        return {
          supplementalPrompt: "file context payload",
        };
      },
      persistCurrentSessionRuntimeState: () => {
        calls.push("persist");
      },
      maybeAutoCompactConversation: async (workspaceRoot, config, envMap) => {
        calls.push(
          `compact:${workspaceRoot}:${config.type}:${envMap.HELLO ?? ""}`,
        );
      },
    });

    expect(appended).toEqual([
      {
        role: "user",
        content: "fix @src/extension.ts",
        attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
      },
      { role: "user", content: "file context payload" },
    ]);
    expect(calls).toEqual([
      "append:fix @src/ext",
      "mentions:E:\\repo:fix @src/extension.ts",
      "append:file context",
      "persist",
      "compact:E:\\repo:anthropic:world",
    ]);
  });

  it("skips mention append when no supplemental prompt exists", async () => {
    const appendConversationMessage = vi.fn();

    await applyPromptTurnUserContext({
      prompt: "just run it",
      workspaceRoot: "E:\\repo",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: {},
      appendConversationMessage,
      buildPromptFileMentionContext: async () => ({}),
      persistCurrentSessionRuntimeState: () => undefined,
      maybeAutoCompactConversation: async () => undefined,
    });

    expect(appendConversationMessage).toHaveBeenCalledTimes(1);
    expect(appendConversationMessage).toHaveBeenCalledWith({
      role: "user",
      content: "just run it",
    });
  });

  it("prepares prompt turn dependencies with provider and swarm toggle", async () => {
    const provider = { runStep: vi.fn() };
    const buildProvider = vi.fn(() => provider);

    const result = await preparePromptTurnDependencies({
      prompt: "use swarm now",
      workspaceRoot: "E:\\repo",
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      envMap: { HELLO: "world" },
      runtimeOptions: { fastMode: true },
      effortLevel: "high",
      getConversationHistory: () => [
        { role: "user", content: "task" },
        { role: "assistant", content: "reply" },
      ],
      getSystemPromptForWorkspace: async (workspaceRoot, config, effortLevel) => {
        expect(workspaceRoot).toBe("E:\\repo");
        expect(config.type).toBe("anthropic");
        expect(effortLevel).toBe("high");
        return "system prompt";
      },
      buildProvider,
      shouldEnableSwarmForPrompt: prompt => prompt.includes("swarm"),
    });

    expect(buildProvider).toHaveBeenCalledWith({
      config: {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      workspaceRoot: "E:\\repo",
      systemPrompt: "system prompt",
      envMap: { HELLO: "world" },
      runtimeOptions: { fastMode: true },
    });
    expect(result).toEqual({
      history: [
        { role: "user", content: "task" },
        { role: "assistant", content: "reply" },
      ],
      provider,
      swarmEnabledForTurn: true,
    });
  });

  it("creates a workspace system prompt builder that closes over plan verification state", async () => {
    const builder = createWorkspaceSystemPromptBuilder({
      planModeState: {
        active: true,
        planFilePath: ".omx/plans/test.md",
      },
      getPendingPlanVerification: () => ({
        planFilePath: ".omx/plans/test.md",
        planContent: "1. Build",
        approvedAtUserTurnCount: 2,
        verificationStarted: false,
        verificationCompleted: false,
      }),
      getPendingPlanVerificationReminderTurns: () => 3,
      getPlanContent: async () => "1. Build",
    });

    const result = await builder(
      "E:\\repo",
      {
        type: "anthropic",
        apiKey: "secret",
        model: "claude-sonnet",
      },
      "high",
    );

    expect(buildPlanModeSystemPromptMock).toHaveBeenCalledWith("installed skills prompt", {
      planFilePath: ".omx/plans/test.md",
      planHasContent: true,
    });
    expect(buildInstalledSkillsSystemPromptMock).toHaveBeenCalledWith(
      "context prompt",
      [],
    );
    expect(buildPendingPlanVerificationSystemPromptMock).toHaveBeenCalledWith(
      "plan prompt",
      {
        planFilePath: ".omx/plans/test.md",
        turnsSinceApproval: 3,
      },
    );
    expect(result).toBe("thinking prompt");
  });
});
