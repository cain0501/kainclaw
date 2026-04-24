import type { IProviderAdapter, ProviderConfig } from "./agent/providers/IProviderAdapter";
import type { BackgroundTaskHost } from "./backgroundTaskHost";
import type { PendingPlanVerificationState } from "./conversationRuntimeStateHost";
import { getToolRunningLabel } from "./hostUi";
import {
  describeToolInput as formatToolInputPreview,
  describeToolName as formatToolDisplayName,
} from "./hostRuntimeHelpers";
import {
  handleReviewPromptCommand,
  handleVerificationPromptCommand,
} from "./inspectionPromptHost";
import {
  runReviewInspectionSession,
  runVerificationInspectionSession,
} from "./inspectionSessionHost";
import type { ChatMessage } from "./storage/sessionRepository";
import type { BackgroundTaskRecord } from "./tasks/types";
import type { EffortLevel, ProviderRuntimeOptions } from "./thinkingEffort/types";
import {
  runReviewFromTool as launchReviewFromTool,
  runVerificationFromTool as launchVerificationFromTool,
} from "./toolLaunchHost";
import type { ToolContext, ToolDefinition } from "./toolRuntime";
import type { VerificationVerdict } from "./verification/prompt";
import type {
  ProviderResolution,
  WorkspaceRuntimeLike,
} from "./workspaceHost";

type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type InspectionRuntimeLike = {
  getToolContext: () => ToolContext;
};

type SharedInspectionSessionHostOptions<TRuntime extends InspectionRuntimeLike> = {
  commandText: string;
  workspaceRoot: string;
  config: ProviderConfig;
  envMap: Record<string, string>;
  runtime: TRuntime;
  tools: ToolDefinition[];
  runtimeOptions: ProviderRuntimeOptions;
  effortLevel: EffortLevel | undefined;
  getConversationHistory: () => ConversationMessage[];
  sessionMessages: ChatMessage[];
  getPendingPlanVerification: () => PendingPlanVerificationState | undefined;
  backgroundTaskHost: Pick<BackgroundTaskHost, "runBuiltInAgentSession">;
  findActiveBuiltInAgentTask: (
    workspaceRoot: string,
    agentType: string,
    diffRef?: string,
  ) => Promise<Pick<BackgroundTaskRecord, "id"> | undefined>;
  createProviderAdapter: (options: {
    config: ProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions: ProviderRuntimeOptions;
  }) => IProviderAdapter;
  onToken?: (token: string) => void;
  onToolStart?: (toolName: string, input: Record<string, unknown>, execId: string) => void;
  onToolEnd?: (execId: string, summary: string, isError: boolean) => void;
};

type SharedInspectionCommandHostOptions<
  TRuntime extends WorkspaceRuntimeLike & InspectionRuntimeLike,
> = {
  commandText: string;
  workspaceRoot: string;
  config: ProviderConfig;
  envMap: Record<string, string>;
  runtime: TRuntime;
  tools: ToolDefinition[];
  runtimeOptions: ProviderRuntimeOptions;
  effortLevel: EffortLevel | undefined;
  sessionMessages: ChatMessage[];
  blockedByPlanMode: boolean;
  getConversationHistory: () => ConversationMessage[];
  getPendingPlanVerification: () => PendingPlanVerificationState | undefined;
  backgroundTaskHost: Pick<
    BackgroundTaskHost,
    "runBuiltInAgentSession" | "buildFollowUpMessage"
  >;
  findActiveBuiltInAgentTask: (
    workspaceRoot: string,
    agentType: string,
    diffRef?: string,
  ) => Promise<Pick<BackgroundTaskRecord, "id"> | undefined>;
  createProviderAdapter: (options: {
    config: ProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions: ProviderRuntimeOptions;
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
};

export async function runVerificationSessionWithHost<TRuntime extends InspectionRuntimeLike>(options: SharedInspectionSessionHostOptions<TRuntime> & {
  markPendingPlanVerificationStarted: () => void;
  markPendingPlanVerificationCompleted: () => void;
  resetPendingPlanVerificationToAwaitingStart: () => void;
}): Promise<{ taskId: string; report: string; verdict: VerificationVerdict }> {
  return runVerificationInspectionSession({
    commandText: options.commandText,
    workspaceRoot: options.workspaceRoot,
    config: options.config,
    effortLevel: options.effortLevel,
    runtime: options.runtime,
    tools: options.tools,
    conversationHistory: options.getConversationHistory(),
    sessionMessages: options.sessionMessages,
    pendingPlanVerification: options.getPendingPlanVerification(),
    backgroundTaskHost: options.backgroundTaskHost,
    findActiveBuiltInAgentTask: options.findActiveBuiltInAgentTask,
    createProvider: systemPrompt =>
      options.createProviderAdapter({
        config: options.config,
        workspaceRoot: options.workspaceRoot,
        systemPrompt,
        envMap: options.envMap,
        runtimeOptions: options.runtimeOptions,
      }),
    markPendingPlanVerificationStarted: options.markPendingPlanVerificationStarted,
    markPendingPlanVerificationCompleted: options.markPendingPlanVerificationCompleted,
    resetPendingPlanVerificationToAwaitingStart:
      options.resetPendingPlanVerificationToAwaitingStart,
    onToken: options.onToken,
    onToolStart: options.onToolStart,
    onToolEnd: options.onToolEnd,
  });
}

export async function runReviewSessionWithHost<TRuntime extends InspectionRuntimeLike>(
  options: SharedInspectionSessionHostOptions<TRuntime>,
): Promise<{ taskId: string; report: string }> {
  return runReviewInspectionSession({
    commandText: options.commandText,
    workspaceRoot: options.workspaceRoot,
    config: options.config,
    effortLevel: options.effortLevel,
    runtime: options.runtime,
    tools: options.tools,
    conversationHistory: options.getConversationHistory(),
    sessionMessages: options.sessionMessages,
    pendingPlanVerification: options.getPendingPlanVerification(),
    backgroundTaskHost: options.backgroundTaskHost,
    findActiveBuiltInAgentTask: options.findActiveBuiltInAgentTask,
    createProvider: systemPrompt =>
      options.createProviderAdapter({
        config: options.config,
        workspaceRoot: options.workspaceRoot,
        systemPrompt,
        envMap: options.envMap,
        runtimeOptions: options.runtimeOptions,
      }),
    onToken: options.onToken,
    onToolStart: options.onToolStart,
    onToolEnd: options.onToolEnd,
  });
}

type SharedInspectionToolHostOptions<
  TRuntime extends WorkspaceRuntimeLike & InspectionRuntimeLike,
> = {
  workspaceFolderPath: string;
  resolveProviderConfig: () => Promise<ProviderResolution>;
  getEffortLevel: () => EffortLevel | undefined;
  createProviderRuntimeOptions: (
    config: ProviderConfig,
  ) => ProviderRuntimeOptions;
  ensureConversationWorktreeHydrated: (workspaceFolderPath: string) => Promise<void>;
  getEffectiveWorkspaceRoot: (workspaceFolderPath: string) => string;
  getWorkspaceRuntime: (envMap: Record<string, string>) => Promise<TRuntime>;
  getConversationHistory: () => ConversationMessage[];
  sessionMessages: ChatMessage[];
  getPendingPlanVerification: () => PendingPlanVerificationState | undefined;
  backgroundTaskHost: Pick<BackgroundTaskHost, "runBuiltInAgentSession">;
  findActiveBuiltInAgentTask: (
    workspaceRoot: string,
    agentType: string,
    diffRef?: string,
  ) => Promise<Pick<BackgroundTaskRecord, "id"> | undefined>;
  createProviderAdapter: (options: {
    config: ProviderConfig;
    workspaceRoot: string;
    systemPrompt: string;
    envMap: Record<string, string>;
    runtimeOptions: ProviderRuntimeOptions;
  }) => IProviderAdapter;
};

export async function runVerificationFromToolWithHost<
  TRuntime extends WorkspaceRuntimeLike & InspectionRuntimeLike,
>(
  options: SharedInspectionToolHostOptions<TRuntime> & {
    extraGuidance?: string;
    diffRef?: string;
    markPendingPlanVerificationStarted: () => void;
    markPendingPlanVerificationCompleted: () => void;
    resetPendingPlanVerificationToAwaitingStart: () => void;
  },
): Promise<{ taskId: string; report: string; verdict: VerificationVerdict }> {
  return launchVerificationFromTool({
    workspaceFolderPath: options.workspaceFolderPath,
    extraGuidance: options.extraGuidance,
    diffRef: options.diffRef,
    resolveProviderConfig: options.resolveProviderConfig,
    getEffortLevel: options.getEffortLevel,
    createProviderRuntimeOptions: options.createProviderRuntimeOptions,
    ensureConversationWorktreeHydrated: options.ensureConversationWorktreeHydrated,
    getEffectiveWorkspaceRoot: options.getEffectiveWorkspaceRoot,
    getWorkspaceRuntime: options.getWorkspaceRuntime,
    runVerificationSession: sessionOptions =>
      runVerificationSessionWithHost({
        ...sessionOptions,
        runtime: sessionOptions.runtime as InspectionRuntimeLike,
        getConversationHistory: options.getConversationHistory,
        sessionMessages: options.sessionMessages,
        getPendingPlanVerification: options.getPendingPlanVerification,
        backgroundTaskHost: options.backgroundTaskHost,
        findActiveBuiltInAgentTask: options.findActiveBuiltInAgentTask,
        createProviderAdapter: options.createProviderAdapter,
        markPendingPlanVerificationStarted:
          options.markPendingPlanVerificationStarted,
        markPendingPlanVerificationCompleted:
          options.markPendingPlanVerificationCompleted,
        resetPendingPlanVerificationToAwaitingStart:
          options.resetPendingPlanVerificationToAwaitingStart,
      }),
  });
}

export async function runReviewFromToolWithHost<
  TRuntime extends WorkspaceRuntimeLike & InspectionRuntimeLike,
>(
  options: SharedInspectionToolHostOptions<TRuntime> & {
    extraGuidance?: string;
    diffRef?: string;
  },
): Promise<{ taskId: string; report: string }> {
  return launchReviewFromTool({
    workspaceFolderPath: options.workspaceFolderPath,
    extraGuidance: options.extraGuidance,
    diffRef: options.diffRef,
    resolveProviderConfig: options.resolveProviderConfig,
    getEffortLevel: options.getEffortLevel,
    createProviderRuntimeOptions: options.createProviderRuntimeOptions,
    ensureConversationWorktreeHydrated: options.ensureConversationWorktreeHydrated,
    getEffectiveWorkspaceRoot: options.getEffectiveWorkspaceRoot,
    getWorkspaceRuntime: options.getWorkspaceRuntime,
    runReviewSession: sessionOptions =>
      runReviewSessionWithHost({
        ...sessionOptions,
        runtime: sessionOptions.runtime as InspectionRuntimeLike,
        getConversationHistory: options.getConversationHistory,
        sessionMessages: options.sessionMessages,
        getPendingPlanVerification: options.getPendingPlanVerification,
        backgroundTaskHost: options.backgroundTaskHost,
        findActiveBuiltInAgentTask: options.findActiveBuiltInAgentTask,
        createProviderAdapter: options.createProviderAdapter,
      }),
  });
}

export async function handleVerificationCommandWithHost<
  TRuntime extends WorkspaceRuntimeLike & InspectionRuntimeLike,
>(
  options: SharedInspectionCommandHostOptions<TRuntime> & {
    markPendingPlanVerificationStarted: () => void;
    markPendingPlanVerificationCompleted: () => void;
    resetPendingPlanVerificationToAwaitingStart: () => void;
    onUnexpectedError: (message: string, activityId: string) => void;
  },
): Promise<boolean> {
  return handleVerificationPromptCommand({
    commandText: options.commandText,
    workspaceRoot: options.workspaceRoot,
    config: options.config,
    envMap: options.envMap,
    runtime: options.runtime,
    tools: options.tools,
    runtimeOptions: options.runtimeOptions,
    effortLevel: options.effortLevel,
    sessionMessages: options.sessionMessages,
    blockedByPlanMode: options.blockedByPlanMode,
    onToken: options.onStreamingToken,
    onToolStart: (toolName, input, execId) => {
      options.startToolExecution(
        execId,
        getToolRunningLabel(formatToolDisplayName(toolName)),
        formatToolInputPreview(input),
      );
    },
    onToolEnd: (execId, summary, isError) => {
      options.finishToolExecution(
        execId,
        isError ? "error" : "done",
        summary,
      );
    },
    addPhaseActivity: options.addPhaseActivity,
    finishPhaseActivity: options.finishPhaseActivity,
    recordAssistantReply: options.recordAssistantReply,
    setCompanionState: options.setCompanionState,
    clearStreamingText: options.clearStreamingText,
    updateMood: options.updateMood,
    isAbortLikeError: options.isAbortLikeError,
    runVerificationSession: sessionOptions =>
      runVerificationSessionWithHost({
        ...sessionOptions,
        runtime: sessionOptions.runtime as InspectionRuntimeLike,
        getConversationHistory: options.getConversationHistory,
        sessionMessages: options.sessionMessages,
        getPendingPlanVerification: options.getPendingPlanVerification,
        backgroundTaskHost: options.backgroundTaskHost,
        findActiveBuiltInAgentTask: options.findActiveBuiltInAgentTask,
        createProviderAdapter: options.createProviderAdapter,
        markPendingPlanVerificationStarted:
          options.markPendingPlanVerificationStarted,
        markPendingPlanVerificationCompleted:
          options.markPendingPlanVerificationCompleted,
        resetPendingPlanVerificationToAwaitingStart:
          options.resetPendingPlanVerificationToAwaitingStart,
      }),
    buildFollowUpMessage: (label, taskId) =>
      options.backgroundTaskHost.buildFollowUpMessage(label, taskId),
    onUnexpectedError: options.onUnexpectedError,
  });
}

export async function handleReviewCommandWithHost<
  TRuntime extends WorkspaceRuntimeLike & InspectionRuntimeLike,
>(
  options: SharedInspectionCommandHostOptions<TRuntime>,
): Promise<boolean> {
  return handleReviewPromptCommand({
    commandText: options.commandText,
    workspaceRoot: options.workspaceRoot,
    config: options.config,
    envMap: options.envMap,
    runtime: options.runtime,
    tools: options.tools,
    runtimeOptions: options.runtimeOptions,
    effortLevel: options.effortLevel,
    sessionMessages: options.sessionMessages,
    blockedByPlanMode: options.blockedByPlanMode,
    onToken: options.onStreamingToken,
    onToolStart: (toolName, input, execId) => {
      options.startToolExecution(
        execId,
        `瀹℃煡涓細${formatToolDisplayName(toolName)}`,
        formatToolInputPreview(input),
      );
    },
    onToolEnd: (execId, summary, isError) => {
      options.finishToolExecution(
        execId,
        isError ? "error" : "done",
        summary,
      );
    },
    addPhaseActivity: options.addPhaseActivity,
    finishPhaseActivity: options.finishPhaseActivity,
    recordAssistantReply: options.recordAssistantReply,
    setCompanionState: options.setCompanionState,
    clearStreamingText: options.clearStreamingText,
    updateMood: options.updateMood,
    isAbortLikeError: options.isAbortLikeError,
    runReviewSession: sessionOptions =>
      runReviewSessionWithHost({
        ...sessionOptions,
        runtime: sessionOptions.runtime as InspectionRuntimeLike,
        getConversationHistory: options.getConversationHistory,
        sessionMessages: options.sessionMessages,
        getPendingPlanVerification: options.getPendingPlanVerification,
        backgroundTaskHost: options.backgroundTaskHost,
        findActiveBuiltInAgentTask: options.findActiveBuiltInAgentTask,
        createProviderAdapter: options.createProviderAdapter,
      }),
    buildFollowUpMessage: (label, taskId) =>
      options.backgroundTaskHost.buildFollowUpMessage(label, taskId),
  });
}
