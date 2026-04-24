import type {
  ChatMessage,
  SessionRuntimeState,
} from "./storage/sessionRepository";
import {
  buildSavedSessionRestoreState,
  type SessionViewMessage,
} from "./sessionLifecycleHost";

export async function loadSavedSessionPayload(options: {
  sessionId: string;
  loadMessages: (sessionId: string) => Promise<ChatMessage[]>;
  loadRuntimeState: (sessionId: string) => Promise<SessionRuntimeState>;
}): Promise<{
  messages: ChatMessage[];
  runtimeState: SessionRuntimeState;
  hasVisibleContent: boolean;
  restoredSession: ReturnType<typeof buildSavedSessionRestoreState>;
}> {
  const messages = await options.loadMessages(options.sessionId);
  const runtimeState = await options.loadRuntimeState(options.sessionId);
  return {
    messages,
    runtimeState,
    hasVisibleContent:
      messages.length > 0 || !!runtimeState.pendingPlanVerification,
    restoredSession: buildSavedSessionRestoreState({
      sessionId: options.sessionId,
      messages,
    }),
  };
}

export function buildSavedSessionActivationState(options: {
  payload: Awaited<ReturnType<typeof loadSavedSessionPayload>>;
}): {
  currentSessionId: string;
  sessionMessages: SessionViewMessage[];
  modelConversation?: SessionRuntimeState["modelConversation"];
  pendingPlanVerification?: SessionRuntimeState["pendingPlanVerification"];
  baselineCount: number;
} {
  return {
    currentSessionId: options.payload.restoredSession.currentSessionId,
    sessionMessages: options.payload.restoredSession.sessionMessages,
    modelConversation: options.payload.runtimeState.modelConversation,
    pendingPlanVerification: options.payload.runtimeState.pendingPlanVerification,
    baselineCount: options.payload.restoredSession.baselineCount,
  };
}

export type SavedSessionActivationBindings = {
  clearConversationBuffers: () => void;
  setCurrentSessionId: (sessionId: string | undefined) => void;
  replaceSessionMessages: (messages: SessionViewMessage[]) => void;
  restoreModelConversation: (
    modelConversation: SessionRuntimeState["modelConversation"],
  ) => void;
  restorePendingPlanVerification: (
    pendingPlanVerification: SessionRuntimeState["pendingPlanVerification"],
  ) => void;
  markConversationBaseline: (count: number) => void;
};

export function createSavedSessionActivationBindings(options: {
  clearConversationBuffers: () => void;
  setCurrentSessionId: (sessionId: string | undefined) => void;
  sessionMessages: SessionViewMessage[];
  restoreModelConversation: (
    modelConversation: SessionRuntimeState["modelConversation"],
  ) => void;
  restorePendingPlanVerification: (
    pendingPlanVerification: SessionRuntimeState["pendingPlanVerification"],
  ) => void;
  markConversationBaseline: (count: number) => void;
}): SavedSessionActivationBindings {
  return {
    clearConversationBuffers: options.clearConversationBuffers,
    setCurrentSessionId: options.setCurrentSessionId,
    replaceSessionMessages: messages => {
      for (const message of messages) {
        options.sessionMessages.push(message);
      }
    },
    restoreModelConversation: options.restoreModelConversation,
    restorePendingPlanVerification: options.restorePendingPlanVerification,
    markConversationBaseline: options.markConversationBaseline,
  };
}

export function applySavedSessionActivation(options: {
  payload: Awaited<ReturnType<typeof loadSavedSessionPayload>>;
  clearConversationBuffers: () => void;
  setCurrentSessionId: (sessionId: string) => void;
  replaceSessionMessages: (messages: SessionViewMessage[]) => void;
  restoreModelConversation: (
    modelConversation: SessionRuntimeState["modelConversation"],
  ) => void;
  restorePendingPlanVerification: (
    pendingPlanVerification: SessionRuntimeState["pendingPlanVerification"],
  ) => void;
  markConversationBaseline: (count: number) => void;
}) {
  const activationState = buildSavedSessionActivationState({
    payload: options.payload,
  });
  options.clearConversationBuffers();
  options.setCurrentSessionId(activationState.currentSessionId);
  options.replaceSessionMessages(activationState.sessionMessages);
  options.restoreModelConversation(activationState.modelConversation);
  options.restorePendingPlanVerification(activationState.pendingPlanVerification);
  options.markConversationBaseline(activationState.baselineCount);
  return activationState;
}

export async function tryRestoreSavedSessionWithHost(options: {
  sessionId: string;
  source: "active" | "workspace-fallback";
  loadMessages: (sessionId: string) => Promise<ChatMessage[]>;
  loadRuntimeState: (sessionId: string) => Promise<SessionRuntimeState>;
  clearConversationBuffers: () => void;
  setCurrentSessionId: (sessionId: string) => void;
  replaceSessionMessages: (messages: SessionViewMessage[]) => void;
  restoreModelConversation: (
    modelConversation: SessionRuntimeState["modelConversation"],
  ) => void;
  restorePendingPlanVerification: (
    pendingPlanVerification: SessionRuntimeState["pendingPlanVerification"],
  ) => void;
  markConversationBaseline: (count: number) => void;
  logRestoreSkippedEmpty: (details: {
    source: "active" | "workspace-fallback";
    sessionId: string;
  }) => void;
  logRestoreSuccess: (details: {
    source: "active" | "workspace-fallback";
    sessionId: string;
    messageCount: number;
    hasPendingPlanVerification: boolean;
  }) => void;
}): Promise<boolean> {
  const payload = await loadSavedSessionPayload({
    sessionId: options.sessionId,
    loadMessages: options.loadMessages,
    loadRuntimeState: options.loadRuntimeState,
  });
  if (!payload.hasVisibleContent) {
    options.logRestoreSkippedEmpty({
      source: options.source,
      sessionId: options.sessionId,
    });
    return false;
  }

  applySavedSessionActivation({
    payload,
    clearConversationBuffers: options.clearConversationBuffers,
    setCurrentSessionId: options.setCurrentSessionId,
    replaceSessionMessages: options.replaceSessionMessages,
    restoreModelConversation: options.restoreModelConversation,
    restorePendingPlanVerification: options.restorePendingPlanVerification,
    markConversationBaseline: options.markConversationBaseline,
  });

  options.logRestoreSuccess({
    source: options.source,
    sessionId: options.sessionId,
    messageCount: payload.messages.length,
    hasPendingPlanVerification: !!payload.runtimeState.pendingPlanVerification,
  });
  return true;
}
