import type {
  ProviderConfig as AdapterProviderConfig,
} from "./agent/providers/IProviderAdapter";
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

function buildElectronPromptCommandHelp(): string {
  const supportedCommands = listRegisteredPromptSlashCommands().filter(command =>
    SUPPORTED_ELECTRON_PROMPT_COMMANDS.has(command.name),
  );
  const localCommands = supportedCommands.filter(
    command => command.stage === "local",
  );
  const runtimeCommands = supportedCommands.filter(
    command => command.stage === "runtime",
  );

  return [
    "Available slash commands in the Electron desktop shell:",
    "",
    "Local commands:",
    ...localCommands.map(command => `- ${command.name}: ${command.description}`),
    "",
    "Workspace/runtime commands:",
    ...runtimeCommands.map(command => `- ${command.name}: ${command.description}`),
    "",
    "Unavailable in this shell: /plan, /exitplan",
  ].join("\n");
}

function buildUnsupportedElectronPromptCommandReply(commandName: string): string {
  return `${commandName} is not yet wired into the Electron desktop shell. Use the VS Code host for this capability for now.`;
}

export type ElectronPromptCommandResult =
  | { kind: "continue" }
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
  profileStore?: ProfileStore;
}): Promise<ElectronPromptCommandResult> {
  const parsedCommand = parsePromptSlashCommand(options.prompt);
  if (!parsedCommand) {
    return { kind: "continue" };
  }

  if (parsedCommand.name === "/commands") {
    return { kind: "reply", reply: buildElectronPromptCommandHelp() };
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

  if (!SUPPORTED_ELECTRON_RUNTIME_PROMPT_COMMANDS.has(parsedCommand.name)) {
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
    handleVerificationCommand: options.handleVerificationCommand,
  });

  if (result.kind === "reply") {
    return result;
  }

  if (result.kind === "handled") {
    return { kind: "handled" };
  }

  return { kind: "continue" };
}
