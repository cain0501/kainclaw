import type { applySavedSessionActivation, loadSavedSessionPayload } from "./savedSessionHost";
import {
  beginNewConversationSession,
  finalizeSessionMutation,
} from "./sessionLifecycleHost";
import { startNewSession, switchToSavedSession } from "./sessionMutationHost";
import { buildSessionExportPath, buildSessionExportSuccessMessage } from "./sessionUi";

type SavedSessionPayload = Awaited<ReturnType<typeof loadSavedSessionPayload>>;
type ApplySavedSessionActivation = typeof applySavedSessionActivation;

async function finalizeSessionHostMutation(options: {
  workspaceRoot?: string;
  ensureConversationWorktreeHydrated: (workspaceRoot: string) => Promise<void>;
  postState: () => void;
  refreshWorkspaceStatus: () => void;
  shouldRefreshSessionsList: () => boolean;
  handleSessionsLoad: () => Promise<void>;
}): Promise<void> {
  await finalizeSessionMutation({
    workspaceRoot: options.workspaceRoot,
    hydrateWorkspace: true,
    ensureConversationWorktreeHydrated: options.ensureConversationWorktreeHydrated,
    postState: options.postState,
    refreshWorkspaceStatus: options.refreshWorkspaceStatus,
    shouldRefreshSessionsList: options.shouldRefreshSessionsList,
    handleSessionsLoad: options.handleSessionsLoad,
  });
}

export async function switchSessionCommand(options: {
  sessionId: string;
  loadSavedSessionPayload: (sessionId: string) => Promise<SavedSessionPayload>;
  disposeSwarm: () => void;
  resetActiveRuntimeControllers: () => void;
  resetPlanMode: () => void;
  clearCachedTools: () => void;
  clearConversationBuffers: () => void;
  applySavedSessionActivation: ApplySavedSessionActivation;
  setCurrentSessionId: (id: string) => void;
  replaceSessionMessages: (messages: SavedSessionPayload["restoredSession"]["sessionMessages"]) => void;
  restoreModelConversation: (messages: SavedSessionPayload["runtimeState"]["modelConversation"]) => void;
  restorePendingPlanVerification: (
    state: SavedSessionPayload["runtimeState"]["pendingPlanVerification"],
  ) => void;
  markConversationBaseline: (count: number) => void;
  setActiveSessionId: (id: string) => Promise<unknown>;
  workspaceRoot?: string;
  ensureConversationWorktreeHydrated: (workspaceRoot: string) => Promise<void>;
  postState: () => void;
  refreshWorkspaceStatus: () => void;
  shouldRefreshSessionsList: () => boolean;
  handleSessionsLoad: () => Promise<void>;
}): Promise<void> {
  const payload = await options.loadSavedSessionPayload(options.sessionId);
  await switchToSavedSession({
    payload,
    disposeSwarm: options.disposeSwarm,
    resetActiveRuntimeControllers: options.resetActiveRuntimeControllers,
    resetPlanMode: options.resetPlanMode,
    clearCachedTools: options.clearCachedTools,
    clearConversationBuffers: options.clearConversationBuffers,
    applySavedSessionActivation: options.applySavedSessionActivation,
    setCurrentSessionId: options.setCurrentSessionId,
    replaceSessionMessages: options.replaceSessionMessages,
    restoreModelConversation: options.restoreModelConversation,
    restorePendingPlanVerification: options.restorePendingPlanVerification,
    markConversationBaseline: options.markConversationBaseline,
    setActiveSessionId: options.setActiveSessionId,
    finalizeMutation: () =>
      finalizeSessionHostMutation({
        workspaceRoot: options.workspaceRoot,
        ensureConversationWorktreeHydrated: options.ensureConversationWorktreeHydrated,
        postState: options.postState,
        refreshWorkspaceStatus: options.refreshWorkspaceStatus,
        shouldRefreshSessionsList: options.shouldRefreshSessionsList,
        handleSessionsLoad: options.handleSessionsLoad,
      }),
  });
}

export async function createNewSessionCommand(options: {
  persistenceEnabled: boolean;
  workspaceHash: string;
  defaultTitle: string;
  createSession: (id: string, workspaceHash: string, title: string) => Promise<unknown>;
  setActiveSessionId: (id: string) => Promise<unknown>;
  disposeSwarm: () => void;
  resetActiveRuntimeControllers: () => void;
  clearConversationBuffers: () => void;
  resetPlanMode: () => void;
  clearPendingPlanVerification: () => void;
  clearCachedTools: () => void;
  setCurrentSessionId: (id: string | undefined) => void;
  setTransientConversationId: (
    id: Awaited<ReturnType<typeof beginNewConversationSession>>["transientConversationId"],
  ) => void;
  markConversationBaseline: (count: number) => void;
  workspaceRoot?: string;
  ensureConversationWorktreeHydrated: (workspaceRoot: string) => Promise<void>;
  postState: () => void;
  refreshWorkspaceStatus: () => void;
  shouldRefreshSessionsList: () => boolean;
  handleSessionsLoad: () => Promise<void>;
}): Promise<Awaited<ReturnType<typeof startNewSession>>> {
  return startNewSession({
    persistenceEnabled: options.persistenceEnabled,
    workspaceHash: options.workspaceHash,
    defaultTitle: options.defaultTitle,
    createSession: options.createSession,
    setActiveSessionId: options.setActiveSessionId,
    disposeSwarm: options.disposeSwarm,
    resetActiveRuntimeControllers: options.resetActiveRuntimeControllers,
    clearConversationBuffers: options.clearConversationBuffers,
    resetPlanMode: options.resetPlanMode,
    clearPendingPlanVerification: options.clearPendingPlanVerification,
    clearCachedTools: options.clearCachedTools,
    setCurrentSessionId: options.setCurrentSessionId,
    setTransientConversationId: options.setTransientConversationId,
    markConversationBaseline: options.markConversationBaseline,
    finalizeMutation: () =>
      finalizeSessionHostMutation({
        workspaceRoot: options.workspaceRoot,
        ensureConversationWorktreeHydrated: options.ensureConversationWorktreeHydrated,
        postState: options.postState,
        refreshWorkspaceStatus: options.refreshWorkspaceStatus,
        shouldRefreshSessionsList: options.shouldRefreshSessionsList,
        handleSessionsLoad: options.handleSessionsLoad,
      }),
  });
}

export async function renameSessionCommand(options: {
  sessionId: string;
  title: string;
  updateMeta: (id: string, patch: { title: string }) => Promise<unknown>;
  shouldRefreshSessionsList: () => boolean;
  handleSessionsLoad: () => Promise<void>;
}): Promise<void> {
  await options.updateMeta(options.sessionId, { title: options.title });
  if (options.shouldRefreshSessionsList()) {
    await options.handleSessionsLoad();
  }
}

export async function handleSessionWebviewMessage(options: {
  message: { type?: unknown; id?: unknown; title?: unknown };
  isMultiSessionEnabled: () => boolean;
  postLicenseRequired: (feature: "multiSession") => void;
  setSessionsPanelOpen: (open: boolean) => void;
  loadSessions: () => Promise<void>;
  switchSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  exportSession: (id: string) => Promise<void>;
  createNewSession: () => Promise<void>;
}): Promise<boolean> {
  const type = typeof options.message.type === "string" ? options.message.type : "";

  switch (type) {
    case "sessions:load":
      if (!options.isMultiSessionEnabled()) {
        options.postLicenseRequired("multiSession");
        return true;
      }
      options.setSessionsPanelOpen(true);
      await options.loadSessions();
      return true;
    case "sessions:close":
      options.setSessionsPanelOpen(false);
      return true;
    case "sessions:switch":
      if (!options.isMultiSessionEnabled()) {
        options.postLicenseRequired("multiSession");
        return true;
      }
      await options.switchSession(String(options.message.id || ""));
      return true;
    case "sessions:rename":
      await options.renameSession(
        String(options.message.id || ""),
        String(options.message.title || ""),
      );
      return true;
    case "sessions:delete":
      await options.deleteSession(String(options.message.id || ""));
      return true;
    case "sessions:export":
      await options.exportSession(String(options.message.id || ""));
      return true;
    case "sessions:new":
      if (!options.isMultiSessionEnabled()) {
        options.postLicenseRequired("multiSession");
        return true;
      }
      await options.createNewSession();
      return true;
    default:
      return false;
  }
}

export async function deleteSessionCommand(options: {
  sessionId: string;
  currentSessionId?: string;
  resetAutoMemoryConversation: (id: string) => void;
  deleteSession: (id: string) => Promise<unknown>;
  clearDeletedActiveSession: () => Promise<void>;
}): Promise<void> {
  options.resetAutoMemoryConversation(options.sessionId);
  await options.deleteSession(options.sessionId);
  if (options.currentSessionId === options.sessionId) {
    await options.clearDeletedActiveSession();
  }
}

export async function exportSessionCommand(options: {
  sessionId: string;
  readIndex: () => Promise<{ sessions: Array<{ id: string; title: string }> }>;
  exportMarkdown: (id: string, title: string) => Promise<string>;
  workspaceRoot?: string;
  showSaveDialog: (input: {
    defaultPath?: string;
    title: string;
  }) => Promise<string | undefined>;
  writeFile: (targetPath: string, content: string) => Promise<void>;
  showInformationMessage: (message: string) => void;
}): Promise<void> {
  const index = await options.readIndex();
  const meta = index.sessions.find(session => session.id === options.sessionId);
  const title = meta?.title ?? options.sessionId;
  const markdown = await options.exportMarkdown(options.sessionId, title);
  const defaultPath = buildSessionExportPath(options.workspaceRoot, title);
  const targetPath = await options.showSaveDialog({
    defaultPath,
    title: "导出对话为 Markdown",
  });

  if (!targetPath) {
    return;
  }

  await options.writeFile(targetPath, markdown);
  options.showInformationMessage(buildSessionExportSuccessMessage(targetPath));
}
