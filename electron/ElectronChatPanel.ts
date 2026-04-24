import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ElectronHostAdapter } from "../src/platform/electronHostAdapter";
import { SessionRepository, type ChatMessage } from "../src/storage/sessionRepository";
import { SettingsRepository, type ProviderMeta } from "../src/storage/settingsRepository";
import { buildProviderAdapter, resolveProviderConfig } from "../src/providerHost";
import { verifyLicense } from "../src/license/licenseManager";
import {
  validateOnboardingProviderKey,
  completeOnboardingProvider,
  saveSettingsProvider,
  deleteSettingsProvider,
  loadSettingsPanelData,
} from "../src/settingsHost";
import { normalizeWebviewAttachments } from "../src/attachmentHandler";
import type {
  NormalizedMessage,
  ProviderConfig as AdapterProviderConfig,
} from "../src/agent/providers/IProviderAdapter";
import { McpRuntime, type McpServerStatusSummary } from "../src/mcpRuntime";
import { runAgent, SYSTEM_PROMPT } from "../src/agent/agentRunner";
import { toolDefinitions as builtinToolDefinitions } from "../src/toolRuntime";
import type { ToolContext, ToolDefinition } from "../src/toolRuntime";
import { handleElectronPromptCommand } from "../src/electronPromptCommandHost";
import { parsePromptSlashCommand } from "../src/promptCommandHost";
import { handleCompactCommandWithHost } from "../src/compactHost";
import {
  handleReviewCommandWithHost,
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
import { determineChatPromptIntent } from "../src/imageGeneration/chatPromptIntent";
import { resolveImageBatchPlan } from "../src/imageGeneration/imagePromptBatching";
import { resolveRequestedImageSize } from "../src/imageGeneration/imagePromptSizing";
import type { DesktopRuntimeServices } from "../src/platform/desktopRuntimeServices";
import {
  resolveWorkspaceRoot,
  type ResolvedWorkspaceRoot,
} from "../src/platform/workspaceRootResolver";
import { PersistentTaskRuntimeStore } from "../src/tasks/taskRuntime";
import { PersistentWorktreeRuntimeStore } from "../src/worktree/runtime";
import type { ConversationTaskRuntime } from "../src/tasks/types";
import type { ConversationWorktreeRuntime } from "../src/worktree/types";
import type { EffortLevel, ProviderRuntimeOptions } from "../src/thinkingEffort/types";

const SUPPORTED_ELECTRON_TOOL_NAMES = new Set([
  "list_files",
  "read_file",
  "search_files",
  "run_command",
  "write_file",
  "replace_in_file",
  "fetch_url",
  "glob_files",
]);

const ELECTRON_SHELL_PROMPT_NOTE = `

# Desktop Shell Note
- You are running inside a limited Electron validation shell, not the full VS Code host.
- Identify yourself as KainClaw. Do not claim to be Claude, Anthropic, OpenAI, DeepSeek, or any provider.
- Only use the tools that are actually exposed in this shell.
- Plan mode, worktree switching, browser automation, LSP, advanced memory management, and skill management are not available here.
- Explicit slash commands for /compact, /todo, /review, and /verify are wired into this shell. Treat them as user-invoked shell commands, not autonomous capabilities to invent on your own.
- When the user asks about the current workspace or local files, rely on the provided workspace root and tool results. Do not guess.
- If the user asks for one of those unavailable capabilities, say it is not yet wired in the desktop shell instead of pretending to use it.
`;

function getSupportedElectronTools() {
  return builtinToolDefinitions.filter(tool =>
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

type ActiveRequestKind = "chat" | "image";

/**
 * Electron equivalent of ChatSidebarProvider.
 *
 * Wires sessions, settings, MCP, and the full agent+tool pipeline directly to
 * the Electron IPC layer, with no VS Code module dependencies.
 */
export class ElectronChatPanel {
  private currentSessionId: string | undefined;
  private sessionMessages: ChatMessage[] = [];
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
  private readonly taskRuntimeStore: PersistentTaskRuntimeStore;
  private readonly worktreeRuntimeStore: PersistentWorktreeRuntimeStore;
  private readonly backgroundTaskHost: BackgroundTaskHost;
  private cachedWorkspaceResolution:
    | {
        selectedRoot: string;
        resolution: ResolvedWorkspaceRoot;
      }
    | undefined;

  constructor(
    private readonly sessions: SessionRepository,
    private readonly settings: SettingsRepository,
    private readonly host: ElectronHostAdapter,
    /** Sends a message to the renderer via IPC. */
    private readonly sendToRenderer: (payload: unknown) => void,
    private readonly desktopRuntimeServices?: DesktopRuntimeServices,
  ) {
    this.mcpRuntime = new McpRuntime(
      () => this.getCachedEffectiveWorkspaceRoot(),
      process.env as Record<string, string>,
    );
    this.imageGalleryStore = new ImageLabGalleryStore(this.host.getStorageUri());
    this.promptLibraryRepository = new PromptLibraryRepository(this.host.getStorageUri());
    this.taskRuntimeStore = new PersistentTaskRuntimeStore(this.host.getStorageUri());
    this.worktreeRuntimeStore = new PersistentWorktreeRuntimeStore(this.host.getStorageUri());
    this.backgroundTaskHost = new BackgroundTaskHost({
      storageRoot: this.host.getStorageUri(),
      getTaskRuntime: workspaceRoot => this.getConversationTaskRuntime(workspaceRoot),
    });

    const localBridgeRuntime = this.desktopRuntimeServices?.localBridgeRuntime;
    if (localBridgeRuntime) {
      this.cleanupHandlers.push(
        localBridgeRuntime.onStatusChanged(() => {
          void this.postState();
        }),
      );
    }
  }

  dispose(): void {
    this.backgroundTaskHost.dispose();
    while (this.cleanupHandlers.length > 0) {
      const cleanup = this.cleanupHandlers.pop();
      cleanup?.();
    }
  }

  private clearWorkspaceResolutionCache(): void {
    this.cachedWorkspaceResolution = undefined;
  }

  private getCachedEffectiveWorkspaceRoot(): string {
    const selectedRoot = this.settings.getWorkspaceRoot() ?? "";
    if (
      this.cachedWorkspaceResolution &&
      this.cachedWorkspaceResolution.selectedRoot === selectedRoot
    ) {
      return this.cachedWorkspaceResolution.resolution.effectiveRoot;
    }
    return selectedRoot;
  }

  private async getResolvedWorkspaceContext(
    forceRefresh = false,
  ): Promise<ResolvedWorkspaceRoot> {
    const selectedRoot = this.settings.getWorkspaceRoot() ?? "";
    if (
      !forceRefresh &&
      this.cachedWorkspaceResolution &&
      this.cachedWorkspaceResolution.selectedRoot === selectedRoot
    ) {
      return this.cachedWorkspaceResolution.resolution;
    }

    const resolution = await resolveWorkspaceRoot(selectedRoot);
    this.cachedWorkspaceResolution = {
      selectedRoot,
      resolution,
    };
    return resolution;
  }

  private buildWorkspaceSystemNote(workspace: ResolvedWorkspaceRoot): string {
    if (!workspace.selectedRoot) {
      return "\n\n# Workspace\nNo workspace is currently set. Tell the user they can select a folder via the workspace button in the chat footer.\n";
    }

    const details: string[] = [`Current workspace root: ${workspace.effectiveRoot}`];

    if (
      workspace.selectedRoot &&
      workspace.effectiveRoot &&
      workspace.selectedRoot !== workspace.effectiveRoot
    ) {
      details.push(`Selected folder: ${workspace.selectedRoot}`);
    }

    if (workspace.detail) {
      details.push(`Git status: ${workspace.detail}`);
    }

    return `\n\n# Workspace\n${details.join("\n")}\n`;
  }

  private buildInspectionWorkspaceWarning(
    commandName: "/review" | "/verify",
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
    commandName: "/review" | "/verify",
    commandText: string,
  ): Promise<void> {
    const diffRef =
      commandName === "/review"
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

  // ─── IPC entry point ────────────────────────────────────────────────────────

  async handleMessage(message: Record<string, unknown>): Promise<void> {
    const type = typeof message.type === "string" ? message.type : "";

    // Sessions
    if (type === "sessions:load") { await this.loadSessions(); return; }
    if (type === "sessions:close") { this.sendToRenderer({ type: "hideSessions" }); return; }
    if (type === "sessions:new") { await this.createNewSession(); return; }
    if (type === "sessions:switch") { await this.switchSession(String(message.id ?? "")); return; }
    if (type === "sessions:rename") { await this.renameSession(String(message.id ?? ""), String(message.title ?? "")); return; }
    if (type === "sessions:delete") { await this.deleteSession(String(message.id ?? "")); return; }
    if (type === "sessions:export") { await this.exportSession(String(message.id ?? "")); return; }

    // Settings
    if (type === "settings:load") { await this.loadSettings(); return; }
    if (type === "settings:close") { await this.postState(); return; }
    if (type === "settings:setActive") { await this.setActiveProvider(String(message.id ?? "")); return; }
    if (type === "settings:saveProvider") { await this.saveProvider(message.meta, String(message.apiKey ?? "")); return; }
    if (type === "settings:deleteProvider") { await this.deleteProvider(String(message.id ?? "")); return; }
    if (type === "license:activate") { await this.activateLicense(String(message.key ?? "")); return; }
    if (type === "settings:reset") { await this.resetAllConfig(); return; }
    if (type === "image:loadState") { await this.postImageState(); return; }
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
      const root = String(message.root ?? "");
      if (root) {
        await this.settings.setWorkspaceRoot(root);
        await this.getResolvedWorkspaceContext(true);
        this.mcpRuntime.markConfigDirty();
        await this.postState();
      }
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
      await this.routePrompt(
        String(message.prompt ?? ""),
        message.attachments as WebviewAttachment[] | undefined,
        typeof message.intentOverride === "string" ? message.intentOverride : undefined,
      );
      return;
    }
    if (type === "chat:imageRun") {
      await this.runChatImageJob(message);
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
        const session = await this.sessions.createSession(randomUUID(), "electron");
        id = session.id;
      }
      await this.settings.setActiveSessionId(id);
    }

    if (this.currentSessionId !== id) {
      this.currentSessionId = id;
      this.sessionMessages = await this.sessions.loadMessages(id);
    }
  }

  private async loadSessions(): Promise<void> {
    const index = await this.sessions.readIndex();
    this.sendToRenderer({
      type: "sessions:data",
      sessions: index.sessions,
      activeId: this.currentSessionId ?? null,
    });
  }

  private async switchSession(id: string): Promise<void> {
    if (!id) return;
    this.currentSessionId = id;
    await this.settings.setActiveSessionId(id);
    this.sessionMessages = await this.sessions.loadMessages(id);
    await this.postState();
    await this.loadSessions();
  }

  private async createNewSession(): Promise<void> {
    const session = await this.sessions.createSession(randomUUID(), "electron");
    await this.switchSession(session.id);
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

  private isCurrentSessionBusy(): boolean {
    return !!(
      this.currentSessionId && this.inFlightRequests.has(this.currentSessionId)
    );
  }

  private async appendAssistantMessageToSession(
    sessionId: string,
    message: ChatMessage,
  ): Promise<void> {
    await this.sessions.appendMessages(sessionId, [message]);
    await this.sessions.updateMeta(sessionId, {
      preview: message.content.slice(0, 100),
      updatedAt: Date.now(),
    });

    if (this.isViewingSession(sessionId)) {
      this.sessionMessages = [...this.sessionMessages, message];
    }

    await this.loadSessions();
  }

  private async deleteSession(id: string): Promise<void> {
    if (!id) return;
    const wasActiveSession =
      this.currentSessionId === id || this.settings.getActiveSessionId() === id;

    await this.sessions.deleteSession(id);

    if (wasActiveSession) {
      this.currentSessionId = undefined;
      this.sessionMessages = [];
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
    this.sendToRenderer({ type: "settings:data", ...data });
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
      const workspaceRoot = (await this.getResolvedWorkspaceContext()).effectiveRoot;
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
      const workspaceRoot = (await this.getResolvedWorkspaceContext()).effectiveRoot;
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
      const workspaceRoot = (await this.getResolvedWorkspaceContext()).effectiveRoot;
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
    const workspaceInfo = await this.getResolvedWorkspaceContext();
    const workspaceRoot = workspaceInfo.effectiveRoot;
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
    this.sessionMessages = [];
    this.currentSessionId = undefined;
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
    this.sessionMessages = [];
    this.streamingText = "";
    const session = await this.sessions.createSession(randomUUID(), "electron");
    this.currentSessionId = session.id;
    await this.settings.setActiveSessionId(session.id);
    await this.postState();
    await this.loadSessions();
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

    const latestGeneratedImage = this.getLatestGeneratedImageFromCurrentSession();
    const intent = determineChatPromptIntent({
      prompt: trimmedPrompt,
      explicitIntent: intentOverride === "image_generate" ? "image_generate" : undefined,
      hasAttachments,
      hasRecentGeneratedImageContext: !!latestGeneratedImage,
    });

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

    await this.sendPrompt(trimmedPrompt, attachments);
  }

  private async sendPrompt(prompt: string, attachments?: WebviewAttachment[]): Promise<void> {
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

    try {
      const workspaceContext = await this.getResolvedWorkspaceContext();
      const workspaceRoot = workspaceContext.effectiveRoot;
      const { config, envMap } = await resolveProviderConfig(
        this.settings,
        workspaceRoot,
      );
      const workspaceNote = this.buildWorkspaceSystemNote(workspaceContext);
      const adapter = buildProviderAdapter(
        config,
        workspaceRoot,
        SYSTEM_PROMPT + workspaceNote + ELECTRON_SHELL_PROMPT_NOTE,
        envMap,
      );

      this.streamingText = this.getVisibleStreamingText();

      // Build conversation history for the agent
      const history: NormalizedMessage[] = requestSessionMessages.slice(0, -1).map(m => {
        if (m.role === "user") {
          return { role: "user", content: m.content, attachments: m.attachments };
        }
        return { role: "assistant", content: m.content };
      });
      history.push({ role: "user", content: prompt, attachments: normalizedAttachments });

      // Collect all tools: built-in + MCP
      let mcpTools: typeof builtinToolDefinitions = [];
      try {
        mcpTools = await this.mcpRuntime.getToolDefinitions();
      } catch {
        // MCP not configured or failed – proceed with built-in tools only
      }
      const allTools = [...getSupportedElectronTools(), ...mcpTools];
      const runtimeOptions = this.buildProviderRuntimeOptions();
      const promptRuntime = this.createPromptRuntime(
        workspaceRoot,
        envMap,
        allTools,
      );

      const commandResult = await handleElectronPromptCommand({
        prompt,
        config,
        workspaceRoot,
        envMap,
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
          commandWorkspaceRoot,
          commandConfig,
          commandEnvMap,
          commandRuntime,
          commandTools,
          commandRuntimeOptions,
          effortLevel,
        ) =>
          this.handleReviewPromptCommand(
            requestSessionId,
            commandText,
            commandWorkspaceRoot,
            commandConfig,
            commandEnvMap,
            commandRuntime as ElectronPromptRuntime,
            commandTools,
            commandRuntimeOptions,
            effortLevel,
          ),
        handleVerificationCommand: (
          commandText,
          commandWorkspaceRoot,
          commandConfig,
          commandEnvMap,
          commandRuntime,
          commandTools,
          commandRuntimeOptions,
          effortLevel,
        ) =>
          this.handleVerificationPromptCommand(
            requestSessionId,
            commandText,
            commandWorkspaceRoot,
            commandConfig,
            commandEnvMap,
            commandRuntime as ElectronPromptRuntime,
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

      const toolContext = promptRuntime.getToolContext("main");

      const finalText = await runAgent(history, {
        provider: adapter,
        tools: allTools,
        toolContext,
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
        onToolEnd: (_execId, summary, isError) => {
          this.sendToRenderer({ type: "tool:end", summary, isError });
        },
        abortSignal: abortController.signal,
      });

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: finalText,
        timestamp: Date.now(),
      };
      await this.appendAssistantMessageToSession(requestSessionId, assistantMessage);
    } catch (err) {
      if (abortController.signal.aborted) return;
      const errorMessage: ChatMessage = {
        role: "assistant",
        content: `错误：${err instanceof Error ? err.message : String(err)}`,
        kind: "error",
        timestamp: Date.now(),
      };
      await this.appendAssistantMessageToSession(requestSessionId, errorMessage);
    } finally {
      this.inFlightRequests.delete(requestSessionId);
      this.streamingText = "";
      await this.postState();
    }
  }

  private getConversationKey(): string {
    return this.currentSessionId ?? "electron";
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
    envMap: Record<string, string>,
    tools: ToolDefinition[],
  ): ElectronPromptRuntime {
    const getToolContext = (
      mode: ToolContext["invokerKind"] = "main",
    ): ToolContext => ({
      workspaceRoot,
      invokerKind: mode,
      requestFileApproval: request => this.host.requestFileApproval(request),
      requestToolApproval: request => this.host.requestToolApproval(request),
      onToolLifecycle: event => {
        this.sendToRenderer({ type: "tool:lifecycle", event });
      },
      mcp: this.mcpRuntime,
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
      getMcpStatusSummary: () => this.mcpRuntime.getStatusSummary(),
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
      getConversationHistory: () => this.buildConversationHistory(this.sessionMessages),
      getTranscriptPath: () => undefined,
      replaceConversationHistory: compactedHistory => {
        this.sessionMessages = compactedHistory.map(message => ({
          role: message.role,
          content: message.content,
          timestamp: Date.now(),
        }));
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
      backgroundTaskHost: this.backgroundTaskHost,
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
      backgroundTaskHost: this.backgroundTaskHost,
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

  private async runChatImageJob(message: Record<string, unknown>): Promise<void> {
    const prompt = String(message.prompt ?? "").trim();
    if (!prompt) {
      return;
    }

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
    const sessionBusy = this.isCurrentSessionBusy();
    const activeRequest = this.currentSessionId
      ? this.inFlightRequests.get(this.currentSessionId)
      : undefined;

    const onboardingDone = this.settings.isOnboardingDone();
    const providerMeta = this.settings.getActiveProviderMeta();
    const providerLabel = providerMeta
      ? `${providerMeta.type} / ${providerMeta.model ?? "default"}`
      : "未配置";

    const workspaceInfo = await this.getResolvedWorkspaceContext();
    const workspaceRoot = workspaceInfo.effectiveRoot;

    let mcpServers: unknown[] = [];
    try {
      mcpServers = await this.mcpRuntime.getStatusSummary();
    } catch {
      // ignore – MCP not configured
    }

    this.sendToRenderer({
      type: "state",
      isBusy: sessionBusy,
      activeRequestKind: activeRequest?.kind ?? null,
      providerLabel,
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
      planMode: { active: false, planFilePath: null },
      pendingApproval: this.host.getPendingApproval(),
      onboardingDone,
      workspaceRoot,
      workspaceInfo,
    });
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
