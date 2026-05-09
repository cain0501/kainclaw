import type {
  ChatMessage,
  CompactBoundarySessionState,
  PersistedConversationMessage,
} from "./storage/sessionRepository";
import type { NormalizedMessage } from "./agent/providers/IProviderAdapter";

export type HistoryCommandBehavior = "exclude" | "excludeWithReply";

export type ConversationHistoryBindings = {
  rebuildConversationMessagesFromSession: () => void;
  getVisibleSessionMessages: () => ChatMessage[];
  getConversationHistory: () => NormalizedMessage[];
  replaceConversationHistory: (
    messages: NormalizedMessage[],
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
): NormalizedMessage[] {
  const conversationMessages: NormalizedMessage[] = [];
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
    if (message.role === "user") {
      conversationMessages.push({
        role: "user",
        content: message.content,
        ...(message.attachments && message.attachments.length > 0
          ? { attachments: message.attachments }
          : {}),
      });
      continue;
    }

    conversationMessages.push({
      role: "assistant",
      content: message.content,
    });
  }

  return conversationMessages;
}

export function cloneConversationHistory(
  conversationMessages: Array<NormalizedMessage | PersistedConversationMessage>,
): NormalizedMessage[] {
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
        ...(message.reasoningContent
          ? { reasoningContent: message.reasoningContent }
          : {}),
        ...(message.toolCalls?.length ? { toolCalls: message.toolCalls } : {}),
      };
    }

    return {
      role: "tool_result",
      toolCallId: message.toolCallId ?? "",
      content: message.content,
      ...(message.isError ? { isError: message.isError } : {}),
    };
  });
}

export function replaceConversationHistory(
  target: PersistedConversationMessage[],
  nextMessages: NormalizedMessage[],
): void {
  target.length = 0;
  for (const message of nextMessages) {
    if (message.role === "user") {
      target.push({
        role: "user",
        content: message.content,
        ...(message.attachments && message.attachments.length > 0
          ? { attachments: message.attachments }
          : {}),
      });
      continue;
    }

    if (message.role === "assistant") {
      target.push({
        role: "assistant",
        content: message.content,
        ...(message.reasoningContent
          ? { reasoningContent: message.reasoningContent }
          : {}),
        ...(message.toolCalls?.length ? { toolCalls: message.toolCalls } : {}),
      });
      continue;
    }

    target.push({
      role: "tool_result",
      toolCallId: message.toolCallId,
      content: message.content,
      ...(message.isError ? { isError: message.isError } : {}),
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
