/**
 * extension.ts orchestrates the VS Code host shell:
 *
 *   platform/IHostAdapter.ts            -> host abstraction
 *   platform/vsCodeHostAdapter.ts       -> VS Code host implementation
 *   agent/providers/IProviderAdapter.ts -> provider abstraction
 *   agent/providers/anthropicAdapter.ts -> Anthropic adapter
 *   agent/providers/openAIAdapter.ts    -> OpenAI / compatible adapter
 *   agent/providers/claudeCliAdapter.ts -> Claude CLI adapter
 *   agent/agentRunner.ts                -> core agent loop
 *   storage/sessionRepository.ts        -> session persistence
 *   storage/settingsRepository.ts       -> settings, secrets, global state
 */

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import path from "node:path";
import * as vscode from "vscode";

import { ActivityTracker } from "./activityTracker";
import { ApprovalHost } from "./approvalHost";
import {
  createAssistantReplyBindingsFactory,
  type AssistantReplyBindings,
} from "./assistantReplyHost";
import {
  mergePendingAttachmentsIntoConversationMessage,
  normalizeWebviewAttachments,
} from "./attachmentHandler";
import { BackgroundTaskHost } from "./backgroundTaskHost";
import {
  createBackgroundTaskNotificationBindings,
} from "./backgroundTaskNotificationHost";
import type { WebviewAttachment } from "./chatCommandHost";
import {
  buildConversationHistoryFromSession,
  cloneConversationHistory,
  createConversationHistoryBindingsFactory,
  getHistoryCommandBehavior,
  getVisibleSessionMessages,
  replaceConversationHistory as replaceConversationHistoryBuffer,
  type ConversationHistoryBindings,
} from "./conversationHistoryHost";
import {
  getFailureActivityLabel,
  getQuickActionUnavailableMessage,
  getToolRunningLabel,
} from "./hostUi";
import {
  describeToolInput as formatToolInputPreview,
  describeToolName as formatToolDisplayName,
} from "./hostRuntimeHelpers";
import type { McpServerStatusSummary } from "./mcpRuntime";
import {
  type PromptRequestExtensionParts,
  runPromptRequestWithExtensionParts,
} from "./promptRequestExtensionHost";
import {
  createReadySequenceControllerFactory,
  type ReadySequenceController,
} from "./readySequenceHost";
import {
  createSavedSessionActivationBindingsFactory,
} from "./savedSessionHost";
import {
  clearConversationHostState,
} from "./sessionLifecycleHost";
import {
  createSessionPanelControllerFactory,
  type SessionPanelActions,
} from "./sessionPanelHost";
import {
  getWorkspaceHash,
} from "./sessionUi";
import {
  getPrimaryWorkspaceFolder,
  getPrimaryWorkspaceFolderPath,
  requirePrimaryWorkspaceFolderPath,
} from "./workspaceFolderHost";
import {
  buildProviderLabel,
  prepareWorkspaceInspectionContext,
} from "./workspaceHost";
import {
  executeTool,
  type ToolContext,
  type ToolDefinition,
} from "./toolRuntime";
import type { HookDefinition } from "./hooksRegistry";
import {
  clearAllSessionInstalledSkillHooks,
  clearSessionInstalledSkillHooks,
  getSessionInstalledSkillHooks,
  registerSessionInstalledSkillHooks,
} from "./sessionInstalledSkillHooks";
import { triggerHooks } from "./hooks/hooksTrigger";
import type { AgentRunner } from "./hooks/hooksExecutor";
import { loadHooks } from "./hooksRegistry";
import {
  postEditorSelectionPayload,
} from "./editorInteractionHost";
import {
  createEditorInteractionBindings,
  type EditorSelectionBindings,
} from "./editorInteractionBindingsHost";
import {
  createBeginPromptTurnBindings,
  createFinalizePromptTurnBindings,
  createPromptTurnFailureBindings,
  preparePromptTurn,
  runPromptTurnExecution,
} from "./promptLifecycleHost";
import {
  createConversationRuntimeStateBindings,
  persistSessionRuntimeState,
  type PendingPlanVerificationState,
} from "./conversationRuntimeStateHost";
import {
  createConversationScopeBindings,
  type ConversationScopeBindings,
} from "./conversationScopeHost";
import {
  createConversationFeatureBindings,
  type ConversationFeatureBindings,
} from "./conversationFeatureHost";
import {
  createAutoMemoryHostBindingsFactory,
  type AutoMemoryHostBindings,
} from "./autoMemoryHost";
import {
  createStreamingStateBindingsFactory,
  createWebviewStateBindingsFactory,
  type StreamingStateBindings,
  type WebviewStateBindings,
  WebviewStateHost,
} from "./webviewStateHost";
import {
  createWorkspaceStatusControllerFactory,
  type WorkspaceStatusController,
} from "./workspaceStatusHost";
import {
  createSettingsPanelControllerFactory,
  type SettingsPanelActions,
} from "./settingsPanelHost";
import {
  createBackgroundCommandToolLaunchBindings,
  type BackgroundCommandToolLaunchBindings,
} from "./toolLaunchHost";
import { getSidebarHtml } from "./webviewHtml";
import { registerChatSidebarExtension } from "./extensionActivationHost";
import {
  configureSidebarWebviewView,
  routeSidebarWebviewMessage,
} from "./sidebarWebviewHost";

import { VsCodeHostAdapter } from "./platform/vsCodeHostAdapter";
import type { IHostAdapter } from "./platform/IHostAdapter";
import { SettingsRepository, type ProviderMeta } from "./storage/settingsRepository";
import {
  SessionRepository,
  type ChatMessage,
  type CompactBoundarySessionState,
  type PersistedConversationMessage,
} from "./storage/sessionRepository";
import { SwarmCoordinator } from "./agent/swarm/SwarmCoordinator";
import { hasExplicitSwarmIntent } from "./agent/swarm/swarmIntent";
import { verifyLicense, type LicenseFlags } from "./license/licenseManager";
import {
  createLicenseHostBindingsFactory,
  type LicenseHostBindings,
} from "./licenseHost";
import {
  buildProviderAdapter,
  resolveProviderConfig,
} from "./providerHost";
import type { CompanionData } from "./companion/companionTypes";
import {
  createCompanionControllerFactory,
  type CompanionHostBindings,
  persistCompanionData as persistCompanionDataHost,
} from "./companionHost";
import {
  createProviderRuntimeOptionsFactoryWithHost,
} from "./providerRuntimeOptionsHost";
import { type PlanModeState } from "./planMode/planMode";
import {
  getPlanContentForWorkspace,
  resetPlanModeState,
} from "./planModeHost";
import {
  getFastModeIndicatorState,
  onFastModeRuntimeStateChanged,
} from "./thinkingEffort/fastMode";
import type {
  EffortLevel,
  ProviderRuntimeOptions,
} from "./thinkingEffort/types";
import {
  VERIFY_PLAN_REMINDER_CONFIG,
  type VerificationVerdict,
} from "./verification/prompt";
import {
  handleCompactCommandWithHost,
} from "./compactHost";
import { PersistentTaskRuntimeStore } from "./tasks/taskRuntime";
import { PersistentWorktreeRuntimeStore } from "./worktree/runtime";
import {
  createWorkspaceRuntimeHostFactory,
  WorkspaceRuntimeHost,
} from "./workspaceRuntimeHost";
import { WorkspaceRuntime } from "./workspaceRuntimeShell";
import {
  createExtensionPromptRequestPartsFactory,
  type ExtensionPromptRequestPartsFactory,
} from "./extensionPromptPartsHost";
import { createExtensionPromptRequestState } from "./extensionPromptStateHost";
import { SkillStore } from "./skills/skillStore";
import { ProfileStore } from "./userModel/profileStore";
import { createCronScheduler } from "./cron/cronScheduler";

// Local host-side types.

type ChatRole = "user" | "assistant";

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const COMPANION_STATE_KEY = "cain.companion";

// ChatSidebarProvider

class ChatSidebarProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = "terminalAiAssistant.chatView";

  private readonly sessionMessages: ChatMessage[] = [];
  private readonly conversationMessages: PersistedConversationMessage[] = [];
  private pendingPromptAttachments: Array<{ data: string; mimeType: string }> | undefined;
  private webviewView: vscode.WebviewView | undefined;
  private isBusy = false;
  private providerLabel = "Not connected";
  private mcpServers: McpServerStatusSummary[] = [];
  private readonly activityTracker = new ActivityTracker({
    onChange: () => this.postState(),
    onWorktreeToolSuccess: () => {
      this.cachedTools = undefined;
      this.cachedToolsWorkspaceRoot = undefined;
    },
    onMcpAuthToolSuccess: () => {
      this.cachedTools = undefined;
      this.cachedToolsWorkspaceRoot = undefined;
    },
  });
  private readonly webviewStateHost: WebviewStateHost;
  private readonly webviewStateBindings: WebviewStateBindings;
  private readonly streamingStateBindings: StreamingStateBindings;
  private streamingText = "";
  private licenseFlags: LicenseFlags | undefined;
  private readonly approvalHost: ApprovalHost;
  private cachedTools: import("./toolRuntime").ToolDefinition[] | undefined;
  private companionData: CompanionData | undefined;
  private transientConversationId = randomUUID();
  private planModeState: PlanModeState = { active: false };
  private pendingPlanVerification: PendingPlanVerificationState | undefined;
  private compactBoundary: CompactBoundarySessionState | undefined;
  private readonly autoMemoryBindings: AutoMemoryHostBindings;
  private readonly backgroundTaskHost: BackgroundTaskHost;
  private readonly taskRuntimeStore: PersistentTaskRuntimeStore;
  private readonly worktreeRuntimeStore: PersistentWorktreeRuntimeStore;
  private readonly conversationScopeBindings: ConversationScopeBindings;
  private readonly conversationFeatureBindings: ConversationFeatureBindings;
  private readonly conversationRuntimeStateBindings: ReturnType<
    typeof createConversationRuntimeStateBindings
  >;
  private readonly licenseHostBindings: LicenseHostBindings;
  private readonly conversationHistoryBindings: ConversationHistoryBindings;
  private readonly assistantReplyBindings: AssistantReplyBindings;
  private readonly companionBindings: CompanionHostBindings;
  private readonly sessionPanelActions: SessionPanelActions;
  private readonly settingsPanelActions: SettingsPanelActions;
  private readonly backgroundCommandToolLaunchBindings: BackgroundCommandToolLaunchBindings;
  private readonly quickActionBindings: ReturnType<typeof createEditorInteractionBindings>["quickAction"];
  private readonly editorSelectionBindings: EditorSelectionBindings;
  private readonly readySequenceController: ReadySequenceController;
  private readonly workspaceRuntimeHost: WorkspaceRuntimeHost;
  private readonly workspaceStatusController: WorkspaceStatusController;
  private readonly disposeFastModeRuntimeListener: () => void;
  private readonly extensionPromptRequestPartsFactory:
    ExtensionPromptRequestPartsFactory;
  private cachedToolsWorkspaceRoot: string | undefined;
  private readonly sessionInstalledSkillHooks = new Map<string, HookDefinition[]>();
  private sessionsPanelOpen = false;
  private lastSessionsDataSignature = "";
  private readonly mcpConfigWatchers: vscode.Disposable[] = [];
  private readonly backgroundTaskNotificationTimer: ReturnType<
    typeof setInterval
  >;
  private readonly cronScheduler = createCronScheduler();

  // Current session ID (P01).
  private currentSessionId: string | undefined;

  // Swarm coordinator (P04). Reused within a conversation and reset on clearChat.
  private swarm: SwarmCoordinator | undefined;

  // User skill library (P05).
  private readonly skillStore: SkillStore;

  // User modeling profile store (X02).
  private readonly profileStore: ProfileStore;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly settings: SettingsRepository,
    private readonly sessions: SessionRepository,
    private readonly host: IHostAdapter,
  ) {
    this.skillStore = new SkillStore(
      path.join(this.host.getStorageUri(), "user-skills"),
    );
    void this.skillStore.init();
    this.profileStore = new ProfileStore(this.host.getStorageUri());
    this.taskRuntimeStore = new PersistentTaskRuntimeStore(
      this.host.getStorageUri(),
    );
    this.worktreeRuntimeStore = new PersistentWorktreeRuntimeStore(
      this.host.getStorageUri(),
    );
    const clearSwarm = () => {
      this.swarm?.dispose();
      this.swarm = undefined;
    };
    const setPlanModeState = (state: PlanModeState) => {
      this.planModeState = state;
    };
    this.approvalHost = new ApprovalHost({
      showDiff: (workspaceRoot, request) => this.host.showDiff(workspaceRoot, request),
      addActivity: (kind, label, detail, status) =>
        this.activityTracker.add(kind, label, detail, status),
      finishActivity: (activityId, status, detail) =>
        this.activityTracker.finish(activityId, status, detail),
      postState: () => this.postState(),
    });
    this.conversationScopeBindings = createConversationScopeBindings({
      taskRuntimeStore: this.taskRuntimeStore,
      worktreeRuntimeStore: this.worktreeRuntimeStore,
      getConversationKey: () => this.conversationFeatureBindings.getConversationKey(),
    });
    this.conversationFeatureBindings = createConversationFeatureBindings({
      getCurrentSessionId: () => this.currentSessionId,
      getTransientConversationId: () => this.transientConversationId,
      getLicenseFlags: () => this.licenseFlags,
      getPlanModeActive: () => this.planModeState.active,
      getSwarmWorkers: () => this.swarm?.getWorkers(),
    });
    const autoMemoryBindingsFactory = createAutoMemoryHostBindingsFactory({
      createProviderAdapter: ({
        config,
        workspaceRoot,
        systemPrompt,
        envMap,
      }) => buildProviderAdapter(config, workspaceRoot, systemPrompt, envMap),
      profileStore: this.profileStore,
    });
    this.autoMemoryBindings = autoMemoryBindingsFactory({
      getConversationKey: () => this.conversationFeatureBindings.getConversationKey(),
      getPlanModeState: () => this.planModeState,
      getSessionMessages: () => this.sessionMessages,
    });
    this.conversationRuntimeStateBindings = createConversationRuntimeStateBindings({
      getPendingPlanVerification: () => this.pendingPlanVerification,
      setPendingPlanVerification: nextState => {
        this.pendingPlanVerification = nextState;
      },
      getCompactBoundary: () => this.compactBoundary,
      setCompactBoundary: compactBoundary => {
        this.compactBoundary = compactBoundary;
      },
      persist: () => {
        persistSessionRuntimeState({
          enabled: this.conversationFeatureBindings.isSessionPersistenceEnabled(),
          currentSessionId: this.currentSessionId,
          pendingPlanVerification: this.pendingPlanVerification,
          conversationMessages:
            this.conversationMessages as PersistedConversationMessage[],
          compactBoundary: this.compactBoundary,
          saveRuntimeState: (sessionId, runtimeState) =>
            this.sessions.saveRuntimeState(sessionId, runtimeState),
        });
      },
      getPersistenceEnabled: () =>
        this.conversationFeatureBindings.isSessionPersistenceEnabled(),
      getCurrentSessionId: () => this.currentSessionId,
      getSessionMessages: () => this.sessionMessages,
      getConversationMessages: () =>
        this.conversationMessages as PersistedConversationMessage[],
      saveRuntimeState: (sessionId, runtimeState) =>
        this.sessions.saveRuntimeState(sessionId, runtimeState),
      rebuildConversationMessagesFromSession: () =>
        this.conversationHistoryBindings.rebuildConversationMessagesFromSession(),
      getTurnsBetweenReminders: () =>
        VERIFY_PLAN_REMINDER_CONFIG.TURNS_BETWEEN_REMINDERS,
      getHistoryCommandBehavior,
    });
    const conversationHistoryBindingsFactory =
      createConversationHistoryBindingsFactory({
        getShowThinkingSummaries: () => this.settings.getShowThinkingSummaries(),
        recordCompactBoundary: compactBoundary => {
          this.compactBoundary = compactBoundary;
        },
        persistCurrentSessionRuntimeState: () => {
          this.conversationRuntimeStateBindings.persistCurrentSessionRuntimeState();
        },
      });
    this.conversationHistoryBindings = conversationHistoryBindingsFactory({
      sessionMessages: this.sessionMessages,
      conversationMessages: this.conversationMessages,
    });
    const assistantReplyBindingsFactory =
      createAssistantReplyBindingsFactory({
        getShowThinkingSummaries: () => this.settings.getShowThinkingSummaries(),
        persistCurrentSessionRuntimeState: () => {
          this.conversationRuntimeStateBindings.persistCurrentSessionRuntimeState();
        },
        getPersistenceEnabled: () =>
          this.conversationFeatureBindings.isSessionPersistenceEnabled(),
        getCurrentSessionId: () => this.currentSessionId,
        appendMessages: (sessionId, messages, metaPatch) =>
          this.sessions.appendMessages(sessionId, messages, metaPatch),
        logPersisted: details => {
          this.logSession("assistant-message-persisted", details);
        },
      });
    this.assistantReplyBindings = assistantReplyBindingsFactory({
      appendSessionMessages: messages => {
        for (const message of messages) {
          this.sessionMessages.push(message);
        }
      },
      appendConversationMessage: message => {
        this.conversationMessages.push(message);
      },
    });
    const backgroundTaskNotificationBindings =
      createBackgroundTaskNotificationBindings({
        getTaskRuntime: () => {
          const workspaceRoot = getPrimaryWorkspaceFolderPath();
          if (!workspaceRoot) {
            return undefined;
          }
          return this.conversationScopeBindings.getConversationTaskRuntime(
            workspaceRoot,
          );
        },
        recordAssistantReply: (reply, includeInConversation, thinkingSummary) =>
          this.assistantReplyBindings.recordAssistantReply(
            reply,
            includeInConversation,
            thinkingSummary,
          ),
      });
    this.backgroundTaskNotificationTimer = setInterval(() => {
      void backgroundTaskNotificationBindings.pollBackgroundTaskNotifications();
    }, 1500);
    this.backgroundTaskNotificationTimer.unref?.();
    this.webviewStateHost = new WebviewStateHost(payload => {
      this.webviewView?.webview.postMessage(payload);
    });
    const webviewStateBindingsFactory = createWebviewStateBindingsFactory({
      host: this.webviewStateHost,
    });
    this.webviewStateBindings = webviewStateBindingsFactory({
      getIsBusy: () => this.isBusy,
      getProviderLabel: () => this.providerLabel,
      getMcpServers: () => this.mcpServers,
      getLiveActivities: () => this.activityTracker.liveActivities,
      getLastRunActivities: () => this.activityTracker.lastRunActivities,
      getMessages: () => this.conversationHistoryBindings.getVisibleSessionMessages(),
      getEffortLevel: () => this.settings.getEffortLevel() ?? null,
      getFastMode: () => this.settings.getFastMode(),
      getFastModeIndicator: () =>
        getFastModeIndicatorState(
          this.settings.getActiveProviderMeta(),
          this.settings.getFastMode(),
        ),
      getShowThinkingSummaries: () => this.settings.getShowThinkingSummaries(),
      getPlanMode: () => this.planModeState,
      getPendingApproval: () => this.approvalHost.getPendingApproval() ?? null,
      getOnboardingDone: () => this.settings.isOnboardingDone(),
      getMultiSessionEnabled: () =>
        this.conversationFeatureBindings.isMultiSessionEnabled(),
    });
    const streamingStateBindingsFactory = createStreamingStateBindingsFactory({
      host: this.webviewStateHost,
    });
    this.streamingStateBindings = streamingStateBindingsFactory({
      getIsBusy: () => this.isBusy,
      getStreamingText: () => this.streamingText,
    });
    this.backgroundTaskHost = new BackgroundTaskHost({
      storageRoot: this.host.getStorageUri(),
      getTaskRuntime: workspaceRoot =>
        this.conversationScopeBindings.getConversationTaskRuntime(workspaceRoot),
    });
    this.backgroundCommandToolLaunchBindings = createBackgroundCommandToolLaunchBindings({
      ensureConversationWorktreeHydrated: workspaceRoot =>
        this.conversationScopeBindings.ensureConversationWorktreeHydrated(workspaceRoot),
      getEffectiveWorkspaceRoot: workspaceRoot =>
        this.conversationScopeBindings.getEffectiveWorkspaceRoot(workspaceRoot),
      backgroundTaskHost: this.backgroundTaskHost,
    });
    const savedSessionActivationBindingsFactory =
      createSavedSessionActivationBindingsFactory({
        clearConversationBuffers: () => this.clearConversationBuffers(),
        restoreModelConversation: modelConversation =>
          this.conversationRuntimeStateBindings.restoreModelConversationFromRuntime(
            modelConversation,
          ),
        restorePendingPlanVerification: pendingPlanVerification =>
          this.conversationRuntimeStateBindings.restorePendingPlanVerificationState(
            pendingPlanVerification,
          ),
        restoreCompactBoundary: compactBoundary =>
          this.conversationRuntimeStateBindings.restoreCompactBoundaryFromRuntime(
            compactBoundary,
          ),
        markConversationBaseline: count =>
          this.autoMemoryBindings.markCurrentConversationBaseline(count),
      });
    const savedSessionActivationBindings = savedSessionActivationBindingsFactory({
      setCurrentSessionId: sessionId => {
        this.currentSessionId = sessionId;
      },
      sessionMessages: this.sessionMessages,
    });
    const createProviderRuntimeOptions =
      createProviderRuntimeOptionsFactoryWithHost({
        getEffortLevel: () => this.settings.getEffortLevel(),
        getFastMode: () => this.settings.getFastMode(),
        getFastModeEnabled: () => this.settings.getFastMode(),
        setFastModeEnabled: enabled => this.settings.setFastMode(enabled),
        addPhaseActivity: (kind, label, detail, status) =>
          this.activityTracker.add(kind, label, detail, status),
        postState: () => this.postState(),
        refreshWorkspaceStatus: () =>
          this.workspaceStatusController.requestRefresh(),
        showWarningMessage: message => {
          void vscode.window.showWarningMessage(message);
        },
      });
    const workspaceRuntimeHostFactory =
      createWorkspaceRuntimeHostFactory({
        requestFileApproval: (workspaceFolderPath, request) =>
          this.approvalHost.requestFileApproval(workspaceFolderPath, request),
        requestToolApproval: request =>
          this.approvalHost.requestToolApproval(request),
        onToolLifecycle: event =>
          this.activityTracker.handleToolLifecycle(event),
        resolveProviderConfig: workspaceFolderPath =>
          resolveProviderConfig(this.settings, workspaceFolderPath),
        getEffortLevel: () => this.settings.getEffortLevel(),
        createProviderRuntimeOptions,
        ensureConversationWorktreeHydrated: path =>
          this.conversationScopeBindings.ensureConversationWorktreeHydrated(path),
        getEffectiveWorkspaceRoot: path =>
          this.conversationScopeBindings.getEffectiveWorkspaceRoot(path),
        getWorkspaceRuntime: (workspaceFolderPath, envMap) =>
          this.workspaceRuntimeHost.getRuntime(workspaceFolderPath, envMap),
        backgroundTaskHost: this.backgroundTaskHost,
        findActiveBuiltInAgentTask: (workspaceRoot, agentType, diffRef) =>
          this.conversationScopeBindings.findActiveBuiltInAgentTask(
            workspaceRoot,
            agentType,
            diffRef,
          ),
        createProviderAdapter: options =>
          buildProviderAdapter(
            options.config,
            options.workspaceRoot,
            options.systemPrompt,
            options.envMap,
            options.runtimeOptions,
          ),
        runCommandInBackground: (workspaceFolderPath, request) =>
          this.backgroundCommandToolLaunchBindings.runBackgroundCommandFromTool(
            workspaceFolderPath,
            request.command,
          ),
        findReusableBackgroundCommand: (workspaceFolderPath, request) =>
          this.backgroundCommandToolLaunchBindings.findReusableBackgroundCommand(
            workspaceFolderPath,
            request.command,
          ),
        readConfig: key => {
          switch (key) {
            case "effortLevel":
              return this.settings.getEffortLevel() ?? "auto";
            case "fastMode":
              return this.settings.getFastMode();
            case "showThinkingSummaries":
            case "verbose":
              return this.settings.getShowThinkingSummaries();
            case "uiLanguage":
              return this.settings.getLanguage();
            case "model":
              return this.settings.getActiveProviderMeta()?.model ?? "unknown";
            default:
              return undefined;
          }
        },
        writeConfig: async (key, value) => {
          switch (key) {
            case "effortLevel":
              await this.settings.setEffortLevel(
                value === "auto" ? undefined : (value as EffortLevel),
              );
              return;
            case "fastMode":
              await this.settings.setFastMode(Boolean(value));
              return;
            case "showThinkingSummaries":
            case "verbose":
              await this.settings.setShowThinkingSummaries(Boolean(value));
              return;
            case "uiLanguage":
              await this.settings.setLanguage(String(value));
              return;
            default:
              throw new Error(`Unsupported config setting: ${key}`);
          }
        },
        skillStore: this.skillStore,
        mcpOAuthHost: this.host,
      });
    this.workspaceRuntimeHost = workspaceRuntimeHostFactory({
      getConversationKey: () =>
        this.conversationFeatureBindings.getConversationKey(),
      clearSwarm,
      getPlanModeState: () => this.planModeState,
      setPlanModeState,
      clearPendingPlanVerification: () =>
        this.conversationRuntimeStateBindings.setPendingPlanVerificationState(
          undefined,
        ),
      setPendingPlanVerification: nextState =>
        this.conversationRuntimeStateBindings.setPendingPlanVerificationState(
          nextState,
        ),
      postState: () => this.postState(),
      getPendingPlanVerification: () => this.pendingPlanVerification,
      markPendingPlanVerificationStarted: () =>
        this.conversationRuntimeStateBindings.markPendingPlanVerificationStarted(),
      markPendingPlanVerificationCompleted: () =>
        this.conversationRuntimeStateBindings.markPendingPlanVerificationCompleted(),
      resetPendingPlanVerificationToAwaitingStart: () =>
        this.conversationRuntimeStateBindings.resetPendingPlanVerificationToAwaitingStart(),
      getConversationHistory: () =>
        this.conversationHistoryBindings.getConversationHistory().filter(
          (
            message,
          ): message is Extract<
            PersistedConversationMessage,
            { role: "user" | "assistant" }
          > => message.role === "user" || message.role === "assistant",
        ),
      getSessionInstalledSkillHooks: () =>
        getSessionInstalledSkillHooks(
          this.sessionInstalledSkillHooks,
          this.conversationFeatureBindings.getConversationKey(),
        ),
      registerSessionInstalledSkillHooks: hooks =>
        registerSessionInstalledSkillHooks(
          this.sessionInstalledSkillHooks,
          this.conversationFeatureBindings.getConversationKey(),
          hooks,
        ),
      getSessionMessages: () => this.sessionMessages,
      getTasks: workspaceFolderPath =>
        this.conversationScopeBindings.getConversationTaskRuntime(workspaceFolderPath),
      getWorktree: workspaceFolderPath =>
        this.conversationScopeBindings.getConversationWorktreeRuntime(workspaceFolderPath),
      stopSwarmWorker: async taskId => {
        if (!this.swarm) {
          throw new Error("No background task controller is available.");
        }
        return this.swarm.stopWorker(taskId);
      },
    });
    const workspaceStatusControllerFactory =
      createWorkspaceStatusControllerFactory({
        resolveProviderConfig: () =>
          resolveProviderConfig(
            this.settings,
            requirePrimaryWorkspaceFolderPath(),
          ),
        getEffortLevel: () => this.settings.getEffortLevel(),
        createProviderRuntimeOptions,
        ensureConversationWorktreeHydrated: nextWorkspaceRoot =>
          this.conversationScopeBindings.ensureConversationWorktreeHydrated(nextWorkspaceRoot),
        getEffectiveWorkspaceRoot: nextWorkspaceRoot =>
          this.conversationScopeBindings.getEffectiveWorkspaceRoot(nextWorkspaceRoot),
        getWorkspaceRuntime: envMap =>
          this.workspaceRuntimeHost.getRuntime(
            requirePrimaryWorkspaceFolderPath(),
            envMap,
          ),
      });
    this.workspaceStatusController = workspaceStatusControllerFactory({
      getWorkspaceFolderPath: getPrimaryWorkspaceFolderPath,
      getIsBusy: () => this.isBusy,
      getHasPendingApproval: () => this.approvalHost.hasPendingApproval(),
      applyWorkspaceStatus: ({ mcpServers, providerLabel }) => {
        this.mcpServers = mcpServers;
        this.providerLabel = providerLabel || this.providerLabel;
      },
      postState: () => this.postState(),
      clearCachedTools: () => {
        this.cachedTools = undefined;
        this.cachedToolsWorkspaceRoot = undefined;
      },
      runtimes: this.workspaceRuntimeHost.getRuntimes(),
    });
    this.cronScheduler.start(
      getPrimaryWorkspaceFolderPath() ?? "",
      prompt => {
        void this.handlePrompt(prompt);
      },
    );
    this.disposeFastModeRuntimeListener = onFastModeRuntimeStateChanged(() => {
      this.postState();
      this.workspaceStatusController.requestRefresh();
    });
    const sessionPanelControllerFactory = createSessionPanelControllerFactory({
      settings: this.settings,
      sessions: this.sessions,
      getPersistenceEnabled: () =>
        this.conversationFeatureBindings.isSessionPersistenceEnabled(),
      refreshWorkspaceStatus: this.workspaceStatusController.requestRefresh,
      savedSessionActivationBindings,
      markConversationBaseline: count =>
        this.autoMemoryBindings.markCurrentConversationBaseline(count),
      showSaveDialog: async input => {
        const saveUri = await vscode.window.showSaveDialog({
          defaultUri: input.defaultPath ? vscode.Uri.file(input.defaultPath) : undefined,
          filters: { Markdown: ["md"] },
          title: input.title,
        });
        return saveUri?.fsPath;
      },
      writeFile: async (targetPath, content) => {
        await vscode.workspace.fs.writeFile(
          vscode.Uri.file(targetPath),
          Buffer.from(content, "utf8"),
        );
      },
      showInformationMessage: message => {
        void vscode.window.showInformationMessage(message);
      },
    });
    this.sessionPanelActions = sessionPanelControllerFactory({
      workspaceRoot: getPrimaryWorkspaceFolderPath(),
      getCurrentSessionId: () => this.currentSessionId,
      setCurrentSessionId: id => {
        this.currentSessionId = id;
      },
      getPreviousSignature: () => this.lastSessionsDataSignature,
      setSignature: signature => {
        this.lastSessionsDataSignature = signature;
      },
      disposeSwarm: clearSwarm,
      resetActiveRuntimeControllers: () => this.resetActiveRuntimeControllers(),
      resetPlanMode: () => {
        setPlanModeState(resetPlanModeState());
      },
      clearCachedTools: () => {
        this.cachedTools = undefined;
        this.cachedToolsWorkspaceRoot = undefined;
      },
      clearPendingPlanVerification: persist =>
        this.conversationRuntimeStateBindings.setPendingPlanVerificationState(
          undefined,
          persist === false ? { persist: false } : undefined,
        ),
      setTransientConversationId: id => {
        if (id) {
          this.transientConversationId = id;
        }
      },
      resetAutoMemoryConversation: sessionId =>
        this.autoMemoryBindings.resetConversation(sessionId),
      ensureConversationWorktreeHydrated: workspaceRoot =>
        this.conversationScopeBindings.ensureConversationWorktreeHydrated(workspaceRoot),
      shouldRefreshSessionsList: () => this.shouldRefreshSessionsList(),
      postState: () => this.postState(),
      publishSessions: payload => {
        this.webviewView?.webview.postMessage({
          type: "sessions:data",
          sessions: payload.sessions,
          activeId: payload.activeId,
        });
      },
      logSession: (event, details) => {
        this.logSession(event, details);
      },
    });
    const companionControllerFactory = createCompanionControllerFactory({
      getMachineId: () => vscode.env.machineId || os.hostname(),
      hasLicense: () => this.settings.isLicenseActivated() || !!this.licenseFlags,
      getStoredCompanion: () => this.host.getState<CompanionData>(COMPANION_STATE_KEY),
      persistCompanionData: async companionData => {
        await persistCompanionDataHost({
          companionData,
          key: COMPANION_STATE_KEY,
          setState: (key, value) => this.host.setState(key, value),
        });
      },
      postCompanionInit: companionData => {
        this.webviewStateHost.postCompanionInit(companionData);
      },
      postCompanionState: state => {
        this.webviewStateHost.postCompanionState(state);
      },
      postCompanionMood: (delta, companionData) => {
        this.webviewStateHost.postCompanionMood(delta, companionData);
      },
    });
    this.companionBindings = companionControllerFactory({
      getCompanionData: () => this.companionData,
      setCompanionData: companionData => {
        this.companionData = companionData;
      },
    });
    const settingsPanelControllerFactory = createSettingsPanelControllerFactory({
      settings: this.settings,
      refreshWorkspaceStatus: this.workspaceStatusController.requestRefresh,
      initializeCompanion: () => this.companionBindings.initializeCompanion(),
      storeLicenseKey: rawKey => this.host.storeSecret("cain.licenseKey", rawKey),
      verifyLicense,
    });
    this.settingsPanelActions = settingsPanelControllerFactory({
      postWebviewMessage: payload => {
        this.webviewView?.webview.postMessage(payload);
      },
      postState: () => this.postState(),
      logSession: (event, details) => {
        this.logSession(event, details);
      },
      setLicenseFlags: flags => {
        this.licenseFlags = flags;
      },
      shouldRefreshSessionsList: () => this.shouldRefreshSessionsList(),
      handleSessionsLoad: this.sessionPanelActions.loadSessions,
    });
    const editorInteractionBindings = createEditorInteractionBindings({
      getWorkspaceRoot: getPrimaryWorkspaceFolderPath,
      getActiveDocumentPath: () => vscode.window.activeTextEditor?.document.uri.fsPath,
      getActiveEditor: () => vscode.window.activeTextEditor,
      ensureReadySequence: () => this.readySequenceController.ensureReadySequence(),
      handlePrompt: prompt => this.handlePrompt(prompt),
      postUnavailableMessage: message => {
        this.sessionMessages.push({
          role: "assistant",
          content: message,
          kind: "error",
        });
        this.postState();
      },
      postErrorMessage: message => {
        void vscode.window.showErrorMessage(`Cain Claude: ${message}`);
      },
      toErrorMessage,
      postSelectionPayload: options => {
        postEditorSelectionPayload({
          ...options,
          postMessage: payload => {
            this.webviewView?.webview.postMessage(payload);
          },
        });
      },
    });
    this.quickActionBindings = editorInteractionBindings.quickAction;
    this.editorSelectionBindings = editorInteractionBindings.selection;
    const licenseHostBindingsFactory = createLicenseHostBindingsFactory({
      getSecret: key => this.host.getSecret(key),
      verifyLicense,
      postLicenseRequired: feature => {
        this.webviewStateHost.postLicenseRequired(feature);
      },
      log: (...args) => {
        console.log(...args);
      },
      warn: (...args) => {
        console.warn(...args);
      },
    });
    this.licenseHostBindings = licenseHostBindingsFactory({
      getCurrentLicenseFlags: () => this.licenseFlags,
      setLicenseFlags: flags => {
        this.licenseFlags = flags;
      },
    });
    const readySequenceControllerFactory = createReadySequenceControllerFactory({
      restoreLicenseFlags: () => this.licenseHostBindings.restoreLicenseFlags(),
      initializeCompanion: () => this.companionBindings.initializeCompanion(),
      getOnboardingDone: () => this.settings.isOnboardingDone(),
      getSessionPersistenceEnabled: () =>
        this.conversationFeatureBindings.isSessionPersistenceEnabled(),
      getWorkspaceRoot: getPrimaryWorkspaceFolderPath,
      getWorkspaceHash,
      getLastSessionId: () => this.settings.getActiveSessionId(),
      readIndex: () => this.sessions.readIndex(),
      loadMessages: id => this.sessions.loadMessages(id),
      loadRuntimeState: id => this.sessions.loadRuntimeState(id),
      savedSessionActivationBindings,
      setActiveSessionId: id => this.settings.setActiveSessionId(id),
      onSessionStart: async details => {
        const userHooks = await loadHooks(details.workspaceRoot ?? "");
        if (userHooks.length === 0) {
          return;
        }
        await triggerHooks(
          "SessionStart",
          userHooks,
          {
            workspaceRoot: details.workspaceRoot ?? "",
            sessionId: this.currentSessionId,
          },
          undefined,
        );
      },
      postLicenseRequired: feature =>
        this.licenseHostBindings.postLicenseRequired(feature),
      postState: () => this.postState(),
      refreshWorkspaceStatus: this.workspaceStatusController.requestRefresh,
      ensureConversationWorktreeHydrated: nextWorkspaceRoot =>
        this.conversationScopeBindings.ensureConversationWorktreeHydrated(nextWorkspaceRoot),
    });
    this.readySequenceController = readySequenceControllerFactory({
      showOnboarding: () => {
        this.webviewView?.webview.postMessage({ type: "showOnboarding" });
      },
      logReady: details => {
        this.logSession("ready", details);
      },
      logRestoreMissed: details => {
        this.logSession("restore-missed", details);
      },
      logRestoreSkippedEmpty: details => {
        this.logSession("restore-skipped-empty", details);
      },
      logRestoreSuccess: details => {
        this.logSession("restore-success", details);
      },
      shouldRefreshSessionsList: () => this.shouldRefreshSessionsList(),
      handleSessionsLoad: this.sessionPanelActions.loadSessions,
    });
    this.extensionPromptRequestPartsFactory =
      createExtensionPromptRequestPartsFactory({
        settings: this.settings,
        sessions: this.sessions,
        logSession: (event, details) => this.logSession(event, details),
        conversationFeatureBindings: this.conversationFeatureBindings,
        conversationHistoryBindings: this.conversationHistoryBindings,
        conversationRuntimeStateBindings:
          this.conversationRuntimeStateBindings,
        conversationScopeBindings: this.conversationScopeBindings,
        activityTracker: this.activityTracker,
        backgroundTaskHost: this.backgroundTaskHost,
        workspaceStatusController: this.workspaceStatusController,
        workspaceRuntimeHost: this.workspaceRuntimeHost,
        companionBindings: this.companionBindings,
        assistantReplyBindings: this.assistantReplyBindings,
        scheduleStreamingStateUpdate: () =>
          this.streamingStateBindings.scheduleStreamingStateUpdate(),
        postState: () => this.postState(),
        showWarningMessage: message => {
          void vscode.window.showWarningMessage(message);
        },
        postWebviewMessage: payload => {
          this.webviewView?.webview.postMessage(payload);
        },
        getPlanContentForWorkspace: workspaceRoot =>
          getPlanContentForWorkspace({
            workspaceRoot,
            planModeState: this.planModeState,
          }),
        isAbortLikeError: error => this.isAbortLikeError(error),
        toErrorMessage,
        skillStore: this.skillStore,
        profileStore: this.profileStore,
      });
    for (const candidate of [".mcp.json", ".cain-mcp.json"]) {
      const watcher = vscode.workspace.createFileSystemWatcher(`**/${candidate}`);
      const invalidate = () => {
        this.workspaceStatusController.invalidate();
      };
      this.mcpConfigWatchers.push(
        watcher,
        watcher.onDidChange(invalidate),
        watcher.onDidCreate(invalidate),
        watcher.onDidDelete(invalidate),
      );
    }
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;
    this.readySequenceController.reset();
    const duckAssetRoot = vscode.Uri.joinPath(this.extensionUri, "src", "companion", "assets");
    const duckSpriteUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(duckAssetRoot, "duck.png"),
    );

    configureSidebarWebviewView({
      webviewView,
      localResourceRoots: [this.extensionUri, duckAssetRoot],
      html: getSidebarHtml(
        this.getNonce(),
        duckSpriteUri.toString(),
        webviewView.webview.cspSource,
      ),
      handleMessage: async message => {
        const sessionPanelActions = this.sessionPanelActions;
        const settingsPanelActions = this.settingsPanelActions;

        await routeSidebarWebviewMessage({
          message,
          session: {
            isMultiSessionEnabled: () =>
              this.conversationFeatureBindings.isMultiSessionEnabled(),
            postLicenseRequired: feature =>
              this.licenseHostBindings.postLicenseRequired(feature),
            setSessionsPanelOpen: open => {
              this.sessionsPanelOpen = open;
            },
            loadSessions: sessionPanelActions.loadSessions,
            switchSession: sessionPanelActions.switchSession,
            renameSession: sessionPanelActions.renameSession,
            deleteSession: sessionPanelActions.deleteSession,
            exportSession: sessionPanelActions.exportSession,
            createNewSession: sessionPanelActions.createNewSession,
          },
          settings: {
            validateOnboardingKey: settingsPanelActions.validateOnboardingKey,
            completeOnboarding: (meta, apiKey) =>
              settingsPanelActions.completeOnboarding(meta as ProviderMeta, apiKey),
            loadSettings: settingsPanelActions.loadSettings,
            saveSettingsProvider: (meta, apiKey) =>
              settingsPanelActions.saveSettingsProvider(meta as ProviderMeta, apiKey),
            deleteSettingsProvider: settingsPanelActions.deleteSettingsProvider,
            setShowThinkingSummaries:
              settingsPanelActions.setShowThinkingSummaries,
            setActiveProvider: settingsPanelActions.setActiveProvider,
            closeSettings: settingsPanelActions.closeSettings,
            activateLicense: settingsPanelActions.activateLicense,
          },
          chat: {
            ensureReadySequence: () =>
              this.readySequenceController.ensureReadySequence(),
            clearChat: () => this.clearChat(),
            sendPrompt: (prompt, attachments) =>
              this.handlePrompt(prompt, attachments),
      runQuickAction: action =>
        this.quickActionBindings.handleQuickAction(action),
      resolvePendingApproval: approved =>
        this.approvalHost.resolvePendingApproval(approved),
      requestEditorSelection: () =>
        this.editorSelectionBindings.requestEditorSelection(),
    },
  });
      },
    });
  }

  async focus(): Promise<void> {
    await vscode.commands.executeCommand("terminalAiAssistant.chatView.focus");
  }

  showSettingsPanel(): void {
    this.webviewView?.webview.postMessage({ type: "showSettings" });
  }

  clearChat(): void {
    clearConversationHostState({
      resetAutoMemoryConversation: () =>
        this.autoMemoryBindings.resetConversation(
          this.conversationFeatureBindings.getConversationKey(),
        ),
      resetActiveRuntimeControllers: () => this.resetActiveRuntimeControllers(),
      clearConversationBuffers: () => this.clearConversationBuffers(),
      setCurrentSessionId: id => {
        this.currentSessionId = id;
      },
      setTransientConversationId: id => {
        this.transientConversationId = id;
      },
      resetPlanMode: () => {
        this.planModeState = resetPlanModeState();
      },
      clearPendingPlanVerification: () => {
        this.pendingPlanVerification = undefined;
      },
      clearCompactBoundary: () => {
        this.compactBoundary = undefined;
      },
      clearPendingPromptAttachments: () => {
        this.pendingPromptAttachments = undefined;
      },
      markConversationBaseline: count =>
        this.autoMemoryBindings.markCurrentConversationBaseline(count),
      clearStreamingState: () =>
        this.streamingStateBindings.clearStreamingUpdateTimer(),
      clearStreamingText: () => {
        this.streamingText = "";
      },
      resetActivities: () => {
        this.activityTracker.reset();
      },
      clearCachedTools: () => {
        this.cachedTools = undefined;
        this.cachedToolsWorkspaceRoot = undefined;
      },
      disposeSwarm: () => {
        this.swarm?.dispose();
        this.swarm = undefined;
      },
      clearCurrentSessionInstalledSkillHooks: () => {
        clearSessionInstalledSkillHooks(
          this.sessionInstalledSkillHooks,
          this.conversationFeatureBindings.getConversationKey(),
        );
      },
      postState: () => this.postState(),
    });
  }

  async dispose(): Promise<void> {
    const workspaceRoot = getPrimaryWorkspaceFolderPath() ?? "";
    const sessionId = this.currentSessionId;
    const userHooks = await loadHooks(workspaceRoot);
    const sessionEndHooks = [
      ...(getSessionInstalledSkillHooks(
        this.sessionInstalledSkillHooks,
        this.conversationFeatureBindings.getConversationKey(),
      ) ?? []),
      ...userHooks,
    ];
    if (sessionEndHooks.length > 0) {
      await triggerHooks(
        "SessionEnd",
        sessionEndHooks,
        {
          workspaceRoot,
          sessionId,
        },
        undefined,
      );
    }
    this.disposeFastModeRuntimeListener();
    clearInterval(this.backgroundTaskNotificationTimer);
    for (const watcher of this.mcpConfigWatchers) {
      watcher.dispose();
    }
    this.swarm?.dispose();
    this.cronScheduler.stop();
    clearAllSessionInstalledSkillHooks(this.sessionInstalledSkillHooks);
    this.resetActiveRuntimeControllers();
    await this.sessions.flush().catch(error => {
      console.warn(`[Cain Sessions] Failed to flush session index during dispose: ${toErrorMessage(error)}`);
    });
    await this.workspaceRuntimeHost.dispose();
  }

  private logSession(
    event: string,
    details: Record<string, unknown> = {},
  ): void {
    console.log(
      "[Cain Session]",
      event,
        JSON.stringify({
          storagePath: this.host.getStorageUri(),
          currentSessionId: this.currentSessionId ?? null,
          activeSessionId: this.settings.getActiveSessionId() ?? null,
          persistenceEnabled:
            this.conversationFeatureBindings.isSessionPersistenceEnabled(),
          multiSessionEnabled:
            this.conversationFeatureBindings.isMultiSessionEnabled(),
          ...details,
        }),
      );
  }

  private resetActiveRuntimeControllers(): void {
    this.backgroundTaskHost.dispose();
  }

  private clearConversationBuffers(): void {
    this.sessionMessages.length = 0;
    this.conversationMessages.length = 0;
    this.compactBoundary = undefined;
  }

  private getVisibleSessionMessages(): ChatMessage[] {
    return getVisibleSessionMessages(
      this.sessionMessages,
      this.settings.getShowThinkingSummaries(),
    );
  }

  private shouldRefreshSessionsList(): boolean {
    return (
      this.conversationFeatureBindings.isMultiSessionEnabled() &&
      this.sessionsPanelOpen
    );
  }

  private isAbortLikeError(error: unknown): boolean {
    const message = toErrorMessage(error);
    return /abort/i.test(message);
  }

  // Ready flow: check onboarding and restore persisted session state (P01).

  private async ensureReadySequence(): Promise<void> {
    await this.readySequenceController.ensureReadySequence();
  }

  // handlePrompt: main agent runner path plus P01 session persistence.

  private async handlePrompt(prompt: string, attachments?: WebviewAttachment[]): Promise<void> {
    this.pendingPromptAttachments = normalizeWebviewAttachments(attachments);

    let moodPenaltyApplied = false;
    const clearStreamingState = () => {
      this.streamingStateBindings.clearStreamingUpdateTimer();
      this.streamingText = "";
    };
    const showCainErrorMessage = (message: string) => {
      void vscode.window.showErrorMessage(`Cain Claude: ${message}`);
    };
    const setBusy = (busy: boolean) => {
      this.isBusy = busy;
    };
    const preparedTurn = await preparePromptTurn({
      beginBindings: createBeginPromptTurnBindings({
        prompt,
        attachments: this.pendingPromptAttachments,
        isBusy: this.isBusy,
        hasPendingApproval: this.approvalHost.hasPendingApproval(),
        ensureReadySequence: () => this.readySequenceController.ensureReadySequence(),
        workspaceFolderPath: getPrimaryWorkspaceFolderPath(),
        sessionMessages: this.sessionMessages,
        clearStreamingState,
        activityTracker: this.activityTracker,
        setBusy,
        postState: () => this.postState(),
        showErrorMessage: showCainErrorMessage,
        toErrorMessage,
      }),
      workspaceFolder: getPrimaryWorkspaceFolder(),
      hasExplicitSwarmIntent,
      isSwarmEnabled: this.conversationFeatureBindings.isSwarmEnabled(),
      postLicenseRequired: feature =>
        this.licenseHostBindings.postLicenseRequired(feature),
      setBusy,
      postState: () => this.postState(),
    });
    if (preparedTurn.kind !== "continue") {
      return;
    }

    await runPromptTurnExecution({
      analyzeActivityId: preparedTurn.analyzeActivityId,
      finishAnalyzeActivity: (activityId, status, detail) => {
        this.activityTracker.finish(activityId, status, detail);
      },
      runPromptRequest: async () => {
        await runPromptRequestWithExtensionParts<WorkspaceRuntime>({
          prompt: preparedTurn.trimmedPrompt,
          parts: this.extensionPromptRequestPartsFactory({
            workspaceFolderPath: preparedTurn.workspaceFolder.uri.fsPath,
            onToolError: () => {
              moodPenaltyApplied = true;
              void this.companionBindings.updateCompanionMood(-2);
            },
            state: createExtensionPromptRequestState({
              getCurrentSessionId: () => this.currentSessionId,
              setCurrentSessionId: sessionId => {
                this.currentSessionId = sessionId;
              },
              sessionMessages: this.sessionMessages,
              conversationMessages: this.conversationHistoryBindings.getConversationHistory(),
              getPendingPromptAttachments: () => this.pendingPromptAttachments,
              setPendingPromptAttachments: attachments => {
                this.pendingPromptAttachments = attachments;
              },
              pendingPlanVerification: this.pendingPlanVerification,
              planModeState: this.planModeState,
              getSwarm: () => this.swarm,
              setSwarm: swarm => {
                this.swarm = swarm;
              },
              getSessionInstalledSkillHooks: () =>
                getSessionInstalledSkillHooks(
                  this.sessionInstalledSkillHooks,
                  this.conversationFeatureBindings.getConversationKey(),
                ),
              registerSessionInstalledSkillHooks: hooks =>
                registerSessionInstalledSkillHooks(
                  this.sessionInstalledSkillHooks,
                  this.conversationFeatureBindings.getConversationKey(),
                  hooks,
                ),
              queueAutoMemoryExtraction: options =>
                this.autoMemoryBindings.queueAutoMemoryExtraction(options),
              cachedTools: this.cachedTools,
              cachedToolsWorkspaceRoot: this.cachedToolsWorkspaceRoot,
              setWorkspaceToolCache: ({
                tools,
                workspaceRoot,
                mcpServers,
                providerLabel,
              }) => {
                this.mcpServers = mcpServers ?? [];
                this.cachedTools = tools;
                this.cachedToolsWorkspaceRoot = workspaceRoot;
                this.providerLabel = providerLabel ?? this.providerLabel;
              },
              appendStreamingText: token => {
                this.streamingText += token;
              },
              clearStreamingText: () => {
                this.streamingText = "";
              },
            }),
          }),
        });
      },
      buildFailureBindings: error =>
        createPromptTurnFailureBindings({
          error,
          sessionMessages: this.sessionMessages,
          activityTracker: this.activityTracker,
          getFailureActivityLabel,
          setCompanionState: state => this.companionBindings.postCompanionState(state),
          updateMood: delta => this.companionBindings.updateCompanionMood(delta),
          moodPenaltyApplied,
          showErrorMessage: showCainErrorMessage,
          toErrorMessage,
        }),
      finalizeBindings: createFinalizePromptTurnBindings({
        flushSessions: async () => {
          await this.sessions.flush().catch(error => {
            console.warn(
              `[Cain Sessions] Failed to flush session index after prompt turn: ${toErrorMessage(error)}`,
            );
          });
        },
        activityTracker: this.activityTracker,
        clearStreamingState,
        setBusy,
        postState: () => this.postState(),
      }),
    });
  }

  private postState(): void {
    this.webviewStateBindings.postState();
  }

  private getNonce(): string {
    return randomUUID().replace(/-/g, "");
  }
}

// Extension activation entrypoint.

export function activate(context: vscode.ExtensionContext): void {
  // Wire up the host adapter. Approval callbacks are provided by the sidebar provider later.
  const host = new VsCodeHostAdapter(context, () => {});

  const settings = new SettingsRepository(host);
  const sessions = new SessionRepository(context.globalStorageUri.fsPath);

  const provider = new ChatSidebarProvider(context.extensionUri, settings, sessions, host);

  context.subscriptions.push(
    ...registerChatSidebarExtension({
      viewType: ChatSidebarProvider.viewType,
      provider,
      registerWebviewViewProvider: (viewType, nextProvider) =>
        vscode.window.registerWebviewViewProvider(
          viewType,
          nextProvider as vscode.WebviewViewProvider,
        ),
      registerCommand: (commandId, callback) =>
        vscode.commands.registerCommand(commandId, callback),
    }),
  );
}

export function deactivate(): void {}
