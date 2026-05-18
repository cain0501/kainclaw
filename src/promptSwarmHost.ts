import type { IProviderAdapter, ProviderConfig as AdapterProviderConfig } from "./agent/providers/IProviderAdapter";
import { SwarmCoordinator, type WorkerStateUpdate } from "./agent/swarm/SwarmCoordinator";
import type { ConversationTaskRuntime } from "./tasks/types";
import type { ToolContext } from "./toolRuntime";
import type { ProviderRuntimeOptions } from "./thinkingEffort/types";

export function ensurePromptTurnSwarm(options: {
  swarmEnabledForTurn: boolean;
  existingSwarm?: SwarmCoordinator;
  createSwarm: () => SwarmCoordinator;
  assignSwarm: (swarm: SwarmCoordinator) => void;
}): SwarmCoordinator | undefined {
  if (!options.swarmEnabledForTurn) {
    return undefined;
  }

  const swarm = options.existingSwarm ?? options.createSwarm();
  if (!options.existingSwarm) {
    options.assignSwarm(swarm);
  }
  return swarm;
}

export function createPromptTurnSwarm(options: {
  workspaceFolderPath: string;
  workerToolContext: ToolContext;
  backgroundTasks: ConversationTaskRuntime;
  resolveWorkerProviderConfig: (
    alias: string,
  ) => Promise<AdapterProviderConfig | undefined>;
  createProviderRuntimeOptions: (
    config: AdapterProviderConfig,
  ) => ProviderRuntimeOptions;
  getEffectiveWorkspaceRoot: (workspaceFolderPath: string) => string;
  buildProviderAdapter: (options: {
    config: AdapterProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions: ProviderRuntimeOptions;
  }) => IProviderAdapter;
  postWorkerUpdate: WorkerStateUpdate;
}): SwarmCoordinator {
  return new SwarmCoordinator({
    resolveWorkerProvider: async (alias, systemPrompt) => {
      const workerConfig = await options.resolveWorkerProviderConfig(alias);
      if (!workerConfig) {
        throw new Error(`Provider alias "${alias}" 未配置`);
      }

      const workerRuntimeOptions =
        {
          ...options.createProviderRuntimeOptions(workerConfig),
          requestKind: "swarm-worker" as const,
        };
      return options.buildProviderAdapter({
        config: workerConfig,
        workspaceRoot: options.getEffectiveWorkspaceRoot(
          options.workspaceFolderPath,
        ),
        systemPrompt,
        envMap: {},
        runtimeOptions: workerRuntimeOptions,
      });
    },
    onWorkerUpdate: patch => {
      options.postWorkerUpdate(patch);
    },
    workerToolContext: options.workerToolContext,
    backgroundTasks: options.backgroundTasks,
  });
}

export function createPromptTurnSwarmFactory(
  options: Omit<
    Parameters<typeof createPromptTurnSwarm>[0],
    "workerToolContext"
  >,
): (options: { workerToolContext: ToolContext }) => SwarmCoordinator {
  return ({ workerToolContext }) =>
    createPromptTurnSwarm({
      ...options,
      workerToolContext,
    });
}
