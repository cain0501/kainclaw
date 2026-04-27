import { describe, expect, it, vi } from "vitest";

import { handleElectronPromptCommand } from "./electronPromptCommandHost";

const providerConfig = {
  type: "anthropic" as const,
  apiKey: "secret",
  model: "claude-sonnet",
};

describe("electronPromptCommandHost", () => {
  it("reuses local prompt commands such as /commands", async () => {
    const result = await handleElectronPromptCommand({
      prompt: "/commands",
      config: providerConfig,
      workspaceRoot: "E:\\repo",
      envMap: {},
      runtime: {},
      tools: [],
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
      runtimeOptions: {},
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") {
      throw new Error("Expected reply result.");
    }
    expect(result.reply).toContain("Available slash commands in the Electron desktop shell:");
    expect(result.reply).toContain("/commands");
    expect(result.reply).toContain("/verify: Run the built-in verification agent against the current workspace state.");
    expect(result.reply).toContain("Unavailable in this shell: /plan, /exitplan");
  });

  it("returns an explicit desktop-shell reply for unsupported runtime commands", async () => {
    const result = await handleElectronPromptCommand({
      prompt: "/plan",
      config: providerConfig,
      workspaceRoot: "E:\\repo",
      envMap: {},
      runtime: {},
      tools: [],
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
      runtimeOptions: {},
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(result).toEqual({
      kind: "reply",
      reply:
      "/plan is not yet wired into the Electron desktop shell. Use the VS Code host for this capability for now.",
    });
  });

  it("reuses runtime reply commands that are safe in the desktop shell", async () => {
    const getMcpStatusSummary = vi.fn(async () => [
      {
        name: "github",
        state: "connected",
        transport: "stdio",
        toolCount: 3,
      },
    ]);

    const result = await handleElectronPromptCommand({
      prompt: "/mcp",
      config: providerConfig,
      workspaceRoot: "E:\\repo",
      envMap: {},
      runtime: { getMcpStatusSummary },
      tools: [],
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
      runtimeOptions: {},
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") {
      throw new Error("Expected reply result.");
    }
    expect(result.reply).toContain("MCP servers:");
    expect(result.reply).toContain("github: connected");
    expect(getMcpStatusSummary).toHaveBeenCalledTimes(1);
  });

  it("returns null for normal chat prompts", async () => {
    const result = await handleElectronPromptCommand({
      prompt: "write code",
      config: providerConfig,
      workspaceRoot: "E:\\repo",
      envMap: {},
      runtime: {},
      tools: [],
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
      runtimeOptions: {},
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(result).toEqual({ kind: "continue" });
  });

  it("allows /todo to flow through the runtime command chain", async () => {
    const result = await handleElectronPromptCommand({
      prompt: "/todo",
      config: providerConfig,
      workspaceRoot: "E:\\repo",
      envMap: {},
      runtime: {
        getToolContext: () => ({
          workspaceRoot: "E:\\repo",
          tasks: {
            createTask: vi.fn(),
            getTask: vi.fn(),
            listTasks: vi.fn(async () => []),
            listBackgroundTasks: vi.fn(async () => []),
            updateTask: vi.fn(),
            deleteTask: vi.fn(),
            blockTask: vi.fn(),
            registerBackgroundTask: vi.fn(),
            getBackgroundTask: vi.fn(),
            updateBackgroundTask: vi.fn(),
            appendBackgroundOutput: vi.fn(),
            waitForBackgroundTask: vi.fn(),
          },
        }),
      },
      tools: [],
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
      runtimeOptions: {},
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") {
      throw new Error("Expected reply result.");
    }
    expect(result.reply).toContain("Structured task");
  });

  it("returns handled when /compact is wired and consumed by the desktop shell", async () => {
    const handleCompactCommand = vi.fn(async () => true);

    const result = await handleElectronPromptCommand({
      prompt: "/compact",
      config: providerConfig,
      workspaceRoot: "E:\\repo",
      envMap: {},
      runtime: {},
      tools: [],
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
      runtimeOptions: {},
      handleCompactCommand,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(result).toEqual({ kind: "handled" });
    expect(handleCompactCommand).toHaveBeenCalledTimes(1);
  });
});
