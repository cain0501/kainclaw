import { BrowserRuntime } from "./browserRuntime";
import {
  McpRuntime,
  type McpPromptCommandDefinition,
  type McpPromptCommandResult,
  type McpServerStatusSummary,
} from "./mcpRuntime";
import type { McpOAuthHost } from "./mcpOAuth";
import {
  dedupeToolDefinitionsByName,
  getBuiltInToolDefinitions,
  type ToolActionApprovalRequest,
  type ToolContext,
  type ToolDefinition,
  type ToolLifecycleEvent,
  type WriteApprovalRequest,
} from "./toolRuntime";
import { VsCodeLspRuntime } from "./lsp/lspRuntime";
import type { ConversationTaskRuntime } from "./tasks/types";
import type { ConversationWorktreeRuntime } from "./worktree/types";
import type { VerificationVerdict } from "./verification/prompt";
import type { SkillStore } from "./skills/skillStore";
import type { HookDefinition } from "./hooksRegistry";

type WorkspacePlanModeState = {
  active: boolean;
  planFilePath?: string;
};

export type WorkspacePlanModeController = {
  getState: () => WorkspacePlanModeState;
  enter: () => Promise<{ planFilePath: string; planContent: string }>;
  getPlanContent: () => Promise<string | null>;
  exit: () => Promise<{ planFilePath: string; planContent: string }>;
};

export type WorkspacePlanVerificationState = {
  planFilePath: string;
  verificationStarted: boolean;
  verificationCompleted: boolean;
};

export class WorkspaceRuntime {
  private readonly browserRuntime: BrowserRuntime;
  private readonly mcpRuntime: McpRuntime;
  private readonly lspRuntime: VsCodeLspRuntime | undefined;

  constructor(
    private readonly getWorkspaceRoot: () => string,
    envMap: Record<string, string>,
    private readonly requestFileApproval: (
      request: WriteApprovalRequest,
    ) => Promise<boolean>,
    private readonly requestToolApproval: (
      request: ToolActionApprovalRequest,
    ) => Promise<boolean>,
    private readonly onToolLifecycle: (event: ToolLifecycleEvent) => void,
    private readonly planMode: WorkspacePlanModeController,
    private readonly getPlanVerificationState: () => WorkspacePlanVerificationState | undefined,
    private readonly getTasks: () => ConversationTaskRuntime,
    private readonly getWorktree: () => ConversationWorktreeRuntime,
    private readonly stopBackgroundTask: (
      taskId: string,
    ) => Promise<{ taskId: string; taskType: string; command: string }>,
    private readonly runVerification: (request: {
      extraGuidance?: string;
      diffRef?: string;
    }) => Promise<{ taskId: string; verdict: VerificationVerdict; report: string }>,
    private readonly runReview: (request: {
      extraGuidance?: string;
      diffRef?: string;
    }) => Promise<{ taskId: string; report: string }>,
    private readonly spawnSubAgent: (request: {
      agentType: string;
      prompt: string;
      description?: string;
    }) => Promise<{ text: string }>,
    private readonly runCommandInBackground: (request: {
      command: string;
    }) => Promise<{
      taskId: string;
      command: string;
      workspaceRoot: string;
      alreadyRunning?: boolean;
    }>,
    private readonly findReusableBackgroundCommand: (request: {
      command: string;
    }) => Promise<{ taskId: string; command: string; workspaceRoot: string } | null>,
    private readonly skillStore?: SkillStore,
    private readonly getSessionInstalledSkillHooks?: () => HookDefinition[],
    private readonly registerSessionInstalledSkillHooks?: (
      hooks: HookDefinition[],
    ) => HookDefinition[],
    enableLsp = true,
    private readonly mcpOAuthHost?: McpOAuthHost,
    private readonly extractWebContent?: ToolContext["extractWebContent"],
    private readonly readConfig?: ToolContext["readConfig"],
    private readonly writeConfig?: ToolContext["writeConfig"],
  ) {
    this.browserRuntime = new BrowserRuntime(this.getWorkspaceRoot);
    this.mcpRuntime = new McpRuntime(
      this.getWorkspaceRoot,
      envMap,
      this.mcpOAuthHost,
    );
    this.lspRuntime = enableLsp ? new VsCodeLspRuntime(this.getWorkspaceRoot) : undefined;
  }

  updateEnvMap(envMap: Record<string, string>): void {
    this.mcpRuntime.setEnvMap(envMap);
  }

  markMcpConfigDirty(): void {
    this.mcpRuntime.markConfigDirty();
  }

  async getToolDefinitions(): Promise<ToolDefinition[]> {
    const mcpTools = await this.mcpRuntime.getToolDefinitions();
    const builtInTools = getBuiltInToolDefinitions({
      lspAvailable: this.lspRuntime?.isAvailable?.() ?? !!this.lspRuntime,
    });
    return dedupeToolDefinitionsByName([...builtInTools, ...mcpTools]);
  }

  async getMcpStatusSummary(): Promise<McpServerStatusSummary[]> {
    return this.mcpRuntime.getStatusSummary();
  }

  async getMcpPromptCommands(): Promise<McpPromptCommandDefinition[]> {
    return this.mcpRuntime.getPromptCommands();
  }

  async executeMcpPromptCommand(
    commandName: string,
    args: string,
  ): Promise<McpPromptCommandResult> {
    return this.mcpRuntime.executePromptCommand(commandName, args);
  }

  getToolContext(invokerKind: ToolContext["invokerKind"] = "main"): ToolContext {
    const planMode = this.planMode;
    const getWorkspaceRoot = this.getWorkspaceRoot;
    const planVerification = this.getPlanVerificationState;
    const dangerousCommandApprovals = new Map<
      string,
      { skipGenericApproval?: boolean }
    >();

    return {
      get workspaceRoot() {
        return getWorkspaceRoot();
      },
      invokerKind,
      readConfig: this.readConfig,
      writeConfig: this.writeConfig,
      extractWebContent: this.extractWebContent,
      requestFileApproval: this.requestFileApproval,
      requestToolApproval: this.requestToolApproval,
      allowDangerousCommandOnce: (command, options) => {
        dangerousCommandApprovals.set(command, options ?? {});
      },
      consumeDangerousCommandApproval: command => {
        const approval = dangerousCommandApprovals.get(command) ?? null;
        if (approval) {
          dangerousCommandApprovals.delete(command);
        }
        return approval;
      },
      onToolLifecycle: this.onToolLifecycle,
      browser: this.browserRuntime,
      mcp: this.mcpRuntime,
      lsp: this.lspRuntime,
      tasks: this.getTasks(),
      worktree: this.getWorktree(),
      scheduler: {
        enable: () => {
          // Host-level scheduler is already running; this preserves tool API compatibility.
        },
      },
      stopBackgroundTask: this.stopBackgroundTask,
      runVerification: this.runVerification,
      runReview: this.runReview,
      spawnSubAgent: this.spawnSubAgent,
      runCommandInBackground: this.runCommandInBackground,
      findReusableBackgroundCommand: this.findReusableBackgroundCommand,
      planMode: {
        get active() {
          return planMode.getState().active;
        },
        get planFilePath() {
          return planMode.getState().planFilePath;
        },
        enter: () => planMode.enter(),
        getPlanContent: () => planMode.getPlanContent(),
        exit: () => planMode.exit(),
      },
      planVerification: {
        get pending() {
          const state = planVerification();
          return !!state && !state.verificationCompleted;
        },
        get planFilePath() {
          return planVerification()?.planFilePath;
        },
        get verificationStarted() {
          return planVerification()?.verificationStarted ?? false;
        },
        get verificationCompleted() {
          return planVerification()?.verificationCompleted ?? false;
        },
      },
      skillStore: this.skillStore,
      getSessionInstalledSkillHooks: this.getSessionInstalledSkillHooks,
      registerSessionInstalledSkillHooks:
        this.registerSessionInstalledSkillHooks,
    };
  }

  async dispose(): Promise<void> {
    await Promise.allSettled([
      this.browserRuntime.dispose(),
      this.mcpRuntime.dispose(),
    ]);
  }
}
