import { runAgent } from "./agent/agentRunner";
import type { AgentProviderRuntimeContext } from "./agent/agentRunner";
import type {
  IProviderAdapter,
  ProviderConfig as AdapterProviderConfig,
  NormalizedMessage,
} from "./agent/providers/IProviderAdapter";
import type { SwarmCoordinator } from "./agent/swarm/SwarmCoordinator";
import { getToolRunningLabel } from "./hostUi";
import {
  describeToolInput as formatToolInputPreview,
  describeToolName as formatToolDisplayName,
} from "./hostRuntimeHelpers";
import { triggerHooks } from "./hooks/hooksTrigger";
import { preparePromptTurnDependencies } from "./promptSetupHost";
import type { AgentRunner } from "./hooks/hooksExecutor";
import type { HookDefinition } from "./hooksRegistry";
import type { ToolContext, ToolDefinition } from "./toolRuntime";
import type { EffortLevel, ProviderRuntimeOptions } from "./thinkingEffort/types";
import { buildProviderRuntimeOptions } from "./thinkingEffort/thinking";

export function createAgentProviderRuntimeContext(options: {
  workspaceRoot: string;
  config: AdapterProviderConfig;
  envMap: Record<string, string>;
  runtimeOptions: ProviderRuntimeOptions;
  effortLevel: EffortLevel | undefined;
  buildWorkspaceSystemPrompt: (
    workspaceRoot: string,
    config: AdapterProviderConfig,
    effortLevel: EffortLevel | undefined,
  ) => Promise<string>;
  buildProviderAdapter: (options: {
    config: AdapterProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions: ProviderRuntimeOptions;
  }) => IProviderAdapter;
}): AgentProviderRuntimeContext {
  return {
    config: options.config,
    workspaceRoot: options.workspaceRoot,
    envMap: options.envMap,
    runtimeOptions: options.runtimeOptions,
    effortLevel: options.effortLevel,
    buildWorkspaceSystemPrompt: options.buildWorkspaceSystemPrompt,
    buildProviderAdapter: options.buildProviderAdapter,
    createRuntimeOptions: (config, effortLevel) => ({
      ...buildProviderRuntimeOptions(
        config,
        effortLevel,
        options.runtimeOptions.fastMode,
      ),
      onFastModeDisabled: options.runtimeOptions.onFastModeDisabled,
    }),
  };
}

export function resolvePromptTurnSwarm<TSwarm>(options: {
  swarmEnabledForTurn: boolean;
  existingSwarm?: TSwarm;
  createSwarm: () => TSwarm;
}): TSwarm | undefined {
  if (!options.swarmEnabledForTurn) {
    return undefined;
  }

  return options.existingSwarm ?? options.createSwarm();
}

export async function runPromptTurnWithHost<TSwarm>(options: {
  prompt: string;
  workspaceRoot: string;
  config: AdapterProviderConfig;
  envMap: Record<string, string>;
  runtimeOptions: ProviderRuntimeOptions;
  effortLevel: EffortLevel | undefined;
  runtime: { getToolContext(mode?: string): ToolContext };
  tools: ToolDefinition[];
  installedSkillHooks?: HookDefinition[];
  userHooks?: HookDefinition[];
  installedSkillAgentRunner?: AgentRunner;
  existingSwarm?: TSwarm;
  createSwarm: () => TSwarm;
  assignSwarm: (swarm: TSwarm) => void;
  getConversationHistory: () => Array<{ role: "user" | "assistant"; content: string }>;
  buildWorkspaceSystemPrompt: (
    workspaceRoot: string,
    config: AdapterProviderConfig,
    effortLevel: EffortLevel | undefined,
  ) => Promise<string>;
  buildProviderAdapter: (options: {
    config: AdapterProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions: ProviderRuntimeOptions;
  }) => IProviderAdapter;
  shouldEnableSwarmForPrompt: (prompt: string) => boolean;
  setCompanionState: (state: "thinking" | "working" | "done") => void;
  appendStreamingToken: (token: string) => void;
  logFirstToken: (token: string) => void;
  postToken: (token: string) => void;
  startToolExecution: (
    execId: string,
    label: string,
    detail?: string,
  ) => void;
  finishToolExecution: (
    execId: string,
    status: "done" | "error",
    summary?: string,
  ) => void;
  onToolError?: () => void;
  modelActivityId: string;
  finishModelActivity: (
    activityId: string,
    status: "done",
    detail?: string,
  ) => void;
  logNoStreamingReply: () => void;
  recordAssistantReply: (
    reply: string,
    includeInConversation: boolean,
    thinkingSummary?: string,
  ) => Promise<void>;
  clearStreamingText: () => void;
  queueAutoMemoryExtraction: () => void;
  updateMood: (delta: number, countConversation?: boolean) => Promise<void>;
  runAgentImpl?: typeof runAgent;
}): Promise<void> {
  const { history, provider, swarmEnabledForTurn } =
    await preparePromptTurnDependencies({
      prompt: options.prompt,
      workspaceRoot: options.workspaceRoot,
      config: options.config,
      envMap: options.envMap,
      runtimeOptions: options.runtimeOptions,
      effortLevel: options.effortLevel,
      getConversationHistory: options.getConversationHistory,
      getSystemPromptForWorkspace: options.buildWorkspaceSystemPrompt,
      buildProvider: options.buildProviderAdapter,
      shouldEnableSwarmForPrompt: options.shouldEnableSwarmForPrompt,
    });

  await executePreparedPromptTurn({
    history,
    provider,
    tools: options.tools,
    installedSkillHooks: options.installedSkillHooks,
    installedSkillAgentRunner: options.installedSkillAgentRunner,
    providerRuntimeContext: createAgentProviderRuntimeContext({
      workspaceRoot: options.workspaceRoot,
      config: options.config,
      envMap: options.envMap,
      runtimeOptions: options.runtimeOptions,
      effortLevel: options.effortLevel,
      buildWorkspaceSystemPrompt: options.buildWorkspaceSystemPrompt,
      buildProviderAdapter: options.buildProviderAdapter,
    }),
    runtime: options.runtime,
    swarmEnabledForTurn,
    existingSwarm: options.existingSwarm,
    createSwarm: options.createSwarm,
    assignSwarm: options.assignSwarm,
    setCompanionState: options.setCompanionState,
    appendStreamingToken: options.appendStreamingToken,
    logFirstToken: options.logFirstToken,
    postToken: options.postToken,
    startToolExecution: options.startToolExecution,
    finishToolExecution: options.finishToolExecution,
    onToolError: options.onToolError,
    modelActivityId: options.modelActivityId,
    finishModelActivity: options.finishModelActivity,
    logNoStreamingReply: options.logNoStreamingReply,
    recordAssistantReply: options.recordAssistantReply,
    clearStreamingText: options.clearStreamingText,
    queueAutoMemoryExtraction: options.queueAutoMemoryExtraction,
    updateMood: options.updateMood,
    runAgentImpl: options.runAgentImpl,
  });
}

export async function executePreparedPromptTurn<TSwarm>(options: {
  history: NormalizedMessage[];
  provider: IProviderAdapter;
  tools: ToolDefinition[];
  installedSkillHooks?: HookDefinition[];
  installedSkillAgentRunner?: AgentRunner;
  providerRuntimeContext?: AgentProviderRuntimeContext;
  runtime: { getToolContext(mode?: string): ToolContext };
  swarmEnabledForTurn: boolean;
  existingSwarm?: TSwarm;
  createSwarm: () => TSwarm;
  assignSwarm: (swarm: TSwarm) => void;
  setCompanionState: (state: "thinking" | "working" | "done") => void;
  appendStreamingToken: (token: string) => void;
  logFirstToken: (token: string) => void;
  postToken: (token: string) => void;
  startToolExecution: (
    execId: string,
    label: string,
    detail?: string,
  ) => void;
  finishToolExecution: (
    execId: string,
    status: "done" | "error",
    summary?: string,
  ) => void;
  onToolError?: () => void;
  modelActivityId: string;
  finishModelActivity: (
    activityId: string,
    status: "done",
    detail?: string,
  ) => void;
  logNoStreamingReply: () => void;
  recordAssistantReply: (
    reply: string,
    includeInConversation: boolean,
    thinkingSummary?: string,
  ) => Promise<void>;
  clearStreamingText: () => void;
  queueAutoMemoryExtraction: () => void;
  updateMood: (delta: number, countConversation?: boolean) => Promise<void>;
  runAgentImpl?: typeof runAgent;
}): Promise<void> {
  const activeSwarm = resolvePromptTurnSwarm({
    swarmEnabledForTurn: options.swarmEnabledForTurn,
    existingSwarm: options.existingSwarm,
    createSwarm: options.createSwarm,
  });
  if (
    options.swarmEnabledForTurn &&
    activeSwarm &&
    !options.existingSwarm
  ) {
    options.assignSwarm(activeSwarm);
  }

  options.setCompanionState("thinking");

  const promptTurnAgentCallbacks = createPromptTurnAgentCallbacks({
    appendStreamingToken: options.appendStreamingToken,
    logFirstToken: options.logFirstToken,
    postToken: options.postToken,
    setCompanionState: state => options.setCompanionState(state),
    startToolExecution: options.startToolExecution,
    finishToolExecution: options.finishToolExecution,
    onToolError: options.onToolError,
  });

  const { reply, sawStreamingToken, latestThinkingSummary } =
    await runPromptAgentTurn({
      history: options.history,
      provider: options.provider,
      tools: options.tools,
      installedSkillHooks: options.installedSkillHooks,
      installedSkillAgentRunner: options.installedSkillAgentRunner,
      providerRuntimeContext: options.providerRuntimeContext,
      toolContext: options.runtime.getToolContext(),
      activeSwarm: activeSwarm as SwarmCoordinator | undefined,
      onToken: promptTurnAgentCallbacks.onToken,
      onToolStart: promptTurnAgentCallbacks.onToolStart,
      onToolEnd: promptTurnAgentCallbacks.onToolEnd,
      runAgentImpl: options.runAgentImpl,
    });

  await finalizePromptTurnSuccess({
    modelActivityId: options.modelActivityId,
    reply,
    sawStreamingToken,
    latestThinkingSummary,
    finishModelActivity: options.finishModelActivity,
    logNoStreamingReply: options.logNoStreamingReply,
    recordAssistantReply: options.recordAssistantReply,
    clearStreamingText: options.clearStreamingText,
    queueAutoMemoryExtraction: options.queueAutoMemoryExtraction,
    setCompanionState: state => options.setCompanionState(state),
    updateMood: options.updateMood,
  });
}

export function createPromptTurnAgentCallbacks(options: {
  appendStreamingToken: (token: string) => void;
  logFirstToken: (token: string) => void;
  postToken: (token: string) => void;
  setCompanionState: (state: "working") => void;
  startToolExecution: (
    execId: string,
    label: string,
    detail?: string,
  ) => void;
  finishToolExecution: (
    execId: string,
    status: "done" | "error",
    summary?: string,
  ) => void;
  onToolError?: () => void;
}): {
  onToken: (token: string, meta: { isFirstToken: boolean }) => void;
  onToolStart: (
    toolName: string,
    input: Record<string, unknown>,
    execId: string,
  ) => void;
  onToolEnd: (
    execId: string,
    summary: string,
    isError: boolean,
    content?: string,
  ) => void;
} {
  return {
    onToken: (token, meta) => {
      options.appendStreamingToken(token);
      if (meta.isFirstToken) {
        options.logFirstToken(token);
      }
      options.postToken(token);
    },
    onToolStart: (toolName, input, execId) => {
      options.setCompanionState("working");
      options.startToolExecution(
        execId,
        getToolRunningLabel(formatToolDisplayName(toolName)),
        formatToolInputPreview(input),
      );
    },
    onToolEnd: (execId, summary, isError, _content) => {
      options.finishToolExecution(
        execId,
        isError ? "error" : "done",
        summary,
      );
      if (isError) {
        options.onToolError?.();
      }
    },
  };
}

export async function finalizePromptTurnSuccess(options: {
  modelActivityId: string;
  reply: string;
  sawStreamingToken: boolean;
  latestThinkingSummary?: string;
  finishModelActivity: (
    activityId: string,
    status: "done",
    detail?: string,
  ) => void;
  logNoStreamingReply: () => void;
  recordAssistantReply: (
    reply: string,
    includeInConversation: boolean,
    thinkingSummary?: string,
  ) => Promise<void>;
  clearStreamingText: () => void;
  queueAutoMemoryExtraction: () => void;
  setCompanionState: (state: "done") => void;
  updateMood: (delta: number, countConversation?: boolean) => Promise<void>;
}): Promise<void> {
  options.finishModelActivity(options.modelActivityId, "done");
  if (!options.sawStreamingToken && options.reply) {
    options.logNoStreamingReply();
  }
  await options.recordAssistantReply(
    options.reply,
    true,
    options.latestThinkingSummary,
  );
  options.clearStreamingText();
  options.queueAutoMemoryExtraction();
  options.setCompanionState("done");
  await options.updateMood(5, true);
}

export async function runPromptAgentTurn(options: {
  history: NormalizedMessage[];
  provider: IProviderAdapter;
  tools: ToolDefinition[];
  installedSkillHooks?: HookDefinition[];
  userHooks?: HookDefinition[];
  installedSkillAgentRunner?: AgentRunner;
  providerRuntimeContext?: AgentProviderRuntimeContext;
  toolContext: ToolContext;
  activeSwarm?: SwarmCoordinator;
  onToken?: (token: string, meta: { isFirstToken: boolean }) => void;
  onThinkingSummary?: (summary: string) => void;
  onToolStart?: (
    toolName: string,
    input: Record<string, unknown>,
    execId: string,
  ) => void;
  onToolEnd?: (
    execId: string,
    summary: string,
    isError: boolean,
    content?: string,
  ) => void;
  runAgentImpl?: typeof runAgent;
}): Promise<{
  reply: string;
  sawStreamingToken: boolean;
  latestThinkingSummary?: string;
  conversationHistory: NormalizedMessage[];
}> {
  const runAgentImpl = options.runAgentImpl ?? runAgent;
  const activeHooks = [
    ...(options.installedSkillHooks ?? []),
    ...(options.userHooks ?? []),
  ];
  let sawStreamingToken = false;
  let latestThinkingSummary: string | undefined;

  const { text: reply, messages } = await runAgentImpl(options.history, {
    provider: options.provider,
    tools: options.tools,
    toolContext: options.toolContext,
    beforeToolCall: activeHooks.length
      ? async (toolName, input, toolContext) => {
          const result = await triggerHooks(
            "PreToolCall",
            activeHooks,
            {
              workspaceRoot: toolContext.workspaceRoot,
              toolName,
            toolInput: input,
          },
          options.installedSkillAgentRunner,
        );
          if (result.blocked) {
            throw new Error(
              `Installed skill hook blocked tool call: ${toolName}`,
            );
          }
        }
      : undefined,
    afterToolCall: activeHooks.length
      ? async (toolName, input, output, isError, toolContext) => {
        await triggerHooks(
          "PostToolCall",
          activeHooks,
          {
            workspaceRoot: toolContext.workspaceRoot,
            toolName,
            toolInput: input,
            toolOutput: output,
            ...(isError ? { reply: String(output) } : {}),
          },
          options.installedSkillAgentRunner,
        );
      }
      : undefined,
    onToken: token => {
      const isFirstToken = !sawStreamingToken;
      if (isFirstToken) {
        sawStreamingToken = true;
      }
      options.onToken?.(token, { isFirstToken });
    },
    onThinkingSummary: summary => {
      latestThinkingSummary = summary;
      options.onThinkingSummary?.(summary);
    },
    onToolStart: options.onToolStart,
    onToolEnd: options.onToolEnd,
    providerRuntimeContext: options.providerRuntimeContext,
    swarm: options.activeSwarm,
  });

  return {
    reply,
    sawStreamingToken,
    latestThinkingSummary,
    conversationHistory: messages,
  };
}
