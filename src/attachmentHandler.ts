import type { NormalizedImageAttachment } from "./agent/providers/IProviderAdapter";
import type { WebviewAttachment } from "./chatCommandHost";

type ConversationAttachmentMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: NormalizedImageAttachment[];
};

export function normalizeWebviewAttachments(
  attachments?: WebviewAttachment[],
): NormalizedImageAttachment[] | undefined {
  if (!attachments || attachments.length === 0) {
    return undefined;
  }

  return attachments.map(attachment => ({
    data: attachment.dataUrl.replace(/^data:[^;]+;base64,/, ""),
    mimeType: attachment.mimeType,
  }));
}

export function mergePendingAttachmentsIntoConversationMessage<
  TMessage extends ConversationAttachmentMessage,
>(options: {
  message: TMessage;
  pendingAttachments?: NormalizedImageAttachment[];
}): {
  message: TMessage;
  remainingPendingAttachments?: NormalizedImageAttachment[];
} {
  if (
    options.message.role === "user" &&
    options.pendingAttachments &&
    options.pendingAttachments.length > 0
  ) {
    return {
      message: {
        ...options.message,
        attachments: options.pendingAttachments,
      },
      remainingPendingAttachments: undefined,
    };
  }

  return {
    message: options.message,
    remainingPendingAttachments: options.pendingAttachments,
  };
}
