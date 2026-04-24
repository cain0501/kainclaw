import type { ProviderConfig as AdapterProviderConfig } from "./agent/providers/IProviderAdapter";
import {
  loadWorkspaceTools,
  prepareHydratedWorkspaceRuntime,
  prepareProviderExecutionContext,
  type ProviderResolution,
  type WorkspaceRuntimeLike,
} from "./workspaceHost";
import type { McpServerStatusSummary } from "./mcpRuntime";
import type { EffortLevel, ProviderRuntimeOptions } from "./thinkingEffort/types";

type McpDirtyRuntime = {
  markMcpConfigDirty(): void;
};

export type WorkspaceStatusController = {
  refresh: () => Promise<void>;
  requestRefresh: () => void;
  invalidate: () => void;
};

export type WorkspaceStatusInvalidationBindings = {
  clearCachedTools: () => void;
  runtimes: Iterable<McpDirtyRuntime>;
  refreshWorkspaceStatus: () => void;
};

export function createWorkspaceStatusInvalidationBindings(
  options: WorkspaceStatusInvalidationBindings,
): WorkspaceStatusInvalidationBindings {
  return options;
}

export function invalidateWorkspaceStatusCaches(options: {
  clearCachedTools: () => void;
  runtimes: Iterable<McpDirtyRuntime>;
  refreshWorkspaceStatus: () => void;
}): void {
  options.clearCachedTools();
  for (const runtime of options.runtimes) {
    runtime.markMcpConfigDirty();
  }
  options.refreshWorkspaceStatus();
}

export type WorkspaceStatusRefreshBindings<TRuntime extends WorkspaceRuntimeLike> =
  {
    resolveProviderConfig: () => Promise<ProviderResolution>;
    getEffortLevel: () => EffortLevel | undefined;
    createProviderRuntimeOptions: (
      config: AdapterProviderConfig,
    ) => ProviderRuntimeOptions;
    ensureConversationWorktreeHydrated: (
      workspaceFolderPath: string,
    ) => Promise<void>;
    getEffectiveWorkspaceRoot: (workspaceFolderPath: string) => string;
    getWorkspaceRuntime: (
      envMap: Record<string, string>,
    ) => Promise<TRuntime>;
    applyWorkspaceStatus: (status: {
      mcpServers: McpServerStatusSummary[];
      providerLabel: string;
    }) => void;
    postState: () => void;
  };

export function createWorkspaceStatusRefreshBindings<
  TRuntime extends WorkspaceRuntimeLike,
>(
  options: WorkspaceStatusRefreshBindings<TRuntime>,
): WorkspaceStatusRefreshBindings<TRuntime> {
  return options;
}

export function createWorkspaceStatusController<
  TRuntime extends WorkspaceRuntimeLike,
>(options: {
  getWorkspaceFolderPath: () => string | undefined;
  getIsBusy: () => boolean;
  getHasPendingApproval: () => boolean;
  refreshBindings: WorkspaceStatusRefreshBindings<TRuntime>;
  invalidationBindings: Pick<
    WorkspaceStatusInvalidationBindings,
    "clearCachedTools" | "runtimes"
  >;
}): WorkspaceStatusController {
  const refresh = async () => {
    await refreshWorkspaceStatus({
      workspaceFolderPath: options.getWorkspaceFolderPath(),
      isBusy: options.getIsBusy(),
      hasPendingApproval: options.getHasPendingApproval(),
      ...options.refreshBindings,
    });
  };

  const requestRefresh = () => {
    void refresh();
  };

  const invalidate = () => {
    invalidateWorkspaceStatusCaches({
      ...options.invalidationBindings,
      refreshWorkspaceStatus: requestRefresh,
    });
  };

  return {
    refresh,
    requestRefresh,
    invalidate,
  };
}

export async function refreshWorkspaceStatus<TRuntime extends WorkspaceRuntimeLike>(
  options: {
    workspaceFolderPath?: string;
    isBusy: boolean;
    hasPendingApproval: boolean;
  } & WorkspaceStatusRefreshBindings<TRuntime>,
): Promise<boolean> {
  if (!options.workspaceFolderPath || options.isBusy || options.hasPendingApproval) {
    return false;
  }

  try {
    const { config, envMap } = await prepareProviderExecutionContext({
      resolveProviderConfig: options.resolveProviderConfig,
      getEffortLevel: options.getEffortLevel,
      createProviderRuntimeOptions: options.createProviderRuntimeOptions,
    });
    const { workspaceRoot, runtime } = await prepareHydratedWorkspaceRuntime({
      workspaceFolderPath: options.workspaceFolderPath,
      envMap,
      ensureConversationWorktreeHydrated: options.ensureConversationWorktreeHydrated,
      getEffectiveWorkspaceRoot: options.getEffectiveWorkspaceRoot,
      getWorkspaceRuntime: options.getWorkspaceRuntime,
    });
    const loadedTools = await loadWorkspaceTools({
      runtime,
      config,
      workspaceRoot,
    });

    options.applyWorkspaceStatus({
      mcpServers: loadedTools.mcpServers ?? [],
      providerLabel: loadedTools.providerLabel ?? "",
    });
    options.postState();
    return true;
  } catch {
    return false;
  }
}
