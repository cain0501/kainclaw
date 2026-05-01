import { randomUUID } from "node:crypto";

import {
  createNewSessionCommand,
  deleteSessionCommand,
  exportSessionCommand,
  renameSessionCommand,
  switchSessionCommand,
} from "./sessionCommandHost";
import { publishLocalSessionList } from "./sessionListHost";
import {
  loadSavedSessionPayload,
  applySavedSessionActivation,
  type SavedSessionActivationBindings,
} from "./savedSessionHost";
import { clearDeletedActiveSession } from "./sessionMutationHost";
import { finalizeSessionMutation } from "./sessionLifecycleHost";
import {
  DEFAULT_NEW_SESSION_TITLE,
  getWorkspaceHash,
} from "./sessionUi";
import type {
  ChatMessage,
  SessionIndex,
} from "./storage/sessionRepository";

type SessionMessage = ChatMessage;

type SessionStore = {
  readIndex: () => Promise<SessionIndex>;
  loadMessages: (sessionId: string) => Promise<SessionMessage[]>;
  loadRuntimeState: (sessionId: string) => Promise<any>;
  createSession: (id: string, workspaceHash: string, title: string) => Promise<unknown>;
  ensureSession: (id: string, workspaceHash: string, title: string) => Promise<unknown>;
  deleteSession: (id: string) => Promise<unknown>;
  updateMeta: (id: string, patch: { title: string }) => Promise<unknown>;
  exportMarkdown: (id: string, title: string) => Promise<string>;
};

type SettingsStore = {
  setActiveSessionId: (id: string) => Promise<unknown>;
};

export type SessionPanelActions = {
  loadSessions: () => Promise<void>;
  switchSession: (id: string) => Promise<void>;
  createNewSession: () => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  exportSession: (id: string) => Promise<void>;
};

export type SessionPanelActionFactory = (options: {
  workspaceRoot?: string;
  getCurrentSessionId: () => string | undefined;
  setCurrentSessionId: (id: string | undefined) => void;
  getPreviousSignature: () => string;
  setSignature: (signature: string) => void;
  disposeSwarm: () => void;
  resetActiveRuntimeControllers: () => void;
  resetPlanMode: () => void;
  clearCachedTools: () => void;
  clearPendingPlanVerification: (persist?: boolean) => void;
  setTransientConversationId: (
    id: ReturnType<typeof randomUUID> | undefined,
  ) => void;
  resetAutoMemoryConversation: (id: string) => void;
  ensureConversationWorktreeHydrated: (
    workspaceRoot: string,
  ) => Promise<void>;
  shouldRefreshSessionsList: () => boolean;
  postState: () => void;
  publishSessions: (payload: { sessions: any[]; activeId: string | null }) => void;
  logSession: (event: string, details: Record<string, unknown>) => void;
}) => SessionPanelActions;

export type SessionPanelControllerFactoryOptions = {
  settings: SettingsStore;
  sessions: SessionStore;
  getPersistenceEnabled: () => boolean;
  refreshWorkspaceStatus: () => void;
  savedSessionActivationBindings: SavedSessionActivationBindings;
  markConversationBaseline: (count: number) => void;
  showSaveDialog: (input: {
    defaultPath?: string;
    title: string;
  }) => Promise<string | undefined>;
  writeFile: (targetPath: string, content: string) => Promise<void>;
  showInformationMessage: (message: string) => void;
};

export type SessionPanelControllerFactoryState =
  Parameters<SessionPanelActionFactory>[0];

export type SessionPanelControllerFactory = (
  state: SessionPanelControllerFactoryState,
) => SessionPanelActions;

export function createSessionPanelActions(options: {
  settings: SettingsStore;
  sessions: SessionStore;
  workspaceRoot?: string;
  getPersistenceEnabled: () => boolean;
  getCurrentSessionId: () => string | undefined;
  setCurrentSessionId: (id: string | undefined) => void;
  getPreviousSignature: () => string;
  setSignature: (signature: string) => void;
  disposeSwarm: () => void;
  resetActiveRuntimeControllers: () => void;
  resetPlanMode: () => void;
  clearCachedTools: () => void;
  clearConversationBuffers: () => void;
  replaceSessionMessages: (messages: SessionMessage[]) => void;
  restoreModelConversation: (messages: any) => void;
  restorePendingPlanVerification: (state: any) => void;
  restoreCompactBoundary: (state: any) => void;
  clearPendingPlanVerification: (persist?: boolean) => void;
  setTransientConversationId: (id: ReturnType<typeof randomUUID> | undefined) => void;
  markConversationBaseline: (count: number) => void;
  resetAutoMemoryConversation: (id: string) => void;
  ensureConversationWorktreeHydrated: (workspaceRoot: string) => Promise<void>;
  shouldRefreshSessionsList: () => boolean;
  postState: () => void;
  refreshWorkspaceStatus: () => void;
  publishSessions: (payload: { sessions: any[]; activeId: string | null }) => void;
  logSession: (event: string, details: Record<string, unknown>) => void;
  showSaveDialog: (input: {
    defaultPath?: string;
    title: string;
  }) => Promise<string | undefined>;
  writeFile: (targetPath: string, content: string) => Promise<void>;
  showInformationMessage: (message: string) => void;
}): SessionPanelActions {
  const loadSessions = async () => {
    await publishLocalSessionList({
      readIndex: () => options.sessions.readIndex(),
      loadMessages: sessionId => options.sessions.loadMessages(sessionId),
      activeId: options.getCurrentSessionId(),
      previousSignature: options.getPreviousSignature(),
      onLoaded: sessionCount => {
        options.logSession("sessions-load", { sessionCount });
      },
      setSignature: signature => {
        options.setSignature(signature);
      },
      publish: payload => {
        options.publishSessions(payload);
      },
    });
  };

  return {
    loadSessions,
    switchSession: async id => {
      await switchSessionCommand({
        sessionId: id,
        loadSavedSessionPayload: sessionId =>
          loadSavedSessionPayload({
            sessionId,
            loadMessages: nextSessionId => options.sessions.loadMessages(nextSessionId),
            loadRuntimeState: nextSessionId =>
              options.sessions.loadRuntimeState(nextSessionId),
          }),
        disposeSwarm: options.disposeSwarm,
        resetActiveRuntimeControllers: options.resetActiveRuntimeControllers,
        resetPlanMode: options.resetPlanMode,
        clearCachedTools: options.clearCachedTools,
        clearConversationBuffers: options.clearConversationBuffers,
        applySavedSessionActivation,
        setCurrentSessionId: sessionId => {
          options.setCurrentSessionId(sessionId);
        },
        replaceSessionMessages: messages => {
          options.replaceSessionMessages(messages);
        },
        restoreModelConversation: messages =>
          options.restoreModelConversation(messages),
        restorePendingPlanVerification: state =>
          options.restorePendingPlanVerification(state),
        restoreCompactBoundary: state =>
          options.restoreCompactBoundary(state),
        markConversationBaseline: count =>
          options.markConversationBaseline(count),
        setActiveSessionId: sessionId => options.settings.setActiveSessionId(sessionId),
        workspaceRoot: options.workspaceRoot,
        ensureConversationWorktreeHydrated: workspaceRoot =>
          options.ensureConversationWorktreeHydrated(workspaceRoot),
        postState: options.postState,
        refreshWorkspaceStatus: options.refreshWorkspaceStatus,
        shouldRefreshSessionsList: options.shouldRefreshSessionsList,
        handleSessionsLoad: loadSessions,
      });
    },
    createNewSession: async () => {
      const workspaceHash = getWorkspaceHash(options.workspaceRoot);
      const newSessionState = await createNewSessionCommand({
        persistenceEnabled: options.getPersistenceEnabled(),
        workspaceHash,
        defaultTitle: DEFAULT_NEW_SESSION_TITLE,
        createSession: (id, workspaceHash, title) =>
          options.sessions.createSession(id, workspaceHash, title),
        setActiveSessionId: id => options.settings.setActiveSessionId(id),
        disposeSwarm: options.disposeSwarm,
        resetActiveRuntimeControllers: options.resetActiveRuntimeControllers,
        clearConversationBuffers: options.clearConversationBuffers,
        resetPlanMode: options.resetPlanMode,
        clearPendingPlanVerification: () => {
          options.clearPendingPlanVerification(false);
        },
        clearCachedTools: options.clearCachedTools,
        setCurrentSessionId: id => {
          options.setCurrentSessionId(id);
        },
        setTransientConversationId: id => {
          options.setTransientConversationId(id);
        },
        markConversationBaseline: count => {
          options.markConversationBaseline(count);
        },
        workspaceRoot: options.workspaceRoot,
        ensureConversationWorktreeHydrated: workspaceRoot =>
          options.ensureConversationWorktreeHydrated(workspaceRoot),
        postState: options.postState,
        refreshWorkspaceStatus: options.refreshWorkspaceStatus,
        shouldRefreshSessionsList: options.shouldRefreshSessionsList,
        handleSessionsLoad: loadSessions,
      });

      if (newSessionState.createdSessionId) {
        options.logSession("session-created", {
          source: "new-session",
          sessionId: newSessionState.createdSessionId,
          workspaceHash,
        });
      } else {
        options.logSession("session-transient", {
          source: "new-session",
        });
      }
    },
    renameSession: async (id, title) => {
      await renameSessionCommand({
        sessionId: id,
        title,
        updateMeta: (sessionId, patch) =>
          options.sessions.updateMeta(sessionId, patch),
        shouldRefreshSessionsList: options.shouldRefreshSessionsList,
        handleSessionsLoad: loadSessions,
      });
    },
    deleteSession: async id => {
      await deleteSessionCommand({
        sessionId: id,
        currentSessionId: options.getCurrentSessionId(),
        resetAutoMemoryConversation: sessionId =>
          options.resetAutoMemoryConversation(sessionId),
        deleteSession: sessionId => options.sessions.deleteSession(sessionId),
        clearDeletedActiveSession: () =>
          clearDeletedActiveSession({
            disposeSwarm: options.disposeSwarm,
            resetActiveRuntimeControllers: options.resetActiveRuntimeControllers,
            clearConversationBuffers: options.clearConversationBuffers,
            setCurrentSessionId: sessionId => {
              options.setCurrentSessionId(sessionId);
            },
            setTransientConversationId: transientConversationId => {
              options.setTransientConversationId(transientConversationId);
            },
            resetPlanMode: options.resetPlanMode,
            clearCachedTools: options.clearCachedTools,
            clearPendingPlanVerification: () => {
              options.clearPendingPlanVerification(true);
            },
            markConversationBaseline: count => {
              options.markConversationBaseline(count);
            },
            finalizeMutation: () =>
              finalizeSessionMutation({
                postState: options.postState,
                shouldRefreshSessionsList: options.shouldRefreshSessionsList,
                handleSessionsLoad: loadSessions,
              }),
          }),
      });
    },
    exportSession: async id => {
      await exportSessionCommand({
        sessionId: id,
        readIndex: () => options.sessions.readIndex(),
        exportMarkdown: (sessionId, title) =>
          options.sessions.exportMarkdown(sessionId, title),
        workspaceRoot: options.workspaceRoot,
        showSaveDialog: options.showSaveDialog,
        writeFile: options.writeFile,
        showInformationMessage: options.showInformationMessage,
      });
    },
  };
}

export function createSessionPanelActionsFactory(options: {
  settings: SettingsStore;
  sessions: SessionStore;
  getPersistenceEnabled: () => boolean;
  refreshWorkspaceStatus: () => void;
  savedSessionActivationBindings: SavedSessionActivationBindings;
  markConversationBaseline: (count: number) => void;
  showSaveDialog: (input: {
    defaultPath?: string;
    title: string;
  }) => Promise<string | undefined>;
  writeFile: (targetPath: string, content: string) => Promise<void>;
  showInformationMessage: (message: string) => void;
}): SessionPanelActionFactory {
  return state =>
    createSessionPanelActions({
      settings: options.settings,
      sessions: options.sessions,
      workspaceRoot: state.workspaceRoot,
      getPersistenceEnabled: options.getPersistenceEnabled,
      getCurrentSessionId: state.getCurrentSessionId,
      setCurrentSessionId: state.setCurrentSessionId,
      getPreviousSignature: state.getPreviousSignature,
      setSignature: state.setSignature,
      disposeSwarm: state.disposeSwarm,
      resetActiveRuntimeControllers: state.resetActiveRuntimeControllers,
      resetPlanMode: state.resetPlanMode,
      clearCachedTools: state.clearCachedTools,
      clearConversationBuffers:
        options.savedSessionActivationBindings.clearConversationBuffers,
      replaceSessionMessages:
        options.savedSessionActivationBindings.replaceSessionMessages,
      restoreModelConversation:
        options.savedSessionActivationBindings.restoreModelConversation,
      restorePendingPlanVerification:
        options.savedSessionActivationBindings.restorePendingPlanVerification,
      restoreCompactBoundary:
        options.savedSessionActivationBindings.restoreCompactBoundary,
      clearPendingPlanVerification: state.clearPendingPlanVerification,
      setTransientConversationId: state.setTransientConversationId,
      markConversationBaseline: options.markConversationBaseline,
      resetAutoMemoryConversation: state.resetAutoMemoryConversation,
      ensureConversationWorktreeHydrated:
        state.ensureConversationWorktreeHydrated,
      shouldRefreshSessionsList: state.shouldRefreshSessionsList,
      postState: state.postState,
      refreshWorkspaceStatus: options.refreshWorkspaceStatus,
      publishSessions: state.publishSessions,
      logSession: state.logSession,
      showSaveDialog: options.showSaveDialog,
      writeFile: options.writeFile,
      showInformationMessage: options.showInformationMessage,
    });
}

export function createSessionPanelControllerFactory(
  options: SessionPanelControllerFactoryOptions,
): SessionPanelControllerFactory {
  return state =>
    createSessionPanelActionsFactory({
      settings: options.settings,
      sessions: options.sessions,
      getPersistenceEnabled: options.getPersistenceEnabled,
      refreshWorkspaceStatus: options.refreshWorkspaceStatus,
      savedSessionActivationBindings: options.savedSessionActivationBindings,
      markConversationBaseline: options.markConversationBaseline,
      showSaveDialog: options.showSaveDialog,
      writeFile: options.writeFile,
      showInformationMessage: options.showInformationMessage,
    })(state);
}
