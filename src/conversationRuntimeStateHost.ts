import type {
  ChatMessage,
  CompactBoundarySessionState,
  PendingPlanVerificationSessionState,
  PersistedConversationMessage,
  SessionRuntimeState,
} from "./storage/sessionRepository";
import type { NormalizedMessage } from "./agent/providers/IProviderAdapter";

type PersistableConversationMessage =
  | NormalizedMessage
  | PersistedConversationMessage
  | Pick<ChatMessage, "role" | "content" | "attachments" | "generatedImages">;

function hasReasoningContent(
  message: PersistableConversationMessage,
): message is Extract<NormalizedMessage, { role: "assistant" }> {
  return message.role === "assistant" && "toolCalls" in message;
}

function isNormalizedToolResult(
  message: PersistableConversationMessage,
): message is Extract<NormalizedMessage, { role: "tool_result" }> {
  return message.role === "tool_result";
}

export type PendingPlanVerificationState = PendingPlanVerificationSessionState;

export type ConversationRuntimeStateBindings = {
  getPendingPlanVerificationReminderTurnCount: () => number | null;
  markPendingPlanVerificationStarted: () => void;
  markPendingPlanVerificationCompleted: () => void;
  resetPendingPlanVerificationToAwaitingStart: () => void;
  setPendingPlanVerificationState: (
    nextState: PendingPlanVerificationState | undefined,
    options?: {
      persist?: boolean;
    },
  ) => void;
  restorePendingPlanVerificationState: (
    state: PendingPlanVerificationSessionState | undefined,
  ) => void;
  persistCurrentSessionRuntimeState: () => boolean;
  restoreModelConversationFromRuntime: (
    modelConversation: PersistedConversationMessage[] | undefined,
  ) => void;
  restoreCompactBoundaryFromRuntime: (
    compactBoundary: CompactBoundarySessionState | undefined,
  ) => void;
};

export function countConversationUserTurnsForPlanReminder(options: {
  sessionMessages: Array<Pick<ChatMessage, "role" | "content">>;
  getHistoryCommandBehavior: (prompt: string) => unknown | null;
}): number {
  let turnCount = 0;

  for (const message of options.sessionMessages) {
    if (message.role !== "user") {
      continue;
    }

    if (options.getHistoryCommandBehavior(message.content) !== null) {
      continue;
    }

    turnCount += 1;
  }

  return turnCount;
}

export function getPendingPlanVerificationReminderTurnCount(options: {
  pendingPlanVerification?: PendingPlanVerificationState;
  sessionMessages: Array<Pick<ChatMessage, "role" | "content">>;
  turnsBetweenReminders: number;
  getHistoryCommandBehavior: (prompt: string) => unknown | null;
}): number | null {
  const pending = options.pendingPlanVerification;
  if (!pending || pending.verificationStarted || pending.verificationCompleted) {
    return null;
  }

  const turnsSinceApproval =
    countConversationUserTurnsForPlanReminder({
      sessionMessages: options.sessionMessages,
      getHistoryCommandBehavior: options.getHistoryCommandBehavior,
    }) - pending.approvedAtUserTurnCount;

  if (turnsSinceApproval <= 0) {
    return null;
  }

  if (turnsSinceApproval % options.turnsBetweenReminders !== 0) {
    return null;
  }

  return turnsSinceApproval;
}

export function markPendingPlanVerificationStarted(
  state: PendingPlanVerificationState | undefined,
): PendingPlanVerificationState | undefined {
  if (!state || state.verificationStarted) {
    return state;
  }

  return {
    ...state,
    verificationStarted: true,
  };
}

export function markPendingPlanVerificationCompleted(
  state: PendingPlanVerificationState | undefined,
): PendingPlanVerificationState | undefined {
  if (!state || state.verificationCompleted) {
    return state;
  }

  return {
    ...state,
    verificationStarted: true,
    verificationCompleted: true,
  };
}

export function resetPendingPlanVerificationToAwaitingStart(
  state: PendingPlanVerificationState | undefined,
): PendingPlanVerificationState | undefined {
  if (!state) {
    return state;
  }

  return {
    ...state,
    verificationStarted: false,
    verificationCompleted: false,
  };
}

export function serializePendingPlanVerificationState(
  state: PendingPlanVerificationState | undefined,
): PendingPlanVerificationSessionState | undefined {
  if (!state) {
    return undefined;
  }

  return { ...state };
}

export function deserializePendingPlanVerificationState(
  state: PendingPlanVerificationSessionState | undefined,
): PendingPlanVerificationState | undefined {
  if (!state) {
    return undefined;
  }

  return {
    planFilePath: state.planFilePath,
    planContent: state.planContent,
    approvedAtUserTurnCount: state.approvedAtUserTurnCount,
    verificationStarted: state.verificationStarted,
    verificationCompleted: state.verificationCompleted,
  };
}

export function serializeModelConversation(
  conversationMessages: PersistableConversationMessage[],
): PersistedConversationMessage[] | undefined {
  if (conversationMessages.length === 0) {
    return undefined;
  }

  return conversationMessages.map(message => {
    if (message.role === "user") {
      return {
        role: "user",
        content: message.content,
        ...(message.attachments && message.attachments.length > 0
          ? { attachments: message.attachments }
          : {}),
      };
    }

    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: message.content,
        ...(hasReasoningContent(message) && message.reasoningContent
          ? { reasoningContent: message.reasoningContent }
          : {}),
        ...(hasReasoningContent(message) && message.toolCalls?.length
          ? { toolCalls: message.toolCalls }
          : {}),
        ...("generatedImages" in message &&
        message.generatedImages &&
        message.generatedImages.length > 0
          ? { generatedImages: message.generatedImages }
          : {}),
      };
    }

    return {
      role: "tool_result",
      content: message.content,
      toolCallId: isNormalizedToolResult(message) ? message.toolCallId : "",
      ...(isNormalizedToolResult(message) && message.isError
        ? { isError: message.isError }
        : {}),
    };
  });
}

export function restoreModelConversation(options: {
  modelConversation: PersistedConversationMessage[] | undefined;
  conversationMessages: NormalizedMessage[];
  rebuildConversationMessagesFromSession: () => void;
}): void {
  if (options.modelConversation && options.modelConversation.length > 0) {
    options.conversationMessages.length = 0;
    for (const message of options.modelConversation) {
      if (message.role === "user") {
        options.conversationMessages.push({
          role: "user",
          content: message.content,
          ...(message.attachments && message.attachments.length > 0
            ? { attachments: message.attachments }
            : {}),
        });
        continue;
      }

      if (message.role === "assistant") {
        options.conversationMessages.push({
          role: "assistant",
          content: message.content,
          ...(message.reasoningContent
            ? { reasoningContent: message.reasoningContent }
            : {}),
          ...(message.toolCalls?.length ? { toolCalls: message.toolCalls } : {}),
          ...(message.attachments && message.attachments.length > 0
            ? { attachments: message.attachments }
            : {}),
          ...(message.generatedImages && message.generatedImages.length > 0
            ? { generatedImages: message.generatedImages }
            : {}),
        });
        continue;
      }

      options.conversationMessages.push({
        role: "tool_result",
        toolCallId: message.toolCallId ?? "",
        content: message.content,
        ...(message.isError ? { isError: message.isError } : {}),
      });
    }
    return;
  }

  options.rebuildConversationMessagesFromSession();
}

export function buildSessionRuntimeState(options: {
  pendingPlanVerification: PendingPlanVerificationState | undefined;
  conversationMessages: PersistableConversationMessage[];
  compactBoundary?: CompactBoundarySessionState;
}): SessionRuntimeState {
  return {
    pendingPlanVerification: serializePendingPlanVerificationState(
      options.pendingPlanVerification,
    ),
    modelConversation: serializeModelConversation(options.conversationMessages),
    ...(options.compactBoundary
      ? { compactBoundary: options.compactBoundary }
      : {}),
  };
}

export function persistSessionRuntimeState(options: {
  enabled: boolean;
  currentSessionId?: string;
  pendingPlanVerification: PendingPlanVerificationState | undefined;
  conversationMessages: PersistableConversationMessage[];
  compactBoundary?: CompactBoundarySessionState;
  saveRuntimeState: (
    sessionId: string,
    runtimeState: SessionRuntimeState,
  ) => Promise<unknown>;
}): boolean {
  if (!options.enabled || !options.currentSessionId) {
    return false;
  }

  void options.saveRuntimeState(
    options.currentSessionId,
    buildSessionRuntimeState({
        pendingPlanVerification: options.pendingPlanVerification,
        conversationMessages: options.conversationMessages,
        compactBoundary: options.compactBoundary,
      }),
  );
  return true;
}

export function createConversationRuntimeStateBindings(options: {
  getPendingPlanVerification: () => PendingPlanVerificationState | undefined;
  setPendingPlanVerification: (
    nextState: PendingPlanVerificationState | undefined,
  ) => void;
  getCompactBoundary: () => CompactBoundarySessionState | undefined;
  setCompactBoundary: (
    compactBoundary: CompactBoundarySessionState | undefined,
  ) => void;
  persist: () => void;
  getPersistenceEnabled: () => boolean;
  getCurrentSessionId: () => string | undefined;
  getSessionMessages: () => Array<Pick<ChatMessage, "role" | "content">>;
  getConversationMessages: () => PersistableConversationMessage[];
  getModelConversationMessages?: () => NormalizedMessage[];
  saveRuntimeState: (
    sessionId: string,
    runtimeState: SessionRuntimeState,
  ) => Promise<unknown>;
  rebuildConversationMessagesFromSession: () => void;
  getTurnsBetweenReminders: () => number;
  getHistoryCommandBehavior: (prompt: string) => unknown | null;
}): ConversationRuntimeStateBindings {
  return {
    getPendingPlanVerificationReminderTurnCount: () =>
      getPendingPlanVerificationReminderTurnCount({
        pendingPlanVerification: options.getPendingPlanVerification(),
        sessionMessages: options.getSessionMessages(),
        turnsBetweenReminders: options.getTurnsBetweenReminders(),
        getHistoryCommandBehavior: options.getHistoryCommandBehavior,
      }),
    markPendingPlanVerificationStarted: () => {
      options.setPendingPlanVerification(
        markPendingPlanVerificationStarted(options.getPendingPlanVerification()),
      );
      options.persist();
    },
    markPendingPlanVerificationCompleted: () => {
      options.setPendingPlanVerification(
        markPendingPlanVerificationCompleted(options.getPendingPlanVerification()),
      );
      options.persist();
    },
    resetPendingPlanVerificationToAwaitingStart: () => {
      options.setPendingPlanVerification(
        resetPendingPlanVerificationToAwaitingStart(options.getPendingPlanVerification()),
      );
      options.persist();
    },
    setPendingPlanVerificationState: (nextState, setOptions) => {
      options.setPendingPlanVerification(nextState);
      if (setOptions?.persist === false) {
        return;
      }
      options.persist();
    },
    restorePendingPlanVerificationState: state => {
      options.setPendingPlanVerification(
        deserializePendingPlanVerificationState(state),
      );
    },
    persistCurrentSessionRuntimeState: () =>
      persistSessionRuntimeState({
        enabled: options.getPersistenceEnabled(),
        currentSessionId: options.getCurrentSessionId(),
        pendingPlanVerification: options.getPendingPlanVerification(),
        conversationMessages: options.getConversationMessages(),
        compactBoundary: options.getCompactBoundary(),
        saveRuntimeState: options.saveRuntimeState,
      }),
    restoreModelConversationFromRuntime: modelConversation => {
      restoreModelConversation({
        modelConversation,
        conversationMessages:
          options.getModelConversationMessages?.() ??
          (options.getConversationMessages() as NormalizedMessage[]),
        rebuildConversationMessagesFromSession:
          options.rebuildConversationMessagesFromSession,
      });
    },
    restoreCompactBoundaryFromRuntime: compactBoundary => {
      options.setCompactBoundary(compactBoundary);
    },
  };
}
