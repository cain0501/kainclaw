import { persistUserPromptSession } from "./promptSessionHost";
import {
  createPromptExecutionCommandHandlers,
  preparePromptExecutionStep,
  type PromptExecutionResult,
  type PromptRuntimeLike,
} from "./promptExecutionHost";
import type { BackgroundTaskHost } from "./backgroundTaskHost";
import type { PendingPlanVerificationState } from "./conversationRuntimeStateHost";
import type { HookDefinition } from "./hooksRegistry";
import type { McpServerStatusSummary } from "./mcpRuntime";
import type { PromptSharedBindings } from "./promptBindingsHost";
import type {
  IProviderAdapter,
  ProviderConfig as AdapterProviderConfig,
} from "./agent/providers/IProviderAdapter";
import type { ChatMessage } from "./storage/sessionRepository";
import type { ToolDefinition } from "./toolRuntime";
import type { EffortLevel, ProviderRuntimeOptions } from "./thinkingEffort/types";
import type { SkillStore } from "./skills/skillStore";
import type { ProfileStore } from "./userModel/profileStore";

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type PromptEntryCommandBindings<TRuntime extends PromptRuntimeLike> = {
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
  ) => void;
  backgroundTaskHost: Pick<
    BackgroundTaskHost,
    | "runBuiltInAgentSession"
    | "buildFollowUpMessage"
    | "runDetachedRemoteReview"
    | "runDetachedRemoteVerification"
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
  getSessionInstalledSkillHooks?: () => HookDefinition[];
  registerSessionInstalledSkillHooks?: (
    hooks: HookDefinition[],
  ) => HookDefinition[];
  skillStore?: SkillStore;
  profileStore?: ProfileStore;
};

export function createPromptEntryCommandBindings<
  TRuntime extends PromptRuntimeLike,
>(options: PromptEntryCommandBindings<TRuntime>): PromptEntryCommandBindings<TRuntime> {
  return options;
}

export type PromptEntryRuntimeBindings<TRuntime extends PromptRuntimeLike> = {
  resolveProviderConfig: () => Promise<{
    config: AdapterProviderConfig;
    envMap: Record<string, string>;
  }>;
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
  startActivity: (label: string, detail?: string) => string | undefined;
  finishActivity: (
    activityId: string | undefined,
    detail?: string,
  ) => void;
};

export function createPromptEntryRuntimeBindings<
  TRuntime extends PromptRuntimeLike,
>(
  options: PromptEntryRuntimeBindings<TRuntime>,
): PromptEntryRuntimeBindings<TRuntime> {
  return options;
}

export type PromptEntryHostBindings<TRuntime extends PromptRuntimeLike> = {
  runtimeBindings: PromptEntryRuntimeBindings<TRuntime>;
  commandBindings: PromptEntryCommandBindings<TRuntime>;
};

export function createPromptEntryHostBindings<
  TRuntime extends PromptRuntimeLike,
>(
  options: PromptEntryHostBindings<TRuntime>,
): PromptEntryHostBindings<TRuntime> {
  return options;
}

export function createPromptEntryBindings<
  TRuntime extends PromptRuntimeLike,
>(
  options: PromptEntryRuntimeBindings<TRuntime> &
    PromptEntryCommandBindings<TRuntime>,
): PromptEntryHostBindings<TRuntime> {
  return createPromptEntryHostBindings({
    runtimeBindings: createPromptEntryRuntimeBindings(options),
    commandBindings: createPromptEntryCommandBindings(options),
  });
}

export function createPromptEntryBindingsFromShared<
  TRuntime extends PromptRuntimeLike,
>(options: {
  sharedBindings: PromptSharedBindings;
  getCurrentEffortLevel: () => EffortLevel | undefined;
  setEffortLevel: (value: EffortLevel | undefined) => Promise<unknown>;
  getCurrentFastMode: () => boolean;
  setFastMode: (enabled: boolean) => Promise<unknown>;
  setActiveProviderModel: (model: string) => Promise<unknown>;
  resolveProviderConfig: () => Promise<{
    config: AdapterProviderConfig;
    envMap: Record<string, string>;
  }>;
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
  refreshWorkspaceStatus: () => void;
  getPendingPlanVerification: () => PendingPlanVerificationState | undefined;
  sessionMessages: ChatMessage[];
  blockedByPlanMode: boolean;
  replaceConversationHistory: (
    messages: Array<{ role: "user" | "assistant"; content: string }>,
  ) => void;
  backgroundTaskHost: Pick<
    BackgroundTaskHost,
    | "runBuiltInAgentSession"
    | "buildFollowUpMessage"
    | "runDetachedRemoteReview"
    | "runDetachedRemoteVerification"
  >;
  findActiveBuiltInAgentTask: (
    workspaceRoot: string,
    agentType: string,
    diffRef?: string,
  ) => Promise<{ id: string } | undefined>;
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
  getSessionInstalledSkillHooks?: () => HookDefinition[];
  registerSessionInstalledSkillHooks?: (
    hooks: HookDefinition[],
  ) => HookDefinition[];
  skillStore?: SkillStore;
  profileStore?: ProfileStore;
}): PromptEntryHostBindings<TRuntime> {
  return createPromptEntryBindings({
    resolveProviderConfig: options.resolveProviderConfig,
    getEffortLevel: options.getEffortLevel,
    createProviderRuntimeOptions: options.createProviderRuntimeOptions,
    ensureConversationWorktreeHydrated:
      options.ensureConversationWorktreeHydrated,
    getEffectiveWorkspaceRoot: options.getEffectiveWorkspaceRoot,
    getWorkspaceRuntime: options.getWorkspaceRuntime,
    cachedTools: options.cachedTools,
    cachedToolsWorkspaceRoot: options.cachedToolsWorkspaceRoot,
    setFreshWorkspaceTools: options.setFreshWorkspaceTools,
    startActivity: (label, detail) =>
      options.sharedBindings.addPhaseActivity(label, detail, "running"),
    finishActivity: (activityId, detail) => {
      if (activityId) {
        options.sharedBindings.finishPhaseActivity(
          activityId,
          "done",
          detail,
        );
      }
    },
    getCurrentEffortLevel: options.getCurrentEffortLevel,
    setEffortLevel: options.setEffortLevel,
    getCurrentFastMode: options.getCurrentFastMode,
    setFastMode: options.setFastMode,
    setActiveProviderModel: options.setActiveProviderModel,
    refreshWorkspaceStatus: options.refreshWorkspaceStatus,
    getConversationHistory: options.sharedBindings.getConversationHistory,
    getPendingPlanVerification: options.getPendingPlanVerification,
    sessionMessages: options.sessionMessages,
    blockedByPlanMode: options.blockedByPlanMode,
    getTranscriptPath: options.sharedBindings.getTranscriptPath,
    replaceConversationHistory: options.replaceConversationHistory,
    backgroundTaskHost: options.backgroundTaskHost,
    findActiveBuiltInAgentTask: options.findActiveBuiltInAgentTask,
    createProviderAdapter: options.sharedBindings.createProviderAdapter,
    onStreamingToken: options.onStreamingToken,
    startToolExecution: options.startToolExecution,
    finishToolExecution: options.finishToolExecution,
    addPhaseActivity: options.sharedBindings.addPhaseActivity,
    finishPhaseActivity: options.sharedBindings.finishPhaseActivity,
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
    getSessionInstalledSkillHooks: options.getSessionInstalledSkillHooks,
    registerSessionInstalledSkillHooks:
      options.registerSessionInstalledSkillHooks,
    skillStore: options.skillStore,
    profileStore: options.profileStore,
  });
}

export async function preparePromptEntryWithHost<
  TRuntime extends PromptRuntimeLike,
>(options: {
  prompt: string;
  workspaceFolderPath: string;
  currentSessionId?: string;
  sessionMessagesLength: number;
  isSessionPersistenceEnabled: boolean;
  getWorkspaceHash: (workspaceRoot?: string) => string;
  logSession: (
    event:
      | "prompt-start"
      | "session-created"
      | "user-message-persisted",
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
  bindings: PromptEntryHostBindings<TRuntime>;
}): Promise<{
  currentSessionId?: string;
  promptExecution: PromptExecutionResult<TRuntime>;
}> {
  const workspaceHash = options.getWorkspaceHash(options.workspaceFolderPath);
  options.logSession("prompt-start", {
    promptPreview: options.prompt.slice(0, 80),
    workspaceHash,
  });

  const sessionPersistence = await persistUserPromptSession({
    enabled: options.isSessionPersistenceEnabled,
    currentSessionId: options.currentSessionId,
    workspaceHash,
    prompt: options.prompt,
    sessionMessagesLength: options.sessionMessagesLength,
    createSession: options.createSession,
    setActiveSessionId: options.setActiveSessionId,
    ensureSession: options.ensureSession,
    appendMessages: options.appendMessages,
  });

  if (sessionPersistence.createdSessionId) {
    options.logSession("session-created", {
      source: "prompt",
      sessionId: sessionPersistence.createdSessionId,
      workspaceHash,
    });
  }

  if (sessionPersistence.persistedSessionId) {
    options.logSession("user-message-persisted", {
      sessionId: sessionPersistence.persistedSessionId,
      promptPreview: sessionPersistence.promptPreview,
    });
  }

  const promptExecutionCommandHandlers = createPromptExecutionCommandHandlers({
    workspaceFolderPath: options.workspaceFolderPath,
    ...options.bindings.commandBindings,
  });

  const promptExecution = await preparePromptExecutionStep({
    prompt: options.prompt,
    workspaceFolderPath: options.workspaceFolderPath,
    ...options.bindings.runtimeBindings,
    ...promptExecutionCommandHandlers,
    profileStore: options.bindings.commandBindings.profileStore,
  });

  return {
    currentSessionId: sessionPersistence.currentSessionId,
    promptExecution,
  };
}
