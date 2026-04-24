import type { ActivityTracker } from "./activityTracker";
import type {
  IProviderAdapter,
  NormalizedImageAttachment,
  ProviderConfig as AdapterProviderConfig,
} from "./agent/providers/IProviderAdapter";
import type {
  SwarmCoordinator,
  WorkerStateUpdate,
} from "./agent/swarm/SwarmCoordinator";
import { mergePendingAttachmentsIntoConversationMessage } from "./attachmentHandler";
import type { BackgroundTaskHost } from "./backgroundTaskHost";
import type { PendingPlanVerificationState } from "./conversationRuntimeStateHost";
import type { McpServerStatusSummary } from "./mcpRuntime";
import type {
  PromptExecutionResult,
  PromptRuntimeLike,
} from "./promptExecutionHost";
import type { PromptHostAssemblyOptions } from "./promptHostFactory";
import { runPromptRequestWithAssembly } from "./promptRequestFactory";
import type { SettingsRepository } from "./storage/settingsRepository";
import type { ChatMessage, SessionRepository } from "./storage/sessionRepository";
import type { ConversationTaskRuntime } from "./tasks/types";
import type { ToolDefinition } from "./toolRuntime";
import type { ProviderRuntimeOptions } from "./thinkingEffort/types";
import type { WorkspaceStatusController } from "./workspaceStatusHost";
import type { SkillStore } from "./skills/skillStore";
import type { ProfileStore } from "./userModel/profileStore";

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: NormalizedImageAttachment[];
};

type PlanModeStateLike = {
  active: boolean;
  planFilePath?: string;
};

type PromptRequestLogEvent =
  | "prompt-start"
  | "session-created"
  | "user-message-persisted";

export type PromptRequestExtensionBindings<
  TRuntime extends PromptRuntimeLike,
> = {
  request: {
    currentSessionId?: string;
    sessionMessagesLength: number;
    isSessionPersistenceEnabled: boolean;
    getWorkspaceHash: (workspaceRoot?: string) => string;
    logSession: (
      event: PromptRequestLogEvent,
      details: Record<string, unknown>,
    ) => void;
    createSession: (
      id: string,
      workspaceHash: string,
      title: string,
    ) => Promise<unknown>;
    setActiveSessionId: (id: string) => Promise<unknown>;
    ensureSession: (
      id: string,
      workspaceHash: string,
      title: string,
    ) => Promise<unknown>;
    appendMessages: (
      sessionId: string,
      messages: ChatMessage[],
      metaPatch?: { title?: string; updatedAt?: number; preview?: string },
    ) => Promise<unknown>;
    assignCurrentSessionId: (sessionId: string | undefined) => void;
  };
  hostAssembly: PromptHostAssemblyOptions<TRuntime>;
};

export type PromptRequestExtensionSessionBindings = {
  getCurrentSessionId: () => string | undefined;
  sessionMessages: ChatMessage[];
  isSessionPersistenceEnabled: boolean;
  settings: Pick<
    SettingsRepository,
    | "getEffortLevel"
    | "setEffortLevel"
    | "getFastMode"
    | "setFastMode"
    | "setActiveProviderModel"
    | "getProviderConfigByAlias"
    | "setActiveSessionId"
  >;
  sessions: Pick<
    SessionRepository,
    | "getTranscriptFilePath"
    | "createSession"
    | "ensureSession"
    | "appendMessages"
  >;
  getWorkspaceHash: (workspaceRoot?: string) => string;
  logSession: (
    event: PromptRequestLogEvent,
    details: Record<string, unknown>,
  ) => void;
  assignCurrentSessionId: (sessionId: string | undefined) => void;
};

export type PromptRequestExtensionConversationBindings = {
  getConversationHistory: () => ConversationMessage[];
  replaceConversationHistory: (messages: ConversationMessage[]) => void;
  appendConversationMessage: (message: ConversationMessage) => void;
  persistCurrentSessionRuntimeState: () => void;
  pendingPlanVerification: PendingPlanVerificationState | undefined;
  planModeState: PlanModeStateLike;
  getPendingPlanVerificationReminderTurns: () => number | null;
  getPlanContent: (workspaceRoot: string) => Promise<string | null>;
  getConversationTaskRuntime: () => ConversationTaskRuntime;
  buildPromptFileMentionContext: (options: {
    prompt: string;
    workspaceRoot: string;
  }) => Promise<{ supplementalPrompt?: string }>;
  existingSwarm?: SwarmCoordinator;
  assignSwarm: (swarm: SwarmCoordinator) => void;
  shouldEnableSwarmForPrompt: (prompt: string) => boolean;
  queueAutoMemoryExtraction: (options: {
    workspaceRoot: string;
    config: AdapterProviderConfig;
    envMap: Record<string, string>;
  }) => void;
};

export type PromptRequestExtensionExecutionBindings<
  TRuntime extends PromptRuntimeLike,
> = {
  workspaceFolderPath: string;
  activityTracker: Pick<
    ActivityTracker,
    "add" | "finish" | "startToolExecution" | "finishToolExecution"
  >;
  backgroundTaskHost: Pick<
    BackgroundTaskHost,
    "runBuiltInAgentSession" | "buildFollowUpMessage"
  >;
  workspaceStatusController: Pick<WorkspaceStatusController, "requestRefresh">;
  cachedTools?: ToolDefinition[];
  cachedToolsWorkspaceRoot?: string;
  setFreshWorkspaceTools: (options: {
    tools: ToolDefinition[];
    workspaceRoot: string;
    mcpServers?: McpServerStatusSummary[];
    providerLabel?: string;
  }) => void;
  resolveProviderConfig: () => Promise<{
    config: AdapterProviderConfig;
    envMap: Record<string, string>;
  }>;
  createProviderRuntimeOptions: (
    config: AdapterProviderConfig,
  ) => ProviderRuntimeOptions;
  ensureConversationWorktreeHydrated: (workspaceRoot: string) => Promise<void>;
  getEffectiveWorkspaceRoot: (workspaceRoot: string) => string;
  getWorkspaceRuntime: (
    envMap: Record<string, string>,
  ) => Promise<TRuntime>;
  buildProviderAdapter: (options: {
    config: AdapterProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions?: ProviderRuntimeOptions;
  }) => IProviderAdapter;
  findActiveBuiltInAgentTask: (
    workspaceRoot: string,
    agentType: string,
    diffRef?: string,
  ) => Promise<{ id: string } | undefined>;
  isAbortLikeError: (error: unknown) => boolean;
  markPendingPlanVerificationStarted: () => void;
  markPendingPlanVerificationCompleted: () => void;
  resetPendingPlanVerificationToAwaitingStart: () => void;
  appendStreamingText: (token: string) => void;
  scheduleStreamingStateUpdate: () => void;
  postChatToken: (token: string) => void;
  onToolError: () => void;
  setCompanionState: (state: "thinking" | "working" | "done" | "idle") => void;
  updateMood: (delta: number, countConversation?: boolean) => Promise<void>;
  recordAssistantReply: (
    reply: string,
    includeInConversation?: boolean,
    thinkingSummary?: string,
  ) => Promise<void>;
  clearStreamingText: () => void;
  toErrorMessage: (error: unknown) => string;
  postWorkerUpdate: WorkerStateUpdate;
  skillStore?: SkillStore;
  profileStore?: ProfileStore;
};

export type PromptRequestExtensionParts<
  TRuntime extends PromptRuntimeLike,
> = {
  session: PromptRequestExtensionSessionBindings;
  conversation: PromptRequestExtensionConversationBindings;
  execution: PromptRequestExtensionExecutionBindings<TRuntime>;
};

export function createPromptRequestSessionPart(
  options: PromptRequestExtensionSessionBindings,
): PromptRequestExtensionSessionBindings {
  return options;
}

export function createPromptRequestConversationPart(options: {
  getConversationHistory: () => ConversationMessage[];
  replaceConversationHistory: (messages: ConversationMessage[]) => void;
  conversationMessages: ConversationMessage[];
  getPendingPromptAttachments: () => NormalizedImageAttachment[] | undefined;
  setPendingPromptAttachments: (
    attachments: NormalizedImageAttachment[] | undefined,
  ) => void;
  persistCurrentSessionRuntimeState: () => void;
  pendingPlanVerification: PendingPlanVerificationState | undefined;
  planModeState: PlanModeStateLike;
  getPendingPlanVerificationReminderTurns: () => number | null;
  getPlanContent: (workspaceRoot: string) => Promise<string | null>;
  getConversationTaskRuntime: () => ConversationTaskRuntime;
  buildPromptFileMentionContext: (options: {
    prompt: string;
    workspaceRoot: string;
  }) => Promise<{ supplementalPrompt?: string }>;
  existingSwarm?: SwarmCoordinator;
  assignSwarm: (swarm: SwarmCoordinator) => void;
  shouldEnableSwarmForPrompt: (prompt: string) => boolean;
  queueAutoMemoryExtraction: (options: {
    workspaceRoot: string;
    config: AdapterProviderConfig;
    envMap: Record<string, string>;
  }) => void;
}): PromptRequestExtensionConversationBindings {
  return {
    getConversationHistory: options.getConversationHistory,
    replaceConversationHistory: options.replaceConversationHistory,
    appendConversationMessage: message => {
      const mergedMessage = mergePendingAttachmentsIntoConversationMessage({
        message,
        pendingAttachments: options.getPendingPromptAttachments(),
      });
      options.conversationMessages.push(mergedMessage.message);
      options.setPendingPromptAttachments(
        mergedMessage.remainingPendingAttachments,
      );
    },
    persistCurrentSessionRuntimeState:
      options.persistCurrentSessionRuntimeState,
    pendingPlanVerification: options.pendingPlanVerification,
    planModeState: options.planModeState,
    getPendingPlanVerificationReminderTurns:
      options.getPendingPlanVerificationReminderTurns,
    getPlanContent: options.getPlanContent,
    getConversationTaskRuntime: options.getConversationTaskRuntime,
    buildPromptFileMentionContext: options.buildPromptFileMentionContext,
    existingSwarm: options.existingSwarm,
    assignSwarm: options.assignSwarm,
    shouldEnableSwarmForPrompt: options.shouldEnableSwarmForPrompt,
    queueAutoMemoryExtraction: options.queueAutoMemoryExtraction,
  };
}

export function createPromptRequestExecutionPart<
  TRuntime extends PromptRuntimeLike,
>(
  options: PromptRequestExtensionExecutionBindings<TRuntime>,
): PromptRequestExtensionExecutionBindings<TRuntime> {
  return options;
}

export function createPromptRequestExtensionBindings<
  TRuntime extends PromptRuntimeLike,
>(
  parts: PromptRequestExtensionParts<TRuntime>,
): PromptRequestExtensionBindings<TRuntime> {
  return {
    request: {
      currentSessionId: parts.session.getCurrentSessionId(),
      sessionMessagesLength: parts.session.sessionMessages.length,
      isSessionPersistenceEnabled: parts.session.isSessionPersistenceEnabled,
      getWorkspaceHash: parts.session.getWorkspaceHash,
      logSession: parts.session.logSession,
      createSession: (id, workspaceHash, title) =>
        parts.session.sessions.createSession(id, workspaceHash, title),
      setActiveSessionId: id => parts.session.settings.setActiveSessionId(id),
      ensureSession: (id, workspaceHash, title) =>
        parts.session.sessions.ensureSession(id, workspaceHash, title),
      appendMessages: (sessionId, messages, metaPatch) =>
        parts.session.sessions.appendMessages(sessionId, messages, metaPatch),
      assignCurrentSessionId: parts.session.assignCurrentSessionId,
    },
    hostAssembly: {
      shared: {
        getConversationHistory: parts.conversation.getConversationHistory,
        isSessionPersistenceEnabled: () =>
          parts.session.isSessionPersistenceEnabled,
        getCurrentSessionId: parts.session.getCurrentSessionId,
        getTranscriptFilePath: sessionId =>
          parts.session.sessions.getTranscriptFilePath(sessionId),
        buildProviderAdapter: parts.execution.buildProviderAdapter,
        addPhaseActivity: (label, detail, status) =>
          parts.execution.activityTracker.add("phase", label, detail, status),
        finishPhaseActivity: (activityId, status, detail) =>
          parts.execution.activityTracker.finish(activityId, status, detail),
      },
      callbacks: {
        appendStreamingText: parts.execution.appendStreamingText,
        scheduleStreamingStateUpdate:
          parts.execution.scheduleStreamingStateUpdate,
        postChatToken: parts.execution.postChatToken,
        startToolExecution: (execId, label, detail) =>
          parts.execution.activityTracker.startToolExecution(
            execId,
            label,
            detail,
          ),
        finishToolExecution: (execId, status, summary) =>
          parts.execution.activityTracker.finishToolExecution(
            execId,
            status,
            summary,
          ),
        onToolError: parts.execution.onToolError,
        setCompanionState: parts.execution.setCompanionState,
        updateMood: parts.execution.updateMood,
        recordAssistantReply: parts.execution.recordAssistantReply,
        clearStreamingText: parts.execution.clearStreamingText,
      },
      entry: {
        getCurrentEffortLevel: () => parts.session.settings.getEffortLevel(),
        setEffortLevel: value => parts.session.settings.setEffortLevel(value),
        getCurrentFastMode: () => parts.session.settings.getFastMode(),
        setFastMode: enabled => parts.session.settings.setFastMode(enabled),
        setActiveProviderModel: model =>
          parts.session.settings.setActiveProviderModel(model),
        resolveProviderConfig: parts.execution.resolveProviderConfig,
        getEffortLevel: () => parts.session.settings.getEffortLevel(),
        createProviderRuntimeOptions:
          parts.execution.createProviderRuntimeOptions,
        ensureConversationWorktreeHydrated:
          parts.execution.ensureConversationWorktreeHydrated,
        getEffectiveWorkspaceRoot: parts.execution.getEffectiveWorkspaceRoot,
        getWorkspaceRuntime: parts.execution.getWorkspaceRuntime,
        cachedTools: parts.execution.cachedTools,
        cachedToolsWorkspaceRoot: parts.execution.cachedToolsWorkspaceRoot,
        setFreshWorkspaceTools: parts.execution.setFreshWorkspaceTools,
        refreshWorkspaceStatus:
          parts.execution.workspaceStatusController.requestRefresh,
        getPendingPlanVerification: () =>
          parts.conversation.pendingPlanVerification,
        sessionMessages: parts.session.sessionMessages,
        blockedByPlanMode: parts.conversation.planModeState.active,
        replaceConversationHistory:
          parts.conversation.replaceConversationHistory,
        backgroundTaskHost: parts.execution.backgroundTaskHost,
        findActiveBuiltInAgentTask: parts.execution.findActiveBuiltInAgentTask,
        isAbortLikeError: parts.execution.isAbortLikeError,
        markPendingPlanVerificationStarted:
          parts.execution.markPendingPlanVerificationStarted,
        markPendingPlanVerificationCompleted:
          parts.execution.markPendingPlanVerificationCompleted,
        resetPendingPlanVerificationToAwaitingStart:
          parts.execution.resetPendingPlanVerificationToAwaitingStart,
        skillStore: parts.execution.skillStore,
        profileStore: parts.execution.profileStore,
      },
      flow: {
        autoCompact: {
          replaceConversationHistory:
            parts.conversation.replaceConversationHistory,
          toErrorMessage: parts.execution.toErrorMessage,
        },
        swarmFactory: {
          workspaceFolderPath: parts.execution.workspaceFolderPath,
          backgroundTasks: parts.conversation.getConversationTaskRuntime(),
          resolveWorkerProviderConfig: alias =>
            parts.session.settings.getProviderConfigByAlias(alias),
          createProviderRuntimeOptions:
            parts.execution.createProviderRuntimeOptions,
          getEffectiveWorkspaceRoot: parts.execution.getEffectiveWorkspaceRoot,
          postWorkerUpdate: parts.execution.postWorkerUpdate,
        },
        systemPrompt: {
          planModeState: parts.conversation.planModeState,
          getPendingPlanVerification: () =>
            parts.conversation.pendingPlanVerification,
          getPendingPlanVerificationReminderTurns:
            parts.conversation.getPendingPlanVerificationReminderTurns,
          getPlanContent: parts.conversation.getPlanContent,
          profileStore: parts.execution.profileStore,
        },
        appendConversationMessage:
          parts.conversation.appendConversationMessage,
        buildPromptFileMentionContext:
          parts.conversation.buildPromptFileMentionContext,
        persistCurrentSessionRuntimeState:
          parts.conversation.persistCurrentSessionRuntimeState,
        existingSwarm: parts.conversation.existingSwarm,
        assignSwarm: parts.conversation.assignSwarm,
        shouldEnableSwarmForPrompt:
          parts.conversation.shouldEnableSwarmForPrompt,
        queueAutoMemoryExtraction:
          parts.conversation.queueAutoMemoryExtraction,
      },
    },
  };
}

export async function runPromptRequestWithExtensionHost<
  TRuntime extends PromptRuntimeLike,
>(options: {
  prompt: string;
  workspaceFolderPath: string;
  bindings: PromptRequestExtensionBindings<TRuntime>;
}): Promise<PromptExecutionResult<TRuntime>> {
  return runPromptRequestWithAssembly({
    prompt: options.prompt,
    workspaceFolderPath: options.workspaceFolderPath,
    ...options.bindings.request,
    hostAssembly: options.bindings.hostAssembly,
  });
}

export async function runPromptRequestWithExtensionParts<
  TRuntime extends PromptRuntimeLike,
>(options: {
  prompt: string;
  parts: PromptRequestExtensionParts<TRuntime>;
}): Promise<PromptExecutionResult<TRuntime>> {
  return runPromptRequestWithExtensionHost({
    prompt: options.prompt,
    workspaceFolderPath: options.parts.execution.workspaceFolderPath,
    bindings: createPromptRequestExtensionBindings(options.parts),
  });
}
