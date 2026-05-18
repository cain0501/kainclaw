import { runAgent } from "../agentRunner";
import type { IProviderAdapter } from "../providers/IProviderAdapter";
import type { ToolContext, ToolDefinition } from "../../toolRuntime";
import { getBuiltInAgent } from "../builtInAgents";
import {
  getReadOnlyAgentToolContext,
  getReadOnlyAgentTools,
} from "./agentUtils";
import { createAgentProviderRuntimeContext } from "../../promptTurnHost";
import type {
  EffortLevel,
  ProviderRuntimeOptions,
} from "../../thinkingEffort/types";
import type { ProviderConfig as AdapterProviderConfig } from "../providers/IProviderAdapter";

const EXPLORE_TOOL_NAMES = new Set([
  "list_files",
  "read_file",
  "search_files",
  "glob_files",
  "run_command",
]);

export type BuiltInSubAgentRequest = {
  agentType: string;
  prompt: string;
  description?: string;
};

export async function runBuiltInSubAgent(options: {
  request: BuiltInSubAgentRequest;
  workspaceRoot: string;
  config: AdapterProviderConfig;
  envMap: Record<string, string>;
  runtimeOptions: ProviderRuntimeOptions;
  effortLevel: EffortLevel | undefined;
  tools: ToolDefinition[];
  getWorkerToolContext: () => ToolContext;
  buildProviderAdapter: (options: {
    config: AdapterProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions: ProviderRuntimeOptions;
  }) => IProviderAdapter;
}): Promise<{ text: string }> {
  const builtInAgent = getBuiltInAgent(options.request.agentType);
  if (!builtInAgent) {
    throw new Error(
      `Unknown agent type: ${options.request.agentType}. Available: general-purpose, Explore, verification`,
    );
  }

  const agentTools =
    builtInAgent.agentType === "Explore"
      ? getReadOnlyAgentTools(
          options.tools.filter(tool => EXPLORE_TOOL_NAMES.has(tool.name)),
          ["Agent"],
        )
      : builtInAgent.agentType === "verification"
        ? getReadOnlyAgentTools(
            options.tools.filter(tool => tool.name !== "Agent"),
            builtInAgent.disallowedTools,
          )
        : options.tools.filter(tool => tool.name !== "Agent");

  const workerToolContext = options.getWorkerToolContext();
  const toolContext =
    builtInAgent.agentType === "Explore" ||
    builtInAgent.agentType === "verification"
      ? getReadOnlyAgentToolContext(workerToolContext)
      : workerToolContext;

  const result = await runAgent([{ role: "user", content: options.request.prompt }], {
    provider: options.buildProviderAdapter({
      config: options.config,
      workspaceRoot: options.workspaceRoot,
      systemPrompt: builtInAgent.getSystemPrompt(),
      envMap: options.envMap,
      runtimeOptions: options.runtimeOptions,
    }),
    tools: agentTools,
    toolContext,
    providerRuntimeContext: createAgentProviderRuntimeContext({
      workspaceRoot: options.workspaceRoot,
      config: options.config,
      envMap: options.envMap,
      runtimeOptions: options.runtimeOptions,
      effortLevel: options.effortLevel,
      buildWorkspaceSystemPrompt: async () => builtInAgent.getSystemPrompt(),
      buildProviderAdapter: options.buildProviderAdapter,
    }),
    maxTurns: 30,
  });

  return { text: result.text };
}
