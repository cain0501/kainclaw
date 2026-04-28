import type { ProviderConfig as AdapterProviderConfig } from "./agent/providers/IProviderAdapter";
import type { NormalizedImageAttachment } from "./agent/providers/IProviderAdapter";
import { getBuiltInAgents } from "./agent/builtInAgents";
import {
  getCustomAgent,
  getCustomAgentsConfigPath,
  loadCustomAgents,
} from "./customAgentsRegistry";
import {
  getHook,
  getHooksConfigPath,
  listSupportedHookEvents,
  listSupportedHookTypes,
  loadHooks,
} from "./hooksRegistry";
import {
  findMemoryManifestEntry,
  formatMemoryManifest,
  getAutoMemoryDir,
  readAutoMemoryEntry,
  readAutoMemoryEntrypoint,
  scanAutoMemoryManifest,
} from "./autoMemory/paths";
import {
  addContextDirectory,
  addContextFile,
  listContextFiles,
  removeContextFile,
} from "./contextRegistry";
import {
  getCustomSkill,
  getCustomSkillsConfigPath,
  loadCustomSkills,
} from "./customSkillsRegistry";
import {
  buildInstalledSkillExecutionPlan,
  formatInstalledSkillCommandDetail,
  getInstalledSkill,
  getInstalledSkillByEntrypoint,
  loadInstalledSkills,
  type InstalledSkillExecutionPlan,
} from "./installedSkillsRegistry";
import { getBuiltInSkill, listBuiltInSkills } from "./skillsRegistry";
import type { SkillStore } from "./skills/skillStore";
import type { ProfileStore } from "./userModel/profileStore";
import type { ToolDefinition } from "./toolRuntime";
import type { HookDefinition } from "./hooksRegistry";
import { executeTool, formatToolSearchResults, searchToolDefinitions } from "./toolRuntime";
import { executeEffortCommand } from "./thinkingEffort/effort";
import { executeFastModeCommand } from "./thinkingEffort/fastMode";
import type { EffortLevel, ProviderRuntimeOptions } from "./thinkingEffort/types";

type RuntimeLike = {
  getToolContext?(mode?: string): unknown;
  getMcpStatusSummary?(): Promise<
    Array<{
      name: string;
      state: string;
      transport: string;
      toolCount: number;
      error?: string;
    }>
  >;
  getMcpPromptCommands?(): Promise<
    Array<{
      name: string;
      description: string;
      argNames: string[];
      userFacingName: string;
    }>
  >;
  executeMcpPromptCommand?(
    commandName: string,
    args: string,
  ): Promise<{
    content: string;
    attachments?: NormalizedImageAttachment[];
  }>;
};

export type RegisteredPromptSlashCommand = {
  name: string;
  description: string;
  stage: "local" | "runtime";
};

type PromptCommandChainResult =
  | { kind: "continue" }
  | { kind: "reply"; reply: string }
  | {
      kind: "rewrite";
      prompt: string;
      attachments?: NormalizedImageAttachment[];
      allowedTools?: string[];
      modelOverride?: string;
      effortOverride?: EffortLevel;
      disableModelInvocation?: boolean;
      executionContext?: "fork";
      installedSkillHooks?: HookDefinition[];
      installedSkillExecution?: InstalledSkillExecutionPlan;
    }
  | { kind: "handled" };

type ParsedPromptSlashCommand = {
  name: string;
  args: string;
};

const REGISTERED_PROMPT_SLASH_COMMANDS: RegisteredPromptSlashCommand[] = [
  {
    name: "/commands",
    description: "List built-in slash commands currently available in the VS Code shell.",
    stage: "local",
  },
  {
    name: "/effort",
    description: "Inspect or change the current reasoning effort level.",
    stage: "local",
  },
  {
    name: "/agents",
    description: "List built-in agents currently available in this shell.",
    stage: "local",
  },
  {
    name: "/skills",
    description: "List built-in skills available in this shell, or inspect one by id.",
    stage: "local",
  },
  {
    name: "/hooks",
    description: "List workspace hooks, or inspect one hook by id.",
    stage: "local",
  },
  {
    name: "/fast",
    description: "Inspect or toggle fast mode for the active provider.",
    stage: "local",
  },
  {
    name: "/add-dir",
    description: "Add a workspace-relative directory to the current context registry.",
    stage: "local",
  },
  {
    name: "/files",
    description: "List files from the current context registry, optionally filtered by query.",
    stage: "local",
  },
  {
    name: "/plan",
    description: "Enter plan mode and open the editable plan file.",
    stage: "runtime",
  },
  {
    name: "/exitplan",
    description: "Exit plan mode after the plan is approved.",
    stage: "runtime",
  },
  {
    name: "/compact",
    description: "Compact earlier conversation context into a continuation summary.",
    stage: "runtime",
  },
  {
    name: "/mcp",
    description: "List MCP server status, use `/mcp prompts` to inspect MCP prompt commands, or `/mcp auth <server>` to start MCP OAuth.",
    stage: "runtime",
  },
  {
    name: "/memory",
    description: "Inspect the current workspace auto-memory location and manifest.",
    stage: "runtime",
  },
  {
    name: "/todo",
    description: "List structured TODO tasks in the current conversation.",
    stage: "runtime",
  },
  {
    name: "/tools",
    description: "Search currently available tools in the active workspace runtime.",
    stage: "runtime",
  },
  {
    name: "/review",
    description: "Run the built-in review agent against current workspace changes.",
    stage: "runtime",
  },
  {
    name: "/ultrareview",
    description: "Launch a hosted review task via Claude CLI and receive findings through task notification.",
    stage: "runtime",
  },
  {
    name: "/ultraverify",
    description: "Launch a hosted verification task via Claude CLI and receive the verification report through task notification.",
    stage: "runtime",
  },
  {
    name: "/verify",
    description: "Run the built-in verification agent against the current workspace state.",
    stage: "runtime",
  },
];

export function listRegisteredPromptSlashCommands(): RegisteredPromptSlashCommand[] {
  return [...REGISTERED_PROMPT_SLASH_COMMANDS];
}

export function parsePromptSlashCommand(
  prompt: string,
): ParsedPromptSlashCommand | null {
  const trimmed = prompt.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const [command, ...argParts] = trimmed.split(/\s+/);
  return {
    name: command.toLowerCase(),
    args: argParts.join(" "),
  };
}

function normalizeSlashCommandLookup(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

async function buildPromptSlashCommandHelp(options: {
  args: string;
  workspaceRoot?: string;
}): Promise<string> {
  const normalizedArgs = normalizeSlashCommandLookup(options.args);
  const installedSkills = await loadInstalledSkills(options.workspaceRoot);

  if (normalizedArgs) {
    const registeredCommand = REGISTERED_PROMPT_SLASH_COMMANDS.find(
      command => command.name === normalizedArgs,
    );
    if (registeredCommand) {
      return [
        `Command: ${registeredCommand.name}`,
        `Stage: ${registeredCommand.stage}`,
        "Source: built-in",
        `Description: ${registeredCommand.description}`,
      ].join("\n");
    }

    const installedSkill = getInstalledSkillByEntrypoint(
      installedSkills,
      normalizedArgs,
    );
    if (installedSkill) {
      return formatInstalledSkillCommandDetail(installedSkill, "command");
    }

    return `Unknown slash command "${normalizedArgs}". Use /commands to list available commands.`;
  }

  const localCommands = REGISTERED_PROMPT_SLASH_COMMANDS.filter(
    command => command.stage === "local",
  );
  const runtimeCommands = REGISTERED_PROMPT_SLASH_COMMANDS.filter(
    command => command.stage === "runtime",
  );

  const lines = [
    "Available slash commands:",
    "",
    "Local commands:",
    ...localCommands.map(command => `- ${command.name}: ${command.description}`),
    "",
    "Workspace/runtime commands:",
    ...runtimeCommands.map(command => `- ${command.name}: ${command.description}`),
  ];

  if (installedSkills.length > 0) {
    lines.push("");
    lines.push("Installed skill commands:");
    lines.push(
      ...installedSkills.map(
        skill =>
          `- ${skill.entrypoint}: ${skill.summary} [installed-${skill.source}]`,
      ),
    );
  }

  return lines.join("\n");
}

async function buildBuiltInAgentHelp(
  args: string,
  workspaceRoot?: string,
): Promise<string> {
  const agents = getBuiltInAgents();
  const normalizedArgs = args.trim().toLowerCase();
  const customAgents = workspaceRoot
    ? await loadCustomAgents(workspaceRoot)
    : [];

  if (normalizedArgs) {
    const builtInAgent = agents.find(agent => agent.agentType === normalizedArgs);
    if (builtInAgent) {
      return [
        `Agent: ${builtInAgent.agentType}`,
        "Source: built-in",
        `When to use: ${builtInAgent.whenToUse}`,
        `Background: ${builtInAgent.background ? "yes" : "no"}`,
        `Color: ${builtInAgent.color ?? "none"}`,
      ].join("\n");
    }

    const customAgent = getCustomAgent(customAgents, normalizedArgs);
    if (customAgent) {
      return [
        `Agent: ${customAgent.name}`,
        `Id: ${customAgent.id}`,
        "Source: custom",
        `Description: ${customAgent.description}`,
        `Tools: ${customAgent.tools.join(", ") || "[none]"}`,
        `Model: ${customAgent.model ?? "inherit"}`,
        `Color: ${customAgent.color ?? "none"}`,
        `Memory: ${customAgent.memory?.join(", ") ?? "[none]"}`,
        `Config: ${workspaceRoot ? getCustomAgentsConfigPath(workspaceRoot) : "[unknown]"}`,
      ].join("\n");
    }

    return `Unknown agent "${normalizedArgs}". Use /agents to list available agents.`;
  }

  const lines = [
    "Built-in agents:",
    ...agents.map(agent => {
      const details = [
        agent.agentType,
        agent.background ? "background" : "foreground",
        agent.color ?? "no-color",
      ].join(" | ");
      return `- ${details}: ${agent.whenToUse}`;
    }),
  ];

  if (customAgents.length > 0) {
    lines.push("");
    lines.push("Custom agents:");
    lines.push(
      ...customAgents.map(
        agent =>
          `- ${agent.id} (${agent.name}): ${agent.description} | tools ${agent.tools.length}`,
      ),
    );
  }

  return lines.join("\n");
}

async function buildSkillsHelp(
  args: string,
  workspaceRoot?: string,
  skillStore?: SkillStore,
): Promise<string> {
  const normalizedArgs = args.trim().toLowerCase();
  const customSkills = workspaceRoot
    ? await loadCustomSkills(workspaceRoot)
    : [];
  const installedSkills = await loadInstalledSkills(workspaceRoot);
  const userSkills = skillStore ? await skillStore.list() : [];

  if (!normalizedArgs) {
    const lines = [
      "Built-in skills:",
      ...listBuiltInSkills().map(
        skill => `- ${skill.id}: ${skill.summary} (entrypoint: ${skill.entrypoint})`,
      ),
    ];

    if (installedSkills.length > 0) {
      lines.push("");
      lines.push("Installed skills:");
      lines.push(
        ...installedSkills.map(skill => {
          const source = skill.source === "project" ? "project" : "user";
          return `- ${skill.id} (${skill.title}): ${skill.summary} [${source}] (entrypoint: ${skill.entrypoint})`;
        }),
      );
    }

    if (customSkills.length > 0) {
      lines.push("");
      lines.push("Custom skills:");
      lines.push(
        ...customSkills.map(
          skill => `- ${skill.id} (${skill.title}): ${skill.summary} (entrypoint: ${skill.entrypoint})`,
        ),
      );
    }

    if (userSkills.length > 0) {
      lines.push("");
      lines.push(`--- User Skills (${userSkills.length}) ---`);
      lines.push(
        ...userSkills.map(skill => {
          const prefix = skill.category ? `[${skill.category}] ` : "";
          return `@${prefix}${skill.name}  ${skill.description || "(no description)"}`;
        }),
      );
    }

    return lines.join("\n");
  }

  const builtInSkill = getBuiltInSkill(normalizedArgs);
  if (builtInSkill) {
    return [
      `Skill: ${builtInSkill.title}`,
      `Id: ${builtInSkill.id}`,
      "Source: built-in",
      `Summary: ${builtInSkill.summary}`,
      `When to use: ${builtInSkill.whenToUse}`,
      `Entrypoint: ${builtInSkill.entrypoint}`,
    ].join("\n");
  }

  const installedSkill = getInstalledSkill(installedSkills, normalizedArgs);
  if (installedSkill) {
    return formatInstalledSkillCommandDetail(installedSkill, "skill");
  }

  const customSkill = getCustomSkill(customSkills, normalizedArgs);
  if (customSkill) {
    return [
      `Skill: ${customSkill.title}`,
      `Id: ${customSkill.id}`,
      "Source: custom",
      `Summary: ${customSkill.summary}`,
      `When to use: ${customSkill.whenToUse}`,
      `Entrypoint: ${customSkill.entrypoint}`,
      `Config: ${workspaceRoot ? getCustomSkillsConfigPath(workspaceRoot) : "[unknown]"}`,
    ].join("\n");
  }

  const userSkill = userSkills.find(s => s.name === normalizedArgs);
  if (userSkill) {
    return [
      `Skill: ${userSkill.name}`,
      `Id: ${userSkill.name}`,
      "Source: user",
      `Description: ${userSkill.description || "(none)"}`,
      `Tags: ${userSkill.tags.join(", ") || "(none)"}`,
      `Category: ${userSkill.category ?? "(root)"}`,
      `Created: ${userSkill.createdAt}`,
    ].join("\n");
  }

  return `Unknown skill "${normalizedArgs}". Use /skills to list available skills.`;
}

async function buildHooksHelp(
  args: string,
  workspaceRoot?: string,
): Promise<string> {
  if (!workspaceRoot) {
    return "Hooks are unavailable because no workspace root is active.";
  }

  const hooks = await loadHooks(workspaceRoot);
  const normalizedArgs = args.trim().toLowerCase();

  if (normalizedArgs === "types") {
    return [
      "Supported hook types:",
      ...listSupportedHookTypes().map(
        hookType =>
          `- ${hookType.id}: ${hookType.summary} (required: ${hookType.requiredField})`,
      ),
    ].join("\n");
  }

  if (normalizedArgs === "events") {
    return [
      "Supported hook events:",
      ...listSupportedHookEvents().map(
        event => `- ${event.id}: ${event.summary}`,
      ),
    ].join("\n");
  }

  if (!normalizedArgs) {
    return [
      `Hooks config: ${getHooksConfigPath(workspaceRoot)}`,
      hooks.length > 0 ? "" : "No hooks are currently configured.",
      ...(hooks.length > 0
        ? [
            "Configured hooks:",
            ...hooks.map(
              hook =>
                `- ${hook.id} (${hook.type}): ${hook.description} | events ${hook.events.join(", ")}`,
            ),
          ]
        : []),
    ]
      .filter(Boolean)
      .join("\n");
  }

  const hook = getHook(hooks, normalizedArgs);
  if (!hook) {
    return `Unknown hook "${normalizedArgs}". Use /hooks to list configured hooks.`;
  }

  return [
    `Hook: ${hook.name}`,
    `Id: ${hook.id}`,
    `Type: ${hook.type}`,
    `Description: ${hook.description}`,
    `Events: ${hook.events.join(", ")}`,
    `Command: ${hook.command ?? "[none]"}`,
    `URL: ${hook.url ?? "[none]"}`,
    `Prompt: ${hook.prompt ?? "[none]"}`,
    `Agent: ${hook.agentId ?? "[none]"}`,
    `Timeout: ${hook.timeoutMs ?? "[default]"}`,
    `Config: ${getHooksConfigPath(workspaceRoot)}`,
  ].join("\n");
}

async function buildAddDirReply(
  workspaceRoot: string | undefined,
  args: string,
): Promise<string> {
  if (!workspaceRoot) {
    return "Context directory management is unavailable because no workspace root is active.";
  }

  const targetPath = args.trim();
  if (!targetPath) {
    return "Usage: `/add-dir <workspace-relative-directory>`";
  }

  const result = await addContextDirectory(workspaceRoot, targetPath);
  return [
    result.added
      ? `Added context directory: ${result.relativePath}`
      : `Context directory already tracked: ${result.relativePath}`,
    "",
    "Tracked context directories:",
    ...result.extraDirectories.map(directory => `- ${directory}`),
  ].join("\n");
}

async function buildFilesReply(
  workspaceRoot: string | undefined,
  args: string,
): Promise<string> {
  if (!workspaceRoot) {
    return "Context file listing is unavailable because no workspace root is active.";
  }

  const trimmedArgs = args.trim();
  const addMatch = trimmedArgs.match(/^add\s+(.+)$/i);
  if (addMatch) {
    const result = await addContextFile(workspaceRoot, addMatch[1]!.trim());
    return [
      result.added
        ? `Pinned context file: ${result.relativePath}`
        : `Context file already pinned: ${result.relativePath}`,
      "",
      "Pinned files:",
      ...(result.pinnedFiles.length > 0
        ? result.pinnedFiles.map(file => `- ${file}`)
        : ["[no pinned files]"]),
    ].join("\n");
  }

  const removeMatch = trimmedArgs.match(/^remove\s+(.+)$/i);
  if (removeMatch) {
    const result = await removeContextFile(workspaceRoot, removeMatch[1]!.trim());
    return [
      result.removed
        ? `Removed pinned context file: ${result.relativePath}`
        : `Context file was not pinned: ${result.relativePath}`,
      "",
      "Pinned files:",
      ...(result.pinnedFiles.length > 0
        ? result.pinnedFiles.map(file => `- ${file}`)
        : ["[no pinned files]"]),
    ].join("\n");
  }

  const query = trimmedArgs === "pinned" ? "" : trimmedArgs;
  const result = await listContextFiles({
    workspaceRoot,
    ...(query ? { query } : {}),
  });

  if (trimmedArgs === "pinned") {
    return [
      `Context directories: ${result.scannedDirectories.join(", ")}`,
      "",
      "Pinned files:",
      ...(result.pinnedFiles.length > 0
        ? result.pinnedFiles.map(file => `- ${file}`)
        : ["[no pinned files]"]),
    ].join("\n");
  }

  return [
    `Context directories: ${result.scannedDirectories.join(", ")}`,
    "",
    ...(result.pinnedFiles.length > 0
      ? ["Pinned files:", ...result.pinnedFiles.map(file => `- ${file}`), ""]
      : []),
    query ? `Files matching "${query}":` : "Files in context:",
    ...(result.files.length > 0 ? result.files.map(file => `- ${file}`) : ["[no matching files]"]),
    ...(result.truncated ? ["", "[truncated to first 50 files]"] : []),
  ].join("\n");
}

async function buildMemoryCommandReply(workspaceRoot: string): Promise<string> {
  const memoryDir = getAutoMemoryDir(workspaceRoot);
  const entrypoint = await readAutoMemoryEntrypoint(workspaceRoot);
  const manifest = await scanAutoMemoryManifest(workspaceRoot);
  const manifestText = formatMemoryManifest(manifest);

  return [
    `Auto-memory directory: ${memoryDir}`,
    "",
    "MEMORY.md excerpt:",
    entrypoint || "[empty]",
    "",
    "Indexed memory entries:",
    manifestText || "[no memory entries found]",
  ].join("\n");
}

async function buildProfileCommandReply(
  profileStore: ProfileStore,
  args: string,
): Promise<string> {
  const normalizedArgs = args.trim().toLowerCase();

  if (normalizedArgs === "clear") {
    await profileStore.clear();
    return "User profile cleared. Distillation will restart from the next qualifying conversation.";
  }

  const content = await profileStore.load();
  if (!content) {
    return "No user profile found. It will be created after a qualifying conversation (≥20 turns).";
  }

  return [`User profile:`, "", content].join("\n");
}

async function buildMemoryCommandReplyWithArgs(
  workspaceRoot: string,
  args: string,
  profileStore?: ProfileStore,
): Promise<string> {
  const normalizedArgs = args.trim();
  if (!normalizedArgs) {
    return buildMemoryCommandReply(workspaceRoot);
  }

  if (normalizedArgs.toLowerCase() === "profile" || normalizedArgs.toLowerCase().startsWith("profile ")) {
    if (!profileStore) {
      return "User modeling is not configured.";
    }
    const profileArgs = normalizedArgs.slice("profile".length).trim();
    return buildProfileCommandReply(profileStore, profileArgs);
  }

  const normalizedType = normalizedArgs.toLowerCase();
  if (
    normalizedType === "user" ||
    normalizedType === "feedback" ||
    normalizedType === "project" ||
    normalizedType === "reference"
  ) {
    const manifest = await scanAutoMemoryManifest(workspaceRoot);
    const filtered = manifest.filter(entry => entry.type.toLowerCase() === normalizedType);

    return [
      `Auto-memory directory: ${getAutoMemoryDir(workspaceRoot)}`,
      "",
      `Memory entries of type "${normalizedType}":`,
      formatMemoryManifest(filtered) || "[no matching memory entries]",
    ].join("\n");
  }

  const entry = await readAutoMemoryEntry(workspaceRoot, normalizedArgs);
  if (!entry) {
    const manifest = await scanAutoMemoryManifest(workspaceRoot);
    const knownEntry = findMemoryManifestEntry(manifest, normalizedArgs);
    if (!knownEntry) {
      return `Unknown memory entry or type "${normalizedArgs}". Use /memory to list entries.`;
    }
  }

  return [
    `Memory: ${entry!.name}`,
    `Path: ${entry!.relativePath}`,
    `Type: ${entry!.type}`,
    `Description: ${entry!.description || "[none]"}`,
    "",
    entry!.body || "[empty memory body]",
  ].join("\n");
}

async function buildMcpCommandReply(runtime: RuntimeLike): Promise<string> {
  if (typeof runtime.getMcpStatusSummary !== "function") {
    return "MCP runtime is not available in the current workspace runtime.";
  }

  const statuses = await runtime.getMcpStatusSummary();
  if (statuses.length === 0) {
    return "No MCP servers are currently configured.";
  }

  return [
    "MCP servers:",
    ...statuses.map(status =>
      `- ${status.name}: ${status.state} | ${status.transport} | ${status.toolCount} tool(s)` +
      (status.error ? ` | ${status.error}` : ""),
    ),
  ].join("\n");
}

async function runMcpAuthCommand(
  runtime: RuntimeLike,
  tools: ToolDefinition[],
  serverName: string,
): Promise<string> {
  const normalizedServerName = serverName.trim().toLowerCase();
  if (!normalizedServerName) {
    return "Usage: `/mcp auth <server>`";
  }

  const authTool = tools.find(tool =>
    tool.name.toLowerCase() === `mcp__${normalizedServerName}__authenticate`,
  );

  if (!authTool) {
    return `MCP auth tool for "${serverName}" is not available. Run /tools ${serverName} to inspect the current MCP tool list.`;
  }

  const toolContext = runtime.getToolContext?.("main");
  if (!toolContext) {
    return "MCP runtime is not available in the current workspace runtime.";
  }

  const result = await executeTool(authTool.name, {}, toolContext as any);
  return result.content;
}

async function runMcpCallCommand(
  runtime: RuntimeLike,
  tools: ToolDefinition[],
  args: string,
): Promise<string> {
  const trimmedArgs = args.trim();
  if (!trimmedArgs) {
    return "Usage: `/mcp call <tool_name> [json_input]`";
  }

  const firstSpaceIndex = trimmedArgs.indexOf(" ");
  const toolName = firstSpaceIndex === -1
    ? trimmedArgs
    : trimmedArgs.slice(0, firstSpaceIndex).trim();
  const rawInput = firstSpaceIndex === -1
    ? ""
    : trimmedArgs.slice(firstSpaceIndex + 1).trim();

  if (!toolName) {
    return "Usage: `/mcp call <tool_name> [json_input]`";
  }

  const tool = tools.find(candidate => candidate.name === toolName);
  if (!tool) {
    return `Tool "${toolName}" is not available. Run /tools to inspect the current tool list.`;
  }

  let parsedInput: Record<string, unknown> = {};
  if (rawInput) {
    try {
      const parsed = JSON.parse(rawInput);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return "MCP tool input must be a JSON object. Example: `/mcp call mcp__notion__notion-get-users {\"page_size\":5}`";
      }
      parsedInput = parsed as Record<string, unknown>;
    } catch (error) {
      return `Failed to parse MCP tool JSON input: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  const toolContext = runtime.getToolContext?.("main");
  if (!toolContext) {
    return "MCP runtime is not available in the current workspace runtime.";
  }

  const result = await executeTool(tool.name, parsedInput, toolContext as any);
  return result.content;
}

async function buildMcpPromptCommandReply(
  runtime: RuntimeLike,
  args: string,
): Promise<string> {
  if (typeof runtime.getMcpPromptCommands !== "function") {
    return "MCP runtime is not available in the current workspace runtime.";
  }

  const query = args.trim().toLowerCase();
  const commands = await runtime.getMcpPromptCommands();
  const filtered = query
    ? commands.filter(command =>
        command.name.toLowerCase().includes(query) ||
        command.userFacingName.toLowerCase().includes(query) ||
        command.description.toLowerCase().includes(query),
      )
    : commands;

  if (filtered.length === 0) {
    return query
      ? `No MCP prompt commands matched "${query}".`
      : "No MCP prompt commands are currently available.";
  }

  return [
    query
      ? `MCP prompt commands matching "${query}":`
      : "MCP prompt commands:",
    ...filtered.map(command =>
      `- \`${command.name}\`` +
      (command.argNames.length > 0
        ? ` ${command.argNames.map(name => `<${name}>`).join(" ")}`
        : "") +
      `: ${command.description || command.userFacingName}`,
    ),
  ].join("\n");
}

async function tryRewriteMcpPromptCommand(
  runtime: RuntimeLike,
  parsedCommand: ParsedPromptSlashCommand,
): Promise<Extract<PromptCommandChainResult, { kind: "rewrite" }> | null> {
  if (
    typeof runtime.getMcpPromptCommands !== "function" ||
    typeof runtime.executeMcpPromptCommand !== "function"
  ) {
    return null;
  }

  const commands = await runtime.getMcpPromptCommands();
  const matched = commands.find(
    command => command.name.toLowerCase() === parsedCommand.name,
  );
  if (!matched) {
    return null;
  }

  const result = await runtime.executeMcpPromptCommand(
    matched.name,
    parsedCommand.args,
  );
  return {
    kind: "rewrite",
    prompt: result.content,
    ...(result.attachments?.length ? { attachments: result.attachments } : {}),
  };
}

async function tryRewriteInstalledSkillCommand(options: {
  workspaceRoot: string;
  parsedCommand: ParsedPromptSlashCommand;
  runtime: RuntimeLike;
}): Promise<Extract<PromptCommandChainResult, { kind: "rewrite" }> | null> {
  const installedSkills = await loadInstalledSkills(options.workspaceRoot);
  const installedSkill = getInstalledSkill(
    installedSkills,
    options.parsedCommand.name.slice(1),
  );

  if (!installedSkill) {
    return null;
  }

  const execution = await buildInstalledSkillExecutionPlan({
    skill: installedSkill,
    args: options.parsedCommand.args,
    toolContext: options.runtime.getToolContext?.("main") as any,
  });

  return {
    kind: "rewrite",
    prompt: execution.prompt,
    installedSkillExecution: execution,
  };
}

async function buildTodoCommandReply(
  runtime: RuntimeLike,
  args: string,
): Promise<string> {
  const toolContext = runtime.getToolContext?.("main");
  if (!toolContext) {
    return "Task runtime is not available in the current workspace runtime.";
  }

  const normalizedArgs = args.trim();
  const filterStatus =
    normalizedArgs === "pending" ||
    normalizedArgs === "in_progress" ||
    normalizedArgs === "completed"
      ? normalizedArgs
      : undefined;
  const filterQuery =
    normalizedArgs && !filterStatus ? normalizedArgs : undefined;

  const result = await executeTool(
    "TaskList",
    {
      kind: "structured",
      ...(filterStatus ? { status: filterStatus } : {}),
      ...(filterQuery ? { query: filterQuery } : {}),
    },
    toolContext as any,
  );
  return result.content;
}

function buildToolsCommandReply(
  tools: ToolDefinition[],
  query: string,
): string {
  const matches = searchToolDefinitions(tools, query, 20);
  return formatToolSearchResults(matches, query);
}

export async function handleLocalPromptCommand(options: {
  prompt: string;
  config: AdapterProviderConfig;
  workspaceRoot?: string;
  currentEffortLevel: EffortLevel | undefined;
  setEffortLevel: (value: EffortLevel | undefined) => Promise<unknown>;
  currentFastMode: boolean;
  setFastMode: (enabled: boolean) => Promise<unknown>;
  setActiveProviderModel: (model: string) => Promise<unknown>;
  refreshWorkspaceStatus: () => void;
  skillStore?: SkillStore;
}): Promise<string | null> {
  const parsedCommand = parsePromptSlashCommand(options.prompt);
  if (!parsedCommand) {
    return null;
  }

  if (parsedCommand.name === "/commands") {
    return buildPromptSlashCommandHelp({
      args: parsedCommand.args,
      workspaceRoot: options.workspaceRoot,
    });
  }

  if (parsedCommand.name === "/agents") {
    return buildBuiltInAgentHelp(parsedCommand.args, options.workspaceRoot);
  }

  if (parsedCommand.name === "/skills") {
    return buildSkillsHelp(parsedCommand.args, options.workspaceRoot, options.skillStore);
  }

  if (parsedCommand.name === "/hooks") {
    return buildHooksHelp(parsedCommand.args, options.workspaceRoot);
  }

  if (parsedCommand.name === "/add-dir") {
    return buildAddDirReply(options.workspaceRoot, parsedCommand.args);
  }

  if (parsedCommand.name === "/files") {
    return buildFilesReply(options.workspaceRoot, parsedCommand.args);
  }

  if (
    parsedCommand.name !== "/effort" &&
    parsedCommand.name !== "/fast"
  ) {
    return null;
  }

  if (parsedCommand.name === "/effort") {
    const result = executeEffortCommand(
      parsedCommand.args,
      options.currentEffortLevel,
      options.config,
    );

    if (result.changed) {
      await options.setEffortLevel(result.nextValue);
    }

    return result.message;
  }

  const result = executeFastModeCommand(
    parsedCommand.args,
    options.currentFastMode,
    options.config,
  );

  if (result.nextModel) {
    await options.setActiveProviderModel(result.nextModel);
  }

  if (result.changed && typeof result.nextValue === "boolean") {
    await options.setFastMode(result.nextValue);
  }

  if (result.changed || result.nextModel) {
    options.refreshWorkspaceStatus();
  }

  return result.message;
}

export async function handlePlanModePromptCommand(options: {
  prompt: string;
  runtime: RuntimeLike;
  executeToolImpl?: typeof executeTool;
}): Promise<string | null> {
  const parsedCommand = parsePromptSlashCommand(options.prompt);
  if (!parsedCommand) {
    return null;
  }

  if (parsedCommand.name !== "/plan" && parsedCommand.name !== "/exitplan") {
    return null;
  }

  if (parsedCommand.args.trim()) {
    return parsedCommand.name === "/plan"
      ? "Usage: `/plan`"
      : "Usage: `/exitplan`";
  }

  const toolName = parsedCommand.name === "/plan"
    ? "EnterPlanMode"
    : "ExitPlanMode";
  const executeToolImpl = options.executeToolImpl ?? executeTool;
  const result = await executeToolImpl(
    toolName,
    {},
    options.runtime.getToolContext?.("main") as any,
  );
  return result.content;
}

export async function runPromptCommandChain(options: {
  prompt: string;
  config: AdapterProviderConfig;
  workspaceRoot: string;
  envMap: Record<string, string>;
  runtime: RuntimeLike;
  tools: ToolDefinition[];
  runtimeOptions: ProviderRuntimeOptions;
  effortLevel: EffortLevel | undefined;
  profileStore?: ProfileStore;
  tryHandleLocalCommand: (
    prompt: string,
    config: AdapterProviderConfig,
  ) => Promise<string | null>;
  tryHandlePlanModeCommand: (
    prompt: string,
    runtime: RuntimeLike,
  ) => Promise<string | null>;
  handleCompactCommand: (
    prompt: string,
    workspaceRoot: string,
    config: AdapterProviderConfig,
    envMap: Record<string, string>,
  ) => Promise<boolean>;
  handleReviewCommand: (
    prompt: string,
    workspaceRoot: string,
    config: AdapterProviderConfig,
    envMap: Record<string, string>,
    runtime: RuntimeLike,
    tools: ToolDefinition[],
    runtimeOptions: ProviderRuntimeOptions,
    effortLevel: EffortLevel | undefined,
  ) => Promise<boolean>;
  handleUltrareviewCommand: (
    prompt: string,
    workspaceRoot: string,
    config: AdapterProviderConfig,
    envMap: Record<string, string>,
    runtime: RuntimeLike,
    tools: ToolDefinition[],
    runtimeOptions: ProviderRuntimeOptions,
    effortLevel: EffortLevel | undefined,
  ) => Promise<boolean>;
  handleUltraverifyCommand: (
    prompt: string,
    workspaceRoot: string,
    config: AdapterProviderConfig,
    envMap: Record<string, string>,
    runtime: RuntimeLike,
    tools: ToolDefinition[],
    runtimeOptions: ProviderRuntimeOptions,
    effortLevel: EffortLevel | undefined,
  ) => Promise<boolean>;
  handleVerificationCommand: (
    prompt: string,
    workspaceRoot: string,
    config: AdapterProviderConfig,
    envMap: Record<string, string>,
    runtime: RuntimeLike,
    tools: ToolDefinition[],
    runtimeOptions: ProviderRuntimeOptions,
    effortLevel: EffortLevel | undefined,
  ) => Promise<boolean>;
  getSessionInstalledSkillHooks?: () => HookDefinition[];
  registerSessionInstalledSkillHooks?: (hooks: HookDefinition[]) => HookDefinition[];
}): Promise<PromptCommandChainResult> {
  const parsedCommand = parsePromptSlashCommand(options.prompt);
  if (!parsedCommand) {
    return { kind: "continue" };
  }

  const localCommandReply = await options.tryHandleLocalCommand(
    options.prompt,
    options.config,
  );
  if (localCommandReply) {
    return {
      kind: "reply",
      reply: localCommandReply,
    };
  }

  const planModeCommandReply = await options.tryHandlePlanModeCommand(
    options.prompt,
    options.runtime,
  );
  if (planModeCommandReply) {
    return {
      kind: "reply",
      reply: planModeCommandReply,
    };
  }

  const runtimeHandlers: Record<string, () => Promise<boolean>> = {
    "/compact": () =>
      options.handleCompactCommand(
        options.prompt,
        options.workspaceRoot,
        options.config,
        options.envMap,
      ),
    "/review": () =>
      options.handleReviewCommand(
        options.prompt,
        options.workspaceRoot,
        options.config,
        options.envMap,
        options.runtime,
        options.tools,
        options.runtimeOptions,
        options.effortLevel,
      ),
    "/ultrareview": () =>
      options.handleUltrareviewCommand(
        options.prompt,
        options.workspaceRoot,
        options.config,
        options.envMap,
        options.runtime,
        options.tools,
        options.runtimeOptions,
        options.effortLevel,
      ),
    "/ultraverify": () =>
      options.handleUltraverifyCommand(
        options.prompt,
        options.workspaceRoot,
        options.config,
        options.envMap,
        options.runtime,
        options.tools,
        options.runtimeOptions,
        options.effortLevel,
      ),
    "/verify": () =>
      options.handleVerificationCommand(
        options.prompt,
        options.workspaceRoot,
        options.config,
        options.envMap,
        options.runtime,
        options.tools,
        options.runtimeOptions,
        options.effortLevel,
      ),
    "/mcp": async () => true,
    "/memory": async () => true,
    "/todo": async () => true,
    "/tools": async () => true,
  };

  const rewrittenMcpPromptCommand = await tryRewriteMcpPromptCommand(
    options.runtime,
    parsedCommand,
  );
  if (rewrittenMcpPromptCommand) {
    return rewrittenMcpPromptCommand;
  }

  const rewrittenInstalledSkillCommand = await tryRewriteInstalledSkillCommand({
    workspaceRoot: options.workspaceRoot,
    parsedCommand,
    runtime: options.runtime,
  });
  if (rewrittenInstalledSkillCommand) {
    if (
      rewrittenInstalledSkillCommand.installedSkillExecution?.hooks.length &&
      options.registerSessionInstalledSkillHooks
    ) {
      const registeredHooks = options.registerSessionInstalledSkillHooks(
        rewrittenInstalledSkillCommand.installedSkillExecution.hooks,
      );
      return {
        ...rewrittenInstalledSkillCommand,
        installedSkillExecution: {
          ...rewrittenInstalledSkillCommand.installedSkillExecution,
          hooks: registeredHooks,
        },
      };
    }
    return rewrittenInstalledSkillCommand;
  }

  if (parsedCommand.name === "/mcp") {
    const normalizedArgs = parsedCommand.args.trim();
    const callMatch = normalizedArgs.match(/^call\s+(.+)$/i);
    if (callMatch) {
      return {
        kind: "reply",
        reply: await runMcpCallCommand(
          options.runtime,
          options.tools,
          callMatch[1] ?? "",
        ),
      };
    }

    const authMatch = normalizedArgs.match(/^auth\s+(.+)$/i);
    if (authMatch) {
      return {
        kind: "reply",
        reply: await runMcpAuthCommand(
          options.runtime,
          options.tools,
          authMatch[1] ?? "",
        ),
      };
    }

    const promptsMatch = normalizedArgs.match(/^prompts(?:\s+(.*))?$/i);
    if (promptsMatch) {
      return {
        kind: "reply",
        reply: await buildMcpPromptCommandReply(
          options.runtime,
          promptsMatch[1] ?? "",
        ),
      };
    }

    return {
      kind: "reply",
      reply: await buildMcpCommandReply(options.runtime),
    };
  }

  if (parsedCommand.name === "/memory") {
    return {
      kind: "reply",
      reply: await buildMemoryCommandReplyWithArgs(
        options.workspaceRoot,
        parsedCommand.args,
        options.profileStore,
      ),
    };
  }

  if (parsedCommand.name === "/tools") {
    return {
      kind: "reply",
      reply: buildToolsCommandReply(options.tools, parsedCommand.args),
    };
  }

  if (parsedCommand.name === "/todo") {
    return {
      kind: "reply",
      reply: await buildTodoCommandReply(options.runtime, parsedCommand.args),
    };
  }

  const runtimeHandler = runtimeHandlers[parsedCommand.name];
  if (runtimeHandler && await runtimeHandler()) {
    return { kind: "handled" };
  }

  return { kind: "continue" };
}
