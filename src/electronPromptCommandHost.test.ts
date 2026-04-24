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
    });

    expect(result).toContain("Available slash commands in the Electron desktop shell:");
    expect(result).toContain("/commands");
    expect(result).not.toContain("/verify: Run the built-in verification agent against the current workspace state.");
    expect(result).toContain("Unavailable in this shell:");
  });

  it("returns an explicit desktop-shell reply for unsupported runtime commands", async () => {
    const result = await handleElectronPromptCommand({
      prompt: "/verify",
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
    });

    expect(result).toBe(
      "/verify is not yet wired into the Electron desktop shell. Use the VS Code host for this capability for now.",
    );
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
    });

    expect(result).toContain("MCP servers:");
    expect(result).toContain("github: connected");
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
    });

    expect(result).toBeNull();
  });
});
