import type {
  NormalizedImageAttachment,
  ProviderConfig as AdapterProviderConfig,
} from "./agent/providers/IProviderAdapter";
import {
  formatInstalledSkillCommandDetail,
  getInstalledSkillByEntrypoint,
  loadInstalledSkills,
} from "./installedSkillsRegistry";
import {
  handleLocalPromptCommand,
  listRegisteredPromptSlashCommands,
  parsePromptSlashCommand,
  runPromptCommandChain,
} from "./promptCommandHost";
import type { ToolDefinition } from "./toolRuntime";
import type { ProviderRuntimeOptions } from "./thinkingEffort/types";
import type { EffortLevel } from "./thinkingEffort/types";
import type { ProfileStore } from "./userModel/profileStore";
import type { HookDefinition } from "./hooksRegistry";

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
};

const SUPPORTED_ELECTRON_RUNTIME_PROMPT_COMMANDS = new Set([
  "/compact",
  "/mcp",
  "/memory",
  "/review",
  "/ultrareview",
  "/ultraverify",
  "/todo",
  "/tools",
  "/verify",
]);

const UNSUPPORTED_ELECTRON_PROMPT_COMMANDS = new Set([
  "/plan",
  "/exitplan",
]);

const SUPPORTED_ELECTRON_PROMPT_COMMANDS = new Set([
  "/commands",
  "/effort",
  "/agents",
  "/skills",
  "/hooks",
  "/fast",
  "/add-dir",
  "/files",
  ...SUPPORTED_ELECTRON_RUNTIME_PROMPT_COMMANDS,
]);

async function buildElectronPromptCommandHelp(options: {
  args: string;
  workspaceRoot: string;
}): Promise<string> {
  const normalizedArgs = (() => {
    const trimmed = options.args.trim().toLowerCase();
    if (!trimmed) {
      return "";
    }
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  })();
  const installedSkills = await loadInstalledSkills(options.workspaceRoot);

  if (normalizedArgs) {
    const registeredCommand = listRegisteredPromptSlashCommands().find(command =>
      SUPPORTED_ELECTRON_PROMPT_COMMANDS.has(command.name) &&
      command.name === normalizedArgs,
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

  const supportedCommands = listRegisteredPromptSlashCommands().filter(command =>
    SUPPORTED_ELECTRON_PROMPT_COMMANDS.has(command.name),
  );
  const localCommands = supportedCommands.filter(
    command => command.stage === "local",
  );
  const runtimeCommands = supportedCommands.filter(
    command => command.stage === "runtime",
  );

  const lines = [
    "Available slash commands in the Electron desktop shell:",
    "",
    "Local commands:",
    ...localCommands.map(command => `- ${command.name}: ${command.description}`),
    "",
    "Workspace/runtime commands:",
    ...runtimeCommands.map(command => `- ${command.name}: ${command.description}`),
    "",
    "Unavailable in this shell: /plan, /exitplan",
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

function buildUnsupportedElectronPromptCommandReply(commandName: string): string {
  return `${commandName} is not yet wired into the Electron desktop shell. Use the VS Code host for this capability for now.`;
}

export type ElectronPromptCommandResult =
  | {
      kind: "continue";
      effectivePrompt?: string;
      effectivePromptAttachments?: NormalizedImageAttachment[];
      allowedTools?: string[];
      modelOverride?: string;
      effortOverride?: EffortLevel;
      installedSkillHooks?: HookDefinition[];
    }
  | { kind: "reply"; reply: string }
  | { kind: "handled" };

export async function handleElectronPromptCommand(options: {
  prompt: string;
  config: AdapterProviderConfig;
  workspaceRoot: string;
  envMap: Record<string, string>;
  runtime: RuntimeLike;
  tools: ToolDefinition[];
  currentEffortLevel: EffortLevel | undefined;
  setEffortLevel: (value: EffortLevel | undefined) => Promise<unknown>;
  currentFastMode: boolean;
  setFastMode: (enabled: boolean) => Promise<unknown>;
  setActiveProviderModel: (model: string) => Promise<unknown>;
  refreshWorkspaceStatus: () => void;
  runtimeOptions: ProviderRuntimeOptions;
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
  profileStore?: ProfileStore;
}): Promise<ElectronPromptCommandResult> {
  const parsedCommand = parsePromptSlashCommand(options.prompt);
  if (!parsedCommand) {
    return { kind: "continue" };
  }
  const installedSkills = await loadInstalledSkills(options.workspaceRoot);
  const installedSkillCommand = getInstalledSkillByEntrypoint(
    installedSkills,
    parsedCommand.name,
  );

  if (parsedCommand.name === "/commands") {
    return {
      kind: "reply",
      reply: await buildElectronPromptCommandHelp({
        args: parsedCommand.args,
        workspaceRoot: options.workspaceRoot,
      }),
    };
  }

  const localReply = await handleLocalPromptCommand({
    prompt: options.prompt,
    config: options.config,
    workspaceRoot: options.workspaceRoot,
    currentEffortLevel: options.currentEffortLevel,
    setEffortLevel: options.setEffortLevel,
    currentFastMode: options.currentFastMode,
    setFastMode: options.setFastMode,
    setActiveProviderModel: options.setActiveProviderModel,
    refreshWorkspaceStatus: options.refreshWorkspaceStatus,
  });
  if (localReply) {
    return { kind: "reply", reply: localReply };
  }

  if (UNSUPPORTED_ELECTRON_PROMPT_COMMANDS.has(parsedCommand.name)) {
    return {
      kind: "reply",
      reply: buildUnsupportedElectronPromptCommandReply(parsedCommand.name),
    };
  }

  if (
    !SUPPORTED_ELECTRON_RUNTIME_PROMPT_COMMANDS.has(parsedCommand.name) &&
    !installedSkillCommand
  ) {
    return { kind: "continue" };
  }

  const result = await runPromptCommandChain({
    prompt: options.prompt,
    config: options.config,
    workspaceRoot: options.workspaceRoot,
    envMap: options.envMap,
    runtime: options.runtime,
    tools: options.tools,
    runtimeOptions: options.runtimeOptions,
    effortLevel: options.currentEffortLevel,
    profileStore: options.profileStore,
    tryHandleLocalCommand: async () => null,
    tryHandlePlanModeCommand: async () => null,
    handleCompactCommand: options.handleCompactCommand,
    handleReviewCommand: options.handleReviewCommand,
    handleUltrareviewCommand: options.handleUltrareviewCommand,
    handleUltraverifyCommand: options.handleUltraverifyCommand,
    handleVerificationCommand: options.handleVerificationCommand,
    getSessionInstalledSkillHooks: options.getSessionInstalledSkillHooks,
    registerSessionInstalledSkillHooks:
      options.registerSessionInstalledSkillHooks,
  });

  if (result.kind === "reply") {
    return result;
  }

  if (result.kind === "handled") {
    return { kind: "handled" };
  }

  if (result.kind === "rewrite") {
    return {
      kind: "continue",
      effectivePrompt: result.prompt,
      ...(result.attachments?.length
        ? { effectivePromptAttachments: result.attachments }
        : {}),
      ...(result.installedSkillExecution?.allowedTools?.length
        ? { allowedTools: result.installedSkillExecution.allowedTools }
        : result.allowedTools?.length
          ? { allowedTools: result.allowedTools }
          : {}),
      ...(result.installedSkillExecution?.modelOverride
        ? { modelOverride: result.installedSkillExecution.modelOverride }
        : result.modelOverride
          ? { modelOverride: result.modelOverride }
          : {}),
      ...(result.installedSkillExecution?.effortOverride
        ? { effortOverride: result.installedSkillExecution.effortOverride }
        : result.effortOverride
          ? { effortOverride: result.effortOverride }
          : {}),
      ...(result.installedSkillExecution?.hooks?.length
        ? { installedSkillHooks: result.installedSkillExecution.hooks }
        : result.installedSkillHooks?.length
          ? { installedSkillHooks: result.installedSkillHooks }
          : {}),
    };
  }

  return result;
}
