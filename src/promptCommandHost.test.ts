import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveAutoMemorySuggestions } from "./autoMemory/paths";

import {
  handleLocalPromptCommand,
  handlePlanModePromptCommand,
  listRegisteredPromptSlashCommands,
  parsePromptSlashCommand,
  runPromptCommandChain,
} from "./promptCommandHost";

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
});

describe("promptCommandHost", () => {
  it("handles /effort and persists the next effort level when changed", async () => {
    const setEffortLevel = vi.fn(async () => undefined);

    const result = await handleLocalPromptCommand({
      prompt: "/effort high",
      config: providerConfig,
      currentEffortLevel: "low",
      setEffortLevel,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
    });

    expect(result).toBeTruthy();
    expect(setEffortLevel).toHaveBeenCalledTimes(1);
  });

  it("handles /fast and refreshes status when mode or model changes", async () => {
    const setFastMode = vi.fn(async () => undefined);
    const setActiveProviderModel = vi.fn(async () => undefined);
    const refreshWorkspaceStatus = vi.fn();

    const result = await handleLocalPromptCommand({
      prompt: "/fast on",
      config: providerConfig,
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode,
      setActiveProviderModel,
      refreshWorkspaceStatus,
    });

    expect(result).toBeTruthy();
    expect(refreshWorkspaceStatus).toHaveBeenCalledTimes(1);
    expect(setFastMode).toHaveBeenCalledTimes(1);
  });

  it("lists registered slash commands through /commands", async () => {
    const result = await handleLocalPromptCommand({
      prompt: "/commands",
      config: providerConfig,
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
    });

    expect(result).toContain("Available slash commands:");
    expect(result).toContain("/commands");
    expect(result).toContain("/agents");
    expect(result).toContain("/skills");
    expect(result).toContain("/hooks");
    expect(result).toContain("/effort");
    expect(result).toContain("/add-dir");
    expect(result).toContain("/files");
    expect(result).toContain("/mcp");
    expect(result).toContain("/memory");
    expect(result).toContain("/todo");
    expect(result).toContain("/tools");
    expect(result).toContain("/verify");
    expect(result).toContain("/ultrareview");
  });

  it("lists built-in agents through /agents", async () => {
    const result = await handleLocalPromptCommand({
      prompt: "/agents",
      config: providerConfig,
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
    });

    expect(result).toContain("Built-in agents:");
    expect(result).toContain("verification");
    expect(result).toContain("review");
  });

  it("lists custom agents from workspace config and shows custom agent detail", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-agents-"));
    tempDirs.push(workspaceRoot);
    const agentsConfigPath = path.join(workspaceRoot, ".cain", "agents.json");
    await fs.mkdir(path.dirname(agentsConfigPath), { recursive: true });
    await fs.writeFile(
      agentsConfigPath,
      JSON.stringify({
        agents: [
          {
            id: "ui-reviewer",
            name: "UI Reviewer",
            description: "Review UI polish and regressions.",
            tools: ["read_file", "search_files"],
            model: "inherit",
            color: "teal",
            memory: ["ui-guidelines.md"],
          },
        ],
      }),
      "utf8",
    );

    const listResult = await handleLocalPromptCommand({
      prompt: "/agents",
      config: providerConfig,
      workspaceRoot,
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
    });

    expect(listResult).toContain("Custom agents:");
    expect(listResult).toContain("ui-reviewer (UI Reviewer)");

    const detailResult = await handleLocalPromptCommand({
      prompt: "/agents ui-reviewer",
      config: providerConfig,
      workspaceRoot,
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
    });

    expect(detailResult).toContain("Source: custom");
    expect(detailResult).toContain("Tools: read_file, search_files");
    expect(detailResult).toContain("Config:");
  });

  it("lists built-in skills and resolves a skill detail through /skills", async () => {
    const listResult = await handleLocalPromptCommand({
      prompt: "/skills",
      config: providerConfig,
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
    });

    expect(listResult).toContain("Built-in skills:");
    expect(listResult).toContain("verify");
    expect(listResult).toContain("todo");

    const detailResult = await handleLocalPromptCommand({
      prompt: "/skills review",
      config: providerConfig,
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
    });

    expect(detailResult).toContain("Skill: Review");
    expect(detailResult).toContain("Entrypoint: /review");
  });

  it("lists custom skills from workspace config and shows custom skill detail", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-skills-"));
    tempDirs.push(workspaceRoot);
    const skillsConfigPath = path.join(workspaceRoot, ".cain", "skills.json");
    await fs.mkdir(path.dirname(skillsConfigPath), { recursive: true });
    await fs.writeFile(
      skillsConfigPath,
      JSON.stringify({
        skills: [
          {
            id: "frontend-review",
            title: "Frontend Review",
            summary: "Review UI polish and accessibility.",
            whenToUse: "When frontend work needs a second pass.",
            entrypoint: "/review frontend",
          },
        ],
      }),
      "utf8",
    );

    const listResult = await handleLocalPromptCommand({
      prompt: "/skills",
      config: providerConfig,
      workspaceRoot,
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
    });

    expect(listResult).toContain("Custom skills:");
    expect(listResult).toContain("frontend-review (Frontend Review)");

    const detailResult = await handleLocalPromptCommand({
      prompt: "/skills frontend-review",
      config: providerConfig,
      workspaceRoot,
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
    });

    expect(detailResult).toContain("Source: custom");
    expect(detailResult).toContain("Entrypoint: /review frontend");
    expect(detailResult).toContain("Config:");
  });

  it("lists workspace hooks and resolves hook detail through /hooks", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-hooks-"));
    tempDirs.push(workspaceRoot);
    const hooksConfigPath = path.join(workspaceRoot, ".cain", "hooks.json");
    await fs.mkdir(path.dirname(hooksConfigPath), { recursive: true });
    await fs.writeFile(
      hooksConfigPath,
      JSON.stringify({
        hooks: [
          {
            id: "post-review",
            name: "Post Review Webhook",
            type: "http",
            description: "Notify a webhook after review completes.",
            events: ["ReviewCompleted"],
            url: "https://hooks.example.com/review",
          },
        ],
      }),
      "utf8",
    );

    const listResult = await handleLocalPromptCommand({
      prompt: "/hooks",
      config: providerConfig,
      workspaceRoot,
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
    });

    expect(listResult).toContain("Hooks config:");
    expect(listResult).toContain("Configured hooks:");
    expect(listResult).toContain("post-review (http)");

    const detailResult = await handleLocalPromptCommand({
      prompt: "/hooks post-review",
      config: providerConfig,
      workspaceRoot,
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
    });

    expect(detailResult).toContain("Hook: Post Review Webhook");
    expect(detailResult).toContain("Type: http");
    expect(detailResult).toContain("URL: https://hooks.example.com/review");
  });

  it("adds a context directory through /add-dir and lists files through /files", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-context-"));
    tempDirs.push(workspaceRoot);
    await fs.mkdir(path.join(workspaceRoot, "docs"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "docs", "guide.md"), "# Guide\n", "utf8");
    await fs.writeFile(path.join(workspaceRoot, "README.md"), "# Readme\n", "utf8");

    const addDirResult = await handleLocalPromptCommand({
      prompt: "/add-dir docs",
      config: providerConfig,
      workspaceRoot,
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
    });

    expect(addDirResult).toContain("Added context directory: docs");
    expect(addDirResult).toContain("Tracked context directories:");

    const filesResult = await handleLocalPromptCommand({
      prompt: "/files guide",
      config: providerConfig,
      workspaceRoot,
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
    });

    expect(filesResult).toContain("Context directories: ., docs");
    expect(filesResult).toContain('Files matching "guide":');
    expect(filesResult).toContain("docs/guide.md");
  });

  it("pins and unpins context files through /files subcommands", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-context-files-"));
    tempDirs.push(workspaceRoot);
    await fs.mkdir(path.join(workspaceRoot, "docs"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "docs", "guide.md"), "# Guide\n", "utf8");

    const addResult = await handleLocalPromptCommand({
      prompt: "/files add docs/guide.md",
      config: providerConfig,
      workspaceRoot,
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
    });

    expect(addResult).toContain("Pinned context file: docs/guide.md");
    expect(addResult).toContain("Pinned files:");

    const pinnedResult = await handleLocalPromptCommand({
      prompt: "/files pinned",
      config: providerConfig,
      workspaceRoot,
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
    });

    expect(pinnedResult).toContain("Pinned files:");
    expect(pinnedResult).toContain("docs/guide.md");

    const removeResult = await handleLocalPromptCommand({
      prompt: "/files remove docs/guide.md",
      config: providerConfig,
      workspaceRoot,
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
    });

    expect(removeResult).toContain("Removed pinned context file: docs/guide.md");
    expect(removeResult).toContain("[no pinned files]");
  });

  it("lists supported hook types and events through /hooks subcommands", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-hooks-"));
    tempDirs.push(workspaceRoot);

    const typesResult = await handleLocalPromptCommand({
      prompt: "/hooks types",
      config: providerConfig,
      workspaceRoot,
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
    });

    expect(typesResult).toContain("Supported hook types:");
    expect(typesResult).toContain("command");
    expect(typesResult).toContain("required: command");

    const eventsResult = await handleLocalPromptCommand({
      prompt: "/hooks events",
      config: providerConfig,
      workspaceRoot,
      currentEffortLevel: "high",
      setEffortLevel: async () => undefined,
      currentFastMode: false,
      setFastMode: async () => undefined,
      setActiveProviderModel: async () => undefined,
      refreshWorkspaceStatus: () => undefined,
    });

    expect(eventsResult).toContain("Supported hook events:");
    expect(eventsResult).toContain("ToolUseFinished");
    expect(eventsResult).toContain("PromptCompleted");
  });

  it("handles /plan and /exitplan through tool execution", async () => {
    const runtime = {
      getToolContext: vi.fn(() => ({ mode: "main" })),
    };
    const executeToolImpl = vi.fn(async () => ({
      summary: "ok",
      content: "plan result",
    }));

    const result = await handlePlanModePromptCommand({
      prompt: "/plan",
      runtime,
      executeToolImpl: executeToolImpl as any,
    });

    expect(result).toBe("plan result");
    expect(executeToolImpl).toHaveBeenCalledWith(
      "EnterPlanMode",
      {},
      { mode: "main" },
    );
  });

  it("parses slash commands and exposes the registered catalog", () => {
    expect(parsePromptSlashCommand(" /Review   focus regressions ")).toEqual({
      name: "/review",
      args: "focus regressions",
    });
    expect(parsePromptSlashCommand("write code")).toBeNull();

    const commands = listRegisteredPromptSlashCommands();
    expect(commands.map(command => command.name)).toEqual([
      "/commands",
      "/effort",
      "/agents",
      "/skills",
      "/hooks",
      "/fast",
      "/add-dir",
      "/files",
      "/plan",
      "/exitplan",
      "/compact",
      "/mcp",
      "/memory",
      "/todo",
      "/tools",
      "/review",
      "/ultrareview",
      "/verify",
    ]);
  });

  it("returns a reply for local commands before checking later handlers", async () => {
    const tryHandlePlanModeCommand = vi.fn();

    const result = await runPromptCommandChain({
      prompt: "/effort high",
      config: providerConfig,
      workspaceRoot: "E:\\repo",
      envMap: {},
      runtime: {},
      tools: [],
      runtimeOptions: {},
      effortLevel: "high",
      tryHandleLocalCommand: async () => "local reply",
      tryHandlePlanModeCommand: tryHandlePlanModeCommand as any,
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(result).toEqual({
      kind: "reply",
      reply: "local reply",
    });
    expect(tryHandlePlanModeCommand).not.toHaveBeenCalled();
  });

  it("returns a reply for plan mode commands before command handlers", async () => {
    const handleCompactCommand = vi.fn();

    const result = await runPromptCommandChain({
      prompt: "/plan",
      config: providerConfig,
      workspaceRoot: "E:\\repo",
      envMap: {},
      runtime: {},
      tools: [],
      runtimeOptions: {},
      effortLevel: "high",
      tryHandleLocalCommand: async () => null,
      tryHandlePlanModeCommand: async () => "plan reply",
      handleCompactCommand: handleCompactCommand as any,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(result).toEqual({
      kind: "reply",
      reply: "plan reply",
    });
    expect(handleCompactCommand).not.toHaveBeenCalled();
  });

  it("short-circuits when a command handler consumes the prompt", async () => {
    const handleReviewCommand = vi.fn();
    const handleUltrareviewCommand = vi.fn();
    const handleVerificationCommand = vi.fn();

    const result = await runPromptCommandChain({
      prompt: "/compact",
      config: providerConfig,
      workspaceRoot: "E:\\repo",
      envMap: {},
      runtime: {},
      tools: [],
      runtimeOptions: {},
      effortLevel: "high",
      tryHandleLocalCommand: async () => null,
      tryHandlePlanModeCommand: async () => null,
      handleCompactCommand: async () => true,
      handleReviewCommand: handleReviewCommand as any,
      handleUltrareviewCommand: handleUltrareviewCommand as any,
      handleVerificationCommand: handleVerificationCommand as any,
    });

    expect(result).toEqual({ kind: "handled" });
    expect(handleReviewCommand).not.toHaveBeenCalled();
    expect(handleUltrareviewCommand).not.toHaveBeenCalled();
    expect(handleVerificationCommand).not.toHaveBeenCalled();
  });

  it("routes /ultrareview through the hosted review handler", async () => {
    const handleUltrareviewCommand = vi.fn(async () => true);

    const result = await runPromptCommandChain({
      prompt: "/ultrareview HEAD~2..HEAD",
      config: providerConfig,
      workspaceRoot: "E:\\repo",
      envMap: {},
      runtime: {},
      tools: [],
      runtimeOptions: {},
      effortLevel: "high",
      tryHandleLocalCommand: async () => null,
      tryHandlePlanModeCommand: async () => null,
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: handleUltrareviewCommand as any,
      handleVerificationCommand: async () => false,
    });

    expect(result).toEqual({ kind: "handled" });
    expect(handleUltrareviewCommand).toHaveBeenCalledTimes(1);
  });

  it("falls through to continue when no handlers consume the prompt", async () => {
    const result = await runPromptCommandChain({
      prompt: "write some code",
      config: providerConfig,
      workspaceRoot: "E:\\repo",
      envMap: {},
      runtime: {},
      tools: [],
      runtimeOptions: {},
      effortLevel: "high",
      tryHandleLocalCommand: async () => null,
      tryHandlePlanModeCommand: async () => null,
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(result).toEqual({ kind: "continue" });
  });

  it("returns runtime replies for /mcp and /memory", async () => {
    const mcpResult = await runPromptCommandChain({
      prompt: "/mcp",
      config: providerConfig,
      workspaceRoot: "E:\\repo",
      envMap: {},
      runtime: {
        async getMcpStatusSummary() {
          return [
            {
              name: "github",
              state: "connected",
              transport: "stdio",
              toolCount: 5,
            },
          ];
        },
      },
      tools: [],
      runtimeOptions: {},
      effortLevel: "high",
      tryHandleLocalCommand: async () => null,
      tryHandlePlanModeCommand: async () => null,
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(mcpResult.kind).toBe("reply");
    if (mcpResult.kind === "reply") {
      expect(mcpResult.reply).toContain("MCP servers:");
      expect(mcpResult.reply).toContain("github: connected");
    }

    const mcpPromptsResult = await runPromptCommandChain({
      prompt: "/mcp prompts",
      config: providerConfig,
      workspaceRoot: "E:\\repo",
      envMap: {},
      runtime: {
        async getMcpStatusSummary() {
          return [];
        },
        async getMcpPromptCommands() {
          return [
            {
              name: "/mcp__github__summarize_issue",
              description: "Summarize an issue with recent comments.",
              argNames: ["issue"],
              userFacingName: "github:summarize_issue (MCP)",
            },
          ];
        },
      },
      tools: [],
      runtimeOptions: {},
      effortLevel: "high",
      tryHandleLocalCommand: async () => null,
      tryHandlePlanModeCommand: async () => null,
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(mcpPromptsResult.kind).toBe("reply");
    if (mcpPromptsResult.kind === "reply") {
      expect(mcpPromptsResult.reply).toContain("MCP prompt commands:");
      expect(mcpPromptsResult.reply).toContain("`/mcp__github__summarize_issue` <issue>");
    }

    const mcpAuthResult = await runPromptCommandChain({
      prompt: "/mcp auth notion",
      config: providerConfig,
      workspaceRoot: "E:\\repo",
      envMap: {},
      runtime: {
        getToolContext: () => ({
          workspaceRoot: "E:\\repo",
          invokerKind: "main",
          mcp: {
            executeTool: async (name: string) => ({
              summary: `Authenticate ${name}`,
              content: "Authentication completed for notion.",
            }),
          },
        }),
        async getMcpStatusSummary() {
          return [];
        },
      },
      tools: [
        {
          name: "mcp__notion__authenticate",
          description: "Authenticate notion",
          input_schema: {
            type: "object",
            properties: {},
          },
        },
      ],
      runtimeOptions: {},
      effortLevel: "high",
      tryHandleLocalCommand: async () => null,
      tryHandlePlanModeCommand: async () => null,
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(mcpAuthResult.kind).toBe("reply");
    if (mcpAuthResult.kind === "reply") {
      expect(mcpAuthResult.reply).toContain("Authentication completed for notion.");
    }

    const mcpCallResult = await runPromptCommandChain({
      prompt: "/mcp call mcp__notion__notion-get-users {\"page_size\":5}",
      config: providerConfig,
      workspaceRoot: "E:\\repo",
      envMap: {},
      runtime: {
        getToolContext: () => ({
          workspaceRoot: "E:\\repo",
          invokerKind: "main",
          mcp: {
            executeTool: async (_name: string, input: Record<string, unknown>) => ({
              summary: "Fetched users",
              content: JSON.stringify(input),
            }),
          },
        }),
        async getMcpStatusSummary() {
          return [];
        },
      },
      tools: [
        {
          name: "mcp__notion__notion-get-users",
          description: "Get users",
          input_schema: {
            type: "object",
            properties: {
              page_size: {
                type: "number",
                description: "Page size",
              },
            },
          },
        },
      ],
      runtimeOptions: {},
      effortLevel: "high",
      tryHandleLocalCommand: async () => null,
      tryHandlePlanModeCommand: async () => null,
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(mcpCallResult.kind).toBe("reply");
    if (mcpCallResult.kind === "reply") {
      expect(mcpCallResult.reply).toContain('"page_size":5');
    }

    const memoryResult = await runPromptCommandChain({
      prompt: "/memory",
      config: providerConfig,
      workspaceRoot: "E:\\repo",
      envMap: {},
      runtime: {},
      tools: [],
      runtimeOptions: {},
      effortLevel: "high",
      tryHandleLocalCommand: async () => null,
      tryHandlePlanModeCommand: async () => null,
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(memoryResult.kind).toBe("reply");
    if (memoryResult.kind === "reply") {
      expect(memoryResult.reply).toContain("Auto-memory directory:");
      expect(memoryResult.reply).toContain("MEMORY.md excerpt:");
      expect(memoryResult.reply).toContain("Indexed memory entries:");
    }
  });

  it("filters memory entries by type and shows memory entry detail", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-memory-"));
    tempDirs.push(workspaceRoot);
    await saveAutoMemorySuggestions(workspaceRoot, [
      {
        slug: "team-style.md",
        name: "Team Style",
        description: "How to work with this team",
        type: "feedback",
        hook: "Use short progress updates",
        body: "Why: The team prefers concise updates.\nHow to apply: Keep status messages short.",
      },
    ]);

    const filteredResult = await runPromptCommandChain({
      prompt: "/memory feedback",
      config: providerConfig,
      workspaceRoot,
      envMap: {},
      runtime: {},
      tools: [],
      runtimeOptions: {},
      effortLevel: "high",
      tryHandleLocalCommand: async () => null,
      tryHandlePlanModeCommand: async () => null,
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(filteredResult.kind).toBe("reply");
    if (filteredResult.kind === "reply") {
      expect(filteredResult.reply).toContain('Memory entries of type "feedback":');
      expect(filteredResult.reply).toContain("team-style.md | feedback | Team Style");
    }

    const detailResult = await runPromptCommandChain({
      prompt: "/memory team-style",
      config: providerConfig,
      workspaceRoot,
      envMap: {},
      runtime: {},
      tools: [],
      runtimeOptions: {},
      effortLevel: "high",
      tryHandleLocalCommand: async () => null,
      tryHandlePlanModeCommand: async () => null,
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(detailResult.kind).toBe("reply");
    if (detailResult.kind === "reply") {
      expect(detailResult.reply).toContain("Memory: Team Style");
      expect(detailResult.reply).toContain("Type: feedback");
      expect(detailResult.reply).toContain("Why: The team prefers concise updates.");
    }
  });

  it("returns runtime replies for /tools using the current runtime tool set", async () => {
    const result = await runPromptCommandChain({
      prompt: "/tools review",
      config: providerConfig,
      workspaceRoot: "E:\\repo",
      envMap: {},
      runtime: {},
      tools: [
        {
          name: "RunReview",
          description: "Run the built-in review agent.",
          input_schema: { type: "object", properties: {} },
        },
        {
          name: "RunVerification",
          description: "Run the built-in verification agent.",
          input_schema: { type: "object", properties: {} },
        },
      ],
      runtimeOptions: {},
      effortLevel: "high",
      tryHandleLocalCommand: async () => null,
      tryHandlePlanModeCommand: async () => null,
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(result.kind).toBe("reply");
    if (result.kind === "reply") {
      expect(result.reply).toContain('Tools matching "review":');
      expect(result.reply).toContain("RunReview");
      expect(result.reply).not.toContain("RunVerification");
    }
  });

  it("returns runtime replies for /todo by reusing TaskList", async () => {
    const result = await runPromptCommandChain({
      prompt: "/todo pending",
      config: providerConfig,
      workspaceRoot: "E:\\repo",
      envMap: {},
      runtime: {
        getToolContext: () => ({
          workspaceRoot: "E:\\repo",
          tasks: {
            async listTasks() {
              return [
                {
                  id: "1",
                  subject: "plan release",
                  description: "plan release",
                  status: "pending",
                  blocks: [],
                  blockedBy: [],
                },
                {
                  id: "2",
                  subject: "verify release",
                  description: "verify release",
                  status: "completed",
                  blocks: [],
                  blockedBy: [],
                },
              ];
            },
            async listBackgroundTasks() {
              return [];
            },
          },
        }),
      },
      tools: [],
      runtimeOptions: {},
      effortLevel: "high",
      tryHandleLocalCommand: async () => null,
      tryHandlePlanModeCommand: async () => null,
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(result.kind).toBe("reply");
    if (result.kind === "reply") {
      expect(result.reply).toContain("TaskList filters: kind=structured, status=pending");
      expect(result.reply).toContain("plan release");
      expect(result.reply).not.toContain("verify release");
    }
  });

  it("rewrites MCP prompt commands into prompt content plus attachments", async () => {
    const result = await runPromptCommandChain({
      prompt: "/mcp__github__summarize_issue 123",
      config: providerConfig,
      workspaceRoot: "E:\\repo",
      envMap: {},
      runtime: {
        async getMcpPromptCommands() {
          return [
            {
              name: "/mcp__github__summarize_issue",
              description: "Summarize issue",
              argNames: ["issue"],
              userFacingName: "github:summarize_issue (MCP)",
            },
          ];
        },
        async executeMcpPromptCommand() {
          return {
            content: "Summarize GitHub issue 123 and include the latest comments.",
            attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
          };
        },
      },
      tools: [],
      runtimeOptions: {},
      effortLevel: "high",
      tryHandleLocalCommand: async () => null,
      tryHandlePlanModeCommand: async () => null,
      handleCompactCommand: async () => false,
      handleReviewCommand: async () => false,
      handleUltrareviewCommand: async () => false,
      handleVerificationCommand: async () => false,
    });

    expect(result).toEqual({
      kind: "rewrite",
      prompt: "Summarize GitHub issue 123 and include the latest comments.",
      attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
    });
  });
});
