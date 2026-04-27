import type { ChatMessage } from "./storage/sessionRepository";

export type AssistantReplyPlan = {
  normalizedThinkingSummary?: string;
  sessionMessages: ChatMessage[];
  persistedMessages: ChatMessage[];
  conversationMessage?: { role: "assistant"; content: string };
  preview: string;
};

export function buildAssistantReplyPlan(options: {
  reply: string;
  includeInConversation?: boolean;
  thinkingSummary?: string;
  showThinkingSummaries: boolean;
}): AssistantReplyPlan {
  const normalizedThinkingSummary = options.showThinkingSummaries
    ? options.thinkingSummary?.trim() || undefined
    : undefined;

  const sessionMessages: ChatMessage[] = [];
  const persistedMessages: ChatMessage[] = [];

  if (normalizedThinkingSummary) {
    const thinkingMessage: ChatMessage = {
      role: "assistant",
      content: normalizedThinkingSummary,
      kind: "thinking",
    };
    sessionMessages.push(thinkingMessage);
    persistedMessages.push(thinkingMessage);
  }

  const replyMessage: ChatMessage = {
    role: "assistant",
    content: options.reply,
  };
  sessionMessages.push(replyMessage);
  persistedMessages.push(replyMessage);

  return {
    normalizedThinkingSummary,
    sessionMessages,
    persistedMessages,
    ...(options.includeInConversation !== false
      ? { conversationMessage: { role: "assistant" as const, content: options.reply } }
      : {}),
    preview: options.reply.slice(0, 80),
  };
}

export async function persistAssistantReply(options: {
  enabled: boolean;
  currentSessionId?: string;
  persistedMessages: ChatMessage[];
  preview: string;
  appendMessages: (
    sessionId: string,
    messages: ChatMessage[],
    metaPatch?: { updatedAt?: number; preview?: string },
  ) => Promise<unknown>;
  logPersisted?: (details: {
    sessionId: string;
    hasThinkingSummary: boolean;
    replyPreview: string;
  }) => void;
  hasThinkingSummary: boolean;
}): Promise<boolean> {
  if (!options.enabled || !options.currentSessionId) {
    return false;
  }

  await options.appendMessages(options.currentSessionId, options.persistedMessages, {
    updatedAt: Date.now(),
    preview: options.preview,
  });
  options.logPersisted?.({
    sessionId: options.currentSessionId,
    hasThinkingSummary: options.hasThinkingSummary,
    replyPreview: options.preview,
  });
  return true;
}

export async function recordAssistantReplyWithHost(options: {
  reply: string;
  includeInConversation?: boolean;
  thinkingSummary?: string;
  showThinkingSummaries: boolean;
  appendSessionMessages: (messages: ChatMessage[]) => void;
  appendConversationMessage: (message: { role: "assistant"; content: string }) => void;
  persistCurrentSessionRuntimeState: () => void;
  persistenceEnabled: boolean;
  currentSessionId?: string;
  appendMessages: (
    sessionId: string,
    messages: ChatMessage[],
    metaPatch?: { updatedAt?: number; preview?: string },
  ) => Promise<unknown>;
  logPersisted?: (details: {
    sessionId: string;
    hasThinkingSummary: boolean;
    replyPreview: string;
  }) => void;
}): Promise<void> {
  const replyPlan = buildAssistantReplyPlan({
    reply: options.reply,
    includeInConversation: options.includeInConversation,
    thinkingSummary: options.thinkingSummary,
    showThinkingSummaries: options.showThinkingSummaries,
  });

  options.appendSessionMessages(replyPlan.sessionMessages);
  if (replyPlan.conversationMessage) {
    options.appendConversationMessage(replyPlan.conversationMessage);
  }

  options.persistCurrentSessionRuntimeState();

  await persistAssistantReply({
    enabled: options.persistenceEnabled,
    currentSessionId: options.currentSessionId,
    persistedMessages: replyPlan.persistedMessages,
    preview: replyPlan.preview,
    appendMessages: options.appendMessages,
    logPersisted: options.logPersisted,
    hasThinkingSummary: !!replyPlan.normalizedThinkingSummary,
  });
}

export type AssistantReplyBindings = {
  recordAssistantReply: (
    reply: string,
    includeInConversation?: boolean,
    thinkingSummary?: string,
  ) => Promise<void>;
};

export type AssistantReplyBindingFactory = (options: {
  appendSessionMessages: (messages: ChatMessage[]) => void;
  appendConversationMessage: (
    message: { role: "assistant"; content: string },
  ) => void;
}) => AssistantReplyBindings;

export function createAssistantReplyBindings(options: {
  getShowThinkingSummaries: () => boolean;
  appendSessionMessages: (messages: ChatMessage[]) => void;
  appendConversationMessage: (message: { role: "assistant"; content: string }) => void;
  persistCurrentSessionRuntimeState: () => void;
  getPersistenceEnabled: () => boolean;
  getCurrentSessionId: () => string | undefined;
  appendMessages: (
    sessionId: string,
    messages: ChatMessage[],
    metaPatch?: { updatedAt?: number; preview?: string },
  ) => Promise<unknown>;
  logPersisted?: (details: {
    sessionId: string;
    hasThinkingSummary: boolean;
    replyPreview: string;
  }) => void;
}): AssistantReplyBindings {
  return {
    recordAssistantReply: (reply, includeInConversation = true, thinkingSummary) =>
      recordAssistantReplyWithHost({
        reply,
        includeInConversation,
        thinkingSummary,
        showThinkingSummaries: options.getShowThinkingSummaries(),
        appendSessionMessages: options.appendSessionMessages,
        appendConversationMessage: options.appendConversationMessage,
        persistCurrentSessionRuntimeState: options.persistCurrentSessionRuntimeState,
        persistenceEnabled: options.getPersistenceEnabled(),
        currentSessionId: options.getCurrentSessionId(),
        appendMessages: options.appendMessages,
        logPersisted: options.logPersisted,
      }),
  };
}

export function createAssistantReplyBindingsFactory(options: {
  getShowThinkingSummaries: () => boolean;
  persistCurrentSessionRuntimeState: () => void;
  getPersistenceEnabled: () => boolean;
  getCurrentSessionId: () => string | undefined;
  appendMessages: (
    sessionId: string,
    messages: ChatMessage[],
    metaPatch?: { updatedAt?: number; preview?: string },
  ) => Promise<unknown>;
  logPersisted?: (details: {
    sessionId: string;
    hasThinkingSummary: boolean;
    replyPreview: string;
  }) => void;
}): AssistantReplyBindingFactory {
  return state =>
    createAssistantReplyBindings({
      getShowThinkingSummaries: options.getShowThinkingSummaries,
      appendSessionMessages: state.appendSessionMessages,
      appendConversationMessage: state.appendConversationMessage,
      persistCurrentSessionRuntimeState:
        options.persistCurrentSessionRuntimeState,
      getPersistenceEnabled: options.getPersistenceEnabled,
      getCurrentSessionId: options.getCurrentSessionId,
      appendMessages: options.appendMessages,
      logPersisted: options.logPersisted,
    });
}
