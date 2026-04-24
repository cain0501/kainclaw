import type { ProviderConfig as AdapterProviderConfig } from "./agent/providers/IProviderAdapter";
import {
  prepareWorkspaceInspectionContext,
  type ProviderResolution,
  type WorkspaceRuntimeLike,
} from "./workspaceHost";
import type { BackgroundTaskHost } from "./backgroundTaskHost";
import type { EffortLevel, ProviderRuntimeOptions } from "./thinkingEffort/types";
import type { ToolDefinition } from "./toolRuntime";

export type BackgroundCommandToolLaunchBindings = {
  runBackgroundCommandFromTool: (
    workspaceFolderPath: string,
    command: string,
  ) => Promise<{
    taskId: string;
    command: string;
    workspaceRoot: string;
    alreadyRunning?: boolean;
  }>;
  findReusableBackgroundCommand: (
    workspaceFolderPath: string,
    command: string,
  ) => Promise<{ taskId: string; command: string; workspaceRoot: string } | null>;
};

export async function runVerificationFromTool<TRuntime extends WorkspaceRuntimeLike, TResult>(
  options: {
    workspaceFolderPath: string;
    extraGuidance?: string;
    diffRef?: string;
    resolveProviderConfig: () => Promise<ProviderResolution>;
    getEffortLevel: () => EffortLevel | undefined;
    createProviderRuntimeOptions: (
      config: AdapterProviderConfig,
    ) => ProviderRuntimeOptions;
    ensureConversationWorktreeHydrated: (workspaceFolderPath: string) => Promise<void>;
    getEffectiveWorkspaceRoot: (workspaceFolderPath: string) => string;
    getWorkspaceRuntime: (envMap: Record<string, string>) => Promise<TRuntime>;
    runVerificationSession: (options: {
      commandText: string;
      workspaceRoot: string;
      config: AdapterProviderConfig;
      envMap: Record<string, string>;
      runtime: TRuntime;
      tools: ToolDefinition[];
      runtimeOptions: ProviderRuntimeOptions;
      effortLevel: EffortLevel | undefined;
    }) => Promise<TResult>;
  },
): Promise<TResult> {
  const {
    config,
    envMap,
    effortLevel,
    runtimeOptions,
    workspaceRoot,
    runtime,
    tools,
  } = await prepareWorkspaceInspectionContext({
    workspaceFolderPath: options.workspaceFolderPath,
    resolveProviderConfig: options.resolveProviderConfig,
    getEffortLevel: options.getEffortLevel,
    createProviderRuntimeOptions: options.createProviderRuntimeOptions,
    ensureConversationWorktreeHydrated: options.ensureConversationWorktreeHydrated,
    getEffectiveWorkspaceRoot: options.getEffectiveWorkspaceRoot,
    getWorkspaceRuntime: options.getWorkspaceRuntime,
  });
  const commandText = buildInspectionCommandText(
    "/verify",
    options.diffRef,
    options.extraGuidance,
  );

  return options.runVerificationSession({
    commandText,
    workspaceRoot,
    config,
    envMap,
    runtime,
    tools,
    runtimeOptions,
    effortLevel,
  });
}

export async function runReviewFromTool<TRuntime extends WorkspaceRuntimeLike, TResult>(
  options: {
    workspaceFolderPath: string;
    extraGuidance?: string;
    diffRef?: string;
    resolveProviderConfig: () => Promise<ProviderResolution>;
    getEffortLevel: () => EffortLevel | undefined;
    createProviderRuntimeOptions: (
      config: AdapterProviderConfig,
    ) => ProviderRuntimeOptions;
    ensureConversationWorktreeHydrated: (workspaceFolderPath: string) => Promise<void>;
    getEffectiveWorkspaceRoot: (workspaceFolderPath: string) => string;
    getWorkspaceRuntime: (envMap: Record<string, string>) => Promise<TRuntime>;
    runReviewSession: (options: {
      commandText: string;
      workspaceRoot: string;
      config: AdapterProviderConfig;
      envMap: Record<string, string>;
      runtime: TRuntime;
      tools: ToolDefinition[];
      runtimeOptions: ProviderRuntimeOptions;
      effortLevel: EffortLevel | undefined;
    }) => Promise<TResult>;
  },
): Promise<TResult> {
  const {
    config,
    envMap,
    effortLevel,
    runtimeOptions,
    workspaceRoot,
    runtime,
    tools,
  } = await prepareWorkspaceInspectionContext({
    workspaceFolderPath: options.workspaceFolderPath,
    resolveProviderConfig: options.resolveProviderConfig,
    getEffortLevel: options.getEffortLevel,
    createProviderRuntimeOptions: options.createProviderRuntimeOptions,
    ensureConversationWorktreeHydrated: options.ensureConversationWorktreeHydrated,
    getEffectiveWorkspaceRoot: options.getEffectiveWorkspaceRoot,
    getWorkspaceRuntime: options.getWorkspaceRuntime,
  });
  const commandText = buildInspectionCommandText(
    "/review",
    options.diffRef,
    options.extraGuidance,
  );

  return options.runReviewSession({
    commandText,
    workspaceRoot,
    config,
    envMap,
    runtime,
    tools,
    runtimeOptions,
    effortLevel,
  });
}

export async function findReusableBackgroundCommandForWorkspace(options: {
  workspaceFolderPath: string;
  command: string;
  ensureConversationWorktreeHydrated: (workspaceFolderPath: string) => Promise<void>;
  getEffectiveWorkspaceRoot: (workspaceFolderPath: string) => string;
  backgroundTaskHost: Pick<BackgroundTaskHost, "findReusableBackgroundCommand">;
}): Promise<{ taskId: string; command: string; workspaceRoot: string } | null> {
  await options.ensureConversationWorktreeHydrated(options.workspaceFolderPath);
  const workspaceRoot = options.getEffectiveWorkspaceRoot(options.workspaceFolderPath);
  return (
    (await options.backgroundTaskHost.findReusableBackgroundCommand(
      workspaceRoot,
      options.command,
    )) ?? null
  );
}

export async function runBackgroundCommandFromTool(options: {
  workspaceFolderPath: string;
  command: string;
  ensureConversationWorktreeHydrated: (workspaceFolderPath: string) => Promise<void>;
  getEffectiveWorkspaceRoot: (workspaceFolderPath: string) => string;
  backgroundTaskHost: Pick<
    BackgroundTaskHost,
    "runBackgroundCommand" | "findReusableBackgroundCommand"
  >;
}): Promise<{ taskId: string; command: string; workspaceRoot: string; alreadyRunning?: boolean }> {
  const existingCommandTask = await findReusableBackgroundCommandForWorkspace({
    workspaceFolderPath: options.workspaceFolderPath,
    command: options.command,
    ensureConversationWorktreeHydrated: options.ensureConversationWorktreeHydrated,
    getEffectiveWorkspaceRoot: options.getEffectiveWorkspaceRoot,
    backgroundTaskHost: options.backgroundTaskHost,
  });
  if (existingCommandTask) {
    return {
      ...existingCommandTask,
      alreadyRunning: true,
    };
  }

  const workspaceRoot = options.getEffectiveWorkspaceRoot(options.workspaceFolderPath);
  return options.backgroundTaskHost.runBackgroundCommand({
    workspaceRoot,
    command: options.command,
  });
}

export function createBackgroundCommandToolLaunchBindings(options: {
  ensureConversationWorktreeHydrated: (workspaceFolderPath: string) => Promise<void>;
  getEffectiveWorkspaceRoot: (workspaceFolderPath: string) => string;
  backgroundTaskHost: Pick<
    BackgroundTaskHost,
    "runBackgroundCommand" | "findReusableBackgroundCommand"
  >;
}): BackgroundCommandToolLaunchBindings {
  return {
    runBackgroundCommandFromTool: (workspaceFolderPath, command) =>
      runBackgroundCommandFromTool({
        workspaceFolderPath,
        command,
        ensureConversationWorktreeHydrated: options.ensureConversationWorktreeHydrated,
        getEffectiveWorkspaceRoot: options.getEffectiveWorkspaceRoot,
        backgroundTaskHost: options.backgroundTaskHost,
      }),
    findReusableBackgroundCommand: (workspaceFolderPath, command) =>
      findReusableBackgroundCommandForWorkspace({
        workspaceFolderPath,
        command,
        ensureConversationWorktreeHydrated: options.ensureConversationWorktreeHydrated,
        getEffectiveWorkspaceRoot: options.getEffectiveWorkspaceRoot,
        backgroundTaskHost: options.backgroundTaskHost,
      }),
  };
}

function buildInspectionCommandText(
  commandPrefix: "/verify" | "/review",
  diffRef?: string,
  extraGuidance?: string,
): string {
  const normalizedDiffRef =
    typeof diffRef === "string" && diffRef.trim() !== ""
      ? diffRef.trim()
      : undefined;
  const normalizedGuidance =
    typeof extraGuidance === "string" && extraGuidance.trim() !== ""
      ? extraGuidance.trim().replace(/^--\s*/, "")
      : undefined;

  if (normalizedDiffRef && normalizedGuidance) {
    return `${commandPrefix} ${normalizedDiffRef} -- ${normalizedGuidance}`;
  }
  if (normalizedDiffRef) {
    return `${commandPrefix} ${normalizedDiffRef}`;
  }
  if (normalizedGuidance) {
    return `${commandPrefix} ${normalizedGuidance}`;
  }
  return commandPrefix;
}
