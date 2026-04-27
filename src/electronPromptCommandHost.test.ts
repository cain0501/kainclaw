import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { handleElectronPromptCommand } from "./electronPromptCommandHost";

const providerConfig = {
  type: "anthropic" as const,
  apiKey: "secret",
  model: "claude-sonnet",
};

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
  delete process.env.CLAUDE_CONFIG_HOME;
});

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
      handleUltraverifyCommand: async () => false,
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

  it("surfaces installed skill commands through /commands in the Electron shell", async () => {
    const claudeHome = await fs.mkdtemp(path.join(os.tmpdir(), "cain-claude-home-"));
    tempDirs.push(claudeHome);
    process.env.CLAUDE_CONFIG_HOME = claudeHome;

    const browseSkillDir = path.join(claudeHome, "skills", "browse");
    await fs.mkdir(browseSkillDir, { recursive: true });
    await fs.writeFile(
      path.join(browseSkillDir, "SKILL.md"),
      `---
name: browse
description: |
  Fast headless browser for QA testing and site dogfooding.
allowed-tools:
  - Bash
---
`,
      "utf8",
    );

    const listResult = await handleElectronPromptCommand({
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
      handleUltraverifyCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(listResult.kind).toBe("reply");
    if (listResult.kind !== "reply") {
      throw new Error("Expected reply result.");
    }
    expect(listResult.reply).toContain("Installed skill commands:");
    expect(listResult.reply).toContain("/browse: Fast headless browser for QA testing and site dogfooding. [installed-user]");

    const detailResult = await handleElectronPromptCommand({
      prompt: "/commands browse",
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
      handleUltraverifyCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(detailResult.kind).toBe("reply");
    if (detailResult.kind !== "reply") {
      throw new Error("Expected reply result.");
    }
    expect(detailResult.reply).toContain("Command: /browse");
    expect(detailResult.reply).toContain("Source: installed-user");
    expect(detailResult.reply).toContain("Allowed tools: Bash");
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
      handleUltraverifyCommand: async () => false,
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
      handleUltraverifyCommand: async () => false,
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

  it("surfaces WebFetch and WebSearch through /tools in the Electron shell", async () => {
    const result = await handleElectronPromptCommand({
      prompt: "/tools WebFetch",
      config: providerConfig,
      workspaceRoot: "E:\\repo",
      envMap: {},
      runtime: {},
      tools: [
        {
          name: "WebFetch",
          description: "Fetch content from a URL for an extraction prompt.",
          input_schema: { type: "object", properties: {} },
        },
        {
          name: "WebSearch",
          description: "Search the web for current information.",
          input_schema: { type: "object", properties: {} },
        },
      ],
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
      handleUltraverifyCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(result.kind).toBe("reply");
    if (result.kind !== "reply") {
      throw new Error("Expected reply result.");
    }
    expect(result.reply).toContain('Tools matching "WebFetch":');
    expect(result.reply).toContain("`WebFetch`");
    expect(result.reply).not.toContain("`WebSearch`");
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
      handleUltraverifyCommand: async () => false,
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
      handleUltraverifyCommand: async () => false,
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
      handleUltraverifyCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(result).toEqual({ kind: "handled" });
    expect(handleCompactCommand).toHaveBeenCalledTimes(1);
  });
});
