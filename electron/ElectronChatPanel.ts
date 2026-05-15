import { randomUUID } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { BrowserRuntime } from "../src/browserRuntime";
import { ElectronHostAdapter } from "../src/platform/electronHostAdapter";
import {
  SessionRepository,
  type ChatMessage,
  type CompactBoundarySessionState,
  type DesignFlowState,
  type PersistedConversationMessage,
  type SessionRuntimeState,
} from "../src/storage/sessionRepository";
import { getWorkspaceHash } from "../src/sessionUi";
import { SettingsRepository, type ProviderMeta } from "../src/storage/settingsRepository";
import {
  buildProviderAdapter,
  resolveProviderConfig,
  runProviderExtractionStep,
} from "../src/providerHost";
import { verifyLicense } from "../src/license/licenseManager";
import {
  validateOnboardingProviderKey,
  completeOnboardingProvider,
  saveSettingsProvider,
  deleteSettingsProvider,
  loadSettingsPanelData,
} from "../src/settingsHost";
import {
  buildFreezeQuestionCopy,
  getElectronDialogStrings,
  getElectronShellStrings,
  getElectronSettingsStrings,
} from "../src/electronUiLanguage";
import { normalizeWebviewAttachments } from "../src/attachmentHandler";
import type {
  NormalizedMessage,
  ProviderConfig as AdapterProviderConfig,
} from "../src/agent/providers/IProviderAdapter";
import { McpRuntime, type McpServerStatusSummary } from "../src/mcpRuntime";
import { runAgent, SYSTEM_PROMPT } from "../src/agent/agentRunner";
import {
  dedupeToolDefinitionsByName,
  getBuiltInToolDefinitions,
  toolDefinitions as builtinToolDefinitions,
} from "../src/toolRuntime";
import type {
  AskUserQuestionAnnotations,
  AskUserQuestionRequest,
  AskUserQuestionResponse,
  ToolContext,
  ToolDefinition,
} from "../src/toolRuntime";
import type { HookDefinition } from "../src/hooksRegistry";
import {
  getInstalledSkillByEntrypoint,
  loadInstalledSkills,
} from "../src/installedSkillsRegistry";
import {
  clearFreezeBoundary,
  resolveFreezeBoundaryPath,
  validateFreezeBoundaryPath,
  writeFreezeBoundary,
} from "../src/installedSkillCompat";
import {
  clearAllSessionInstalledSkillHooks,
  clearSessionInstalledSkillHooks,
  getSessionInstalledSkillHooks,
  registerSessionInstalledSkillHooks,
} from "../src/sessionInstalledSkillHooks";
import { buildInjectedPrompt, triggerHooks } from "../src/hooks/hooksTrigger";
import type { AgentRunner, HookContext } from "../src/hooks/hooksExecutor";
import { handleElectronPromptCommand } from "../src/electronPromptCommandHost";
import { parsePromptSlashCommand } from "../src/promptCommandHost";
import { handleCompactCommandWithHost } from "../src/compactHost";
import { pollElectronBackgroundTaskNotifications } from "../src/electronBackgroundTaskNotificationHost";
import { shouldNotifyBackgroundTask } from "../src/backgroundTaskNotificationHost";
import {
  handleReviewCommandWithHost,
  handleUltrareviewCommandWithHost,
  handleUltraverifyCommandWithHost,
  handleVerificationCommandWithHost,
} from "../src/inspectionHost";
import {
  parseReviewDiffRef,
  parseVerificationDiffRef,
} from "../src/agent/built-in/agentUtils";
import { BackgroundTaskHost } from "../src/backgroundTaskHost";
import {
  buildImageLabResultBatches,
  removeImageLabResult,
  prependImageLabResults,
  type ImageLabResultBatch,
} from "../src/imageGeneration/imageLabGallery";
import { ImageLabGalleryStore } from "../src/imageGeneration/imageLabGalleryStore";
import {
  PromptLibraryRepository,
  type PromptLibraryPreview,
} from "../src/imageGeneration/promptLibraryRepository";
import {
  createImageVariant,
  runImageLabRequest,
  type ImageLabConfig,
  type ImageLabReferenceImage,
  type ImageLabResultItem,
} from "../src/imageGeneration/imageLabRuntime";
import {
  IMAGE_PROMPT_INFERENCE_SYSTEM_PROMPT,
  VISIBLE_IMAGE_PROMPT_PAIR_SYSTEM_PROMPT,
  inferVisiblePromptPairFromReferenceImages,
  inferPromptFromReferenceImages,
  providerSupportsImagePromptInference,
} from "../src/imageGeneration/imagePromptInference";
import {
  IMAGE_WORKFLOW_ORCHESTRATOR_SYSTEM_PROMPT,
  orchestrateImageWorkflow,
  providerSupportsImageWorkflowOrchestration,
  type ImageWorkflowPlan,
} from "../src/imageGeneration/imageWorkflowOrchestrator";
import {
  searchPublicReferenceImages,
} from "../src/imageGeneration/imageMaterialSearch";
import {
  determineChatPromptIntent,
  type ChatPromptIntent,
} from "../src/imageGeneration/chatPromptIntent";
import {
  INTENT_ROUTER_SYSTEM_PROMPT,
  routeIntentWithLLM,
} from "../src/imageGeneration/llmIntentRouter";
import { detectArtifact } from "../src/artifacts/artifactDetector";
import type { ArtifactObject } from "../src/artifacts/artifactObject";
import {
  buildDeriveArtifactPrompt,
  providerSupportsArtifactDerivation,
} from "../src/artifacts/deriveArtifact";
import {
  augmentArtifactPrompt,
  shouldDisableToolsForArtifactPrompt,
} from "../src/artifacts/artifactPromptAugmenter";
import { InMemoryArtifactRegistry } from "../src/artifacts/artifactRegistry";
import { resolveImageBatchPlan } from "../src/imageGeneration/imagePromptBatching";
import { resolveRequestedImageSize } from "../src/imageGeneration/imagePromptSizing";
import type { DesktopRuntimeServices } from "../src/platform/desktopRuntimeServices";
import {
  resolveWorkspaceRoot,
  type ActiveWorktreeSessionSummary,
  type ResolvedWorkspaceRoot,
} from "../src/platform/workspaceRootResolver";
import type { MidtaiOpenPayload } from "../src/midtaiRoute";
import { PersistentTaskRuntimeStore } from "../src/tasks/taskRuntime";
import { PersistentWorktreeRuntimeStore } from "../src/worktree/runtime";
import type { ConversationTaskRuntime } from "../src/tasks/types";
import type { ConversationWorktreeRuntime } from "../src/worktree/types";
import type { EffortLevel, ProviderRuntimeOptions } from "../src/thinkingEffort/types";
import {
  generateKainClawDesign,
  type DesignGenerateOptions,
} from "../src/design/designEngine";
import {
  buildDesignChatSystemPrompt,
  buildDesignChatUserPrompt,
  buildKainClawDesignSystemPrompt,
  DESIGN_CRITIQUE_SYSTEM_PROMPT,
  getDesignChatSkillBundleDirRelativePath,
  getDesignChatSkillEntryRelativePath,
  getDesignChatSkillRelativePath,
  normalizeDesignOutputType,
  type DesignOutputType,
} from "../src/design/designPrompt";
import type { DesignSlider } from "../src/design/slidersExtractor";
import {
  buildKainClawDesignPatchSystemPrompt,
  extractDirectTextReplacement,
  patchDesignImageNode,
  patchDesignTextNode,
  patchKainClawDesignNode,
} from "../src/design/patchEngine";
import {
  DesignProjectStore,
  type DesignProjectRecord,
} from "../src/design/designProjectStore";
import { captureDesignThumbnail } from "./designThumbnail";
import {
  DesignVersionStore,
  type DesignVersionRecord,
} from "../src/design/versionStore";
import {
  MidtaiLibraryHost,
  type MidtaiLibraryFilter,
} from "../src/midtaiLibraryHost";
import {
  buildDesignExportPath,
  exportDesignHtml,
  type DesignExportFormat,
} from "../src/design/exporters";
import {
  getDesignDirectionSuggestions,
  getDirectionByStylePrompt,
  isAmbiguousDesignPrompt,
} from "../src/design/showcaseIndex";

function extractJsonFromText(text: string): Record<string, unknown> | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

const DESIGN_PROJECT_BINDING_MISSING_CODE = "DESIGN_PROJECT_BINDING_MISSING";
const DESIGN_PROJECT_BINDING_MISSING_MESSAGE =
  "Current design project binding is missing. Re-open the target work from Recent Works before editing.";

class DesignProjectBindingMissingError extends Error {
  readonly code = DESIGN_PROJECT_BINDING_MISSING_CODE;

  readonly recoverable = true;

  constructor(message = DESIGN_PROJECT_BINDING_MISSING_MESSAGE) {
    super(message);
    this.name = "DesignProjectBindingMissingError";
  }
}

const SUPPORTED_ELECTRON_TOOL_NAMES = new Set([
  "AskUserQuestion",
  "list_files",
  "read_file",
  "search_files",
  "run_command",
  "write_file",
  "replace_in_file",
  "WebFetch",
  "WebSearch",
  "browser_navigate",
  "browser_snapshot",
  "browser_click",
  "browser_type",
  "browser_wait_for",
  "browser_screenshot",
  "browser_close",
  "glob_files",
]);

const DESIGN_CHAT_ALLOWED_TOOLS_DISCOVERY = new Set(["read_file", "glob_files"]);
const DESIGN_CHAT_ALLOWED_TOOLS_BUILD = new Set([
  "read_file",
  "glob_files",
  "list_files",
  "write_file",
  "replace_in_file",
]);

function getDesignChatTools(turn: "discovery" | "build"): ToolDefinition[] {
  const allowed =
    turn === "build"
      ? DESIGN_CHAT_ALLOWED_TOOLS_BUILD
      : DESIGN_CHAT_ALLOWED_TOOLS_DISCOVERY;
  return getBuiltInToolDefinitions({ askUserQuestionAvailable: false }).filter(tool =>
    allowed.has(tool.name),
  );
}

const ELECTRON_SHELL_PROMPT_NOTE = `

# Desktop Shell Note
- You are running inside a limited Electron validation shell, not the full VS Code host.
- Identify yourself as KainClaw. You are a multifunctional AI assistant.
- You can say that you help with programming, document editing, information search, debugging, image generation, and UI/page design tasks.
- If the user asks what model or provider is currently in use, rely on the runtime identity note already injected by the host. Do not invent extra certainty.
- Only use the tools that are actually exposed in this shell.
- WebFetch, WebSearch, and browser automation tools are available in this shell.
- When the user asks to open a page, inspect what is visibly on the page, or interact with a website, prefer browser_navigate plus browser_snapshot over WebFetch.
- Do not expect the legacy fetch_url tool in this shell. For web retrieval, use WebFetch or WebSearch.
- Plan mode, worktree switching, LSP, advanced memory management, and skill management are not available here.
- Explicit slash commands for /compact, /todo, /review, and /verify are wired into this shell. Treat them as user-invoked shell commands, not autonomous capabilities to invent on your own.
- When the user asks about the current workspace or local files, rely on the provided workspace root and tool results. Do not guess.
- If the user asks for one of those unavailable capabilities, say it is not yet wired in the desktop shell instead of pretending to use it.
`;

function buildElectronInstalledSkillAgentHookPrompt(
  hook: HookDefinition,
  context: HookContext,
): string {
  const payload = JSON.stringify({
    event: context.event,
    workspaceRoot: context.workspaceRoot,
    sessionId: context.sessionId,
    toolName: context.toolName,
    toolInput: context.toolInput,
    toolOutput: context.toolOutput,
    prompt: context.prompt,
    reply: context.reply,
  });

  const template = hook.agentPrompt ?? hook.prompt ?? "";
  if (!template.trim()) {
    return `Installed skill agent hook context:\n\n${payload}`;
  }

  const replaced = template.replaceAll("$ARGUMENTS", payload);
  return replaced === template
    ? `${template}\n\nARGUMENTS: ${payload}`
    : replaced;
}

function getSupportedElectronTools() {
  return getBuiltInToolDefinitions({ askUserQuestionAvailable: true }).filter(tool =>
    SUPPORTED_ELECTRON_TOOL_NAMES.has(tool.name),
  );
}

type ElectronPromptRuntime = {
  getMcpStatusSummary: () => Promise<McpServerStatusSummary[]>;
  getToolDefinitions: () => Promise<ToolDefinition[]>;
  getToolContext: (mode?: ToolContext["invokerKind"]) => ToolContext;
};

type InspectionConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

type ActiveRequestKind = "background" | "chat" | "image";
type ChatRequestLane = "default" | "design";
type PendingQuestionState = {
  request: AskUserQuestionRequest & { id: string };
  resolve: (response: AskUserQuestionResponse | null) => void;
};

type SendPromptOptions = {
  modelPrompt?: string;
  lane?: ChatRequestLane;
  designFlowId?: string;
};

type DesignLaneRequestContext = {
  flow: DesignFlowState;
  prompt: string;
  requestedFlowId?: string;
};

type DesignChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type DesignChatRunResult =
  | {
      kind: "question-form";
      content: string;
      history: DesignChatHistoryMessage[];
    }
  | {
      kind: "artifact";
      rawOutput: string;
      html: string;
      sliders: DesignSlider[];
      history: DesignChatHistoryMessage[];
    };

type DesignChatRunWorkspace = {
  tempRunRoot: string;
  skillSourceRoot: string;
  usedBundleDir: boolean;
};

type DesignChatRendererMessage = {
  messageId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  kind?: ChatMessage["kind"] | "text" | "artifact" | "question-form";
  artifactId?: string;
  designProjectId?: string;
};

/**
 * Electron equivalent of ChatSidebarProvider.
 *
 * Wires sessions, settings, MCP, and the full agent+tool pipeline directly to
 * the Electron IPC layer, with no VS Code module dependencies.
 */
export class ElectronChatPanel {
  private currentSessionId: string | undefined;
  private sessionMessages: ChatMessage[] = [];
  private modelConversationMessages: PersistedConversationMessage[] = [];
  private compactBoundary: CompactBoundarySessionState | undefined;
  private currentSessionWorkspaceRoot = "";
  private streamingText = "";
  private imageBusy = false;
  private imagePromptInferenceBusy = false;
  private imageWorkflowBusy = false;
  private imageWorkflowPlan: ImageWorkflowPlan | undefined;
  private imageMaterialSearchBusy = false;
  private activeImageAbortController: AbortController | undefined;
  private imageResults: ImageLabResultItem[] = [];
  private imageResultsHydrated = false;
  private readonly cleanupHandlers: Array<() => void> = [];
  private readonly inFlightRequests = new Map<
    string,
    {
      abortController: AbortController;
      streamingText: string;
      kind: ActiveRequestKind;
    }
  >();
  private readonly mcpRuntime: McpRuntime;
  private readonly imageGalleryStore: ImageLabGalleryStore;
  private readonly promptLibraryRepository: PromptLibraryRepository;
  private readonly designProjectStore: DesignProjectStore;
  private readonly designVersionStore: DesignVersionStore;
  private readonly midtaiLibraryHost: MidtaiLibraryHost;
  private readonly taskRuntimeStore: PersistentTaskRuntimeStore;
  private readonly worktreeRuntimeStore: PersistentWorktreeRuntimeStore;
  private readonly backgroundTaskHost: BackgroundTaskHost;
  private readonly browserRuntime: BrowserRuntime;
  private readonly cachedWorkspaceResolutions = new Map<string, ResolvedWorkspaceRoot>();
  private readonly sessionInstalledSkillHooks = new Map<string, HookDefinition[]>();
  private readonly artifactRegistries = new Map<string, InMemoryArtifactRegistry>();
  private currentDesignProjectId: string | undefined;
  private currentDesignFlowState: DesignFlowState | undefined;
  private pendingDiversionPrompt: string | undefined;
  private pendingQuestion: PendingQuestionState | undefined;
  private sessionMessageWriteQueue: Promise<void> = Promise.resolve();
  private backgroundTaskNotificationTimer: NodeJS.Timeout | undefined;
  private backgroundTaskNotificationPollInFlight: Promise<number> | undefined;

  constructor(
    private readonly sessions: SessionRepository,
    private readonly settings: SettingsRepository,
    private readonly host: ElectronHostAdapter,
    /** Sends a message to the renderer via IPC. */
    private readonly sendToRenderer: (payload: unknown) => void,
    private readonly desktopRuntimeServices?: DesktopRuntimeServices,
  ) {
    this.mcpRuntime = new McpRuntime(
      () => this.getSelectedWorkspaceRoot(),
      process.env as Record<string, string>,
      this.host,
    );
    this.imageGalleryStore = new ImageLabGalleryStore(this.host.getStorageUri());
    this.promptLibraryRepository = new PromptLibraryRepository(this.host.getStorageUri());
    this.designProjectStore = new DesignProjectStore(this.host.getStorageUri());
    this.designVersionStore = new DesignVersionStore(this.host.getStorageUri());
    this.midtaiLibraryHost = new MidtaiLibraryHost(
      async () => {
        await this.ensureImageResultsHydrated();
        return this.imageResults;
      },
      () => this.designProjectStore.listProjects(),
      async project => this.designProjectStore.getThumbnail(project.projectId),
    );
    this.taskRuntimeStore = new PersistentTaskRuntimeStore(this.host.getStorageUri());
    this.worktreeRuntimeStore = new PersistentWorktreeRuntimeStore(this.host.getStorageUri());
    this.backgroundTaskHost = new BackgroundTaskHost({
      storageRoot: this.host.getStorageUri(),
      getTaskRuntime: workspaceRoot => this.getConversationTaskRuntime(workspaceRoot),
    });
    this.browserRuntime = new BrowserRuntime(() => this.getSelectedWorkspaceRoot() || this.host.getStorageUri());

    const localBridgeRuntime = this.desktopRuntimeServices?.localBridgeRuntime;
    if (localBridgeRuntime) {
      this.cleanupHandlers.push(
        localBridgeRuntime.onStatusChanged(() => {
          void this.postState();
        }),
      );
    }

    this.backgroundTaskNotificationTimer = setInterval(() => {
      void this.pollBackgroundTaskNotifications();
    }, 1500);
    this.backgroundTaskNotificationTimer.unref?.();
  }

  dispose(): void {
    this.backgroundTaskHost.dispose();
    void this.browserRuntime.dispose();
    this.designProjectStore.dispose();
    if (this.backgroundTaskNotificationTimer) {
      clearInterval(this.backgroundTaskNotificationTimer);
      this.backgroundTaskNotificationTimer = undefined;
    }
    while (this.cleanupHandlers.length > 0) {
      const cleanup = this.cleanupHandlers.pop();
      cleanup?.();
    }
  }

  private async pollBackgroundTaskNotifications(): Promise<number> {
    if (this.backgroundTaskNotificationPollInFlight) {
      return this.backgroundTaskNotificationPollInFlight;
    }

    const operation = pollElectronBackgroundTaskNotifications({
      getTaskRuntimes: async () => {
        if (!this.currentSessionId) {
          return [];
        }

        const workspaceContext = await this.getResolvedWorkspaceContext();
        const roots = new Set<string>();
        if (this.currentSessionWorkspaceRoot.trim()) {
          roots.add(this.currentSessionWorkspaceRoot.trim());
        }
        if (workspaceContext.effectiveRoot.trim()) {
          roots.add(workspaceContext.effectiveRoot.trim());
        }

        return [...roots].map(workspaceRoot =>
          this.getConversationTaskRuntime(workspaceRoot),
        );
      },
      recordAssistantReply: (reply, includeInConversation) =>
        this.currentSessionId
          ? this.recordCommandAssistantReply(
              this.currentSessionId,
              reply,
              includeInConversation,
            )
          : Promise.resolve(),
    }).then(async delivered => {
      if (delivered > 0) {
        await this.postState();
      }
      return delivered;
    }).finally(() => {
      if (this.backgroundTaskNotificationPollInFlight === operation) {
        this.backgroundTaskNotificationPollInFlight = undefined;
      }
    });

    this.backgroundTaskNotificationPollInFlight = operation;
    return operation;
  }

  private clearWorkspaceResolutionCache(selectedRoot?: string): void {
    if (selectedRoot === undefined) {
      this.cachedWorkspaceResolutions.clear();
      return;
    }

    this.cachedWorkspaceResolutions.delete(selectedRoot);
  }

  private getSelectedWorkspaceRoot(): string {
    return this.currentSessionWorkspaceRoot;
  }

  private resolveDesignChatToolWorkspaceRoot(outputType: DesignOutputType): string {
    const selectedWorkspaceRoot = this.getSelectedWorkspaceRoot().trim();
    const candidatePaths = [
      getDesignChatSkillEntryRelativePath(outputType),
      getDesignChatSkillRelativePath(outputType),
    ];

    if (
      selectedWorkspaceRoot &&
      candidatePaths.some(skillRelativePath =>
        existsSync(path.join(selectedWorkspaceRoot, skillRelativePath)),
      )
    ) {
      return selectedWorkspaceRoot;
    }

    const appWorkspaceRoot = process.cwd();
    if (
      candidatePaths.some(skillRelativePath =>
        existsSync(path.join(appWorkspaceRoot, skillRelativePath)),
      )
    ) {
      return appWorkspaceRoot;
    }

    return selectedWorkspaceRoot || appWorkspaceRoot;
  }

  private async loadSessionRuntimeState(sessionId: string): Promise<SessionRuntimeState> {
    return this.sessions.loadRuntimeState(sessionId);
  }

  private async setSessionWorkspaceRoot(
    sessionId: string,
    workspaceRoot: string,
  ): Promise<void> {
    const runtimeState = await this.loadSessionRuntimeState(sessionId);
    if ((runtimeState.workspaceRoot ?? "") === workspaceRoot) {
      this.currentSessionWorkspaceRoot = workspaceRoot;
      return;
    }

    await this.sessions.saveRuntimeState(sessionId, {
      ...runtimeState,
      workspaceRoot,
    });
    this.currentSessionWorkspaceRoot = workspaceRoot;
  }

  private async loadSessionWorkspaceRoot(
    sessionId: string,
    fallbackWorkspaceRoot?: string,
  ): Promise<void> {
    const runtimeState = await this.loadSessionRuntimeState(sessionId);
    const storedWorkspaceRoot =
      typeof runtimeState.workspaceRoot === "string" ? runtimeState.workspaceRoot : undefined;

    if (storedWorkspaceRoot !== undefined) {
      this.currentSessionWorkspaceRoot = storedWorkspaceRoot;
      return;
    }

    const nextWorkspaceRoot = fallbackWorkspaceRoot ?? "";
    this.currentSessionWorkspaceRoot = nextWorkspaceRoot;

    if (fallbackWorkspaceRoot !== undefined) {
      await this.sessions.saveRuntimeState(sessionId, {
        ...runtimeState,
        workspaceRoot: nextWorkspaceRoot,
      });
    }
  }

  private toPersistedConversationMessages(
    messages: ChatMessage[],
  ): PersistedConversationMessage[] {
    return this.buildConversationHistory(messages)
      .filter(
        (
          message,
        ): message is Extract<
          NormalizedMessage,
          { role: "user" | "assistant" }
        > => message.role === "user" || message.role === "assistant",
      )
      .map(message => ({
        role: message.role,
        content: message.content,
        ...(message.role === "assistant" && message.reasoningContent
          ? { reasoningContent: message.reasoningContent }
          : {}),
        ...(message.role === "user" &&
        message.attachments &&
        message.attachments.length > 0
          ? { attachments: message.attachments }
          : {}),
      }));
  }

  private restoreModelConversationFromRuntime(
    runtimeState: SessionRuntimeState,
  ): void {
    this.compactBoundary = runtimeState.compactBoundary;
    this.modelConversationMessages =
      runtimeState.modelConversation && runtimeState.modelConversation.length > 0
        ? runtimeState.modelConversation.map(message => ({
            role: message.role,
            content: message.content,
            ...(message.attachments && message.attachments.length > 0
              ? { attachments: message.attachments }
              : {}),
          }))
        : this.toPersistedConversationMessages(this.sessionMessages);
  }

  private restoreDesignFlowStateFromRuntime(
    runtimeState: SessionRuntimeState,
  ): void {
    this.currentDesignFlowState = runtimeState.designFlowState;
  }

  private buildDesignChatHistoryProjection(
    messages: ChatMessage[],
  ): DesignChatHistoryMessage[] {
    return this.buildConversationHistory(messages)
      .filter(
        (
          message,
        ): message is Extract<NormalizedMessage, { role: "user" | "assistant" }> =>
          message.role === "user" || message.role === "assistant",
      )
      .map(message => ({
        role: message.role,
        content: message.content,
      }));
  }

  private async resolveDesignFlowHistoryProjection(
    flowState: DesignFlowState | undefined,
    sessionId: string,
  ): Promise<DesignChatHistoryMessage[]> {
    const projectId = typeof flowState?.projectId === "string"
      ? flowState.projectId.trim()
      : "";
    if (projectId) {
      const projectHistory = await this.designProjectStore.loadConversationHistory(projectId);
      if (projectHistory.length > 0) {
        return projectHistory;
      }
    }

    const transcript = await this.sessions.loadMessages(sessionId);
    return this.buildDesignChatHistoryProjection(transcript);
  }

  private async restoreCurrentSessionRuntimeState(
    sessionId: string,
  ): Promise<void> {
    const runtimeState = await this.loadSessionRuntimeState(sessionId);
    this.restoreArtifactRegistryFromSessionMessages(sessionId, runtimeState);
    this.restoreModelConversationFromRuntime(runtimeState);
    this.restoreDesignFlowStateFromRuntime(runtimeState);
    if (this.currentDesignFlowState) {
      this.currentDesignFlowState = {
        ...this.currentDesignFlowState,
        conversationHistory: await this.resolveDesignFlowHistoryProjection(
          this.currentDesignFlowState,
          sessionId,
        ),
      };
    }
  }

  private async saveCurrentSessionRuntimeState(sessionId: string): Promise<void> {
    const runtimeState = await this.loadSessionRuntimeState(sessionId);
    const nextRuntimeState: SessionRuntimeState = {
      ...runtimeState,
      workspaceRoot: this.currentSessionWorkspaceRoot,
    };

    if (this.modelConversationMessages.length > 0) {
      nextRuntimeState.modelConversation = this.modelConversationMessages;
    } else {
      delete nextRuntimeState.modelConversation;
    }

    if (this.compactBoundary) {
      nextRuntimeState.compactBoundary = this.compactBoundary;
    } else {
      delete nextRuntimeState.compactBoundary;
    }

    if (this.currentDesignFlowState) {
      const { conversationHistory: _conversationHistory, ...persistedFlowState } = this.currentDesignFlowState;
      nextRuntimeState.designFlowState = persistedFlowState;
    } else {
      delete nextRuntimeState.designFlowState;
    }

    const artifactRegistry = this.artifactRegistries.get(sessionId);
    if (artifactRegistry && artifactRegistry.artifacts.length > 0) {
      nextRuntimeState.artifactPanel = {
        activeArtifactId: artifactRegistry.activeArtifactId,
        collapsed: runtimeState.artifactPanel?.collapsed ?? false,
      };
    } else {
      delete nextRuntimeState.artifactPanel;
    }

    await this.sessions.saveRuntimeState(sessionId, nextRuntimeState);
  }

  private async setArtifactPanelCollapsedState(
    sessionId: string,
    collapsed: boolean,
  ): Promise<void> {
    const runtimeState = await this.loadSessionRuntimeState(sessionId);
    await this.sessions.saveRuntimeState(sessionId, {
      ...runtimeState,
      artifactPanel: {
        activeArtifactId:
          this.artifactRegistries.get(sessionId)?.activeArtifactId ??
          runtimeState.artifactPanel?.activeArtifactId ??
          null,
        collapsed,
      },
    });
  }

  private buildModelConversationHistory(): NormalizedMessage[] {
    return this.modelConversationMessages.map(message => {
      if (message.role === "user") {
        return {
          role: "user" as const,
          content: message.content,
          ...(message.attachments && message.attachments.length > 0
            ? { attachments: message.attachments }
            : {}),
        };
      }

      return {
        role: "assistant" as const,
        content: message.content,
        ...(message.reasoningContent ? { reasoningContent: message.reasoningContent } : {}),
      };
    });
  }

  private async getResolvedWorkspaceContext(
    forceRefresh = false,
  ): Promise<ResolvedWorkspaceRoot> {
    const selectedRoot = this.getSelectedWorkspaceRoot();
    if (!forceRefresh) {
      const cachedResolution = this.cachedWorkspaceResolutions.get(selectedRoot);
      if (cachedResolution) {
        return cachedResolution;
      }
    }

    const resolution = await resolveWorkspaceRoot(selectedRoot);
    const enrichedResolution = {
      ...resolution,
      ...this.buildActiveWorktreeWorkspaceOverlay(selectedRoot),
    };
    this.cachedWorkspaceResolutions.set(selectedRoot, enrichedResolution);
    return enrichedResolution;
  }

  private buildActiveWorktreeWorkspaceOverlay(
    selectedRoot: string,
  ): Partial<ResolvedWorkspaceRoot> {
    if (!selectedRoot.trim()) {
      return {};
    }

    const session = this.getConversationWorktreeRuntime(selectedRoot).getSession();
    if (!session) {
      return {};
    }

    const activeWorktree: ActiveWorktreeSessionSummary = {
      worktreePath: session.worktreePath,
      worktreeName: session.worktreeName,
      ...(session.worktreeBranch ? { worktreeBranch: session.worktreeBranch } : {}),
      originalWorkspaceRoot: session.originalWorkspaceRoot,
    };

    return {
      effectiveRoot: session.worktreePath,
      gitRoot: session.gitRoot,
      kind: "active_worktree_session",
      detail:
        `Active worktree session: ${session.worktreeName}` +
        (session.worktreeBranch ? ` (${session.worktreeBranch})` : ""),
      activeWorktree,
    };
  }

  private buildWorkspaceSystemNote(workspace: ResolvedWorkspaceRoot): string {
    if (!workspace.selectedRoot) {
      return "\n\n# Workspace\nNo workspace is currently set. Tell the user they can select a folder via the workspace button in the chat footer.\n";
    }

    const details: string[] = [`Current workspace root: ${workspace.selectedRoot}`];
    if (
      workspace.kind === "missing" ||
      workspace.kind === "non_git_workspace" ||
      workspace.kind === "ambiguous_nested_git_roots"
    ) {
      details.push(`Git inspection status: ${workspace.detail}`);
    }

    return `\n\n# Workspace\n${details.join("\n")}\n`;
  }

  private buildInspectionWorkspaceWarning(
    commandName: "/review" | "/ultrareview" | "/verify" | "/ultraverify",
    workspace: ResolvedWorkspaceRoot,
  ): string | undefined {
    switch (workspace.kind) {
      case "unset":
        return `当前还没有选择工作区。${commandName} 将以降级模式运行，可能拿不到真实 git diff。请先选择目标仓库文件夹。`;
      case "missing":
        return `当前工作区路径不可访问。${commandName} 将以降级模式运行，可能拿不到真实 git diff。请重新选择目标仓库文件夹。`;
      case "non_git_workspace":
        return `当前工作区不是 Git 仓库。${commandName} 将以降级模式运行，可能拿不到真实 git diff。请直接选择目标仓库文件夹。`;
      case "ambiguous_nested_git_roots": {
        const candidates = workspace.candidates?.length
          ? `\n候选目录：\n${workspace.candidates.map(candidate => `- ${candidate}`).join("\n")}`
          : "";
        return `当前工作区不是 Git 仓库，而且找到了多个同层候选仓库。${commandName} 将以降级模式运行，可能拿不到真实 git diff。请直接选择目标仓库文件夹。${candidates}`;
      }
      default:
        return undefined;
    }
  }

  private async warnOnDegradedInspectionWorkspace(
    sessionId: string,
    commandName: "/review" | "/ultrareview" | "/verify" | "/ultraverify",
    commandText: string,
  ): Promise<void> {
    const diffRef =
      commandName === "/review" ||
      commandName === "/ultrareview"
        ? parseReviewDiffRef(commandText)
        : parseVerificationDiffRef(commandText);
    if (diffRef && /^https?:\/\//i.test(diffRef.trim())) {
      return;
    }
    const warning = this.buildInspectionWorkspaceWarning(
      commandName,
      await this.getResolvedWorkspaceContext(),
    );
    if (!warning) {
      return;
    }
    await this.recordCommandAssistantReply(sessionId, warning, false);
  }

  private async postMidtaiDesignLibrary(): Promise<void> {
    const items = await this.midtaiLibraryHost.getLibraryItems("design");
    this.sendToRenderer({
      type: "midtai:design-library-update",
      items,
    });
  }

  // ─── IPC entry point ────────────────────────────────────────────────────────

  async handleMessage(message: Record<string, unknown>): Promise<void> {
    const type = typeof message.type === "string" ? message.type : "";

    // Sessions
    if (type === "sessions:load") { await this.loadSessions(); return; }
    if (type === "sessions:close") { this.sendToRenderer({ type: "hideSessions" }); return; }
    if (type === "sessions:new") { await this.createNewSession(); return; }
    if (type === "sessions:new-design") { await this.createNewDesignSession(); return; }
    if (type === "design:new-transient-work") {
      await this.handleNewTransientWork();
      return;
    }
    if (type === "sessions:switch") {
      await this.switchSession(String(message.id ?? ""));
      if (await this.isCurrentSessionDesignType()) {
        await this.openMidtai({
          contentType: "design",
          view: "preview",
          designChat: true,
          sessionType: "design",
        });
        await this.handleDesignChatLoadHistory();
      }
      return;
    }
    if (type === "sessions:rename") { await this.renameSession(String(message.id ?? ""), String(message.title ?? "")); return; }
    if (type === "sessions:delete") { await this.deleteSession(String(message.id ?? "")); return; }
    if (type === "sessions:export") { await this.exportSession(String(message.id ?? "")); return; }

    // Settings
    if (type === "settings:load") { await this.loadSettings(); return; }
    if (type === "settings:close") { await this.postState(); return; }
    if (type === "settings:setActive") { await this.setActiveProvider(String(message.id ?? "")); return; }
    if (type === "settings:setLanguage") { await this.setLanguage(String(message.language ?? "")); return; }
    if (type === "settings:saveProvider") { await this.saveProvider(message.meta, String(message.apiKey ?? "")); return; }
    if (type === "settings:deleteProvider") { await this.deleteProvider(String(message.id ?? "")); return; }
    if (type === "license:activate") { await this.activateLicense(String(message.key ?? "")); return; }
    if (type === "settings:reset") { await this.resetAllConfig(); return; }
    if (type === "image:loadState") { await this.postImageState(); return; }
    if (type === "image:saveThumbnail") {
      const id = typeof message.id === "string" ? message.id.trim() : "";
      const dataUrl = typeof message.dataUrl === "string" ? message.dataUrl.trim() : "";
      if (id && dataUrl.startsWith("data:image/")) {
        void this.imageGalleryStore.saveThumbnail(id, dataUrl).catch(() => {});
      }
      return;
    }
    if (type === "image:saveConfig") {
      await this.saveImageConfig(message);
      return;
    }
    if (type === "image:setActiveConfig") {
      await this.setActiveImageConfig(String(message.id ?? ""));
      return;
    }
    if (type === "image:deleteConfig") {
      await this.deleteImageConfig(String(message.id ?? ""));
      return;
    }
    if (type === "image:deleteHistoryPrompt") {
      await this.deleteImageHistoryPrompt(String(message.prompt ?? ""));
      return;
    }
    if (type === "image:clearHistory") {
      await this.clearImageHistory();
      return;
    }
    if (type === "image:clearResults") {
      await this.clearImageResults();
      return;
    }
    if (type === "image:deleteResult") {
      await this.deleteImageResult(String(message.id ?? ""));
      return;
    }
    if (type === "promptLibrary:savePrompt") {
      await this.savePromptLibraryEntry(message);
      return;
    }
    if (type === "promptLibrary:deletePrompt") {
      await this.deletePromptLibraryEntry(String(message.id ?? ""));
      return;
    }
    if (type === "promptLibrary:toggleFavorite") {
      await this.togglePromptLibraryFavorite(String(message.id ?? ""));
      return;
    }
    if (type === "promptLibrary:inferFromImage") {
      await this.inferPromptLibraryPrompt(message);
      return;
    }
    if (type === "image:run") {
      await this.runImageJob(message);
      return;
    }
    if (type === "image:inferPrompt") {
      await this.inferImagePrompt(message);
      return;
    }
    if (type === "image:orchestrateWorkflow") {
      await this.orchestrateImageWorkflow(message);
      return;
    }
    if (type === "image:prepareMaterialSearch") {
      await this.prepareImageMaterialSearch(message);
      return;
    }
    if (type === "image:searchMaterials") {
      await this.searchImageMaterials(message);
      return;
    }
    if (type === "image:abort") {
      this.activeImageAbortController?.abort();
      return;
    }
    if (type === "image:variant") {
      await this.runImageVariant(String(message.id ?? ""));
      return;
    }

    // Workspace
    if (type === "workspace:set") {
      const root = typeof message.root === "string" ? message.root.trim() : "";
      await this.ensureSession();
      if (!this.currentSessionId) {
        return;
      }
      const previousRoot = this.getSelectedWorkspaceRoot();
      await this.setSessionWorkspaceRoot(this.currentSessionId, root);
      this.clearWorkspaceResolutionCache(root);
      if (root) {
        await this.getResolvedWorkspaceContext(true);
      }
      if (previousRoot !== root) {
        this.mcpRuntime.markConfigDirty();
      }
      await this.postState();
      return;
    }

    // Onboarding
    if (type === "onboarding:validateKey") {
      await this.validateKey(
        String(message.provider ?? ""),
        String(message.apiKey ?? ""),
        message.baseUrl ? String(message.baseUrl) : undefined,
        message.model ? String(message.model) : undefined,
      );
      return;
    }
    if (type === "onboarding:complete") {
      await this.completeOnboarding(message.providerMeta, String(message.apiKey ?? ""));
      return;
    }

    // Chat
    if (type === "ready") { await this.handleReady(); return; }
    if (type === "clearChat") { await this.clearChat(); return; }
    if (type === "sendPrompt") {
      if (await this.isCurrentSessionDesignType()) {
        await this.handleDesignChatLane(message);
        return;
      }
      await this.routePrompt(
        String(message.prompt ?? ""),
        message.attachments as WebviewAttachment[] | undefined,
        typeof message.intentOverride === "string" ? message.intentOverride : undefined,
      );
      return;
    }
    if (type === "design:chat:send") {
      await this.handleDesignChatSend(message);
      return;
    }
    if (type === "design:diversion-choice") {
      await this.handleDiversionChoice(message);
      return;
    }
    if (type === "design:chat:load-history") {
      await this.handleDesignChatLoadHistory();
      return;
    }
    if (type === "design:session:reset") {
      await this.handleDesignSessionReset();
      return;
    }
    if (type === "chat:imageRun") {
      await this.runChatImageJob(message);
      return;
    }
    if (type === "artifact:dismiss") {
      if (this.currentSessionId) {
        this.getArtifactRegistry(this.currentSessionId).dismiss();
        await this.saveCurrentSessionRuntimeState(this.currentSessionId);
      }
      await this.postState();
      return;
    }
    if (type === "artifact:collapse") {
      if (this.currentSessionId) {
        await this.setArtifactPanelCollapsedState(this.currentSessionId, true);
      }
      await this.postState();
      return;
    }
    if (type === "artifact:setActive") {
      const id = typeof message.id === "string" ? message.id.trim() : "";
      if (id && this.currentSessionId) {
        const registry = this.getArtifactRegistry(this.currentSessionId);
        if (registry.setActive(id)) {
          await this.setArtifactPanelCollapsedState(this.currentSessionId, false);
          await this.saveCurrentSessionRuntimeState(this.currentSessionId);
        }
      }
      await this.postState();
      return;
    }
    if (type === "artifact:openKainClawDesign") {
      await this.openActiveArtifactInKainClawDesign();
      return;
    }
    if (type === "artifact:enter-design") {
      await this.handleEnterDesignFromArtifact(message);
      return;
    }
    if (type === "midtai:open") {
      await this.openMidtai(message.payload as MidtaiOpenPayload | undefined);
      return;
    }
    if (type === "design:listProjects") {
      await this.listDesignProjects();
      return;
    }
    if (type === "midtai:listLibrary") {
      await this.postMidtaiLibrary(
        typeof message.filter === "string"
          ? message.filter as MidtaiLibraryFilter
          : undefined,
      );
      return;
    }
    if (type === "midtai:request-design-library") {
      await this.postMidtaiDesignLibrary();
      return;
    }
    if (type === "design:getThumbnail") {
      const projectId = typeof message.versionId === "string" ? message.versionId.trim() : "";
      if (!projectId) {
        return;
      }
      try {
        // Try saved thumbnail first (fast path)
        const saved = await this.designProjectStore.getThumbnail(projectId);
        if (saved) {
          this.sendToRenderer({ type: "design:thumbnail", versionId: projectId, dataUrl: saved });
          return;
        }
        // Old project without saved thumbnail: render from active version HTML
        const project = await this.designProjectStore.getProject(projectId);
        if (!project?.activeVersionId) return;
        const version = await this.designVersionStore.getVersion(project.activeVersionId);
        if (version?.html) {
          const dataUrl = await captureDesignThumbnail(version.html);
          void this.designProjectStore.saveThumbnail(projectId, dataUrl).catch(() => {});
          this.sendToRenderer({ type: "design:thumbnail", versionId: projectId, dataUrl });
        }
      } catch {
        // Keep the renderer shimmer placeholder when thumbnail generation fails.
      }
      return;
    }
    if (type === "design:createProject") {
      await this.createDesignProject(message);
      return;
    }
    if (type === "design:switch-project") {
      await this.handleSwitchDesignProject(String(message.projectId ?? ""));
      return;
    }
    if (type === "design:deleteProject") {
      await this.deleteDesignProject(message);
      return;
    }
    if (type === "design:renameProject") {
      await this.renameDesignProject(message);
      return;
    }
    if (type === "design:getLastProject") {
      await this.getLastDesignProject();
      return;
    }
    if (type === "design:get-active-version") {
      await this.getActiveDesignVersionForArtifact(message);
      return;
    }
    if (type === "design:generate") {
      await this.generateDesignWorkbench(message);
      return;
    }
    if (type === "design:requestCritique") {
      const html = String(message.html ?? "");
      const prompt = String(message.prompt ?? "");
      const outputType = String(message.outputType ?? "prototype");
      if (html) void this.runDesignCritique(html, prompt, outputType);
      return;
    }
    if (type === "design:editCurrent") {
      await this.editCurrentDesignWorkbench(message);
      return;
    }
    if (type === "design:requestDirections") {
      await this.requestDesignDirections(message);
      return;
    }
    if (type === "design:patch") {
      await this.patchDesignWorkbench(message);
      return;
    }
    if (type === "design:patchImageNode") {
      await this.patchDesignImageNode(message);
      return;
    }
    if (type === "design:loadVersions") {
      await this.loadDesignVersions(message);
      return;
    }
    if (type === "design:restoreVersion") {
      await this.restoreDesignVersion(message);
      return;
    }
    if (type === "design:export") {
      await this.exportDesignWorkbench(message);
      return;
    }
    if (type === "abort") {
      const activeRequest = this.currentSessionId
        ? this.inFlightRequests.get(this.currentSessionId)
        : undefined;
      activeRequest?.abortController.abort();
      return;
    }
    if (type === "approvePendingAction") { this.host.resolveApproval(true); return; }
    if (type === "rejectPendingAction") { this.host.resolveApproval(false); return; }
    if (type === "submitPendingQuestion") {
      this.resolvePendingQuestion(
        message.answers && typeof message.answers === "object"
          ? {
              questions: this.pendingQuestion?.request.questions ?? [],
              answers: message.answers as Record<string, string>,
              ...(message.annotations && typeof message.annotations === "object"
                ? { annotations: message.annotations as AskUserQuestionAnnotations }
                : {}),
            }
          : null,
      );
      return;
    }
    if (type === "cancelPendingQuestion") { this.resolvePendingQuestion(null); return; }
    if (type === "requestEditorSelection") { this.sendToRenderer({ type: "editorSelection", selectedText: "", language: "" }); return; }
    if (type === "mcp:refresh") { await this.refreshMcpStatus(); return; }
  }

  // ─── Ready ──────────────────────────────────────────────────────────────────

  private async handleReady(): Promise<void> {
    if (!this.settings.isOnboardingDone()) {
      this.sendToRenderer({ type: "showOnboarding" });
      return;
    }
    await this.ensureSession();
    await this.getResolvedWorkspaceContext(true);
    await this.postState();
  }

  // ─── Sessions ───────────────────────────────────────────────────────────────

  private async ensureSession(): Promise<void> {
    let id = this.settings.getActiveSessionId();
    if (id) {
      const activeMeta = await this.sessions.getSessionMeta(id);
      if (!activeMeta) {
        id = undefined;
      }
    }

    if (!id) {
      const index = await this.sessions.readIndex();
      const existingSession = index.sessions[0];
      if (existingSession) {
        id = existingSession.id;
      } else {
        const session = await this.sessions.createSession(
          randomUUID(),
          "electron",
          this.getDefaultSessionTitle(),
        );
        id = session.id;
        await this.sessions.saveRuntimeState(session.id, {
          sessionType: "default",
        });
      }
      await this.settings.setActiveSessionId(id);
    }

    if (this.currentSessionId !== id) {
      const shouldUseLegacyWorkspaceRoot = this.currentSessionId === undefined;
      const legacyWorkspaceRoot = this.settings.getWorkspaceRoot() ?? "";
      const previousRoot = this.currentSessionWorkspaceRoot;
      this.currentSessionId = id;
      this.sessionMessages = [];
      this.streamingText = "";
      this.currentSessionWorkspaceRoot = "";
      this.sessionMessages = await this.sessions.loadMessages(id);
      await this.loadSessionWorkspaceRoot(
        id,
        shouldUseLegacyWorkspaceRoot ? legacyWorkspaceRoot : undefined,
      );
      await this.restoreCurrentSessionRuntimeState(id);
      if (previousRoot !== this.currentSessionWorkspaceRoot) {
        this.mcpRuntime.markConfigDirty();
      }
    } else if (!this.currentSessionWorkspaceRoot && id) {
      await this.loadSessionWorkspaceRoot(id);
      await this.restoreCurrentSessionRuntimeState(id);
    }
  }

  private async loadSessions(): Promise<void> {
    const index = await this.sessions.readIndex();
    const sessions = (
      await Promise.all(index.sessions.map(async session => {
        const runtimeState = await this.loadSessionRuntimeState(session.id);
        const sessionType = runtimeState.sessionType === "design" ? "design" : "default";
        if (sessionType === "design") {
          return null;
        }
        return {
          ...session,
          sessionType,
        };
      }))
    ).filter((session): session is typeof index.sessions[number] & { sessionType: "default" } => !!session);
    this.sendToRenderer({
      type: "sessions:data",
      sessions,
      activeId: this.currentSessionId ?? null,
    });
  }

  private async getCurrentSessionType(): Promise<"design" | "default"> {
    if (!this.currentSessionId) {
      return "default";
    }
    const runtimeState = await this.loadSessionRuntimeState(this.currentSessionId);
    return runtimeState.sessionType === "design" ? "design" : "default";
  }

  private async isCurrentSessionDesignType(): Promise<boolean> {
    return (await this.getCurrentSessionType()) === "design";
  }

  private async switchSession(id: string): Promise<void> {
    if (!id) return;
    const previousRoot = this.currentSessionWorkspaceRoot;
    this.currentSessionId = id;
    this.sessionMessages = [];
    this.streamingText = "";
    this.currentSessionWorkspaceRoot = "";
    await this.settings.setActiveSessionId(id);
    this.sessionMessages = await this.sessions.loadMessages(id);
    await this.loadSessionWorkspaceRoot(id);
    await this.restoreCurrentSessionRuntimeState(id);
    if (previousRoot !== this.currentSessionWorkspaceRoot) {
      this.mcpRuntime.markConfigDirty();
    }
    await this.postState();
    await this.loadSessions();
  }

  private async createNewSession(): Promise<void> {
    const workspaceRoot = this.getSelectedWorkspaceRoot();
    const session = await this.sessions.createSession(
      randomUUID(),
      getWorkspaceHash(workspaceRoot),
      this.getDefaultSessionTitle(),
    );
    await this.sessions.saveRuntimeState(session.id, {
      workspaceRoot,
      sessionType: "default",
    });
    await this.switchSession(session.id);
  }

  private async createNewDesignSessionSilent(): Promise<void> {
    const workspaceRoot = this.getSelectedWorkspaceRoot();
    const session = await this.sessions.createSession(
      randomUUID(),
      getWorkspaceHash(workspaceRoot),
      this.settings.getLanguage() === "en-US" ? "Design chat" : "设计对话",
    );
    await this.sessions.saveRuntimeState(session.id, {
      workspaceRoot,
      sessionType: "design",
    });
    await this.switchSession(session.id);
  }

  private async createNewDesignSession(): Promise<void> {
    await this.createNewDesignSessionSilent();
    await this.openMidtai({
      contentType: "design",
      view: "preview",
      designChat: true,
      sessionType: "design",
    });
    await this.handleDesignChatLoadHistory();
  }

  private isViewingSession(sessionId: string): boolean {
    return this.currentSessionId === sessionId;
  }

  private getVisibleStreamingText(): string {
    const activeRequest = this.currentSessionId
      ? this.inFlightRequests.get(this.currentSessionId)
      : undefined;
    if (!activeRequest) {
      return "";
    }

    return activeRequest.streamingText;
  }

  private getConversationTaskRuntimesForCurrentSession(
    workspaceInfo: ResolvedWorkspaceRoot,
  ): ConversationTaskRuntime[] {
    if (!this.currentSessionId) {
      return [];
    }

    const roots = new Set<string>();
    if (this.currentSessionWorkspaceRoot.trim()) {
      roots.add(this.currentSessionWorkspaceRoot.trim());
    }
    if (workspaceInfo.effectiveRoot.trim()) {
      roots.add(workspaceInfo.effectiveRoot.trim());
    }

    return [...roots].map(workspaceRoot =>
      this.getConversationTaskRuntime(workspaceRoot),
    );
  }

  private async getCurrentSessionBackgroundBusy(
    workspaceInfo: ResolvedWorkspaceRoot,
  ): Promise<boolean> {
    for (const runtime of this.getConversationTaskRuntimesForCurrentSession(workspaceInfo)) {
      const tasks = await runtime.listBackgroundTasks();
      if (
        tasks.some(task =>
          task.taskType !== "built_in_agent" &&
          (
            task.status === "running" ||
            task.status === "pending" ||
            shouldNotifyBackgroundTask(task)
          ),
        )
      ) {
        return true;
      }
    }

    return false;
  }

  private async appendAssistantMessageToSession(
    sessionId: string,
    message: ChatMessage,
    options: {
      updatePreview?: boolean;
    } = {},
  ): Promise<void> {
    const updatePreview = options.updatePreview ?? true;

    if (this.isViewingSession(sessionId)) {
      this.sessionMessages = [...this.sessionMessages, message];
      await this.postState();
    }

    const runWrite = async () => {
      await this.sessions.appendMessages(sessionId, [message]);
      await this.sessions.updateMeta(sessionId, {
        preview: updatePreview
          ? message.content.slice(0, 100)
          : (await this.sessions.getSessionMeta(sessionId))?.preview ?? "",
        updatedAt: Date.now(),
      });
      await this.loadSessions();
    };

    this.sessionMessageWriteQueue = this.sessionMessageWriteQueue
      .catch(() => undefined)
      .then(runWrite);
    await this.sessionMessageWriteQueue;
  }

  private async appendUserMessageToSession(
    sessionId: string,
    content: string,
  ): Promise<ChatMessage> {
    const message: ChatMessage = {
      role: "user",
      content,
      timestamp: Date.now(),
    };
    await this.appendAssistantMessageToSession(sessionId, message);
    return message;
  }

  private buildSessionMessageId(
    sessionId: string,
    message: ChatMessage,
    index: number,
  ): string {
    return `${sessionId}:${message.timestamp ?? 0}:${index}:${message.role}`;
  }

  private normalizeDesignChatMessageKind(message: ChatMessage): DesignChatRendererMessage["kind"] {
    if (message.kind === "error") {
      return "error";
    }
    if (/<question-form\b/i.test(message.content || "")) {
      return "question-form";
    }
    if (message.role === "assistant") {
      try {
        this.extractArtifactHtmlFromDesignChatOutput(String(message.content || ""));
        return "artifact";
      } catch {
        // fall through
      }
    }
    return "text";
  }

  private toDesignChatRendererMessage(
    sessionId: string,
    message: ChatMessage,
    index: number,
  ): DesignChatRendererMessage {
    const kind = this.normalizeDesignChatMessageKind(message);
    const artifact =
      kind === "artifact"
        ? this.detectArtifactFromSessionMessage(sessionId, message, index)
        : null;
    return {
      messageId: this.buildSessionMessageId(sessionId, message, index),
      role: message.role,
      content: message.content,
      timestamp: message.timestamp ?? Date.now(),
      kind,
      ...(artifact?.id ? { artifactId: artifact.id } : {}),
      ...(typeof message.designProjectId === "string" && message.designProjectId.trim()
        ? { designProjectId: message.designProjectId.trim() }
        : {}),
    };
  }

  private async deleteSession(id: string): Promise<void> {
    if (!id) return;
    const wasActiveSession =
      this.currentSessionId === id || this.settings.getActiveSessionId() === id;

    await this.sessions.deleteSession(id);
    this.artifactRegistries.delete(id);
    clearSessionInstalledSkillHooks(this.sessionInstalledSkillHooks, id);
    if (this.currentSessionId === id) {
      this.pendingQuestion = undefined;
      this.currentDesignFlowState = undefined;
    }

    if (wasActiveSession) {
      this.currentSessionId = undefined;
      this.sessionMessages = [];
      this.modelConversationMessages = [];
      this.compactBoundary = undefined;
      await this.ensureSession();
    }

    await this.postState();
    await this.loadSessions();
  }

  private async renameSession(id: string, title: string): Promise<void> {
    const trimmedTitle = title.trim();
    if (!id || !trimmedTitle) {
      return;
    }

    await this.sessions.updateMeta(id, { title: trimmedTitle });
    await this.loadSessions();
  }

  private async exportSession(id: string): Promise<void> {
    if (!id) return;
    const meta = await this.sessions.getSessionMeta(id);
    if (!meta) return;
    const markdown = await this.sessions.exportMarkdown(id, meta.title);
    const exportPath = path.join(
      this.host.getStorageUri(),
      "exports",
      `${meta.title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "-")}-${Date.now()}.md`,
    );
    await fs.mkdir(path.dirname(exportPath), { recursive: true });
    await fs.writeFile(exportPath, markdown, "utf8");
    this.sendToRenderer({ type: "sessions:exported", path: exportPath });
  }

  // ─── Settings ───────────────────────────────────────────────────────────────

  private async loadSettings(): Promise<void> {
    const data = await loadSettingsPanelData(this.settings);
    this.sendToRenderer({
      type: "settings:data",
      ...data,
      dialogStrings: getElectronDialogStrings(data.language),
      shellStrings: getElectronShellStrings(data.language),
      settingsStrings: getElectronSettingsStrings(data.language),
    });
  }

  private async validateKey(provider: string, apiKey: string, baseUrl?: string, model?: string): Promise<void> {
    const result = await validateOnboardingProviderKey({ providerType: provider, apiKey, baseUrl, model });
    if (result.ok) {
      this.sendToRenderer({ type: "onboarding:keyValid" });
    } else {
      this.sendToRenderer({ type: "onboarding:keyInvalid", error: result.error });
    }
  }

  private async completeOnboarding(meta: unknown, apiKey: string): Promise<void> {
    await completeOnboardingProvider({ settings: this.settings, meta: meta as ProviderMeta, apiKey });
    await this.ensureSession();
    this.sendToRenderer({ type: "onboarding:done" });
    await this.postState();
  }

  private async saveProvider(meta: unknown, apiKey: string): Promise<void> {
    await saveSettingsProvider({ settings: this.settings, meta: meta as ProviderMeta, apiKey: apiKey || undefined });
    await this.loadSettings();
    await this.postState();
  }

  private async deleteProvider(id: string): Promise<void> {
    await deleteSettingsProvider({ settings: this.settings, id });
    await this.loadSettings();
    await this.postState();
  }

  private async setActiveProvider(id: string): Promise<void> {
    await this.settings.setActiveProviderId(id);
    await this.loadSettings();
    await this.postState();
  }

  private async setLanguage(language: string): Promise<void> {
    await this.settings.setLanguage(language);
    await this.loadSettings();
    await this.postState();
  }

  private async activateLicense(rawKey: string): Promise<void> {
    const result = verifyLicense(rawKey);
    if (!result.valid) {
      this.sendToRenderer({
        type: "license:result",
        success: false,
        error: result.reason,
      });
      return;
    }

    await this.settings.setLicenseActivated(true);
    await this.host.storeSecret("cain.licenseKey", rawKey);
    this.sendToRenderer({
      type: "license:result",
      success: true,
      flags: result.flags,
      expiresAt: result.expiresAt?.toISOString() ?? null,
    });
    await this.loadSettings();
    await this.postState();
  }

  private async saveImageConfig(message: Record<string, unknown>): Promise<void> {
    const id = typeof message.id === "string" && message.id.trim()
      ? message.id.trim()
      : randomUUID();
    await this.settings.saveImageConfig({
      id,
      ...(message.baseUrl ? { baseUrl: String(message.baseUrl) } : {}),
      ...(message.model ? { model: String(message.model) } : {}),
      ...(message.authMode ? { authMode: message.authMode as "bearer" | "raw" } : {}),
      ...(message.responseFormat ? {
        responseFormat: message.responseFormat as "url" | "b64_json",
      } : {}),
    });

    const apiKey = typeof message.apiKey === "string" ? message.apiKey.trim() : "";
    if (apiKey) {
      await this.settings.storeImageModelApiKey(id, apiKey);
    }

    await this.postImageState();
    await this.loadSettings();
  }

  private async setActiveImageConfig(id: string): Promise<void> {
    const trimmed = id.trim();
    if (!trimmed) {
      return;
    }

    await this.settings.setActiveImageModelId(trimmed);
    await this.postImageState();
    await this.loadSettings();
  }

  private async deleteImageConfig(id: string): Promise<void> {
    const trimmed = id.trim();
    if (!trimmed) {
      return;
    }

    await this.settings.deleteImageModel(trimmed);
    await this.postImageState();
    await this.loadSettings();
  }

  private async deleteImageHistoryPrompt(prompt: string): Promise<void> {
    const trimmed = prompt.trim();
    if (!trimmed) {
      return;
    }

    const nextHistory = this.settings
      .getImagePromptHistory()
      .filter(entry => entry.prompt !== trimmed);
    await this.settings.saveImagePromptHistory(nextHistory);
    await this.postImageState();
  }

  private async clearImageHistory(): Promise<void> {
    await this.settings.saveImagePromptHistory([]);
    await this.postImageState();
  }

  private async clearImageResults(): Promise<void> {
    this.imageResults = [];
    this.imageResultsHydrated = true;
    await this.imageGalleryStore.clear();
    await this.postImageState();
  }

  private async deleteImageResult(id: string): Promise<void> {
    const trimmedId = id.trim();
    if (!trimmedId) {
      return;
    }

    await this.ensureImageResultsHydrated();
    this.imageResults = removeImageLabResult(this.imageResults, trimmedId);
    await this.imageGalleryStore.saveResults(this.imageResults);
    await this.postImageState();
  }

  private async ensureImageResultsHydrated(): Promise<void> {
    if (this.imageResultsHydrated) {
      return;
    }

    this.imageResults = await this.imageGalleryStore.loadResults();
    this.imageResultsHydrated = true;
  }

  private async savePromptLibraryEntry(message: Record<string, unknown>): Promise<void> {
    const preview = this.resolvePromptLibraryPreview(message.preview);
    await this.promptLibraryRepository.savePrompt({
      ...(typeof message.id === "string" && message.id.trim() ? { id: message.id.trim() } : {}),
      category: String(message.category ?? "").trim(),
      title: String(message.title ?? "").trim(),
      text: String(message.text ?? "").trim(),
      tags: Array.isArray(message.tags)
        ? message.tags.filter((tag): tag is string => typeof tag === "string")
        : String(message.tags ?? "")
          .split(/[,\n]/)
          .map(tag => tag.trim())
          .filter(Boolean),
      ...(preview ? { preview } : {}),
    });
    await this.postImageState();
  }

  private async deletePromptLibraryEntry(id: string): Promise<void> {
    const trimmed = id.trim();
    if (!trimmed) {
      return;
    }

    await this.promptLibraryRepository.deletePrompt(trimmed);
    await this.postImageState();
  }

  private async togglePromptLibraryFavorite(id: string): Promise<void> {
    const trimmed = id.trim();
    if (!trimmed) {
      return;
    }

    await this.promptLibraryRepository.toggleFavorite(trimmed);
    await this.postImageState();
  }

  private resolvePromptLibraryPreview(raw: unknown): PromptLibraryPreview | undefined {
    if (!raw || typeof raw !== "object") {
      return undefined;
    }

    const preview = raw as Record<string, unknown>;
    if (preview.kind === "image" && typeof preview.src === "string" && preview.src.trim()) {
      return {
        kind: "image",
        src: preview.src.trim(),
      };
    }

    if (preview.kind === "gradient" && typeof preview.value === "string" && preview.value.trim()) {
      return {
        kind: "gradient",
        value: preview.value.trim(),
      };
    }

    return undefined;
  }

  private getImageResultBatches(): ImageLabResultBatch[] {
    return buildImageLabResultBatches(this.imageResults);
  }

  private getActiveImageModelState(): {
    config: ReturnType<SettingsRepository["getImageConfig"]>;
    imageModels: ReturnType<SettingsRepository["getImageModels"]>;
    activeImageModelId: string | undefined;
    activeImageModel: ReturnType<SettingsRepository["getActiveImageModelMeta"]>;
  } {
    const imageModels = this.settings.getImageModels();
    const activeImageModelId = this.settings.getActiveImageModelId();
    const activeImageModel = activeImageModelId
      ? imageModels.find(imageModel => imageModel.id === activeImageModelId)
      : undefined;

    return {
      config: this.settings.getImageConfig(),
      imageModels,
      activeImageModelId,
      activeImageModel,
    };
  }

  private resolveImageBatchExecution(message: Record<string, unknown>): {
    batchCount: number;
    executionPrompt: string;
  } {
    const plan = resolveImageBatchPlan({
      prompt: String(message.prompt ?? ""),
      defaultBatchCount: this.settings.getImageConfig()?.batchCount ?? 1,
      overrideBatchCount: typeof message.batchCount === "number"
        ? Math.max(1, Math.min(8, message.batchCount))
        : undefined,
    });

    return {
      batchCount: plan.batchCount,
      executionPrompt: plan.executionPrompt,
    };
  }

  private async buildImageConfig(overrides: Record<string, unknown>): Promise<ImageLabConfig> {
    const {
      config: saved,
      activeImageModelId,
      activeImageModel,
    } = this.getActiveImageModelState();
    const apiKey = await this.settings.getImageApiKey();

    if (!activeImageModelId || !activeImageModel) {
      throw new Error(
        "No active image model is configured. Open Settings and choose one first.",
      );
    }
    if (!apiKey) {
      throw new Error(
        "The active image model does not have an API key yet. Open Settings and save one first.",
      );
    }
    if (!activeImageModel.baseUrl?.trim() || !activeImageModel.model?.trim()) {
      throw new Error(
        "The active image model is incomplete. Open Settings and finish the base URL and model fields.",
      );
    }

    const size = typeof overrides.size === "string" && overrides.size.trim()
      ? overrides.size.trim()
      : resolveRequestedImageSize(String(overrides.prompt ?? ""))?.size
        ?? saved?.size
        ?? "1024x1024";
    const batchCount = typeof overrides.batchCount === "number"
      ? Math.max(1, Math.min(8, overrides.batchCount))
      : saved?.batchCount ?? 1;
    const responseFormat =
      overrides.responseFormat === "url" || overrides.responseFormat === "b64_json"
        ? overrides.responseFormat
        : saved?.responseFormat;

    return {
      apiKey,
      baseUrl: activeImageModel.baseUrl.trim(),
      model: activeImageModel.model.trim(),
      authMode: activeImageModel.authMode ?? "bearer",
      size,
      batchCount,
      ...(responseFormat ? { responseFormat } : {}),
    };
  }

  private async runImageJob(message: Record<string, unknown>): Promise<void> {
    const prompt = String(message.prompt ?? "").trim();
    if (!prompt) {
      this.sendToRenderer({ type: "image:error", error: "Prompt is required." });
      return;
    }

    if (this.imageBusy) {
      return;
    }

    const abortController = new AbortController();
    this.activeImageAbortController = abortController;
    this.imageBusy = true;
    await this.postImageState();

    try {
      await this.ensureImageResultsHydrated();
      const shouldRecordPromptHistory = message.recordPromptHistory !== false;
      const batchExecution = this.resolveImageBatchExecution(message);
      const config = await this.buildImageConfig({
        ...message,
        batchCount: batchExecution.batchCount,
      });
      const referenceImages = Array.isArray(message.referenceImages)
        ? message.referenceImages.filter(
          (referenceImage): referenceImage is ImageLabReferenceImage =>
            !!referenceImage &&
            typeof referenceImage === "object" &&
            typeof referenceImage.dataUrl === "string" &&
            typeof referenceImage.mimeType === "string" &&
            typeof referenceImage.name === "string",
        )
        : [];
      if (shouldRecordPromptHistory) {
        await this.settings.pushImagePromptHistory(prompt);
      }
      const rawResults = await runImageLabRequest({
        prompt,
        executionPrompt: batchExecution.executionPrompt,
        config,
        ...(referenceImages.length > 0 ? { referenceImages } : {}),
        signal: abortController.signal,
      });
      const results = await this.hydrateImageResultSources(
        rawResults,
        abortController.signal,
      );
      this.imageResults = prependImageLabResults(this.imageResults, results);
      await this.imageGalleryStore.saveResults(this.imageResults);
      const activeImageModelId = this.settings.getActiveImageModelId();
      await this.settings.saveImageConfig({
        ...(activeImageModelId ? { id: activeImageModelId } : {}),
        size: config.size,
        batchCount: config.batchCount,
        responseFormat: config.responseFormat,
      });

      this.sendToRenderer({
        type: "image:result",
        resultBatches: this.getImageResultBatches(),
        latestBatchId: results[0]?.batchId ?? null,
        latestBatchCount: results.length,
        latestBatchSource: results[0]?.source ?? "generate",
      });
    } catch (error) {
      if (abortController.signal.aborted) {
        this.sendToRenderer({
          type: "image:aborted",
          message: "已停止当前图片生成。",
        });
        return;
      }

      this.sendToRenderer({
        type: "image:error",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (this.activeImageAbortController === abortController) {
        this.activeImageAbortController = undefined;
      }
      this.imageBusy = false;
      await this.postImageState();
      await this.loadSettings();
    }
  }

  private async runImageVariant(id: string): Promise<void> {
    await this.ensureImageResultsHydrated();
    const source = this.imageResults.find(result => result.id === id);
    if (!source || this.imageBusy) {
      return;
    }

    const abortController = new AbortController();
    this.activeImageAbortController = abortController;
    this.imageBusy = true;
    await this.postImageState();

    try {
      const config = await this.buildImageConfig({});
      const rawResults = await createImageVariant({
        prompt: `${source.prompt}\n\nGenerate a close visual variant that keeps the core subject but changes details, lighting, and composition enough to feel new.`,
        config,
        seedImageUrl: source.src,
        signal: abortController.signal,
      });
      const results = await this.hydrateImageResultSources(
        rawResults,
        abortController.signal,
      );
      this.imageResults = prependImageLabResults(this.imageResults, results);
      await this.imageGalleryStore.saveResults(this.imageResults);
      this.sendToRenderer({
        type: "image:result",
        resultBatches: this.getImageResultBatches(),
        latestBatchId: results[0]?.batchId ?? null,
        latestBatchCount: results.length,
        latestBatchSource: "variant",
      });
    } catch (error) {
      if (abortController.signal.aborted) {
        this.sendToRenderer({
          type: "image:aborted",
          message: "已停止当前图片生成。",
        });
        return;
      }

      this.sendToRenderer({
        type: "image:error",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      if (this.activeImageAbortController === abortController) {
        this.activeImageAbortController = undefined;
      }
      this.imageBusy = false;
      await this.postImageState();
    }
  }

  private async inferImagePrompt(message: Record<string, unknown>): Promise<void> {
    const referenceImages = Array.isArray(message.referenceImages)
      ? message.referenceImages.filter(
        (referenceImage): referenceImage is ImageLabReferenceImage =>
          !!referenceImage &&
          typeof referenceImage === "object" &&
          typeof referenceImage.dataUrl === "string" &&
          typeof referenceImage.mimeType === "string" &&
          typeof referenceImage.name === "string",
      )
      : [];
    if (!referenceImages.length) {
      this.sendToRenderer({
        type: "image:error",
        error: "请先提供至少一张参考图，再执行提示词反推。",
      });
      return;
    }
    if (this.imagePromptInferenceBusy) {
      return;
    }

    this.imagePromptInferenceBusy = true;
    await this.postImageState();

    try {
      const workspaceRoot = this.getSelectedWorkspaceRoot();
      const { config, envMap } = await resolveProviderConfig(
        this.settings,
        workspaceRoot,
      );
      if (!providerSupportsImagePromptInference(config)) {
        throw new Error(
          "当前聊天模型不支持图片理解。请先切换到支持视觉输入的聊天模型。",
        );
      }

      const adapter = buildProviderAdapter(
        config,
        workspaceRoot,
        IMAGE_PROMPT_INFERENCE_SYSTEM_PROMPT + ELECTRON_SHELL_PROMPT_NOTE,
        envMap,
      );
      const prompt = await inferPromptFromReferenceImages({
        provider: adapter,
        referenceImages,
      });

      this.sendToRenderer({
        type: "image:promptInferred",
        prompt,
      });
    } catch (error) {
      this.sendToRenderer({
        type: "image:error",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.imagePromptInferenceBusy = false;
      await this.postImageState();
    }
  }

  private async inferPromptLibraryPrompt(message: Record<string, unknown>): Promise<void> {
    const referenceImages = Array.isArray(message.referenceImages)
      ? message.referenceImages.filter(
        (referenceImage): referenceImage is ImageLabReferenceImage =>
          !!referenceImage &&
          typeof referenceImage === "object" &&
          typeof referenceImage.dataUrl === "string" &&
          typeof referenceImage.mimeType === "string" &&
          typeof referenceImage.name === "string",
      )
      : [];
    if (!referenceImages.length) {
      this.sendToRenderer({
        type: "image:error",
        error: "请先上传一张图片，再执行提示词反推。",
      });
      return;
    }
    if (this.imagePromptInferenceBusy) {
      return;
    }

    this.imagePromptInferenceBusy = true;
    await this.postImageState();

    try {
      const workspaceRoot = this.getSelectedWorkspaceRoot();
      const { config, envMap } = await resolveProviderConfig(
        this.settings,
        workspaceRoot,
      );
      if (!providerSupportsImagePromptInference(config)) {
        throw new Error(
          "当前聊天模型不支持图片理解。请先切换到支持视觉输入的聊天模型。",
        );
      }

      const adapter = buildProviderAdapter(
        config,
        workspaceRoot,
        VISIBLE_IMAGE_PROMPT_PAIR_SYSTEM_PROMPT + ELECTRON_SHELL_PROMPT_NOTE,
        envMap,
      );
      const promptPair = await inferVisiblePromptPairFromReferenceImages({
        provider: adapter,
        referenceImages,
      });

      this.sendToRenderer({
        type: "promptLibrary:inferredPrompt",
        promptPair,
      });
    } catch (error) {
      this.sendToRenderer({
        type: "image:error",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.imagePromptInferenceBusy = false;
      await this.postImageState();
    }
  }

  private async orchestrateImageWorkflow(message: Record<string, unknown>): Promise<void> {
    const prompt = String(message.prompt ?? "").trim();
    const referenceImages = Array.isArray(message.referenceImages)
      ? message.referenceImages.filter(
        (referenceImage): referenceImage is ImageLabReferenceImage =>
          !!referenceImage &&
          typeof referenceImage === "object" &&
          typeof referenceImage.dataUrl === "string" &&
          typeof referenceImage.mimeType === "string" &&
          typeof referenceImage.name === "string",
      )
      : [];
    if (!prompt && referenceImages.length === 0) {
      this.sendToRenderer({
        type: "image:error",
        error: "请输入图像需求，或至少提供一张参考图，再执行工作流编排。",
      });
      return;
    }
    if (this.imageWorkflowBusy) {
      return;
    }

    this.imageWorkflowBusy = true;
    await this.postImageState();

    try {
      const workspaceRoot = this.getSelectedWorkspaceRoot();
      const { config, envMap } = await resolveProviderConfig(
        this.settings,
        workspaceRoot,
      );
      if (!providerSupportsImageWorkflowOrchestration(config, referenceImages.length > 0)) {
        throw new Error(
          "当前聊天模型不支持带参考图的工作流编排。请先切换到支持视觉输入的聊天模型。",
        );
      }

      const adapter = buildProviderAdapter(
        config,
        workspaceRoot,
        IMAGE_WORKFLOW_ORCHESTRATOR_SYSTEM_PROMPT + ELECTRON_SHELL_PROMPT_NOTE,
        envMap,
      );
      const workflowPlan = await orchestrateImageWorkflow({
        provider: adapter,
        prompt,
        referenceImages,
      });

      this.imageWorkflowPlan = workflowPlan;
      this.sendToRenderer({
        type: "image:workflowOrchestrated",
        workflowPlan,
      });
    } catch (error) {
      this.sendToRenderer({
        type: "image:error",
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.imageWorkflowBusy = false;
      await this.postImageState();
    }
  }

  private extractMaterialSearchContext(message: Record<string, unknown>): {
    prompt: string;
    referenceImages: ImageLabReferenceImage[];
    queries: string[];
    requestId: string | undefined;
  } {
    return {
      prompt: String(message.prompt ?? "").trim(),
      referenceImages: Array.isArray(message.referenceImages)
        ? message.referenceImages.filter(
          (referenceImage): referenceImage is ImageLabReferenceImage =>
            !!referenceImage &&
            typeof referenceImage === "object" &&
            typeof referenceImage.dataUrl === "string" &&
            typeof referenceImage.mimeType === "string" &&
            typeof referenceImage.name === "string",
        )
        : [],
      queries: Array.isArray(message.queries)
        ? message.queries
          .filter((query): query is string => typeof query === "string")
          .map(query => query.trim())
          .filter(Boolean)
        : [],
      requestId: typeof message.requestId === "string" && message.requestId.trim()
        ? message.requestId.trim()
        : undefined,
    };
  }

  private async buildMaterialSearchWorkflowPlan(options: {
    prompt: string;
    referenceImages: ImageLabReferenceImage[];
  }): Promise<ImageWorkflowPlan> {
    const workspaceRoot = this.getSelectedWorkspaceRoot();
    const { config, envMap } = await resolveProviderConfig(
      this.settings,
      workspaceRoot,
    );
    if (!providerSupportsImageWorkflowOrchestration(config, options.referenceImages.length > 0)) {
      throw new Error(
        "当前聊天模型不支持带参考图的资料查找编排。请先切换到支持视觉输入的聊天模型。",
      );
    }

    const adapter = buildProviderAdapter(
      config,
      workspaceRoot,
      IMAGE_WORKFLOW_ORCHESTRATOR_SYSTEM_PROMPT + ELECTRON_SHELL_PROMPT_NOTE,
      envMap,
    );
    return orchestrateImageWorkflow({
      provider: adapter,
      prompt: options.prompt,
      referenceImages: options.referenceImages,
    });
  }

  private async prepareImageMaterialSearch(message: Record<string, unknown>): Promise<void> {
    const {
      prompt,
      referenceImages,
      requestId,
    } = this.extractMaterialSearchContext(message);
    if (!prompt && referenceImages.length === 0) {
      this.sendToRenderer({
        type: "image:error",
        error: "请输入想补充的素材方向，或至少提供一张目标图，再查找资料。",
        ...(requestId ? { requestId } : {}),
      });
      return;
    }

    try {
      const workflowPlan = await this.buildMaterialSearchWorkflowPlan({
        prompt,
        referenceImages,
      });
      const searchQueries = workflowPlan.materialKeywords.length > 0
        ? workflowPlan.materialKeywords
        : [prompt];
      this.sendToRenderer({
        type: "image:materialSearchPrepared",
        workflowPlan,
        searchQueries,
        ...(requestId ? { requestId } : {}),
      });
    } catch (error) {
      this.sendToRenderer({
        type: "image:error",
        error: error instanceof Error ? error.message : String(error),
        ...(requestId ? { requestId } : {}),
      });
    }
  }

  private async searchImageMaterials(message: Record<string, unknown>): Promise<void> {
    const {
      prompt,
      referenceImages,
      queries,
      requestId,
    } = this.extractMaterialSearchContext(message);
    if (!prompt && referenceImages.length === 0) {
      this.sendToRenderer({
        type: "image:error",
        error: "请输入想补充的素材方向，或至少提供一张目标图，再查找资料。",
        ...(requestId ? { requestId } : {}),
      });
      return;
    }
    if (this.imageMaterialSearchBusy) {
      return;
    }

    this.imageMaterialSearchBusy = true;
    await this.postImageState();

    try {
      const workflowPlan = queries.length > 0
        ? undefined
        : await this.buildMaterialSearchWorkflowPlan({
          prompt,
          referenceImages,
        });
      const searchQueries = queries.length > 0
        ? queries
        : workflowPlan?.materialKeywords.length
          ? workflowPlan.materialKeywords
          : [prompt];
      const results = await searchPublicReferenceImages({
        queries: searchQueries,
        maxResultsPerQuery: 3,
      });

      this.sendToRenderer({
        type: "image:materialSearchResults",
        ...(workflowPlan ? { workflowPlan } : {}),
        searchQueries,
        results,
        ...(requestId ? { requestId } : {}),
      });
    } catch (error) {
      this.sendToRenderer({
        type: "image:error",
        error: error instanceof Error ? error.message : String(error),
        ...(requestId ? { requestId } : {}),
      });
    } finally {
      this.imageMaterialSearchBusy = false;
      await this.postImageState();
    }
  }

  private async postImageState(): Promise<void> {
    await this.ensureImageResultsHydrated();
    const {
      config,
      imageModels,
      activeImageModelId,
      activeImageModel,
    } = this.getActiveImageModelState();
    const imageModelsWithKeyStatus = await Promise.all(
      imageModels.map(async imageModel => ({
        ...imageModel,
        hasKey: !!(await this.settings.getImageModelApiKey(imageModel.id)),
      })),
    );
    const hasApiKey = !!(await this.settings.getImageApiKey());
    const isConfigured = Boolean(
      activeImageModel?.baseUrl?.trim() &&
      activeImageModel.model?.trim() &&
      hasApiKey,
    );
    this.sendToRenderer({
      type: "image:state",
      busy: this.imageBusy,
      promptInferenceBusy: this.imagePromptInferenceBusy,
      workflowBusy: this.imageWorkflowBusy,
      materialSearchBusy: this.imageMaterialSearchBusy,
      imageModels: imageModelsWithKeyStatus,
      activeImageModelId,
      config: {
        id: config?.id ?? activeImageModelId ?? "",
        model: activeImageModel?.model ?? config?.model ?? "gpt-image-2",
        size: config?.size ?? "1024x1024",
        batchCount: config?.batchCount ?? 1,
        responseFormat: config?.responseFormat ?? "url",
        hasApiKey,
        isConfigured,
      },
      promptHistory: this.settings.getImagePromptHistory(),
      resultBatches: this.getImageResultBatches(),
      workflowPlan: this.imageWorkflowPlan,
      promptLibrary: await this.promptLibraryRepository.loadState(),
    });
    await this.postMidtaiLibrary();
  }

  private async postMidtaiLibrary(filter?: MidtaiLibraryFilter): Promise<void> {
    const items = await this.midtaiLibraryHost.getLibraryItems(filter);
    this.sendToRenderer({
      type: "midtai:library-update",
      items,
      filter: filter ?? "all",
    });
  }

  private async resetAllConfig(): Promise<void> {
    const providers = this.settings.getProviders();
    for (const provider of providers) {
      await this.settings.deleteApiKey(provider.id);
    }
    await this.settings.saveProviders([]);
    await this.settings.setActiveProviderId("");
    await this.settings.setOnboardingDone(false);
    await this.settings.setLicenseActivated(false);
    await this.settings.setActiveSessionId("");
    await this.settings.setWorkspaceRoot("");
    this.clearWorkspaceResolutionCache();
    this.mcpRuntime.markConfigDirty();
    await this.settings.clearImageSettings();
    await this.settings.saveImagePromptHistory([]);
    await this.imageGalleryStore.clear();
    await this.host.deleteSecret("cain.licenseKey");
    clearAllSessionInstalledSkillHooks(this.sessionInstalledSkillHooks);
    this.artifactRegistries.clear();
    this.pendingQuestion = undefined;
    this.sessionMessages = [];
    this.modelConversationMessages = [];
    this.compactBoundary = undefined;
    this.currentDesignFlowState = undefined;
    this.currentSessionId = undefined;
    this.currentSessionWorkspaceRoot = "";
    this.imageResults = [];
    this.imageResultsHydrated = true;
    this.sendToRenderer({ type: "settings:resetDone" });
    await this.postState();
  }

  // ─── MCP ────────────────────────────────────────────────────────────────────

  private async refreshMcpStatus(): Promise<void> {
    try {
      const servers = await this.mcpRuntime.getStatusSummary();
      this.sendToRenderer({ type: "mcp:status", servers });
    } catch {
      this.sendToRenderer({ type: "mcp:status", servers: [] });
    }
  }

  // ─── Chat ───────────────────────────────────────────────────────────────────

  async clearChat(): Promise<void> {
    const activeRequest = this.currentSessionId
      ? this.inFlightRequests.get(this.currentSessionId)
      : undefined;
    if (activeRequest) {
      activeRequest.abortController.abort();
      return;
    }
    clearSessionInstalledSkillHooks(
      this.sessionInstalledSkillHooks,
      this.getConversationKey(),
    );
    this.pendingQuestion = undefined;
    this.sessionMessages = [];
    this.modelConversationMessages = [];
    this.compactBoundary = undefined;
    this.streamingText = "";
    const workspaceRoot = this.getSelectedWorkspaceRoot();
    const session = await this.sessions.createSession(
      randomUUID(),
      getWorkspaceHash(workspaceRoot),
      this.getDefaultSessionTitle(),
    );
    await this.sessions.saveRuntimeState(session.id, {
      workspaceRoot,
      sessionType: "default",
    });
    this.currentSessionId = session.id;
    this.modelConversationMessages = [];
    this.compactBoundary = undefined;
    await this.settings.setActiveSessionId(session.id);
    this.currentSessionWorkspaceRoot = workspaceRoot;
    await this.postState();
    await this.loadSessions();
  }

  private buildDesignFlowId(sessionId: string): string {
    return `design-flow-${sessionId}-${Date.now()}`;
  }

  private async createDesignFlowState(
    sessionId: string,
    _prompt: string,
  ): Promise<DesignFlowState> {
    const flow: DesignFlowState = {
      flowId: this.buildDesignFlowId(sessionId),
      conversationId: sessionId,
      createdAt: Date.now(),
      conversationHistory: [],
    };
    this.currentDesignFlowState = flow;
    await this.setCurrentDesignProject(null);
    await this.saveCurrentSessionRuntimeState(sessionId);
    return flow;
  }

  private async resolveDesignLaneRequestContext(
    sessionId: string,
    prompt: string,
    requestedFlowId?: string,
  ): Promise<DesignLaneRequestContext> {
    const activeFlow = this.currentDesignFlowState;
    if (activeFlow && (!requestedFlowId || requestedFlowId === activeFlow.flowId)) {
      if (activeFlow.projectId) {
        const project = await this.designProjectStore.getProject(activeFlow.projectId);
        if (project) {
          await this.setCurrentDesignProject(project);
          const projectHistory = await this.designProjectStore.loadConversationHistory(project.projectId);
          return {
            flow: {
              ...activeFlow,
              conversationHistory: projectHistory.length > 0
                ? projectHistory
                : Array.isArray(activeFlow.conversationHistory)
                  ? activeFlow.conversationHistory
                  : [],
            },
            prompt,
            requestedFlowId,
          };
        }
      }
      await this.setCurrentDesignProject(null);
      return {
        flow: {
          ...activeFlow,
          conversationHistory: Array.isArray(activeFlow.conversationHistory)
            ? activeFlow.conversationHistory
            : [],
        },
        prompt,
        requestedFlowId,
      };
    }

    const nextFlow = await this.createDesignFlowState(sessionId, prompt);
    return {
      flow: nextFlow,
      prompt,
      requestedFlowId,
    };
  }

  private extractArtifactHtmlFromDesignChatOutput(rawOutput: string): {
    html: string;
    title: string;
  } {
    const match = rawOutput.match(
      /<artifact\b([^>]*)>([\s\S]*?)<\/artifact>/i,
    );
    if (!match) {
      throw new Error("Design chat output did not contain an <artifact> block.");
    }

    const attrs = match[1] ?? "";
    const rawBody = (match[2] ?? "").trim();
    const typeMatch = attrs.match(/\btype="([^"]+)"/i);
    const titleMatch = attrs.match(/\btitle="([^"]+)"/i);
    const type = typeMatch?.[1]?.trim().toLowerCase();
    if (type !== "text/html") {
      throw new Error("Design chat artifact must use type=\"text/html\".");
    }
    // Tolerate preamble text the AI may write before the doctype (planning notes, critique).
    const doctypeIdx = rawBody.search(/<!doctype\s+html>/i);
    if (doctypeIdx === -1) {
      throw new Error("Design chat artifact HTML must contain <!DOCTYPE html>.");
    }
    const body = rawBody.slice(doctypeIdx);

    return {
      html: body,
      title: titleMatch?.[1]?.trim() || "KainClaw Design",
    };
  }

  private async runDesignChatTurn(options: {
    sessionId: string;
    prompt: string;
    outputType: DesignOutputType;
    brandContext?: string;
    flow: DesignFlowState;
    signal: AbortSignal;
    target?: "default" | "design-chat";
  }): Promise<DesignChatRunResult> {
    const workspaceRoot = this.getSelectedWorkspaceRoot();
    const designChatToolWorkspaceRoot =
      this.resolveDesignChatToolWorkspaceRoot(options.outputType);
    const { config, envMap } = await resolveProviderConfig(
      this.settings,
      workspaceRoot,
    );
    const runtimeOptions = this.buildProviderRuntimeOptions();
    const provider = this.createProviderForSystemPrompt(
      config,
      workspaceRoot,
      envMap,
      buildDesignChatSystemPrompt({
        ...(options.brandContext?.trim()
          ? { brandContext: options.brandContext.trim() }
          : {}),
      }),
    );
    const target = options.target === "design-chat" ? "design-chat" : "default";
    const streamingId = `${options.sessionId}:design-stream:${Date.now()}`;

    const isFormAnswerTurn = /^\[form answers\s*-\s*discovery\]/i.test(options.prompt);
    let designChatRunWorkspace: DesignChatRunWorkspace | undefined;
    if (isFormAnswerTurn) {
      designChatRunWorkspace = await this.initDesignChatRunWorkspace({
        sessionId: options.sessionId,
        outputType: options.outputType,
        prompt: options.prompt,
        ...(options.brandContext?.trim()
          ? { brandContext: options.brandContext.trim() }
          : {}),
        skillSourceRoot: designChatToolWorkspaceRoot,
      });
    }
    const buildTurn = isFormAnswerTurn && !!designChatRunWorkspace;
    const userPromptBase = buildDesignChatUserPrompt({
      prompt: options.prompt,
      outputType: options.outputType,
      ...(options.brandContext?.trim()
        ? { brandContext: options.brandContext.trim() }
        : {}),
      ...(isFormAnswerTurn ? { isFormAnswerTurn: true } : {}),
    });
    const userPrompt =
      buildTurn && designChatRunWorkspace
        ? [
            `[workspace root: ${path.relative(process.cwd(), designChatRunWorkspace.tempRunRoot).replace(/\\/g, "/")}/]`,
            `Skill entry point: skills/${options.outputType}/SKILL.md`,
            "Final output target: output/index.html",
            "",
            userPromptBase,
          ].join("\n")
        : userPromptBase;
    const conversationHistory = Array.isArray(options.flow.conversationHistory)
      ? options.flow.conversationHistory
      : [];
    const designChatTools = getDesignChatTools(buildTurn ? "build" : "discovery");
    const effectiveWorkspaceRoot =
      designChatRunWorkspace?.tempRunRoot ?? designChatToolWorkspaceRoot;
    const promptRuntime = this.createPromptRuntime(
      effectiveWorkspaceRoot,
      config,
      envMap,
      runtimeOptions,
      designChatTools,
      this.mcpRuntime,
      options.signal,
      designChatRunWorkspace?.tempRunRoot,
    );
    const toolContext = promptRuntime.getToolContext("main");
    const history: NormalizedMessage[] = [
      ...conversationHistory.map(message => ({
        role: message.role,
        content: message.content,
      })),
      {
        role: "user" as const,
        content: userPrompt,
      },
    ];

    // Design-chat trace — logs tool calls and execution evidence to .design-chat-traces/
    const traceStart = Date.now();
    const traceLines: string[] = [
      `design-chat-trace  ${new Date().toISOString()}`,
      `session=${options.sessionId}  outputType=${options.outputType}  isFormAnswerTurn=${isFormAnswerTurn}`,
      ...(designChatRunWorkspace
        ? [
            `runRoot=${designChatRunWorkspace.tempRunRoot}`,
            `skillSourceRoot=${designChatRunWorkspace.skillSourceRoot}`,
            `usedBundleDir=${designChatRunWorkspace.usedBundleDir}`,
          ]
        : []),
      `---`,
    ];
    const traceLine = (msg: string) => {
      const rel = ((Date.now() - traceStart) / 1000).toFixed(3);
      const line = `+${rel}s  ${msg}`;
      traceLines.push(line);
      console.log(`[design-trace] ${line}`);
    };

    if (buildTurn && target === "design-chat") {
      this.sendToRenderer({ type: "design:chat:build-start" });
    }

    let streamedText = "";
    const result = await runAgent(history, {
      provider,
      tools: designChatTools,
      toolContext,
      onToken: token => {
        streamedText += token;
        this.appendStreamingToken(options.sessionId, token);
        if (target === "design-chat") {
          this.sendToRenderer({
            type: "design:chat:token",
            token,
            streamingId,
          });
        }
      },
      onToolStart: (toolName, input) => {
        traceLine(`TOOL_START  ${toolName}  ${JSON.stringify(input).slice(0, 300)}`);
        if (buildTurn && target === "design-chat") {
          this.sendToRenderer({ type: "design:chat:build-tool-start", toolName });
        }
      },
      onToolEnd: (execId, summary, isError) => {
        const status = isError ? "ERROR" : "OK";
        traceLine(`TOOL_END    ${status}  ${summary.slice(0, 200)}`);
        if (buildTurn && target === "design-chat") {
          this.sendToRenderer({ type: "design:chat:build-tool-end" });
        }
      },
      abortSignal: options.signal,
      maxTurns: 10,
    });

    // Summarise evidence — did the AI actually follow RULE 3?
    const lower = streamedText.toLowerCase();
    const evidence = {
      read_file_calls: traceLines.filter(l => l.includes("TOOL_START  read_file")).length,
      tool_errors:     traceLines.filter(l => l.includes("TOOL_END    ERROR")).length,
      template_read:   traceLines.some(l => l.includes("read_file") && l.includes("template.html")),
      layouts_read:    traceLines.some(l => l.includes("read_file") && l.includes("layouts.md")),
      checklist_read:  traceLines.some(l => l.includes("read_file") && l.includes("checklist.md")),
      skill_md_read:   traceLines.some(l => l.includes("TOOL_START  read_file") && l.includes("SKILL.md")),
      output_file_written: buildTurn && designChatRunWorkspace
        ? existsSync(path.join(designChatRunWorkspace.tempRunRoot, "output", "index.html"))
        : false,
      five_dim_exec:   lower.includes("philosophy") && lower.includes("execution") && lower.includes("restraint"),
      checklist_exec:  lower.includes("p0") || lower.includes("checklist"),
      output_chars:    streamedText.length,
    };
    traceLine(`EVIDENCE  ${JSON.stringify(evidence)}`);

    // Write trace file
    try {
      const traceDir = path.join(workspaceRoot || process.cwd(), ".design-chat-traces");
      await fs.mkdir(traceDir, { recursive: true });
      const traceFile = path.join(
        traceDir,
        `trace-${options.outputType}-${options.sessionId.slice(-6)}-${traceStart}.txt`,
      );
      await fs.writeFile(traceFile, traceLines.join("\n") + "\n");
    } catch {
      // trace write failure must never break generation
    }
    const rawOutput = (result.text || streamedText).trim();
    if (!rawOutput) {
      throw new Error("Design chat returned an empty response.");
    }

    if (buildTurn && designChatRunWorkspace) {
      const outputFilePath = path.join(designChatRunWorkspace.tempRunRoot, "output", "index.html");
      let outputHtml: string;
      try {
        const stat = await fs.stat(outputFilePath);
        if (stat.size === 0) {
          throw new Error("output/index.html is empty.");
        }
        outputHtml = await fs.readFile(outputFilePath, "utf8");
      } catch (error) {
        throw new Error(
          `Design build failed: output/index.html not found or unreadable. ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      if (!outputHtml.trimStart().toLowerCase().startsWith("<!doctype html")) {
        throw new Error("Design build failed: output/index.html does not start with <!DOCTYPE html>.");
      }

      const seedAssetsRead = evidence.template_read && evidence.layouts_read && evidence.checklist_read;
      if (designChatRunWorkspace.usedBundleDir && !seedAssetsRead) {
        throw new Error(
          `Design build failed: outputType "${options.outputType}" has a full bundle but agent did not read all seed assets ` +
            `(template_read=${evidence.template_read}, layouts_read=${evidence.layouts_read}, checklist_read=${evidence.checklist_read}).`,
        );
      }

      if (!designChatRunWorkspace.usedBundleDir && !seedAssetsRead) {
        console.warn(
          `[design-chat] Seed assets not fully read for flat-only outputType "${options.outputType}". Proceeding.`,
        );
      }

      const titleMatch = outputHtml.match(/<title>([\s\S]*?)<\/title>/i);
      const artifactTitle = titleMatch?.[1]?.trim() || "KainClaw Design";
      const artifactSlug = artifactTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "design-output";
      const wrappedOutput = [
        `<artifact identifier="${artifactSlug}" type="text/html" title="${artifactTitle.replace(/"/g, "&quot;")}">`,
        outputHtml,
        "</artifact>",
      ].join("\n");

      const shouldAppendUserTurn =
        conversationHistory.at(-1)?.role !== "user" ||
        conversationHistory.at(-1)?.content !== options.prompt;
      const nextHistory: DesignChatHistoryMessage[] = [
        ...conversationHistory,
        ...(shouldAppendUserTurn
          ? [{
              role: "user" as const,
              content: options.prompt,
            }]
          : []),
        {
          role: "assistant",
          content: wrappedOutput,
        },
      ];

      return {
        kind: "artifact",
        rawOutput: wrappedOutput,
        html: outputHtml,
        sliders: [],
        history: nextHistory,
      };
    }

    const shouldAppendUserTurn =
      conversationHistory.at(-1)?.role !== "user" ||
      conversationHistory.at(-1)?.content !== options.prompt;
    const nextHistory: DesignChatHistoryMessage[] = [
      ...conversationHistory,
      ...(shouldAppendUserTurn
        ? [{
            role: "user" as const,
            content: options.prompt,
          }]
        : []),
      {
        role: "assistant",
        content: rawOutput,
      },
    ];

    if (/<question-form\b/i.test(rawOutput)) {
      return {
        kind: "question-form",
        content: rawOutput,
        history: nextHistory,
      };
    }

    const artifact = this.extractArtifactHtmlFromDesignChatOutput(rawOutput);

    return {
      kind: "artifact",
      rawOutput,
      html: artifact.html,
      sliders: [],
      history: nextHistory,
    };
  }

  private async initDesignChatRunWorkspace(options: {
    sessionId: string;
    outputType: DesignOutputType;
    prompt: string;
    brandContext?: string;
    skillSourceRoot: string;
  }): Promise<DesignChatRunWorkspace> {
    const runId = Date.now().toString(36);
    const tempRunRoot = path.join(
      process.cwd(),
      ".design-chat-runs",
      options.sessionId.slice(-8),
      runId,
    );
    const bundleDirRelativePath = getDesignChatSkillBundleDirRelativePath(options.outputType);
    const skillBundleDir = path.join(options.skillSourceRoot, bundleDirRelativePath);
    const skillFlatFile = path.join(
      options.skillSourceRoot,
      getDesignChatSkillRelativePath(options.outputType),
    );
    const stagedSkillDir = path.join(tempRunRoot, "skills", options.outputType);

    await fs.mkdir(path.join(tempRunRoot, "output"), { recursive: true });
    await fs.mkdir(stagedSkillDir, { recursive: true });

    const filesToStage: Array<{ src: string; dst: string }> = [];
    const bundleSkillEntryPath = path.join(skillBundleDir, "SKILL.md");
    const usedBundleDir = existsSync(bundleSkillEntryPath);

    if (usedBundleDir) {
      filesToStage.push({
        src: bundleSkillEntryPath,
        dst: path.join(stagedSkillDir, "SKILL.md"),
      });
    } else if (existsSync(skillFlatFile)) {
      filesToStage.push({
        src: skillFlatFile,
        dst: path.join(stagedSkillDir, "SKILL.md"),
      });
    } else {
      throw new Error(
        `Design build failed: no skill entry found for outputType "${options.outputType}".`,
      );
    }

    for (const assetFile of ["template.html", "layouts.md", "checklist.md"]) {
      const assetPath = path.join(skillBundleDir, assetFile);
      if (existsSync(assetPath)) {
        filesToStage.push({
          src: assetPath,
          dst: path.join(stagedSkillDir, assetFile),
        });
      }
    }

    await Promise.all(
      filesToStage.map(async ({ src, dst }) => {
        await fs.mkdir(path.dirname(dst), { recursive: true });
        await fs.copyFile(src, dst);
      }),
    );

    await fs.writeFile(
      path.join(tempRunRoot, "brief.md"),
      `# Design Brief\n\n${options.prompt}\n`,
      "utf8",
    );

    if (options.brandContext?.trim()) {
      await fs.writeFile(
        path.join(tempRunRoot, "brand.md"),
        `# Brand Context\n\n${options.brandContext.trim()}\n`,
        "utf8",
      );
    }

    return {
      tempRunRoot,
      skillSourceRoot: options.skillSourceRoot,
      usedBundleDir,
    };
  }

  private async handleDesignChatLane(message: Record<string, unknown>): Promise<void> {
    const prompt = String(message.prompt ?? "").trim();
    if (!prompt) {
      return;
    }

    await this.ensureSession();
    if (!this.currentSessionId) {
      return;
    }

    const context = await this.resolveDesignLaneRequestContext(
      this.currentSessionId,
      prompt,
      typeof message.designFlowId === "string" ? message.designFlowId.trim() : undefined,
    );
    this.currentDesignFlowState = {
      ...context.flow,
      conversationHistory: Array.isArray(context.flow.conversationHistory)
        ? context.flow.conversationHistory
        : [],
    };
    await this.saveCurrentSessionRuntimeState(this.currentSessionId);
    const target = message.target === "design-chat" ? "design-chat" : "default";
    const outputType = normalizeDesignOutputType(message.outputType);
    const brandContext =
      typeof message.brandContext === "string" ? message.brandContext.trim() : "";

    const requestSessionId = this.currentSessionId;
    if (this.inFlightRequests.has(requestSessionId)) {
      return;
    }

    const abortController = new AbortController();
    this.inFlightRequests.set(requestSessionId, {
      abortController,
      streamingText: "",
      kind: "chat",
    });

    try {
      const result = await this.runDesignChatTurn({
        sessionId: requestSessionId,
        prompt,
        outputType,
        ...(brandContext ? { brandContext } : {}),
        flow: context.flow,
        signal: abortController.signal,
        target,
      });

      this.currentDesignFlowState = {
        ...context.flow,
        conversationHistory: result.history,
      };
      if (this.currentDesignProjectId) {
        await this.designProjectStore.saveConversationHistory(
          this.currentDesignProjectId,
          result.history,
        );
      }

      if (result.kind === "question-form") {
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: result.content,
          timestamp: Date.now(),
        };
        await this.appendAssistantMessageToSession(requestSessionId, assistantMessage);
        if (target === "design-chat") {
          this.sendToRenderer({
            type: "design:chat:append",
            msg: this.toDesignChatRendererMessage(
              requestSessionId,
              assistantMessage,
              this.sessionMessages.length - 1,
            ),
          });
        }
        await this.saveCurrentSessionRuntimeState(requestSessionId);
        return;
      }

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: result.rawOutput,
        timestamp: Date.now(),
      };
      await this.appendAssistantMessageToSession(requestSessionId, assistantMessage);
      const assistantMessageIndex = this.sessionMessages.length - 1;
      const storedAssistantMessage = this.sessionMessages[assistantMessageIndex];
      if (storedAssistantMessage) {
        const detectedArtifact = this.detectArtifactFromSessionMessage(
          requestSessionId,
          storedAssistantMessage,
          assistantMessageIndex,
        );
        if (detectedArtifact) {
          this.getArtifactRegistry(requestSessionId).push(detectedArtifact);
          await this.setArtifactPanelCollapsedState(requestSessionId, false);
        }
        if (target === "design-chat") {
          this.sendToRenderer({
            type: "design:chat:append",
            msg: this.toDesignChatRendererMessage(
              requestSessionId,
              storedAssistantMessage,
              assistantMessageIndex,
            ),
          });
        }
      }
      await this.saveCurrentSessionRuntimeState(requestSessionId);
      if (target === "design-chat") {
        await this.openMidtai({
          contentType: "design",
          view: "preview",
        });
      }
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: `设计任务失败：${error instanceof Error ? error.message : String(error)}`,
        kind: "error",
        timestamp: Date.now(),
      };
      await this.appendAssistantMessageToSession(requestSessionId, errorMessage);
      if (target === "design-chat") {
        this.sendToRenderer({
          type: "design:chat:append",
          msg: this.toDesignChatRendererMessage(
            requestSessionId,
            errorMessage,
            this.sessionMessages.length - 1,
          ),
        });
      }
      this.sendToRenderer({
        type: "design:error",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.inFlightRequests.delete(requestSessionId);
      this.clearStreamingForSession(requestSessionId);
      await this.postState();
    }
  }

  private async handleDesignChatSend(message: Record<string, unknown>): Promise<void> {
    const prompt = String(message.prompt ?? "").trim();
    if (!prompt) {
      return;
    }

    const currentRuntimeState = this.currentSessionId
      ? await this.loadSessionRuntimeState(this.currentSessionId)
      : null;
    if (currentRuntimeState?.sessionType !== "design") {
      await this.createNewDesignSessionSilent();
    }
    if (!this.currentSessionId) {
      return;
    }

    const effectivePrompt = prompt;
    const isFormAnswer = /^\[form answers\s*-\s*discovery\]/i.test(prompt);
    if (!isFormAnswer && this.currentDesignProjectId) {
      const project = await this.designProjectStore.getProject(this.currentDesignProjectId);
      const hasVersion = !!(project?.activeVersionId && project.activeVersionId !== "pending-version");
      if (hasVersion) {
        const userMessage = await this.appendUserMessageToSession(this.currentSessionId, effectivePrompt);
        this.sendToRenderer({
          type: "design:chat:append",
          msg: this.toDesignChatRendererMessage(
            this.currentSessionId,
            userMessage,
            this.sessionMessages.length - 1,
          ),
        });
        this.pendingDiversionPrompt = effectivePrompt;
        this.sendToRenderer({
          type: "design:show-diversion",
          projectName: project?.name ?? "当前作品",
          pendingPrompt: effectivePrompt,
        });
        return;
      }
    }

    const userMessage = await this.appendUserMessageToSession(this.currentSessionId, prompt);
    this.sendToRenderer({
      type: "design:chat:append",
      msg: this.toDesignChatRendererMessage(
        this.currentSessionId,
        userMessage,
        this.sessionMessages.length - 1,
      ),
    });

    await this.handleDesignChatLane({
      ...message,
      prompt: effectivePrompt,
      target: "design-chat",
    });
  }

  private async handleDesignSessionReset(): Promise<void> {
    if (this.currentSessionId && this.settings.getActiveSessionId() === this.currentSessionId) {
      await this.settings.setActiveSessionId("");
    }
    this.currentSessionId = undefined;
    this.sessionMessages = [];
    this.modelConversationMessages = [];
    this.compactBoundary = undefined;
    this.currentSessionWorkspaceRoot = "";
    this.currentDesignFlowState = undefined;
    this.currentDesignProjectId = undefined;
    this.pendingDiversionPrompt = undefined;
    this.pendingQuestion = undefined;
    this.streamingText = "";
    await this.postState();
  }

  private async handleDiversionChoice(message: Record<string, unknown>): Promise<void> {
    const choice = String(message.choice ?? "").trim();
    const prompt = this.pendingDiversionPrompt ?? "";
    const originalName = this.currentDesignProjectId
      ? (await this.designProjectStore.getProject(this.currentDesignProjectId))?.name ?? "原作品"
      : "原作品";
    this.pendingDiversionPrompt = undefined;
    if (!prompt || !this.currentSessionId) {
      return;
    }

    if (choice === "continue") {
      await this.handleDesignChatLane({ prompt, target: "design-chat" });
      return;
    }

    if (choice === "new-work") {
      await this.handleNewTransientWork();
      await this.handleDesignChatLane({ prompt, target: "design-chat" });
      return;
    }

    if (choice === "fork") {
      await this.handleNewTransientWork();
      if (this.currentSessionId) {
        await this.appendAssistantMessageToSession(this.currentSessionId, {
          role: "assistant",
          content: `正在基于《${originalName}》另起一版。`,
          timestamp: Date.now(),
        });
        this.sendToRenderer({
          type: "design:chat:append",
          msg: this.toDesignChatRendererMessage(
            this.currentSessionId,
            this.sessionMessages[this.sessionMessages.length - 1]!,
            this.sessionMessages.length - 1,
          ),
        });
      }
      await this.handleDesignChatLane({ prompt, target: "design-chat" });
      return;
    }

    if (choice === "cancel") {
      this.sendToRenderer({
        type: "design:restore-prompt",
        prompt,
      });
    }
  }

  private async handleDesignChatLoadHistory(): Promise<void> {
    await this.postDesignChatHistoryForSession(this.currentSessionId);
    await this.postDesignFlowContext(
      this.currentDesignProjectId,
      await this.getCurrentDesignProject(),
    );
  }

  private async handleNewTransientWork(): Promise<void> {
    await this.createNewDesignSessionSilent();
    this.currentDesignFlowState = undefined;
    if (this.currentSessionId) {
      await this.saveCurrentSessionRuntimeState(this.currentSessionId);
    }
    this.sendToRenderer({
      type: "design:transient-work-ready",
      sessionId: this.currentSessionId ?? "",
    });
    this.sendToRenderer({ type: "design:chat:history", messages: [] });
    await this.openMidtai({
      contentType: "design",
      view: "preview",
      designChat: true,
      sessionType: "design",
    });
  }

  private async postDesignChatHistoryForSession(
    sessionId?: string,
  ): Promise<void> {
    if (!sessionId) {
      this.sendToRenderer({ type: "design:chat:history", messages: [] });
      return;
    }
    const state = await this.sessions.loadRuntimeState(sessionId);
    if (state.sessionType !== "design") {
      this.sendToRenderer({ type: "design:chat:history", messages: [] });
      return;
    }
    const messages = await this.sessions.loadMessages(sessionId);
    this.sendToRenderer({
      type: "design:chat:history",
      messages: messages.map((entry, index) =>
        this.toDesignChatRendererMessage(sessionId, entry, index),
      ),
    });
  }

  private async postDesignFlowContext(
    projectId: string | undefined,
    project?: DesignProjectRecord | null,
  ): Promise<void> {
    const normalizedProjectId = typeof projectId === "string" ? projectId.trim() : "";
    const resolvedProject = project ?? (
      normalizedProjectId
        ? await this.designProjectStore.getProject(normalizedProjectId)
        : null
    );
    const hasVersion = !!(
      resolvedProject?.activeVersionId &&
      resolvedProject.activeVersionId !== "pending-version"
    );
    this.sendToRenderer({
      type: "design:flow-context",
      projectId: normalizedProjectId,
      projectName: resolvedProject?.name ?? "",
      hasVersion,
    });
  }

  private async findSessionByProjectId(
    projectId: string,
  ): Promise<string | undefined> {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) {
      return undefined;
    }
    const index = await this.sessions.readIndex();
    for (const session of index.sessions) {
      const state = await this.sessions.loadRuntimeState(session.id);
      if (
        state.sessionType === "design" &&
        state.designFlowState?.projectId === normalizedProjectId
      ) {
        return session.id;
      }
    }
    return undefined;
  }

  private async ensureDesignSessionForProject(
    projectId: string,
  ): Promise<string | undefined> {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) {
      return undefined;
    }

    const existingSessionId = await this.findSessionByProjectId(normalizedProjectId);
    if (existingSessionId) {
      return existingSessionId;
    }

    const project = await this.designProjectStore.getProject(normalizedProjectId);
    if (!project) {
      return undefined;
    }
    const projectHistory = await this.designProjectStore.loadConversationHistory(
      normalizedProjectId,
    );

    const workspaceRoot = this.getSelectedWorkspaceRoot();
    const session = await this.sessions.createSession(
      randomUUID(),
      getWorkspaceHash(workspaceRoot),
      project.name?.trim() || (
        this.settings.getLanguage() === "en-US" ? "Design chat" : "设计对话"
      ),
    );
    const nextFlowState: DesignFlowState = {
      flowId: this.buildDesignFlowId(session.id),
      projectId: normalizedProjectId,
      conversationId: session.id,
      createdAt: Date.now(),
      conversationHistory: projectHistory,
    };
    await this.sessions.saveRuntimeState(session.id, {
      workspaceRoot,
      sessionType: "design",
      designFlowState: nextFlowState,
    });
    if (projectHistory.length > 0) {
      await this.sessions.appendMessages(
        session.id,
        projectHistory.map((message, index) => ({
          role: message.role,
          content: message.content,
          timestamp: Date.now() + index,
        })),
      );
    }
    return session.id;
  }

  private async handleSwitchDesignProject(
    projectId: string,
  ): Promise<void> {
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) {
      return;
    }

    const project = await this.openDesignProject(normalizedProjectId);
    if (!project) {
      this.sendToRenderer({ type: "design:chat:history", messages: [] });
      await this.postDesignFlowContext(normalizedProjectId, null);
      return;
    }

    const targetSessionId = await this.ensureDesignSessionForProject(project.projectId);
    if (targetSessionId && targetSessionId !== this.currentSessionId) {
      await this.switchSession(targetSessionId);
    }

    if (this.currentSessionId) {
      const state = await this.sessions.loadRuntimeState(this.currentSessionId);
      const projectHistory = await this.designProjectStore.loadConversationHistory(project.projectId);
      let conversationHistory = projectHistory;
      if (conversationHistory.length === 0) {
        const legacyHistory = Array.isArray(state?.designFlowState?.conversationHistory)
          ? state.designFlowState.conversationHistory
          : [];
        if (legacyHistory.length > 0) {
          await this.designProjectStore.saveConversationHistory(project.projectId, legacyHistory);
          conversationHistory = legacyHistory;
        }
      }
      this.currentDesignFlowState = state?.designFlowState
        ? {
            ...state.designFlowState,
            projectId: project.projectId,
            conversationHistory,
          }
        : {
            flowId: this.buildDesignFlowId(this.currentSessionId),
            projectId: project.projectId,
            conversationId: this.currentSessionId,
            createdAt: Date.now(),
            conversationHistory,
          };
      await this.saveCurrentSessionRuntimeState(this.currentSessionId);
    } else {
      this.currentDesignFlowState = undefined;
    }

    const activeVersion = project.activeVersionId && project.activeVersionId !== "pending-version"
      ? await this.designVersionStore.getVersion(project.activeVersionId)
      : null;

    this.sendToRenderer({
      type: "design:projectOpened",
      project,
      activeVersion,
    });
    await this.postDesignChatHistoryForSession(this.currentSessionId);
    await this.postDesignFlowContext(project.projectId, project);
  }

  private async routePrompt(
    prompt: string,
    attachments?: WebviewAttachment[],
    intentOverride?: string,
  ): Promise<void> {
    const trimmedPrompt = prompt.trim();
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    if (!trimmedPrompt && !hasAttachments) {
      return;
    }

    if (trimmedPrompt && parsePromptSlashCommand(trimmedPrompt)) {
      await this.sendPrompt(trimmedPrompt, attachments);
      return;
    }

    const explicitIntent =
      intentOverride === "image_generate" || intentOverride === "chat"
        ? intentOverride
        : undefined;
    if (explicitIntent === "image_generate") {
      await this.runChatImageJob({
        prompt: trimmedPrompt,
        referenceImages: attachments,
      });
      return;
    }
    if (explicitIntent === "chat") {
      await this.sendPrompt(trimmedPrompt, attachments);
      return;
    }

    const latestGeneratedImage = this.getLatestGeneratedImageFromCurrentSession();
    const recentHistory = this.sessionMessages
      .slice(-6)
      .filter(message => message.role === "user" || message.role === "assistant")
      .map(message => ({
        role: message.role,
        content: String(message.content ?? "").slice(0, 200),
      }));
    let intent: ChatPromptIntent;
    try {
      const workspaceRoot = this.getSelectedWorkspaceRoot();
      const { config, envMap } = await resolveProviderConfig(
        this.settings,
        workspaceRoot,
      );
      const routerAdapter = this.createProviderForSystemPrompt(
        config,
        workspaceRoot,
        envMap,
        INTENT_ROUTER_SYSTEM_PROMPT + ELECTRON_SHELL_PROMPT_NOTE,
      );
      intent = await routeIntentWithLLM({
        prompt: trimmedPrompt,
        hasAttachments,
        hasRecentGeneratedImageContext: !!latestGeneratedImage,
        recentHistory,
        provider: routerAdapter,
      });
    } catch {
      intent = determineChatPromptIntent({
        prompt: trimmedPrompt,
        hasAttachments,
        hasRecentGeneratedImageContext: !!latestGeneratedImage,
      });
    }

    if (intent === "image_generate") {
      await this.runChatImageJob({
        prompt: trimmedPrompt,
        referenceImages: attachments,
      });
      return;
    }

    if (intent === "image_edit") {
      const implicitReferenceImages = await this.buildImplicitEditReferenceImages(attachments);
      await this.runChatImageJob({
        prompt: trimmedPrompt,
        referenceImages: implicitReferenceImages,
      });
      return;
    }

    if (intent === "derive_artifact") {
      const artifactAttachments = await this.buildImplicitArtifactReferenceAttachments(
        attachments,
      );
      if (!artifactAttachments.length) {
        await this.appendRouteErrorMessage(
          this.localizeShellSurfaceText(
            "请先上传一张设计图，或先生成一张图片，再让我把它做成可点击的 HTML 原型。",
          ),
        );
        return;
      }

      try {
        const workspaceRoot = this.getSelectedWorkspaceRoot();
        const { config } = await resolveProviderConfig(this.settings, workspaceRoot);
        if (!providerSupportsArtifactDerivation(config)) {
          await this.appendRouteErrorMessage(
            this.localizeShellSurfaceText(
              "当前聊天模型不支持图片理解。请先切换到支持视觉输入的聊天模型，再把设计图转换成 HTML 原型。",
            ),
          );
          return;
        }
      } catch {
        // Let the normal prompt pipeline surface provider configuration errors.
      }

      await this.sendPrompt(trimmedPrompt, artifactAttachments, {
        modelPrompt: buildDeriveArtifactPrompt(trimmedPrompt),
      });
      return;
    }

    await this.sendPrompt(trimmedPrompt, attachments);
  }

  private async sendPrompt(
    prompt: string,
    attachments?: WebviewAttachment[],
    options?: SendPromptOptions,
  ): Promise<void> {
    if (!prompt.trim()) return;
    await this.ensureSession();

    const requestSessionId = this.currentSessionId;
    if (!requestSessionId || this.inFlightRequests.has(requestSessionId)) {
      return;
    }

    const abortController = new AbortController();
    this.inFlightRequests.set(requestSessionId, {
      abortController,
      streamingText: "",
      kind: "chat",
    });

    const normalizedAttachments = normalizeWebviewAttachments(attachments);
    const userMessage: ChatMessage = {
      role: "user",
      content: prompt,
      timestamp: Date.now(),
      ...(normalizedAttachments ? { attachments: normalizedAttachments } : {}),
    };
    const requestSessionMessages = [...this.sessionMessages, userMessage];
    this.sessionMessages = requestSessionMessages;
    await this.sessions.appendMessages(requestSessionId, [userMessage]);

    await this.postState();

    let temporaryMcpRuntime: McpRuntime | undefined;
    let requestModelConversation: PersistedConversationMessage[] | undefined;

    try {
      const workspaceContext = await this.getResolvedWorkspaceContext();
      if (
        await this.tryHandleInstalledSkillCompat({
          sessionId: requestSessionId,
          prompt,
          workspaceRoot: workspaceContext.effectiveRoot,
        })
      ) {
        return;
      }
      const parsedCommand = parsePromptSlashCommand(prompt);
      const isInspectionCommand =
        parsedCommand?.name === "/review" || parsedCommand?.name === "/verify";
      const workspaceRoot = isInspectionCommand
        ? workspaceContext.effectiveRoot
        : this.getSelectedWorkspaceRoot();
      const commandMcpRuntime =
        isInspectionCommand && workspaceRoot && workspaceRoot !== this.getSelectedWorkspaceRoot()
          ? (temporaryMcpRuntime = new McpRuntime(
              () => workspaceRoot,
              process.env as Record<string, string>,
              this.host,
            ))
          : this.mcpRuntime;
      const { config, envMap } = await resolveProviderConfig(
        this.settings,
        workspaceRoot,
      );
      const workspaceNote = this.buildWorkspaceSystemNote(workspaceContext);
      this.streamingText = this.getVisibleStreamingText();

      // Collect all tools: built-in + MCP
      let mcpTools: typeof builtinToolDefinitions = [];
      try {
        mcpTools = await commandMcpRuntime.getToolDefinitions();
      } catch {
        // MCP not configured or failed – proceed with built-in tools only
      }
      const allTools = dedupeToolDefinitionsByName([
        ...getSupportedElectronTools(),
        ...mcpTools,
      ]);
      const runtimeOptions = this.buildProviderRuntimeOptions();
      const promptRuntime = this.createPromptRuntime(
        workspaceRoot,
        config,
        envMap,
        runtimeOptions,
        allTools,
        commandMcpRuntime,
        abortController.signal,
      );
      let activeConfig = config;
      let activeTools = allTools;
      let activeRuntimeOptions = runtimeOptions;
      let activePromptRuntime = promptRuntime;
      let activeSessionInstalledSkillHooks =
        this.getCurrentSessionInstalledSkillHooks();
      const installedSkillAgentRunner: AgentRunner = async (hook, context) => {
        const hookPrompt = buildElectronInstalledSkillAgentHookPrompt(
          hook,
          context,
        );
        const hookConfig =
          hook.agentModel && "model" in config
            ? { ...config, model: hook.agentModel }
            : config;
        const hookProvider = buildProviderAdapter(
          hookConfig,
          workspaceRoot,
          SYSTEM_PROMPT + workspaceNote + ELECTRON_SHELL_PROMPT_NOTE,
          envMap,
          runtimeOptions,
        );
        await runAgent(
          [
            {
              role: "user",
              content: hookPrompt,
            },
          ],
          {
            provider: hookProvider,
            tools: allTools,
            toolContext: promptRuntime.getToolContext("main"),
            abortSignal: abortController.signal,
          },
        );
      };

      const commandResult = await handleElectronPromptCommand({
        prompt,
        config,
        workspaceRoot,
        envMap,
        currentLanguage: this.settings.getLanguage(),
        runtime: promptRuntime,
        tools: allTools,
        runtimeOptions,
        currentEffortLevel: this.settings.getEffortLevel(),
        setEffortLevel: value => this.settings.setEffortLevel(value),
        currentFastMode: this.settings.getFastMode(),
        setFastMode: enabled => this.settings.setFastMode(enabled),
        setActiveProviderModel: model => this.settings.setActiveProviderModel(model),
        refreshWorkspaceStatus: () => {
          void this.postState();
        },
        getSessionInstalledSkillHooks: () =>
          this.getCurrentSessionInstalledSkillHooks(),
        registerSessionInstalledSkillHooks: hooks =>
          this.registerCurrentSessionInstalledSkillHooks(hooks),
        handleCompactCommand: (commandText, commandWorkspaceRoot, commandConfig, commandEnvMap) =>
          this.handleCompactPromptCommand(
            requestSessionId,
            commandText,
            commandWorkspaceRoot,
            commandConfig,
            commandEnvMap,
          ),
        handleReviewCommand: (
          commandText,
          _commandWorkspaceRoot,
          commandConfig,
          commandEnvMap,
          _commandRuntime,
          commandTools,
          commandRuntimeOptions,
          effortLevel,
        ) =>
          this.handleReviewPromptCommand(
            requestSessionId,
            commandText,
            workspaceContext.effectiveRoot,
            commandConfig,
            commandEnvMap,
            this.createPromptRuntime(
              workspaceContext.effectiveRoot,
              commandConfig,
              commandEnvMap,
              commandRuntimeOptions,
              commandTools,
              commandMcpRuntime,
              abortController.signal,
            ),
            commandTools,
            commandRuntimeOptions,
            effortLevel,
          ),
        handleUltrareviewCommand: (
          commandText,
          _commandWorkspaceRoot,
          commandConfig,
          commandEnvMap,
          _commandRuntime,
          commandTools,
          commandRuntimeOptions,
          effortLevel,
        ) =>
          this.handleUltrareviewPromptCommand(
            requestSessionId,
            commandText,
            workspaceContext.effectiveRoot,
            commandConfig,
            commandEnvMap,
            this.createPromptRuntime(
              workspaceContext.effectiveRoot,
              commandConfig,
              commandEnvMap,
              commandRuntimeOptions,
              commandTools,
              commandMcpRuntime,
              abortController.signal,
            ),
            commandTools,
            commandRuntimeOptions,
            effortLevel,
          ),
        handleUltraverifyCommand: (
          commandText,
          _commandWorkspaceRoot,
          commandConfig,
          commandEnvMap,
          _commandRuntime,
          commandTools,
          commandRuntimeOptions,
          effortLevel,
        ) =>
          this.handleUltraverifyPromptCommand(
            requestSessionId,
            commandText,
            workspaceContext.effectiveRoot,
            commandConfig,
            commandEnvMap,
            this.createPromptRuntime(
              workspaceContext.effectiveRoot,
              commandConfig,
              commandEnvMap,
              commandRuntimeOptions,
              commandTools,
              commandMcpRuntime,
              abortController.signal,
            ),
            commandTools,
            commandRuntimeOptions,
            effortLevel,
          ),
        handleVerificationCommand: (
          commandText,
          _commandWorkspaceRoot,
          commandConfig,
          commandEnvMap,
          _commandRuntime,
          commandTools,
          commandRuntimeOptions,
          effortLevel,
        ) =>
          this.handleVerificationPromptCommand(
            requestSessionId,
            commandText,
            workspaceContext.effectiveRoot,
            commandConfig,
            commandEnvMap,
            this.createPromptRuntime(
              workspaceContext.effectiveRoot,
              commandConfig,
              commandEnvMap,
              commandRuntimeOptions,
              commandTools,
              commandMcpRuntime,
              abortController.signal,
            ),
            commandTools,
            commandRuntimeOptions,
            effortLevel,
          ),
      });

      if (commandResult.kind === "reply") {
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: commandResult.reply,
          excludeFromConversation: true,
          timestamp: Date.now(),
        };
        await this.appendAssistantMessageToSession(requestSessionId, assistantMessage);
        return;
      }

        if (commandResult.kind === "handled") {
          return;
        }

      let effectivePrompt = options?.modelPrompt?.trim() || prompt;
      let effectivePromptAttachments = normalizedAttachments;
      if (commandResult.effectivePrompt) {
        effectivePrompt = commandResult.effectivePrompt;
      }
      if (commandResult.effectivePromptAttachments?.length) {
        effectivePromptAttachments = commandResult.effectivePromptAttachments;
      }
      if (commandResult.allowedTools?.length) {
        activeTools = allTools.filter(tool =>
          commandResult.allowedTools!.includes(tool.name),
        );
      }
      if (commandResult.modelOverride) {
        activeConfig = {
          ...config,
          model: commandResult.modelOverride,
        };
      }
      if (commandResult.effortOverride) {
        activeRuntimeOptions = {
          ...runtimeOptions,
          effortLevel: commandResult.effortOverride,
        };
      }
      if (
        commandResult.modelOverride ||
        commandResult.effortOverride ||
        activeTools !== allTools
      ) {
        activePromptRuntime = this.createPromptRuntime(
          workspaceRoot,
          activeConfig,
          envMap,
          activeRuntimeOptions,
          activeTools,
          commandMcpRuntime,
          abortController.signal,
        );
      }
      if (commandResult.installedSkillHooks?.length) {
        activeSessionInstalledSkillHooks = commandResult.installedSkillHooks;
      } else {
        activeSessionInstalledSkillHooks =
          this.getCurrentSessionInstalledSkillHooks();
      }
      if (activeSessionInstalledSkillHooks.length > 0) {
        const prePromptResult = await triggerHooks(
          "PrePrompt",
          activeSessionInstalledSkillHooks,
          {
            workspaceRoot,
            prompt: effectivePrompt,
          },
          installedSkillAgentRunner,
        );
        if (prePromptResult.blocked) {
          throw new Error("Installed skill hook blocked prompt execution.");
        }
        if (prePromptResult.promptPrefixInjection) {
          effectivePrompt = buildInjectedPrompt(
            effectivePrompt,
            prePromptResult.promptPrefixInjection,
            "prefix",
          );
        }
        if (prePromptResult.promptSuffixInjection) {
          effectivePrompt = buildInjectedPrompt(
            effectivePrompt,
            prePromptResult.promptSuffixInjection,
            "suffix",
          );
        }
      }

      effectivePrompt = augmentArtifactPrompt(effectivePrompt);
      if (shouldDisableToolsForArtifactPrompt(effectivePrompt)) {
        activeTools = [];
      }

      const modelUserMessage: PersistedConversationMessage = {
        role: "user",
        content: effectivePrompt,
        ...(effectivePromptAttachments && effectivePromptAttachments.length > 0
          ? { attachments: effectivePromptAttachments }
          : {}),
      };
      requestModelConversation = [
        ...this.modelConversationMessages,
        modelUserMessage,
      ];
      const history: NormalizedMessage[] = requestModelConversation.map(message => {
        if (message.role === "user") {
          return {
            role: "user" as const,
            content: message.content,
            ...(message.attachments && message.attachments.length > 0
              ? { attachments: message.attachments }
              : {}),
          };
        }

        return {
          role: "assistant" as const,
          content: message.content,
          ...(message.reasoningContent ? { reasoningContent: message.reasoningContent } : {}),
        };
      });
      const adapter = buildProviderAdapter(
        activeConfig,
        workspaceRoot,
        SYSTEM_PROMPT + workspaceNote + ELECTRON_SHELL_PROMPT_NOTE,
        envMap,
        activeRuntimeOptions,
      );
      const toolContext = activePromptRuntime.getToolContext("main");

      const { text: finalText, reasoningContent: finalReasoningContent } = await runAgent(history, {
        provider: adapter,
        tools: activeTools,
        toolContext,
        beforeToolCall: activeSessionInstalledSkillHooks.length > 0
          ? async (toolName, input, context) => {
              const result = await triggerHooks(
                "PreToolCall",
                activeSessionInstalledSkillHooks,
                {
                  workspaceRoot: context.workspaceRoot,
                  toolName,
                  toolInput: input,
                },
                installedSkillAgentRunner,
              );
              if (result.blocked) {
                throw new Error(
                  result.blockedMessage ??
                  `Installed skill hook blocked tool call: ${toolName}`,
                );
              }
              if (result.askMessage) {
                const approved = await toolContext.requestToolApproval?.({
                  kind: "tool_action",
                  toolName,
                  title: "Installed skill confirmation",
                  summary: result.askMessage,
                  inputPreview: JSON.stringify(input),
                });
                if (!approved) {
                  throw new Error(result.askMessage);
                }
                if (toolName === "run_command" && typeof input.command === "string") {
                  toolContext.allowDangerousCommandOnce?.(input.command, {
                    skipGenericApproval: true,
                  });
                }
              }
            }
          : undefined,
        afterToolCall: activeSessionInstalledSkillHooks.length > 0
          ? async (toolName, input, output, _isError, context) => {
              await triggerHooks(
                "PostToolCall",
                activeSessionInstalledSkillHooks,
                {
                  workspaceRoot: context.workspaceRoot,
                  toolName,
                  toolInput: input,
                  toolOutput: output,
                },
                installedSkillAgentRunner,
              );
            }
          : undefined,
        onToken: (token) => {
          const requestState = this.inFlightRequests.get(requestSessionId);
          if (!requestState) {
            return;
          }

          requestState.streamingText += token;
          if (this.isViewingSession(requestSessionId)) {
            this.streamingText = requestState.streamingText;
            this.sendToRenderer({
              type: "stateUpdate",
              isBusy: true,
              streamingText: this.streamingText,
            });
          }
        },
        onToolStart: (toolName, _input, _execId) => {
          this.sendToRenderer({ type: "tool:start", toolName });
        },
        onToolEnd: (_execId, summary, isError, content) => {
          this.sendToRenderer({ type: "tool:end", summary, isError });
        },
        abortSignal: abortController.signal,
      });

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: finalText,
        timestamp: Date.now(),
      };
      if (activeSessionInstalledSkillHooks.length > 0) {
        await triggerHooks(
          "PostPrompt",
          activeSessionInstalledSkillHooks,
          {
            workspaceRoot,
            prompt: effectivePrompt,
            reply: finalText,
          },
          installedSkillAgentRunner,
        );
      }
      await this.appendAssistantMessageToSession(requestSessionId, assistantMessage);
      const detectedArtifact = this.detectArtifactFromSessionMessage(
        requestSessionId,
        assistantMessage,
        this.sessionMessages.length - 1,
      );
      this.modelConversationMessages = [
        ...requestModelConversation,
        {
          role: "assistant",
          content: finalText,
          ...(finalReasoningContent ? { reasoningContent: finalReasoningContent } : {}),
        },
      ];
      if (detectedArtifact) {
        this.getArtifactRegistry(requestSessionId).push(detectedArtifact);
        await this.setArtifactPanelCollapsedState(requestSessionId, false);
      }
      await this.saveCurrentSessionRuntimeState(requestSessionId);
      if (detectedArtifact) {
        await this.postState();
      }
    } catch (err) {
      if (abortController.signal.aborted) return;
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: `错误：${err instanceof Error ? err.message : String(err)}`,
        kind: "error",
        timestamp: Date.now(),
      };
      await this.appendAssistantMessageToSession(requestSessionId, errorMessage);
      if (requestModelConversation) {
        this.modelConversationMessages = [
          ...requestModelConversation,
          { role: "assistant", content: errorMessage.content },
        ];
        await this.saveCurrentSessionRuntimeState(requestSessionId);
      }
    } finally {
      if (temporaryMcpRuntime) {
        const disposableRuntime = temporaryMcpRuntime as unknown as {
          dispose?: () => Promise<void>;
        };
        if (typeof disposableRuntime.dispose === "function") {
          await disposableRuntime.dispose.call(temporaryMcpRuntime).catch(() => undefined);
        }
      }
      this.inFlightRequests.delete(requestSessionId);
      this.streamingText = "";
      await this.postState();
    }
  }

  private getConversationKey(): string {
    return this.currentSessionId ?? "electron";
  }

  private getArtifactRegistry(sessionId: string): InMemoryArtifactRegistry {
    let registry = this.artifactRegistries.get(sessionId);
    if (!registry) {
      registry = new InMemoryArtifactRegistry();
      this.artifactRegistries.set(sessionId, registry);
    }

    return registry;
  }

  private buildArtifactRecordId(
    sessionId: string,
    message: ChatMessage,
    index: number,
  ): string {
    const stablePart =
      typeof message.timestamp === "number" ? String(message.timestamp) : `index-${index}`;
    return `artifact-${sessionId}-${stablePart}`;
  }

  private detectArtifactFromSessionMessage(
    sessionId: string,
    message: ChatMessage,
    index: number,
  ) {
    return detectArtifact(message.content, {
      id: this.buildArtifactRecordId(sessionId, message, index),
      now: message.timestamp,
      sourceMessageId: this.buildArtifactRecordId(sessionId, message, index),
    });
  }

  private restoreArtifactRegistryFromSessionMessages(
    sessionId: string,
    runtimeState: SessionRuntimeState,
  ): void {
    const registry = new InMemoryArtifactRegistry();

    this.sessionMessages.forEach((message, index) => {
      if (message.role !== "assistant") {
        return;
      }

      const artifact = this.detectArtifactFromSessionMessage(sessionId, message, index);
      if (artifact) {
        registry.push(artifact);
      }
    });

    if (registry.artifacts.length === 0) {
      this.artifactRegistries.delete(sessionId);
      return;
    }

    if (runtimeState.artifactPanel?.activeArtifactId === null) {
      registry.dismiss();
    } else if (typeof runtimeState.artifactPanel?.activeArtifactId === "string") {
      registry.setActive(runtimeState.artifactPanel.activeArtifactId);
    }

    this.artifactRegistries.set(sessionId, registry);
  }

  private findArtifactInCurrentSession(artifactId: string): {
    messageIndex: number;
    artifact: ReturnType<typeof detectArtifact>;
    message: ChatMessage;
  } | null {
    if (!this.currentSessionId) {
      return null;
    }

    for (let index = 0; index < this.sessionMessages.length; index += 1) {
      const message = this.sessionMessages[index];
      if (message?.role !== "assistant") {
        continue;
      }
      const artifact = this.detectArtifactFromSessionMessage(
        this.currentSessionId,
        message,
        index,
      );
      if (artifact?.id === artifactId) {
        return {
          messageIndex: index,
          artifact,
          message,
        };
      }
    }

    return null;
  }

  private findArtifactMessageInSession(
    sessionId: string,
    artifactRecordId: string,
  ): { messageIndex: number; message: ChatMessage } | null {
    for (let index = 0; index < this.sessionMessages.length; index += 1) {
      const message = this.sessionMessages[index];
      if (message?.role !== "assistant") {
        continue;
      }
      if (this.buildArtifactRecordId(sessionId, message, index) === artifactRecordId) {
        return {
          messageIndex: index,
          message,
        };
      }
    }

    return null;
  }

  private async updateMessageDesignProjectId(
    sessionId: string,
    messageIndex: number,
    projectId: string,
  ): Promise<void> {
    await this.sessions.updateMessageAt(sessionId, messageIndex, message => ({
      ...message,
      designProjectId: projectId,
    }));
    if (this.isViewingSession(sessionId) && this.sessionMessages[messageIndex]) {
      const nextMessages = [...this.sessionMessages];
      nextMessages[messageIndex] = {
        ...nextMessages[messageIndex]!,
        designProjectId: projectId,
      };
      this.sessionMessages = nextMessages;
    }
  }

  private async saveDesignArtifactToProject(options: {
    sessionId: string;
    messageIndex: number;
    artifactId: string;
    html: string;
    title: string;
    outputType: DesignOutputType;
  }): Promise<{ projectId: string; versionId: string }> {
    const project = await this.designProjectStore.createProject({
      name: (options.title || "设计作品").slice(0, 80),
      source: "artifact",
      sourceArtifactId: options.artifactId,
      activeVersionId: "pending-version",
    });

    const version = await this.designVersionStore.saveVersion({
      projectId: project.projectId,
      prompt: "",
      title: "生成",
      outputType: options.outputType,
      style: "",
      html: options.html,
      sliders: [],
      source: "generate",
    });

    await this.designProjectStore.updateProject(project.projectId, {
      activeVersionId: version.id,
      updatedAt: version.createdAt,
      lastOpenedAt: Date.now(),
    });
    await this.updateMessageDesignProjectId(
      options.sessionId,
      options.messageIndex,
      project.projectId,
    );
    this.sendToRenderer({
      type: "design:project-created",
      projectId: project.projectId,
      name: project.name,
      versionCount: 1,
      updatedAt: version.createdAt,
    });
    return { projectId: project.projectId, versionId: version.id };
  }

  private async handleEnterDesignFromArtifact(message: Record<string, unknown>): Promise<void> {
    const artifactId = String(message.artifactId ?? "").trim();
    if (!artifactId || !this.currentSessionId) {
      return;
    }

    const found = this.findArtifactInCurrentSession(artifactId);
    if (!found || !found.artifact || found.artifact.type !== "html") {
      return;
    }

    const existingProject = await this.designProjectStore.getProjectBySourceArtifactId(artifactId);
    if (existingProject) {
      await this.openMidtai({
        contentType: "design",
        view: "preview",
        projectId: existingProject.projectId,
        artifactId,
      });
      return;
    }

    const saved = await this.saveDesignArtifactToProject({
      sessionId: this.currentSessionId,
      messageIndex: found.messageIndex,
      artifactId,
      html: found.artifact.content,
      title: found.artifact.title || "设计作品",
      outputType: "prototype",
    });

    await this.postState();
    await this.openMidtai({
      contentType: "design",
      view: "preview",
      projectId: saved.projectId,
      artifactId,
    });
  }

  private async getActiveDesignVersionForArtifact(message: Record<string, unknown>): Promise<void> {
    const projectId = String(message.projectId ?? "").trim();
    if (!projectId) {
      return;
    }

    const project = await this.designProjectStore.getProject(projectId);
    if (!project) {
      this.sendToRenderer({
        type: "design:active-version",
        projectId,
        deleted: true,
      });
      return;
    }

    const html = await this.designVersionStore.getVersionHtml(project.activeVersionId);
    this.sendToRenderer({
      type: "design:active-version",
      projectId,
      ...(html ? { html } : { deleted: true }),
    });
  }

  private async buildArtifactStatePayload(
    sessionId: string,
    runtimeState: SessionRuntimeState | null,
  ): Promise<{
    activeArtifact: ArtifactObject | (ArtifactObject & { designProjectId?: string; deleted?: boolean }) | null;
    activeArtifactId: string | null;
    artifactCount: number;
    artifacts: Array<{ id: string; title: string; type: string }>;
    artifactPanelCollapsed: boolean;
  }> {
    const currentArtifactRegistry = this.artifactRegistries.get(sessionId) ?? null;
    const activeArtifact = currentArtifactRegistry?.activeArtifact ?? null;
    if (!activeArtifact) {
      return {
        activeArtifact: null,
        activeArtifactId: null,
        artifactCount: currentArtifactRegistry?.artifacts.length ?? 0,
        artifacts:
          currentArtifactRegistry?.artifacts.map(artifact => ({
            id: artifact.id,
            title: artifact.title || "Artifact",
            type: artifact.type,
          })) ?? [],
        artifactPanelCollapsed: runtimeState?.artifactPanel?.collapsed ?? false,
      };
    }

    const artifactRecordId = activeArtifact.sourceMessageId ?? activeArtifact.id;
    const binding = this.findArtifactMessageInSession(sessionId, artifactRecordId);
    const designProjectId = binding?.message.designProjectId?.trim();

    let resolvedActiveArtifact: ArtifactObject | (ArtifactObject & { designProjectId?: string; deleted?: boolean }) = activeArtifact;
    if (designProjectId) {
      const project = await this.designProjectStore.getProject(designProjectId);
      if (!project) {
        resolvedActiveArtifact = {
          ...activeArtifact,
          designProjectId,
          deleted: true,
        };
      } else {
        const latestHtml = await this.designVersionStore.getVersionHtml(project.activeVersionId);
        resolvedActiveArtifact = {
          ...activeArtifact,
          ...(latestHtml ? { content: latestHtml } : {}),
          title: project.name || activeArtifact.title,
          designProjectId,
        };
      }
    }

    return {
      activeArtifact: resolvedActiveArtifact,
      activeArtifactId: activeArtifact.id,
      artifactCount: currentArtifactRegistry?.artifacts.length ?? 0,
      artifacts:
        currentArtifactRegistry?.artifacts.map(artifact => ({
          id: artifact.id,
          title: artifact.title || "Artifact",
          type: artifact.type,
        })) ?? [],
      artifactPanelCollapsed: runtimeState?.artifactPanel?.collapsed ?? false,
    };
  }

  private getPendingInteraction(): unknown {
    return this.pendingQuestion?.request ?? this.host.getPendingApproval();
  }

  private async getCurrentDesignProject(): Promise<DesignProjectRecord | null> {
    if (!this.currentDesignProjectId) {
      return null;
    }
    return this.designProjectStore.getProject(this.currentDesignProjectId);
  }

  private buildDesignProjectBindingMissingPayload(): {
    success: false;
    code: typeof DESIGN_PROJECT_BINDING_MISSING_CODE;
    recoverable: true;
    message: typeof DESIGN_PROJECT_BINDING_MISSING_MESSAGE;
  } {
    return {
      success: false,
      code: DESIGN_PROJECT_BINDING_MISSING_CODE,
      recoverable: true,
      message: DESIGN_PROJECT_BINDING_MISSING_MESSAGE,
    };
  }

  private isDesignProjectBindingMissingError(error: unknown): error is DesignProjectBindingMissingError {
    return (
      error instanceof DesignProjectBindingMissingError ||
      (
        error instanceof Error &&
        error.message === DESIGN_PROJECT_BINDING_MISSING_MESSAGE
      )
    );
  }

  private sendDesignError(error: unknown): void {
    if (this.isDesignProjectBindingMissingError(error)) {
      this.sendToRenderer({
        type: "design:error",
        ...this.buildDesignProjectBindingMissingPayload(),
      });
      return;
    }
    this.sendToRenderer({
      type: "design:error",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  private sendPatchImageNodeError(error: unknown): void {
    if (this.isDesignProjectBindingMissingError(error)) {
      this.sendToRenderer({
        type: "design:patchImageNode:result",
        payload: this.buildDesignProjectBindingMissingPayload(),
      });
      return;
    }
    this.sendToRenderer({
      type: "design:patchImageNode:result",
      payload: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }

  private async requireActiveDesignProjectBinding(
    requestedProjectId?: string,
  ): Promise<DesignProjectRecord> {
    const normalizedProjectId = typeof requestedProjectId === "string"
      ? requestedProjectId.trim()
      : "";
    const project = normalizedProjectId
      ? await this.designProjectStore.getProject(normalizedProjectId)
      : await this.getCurrentDesignProject();
    if (!project) {
      throw new DesignProjectBindingMissingError();
    }
    return project;
  }

  private async setCurrentDesignProject(project: DesignProjectRecord | null): Promise<void> {
    this.currentDesignProjectId = project?.projectId;
    if (project?.projectId) {
      await this.designProjectStore.setLastOpenedProjectId(project.projectId);
    }
  }

  private async openDesignProject(projectId: string): Promise<DesignProjectRecord | null> {
    const existing = await this.designProjectStore.getProject(projectId);
    if (!existing) {
      return null;
    }

    const updated = await this.designProjectStore.updateProject(projectId, {
      lastOpenedAt: Date.now(),
    });
    await this.setCurrentDesignProject(updated ?? existing);
    return updated ?? existing;
  }

  private async listDesignProjects(): Promise<void> {
    const projects = await this.designProjectStore.listProjects();
    this.sendToRenderer({
      type: "design:projects",
      projects,
    });
    await this.postMidtaiLibrary();
  }

  private async createDesignProject(message: Record<string, unknown>): Promise<void> {
    await this.setCurrentDesignProject(null);
    this.sendToRenderer({
      type: "design:projectOpened",
      project: {
        projectId: null,
        name: typeof message.name === "string" && message.name.trim()
          ? message.name.trim()
          : "Untitled Design",
        source: "blank",
        activeVersionId: null,
      },
      activeVersion: null,
    });
  }

  private async getLastDesignProject(): Promise<void> {
    const projectId = await this.designProjectStore.getLastOpenedProjectId();
    if (!projectId) {
      this.sendToRenderer({
        type: "design:projectOpened",
        project: null,
        activeVersion: null,
      });
      return;
    }

    const project = await this.openDesignProject(projectId);
    if (!project) {
      this.sendToRenderer({
        type: "design:projectOpened",
        project: null,
        activeVersion: null,
      });
      return;
    }
    const activeVersion = project?.activeVersionId && project.activeVersionId !== "pending-version"
      ? await this.designVersionStore.getVersion(project.activeVersionId)
      : null;
    this.sendToRenderer({
      type: "design:projectOpened",
      project,
      activeVersion,
    });
  }

  private async deleteDesignProject(message: Record<string, unknown>): Promise<void> {
    const projectId = typeof message.projectId === "string" ? message.projectId.trim() : "";
    if (!projectId) {
      return;
    }

    await this.designVersionStore.deleteByProjectId(projectId);
    await this.designProjectStore.deleteProject(projectId);

    if (this.currentDesignProjectId === projectId) {
      await this.setCurrentDesignProject(null);
      this.sendToRenderer({
        type: "design:projectOpened",
        project: null,
        activeVersion: null,
      });
    }

    await this.listDesignProjects();
  }

  private async renameDesignProject(message: Record<string, unknown>): Promise<void> {
    const projectId = typeof message.projectId === "string" ? message.projectId.trim() : "";
    const newName = typeof message.newName === "string" ? message.newName.trim() : "";
    if (!projectId || !newName) {
      return;
    }

    const project = await this.designProjectStore.renameProject(projectId, newName);
    if (!project) {
      return;
    }

    if (this.currentDesignProjectId === projectId) {
      const activeVersion = project.activeVersionId && project.activeVersionId !== "pending-version"
        ? await this.designVersionStore.getVersion(project.activeVersionId)
        : null;
      this.sendToRenderer({
        type: "design:projectOpened",
        project,
        activeVersion,
      });
    }

    await this.listDesignProjects();
  }

  private async openActiveArtifactInKainClawDesign(): Promise<void> {
    if (!this.currentSessionId) {
      this.sendToRenderer({
        type: "kainclawDesign:error",
        message: "当前还没有会话内容可供带入 KainClaw Design。",
      });
      return;
    }

    const activeArtifact =
      this.artifactRegistries.get(this.currentSessionId)?.activeArtifact ?? null;
    if (!activeArtifact || activeArtifact.type !== "html") {
      this.sendToRenderer({
        type: "kainclawDesign:error",
        message: "请先选中一个 HTML Artifact，再进入 KainClaw Design。",
      });
      return;
    }

    const existingProject = await this.designProjectStore.getProjectBySourceArtifactId(
      activeArtifact.id,
    );
    if (existingProject) {
      const openedProject = await this.openDesignProject(existingProject.projectId);
      if (openedProject) {
        await this.openMidtai({
          contentType: "design",
          view: "preview",
          projectId: openedProject.projectId,
          artifactId: activeArtifact.id,
        });
        return;
      }
    }

    let project = existingProject ?? await this.designProjectStore.createProject({
      name: activeArtifact.title || "Untitled Design",
      source: "artifact",
      sourceArtifactId: activeArtifact.id,
      activeVersionId: "pending-version",
    });
    await this.setCurrentDesignProject(project);

    // Save the artifact HTML as v1 so it appears in version history
    if (!project.activeVersionId || project.activeVersionId === "pending-version") {
      const initialVersion = await this.designVersionStore.saveVersion({
        projectId: project.projectId,
        prompt: activeArtifact.title || "",
        title: "生成",
        outputType: "prototype",
        style: "",
        html: activeArtifact.content,
        sliders: [],
        sliderValues: {},
        source: "generate",
      });
      const updated = await this.designProjectStore.updateProject(project.projectId, {
        activeVersionId: initialVersion.id,
        updatedAt: initialVersion.createdAt,
        lastOpenedAt: Date.now(),
      });
      project = updated ?? project;
      await this.setCurrentDesignProject(project);
    }

    await this.openMidtai({
      contentType: "design",
      view: "preview",
      projectId: project.projectId,
      artifactId: activeArtifact.id,
    });
  }

  private async openMidtai(payload?: MidtaiOpenPayload): Promise<void> {
    const nextPayload: MidtaiOpenPayload = {
      contentType: payload?.contentType === "design" ? "design" : "img",
      ...(payload?.view === "works" || payload?.view === "plib" || payload?.view === "preview"
        ? { view: payload.view }
        : {}),
      ...(typeof payload?.projectId === "string" && payload.projectId.trim()
        ? { projectId: payload.projectId.trim() }
        : {}),
      ...(typeof payload?.artifactId === "string" && payload.artifactId.trim()
        ? { artifactId: payload.artifactId.trim() }
        : {}),
      ...(payload?.designChat ? { designChat: true } : {}),
      ...(payload?.sessionType === "design" || payload?.sessionType === "default"
        ? { sessionType: payload.sessionType }
        : {}),
      ...(payload?.replaceCtx
        ? {
            replaceCtx: {
              project: String(payload.replaceCtx.project || "").trim(),
              element: String(payload.replaceCtx.element || "").trim(),
              ...(typeof payload.replaceCtx.inferredRatio === "string" && payload.replaceCtx.inferredRatio.trim()
                ? { inferredRatio: payload.replaceCtx.inferredRatio.trim() }
                : {}),
            },
          }
        : { replaceCtx: null }),
    };

    if (nextPayload.projectId && nextPayload.contentType === "design") {
      const project = await this.openDesignProject(nextPayload.projectId);
      const activeVersion = project?.activeVersionId && project.activeVersionId !== "pending-version"
        ? await this.designVersionStore.getVersion(project.activeVersionId)
        : null;
      this.sendToRenderer({
        type: "midtai:open",
        payload: {
          ...nextPayload,
          ...(project
            ? {
                project: {
                  projectId: project.projectId,
                  name: project.name,
                  source: project.source,
                  activeVersionId: project.activeVersionId,
                },
              }
            : {}),
          ...(activeVersion ? { activeVersion } : {}),
        },
      });
      return;
    }

    if (nextPayload.artifactId && nextPayload.contentType === "design") {
      const artifact = this.currentSessionId
        ? (this.artifactRegistries.get(this.currentSessionId)?.artifacts.find(entry => entry.id === nextPayload.artifactId) ?? null)
        : null;
      this.sendToRenderer({
        type: "midtai:open",
        payload: {
          ...nextPayload,
          ...(artifact
            ? {
                artifact: {
                  id: artifact.id,
                  title: artifact.title,
                  type: artifact.type,
                  content: artifact.content,
                },
              }
            : {}),
        },
      });
      return;
    }

    this.sendToRenderer({
      type: "midtai:open",
      payload: nextPayload,
    });
  }

  private async generateDesignWorkbench(
    message: Record<string, unknown>,
  ): Promise<void> {
    const prompt = String(message.prompt ?? "").trim();
    if (!prompt) {
      this.sendToRenderer({
        type: "design:error",
        message: "请输入设计需求后再生成。",
      });
      return;
    }

    const outputType = normalizeDesignOutputType(message.outputType);
    const style = typeof message.style === "string" ? message.style.trim() : "";
    const userContext =
      typeof message.userContext === "string" ? message.userContext.trim() : "";
    const brandContext =
      typeof message.brandContext === "string" ? message.brandContext.trim() : "";
    const referenceImageDataUrl =
      typeof message.referenceImageDataUrl === "string" &&
        message.referenceImageDataUrl.trim()
        ? message.referenceImageDataUrl.trim()
        : undefined;
    const referenceImageMimeType =
      typeof message.referenceImageMimeType === "string" &&
        message.referenceImageMimeType.trim()
        ? message.referenceImageMimeType.trim()
        : undefined;
    const requestedProjectId =
      typeof message.projectId === "string" && message.projectId.trim()
        ? message.projectId.trim()
        : undefined;
    const workspaceRoot = this.getSelectedWorkspaceRoot();
      const { config, envMap } = await resolveProviderConfig(
        this.settings,
        workspaceRoot,
      );
      const provider = this.createProviderForSystemPrompt(
        config,
        workspaceRoot,
        envMap,
        buildKainClawDesignSystemPrompt({
          selectedDirection: style ? getDirectionByStylePrompt(style) : undefined,
        }),
      );

    this.sendToRenderer({ type: "design:progress", step: "generating" });
    let tokenCount = 0;

    try {
      const result = await generateKainClawDesign(provider, {
        prompt,
        outputType,
        ...(style ? { style } : {}),
        ...(userContext ? { userContext } : {}),
        ...(brandContext ? { brandContext } : {}),
        ...(referenceImageDataUrl ? { referenceImageDataUrl } : {}),
        ...(referenceImageMimeType ? { referenceImageMimeType } : {}),
        onToken: (token: string) => {
          tokenCount += token.length;
          this.sendToRenderer({ type: "design:token", count: tokenCount });
        },
      } as DesignGenerateOptions);
      const activeArtifact =
        this.currentSessionId
          ? this.artifactRegistries.get(this.currentSessionId)?.activeArtifact ?? null
          : null;
      const version = await this.saveDesignVersion({
        prompt,
        outputType,
        ...(style ? { style } : {}),
        html: result.html,
        sliders: result.sliders,
        source: "generate",
        ...(requestedProjectId ? { projectId: requestedProjectId } : {}),
        ...(activeArtifact?.type === "html" ? { sourceArtifactId: activeArtifact.id } : {}),
      });

      this.sendToRenderer({
        type: "design:result",
        html: result.html,
        sliders: result.sliders,
        prompt,
        outputType,
        ...(style ? { style } : {}),
        versionId: version.id,
      });
      void this.runDesignCritique(result.html, prompt, outputType);
    } catch (error) {
      this.sendToRenderer({
        type: "design:error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async runDesignCritique(
    html: string,
    prompt: string,
    outputType: string,
  ): Promise<void> {
    this.sendToRenderer({ type: "design:critiqueStarted" });
    const workspaceRoot = this.getSelectedWorkspaceRoot();
    const { config, envMap } = await resolveProviderConfig(
      this.settings,
      workspaceRoot,
    );
    const provider = this.createProviderForSystemPrompt(
      config,
      workspaceRoot,
      envMap,
      DESIGN_CRITIQUE_SYSTEM_PROMPT,
    );

    try {
      const userPrompt = `
设计需求：${prompt}
输出类型：${outputType}

以下是生成的 HTML 设计稿（截取前 8000 字符）：
\`\`\`html
${html.slice(0, 8000)}
\`\`\`

请按五个维度评审，返回 JSON。
`.trim();

      const critiqueRun = await runAgent(
        [
          {
            role: "user",
            content: userPrompt,
          },
        ],
        {
          provider,
          tools: [],
          toolContext: {
            workspaceRoot,
          } as never,
        },
      );
      const critique = extractJsonFromText(critiqueRun.text);
      if (critique) {
        this.sendToRenderer({ type: "design:critiqueResult", critique });
        return;
      }
      this.sendToRenderer({ type: "design:critiqueError" });
    } catch {
      this.sendToRenderer({ type: "design:critiqueError" });
    }
  }

  private async editCurrentDesignWorkbench(
    message: Record<string, unknown>,
  ): Promise<void> {
    const prompt = String(message.prompt ?? "").trim();
    const currentHtml = String(message.html ?? "").trim();
    const requestedProjectId =
      typeof message.projectId === "string" && message.projectId.trim()
        ? message.projectId.trim()
        : undefined;
    if (!prompt) {
      this.sendToRenderer({
        type: "design:error",
        message: "请输入要应用到当前页面的修改要求。",
      });
      return;
    }
    if (!currentHtml) {
      await this.generateDesignWorkbench(message);
      return;
    }

    const outputType = normalizeDesignOutputType(message.outputType);
    const style = typeof message.style === "string" ? message.style.trim() : "";
    const referenceImageDataUrl =
      typeof message.referenceImageDataUrl === "string" &&
        message.referenceImageDataUrl.trim()
        ? message.referenceImageDataUrl.trim()
        : undefined;
    const referenceImageMimeType =
      typeof message.referenceImageMimeType === "string" &&
        message.referenceImageMimeType.trim()
        ? message.referenceImageMimeType.trim()
        : undefined;
    try {
      await this.requireActiveDesignProjectBinding(requestedProjectId);
    } catch (error) {
      this.sendDesignError(error);
      return;
    }

    const workspaceRoot = this.getSelectedWorkspaceRoot();
    const { config, envMap } = await resolveProviderConfig(
      this.settings,
      workspaceRoot,
    );
    const provider = this.createProviderForSystemPrompt(
      config,
      workspaceRoot,
      envMap,
      buildKainClawDesignSystemPrompt({
        customInstructions: [
          "You are editing an existing HTML design, not creating a different unrelated page.",
          "Preserve the current page structure when possible and apply the user's changes onto the existing layout.",
          "If the user asks for a new visual direction, reinterpret the current page rather than discarding it.",
          "",
          "Current HTML to revise:",
          currentHtml,
        ].join("\n"),
      }),
    );

    this.sendToRenderer({ type: "design:progress", step: "editing-current" });
    let tokenCount = 0;

    try {
      const result = await generateKainClawDesign(provider, {
        prompt,
        outputType,
        ...(style ? { style } : {}),
        ...(referenceImageDataUrl ? { referenceImageDataUrl } : {}),
        ...(referenceImageMimeType ? { referenceImageMimeType } : {}),
        onToken: (token: string) => {
          tokenCount += token.length;
          this.sendToRenderer({ type: "design:token", count: tokenCount });
        },
      } as DesignGenerateOptions);
      const version = await this.saveDesignVersion({
        prompt,
        outputType,
        ...(style ? { style } : {}),
        html: result.html,
        sliders: result.sliders,
        source: "editCurrent",
        ...(requestedProjectId ? { projectId: requestedProjectId } : {}),
      });

      this.sendToRenderer({
        type: "design:result",
        html: result.html,
        sliders: result.sliders,
        prompt,
        outputType,
        ...(style ? { style } : {}),
        versionId: version.id,
      });
    } catch (error) {
      this.sendDesignError(error);
    }
  }

  private async requestDesignDirections(
    message: Record<string, unknown>,
  ): Promise<void> {
    const prompt = String(message.prompt ?? "").trim();
    const outputType = normalizeDesignOutputType(message.outputType);

    if (!prompt || !isAmbiguousDesignPrompt(prompt)) {
      await this.generateDesignWorkbench(message);
      return;
    }

    this.sendToRenderer({
      type: "design:directions",
      suggestions: getDesignDirectionSuggestions(outputType),
    });
  }

  private async patchDesignWorkbench(
    message: Record<string, unknown>,
  ): Promise<void> {
    const requestedProjectId =
      typeof message.projectId === "string" && message.projectId.trim()
        ? message.projectId.trim()
        : undefined;
    const html = String(message.html ?? "").trim();
    const selector = String(message.selector ?? "").trim();
    const comment = String(message.comment ?? "").trim();
    const targetOuterHtml = String(message.targetOuterHtml ?? "").trim();

    if (!html || !selector || !comment || !targetOuterHtml) {
      this.sendToRenderer({
        type: "design:error",
        message: "设计局部改写缺少必要信息。",
      });
      return;
    }
    try {
      await this.requireActiveDesignProjectBinding(requestedProjectId);
    } catch (error) {
      this.sendDesignError(error);
      return;
    }

    const workspaceRoot = this.getSelectedWorkspaceRoot();
      const { config, envMap } = await resolveProviderConfig(
        this.settings,
        workspaceRoot,
      );
      const provider = this.createProviderForSystemPrompt(
        config,
        workspaceRoot,
        envMap,
        buildKainClawDesignPatchSystemPrompt(),
      );

    this.sendToRenderer({ type: "design:progress", step: "patching" });

    try {
      const directTextReplacement = extractDirectTextReplacement(comment);
      if (directTextReplacement) {
        const nextHtml = patchDesignTextNode({
          html,
          selector,
          targetOuterHtml,
          nextText: directTextReplacement,
        });
        const version = await this.saveDesignVersion({
          ...(typeof message.prompt === "string" ? { prompt: String(message.prompt) } : {}),
          outputType: normalizeDesignOutputType(message.outputType),
          ...(typeof message.style === "string" ? { style: String(message.style) } : {}),
          html: nextHtml,
          sliders: Array.isArray(message.sliders) ? message.sliders : [],
          source: "patch",
          ...(requestedProjectId ? { projectId: requestedProjectId } : {}),
        });

        this.sendToRenderer({
          type: "design:patchResult",
          html: nextHtml,
          selector,
          replacementNode: targetOuterHtml,
          versionId: version.id,
        });
        return;
      }

      let patchTokenCount = 0;
      const result = await patchKainClawDesignNode({
        provider,
        html,
        selector,
        comment,
        targetOuterHtml,
        onToken: (token: string) => {
          patchTokenCount += token.length;
          this.sendToRenderer({
            type: "design:patchToken",
            count: patchTokenCount,
          });
        },
      });
      console.debug("[KC-DEBUG] design patch model result", {
        selector,
        comment,
        targetOuterHtmlPreview: targetOuterHtml.slice(0, 240),
        replacementNodePreview: result.replacementNode.slice(0, 240),
        rawOutputPreview: result.rawOutput.slice(0, 400),
        htmlChanged: result.html !== html,
      });
      const version = await this.saveDesignVersion({
        ...(typeof message.prompt === "string" ? { prompt: String(message.prompt) } : {}),
        outputType: normalizeDesignOutputType(message.outputType),
        ...(typeof message.style === "string" ? { style: String(message.style) } : {}),
        html: result.html,
        sliders: Array.isArray(message.sliders) ? message.sliders : [],
        source: "patch",
        ...(requestedProjectId ? { projectId: requestedProjectId } : {}),
      });

      this.sendToRenderer({
        type: "design:patchResult",
        html: result.html,
        selector,
        replacementNode: result.replacementNode,
        versionId: version.id,
      });
    } catch (error) {
      console.debug("[KC-DEBUG] design patch failed", {
        selector,
        comment,
        targetOuterHtmlPreview: targetOuterHtml.slice(0, 240),
        error: error instanceof Error ? error.message : String(error),
      });
      this.sendDesignError(error);
    }
  }

  private async patchDesignImageNode(
    message: Record<string, unknown>,
  ): Promise<void> {
    const projectId = String(message.projectId ?? "").trim();
    const selector = String(message.elementSelector ?? "").trim();
    const imageUrl = String(message.imageUrl ?? "").trim();
    const targetOuterHtml = String(message.targetOuterHtml ?? "").trim();

    if (!projectId) {
      this.sendPatchImageNodeError(new DesignProjectBindingMissingError());
      return;
    }
    if (!selector || !imageUrl || !targetOuterHtml) {
      this.sendToRenderer({
        type: "design:patchImageNode:result",
        payload: {
          success: false,
          error: "Missing selector, imageUrl, or targetOuterHtml.",
        },
      });
      return;
    }

    try {
      const project = await this.requireActiveDesignProjectBinding(projectId);
      if (!project?.activeVersionId || project.activeVersionId === "pending-version") {
        throw new Error("No active design version is available for image replacement.");
      }

      const version = await this.designVersionStore.getVersion(project.activeVersionId);
      if (!version) {
        throw new Error("Active design version could not be loaded.");
      }

      const html = patchDesignImageNode({
        html: version.html ?? "",
        selector,
        targetOuterHtml,
        imageUrl,
      });

      const nextVersion = await this.saveDesignVersion({
        prompt: version.prompt,
        outputType: version.outputType,
        style: version.style,
        html,
        sliders: version.sliders,
        source: "patch",
        projectId,
        baseVersionId: version.id,
      });

      this.sendToRenderer({
        type: "design:patchResult",
        html,
        selector,
        replacementNode: targetOuterHtml,
        versionId: nextVersion.id,
      });
      this.sendToRenderer({
        type: "design:patchImageNode:result",
        payload: {
          success: true,
          projectId,
          selector,
          versionId: nextVersion.id,
        },
      });
    } catch (error) {
      this.sendPatchImageNodeError(error);
    }
  }

  private async saveDesignVersion(options: {
    prompt?: string;
    outputType?: DesignOutputType;
    style?: string;
    html: string;
    sliders: unknown[];
    source: "generate" | "patch" | "editCurrent" | "restore";
    projectId?: string;
    sourceArtifactId?: string;
    baseVersionId?: string;
  }): Promise<DesignVersionRecord> {
    await this.ensureSession();
    let project = options.projectId
      ? await this.designProjectStore.getProject(options.projectId)
      : await this.getCurrentDesignProject();
    if (!project) {
      if (
        options.source === "patch" ||
        options.source === "editCurrent" ||
        options.source === "restore"
      ) {
        throw new DesignProjectBindingMissingError();
      }
      project = await this.designProjectStore.createProject({
        name: (options.prompt?.trim() || "KainClaw Design").slice(0, 80),
        source: options.sourceArtifactId ? "artifact" : "blank",
        ...(options.sourceArtifactId ? { sourceArtifactId: options.sourceArtifactId } : {}),
        activeVersionId: "pending-version",
      });
      await this.setCurrentDesignProject(project);
    }

    const titleMap: Record<DesignVersionRecord["source"], string> = {
      generate: "生成",
      patch: "改写元素",
      editCurrent: "编辑",
      restore: "恢复版本",
    };
    const title = titleMap[options.source] ?? "";

    const version = await this.designVersionStore.saveVersion({
      projectId: project.projectId,
      ...(options.baseVersionId ? { baseVersionId: options.baseVersionId } : {}),
      prompt: options.prompt?.trim() || "",
      title,
      outputType: options.outputType ?? "prototype",
      style: options.style?.trim() || "",
      html: options.html,
      sliders: Array.isArray(options.sliders) ? options.sliders as DesignVersionRecord["sliders"] : [],
      sliderValues: {},
      source: options.source,
    });

    const updatedProject = await this.designProjectStore.updateProject(project.projectId, {
      activeVersionId: version.id,
      updatedAt: version.createdAt,
      lastOpenedAt: Date.now(),
      ...(options.prompt?.trim() ? { name: options.prompt.trim().slice(0, 80) } : {}),
    });
    const captureProject = updatedProject ?? project;
    await this.setCurrentDesignProject(captureProject);
    if (this.currentDesignFlowState && this.currentDesignFlowState.projectId === captureProject.projectId) {
      this.currentDesignFlowState = {
        ...this.currentDesignFlowState,
        projectId: captureProject.projectId,
      };
    }

    // Async thumbnail capture — doesn't block the response
    void captureDesignThumbnail(options.html)
      .then(thumbnail => this.designProjectStore.saveThumbnail(captureProject.projectId, thumbnail))
      .catch(() => { /* non-critical */ });

    return version;
  }

  private async loadDesignVersions(message: Record<string, unknown>): Promise<void> {
    await this.ensureSession();
    const requestedProjectId = typeof message.projectId === "string" ? message.projectId.trim() : "";
    const projectId = requestedProjectId || this.currentDesignProjectId || "design-default";
    const versions = await this.designVersionStore.listVersions(projectId);
    this.sendToRenderer({
      type: "design:versions",
      versions,
    });
  }

  private async restoreDesignVersion(message: Record<string, unknown>): Promise<void> {
    const versionId = typeof message.versionId === "string" ? message.versionId.trim() : "";
    if (!versionId) {
      this.sendToRenderer({
        type: "design:error",
        message: "缺少要恢复的版本 ID。",
      });
      return;
    }

    const version = await this.designVersionStore.getVersion(versionId);
    if (!version) {
      this.sendToRenderer({
        type: "design:error",
        message: "未找到指定的设计版本。",
      });
      return;
    }

    this.sendToRenderer({
      type: "design:result",
      html: version.html,
      sliders: version.sliders,
      prompt: version.prompt ?? "",
      outputType: version.outputType ?? "prototype",
      ...(version.style ? { style: version.style } : {}),
      versionId: version.id,
      projectId: version.projectId,
      activeVersionId: version.id,
    });

    await this.openDesignProject(version.projectId);
    if (this.currentDesignProjectId) {
      await this.designProjectStore.updateProject(this.currentDesignProjectId, {
        activeVersionId: version.id,
        updatedAt: Date.now(),
        lastOpenedAt: Date.now(),
      });
    }
  }

  private async exportDesignWorkbench(message: Record<string, unknown>): Promise<void> {
    const html = typeof message.html === "string" ? message.html : "";
    const sliders = Array.isArray(message.sliders) ? message.sliders : [];
    const format: DesignExportFormat = message.format === "pdf" ? "pdf" : "html";
    const projectLabel = typeof message.projectLabel === "string" ? message.projectLabel : "kainclaw-design";

    if (!html.trim()) {
      this.sendToRenderer({
        type: "design:error",
        message: "当前没有可导出的设计内容。",
      });
      return;
    }

    try {
      const pathToOpen = await exportDesignHtml({
        storageRoot: this.host.getStorageUri(),
        html,
        sliders: sliders as DesignVersionRecord["sliders"],
        projectLabel,
      });

      this.sendToRenderer({
        type: "design:exportDone",
        format,
        filePath: pathToOpen,
      });
    } catch (error) {
      this.sendToRenderer({
        type: "design:error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }


  private async requestUserQuestion(
    request: AskUserQuestionRequest,
  ): Promise<AskUserQuestionResponse | null> {
    if (this.pendingQuestion || this.host.getPendingApproval()) {
      throw new Error("Another user interaction is already pending.");
    }

    const nextRequest = {
      ...request,
      id: request.id ?? randomUUID(),
    };
    const response = await new Promise<AskUserQuestionResponse | null>(resolve => {
      this.pendingQuestion = {
        request: nextRequest,
        resolve,
      };
      void this.postState();
    });
    return response;
  }

  private resolvePendingQuestion(response: AskUserQuestionResponse | null): void {
    const pending = this.pendingQuestion;
    this.pendingQuestion = undefined;
    void this.postState();
    pending?.resolve(response);
  }

  private getCurrentSessionInstalledSkillHooks(): HookDefinition[] {
    return getSessionInstalledSkillHooks(
      this.sessionInstalledSkillHooks,
      this.getConversationKey(),
    );
  }

  private registerCurrentSessionInstalledSkillHooks(
    hooks: HookDefinition[],
  ): HookDefinition[] {
    return registerSessionInstalledSkillHooks(
      this.sessionInstalledSkillHooks,
      this.getConversationKey(),
      hooks,
    );
  }

  private unregisterCurrentSessionInstalledSkillHooks(
    predicate: (hook: HookDefinition) => boolean,
  ): HookDefinition[] {
    const key = this.getConversationKey();
    const remaining = this.getCurrentSessionInstalledSkillHooks().filter(
      hook => !predicate(hook),
    );
    if (remaining.length === 0) {
      clearSessionInstalledSkillHooks(this.sessionInstalledSkillHooks, key);
      return [];
    }
    this.sessionInstalledSkillHooks.set(key, remaining);
    return remaining;
  }

  private async tryHandleInstalledSkillCompat(options: {
    sessionId: string;
    prompt: string;
    workspaceRoot: string;
  }): Promise<boolean> {
    const trimmedPrompt = options.prompt.trim();
    const parsedCommand = parsePromptSlashCommand(trimmedPrompt);
    const installedSkills = await loadInstalledSkills(options.workspaceRoot);

    if (parsedCommand) {
      const installedSkill = getInstalledSkillByEntrypoint(
        installedSkills,
        parsedCommand.name,
      );
      if (installedSkill?.id === "freeze") {
        if (parsedCommand.args.trim()) {
          await this.applyFreezeBoundary({
            sessionId: options.sessionId,
            workspaceRoot: options.workspaceRoot,
            rawPath: parsedCommand.args,
            hooks: installedSkill.hooks,
          });
        } else {
          const workspaceLabel = path.basename(options.workspaceRoot) || options.workspaceRoot;
          const parentRoot = path.dirname(options.workspaceRoot);
          const parentLabel = path.basename(parentRoot) || parentRoot;
          const freezeQuestionCopy = buildFreezeQuestionCopy(this.settings.getLanguage(), {
            workspaceRoot: options.workspaceRoot,
            parentRoot,
            workspaceLabel,
            parentLabel,
          });
          const questionResponse = await this.requestUserQuestion({
            kind: "question",
            title: freezeQuestionCopy.title,
            questions: [
              {
                header: freezeQuestionCopy.header,
                question: freezeQuestionCopy.question,
                options: [
                  freezeQuestionCopy.workspaceOption,
                  freezeQuestionCopy.parentOption,
                ],
              },
            ],
          });
          if (!questionResponse) {
            await this.appendAssistantMessageToSession(options.sessionId, {
              role: "assistant",
              content: freezeQuestionCopy.cancelledMessage,
              timestamp: Date.now(),
            });
            return true;
          }

          const selected =
            questionResponse.answers[
              freezeQuestionCopy.question
            ]?.trim() ?? "";
          const rawPath =
            selected === workspaceLabel
              ? options.workspaceRoot
              : selected === parentLabel
                ? parentRoot
                : selected;
          await this.applyFreezeBoundary({
            sessionId: options.sessionId,
            workspaceRoot: options.workspaceRoot,
            rawPath,
            hooks: installedSkill.hooks,
          });
        }
        return true;
      }

      if (installedSkill?.id === "unfreeze") {
        await clearFreezeBoundary();
        this.unregisterCurrentSessionInstalledSkillHooks(
          hook => hook.name.startsWith("freeze:"),
        );
        await this.appendAssistantMessageToSession(options.sessionId, {
          role: "assistant",
          content:
            "Freeze boundary cleared. Edits are no longer restricted to a single directory.",
          timestamp: Date.now(),
        });
        return true;
      }
    }

    return false;
  }

  private async applyFreezeBoundary(options: {
    sessionId: string;
    workspaceRoot: string;
    rawPath: string;
    hooks: HookDefinition[];
  }): Promise<void> {
    const resolved = resolveFreezeBoundaryPath(
      options.workspaceRoot,
      options.rawPath,
    );
    await validateFreezeBoundaryPath(resolved);
    const savedBoundary = await writeFreezeBoundary(resolved);
    this.registerCurrentSessionInstalledSkillHooks(options.hooks);
    await this.appendAssistantMessageToSession(options.sessionId, {
      role: "assistant",
      content:
        `Freeze boundary set: ${savedBoundary}\n\n` +
        "From now on, all Edit and Write operations are only allowed inside this directory.\n\n" +
        "To change the boundary, run /freeze again.\n" +
        "To remove the restriction, run /unfreeze.",
      timestamp: Date.now(),
    });
  }

  private getConversationTaskRuntime(workspaceRoot: string): ConversationTaskRuntime {
    return this.taskRuntimeStore.getConversationRuntime(
      workspaceRoot,
      this.getConversationKey(),
    );
  }

  private getConversationWorktreeRuntime(workspaceRoot: string): ConversationWorktreeRuntime {
    return this.worktreeRuntimeStore.getConversationRuntime(
      workspaceRoot,
      this.getConversationKey(),
    );
  }

  private buildProviderRuntimeOptions(): ProviderRuntimeOptions {
    return {};
  }

  private createPromptRuntime(
    workspaceRoot: string,
    config: AdapterProviderConfig,
    envMap: Record<string, string>,
    runtimeOptions: ProviderRuntimeOptions,
    tools: ToolDefinition[],
    mcpRuntime: McpRuntime = this.mcpRuntime,
    abortSignal?: AbortSignal,
    designChatRunRoot?: string,
  ): ElectronPromptRuntime {
    const dangerousCommandApprovals = new Map<
      string,
      { skipGenericApproval?: boolean }
    >();
    const getToolContext = (
      mode: ToolContext["invokerKind"] = "main",
    ): ToolContext => ({
      workspaceRoot,
      ...(designChatRunRoot ? { designChatRunRoot } : {}),
      invokerKind: mode,
      ...(abortSignal ? { abortSignal } : {}),
      extractWebContent: request =>
        runProviderExtractionStep({
          config,
          workspaceRoot,
          envMap,
          runtimeOptions,
          userPrompt: request.content,
          abortSignal: request.abortSignal,
        }),
      requestFileApproval: request => this.host.requestFileApproval(request),
      requestToolApproval: request => this.host.requestToolApproval(request),
      requestUserQuestion: request => this.requestUserQuestion(request),
      allowDangerousCommandOnce: (command, approvalOptions) => {
        dangerousCommandApprovals.set(command, approvalOptions ?? {});
      },
      consumeDangerousCommandApproval: command => {
        const approval = dangerousCommandApprovals.get(command) ?? null;
        if (approval) {
          dangerousCommandApprovals.delete(command);
        }
        return approval;
      },
      onToolLifecycle: event => {
        this.sendToRenderer({ type: "tool:lifecycle", event });
      },
      browser: this.browserRuntime,
      mcp: mcpRuntime,
      tasks: this.getConversationTaskRuntime(workspaceRoot),
      worktree: this.getConversationWorktreeRuntime(workspaceRoot),
      stopBackgroundTask: (taskId =>
        this.backgroundTaskHost.stopTask(taskId, workspaceRoot)) as ToolContext["stopBackgroundTask"],
      runCommandInBackground: request =>
        this.backgroundTaskHost.runBackgroundCommand({
          workspaceRoot,
          command: request.command,
        }),
      findReusableBackgroundCommand: request =>
        this.backgroundTaskHost.findReusableBackgroundCommand(
          workspaceRoot,
          request.command,
        ).then(task => task ?? null),
      planMode: {
        active: false,
        planFilePath: undefined,
        enter: async () => {
          throw new Error("Plan Mode is not available in the Electron desktop shell.");
        },
        getPlanContent: async () => null,
        exit: async () => {
          throw new Error("Plan Mode is not available in the Electron desktop shell.");
        },
      },
    });

    return {
      getMcpStatusSummary: () => mcpRuntime.getStatusSummary(),
      getToolDefinitions: async () => tools,
      getToolContext,
    };
  }

  private buildConversationHistory(
    messages: ChatMessage[],
  ): NormalizedMessage[] {
    return messages
      .filter(message => {
        if (message.role === "user") {
          return !message.content.trim().startsWith("/");
        }
        return message.excludeFromConversation !== true;
      })
      .map(message => {
        if (message.role === "user") {
          return {
            role: "user" as const,
            content: message.content,
            ...(message.attachments ? { attachments: message.attachments } : {}),
          };
        }

        return {
          role: "assistant" as const,
          content: message.content,
        };
      });
  }

  private buildInspectionConversationHistory(
    messages: ChatMessage[],
  ): InspectionConversationMessage[] {
    return this.buildConversationHistory(messages)
      .filter(
        (
          message,
        ): message is Extract<
          NormalizedMessage,
          { role: "user" | "assistant" }
        > => message.role === "user" || message.role === "assistant",
      )
      .map(message => ({
        role: message.role,
        content: message.content,
      }));
  }

  private async recordCommandAssistantReply(
    sessionId: string,
    reply: string,
    includeInConversation = false,
  ): Promise<void> {
    const message: ChatMessage = {
      role: "assistant",
      content: reply,
      ...(includeInConversation ? {} : { excludeFromConversation: true }),
      timestamp: Date.now(),
    };
    await this.appendAssistantMessageToSession(sessionId, message);
  }

  private appendStreamingToken(sessionId: string, token: string): void {
    const requestState = this.inFlightRequests.get(sessionId);
    if (!requestState) {
      return;
    }

    requestState.streamingText += token;
    if (this.isViewingSession(sessionId)) {
      this.streamingText = requestState.streamingText;
      this.sendToRenderer({
        type: "stateUpdate",
        isBusy: true,
        streamingText: this.streamingText,
      });
    }
  }

  private clearStreamingForSession(sessionId: string): void {
    const requestState = this.inFlightRequests.get(sessionId);
    if (requestState) {
      requestState.streamingText = "";
    }
    if (this.isViewingSession(sessionId)) {
      this.streamingText = "";
      this.sendToRenderer({
        type: "stateUpdate",
        isBusy: true,
        streamingText: "",
      });
    }
  }

  private createProviderForSystemPrompt(
    config: AdapterProviderConfig,
    workspaceRoot: string,
    envMap: Record<string, string>,
    systemPrompt: string,
  ) {
    return buildProviderAdapter(
      config,
      workspaceRoot,
      systemPrompt,
      envMap,
    );
  }

  private findActiveBuiltInAgentTask = async (
    workspaceRoot: string,
    agentType: string,
    diffRef?: string,
  ): Promise<{ id: string } | undefined> => {
    const tasks = await this.getConversationTaskRuntime(workspaceRoot).listBackgroundTasks();
    return tasks.find(task =>
      task.taskType === "built_in_agent" &&
      task.agentType === agentType &&
      (task.status === "running" || task.status === "pending") &&
      ((typeof diffRef === "string" && diffRef.trim())
        ? task.metadata?.diffRef === diffRef
        : !task.metadata?.diffRef),
    );
  };

  private createPhaseActivityStub(): string {
    return randomUUID();
  }

  private finishPhaseActivityStub(): void {}

  private getUserFacingInspectionBackgroundTaskHost(): Pick<
    BackgroundTaskHost,
    | "runBuiltInAgentSession"
    | "buildFollowUpMessage"
    | "runDetachedRemoteReview"
    | "runDetachedRemoteVerification"
  > {
    return {
      runBuiltInAgentSession: request =>
        this.backgroundTaskHost.runBuiltInAgentSession(request),
      buildFollowUpMessage: () => "",
      runDetachedRemoteReview: request =>
        this.backgroundTaskHost.runDetachedRemoteReview(request),
      runDetachedRemoteVerification: request =>
        this.backgroundTaskHost.runDetachedRemoteVerification(request),
    };
  }

  private setCommandCompanionState(): void {}

  private async updateCommandMood(): Promise<void> {}

  private isAbortLikeError(error: unknown): boolean {
    return (
      (error instanceof Error &&
        (error.name === "AbortError" ||
          /abort/i.test(error.message) ||
          /cancel/i.test(error.message))) ||
      false
    );
  }

  private async handleCompactPromptCommand(
    sessionId: string,
    commandText: string,
    workspaceRoot: string,
    config: AdapterProviderConfig,
    envMap: Record<string, string>,
  ): Promise<boolean> {
    return handleCompactCommandWithHost({
      commandText,
      workspaceRoot,
      config,
      envMap,
      getConversationHistory: () => this.buildModelConversationHistory(),
      getTranscriptPath: () => this.sessions.getTranscriptFilePath(sessionId),
      replaceConversationHistory: (compactedHistory, compactBoundary) => {
        this.modelConversationMessages = compactedHistory.map(message => ({
          role: message.role,
          content: message.content,
          ...(message.role === "user" &&
          message.attachments &&
          message.attachments.length > 0
            ? { attachments: message.attachments }
            : {}),
        }));
        this.compactBoundary = compactBoundary;
        return this.saveCurrentSessionRuntimeState(sessionId);
      },
      createProviderAdapter: options =>
        this.createProviderForSystemPrompt(
          options.config,
          options.workspaceRoot,
          options.envMap,
          options.systemPrompt,
        ),
      addPhaseActivity: () => this.createPhaseActivityStub(),
      finishPhaseActivity: () => this.finishPhaseActivityStub(),
      recordAssistantReply: (reply, includeInConversation) =>
        this.recordCommandAssistantReply(sessionId, reply, includeInConversation),
      setCompanionState: () => this.setCommandCompanionState(),
      updateMood: () => this.updateCommandMood(),
      toErrorMessage: error => error instanceof Error ? error.message : String(error),
    });
  }

  private async handleReviewPromptCommand(
    sessionId: string,
    commandText: string,
    workspaceRoot: string,
    config: AdapterProviderConfig,
    envMap: Record<string, string>,
    runtime: ElectronPromptRuntime,
    tools: ToolDefinition[],
    runtimeOptions: ProviderRuntimeOptions,
    effortLevel: EffortLevel | undefined,
  ): Promise<boolean> {
    await this.warnOnDegradedInspectionWorkspace(sessionId, "/review", commandText);
    return handleReviewCommandWithHost({
      commandText,
      workspaceRoot,
      config,
      envMap,
      runtime,
      tools,
      runtimeOptions,
      effortLevel: effortLevel as import("../src/thinkingEffort/types").EffortLevel | undefined,
      sessionMessages: this.sessionMessages.map(message => ({
        role: message.role,
        content: message.content,
      })),
      blockedByPlanMode: false,
      getConversationHistory: () =>
        this.buildInspectionConversationHistory(this.sessionMessages),
      getPendingPlanVerification: () => undefined,
      backgroundTaskHost: this.getUserFacingInspectionBackgroundTaskHost(),
      findActiveBuiltInAgentTask: this.findActiveBuiltInAgentTask,
      createProviderAdapter: options =>
        this.createProviderForSystemPrompt(
          options.config,
          options.workspaceRoot,
          options.envMap,
          options.systemPrompt,
        ),
      onStreamingToken: token => this.appendStreamingToken(sessionId, token),
      startToolExecution: (execId, label, detail) => {
        this.sendToRenderer({ type: "tool:start", toolName: label, execId, detail });
      },
      finishToolExecution: (execId, status, summary) => {
        this.sendToRenderer({ type: "tool:end", execId, summary, isError: status === "error" });
      },
      addPhaseActivity: () => this.createPhaseActivityStub(),
      finishPhaseActivity: () => this.finishPhaseActivityStub(),
      recordAssistantReply: (reply, includeInConversation) =>
        this.recordCommandAssistantReply(sessionId, reply, includeInConversation),
      setCompanionState: () => this.setCommandCompanionState(),
      clearStreamingText: () => this.clearStreamingForSession(sessionId),
      updateMood: () => this.updateCommandMood(),
      isAbortLikeError: error => this.isAbortLikeError(error),
    });
  }

  private async handleVerificationPromptCommand(
    sessionId: string,
    commandText: string,
    workspaceRoot: string,
    config: AdapterProviderConfig,
    envMap: Record<string, string>,
    runtime: ElectronPromptRuntime,
    tools: ToolDefinition[],
    runtimeOptions: ProviderRuntimeOptions,
    effortLevel: EffortLevel | undefined,
  ): Promise<boolean> {
    await this.warnOnDegradedInspectionWorkspace(sessionId, "/verify", commandText);
    return handleVerificationCommandWithHost({
      commandText,
      workspaceRoot,
      config,
      envMap,
      runtime,
      tools,
      runtimeOptions,
      effortLevel: effortLevel as import("../src/thinkingEffort/types").EffortLevel | undefined,
      sessionMessages: this.sessionMessages.map(message => ({
        role: message.role,
        content: message.content,
      })),
      blockedByPlanMode: false,
      getConversationHistory: () =>
        this.buildInspectionConversationHistory(this.sessionMessages),
      getPendingPlanVerification: () => undefined,
      backgroundTaskHost: this.getUserFacingInspectionBackgroundTaskHost(),
      findActiveBuiltInAgentTask: this.findActiveBuiltInAgentTask,
      createProviderAdapter: options =>
        this.createProviderForSystemPrompt(
          options.config,
          options.workspaceRoot,
          options.envMap,
          options.systemPrompt,
        ),
      onStreamingToken: token => this.appendStreamingToken(sessionId, token),
      startToolExecution: (execId, label, detail) => {
        this.sendToRenderer({ type: "tool:start", toolName: label, execId, detail });
      },
      finishToolExecution: (execId, status, summary) => {
        this.sendToRenderer({ type: "tool:end", execId, summary, isError: status === "error" });
      },
      addPhaseActivity: () => this.createPhaseActivityStub(),
      finishPhaseActivity: () => this.finishPhaseActivityStub(),
      recordAssistantReply: (reply, includeInConversation) =>
        this.recordCommandAssistantReply(sessionId, reply, includeInConversation),
      setCompanionState: () => this.setCommandCompanionState(),
      clearStreamingText: () => this.clearStreamingForSession(sessionId),
      updateMood: () => this.updateCommandMood(),
      isAbortLikeError: error => this.isAbortLikeError(error),
      markPendingPlanVerificationStarted: () => undefined,
      markPendingPlanVerificationCompleted: () => undefined,
      resetPendingPlanVerificationToAwaitingStart: () => undefined,
      onUnexpectedError: () => undefined,
    });
  }

  private async handleUltrareviewPromptCommand(
    sessionId: string,
    commandText: string,
    workspaceRoot: string,
    config: AdapterProviderConfig,
    envMap: Record<string, string>,
    runtime: ElectronPromptRuntime,
    tools: ToolDefinition[],
    runtimeOptions: ProviderRuntimeOptions,
    effortLevel: EffortLevel | undefined,
  ): Promise<boolean> {
    await this.warnOnDegradedInspectionWorkspace(sessionId, "/ultrareview", commandText);
    return handleUltrareviewCommandWithHost({
      commandText,
      workspaceRoot,
      config,
      envMap,
      runtime,
      tools,
      runtimeOptions,
      effortLevel: effortLevel as import("../src/thinkingEffort/types").EffortLevel | undefined,
      sessionMessages: this.sessionMessages.map(message => ({
        role: message.role,
        content: message.content,
      })),
      blockedByPlanMode: false,
      getConversationHistory: () =>
        this.buildInspectionConversationHistory(this.sessionMessages),
      getPendingPlanVerification: () => undefined,
      backgroundTaskHost: this.getUserFacingInspectionBackgroundTaskHost(),
      addPhaseActivity: () => this.createPhaseActivityStub(),
      finishPhaseActivity: () => this.finishPhaseActivityStub(),
      recordAssistantReply: (reply, includeInConversation) =>
        this.recordCommandAssistantReply(sessionId, reply, includeInConversation),
      setCompanionState: () => this.setCommandCompanionState(),
      clearStreamingText: () => this.clearStreamingForSession(sessionId),
      updateMood: () => this.updateCommandMood(),
      isAbortLikeError: error => this.isAbortLikeError(error),
    });
  }

  private async handleUltraverifyPromptCommand(
    sessionId: string,
    commandText: string,
    workspaceRoot: string,
    config: AdapterProviderConfig,
    envMap: Record<string, string>,
    runtime: ElectronPromptRuntime,
    tools: ToolDefinition[],
    runtimeOptions: ProviderRuntimeOptions,
    effortLevel: EffortLevel | undefined,
  ): Promise<boolean> {
    await this.warnOnDegradedInspectionWorkspace(sessionId, "/ultraverify", commandText);
    return handleUltraverifyCommandWithHost({
      commandText,
      workspaceRoot,
      config,
      envMap,
      runtime,
      tools,
      runtimeOptions,
      effortLevel: effortLevel as import("../src/thinkingEffort/types").EffortLevel | undefined,
      sessionMessages: this.sessionMessages.map(message => ({
        role: message.role,
        content: message.content,
      })),
      blockedByPlanMode: false,
      getConversationHistory: () =>
        this.buildInspectionConversationHistory(this.sessionMessages),
      getPendingPlanVerification: () => undefined,
      backgroundTaskHost: this.getUserFacingInspectionBackgroundTaskHost(),
      addPhaseActivity: () => this.createPhaseActivityStub(),
      finishPhaseActivity: () => this.finishPhaseActivityStub(),
      recordAssistantReply: (reply, includeInConversation) =>
        this.recordCommandAssistantReply(sessionId, reply, includeInConversation),
      setCompanionState: () => this.setCommandCompanionState(),
      clearStreamingText: () => this.clearStreamingForSession(sessionId),
      updateMood: () => this.updateCommandMood(),
      isAbortLikeError: error => this.isAbortLikeError(error),
    });
  }

  private getLatestGeneratedImageFromCurrentSession():
    | NonNullable<ChatMessage["generatedImages"]>[number]
    | undefined {
    for (let index = this.sessionMessages.length - 1; index >= 0; index -= 1) {
      const message = this.sessionMessages[index];
      if (message?.role !== "assistant" || !message.generatedImages?.length) {
        continue;
      }

      return message.generatedImages[0];
    }

    return undefined;
  }

  private async buildImplicitEditReferenceImages(
    attachments?: WebviewAttachment[],
  ): Promise<ImageLabReferenceImage[]> {
    const referenceImages: ImageLabReferenceImage[] = [];
    const latestGeneratedImage = this.getLatestGeneratedImageFromCurrentSession();
    if (latestGeneratedImage) {
      referenceImages.push(await this.buildReferenceImagePayloadFromSource(
        latestGeneratedImage.src,
        `edit-${latestGeneratedImage.id}.png`,
      ));
    }

    if (attachments?.length) {
      referenceImages.push(
        ...attachments.map(attachment => ({
          dataUrl: attachment.dataUrl,
          mimeType: attachment.mimeType,
          name: attachment.name,
        })),
      );
    }

    return referenceImages;
  }

  private async buildImplicitArtifactReferenceAttachments(
    attachments?: WebviewAttachment[],
  ): Promise<WebviewAttachment[]> {
    if (attachments?.length) {
      return attachments.map(attachment => ({
        dataUrl: attachment.dataUrl,
        mimeType: attachment.mimeType,
        name: attachment.name,
      }));
    }

    const latestGeneratedImage = this.getLatestGeneratedImageFromCurrentSession();
    if (!latestGeneratedImage) {
      return [];
    }

    const referenceImage = await this.buildReferenceImagePayloadFromSource(
      latestGeneratedImage.src,
      `artifact-${latestGeneratedImage.id}.png`,
    );

    return [referenceImage];
  }

  private localizeShellSurfaceText(content: string): string {
    const { surfaceTextMap } = getElectronShellStrings(this.settings.getLanguage());
    return surfaceTextMap[content] ?? content;
  }

  private async appendRouteErrorMessage(content: string): Promise<void> {
    await this.ensureSession();
    if (!this.currentSessionId) {
      return;
    }

    await this.appendAssistantMessageToSession(this.currentSessionId, {
      role: "assistant",
      content,
      kind: "error",
      timestamp: Date.now(),
    });
  }

  private async buildReferenceImagePayloadFromSource(
    source: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<ImageLabReferenceImage> {
    if (source.startsWith("data:")) {
      return {
        dataUrl: source,
        mimeType: source.slice(5, source.indexOf(";")) || "image/png",
        name,
      };
    }

    let response: Response;
    try {
      response = await fetch(source, { signal });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`加载图片资源失败：${message}`);
    }
    if (!response.ok) {
      throw new Error(`Failed to load reference image (${response.status}).`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const mimeType = response.headers.get("content-type") || "image/png";
    return {
      dataUrl: `data:${mimeType};base64,${Buffer.from(arrayBuffer).toString("base64")}`,
      mimeType,
      name,
    };
  }

  private async hydrateImageResultSources(
    results: ImageLabResultItem[],
    signal?: AbortSignal,
  ): Promise<ImageLabResultItem[]> {
    return Promise.all(
      results.map(async result => {
        if (!result.src || result.src.startsWith("data:")) {
          return result;
        }

        const hydrated = await this.buildReferenceImagePayloadFromSource(
          result.src,
          `generated-${result.id}.png`,
          signal,
        );
        return {
          ...result,
          src: hydrated.dataUrl,
        };
      }),
    );
  }

  private buildEffectiveImagePrompt(rawPrompt: string): string {
    const prompt = rawPrompt.trim();
    const SHORT_THRESHOLD = 10;
    if (!prompt || prompt.length > SHORT_THRESHOLD) {
      return prompt;
    }

    const descriptionMessage = [...this.sessionMessages.slice(-8)].reverse().find(message => {
      if (message.role !== "assistant") {
        return false;
      }
      return String(message.content ?? "").trim().length > 20;
    });
    if (!descriptionMessage) {
      return prompt;
    }

    const description = String(descriptionMessage.content ?? "").trim().slice(0, 500);
    if (!description) {
      return prompt;
    }

    return `${description}\n\n用户确认：${prompt}`;
  }

  private async runChatImageJob(message: Record<string, unknown>): Promise<void> {
    const prompt = String(message.prompt ?? "").trim();
    if (!prompt) {
      return;
    }
    const effectivePrompt = this.buildEffectiveImagePrompt(prompt);

    await this.ensureSession();
    const requestSessionId = this.currentSessionId;
    if (!requestSessionId || this.inFlightRequests.has(requestSessionId)) {
      return;
    }

    const abortController = new AbortController();
    this.inFlightRequests.set(requestSessionId, {
      abortController,
      streamingText: "",
      kind: "image",
    });
    const batchExecution = this.resolveImageBatchExecution(message);
    const activeImageModelState = this.getActiveImageModelState();
    this.sendToRenderer({
      type: "chat:imagePending",
      prompt,
      referenceCount: Array.isArray(message.referenceImages) ? message.referenceImages.length : 0,
      batchCount: batchExecution.batchCount,
      modelLabel: activeImageModelState.activeImageModel?.model?.trim() || "",
    });

    const userMessage: ChatMessage = {
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    };
    this.sessionMessages = [...this.sessionMessages, userMessage];
    await this.sessions.appendMessages(requestSessionId, [userMessage]);
    await this.postState();

    try {
      await this.ensureImageResultsHydrated();
      const config = await this.buildImageConfig({
        ...message,
        batchCount: batchExecution.batchCount,
      });
      const referenceImages = Array.isArray(message.referenceImages)
        ? message.referenceImages.filter(
          (referenceImage): referenceImage is ImageLabReferenceImage =>
            !!referenceImage &&
            typeof referenceImage === "object" &&
            typeof referenceImage.dataUrl === "string" &&
            typeof referenceImage.mimeType === "string" &&
            typeof referenceImage.name === "string",
        )
        : [];

      await this.settings.pushImagePromptHistory(prompt);
      const rawResults = await runImageLabRequest({
        prompt: effectivePrompt,
        executionPrompt: batchExecution.executionPrompt,
        config,
        ...(referenceImages.length > 0 ? { referenceImages } : {}),
        signal: abortController.signal,
      });
      const results = await this.hydrateImageResultSources(
        rawResults,
        abortController.signal,
      );
      this.imageResults = prependImageLabResults(this.imageResults, results);
      await this.imageGalleryStore.saveResults(this.imageResults);

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: referenceImages.length > 0
          ? `已根据你的编辑要求生成 ${results.length} 张图片。`
          : `已生成 ${results.length} 张图片。`,
        timestamp: Date.now(),
        generatedImages: results.map(result => ({
          id: result.id,
          src: result.src,
          ...(result.source ? { source: result.source } : {}),
          ...(result.prompt ? { prompt: result.prompt } : {}),
          ...(result.revisedPrompt ? { revisedPrompt: result.revisedPrompt } : {}),
        })),
      };
      await this.appendAssistantMessageToSession(requestSessionId, assistantMessage);
    } catch (error) {
      if (abortController.signal.aborted) {
        return;
      }

      const errorMessage: ChatMessage = {
        role: "assistant",
        content: `图片任务失败：${error instanceof Error ? error.message : String(error)}`,
        kind: "error",
        timestamp: Date.now(),
      };
      await this.appendAssistantMessageToSession(requestSessionId, errorMessage);
    } finally {
      this.inFlightRequests.delete(requestSessionId);
      this.streamingText = "";
      this.sendToRenderer({ type: "chat:imagePendingCleared" });
      await this.postState();
    }
  }

  // ─── State ──────────────────────────────────────────────────────────────────

  private async postState(): Promise<void> {
    this.streamingText = this.getVisibleStreamingText();
    const workspaceInfo = await this.getResolvedWorkspaceContext();
    const activeRequest = this.currentSessionId
      ? this.inFlightRequests.get(this.currentSessionId)
      : undefined;
    const backgroundBusy = await this.getCurrentSessionBackgroundBusy(workspaceInfo);
    const sessionBusy = !!activeRequest || backgroundBusy;

    const onboardingDone = this.settings.isOnboardingDone();
    const uiLanguage = this.settings.getLanguage();
    const shellStrings = getElectronShellStrings(uiLanguage);
    const providerMeta = this.settings.getActiveProviderMeta();
    const providerLabel = providerMeta
      ? `${providerMeta.type} / ${providerMeta.model ?? "default"}`
      : "未配置";

    const localizedProviderLabel = providerMeta
      ? providerLabel
      : shellStrings.providerLabelUnset;
    const workspaceRoot = workspaceInfo.selectedRoot;

    let mcpServers: unknown[] = [];
    try {
      mcpServers = await this.mcpRuntime.getStatusSummary();
    } catch {
      // ignore – MCP not configured
    }

    const currentRuntimeState = this.currentSessionId
      ? await this.loadSessionRuntimeState(this.currentSessionId)
      : null;
    const currentDesignProject = await this.getCurrentDesignProject();
    const artifactState = this.currentSessionId
      ? await this.buildArtifactStatePayload(this.currentSessionId, currentRuntimeState)
      : {
          activeArtifact: null,
          activeArtifactId: null,
          artifactCount: 0,
          artifacts: [],
          artifactPanelCollapsed: false,
        };

    this.sendToRenderer({
      type: "state",
      isBusy: sessionBusy,
      activeRequestKind: activeRequest?.kind ?? (backgroundBusy ? "background" : null),
      providerLabel: localizedProviderLabel,
      mcpServers,
      desktopRuntime: this.buildDesktopRuntimeState(),
      liveActivities: [],
      lastRunActivities: [],
      messages: this.sessionMessages,
      effortLevel: null,
      fastMode: this.settings.getFastMode(),
      fastModeLabel: "",
      fastModeConnected: false,
      showThinkingSummaries: this.settings.getShowThinkingSummaries(),
      uiLanguage,
      dialogStrings: getElectronDialogStrings(uiLanguage),
      shellStrings,
      planMode: { active: false, planFilePath: null },
      pendingApproval: this.getPendingInteraction(),
      onboardingDone,
      artifactState,
      designState: {
        currentProjectId: currentDesignProject?.projectId ?? null,
        currentProjectName: currentDesignProject?.name ?? null,
        activeVersionId: currentDesignProject?.activeVersionId ?? null,
        currentFlowId: this.currentDesignFlowState?.flowId ?? null,
        currentFlowProjectId: this.currentDesignFlowState?.projectId ?? null,
      },
      workspaceRoot,
      workspaceInfo,
      sessionType: currentRuntimeState?.sessionType === "design" ? "design" : "default",
    });
  }

  private getDefaultSessionTitle(): string {
    return getElectronShellStrings(this.settings.getLanguage()).defaultSessionTitle;
  }

  private buildDesktopRuntimeState(): {
    localBridge?: ReturnType<
      NonNullable<DesktopRuntimeServices["localBridgeRuntime"]>["getStatus"]
    >;
  } {
    return {
      localBridge: this.desktopRuntimeServices?.localBridgeRuntime?.getStatus(),
    };
  }
}

type WebviewAttachment = {
  dataUrl: string;
  mimeType: string;
  name: string;
};
