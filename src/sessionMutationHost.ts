import {
  beginNewConversationSession,
  buildDeletedActiveSessionState,
} from "./sessionLifecycleHost";
import type { loadSavedSessionPayload, applySavedSessionActivation } from "./savedSessionHost";

type SavedSessionPayload = Awaited<ReturnType<typeof loadSavedSessionPayload>>;

type ApplySavedSessionActivation = typeof applySavedSessionActivation;

export async function switchToSavedSession(options: {
  payload: SavedSessionPayload;
  disposeSwarm: () => void;
  resetActiveRuntimeControllers: () => void;
  resetPlanMode: () => void;
  clearCachedTools: () => void;
  clearConversationBuffers: () => void;
  applySavedSessionActivation: ApplySavedSessionActivation;
  setCurrentSessionId: (id: string) => void;
  replaceSessionMessages: (messages: SavedSessionPayload["restoredSession"]["sessionMessages"]) => void;
  restoreModelConversation: (messages: SavedSessionPayload["runtimeState"]["modelConversation"]) => void;
  restorePendingPlanVerification: (state: SavedSessionPayload["runtimeState"]["pendingPlanVerification"]) => void;
  restoreCompactBoundary: (state: SavedSessionPayload["runtimeState"]["compactBoundary"]) => void;
  markConversationBaseline: (count: number) => void;
  setActiveSessionId: (id: string) => Promise<unknown>;
  finalizeMutation: () => Promise<void>;
}) {
  options.disposeSwarm();
  options.resetActiveRuntimeControllers();
  options.resetPlanMode();
  options.clearCachedTools();
  options.clearConversationBuffers();
  options.applySavedSessionActivation({
    payload: options.payload,
    clearConversationBuffers: options.clearConversationBuffers,
    setCurrentSessionId: options.setCurrentSessionId,
    replaceSessionMessages: options.replaceSessionMessages,
    restoreModelConversation: options.restoreModelConversation,
    restorePendingPlanVerification: options.restorePendingPlanVerification,
    restoreCompactBoundary: options.restoreCompactBoundary,
    markConversationBaseline: options.markConversationBaseline,
  });
  await options.setActiveSessionId(options.payload.restoredSession.currentSessionId);
  await options.finalizeMutation();
}

export async function clearDeletedActiveSession(options: {
  disposeSwarm: () => void;
  resetActiveRuntimeControllers: () => void;
  clearConversationBuffers: () => void;
  setCurrentSessionId: (id: undefined) => void;
  setTransientConversationId: (id: ReturnType<typeof buildDeletedActiveSessionState>["transientConversationId"]) => void;
  resetPlanMode: () => void;
  clearCachedTools: () => void;
  clearPendingPlanVerification: () => void;
  markConversationBaseline: (count: number) => void;
  finalizeMutation: () => Promise<void>;
}) {
  options.disposeSwarm();
  options.resetActiveRuntimeControllers();
  options.clearConversationBuffers();
  const deletedState = buildDeletedActiveSessionState();
  options.setCurrentSessionId(deletedState.currentSessionId);
  options.setTransientConversationId(deletedState.transientConversationId);
  options.resetPlanMode();
  options.clearPendingPlanVerification();
  options.clearCachedTools();
  options.markConversationBaseline(deletedState.baselineCount);
  await options.finalizeMutation();
}

export async function startNewSession(options: {
  persistenceEnabled: boolean;
  workspaceHash: string;
  defaultTitle: string;
  createSession: (
    id: string,
    workspaceHash: string,
    title: string,
  ) => Promise<unknown>;
  setActiveSessionId: (id: string) => Promise<unknown>;
  disposeSwarm: () => void;
  resetActiveRuntimeControllers: () => void;
  clearConversationBuffers: () => void;
  resetPlanMode: () => void;
  clearPendingPlanVerification: () => void;
  clearCachedTools: () => void;
  setCurrentSessionId: (id: string | undefined) => void;
  setTransientConversationId: (
    id: ReturnType<typeof beginNewConversationSession> extends Promise<infer T>
      ? T extends { transientConversationId?: infer U }
        ? U
        : never
      : never,
  ) => void;
  markConversationBaseline: (count: number) => void;
  finalizeMutation: () => Promise<void>;
}): Promise<
  Awaited<ReturnType<typeof beginNewConversationSession>>
> {
  options.disposeSwarm();
  options.resetActiveRuntimeControllers();
  options.clearConversationBuffers();
  options.resetPlanMode();
  options.clearPendingPlanVerification();
  options.clearCachedTools();

  const newSessionState = await beginNewConversationSession({
    persistenceEnabled: options.persistenceEnabled,
    workspaceHash: options.workspaceHash,
    defaultTitle: options.defaultTitle,
    createSession: options.createSession,
    setActiveSessionId: options.setActiveSessionId,
  });

  options.setCurrentSessionId(newSessionState.currentSessionId);
  if (newSessionState.transientConversationId) {
    options.setTransientConversationId(newSessionState.transientConversationId);
  }
  options.markConversationBaseline(0);
  await options.finalizeMutation();

  return newSessionState;
}
