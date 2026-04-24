import type {
  ToolActionApprovalRequest,
  ToolLifecycleEvent,
  WriteApprovalRequest,
} from "./toolRuntime";
import type { ConversationTaskRuntime } from "./tasks/types";
import type { ConversationWorktreeRuntime } from "./worktree/types";
import type { VerificationVerdict } from "./verification/prompt";
import {
  WorkspaceRuntime,
  type WorkspacePlanModeController,
  type WorkspacePlanVerificationState,
} from "./workspaceRuntimeShell";
import type { SkillStore } from "./skills/skillStore";

type StoppedBackgroundTask = {
  taskId: string;
  taskType: string;
  command: string;
};

type BackgroundCommandResult = {
  taskId: string;
  command: string;
  workspaceRoot: string;
  alreadyRunning?: boolean;
};

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
  skillStore?: SkillStore;
};

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
