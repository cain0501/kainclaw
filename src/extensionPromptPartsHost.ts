import type { SwarmCoordinator } from "./agent/swarm/SwarmCoordinator";
import type { AssistantReplyBindings } from "./assistantReplyHost";
import type { SkillStore } from "./skills/skillStore";
import type { ProfileStore } from "./userModel/profileStore";
import { buildPromptFileMentionContext } from "./contextMentions";
import type { CompanionHostBindings } from "./companionHost";
import type { ConversationFeatureBindings } from "./conversationFeatureHost";
import type { ConversationHistoryBindings } from "./conversationHistoryHost";
import type {
  ConversationRuntimeStateBindings,
} from "./conversationRuntimeStateHost";
import type { ConversationScopeBindings } from "./conversationScopeHost";
import {
  buildProviderAdapter,
  resolveProviderConfig,
} from "./providerHost";
import { createProviderRuntimeOptionsWithHost } from "./providerRuntimeOptionsHost";
import {
  createPromptRequestConversationPart,
  createPromptRequestExecutionPart,
  createPromptRequestSessionPart,
  type PromptRequestExtensionExecutionBindings,
  type PromptRequestExtensionParts,
  type PromptRequestExtensionSessionBindings,
} from "./promptRequestExtensionHost";
import { getWorkspaceHash } from "./sessionUi";
import type { WorkspaceStatusController } from "./workspaceStatusHost";
import type { WorkspaceRuntimeHost } from "./workspaceRuntimeHost";
import type { WorkspaceRuntime } from "./workspaceRuntimeShell";

type ConversationPartOptions =
  Parameters<typeof createPromptRequestConversationPart>[0];
type ExecutionBindings =
  PromptRequestExtensionExecutionBindings<WorkspaceRuntime>;

export type ExtensionPromptRequestWebviewMessage =
  | { type: "chat:token"; token: string }
  | { type: "swarm:workerUpdate"; worker: unknown };

export type ExtensionPromptRequestState = {
  getCurrentSessionId: () => string | undefined;
  setCurrentSessionId: (sessionId: string | undefined) => void;
  sessionMessages: PromptRequestExtensionSessionBindings["sessionMessages"];
  conversationMessages: ConversationPartOptions["conversationMessages"];
  getPendingPromptAttachments: ConversationPartOptions["getPendingPromptAttachments"];
  setPendingPromptAttachments: ConversationPartOptions["setPendingPromptAttachments"];
  pendingPlanVerification: ConversationPartOptions["pendingPlanVerification"];
  planModeState: ConversationPartOptions["planModeState"];
  getSwarm: () => SwarmCoordinator | undefined;
  setSwarm: (swarm: SwarmCoordinator | undefined) => void;
  queueAutoMemoryExtraction: ConversationPartOptions["queueAutoMemoryExtraction"];
  cachedTools?: ExecutionBindings["cachedTools"];
  cachedToolsWorkspaceRoot?: ExecutionBindings["cachedToolsWorkspaceRoot"];
  setWorkspaceToolCache: ExecutionBindings["setFreshWorkspaceTools"];
  appendStreamingText: ExecutionBindings["appendStreamingText"];
  clearStreamingText: ExecutionBindings["clearStreamingText"];
};

export type ExtensionPromptRequestBindings = {
  settings: PromptRequestExtensionSessionBindings["settings"];
  sessions: PromptRequestExtensionSessionBindings["sessions"];
  logSession: PromptRequestExtensionSessionBindings["logSession"];
  conversationFeatureBindings: Pick<
    ConversationFeatureBindings,
    "isSessionPersistenceEnabled" | "shouldEnableSwarmForPrompt"
  >;
  conversationHistoryBindings: Pick<
    ConversationHistoryBindings,
    "getConversationHistory" | "replaceConversationHistory"
  >;
  conversationRuntimeStateBindings: Pick<
    ConversationRuntimeStateBindings,
    | "persistCurrentSessionRuntimeState"
    | "getPendingPlanVerificationReminderTurnCount"
    | "markPendingPlanVerificationStarted"
    | "markPendingPlanVerificationCompleted"
    | "resetPendingPlanVerificationToAwaitingStart"
  >;
  conversationScopeBindings: Pick<
    ConversationScopeBindings,
    | "getConversationTaskRuntime"
    | "ensureConversationWorktreeHydrated"
    | "getEffectiveWorkspaceRoot"
    | "findActiveBuiltInAgentTask"
  >;
  activityTracker: ExecutionBindings["activityTracker"];
  backgroundTaskHost: ExecutionBindings["backgroundTaskHost"];
  workspaceStatusController: Pick<WorkspaceStatusController, "requestRefresh">;
  workspaceRuntimeHost: Pick<WorkspaceRuntimeHost, "getRuntime">;
  companionBindings: Pick<
    CompanionHostBindings,
    "postCompanionState" | "updateCompanionMood"
  >;
  assistantReplyBindings: Pick<AssistantReplyBindings, "recordAssistantReply">;
  scheduleStreamingStateUpdate: ExecutionBindings["scheduleStreamingStateUpdate"];
  postState: () => void;
  showWarningMessage: (message: string) => void;
  postWebviewMessage: (
    payload: ExtensionPromptRequestWebviewMessage,
  ) => void;
  getPlanContentForWorkspace: (workspaceRoot: string) => Promise<string | null>;
  isAbortLikeError: ExecutionBindings["isAbortLikeError"];
  toErrorMessage: ExecutionBindings["toErrorMessage"];
  skillStore?: SkillStore;
  profileStore?: ProfileStore;
};

export type ExtensionPromptRequestPartsFactory = (options: {
  workspaceFolderPath: string;
  onToolError: () => void;
  state: ExtensionPromptRequestState;
}) => PromptRequestExtensionParts<WorkspaceRuntime>;

export function createExtensionPromptRequestParts(options: {
  workspaceFolderPath: string;
  onToolError: () => void;
  state: ExtensionPromptRequestState;
  bindings: ExtensionPromptRequestBindings;
}): PromptRequestExtensionParts<WorkspaceRuntime> {
  return {
    session: createPromptRequestSessionPart({
      getCurrentSessionId: options.state.getCurrentSessionId,
      sessionMessages: options.state.sessionMessages,
      isSessionPersistenceEnabled:
        options.bindings.conversationFeatureBindings.isSessionPersistenceEnabled(),
      settings: options.bindings.settings,
      sessions: options.bindings.sessions,
      getWorkspaceHash,
      logSession: options.bindings.logSession,
      assignCurrentSessionId: options.state.setCurrentSessionId,
    }),
    conversation: createPromptRequestConversationPart({
      getConversationHistory: () =>
        options.bindings.conversationHistoryBindings.getConversationHistory(),
      replaceConversationHistory: (compactedHistory, compactBoundary) =>
        options.bindings.conversationHistoryBindings.replaceConversationHistory(
          compactedHistory,
          compactBoundary,
        ),
      conversationMessages: options.state.conversationMessages,
      getPendingPromptAttachments: options.state.getPendingPromptAttachments,
      setPendingPromptAttachments: options.state.setPendingPromptAttachments,
      persistCurrentSessionRuntimeState: () =>
        options.bindings.conversationRuntimeStateBindings.persistCurrentSessionRuntimeState(),
      pendingPlanVerification: options.state.pendingPlanVerification,
      planModeState: options.state.planModeState,
      getPendingPlanVerificationReminderTurns: () =>
        options.bindings.conversationRuntimeStateBindings.getPendingPlanVerificationReminderTurnCount(),
      getPlanContent: options.bindings.getPlanContentForWorkspace,
      getConversationTaskRuntime: () =>
        options.bindings.conversationScopeBindings.getConversationTaskRuntime(
          options.workspaceFolderPath,
        ),
      buildPromptFileMentionContext,
      existingSwarm: options.state.getSwarm(),
      assignSwarm: swarm => {
        options.state.setSwarm(swarm);
      },
      shouldEnableSwarmForPrompt: prompt =>
        options.bindings.conversationFeatureBindings.shouldEnableSwarmForPrompt(
          prompt,
        ),
      queueAutoMemoryExtraction: options.state.queueAutoMemoryExtraction,
    }),
    execution: createPromptRequestExecutionPart({
      workspaceFolderPath: options.workspaceFolderPath,
      activityTracker: options.bindings.activityTracker,
      backgroundTaskHost: options.bindings.backgroundTaskHost,
      workspaceStatusController: options.bindings.workspaceStatusController,
      cachedTools: options.state.cachedTools,
      cachedToolsWorkspaceRoot: options.state.cachedToolsWorkspaceRoot,
      setFreshWorkspaceTools: options.state.setWorkspaceToolCache,
      resolveProviderConfig: () =>
        resolveProviderConfig(
          options.bindings.settings as Parameters<
            typeof resolveProviderConfig
          >[0],
          options.workspaceFolderPath,
        ),
      createProviderRuntimeOptions: config =>
        createProviderRuntimeOptionsWithHost({
          config,
          effortLevel: options.bindings.settings.getEffortLevel(),
          fastMode: options.bindings.settings.getFastMode(),
          getFastModeEnabled: () => options.bindings.settings.getFastMode(),
          setFastModeEnabled: enabled =>
            options.bindings.settings.setFastMode(enabled),
          addPhaseActivity: (kind, label, detail, status) =>
            options.bindings.activityTracker.add(
              kind,
              label,
              detail,
              status,
            ),
          postState: options.bindings.postState,
          refreshWorkspaceStatus:
            options.bindings.workspaceStatusController.requestRefresh,
          showWarningMessage: options.bindings.showWarningMessage,
        }),
      ensureConversationWorktreeHydrated: path =>
        options.bindings.conversationScopeBindings.ensureConversationWorktreeHydrated(
          path,
        ),
      getEffectiveWorkspaceRoot: path =>
        options.bindings.conversationScopeBindings.getEffectiveWorkspaceRoot(
          path,
        ),
      getWorkspaceRuntime: envMap =>
        options.bindings.workspaceRuntimeHost.getRuntime(
          options.workspaceFolderPath,
          envMap,
        ),
      buildProviderAdapter: ({
        config,
        workspaceRoot,
        systemPrompt,
        envMap,
        runtimeOptions,
      }) =>
        buildProviderAdapter(
          config,
          workspaceRoot,
          systemPrompt,
          envMap,
          runtimeOptions,
        ),
      findActiveBuiltInAgentTask: (workspaceRoot, agentType, diffRef) =>
        options.bindings.conversationScopeBindings.findActiveBuiltInAgentTask(
          workspaceRoot,
          agentType,
          diffRef,
        ),
      isAbortLikeError: options.bindings.isAbortLikeError,
      markPendingPlanVerificationStarted: () =>
        options.bindings.conversationRuntimeStateBindings.markPendingPlanVerificationStarted(),
      markPendingPlanVerificationCompleted: () =>
        options.bindings.conversationRuntimeStateBindings.markPendingPlanVerificationCompleted(),
      resetPendingPlanVerificationToAwaitingStart: () =>
        options.bindings.conversationRuntimeStateBindings.resetPendingPlanVerificationToAwaitingStart(),
      appendStreamingText: options.state.appendStreamingText,
      scheduleStreamingStateUpdate:
        options.bindings.scheduleStreamingStateUpdate,
      postChatToken: token => {
        options.bindings.postWebviewMessage({
          type: "chat:token",
          token,
        });
      },
      onToolError: options.onToolError,
      setCompanionState: state =>
        options.bindings.companionBindings.postCompanionState(state),
      updateMood: (delta, countConversation) =>
        options.bindings.companionBindings.updateCompanionMood(
          delta,
          countConversation,
        ),
      recordAssistantReply: (reply, includeInConversation, thinkingSummary) =>
        options.bindings.assistantReplyBindings.recordAssistantReply(
          reply,
          includeInConversation,
          thinkingSummary,
        ),
      clearStreamingText: options.state.clearStreamingText,
      toErrorMessage: options.bindings.toErrorMessage,
      postWorkerUpdate: worker => {
        options.bindings.postWebviewMessage({
          type: "swarm:workerUpdate",
          worker,
        });
      },
      skillStore: options.bindings.skillStore,
      profileStore: options.bindings.profileStore,
    }),
  };
}

export function createExtensionPromptRequestPartsFactory(
  bindings: ExtensionPromptRequestBindings,
): ExtensionPromptRequestPartsFactory {
  return options =>
    createExtensionPromptRequestParts({
      workspaceFolderPath: options.workspaceFolderPath,
      onToolError: options.onToolError,
      state: options.state,
      bindings,
    });
}
