import type { ProviderConfig as AdapterProviderConfig } from "./agent/providers/IProviderAdapter";
import type { McpServerStatusSummary } from "./mcpRuntime";
import type { ToolDefinition } from "./toolRuntime";
import type { EffortLevel, ProviderRuntimeOptions } from "./thinkingEffort/types";

export type WorkspaceRuntimeLike = {
  getToolDefinitions(): Promise<ToolDefinition[]>;
  getMcpStatusSummary(): Promise<McpServerStatusSummary[]>;
};

export type ProviderResolution = {
  config: AdapterProviderConfig;
  envMap: Record<string, string>;
};

export async function prepareProviderExecutionContext(options: {
  resolveProviderConfig: () => Promise<ProviderResolution>;
  getEffortLevel: () => EffortLevel | undefined;
  createProviderRuntimeOptions: (
    config: AdapterProviderConfig,
  ) => ProviderRuntimeOptions;
}): Promise<{
  config: AdapterProviderConfig;
  envMap: Record<string, string>;
  effortLevel: EffortLevel | undefined;
  runtimeOptions: ProviderRuntimeOptions;
}> {
  const { config, envMap } = await options.resolveProviderConfig();
  return {
    config,
    envMap,
    effortLevel: options.getEffortLevel(),
    runtimeOptions: options.createProviderRuntimeOptions(config),
  };
}

export async function prepareHydratedWorkspaceRuntime<TRuntime extends WorkspaceRuntimeLike>(
  options: {
    workspaceFolderPath: string;
    envMap: Record<string, string>;
    ensureConversationWorktreeHydrated: (workspaceFolderPath: string) => Promise<void>;
    getEffectiveWorkspaceRoot: (workspaceFolderPath: string) => string;
    getWorkspaceRuntime: (envMap: Record<string, string>) => Promise<TRuntime>;
  },
): Promise<{
  workspaceRoot: string;
  runtime: TRuntime;
}> {
  await options.ensureConversationWorktreeHydrated(options.workspaceFolderPath);
  const workspaceRoot = options.getEffectiveWorkspaceRoot(options.workspaceFolderPath);
  const runtime = await options.getWorkspaceRuntime(options.envMap);
  return {
    workspaceRoot,
    runtime,
  };
}

export async function prepareWorkspaceInspectionContext<TRuntime extends WorkspaceRuntimeLike>(
  options: {
    workspaceFolderPath: string;
    resolveProviderConfig: () => Promise<ProviderResolution>;
    getEffortLevel: () => EffortLevel | undefined;
    createProviderRuntimeOptions: (
      config: AdapterProviderConfig,
    ) => ProviderRuntimeOptions;
    ensureConversationWorktreeHydrated: (workspaceFolderPath: string) => Promise<void>;
    getEffectiveWorkspaceRoot: (workspaceFolderPath: string) => string;
    getWorkspaceRuntime: (
      envMap: Record<string, string>,
    ) => Promise<TRuntime>;
  },
): Promise<{
  config: AdapterProviderConfig;
  envMap: Record<string, string>;
  effortLevel: EffortLevel | undefined;
  runtimeOptions: ProviderRuntimeOptions;
  workspaceRoot: string;
  runtime: TRuntime;
  tools: ToolDefinition[];
}> {
  const providerContext = await prepareProviderExecutionContext(options);
  const runtimeContext = await prepareHydratedWorkspaceRuntime({
    workspaceFolderPath: options.workspaceFolderPath,
    envMap: providerContext.envMap,
    ensureConversationWorktreeHydrated: options.ensureConversationWorktreeHydrated,
    getEffectiveWorkspaceRoot: options.getEffectiveWorkspaceRoot,
    getWorkspaceRuntime: options.getWorkspaceRuntime,
  });
  const { tools } = await loadWorkspaceTools({
    runtime: runtimeContext.runtime,
    config: providerContext.config,
    workspaceRoot: runtimeContext.workspaceRoot,
  });

  return {
    ...providerContext,
    ...runtimeContext,
    tools,
  };
}

export function buildProviderLabel(
  config: Pick<AdapterProviderConfig, "type"> & { model?: string },
  toolCount?: number,
): string {
  const parts: string[] = [config.type];
  if (config.model?.trim()) {
    parts.push(config.model.trim());
  }
  if (typeof toolCount === "number") {
    parts.push(`${toolCount} tools`);
  }
  return parts.join(" · ");
}

export async function loadWorkspaceTools<TRuntime extends WorkspaceRuntimeLike>(options: {
  runtime: TRuntime;
  config: Pick<AdapterProviderConfig, "type"> & { model?: string };
  workspaceRoot: string;
  cachedTools?: ToolDefinition[];
  cachedToolsWorkspaceRoot?: string;
}): Promise<{
  tools: ToolDefinition[];
  reusedCache: boolean;
  mcpServers?: McpServerStatusSummary[];
  providerLabel?: string;
}> {
  if (shouldReuseCachedWorkspaceTools({
    cachedTools: options.cachedTools,
    cachedToolsWorkspaceRoot: options.cachedToolsWorkspaceRoot,
    workspaceRoot: options.workspaceRoot,
  })) {
    return {
      tools: options.cachedTools!,
      reusedCache: true,
    };
  }

  const tools = await options.runtime.getToolDefinitions();
  const mcpServers = await options.runtime.getMcpStatusSummary();

  return {
    tools,
    reusedCache: false,
    mcpServers,
    providerLabel: buildProviderLabel(options.config, tools.length),
  };
}

export function shouldReuseCachedWorkspaceTools(options: {
  cachedTools: ToolDefinition[] | undefined;
  cachedToolsWorkspaceRoot: string | undefined;
  workspaceRoot: string;
}): options is {
  cachedTools: ToolDefinition[];
  cachedToolsWorkspaceRoot: string;
  workspaceRoot: string;
} {
  return !!(
    options.cachedTools &&
    options.cachedToolsWorkspaceRoot &&
    options.cachedToolsWorkspaceRoot === options.workspaceRoot
  );
}
