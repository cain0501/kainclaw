import type {
  IProviderAdapter,
  NormalizedMessage,
} from "../agent/providers/IProviderAdapter";
import {
  formatCompactSummary,
  getCompactUserSummaryMessage,
  isCompactUserSummaryMessage,
  mergeCompactUserSummaryMessage,
} from "./prompt";
import { estimateMessageTokens } from "./tokenBudget";

const DEFAULT_KEEP_RECENT_TOKENS = 12_000;
const MIN_RECENT_MESSAGES = 6;
const MIN_RECENT_MESSAGES_AFTER_EXISTING_SUMMARY = 2;
const MAX_RECENT_MESSAGES = 12;

export type CompactConversationMessage = Extract<
  NormalizedMessage,
  { role: "user" | "assistant" }
>;

export interface CompactConversationResult {
  wasCompacted: boolean;
  reason?: string;
  compactedHistory: CompactConversationMessage[];
  rawSummary?: string;
  formattedSummary?: string;
  messagesCompacted: number;
  messagesKept: number;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
}

export interface CompactConversationOptions {
  provider: IProviderAdapter;
  messages: NormalizedMessage[];
  onToken?: (token: string) => void;
  keepRecentTokenBudget?: number;
  minRecentMessages?: number;
  maxRecentMessages?: number;
  suppressFollowUpQuestions?: boolean;
  transcriptPath?: string;
}

function hasCompactionPreservableContent(
  message: CompactConversationMessage,
): boolean {
  if (message.role === "assistant" && (message.toolCalls?.length ?? 0) > 0) {
    return true;
  }

  if (message.content.trim().length > 0) {
    return true;
  }

  return message.role === "user" && (message.attachments?.length ?? 0) > 0;
}

function getAttachmentCompactionMarker(mimeType: string): string {
  const normalizedMimeType = mimeType.trim().toLowerCase();

  if (normalizedMimeType.startsWith("image/")) {
    return "[image]";
  }

  if (normalizedMimeType === "application/pdf") {
    return "[document]";
  }

  return `[attachment: ${mimeType || "unknown"}]`;
}

export function stripAttachmentsFromCompactSummaryInput(
  messages: CompactConversationMessage[],
): CompactConversationMessage[] {
  return messages.map(message => {
    if (message.role !== "user" || !message.attachments?.length) {
      return message;
    }

    const attachmentMarkers = message.attachments
      .map(attachment => getAttachmentCompactionMarker(attachment.mimeType))
      .join("\n");
    return {
      role: "user",
      content: [message.content.trim(), attachmentMarkers]
        .filter(Boolean)
        .join("\n"),
    };
  });
}

export function normalizeConversationMessages(
  messages: NormalizedMessage[],
): CompactConversationMessage[] {
  return messages.filter(
    (message): message is CompactConversationMessage =>
      (message.role === "user" || message.role === "assistant") &&
      hasCompactionPreservableContent(message),
  );
}

function getDefaultMinRecentMessages(hasExistingSummary: boolean): number {
  return hasExistingSummary
    ? MIN_RECENT_MESSAGES_AFTER_EXISTING_SUMMARY
    : MIN_RECENT_MESSAGES;
}

function selectRecentMessagesToKeep(
  messages: CompactConversationMessage[],
  options: {
    keepRecentTokenBudget: number;
    minRecentMessages: number;
    maxRecentMessages: number;
  },
): {
  startIndex: number;
  messagesToKeep: CompactConversationMessage[];
} {
  const keptMessages: CompactConversationMessage[] = [];
  let keptTokens = 0;

  if (messages.length <= options.minRecentMessages) {
    return {
      startIndex: messages.length,
      messagesToKeep: [],
    };
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    const messageTokens = estimateMessageTokens([message]);
    const mustKeepForMinimum = keptMessages.length < options.minRecentMessages;
    const withinBudget =
      keptMessages.length < options.maxRecentMessages &&
      keptTokens + messageTokens <= options.keepRecentTokenBudget;

    if (!mustKeepForMinimum && !withinBudget) {
      break;
    }

    keptMessages.unshift(message);
    keptTokens += messageTokens;
  }

  return {
    startIndex: messages.length - keptMessages.length,
    messagesToKeep: keptMessages,
  };
}

async function generateCompactSummary(
  provider: IProviderAdapter,
  messages: CompactConversationMessage[],
  onToken: (token: string) => void,
): Promise<string> {
  const step = await provider.runStep(messages, [], onToken);
  const summary = step.text.trim();

  if (!summary) {
    throw new Error("Compaction returned an empty summary.");
  }

  return summary;
}

export async function compactConversationHistory(
  options: CompactConversationOptions,
): Promise<CompactConversationResult> {
  const normalizedMessages = normalizeConversationMessages(options.messages);
  const estimatedTokensBefore = estimateMessageTokens(normalizedMessages);
  const existingSummaryMessage =
    normalizedMessages[0]?.role === "user" &&
    isCompactUserSummaryMessage(normalizedMessages[0].content)
      ? normalizedMessages[0]
      : undefined;
  const candidateMessages = existingSummaryMessage
    ? normalizedMessages.slice(1)
    : normalizedMessages;

  if (candidateMessages.length === 0) {
    return {
      wasCompacted: false,
      reason: existingSummaryMessage
        ? "Not enough new messages to compact beyond the existing summary."
        : "Not enough messages to compact.",
      compactedHistory: normalizedMessages,
      messagesCompacted: 0,
      messagesKept: normalizedMessages.length,
      estimatedTokensBefore,
      estimatedTokensAfter: estimatedTokensBefore,
    };
  }

  const selection = selectRecentMessagesToKeep(candidateMessages, {
    keepRecentTokenBudget:
      options.keepRecentTokenBudget ?? DEFAULT_KEEP_RECENT_TOKENS,
    minRecentMessages:
      options.minRecentMessages ??
      getDefaultMinRecentMessages(!!existingSummaryMessage),
    maxRecentMessages: options.maxRecentMessages ?? MAX_RECENT_MESSAGES,
  });

  const messagesToCompact = candidateMessages.slice(0, selection.startIndex);
  if (messagesToCompact.length === 0) {
    return {
      wasCompacted: false,
      reason: "Context is already small enough to keep verbatim.",
      compactedHistory: normalizedMessages,
      messagesCompacted: 0,
      messagesKept: normalizedMessages.length,
      estimatedTokensBefore,
      estimatedTokensAfter: estimatedTokensBefore,
    };
  }

  const rawSummary = await generateCompactSummary(
    options.provider,
    stripAttachmentsFromCompactSummaryInput(messagesToCompact),
    options.onToken ?? (() => {}),
  );
  const summaryMessage = existingSummaryMessage
    ? mergeCompactUserSummaryMessage({
        existingSummaryMessage: existingSummaryMessage.content,
        additionalSummary: rawSummary,
        suppressFollowUpQuestions: options.suppressFollowUpQuestions ?? true,
        transcriptPath: options.transcriptPath,
        recentMessagesPreserved: selection.messagesToKeep.length > 0,
      })
    : getCompactUserSummaryMessage(
        rawSummary,
        options.suppressFollowUpQuestions ?? true,
        options.transcriptPath,
        selection.messagesToKeep.length > 0,
      );
  const compactedHistory: CompactConversationMessage[] = [
    { role: "user", content: summaryMessage },
    ...selection.messagesToKeep,
  ];
  const estimatedTokensAfter = estimateMessageTokens(compactedHistory);

  return {
    wasCompacted: true,
    compactedHistory,
    rawSummary,
    formattedSummary: formatCompactSummary(rawSummary),
    messagesCompacted: messagesToCompact.length,
    messagesKept: selection.messagesToKeep.length,
    estimatedTokensBefore,
    estimatedTokensAfter,
  };
}
