import type {
  IProviderAdapter,
  ProviderConfig as AdapterProviderConfig,
} from "./agent/providers/IProviderAdapter";
import type { SkillStore } from "./skills/skillStore";
import type { ProfileStore } from "./userModel/profileStore";
import type { BackgroundTaskHost } from "./backgroundTaskHost";
import { handleCompactCommandWithHost } from "./compactHost";
import type { PendingPlanVerificationState } from "./conversationRuntimeStateHost";
import {
  handleReviewCommandWithHost,
  handleVerificationCommandWithHost,
} from "./inspectionHost";
import type { McpServerStatusSummary } from "./mcpRuntime";
import {
  handleLocalPromptCommand,
  handlePlanModePromptCommand,
  runPromptCommandChain,
} from "./promptCommandHost";
import type { ChatMessage } from "./storage/sessionRepository";
import type { CompactBoundarySessionState } from "./storage/sessionRepository";
import {
  loadWorkspaceTools,
  prepareHydratedWorkspaceRuntime,
  prepareProviderExecutionContext,
  type ProviderResolution,
  type WorkspaceRuntimeLike,
} from "./workspaceHost";
import type { ToolContext, ToolDefinition } from "./toolRuntime";
import type { EffortLevel, ProviderRuntimeOptions } from "./thinkingEffort/types";

export type PromptRuntimeLike = WorkspaceRuntimeLike & {
  getToolContext(mode?: string): ToolContext;
};

export type PromptExecutionResult<TRuntime> =
  | { kind: "reply"; reply: string }
  | { kind: "handled" }
  | {
      kind: "continue";
      config: AdapterProviderConfig;
      envMap: Record<string, string>;
      effortLevel: EffortLevel | undefined;
      runtimeOptions: ProviderRuntimeOptions;
      workspaceRoot: string;
      runtime: TRuntime;
      tools: ToolDefinition[];
    };

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export function createPromptExecutionCommandHandlers<
  TRuntime extends PromptRuntimeLike,
>(options: {
  workspaceFolderPath: string;
  getCurrentEffortLevel: () => EffortLevel | undefined;
  setEffortLevel: (value: EffortLevel | undefined) => Promise<unknown>;
  getCurrentFastMode: () => boolean;
  setFastMode: (enabled: boolean) => Promise<unknown>;
  setActiveProviderModel: (model: string) => Promise<unknown>;
  refreshWorkspaceStatus: () => void;
  getConversationHistory: () => ConversationMessage[];
  getPendingPlanVerification: () => PendingPlanVerificationState | undefined;
  sessionMessages: ChatMessage[];
  blockedByPlanMode: boolean;
  getTranscriptPath: () => string | undefined;
  replaceConversationHistory: (
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    compactBoundary?: CompactBoundarySessionState,
  ) => void | Promise<void>;
  backgroundTaskHost: Pick<
    BackgroundTaskHost,
    "runBuiltInAgentSession" | "buildFollowUpMessage"
  >;
  findActiveBuiltInAgentTask: (
    workspaceRoot: string,
    agentType: string,
    diffRef?: string,
  ) => Promise<{ id: string } | undefined>;
  createProviderAdapter: (options: {
    config: AdapterProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions?: ProviderRuntimeOptions;
  }) => IProviderAdapter;
  onStreamingToken: (token: string) => void;
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
  addPhaseActivity: (
    label: string,
    detail: string,
    status: "running",
  ) => string;
  finishPhaseActivity: (
    activityId: string,
    status: "done" | "error",
    detail?: string,
  ) => void;
  recordAssistantReply: (
    reply: string,
    includeInConversation?: boolean,
  ) => Promise<void>;
  setCompanionState: (state: "thinking" | "working" | "done" | "idle") => void;
  clearStreamingText: () => void;
  updateMood: (delta: number, countConversation?: boolean) => Promise<void>;
  isAbortLikeError: (error: unknown) => boolean;
  markPendingPlanVerificationStarted: () => void;
  markPendingPlanVerificationCompleted: () => void;
  resetPendingPlanVerificationToAwaitingStart: () => void;
  skillStore?: SkillStore;
  profileStore?: ProfileStore;
}) {
  return {
    tryHandleLocalCommand: (
      prompt: string,
      config: AdapterProviderConfig,
    ) =>
      handleLocalPromptCommand({
        prompt,
        config,
        workspaceRoot: options.workspaceFolderPath,
        currentEffortLevel: options.getCurrentEffortLevel(),
        setEffortLevel: options.setEffortLevel,
        currentFastMode: options.getCurrentFastMode(),
        setFastMode: options.setFastMode,
        setActiveProviderModel: options.setActiveProviderModel,
        refreshWorkspaceStatus: options.refreshWorkspaceStatus,
        skillStore: options.skillStore,
      }),
    tryHandlePlanModeCommand: (
      prompt: string,
      runtime: TRuntime,
    ) =>
      handlePlanModePromptCommand({
        prompt,
        runtime,
      }),
    handleCompactCommand: (
      prompt: string,
      workspaceRoot: string,
      config: AdapterProviderConfig,
      envMap: Record<string, string>,
    ) =>
      handleCompactCommandWithHost({
        commandText: prompt,
        workspaceRoot,
        config,
        envMap,
        getConversationHistory: options.getConversationHistory,
        getTranscriptPath: options.getTranscriptPath,
        replaceConversationHistory: options.replaceConversationHistory,
        createProviderAdapter: compactOptions =>
          options.createProviderAdapter(compactOptions),
        addPhaseActivity: options.addPhaseActivity,
        finishPhaseActivity: options.finishPhaseActivity,
        recordAssistantReply: options.recordAssistantReply,
        setCompanionState: options.setCompanionState,
        updateMood: options.updateMood,
        toErrorMessage: error =>
          error instanceof Error ? error.message : String(error),
      }),
    handleReviewCommand: (
      prompt: string,
      workspaceRoot: string,
      config: AdapterProviderConfig,
      envMap: Record<string, string>,
      runtime: TRuntime,
      tools: ToolDefinition[],
      runtimeOptions: ProviderRuntimeOptions,
      effortLevel: EffortLevel | undefined,
    ) =>
      handleReviewCommandWithHost({
        commandText: prompt,
        workspaceRoot,
        config,
        envMap,
        runtime,
        tools,
        runtimeOptions,
        effortLevel,
        sessionMessages: options.sessionMessages,
        blockedByPlanMode: options.blockedByPlanMode,
        getConversationHistory: options.getConversationHistory,
        getPendingPlanVerification: options.getPendingPlanVerification,
        backgroundTaskHost: options.backgroundTaskHost,
        findActiveBuiltInAgentTask: options.findActiveBuiltInAgentTask,
        createProviderAdapter: reviewOptions =>
          options.createProviderAdapter(reviewOptions),
        onStreamingToken: options.onStreamingToken,
        startToolExecution: options.startToolExecution,
        finishToolExecution: options.finishToolExecution,
        addPhaseActivity: options.addPhaseActivity,
        finishPhaseActivity: options.finishPhaseActivity,
        recordAssistantReply: options.recordAssistantReply,
        setCompanionState: options.setCompanionState,
        clearStreamingText: options.clearStreamingText,
        updateMood: options.updateMood,
        isAbortLikeError: options.isAbortLikeError,
      }),
    handleVerificationCommand: (
      prompt: string,
      workspaceRoot: string,
      config: AdapterProviderConfig,
      envMap: Record<string, string>,
      runtime: TRuntime,
      tools: ToolDefinition[],
      runtimeOptions: ProviderRuntimeOptions,
      effortLevel: EffortLevel | undefined,
    ) =>
      handleVerificationCommandWithHost({
        commandText: prompt,
        workspaceRoot,
        config,
        envMap,
        runtime,
        tools,
        runtimeOptions,
        effortLevel,
        sessionMessages: options.sessionMessages,
        blockedByPlanMode: options.blockedByPlanMode,
        getConversationHistory: options.getConversationHistory,
        getPendingPlanVerification: options.getPendingPlanVerification,
        backgroundTaskHost: options.backgroundTaskHost,
        findActiveBuiltInAgentTask: options.findActiveBuiltInAgentTask,
        createProviderAdapter: verificationOptions =>
          options.createProviderAdapter(verificationOptions),
        onStreamingToken: options.onStreamingToken,
        startToolExecution: options.startToolExecution,
        finishToolExecution: options.finishToolExecution,
        addPhaseActivity: options.addPhaseActivity,
        finishPhaseActivity: options.finishPhaseActivity,
        recordAssistantReply: options.recordAssistantReply,
        setCompanionState: options.setCompanionState,
        clearStreamingText: options.clearStreamingText,
        updateMood: options.updateMood,
        isAbortLikeError: options.isAbortLikeError,
        markPendingPlanVerificationStarted:
          options.markPendingPlanVerificationStarted,
        markPendingPlanVerificationCompleted:
          options.markPendingPlanVerificationCompleted,
        resetPendingPlanVerificationToAwaitingStart:
          options.resetPendingPlanVerificationToAwaitingStart,
        onUnexpectedError: (message, activityId) => {
          options.finishPhaseActivity(activityId, "error", message);
        },
      }),
  };
}

export async function preparePromptExecutionStep<TRuntime extends PromptRuntimeLike>(
  options: {
    prompt: string;
    workspaceFolderPath: string;
    resolveProviderConfig: () => Promise<ProviderResolution>;
    getEffortLevel: () => EffortLevel | undefined;
    createProviderRuntimeOptions: (
      config: AdapterProviderConfig,
    ) => ProviderRuntimeOptions;
    ensureConversationWorktreeHydrated: (workspaceRoot: string) => Promise<void>;
    getEffectiveWorkspaceRoot: (workspaceRoot: string) => string;
    getWorkspaceRuntime: (
      envMap: Record<string, string>,
    ) => Promise<TRuntime>;
    cachedTools?: ToolDefinition[];
    cachedToolsWorkspaceRoot?: string;
    setFreshWorkspaceTools: (options: {
      tools: ToolDefinition[];
      workspaceRoot: string;
      mcpServers?: McpServerStatusSummary[];
      providerLabel?: string;
    }) => void;
    startActivity?: (label: string, detail?: string) => string | undefined;
    finishActivity?: (
      activityId: string | undefined,
      detail?: string,
    ) => void;
    tryHandleLocalCommand: (
      prompt: string,
      config: AdapterProviderConfig,
    ) => Promise<string | null>;
    tryHandlePlanModeCommand: (
      prompt: string,
      runtime: TRuntime,
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
      runtime: TRuntime,
      tools: ToolDefinition[],
      runtimeOptions: ProviderRuntimeOptions,
      effortLevel: EffortLevel | undefined,
    ) => Promise<boolean>;
    handleVerificationCommand: (
      prompt: string,
      workspaceRoot: string,
      config: AdapterProviderConfig,
      envMap: Record<string, string>,
      runtime: TRuntime,
      tools: ToolDefinition[],
      runtimeOptions: ProviderRuntimeOptions,
      effortLevel: EffortLevel | undefined,
    ) => Promise<boolean>;
    profileStore?: ProfileStore;
  },
): Promise<PromptExecutionResult<TRuntime>> {
  const configActivityId = options.startActivity?.("正在加载 Provider 配置");
  const providerContext = await prepareProviderExecutionContext({
    resolveProviderConfig: options.resolveProviderConfig,
    getEffortLevel: options.getEffortLevel,
    createProviderRuntimeOptions: options.createProviderRuntimeOptions,
  });
  const configLabel = `${providerContext.config.type}${("model" in providerContext.config && providerContext.config.model) ? ` · ${providerContext.config.model}` : ""}`;
  options.finishActivity?.(configActivityId, configLabel);

  const localCommandReply = await options.tryHandleLocalCommand(
    options.prompt,
    providerContext.config,
  );
  if (localCommandReply) {
    return {
      kind: "reply",
      reply: localCommandReply,
    };
  }

  const runtimeContext = await prepareHydratedWorkspaceRuntime({
    workspaceFolderPath: options.workspaceFolderPath,
    envMap: providerContext.envMap,
    ensureConversationWorktreeHydrated: options.ensureConversationWorktreeHydrated,
    getEffectiveWorkspaceRoot: options.getEffectiveWorkspaceRoot,
    getWorkspaceRuntime: options.getWorkspaceRuntime,
  });

  const shouldLoadWorkspaceTools =
    !options.cachedTools ||
    options.cachedToolsWorkspaceRoot !== runtimeContext.workspaceRoot;
  const toolActivityId = shouldLoadWorkspaceTools
    ? options.startActivity?.("正在连接工具与 MCP")
    : undefined;

  const loadedTools = await loadWorkspaceTools({
    runtime: runtimeContext.runtime,
    config: providerContext.config,
    workspaceRoot: runtimeContext.workspaceRoot,
    cachedTools: options.cachedTools,
    cachedToolsWorkspaceRoot: options.cachedToolsWorkspaceRoot,
  });

  if (!loadedTools.reusedCache) {
    options.setFreshWorkspaceTools({
      tools: loadedTools.tools,
      workspaceRoot: runtimeContext.workspaceRoot,
      mcpServers: loadedTools.mcpServers,
      providerLabel: loadedTools.providerLabel,
    });
    options.finishActivity?.(toolActivityId, `${loadedTools.tools.length} tools ready`);
  }

  const promptCommandResult = await runPromptCommandChain({
    prompt: options.prompt,
    config: providerContext.config,
    workspaceRoot: runtimeContext.workspaceRoot,
    envMap: providerContext.envMap,
    runtime: runtimeContext.runtime,
    tools: loadedTools.tools,
    runtimeOptions: providerContext.runtimeOptions,
    effortLevel: providerContext.effortLevel,
    profileStore: options.profileStore,
    tryHandleLocalCommand: async () => null,
    tryHandlePlanModeCommand: (prompt, runtime) =>
      options.tryHandlePlanModeCommand(prompt, runtime as TRuntime),
    handleCompactCommand: options.handleCompactCommand,
    handleReviewCommand: (
      prompt,
      workspaceRoot,
      config,
      envMap,
      runtime,
      tools,
      runtimeOptions,
      effortLevel,
    ) =>
      options.handleReviewCommand(
        prompt,
        workspaceRoot,
        config,
        envMap,
        runtime as TRuntime,
        tools,
        runtimeOptions,
        effortLevel,
      ),
    handleVerificationCommand: (
      prompt,
      workspaceRoot,
      config,
      envMap,
      runtime,
      tools,
      runtimeOptions,
      effortLevel,
    ) =>
      options.handleVerificationCommand(
        prompt,
        workspaceRoot,
        config,
        envMap,
        runtime as TRuntime,
        tools,
        runtimeOptions,
        effortLevel,
      ),
  });

  if (promptCommandResult.kind !== "continue") {
    return promptCommandResult;
  }

  return {
    kind: "continue",
    config: providerContext.config,
    envMap: providerContext.envMap,
    effortLevel: providerContext.effortLevel,
    runtimeOptions: providerContext.runtimeOptions,
    workspaceRoot: runtimeContext.workspaceRoot,
    runtime: runtimeContext.runtime,
    tools: loadedTools.tools,
  };
}
