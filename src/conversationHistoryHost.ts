import type {
  ChatMessage,
  CompactBoundarySessionState,
  PersistedConversationMessage,
} from "./storage/sessionRepository";

export type HistoryCommandBehavior = "exclude" | "excludeWithReply";

export type ConversationHistoryBindings = {
  rebuildConversationMessagesFromSession: () => void;
  getVisibleSessionMessages: () => ChatMessage[];
  getConversationHistory: () => Array<
    PersistedConversationMessage & {
      attachments?: Array<{ data: string; mimeType: string }>;
    }
  >;
  replaceConversationHistory: (
    messages: Array<{
      role: PersistedConversationMessage["role"];
      content: string;
      attachments?: Array<{ data: string; mimeType: string }>;
    }>,
    compactBoundary?: CompactBoundarySessionState,
  ) => void;
};

export type ConversationHistoryBindingFactory = (options: {
  sessionMessages: ChatMessage[];
  conversationMessages: PersistedConversationMessage[];
}) => ConversationHistoryBindings;

export function getHistoryCommandBehavior(
  prompt: string,
): HistoryCommandBehavior | null {
  const command = prompt.trim().split(/\s+/)[0]?.toLowerCase();
  if (!command?.startsWith("/")) {
    return null;
  }

  if (
    command === "/effort" ||
    command === "/fast" ||
    command === "/compact" ||
    command === "/plan" ||
    command === "/exitplan"
  ) {
    return "excludeWithReply";
  }

  if (command === "/verify" || command === "/review") {
    return "exclude";
  }

  return null;
}

export function buildConversationHistoryFromSession(
  sessionMessages: ChatMessage[],
): PersistedConversationMessage[] {
  const conversationMessages: PersistedConversationMessage[] = [];
  let skipNextAssistant = false;

  for (const message of sessionMessages) {
    if (message.kind === "thinking") {
      continue;
    }

    if (message.role === "user") {
      const behavior = getHistoryCommandBehavior(message.content);
      if (behavior === "excludeWithReply") {
        skipNextAssistant = true;
        continue;
      }
      if (behavior === "exclude") {
        skipNextAssistant = false;
        continue;
      }
    } else if (skipNextAssistant && message.role === "assistant") {
      skipNextAssistant = false;
      continue;
    }

    skipNextAssistant = false;
    conversationMessages.push({
      role: message.role,
      content: message.content,
      ...(message.attachments && message.attachments.length > 0
        ? { attachments: message.attachments }
        : {}),
    });
  }

  return conversationMessages;
}

export function cloneConversationHistory(
  conversationMessages: Array<Pick<PersistedConversationMessage, "role" | "content"> & { attachments?: Array<{ data: string; mimeType: string }> }>,
): Array<PersistedConversationMessage & { attachments?: Array<{ data: string; mimeType: string }> }> {
  return conversationMessages.map(message => ({
    role: message.role,
    content: message.content,
    ...(message.attachments && message.attachments.length > 0 ? { attachments: message.attachments } : {}),
  }));
}

export function replaceConversationHistory(
  target: PersistedConversationMessage[],
  nextMessages: Array<Pick<PersistedConversationMessage, "role" | "content" | "attachments">>,
): void {
  target.length = 0;
  for (const message of nextMessages) {
    target.push({
      role: message.role,
      content: message.content,
      ...(message.attachments && message.attachments.length > 0
        ? { attachments: message.attachments }
        : {}),
    });
  }
}

export function getVisibleSessionMessages(
  sessionMessages: ChatMessage[],
  showThinkingSummaries: boolean,
): ChatMessage[] {
  if (showThinkingSummaries) {
    return sessionMessages;
  }

  return sessionMessages.filter(message => message.kind !== "thinking");
}

export function createConversationHistoryBindings(options: {
  sessionMessages: ChatMessage[];
  conversationMessages: PersistedConversationMessage[];
  getShowThinkingSummaries: () => boolean;
  recordCompactBoundary?: (
    compactBoundary: CompactBoundarySessionState | undefined,
  ) => void;
  persistCurrentSessionRuntimeState: () => void;
}): ConversationHistoryBindings {
  return {
    rebuildConversationMessagesFromSession: () => {
      replaceConversationHistory(
        options.conversationMessages,
        buildConversationHistoryFromSession(options.sessionMessages),
      );
    },
    getVisibleSessionMessages: () =>
      getVisibleSessionMessages(
        options.sessionMessages,
        options.getShowThinkingSummaries(),
      ),
    getConversationHistory: () =>
      cloneConversationHistory(options.conversationMessages),
    replaceConversationHistory: (messages, compactBoundary) => {
      if (compactBoundary) {
        options.recordCompactBoundary?.(compactBoundary);
      }
      replaceConversationHistory(options.conversationMessages, messages);
      options.persistCurrentSessionRuntimeState();
    },
  };
}

export function createConversationHistoryBindingsFactory(options: {
  getShowThinkingSummaries: () => boolean;
  recordCompactBoundary?: (
    compactBoundary: CompactBoundarySessionState | undefined,
  ) => void;
  persistCurrentSessionRuntimeState: () => void;
}): ConversationHistoryBindingFactory {
  return state =>
    createConversationHistoryBindings({
      sessionMessages: state.sessionMessages,
      conversationMessages: state.conversationMessages,
      getShowThinkingSummaries: options.getShowThinkingSummaries,
      recordCompactBoundary: options.recordCompactBoundary,
      persistCurrentSessionRuntimeState:
        options.persistCurrentSessionRuntimeState,
    });
}
