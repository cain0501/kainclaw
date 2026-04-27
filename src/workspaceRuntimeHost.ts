import type {
  IProviderAdapter,
  ProviderConfig as AdapterProviderConfig,
} from "./agent/providers/IProviderAdapter";
import type { BackgroundTaskHost } from "./backgroundTaskHost";
import type { PendingPlanVerificationState } from "./conversationRuntimeStateHost";
import {
  runReviewFromToolWithHost,
  runVerificationFromToolWithHost,
} from "./inspectionHost";
import type { PlanModeState } from "./planMode/planMode";
import {
  enterPlanModeWithHost,
  exitPlanModeWithHost,
  getPlanContentForWorkspace,
} from "./planModeHost";
import type { SkillStore } from "./skills/skillStore";
import type { ChatMessage } from "./storage/sessionRepository";
import type { EffortLevel, ProviderRuntimeOptions } from "./thinkingEffort/types";
import type { ToolContext } from "./toolRuntime";
import type {
  ToolActionApprovalRequest,
  ToolLifecycleEvent,
  WriteApprovalRequest,
} from "./toolRuntime";
import type { ConversationTaskRuntime } from "./tasks/types";
import type { ConversationWorktreeRuntime } from "./worktree/types";
import type { VerificationVerdict } from "./verification/prompt";
import type { ProviderResolution, WorkspaceRuntimeLike } from "./workspaceHost";
import type { McpOAuthHost } from "./mcpOAuth";
import {
  WorkspaceRuntime,
  type WorkspacePlanModeController,
  type WorkspacePlanVerificationState,
} from "./workspaceRuntimeShell";
import { runProviderExtractionStep } from "./providerHost";

type StoppedBackgroundTask = {
  taskId: string;
  taskType: string;
  command: string;
};

type BackgroundCommandResult = {
  taskId: string;
  command: string;
  workspaceRoot: string;
  outputPath?: string;
  alreadyRunning?: boolean;
};

type WebContentExtractionRequest = Parameters<
  NonNullable<ToolContext["extractWebContent"]>
>[0];

export type WorkspaceRuntimeHostOptions = {
  getWorkspaceRoot: (workspaceFolderPath: string) => string;
  requestFileApproval: (
    workspaceFolderPath: string,
    request: WriteApprovalRequest,
  ) => Promise<boolean>;
  requestToolApproval: (
    request: ToolActionApprovalRequest,
  ) => Promise<boolean>;
  onToolLifecycle: (event: ToolLifecycleEvent) => void;
  getPlanModeController: (
    workspaceFolderPath: string,
  ) => WorkspacePlanModeController;
  getPlanVerificationState: () => WorkspacePlanVerificationState | undefined;
  getTasks: (workspaceFolderPath: string) => ConversationTaskRuntime;
  getWorktree: (workspaceFolderPath: string) => ConversationWorktreeRuntime;
  stopBackgroundTask: (
    taskId: string,
    workspaceFolderPath: string,
  ) => Promise<StoppedBackgroundTask | null>;
  stopSwarmWorker: (taskId: string) => Promise<StoppedBackgroundTask>;
  runVerification: (
    workspaceFolderPath: string,
    request: { extraGuidance?: string; diffRef?: string },
  ) => Promise<{ taskId: string; verdict: VerificationVerdict; report: string }>;
  runReview: (
    workspaceFolderPath: string,
    request: { extraGuidance?: string; diffRef?: string },
  ) => Promise<{ taskId: string; report: string }>;
  runCommandInBackground: (
    workspaceFolderPath: string,
    request: { command: string },
  ) => Promise<BackgroundCommandResult>;
  findReusableBackgroundCommand: (
    workspaceFolderPath: string,
    request: { command: string },
  ) => Promise<BackgroundCommandResult | null>;
  extractWebContent: (
    workspaceFolderPath: string,
    request: WebContentExtractionRequest,
  ) => Promise<string>;
  skillStore?: SkillStore;
  mcpOAuthHost?: McpOAuthHost;
};

type InspectionRuntimeLike = {
  getToolContext: (
    invokerKind?: ToolContext["invokerKind"],
  ) => ToolContext;
};

export type WorkspaceRuntimeHostFactoryState = {
  getConversationKey: () => string;
  clearSwarm: () => void;
  getPlanModeState: () => PlanModeState;
  setPlanModeState: (state: PlanModeState) => void;
  clearPendingPlanVerification: () => void;
  setPendingPlanVerification: (
    state: PendingPlanVerificationState,
  ) => void;
  postState: () => void;
  getPendingPlanVerification: () => PendingPlanVerificationState | undefined;
  markPendingPlanVerificationStarted: () => void;
  markPendingPlanVerificationCompleted: () => void;
  resetPendingPlanVerificationToAwaitingStart: () => void;
  getConversationHistory: () => Array<{
    role: "user" | "assistant";
    content: string;
    attachments?: Array<{ data: string; mimeType: string }>;
  }>;
  getSessionMessages: () => ChatMessage[];
  getTasks: (workspaceFolderPath: string) => ConversationTaskRuntime;
  getWorktree: (workspaceFolderPath: string) => ConversationWorktreeRuntime;
  stopSwarmWorker: (taskId: string) => Promise<StoppedBackgroundTask>;
};

export type WorkspaceRuntimeHostFactory<
  TRuntime extends WorkspaceRuntimeLike & InspectionRuntimeLike,
> = (state: WorkspaceRuntimeHostFactoryState) => WorkspaceRuntimeHost;

export function createWorkspaceRuntimeHostFactory<
  TRuntime extends WorkspaceRuntimeLike & InspectionRuntimeLike,
>(options: {
  requestFileApproval: (
    workspaceFolderPath: string,
    request: WriteApprovalRequest,
  ) => Promise<boolean>;
  requestToolApproval: (
    request: ToolActionApprovalRequest,
  ) => Promise<boolean>;
  onToolLifecycle: (event: ToolLifecycleEvent) => void;
  resolveProviderConfig: (
    workspaceFolderPath: string,
  ) => Promise<ProviderResolution>;
  getEffortLevel: () => EffortLevel | undefined;
  createProviderRuntimeOptions: (
    config: AdapterProviderConfig,
  ) => ProviderRuntimeOptions;
  ensureConversationWorktreeHydrated: (
    workspaceFolderPath: string,
  ) => Promise<void>;
  getEffectiveWorkspaceRoot: (workspaceFolderPath: string) => string;
  getWorkspaceRuntime: (
    workspaceFolderPath: string,
    envMap: Record<string, string>,
  ) => Promise<TRuntime>;
  backgroundTaskHost: Pick<
    BackgroundTaskHost,
    "stopTask" | "runBuiltInAgentSession"
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
    runtimeOptions: ProviderRuntimeOptions;
  }) => IProviderAdapter;
  runCommandInBackground: (
    workspaceFolderPath: string,
    request: { command: string },
  ) => Promise<BackgroundCommandResult>;
  findReusableBackgroundCommand: (
    workspaceFolderPath: string,
    request: { command: string },
  ) => Promise<BackgroundCommandResult | null>;
  skillStore?: SkillStore;
  mcpOAuthHost?: McpOAuthHost;
}): WorkspaceRuntimeHostFactory<TRuntime> {
  return state =>
    new WorkspaceRuntimeHost({
      getWorkspaceRoot: workspaceFolderPath =>
        options.getEffectiveWorkspaceRoot(workspaceFolderPath),
      requestFileApproval: options.requestFileApproval,
      requestToolApproval: options.requestToolApproval,
      onToolLifecycle: options.onToolLifecycle,
      getPlanModeController: workspaceFolderPath => {
        const getWorkspaceRoot = () =>
          options.getEffectiveWorkspaceRoot(workspaceFolderPath);

        return {
          getState: () => state.getPlanModeState(),
          enter: () =>
            enterPlanModeWithHost({
              workspaceRoot: getWorkspaceRoot(),
              conversationKey: state.getConversationKey(),
              clearSwarm: state.clearSwarm,
              clearPendingPlanVerification:
                state.clearPendingPlanVerification,
              setPlanModeState: state.setPlanModeState,
              postState: state.postState,
            }),
          getPlanContent: () =>
            getPlanContentForWorkspace({
              workspaceRoot: getWorkspaceRoot(),
              planModeState: state.getPlanModeState(),
            }),
          exit: () =>
            exitPlanModeWithHost({
              workspaceRoot: getWorkspaceRoot(),
              planModeState: state.getPlanModeState(),
              sessionMessages: state.getSessionMessages(),
              setPlanModeState: state.setPlanModeState,
              setPendingPlanVerification:
                state.setPendingPlanVerification,
              postState: state.postState,
            }),
        };
      },
      getPlanVerificationState: () => state.getPendingPlanVerification(),
      getTasks: state.getTasks,
      getWorktree: state.getWorktree,
      stopBackgroundTask: async (taskId, workspaceFolderPath) =>
        (await options.backgroundTaskHost.stopTask(
          taskId,
          options.getEffectiveWorkspaceRoot(workspaceFolderPath),
        )) ?? null,
      stopSwarmWorker: state.stopSwarmWorker,
      runVerification: (workspaceFolderPath, request) =>
        runVerificationFromToolWithHost({
          workspaceFolderPath,
          extraGuidance: request.extraGuidance,
          diffRef: request.diffRef,
          resolveProviderConfig: () =>
            options.resolveProviderConfig(workspaceFolderPath),
          getEffortLevel: options.getEffortLevel,
          createProviderRuntimeOptions: options.createProviderRuntimeOptions,
          ensureConversationWorktreeHydrated:
            options.ensureConversationWorktreeHydrated,
          getEffectiveWorkspaceRoot: options.getEffectiveWorkspaceRoot,
          getWorkspaceRuntime: envMap =>
            options.getWorkspaceRuntime(workspaceFolderPath, envMap),
          getConversationHistory: state.getConversationHistory,
          sessionMessages: state.getSessionMessages(),
          getPendingPlanVerification:
            state.getPendingPlanVerification,
          backgroundTaskHost: options.backgroundTaskHost,
          findActiveBuiltInAgentTask:
            options.findActiveBuiltInAgentTask,
          createProviderAdapter: options.createProviderAdapter,
          markPendingPlanVerificationStarted:
            state.markPendingPlanVerificationStarted,
          markPendingPlanVerificationCompleted:
            state.markPendingPlanVerificationCompleted,
          resetPendingPlanVerificationToAwaitingStart:
            state.resetPendingPlanVerificationToAwaitingStart,
        }),
      runReview: (workspaceFolderPath, request) =>
        runReviewFromToolWithHost({
          workspaceFolderPath,
          extraGuidance: request.extraGuidance,
          diffRef: request.diffRef,
          resolveProviderConfig: () =>
            options.resolveProviderConfig(workspaceFolderPath),
          getEffortLevel: options.getEffortLevel,
          createProviderRuntimeOptions: options.createProviderRuntimeOptions,
          ensureConversationWorktreeHydrated:
            options.ensureConversationWorktreeHydrated,
          getEffectiveWorkspaceRoot: options.getEffectiveWorkspaceRoot,
          getWorkspaceRuntime: envMap =>
            options.getWorkspaceRuntime(workspaceFolderPath, envMap),
          getConversationHistory: state.getConversationHistory,
          sessionMessages: state.getSessionMessages(),
          getPendingPlanVerification:
            state.getPendingPlanVerification,
          backgroundTaskHost: options.backgroundTaskHost,
          findActiveBuiltInAgentTask:
            options.findActiveBuiltInAgentTask,
          createProviderAdapter: options.createProviderAdapter,
        }),
      runCommandInBackground: options.runCommandInBackground,
      findReusableBackgroundCommand:
        options.findReusableBackgroundCommand,
      extractWebContent: async (workspaceFolderPath, request) => {
        const { config, envMap } = await options.resolveProviderConfig(
          workspaceFolderPath,
        );
        const workspaceRoot = options.getEffectiveWorkspaceRoot(
          workspaceFolderPath,
        );
        const runtimeOptions = options.createProviderRuntimeOptions(config);
        return runProviderExtractionStep({
          config,
          workspaceRoot,
          envMap,
          runtimeOptions,
          userPrompt: request.content,
          abortSignal: request.abortSignal,
        });
      },
      skillStore: options.skillStore,
      mcpOAuthHost: options.mcpOAuthHost,
    });
}

export class WorkspaceRuntimeHost {
  private readonly runtimeByWorkspace = new Map<string, WorkspaceRuntime>();

  constructor(private readonly options: WorkspaceRuntimeHostOptions) {}

  async getRuntime(
    workspaceFolderPath: string,
    envMap: Record<string, string>,
  ): Promise<WorkspaceRuntime> {
    const existing = this.runtimeByWorkspace.get(workspaceFolderPath);
    if (existing) {
      existing.updateEnvMap(envMap);
      return existing;
    }

    const getWorkspaceRoot = () =>
      this.options.getWorkspaceRoot(workspaceFolderPath);
    const runtime = new WorkspaceRuntime(
      getWorkspaceRoot,
      envMap,
      request =>
        this.options.requestFileApproval(workspaceFolderPath, request),
      request => this.options.requestToolApproval(request),
      event => this.options.onToolLifecycle(event),
      this.options.getPlanModeController(workspaceFolderPath),
      () => this.options.getPlanVerificationState(),
      () => this.options.getTasks(workspaceFolderPath),
      () => this.options.getWorktree(workspaceFolderPath),
      async taskId => {
        const stoppedTask = await this.options.stopBackgroundTask(
          taskId,
          workspaceFolderPath,
        );
        if (stoppedTask) {
          return stoppedTask;
        }
        return this.options.stopSwarmWorker(taskId);
      },
      request =>
        this.options.runVerification(workspaceFolderPath, request),
      request => this.options.runReview(workspaceFolderPath, request),
      request =>
        this.options.runCommandInBackground(workspaceFolderPath, request),
      request =>
        this.options.findReusableBackgroundCommand(
          workspaceFolderPath,
          request,
        ),
      this.options.skillStore,
      undefined,
      this.options.mcpOAuthHost,
      request =>
        this.options.extractWebContent(workspaceFolderPath, request),
    );
    this.runtimeByWorkspace.set(workspaceFolderPath, runtime);
    return runtime;
  }

  getRuntimes(): Iterable<WorkspaceRuntime> {
    return this.runtimeByWorkspace.values();
  }

  async dispose(): Promise<void> {
    const runtimes = [...this.runtimeByWorkspace.values()];
    this.runtimeByWorkspace.clear();
    await Promise.allSettled(
      runtimes.map(runtime => runtime.dispose()),
    );
  }
}
