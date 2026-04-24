export type WebviewAttachment = {
  dataUrl: string;
  mimeType: string;
  name: string;
};

export async function handleChatWebviewMessage(options: {
  message: {
    type?: unknown;
    prompt?: unknown;
    action?: unknown;
    attachments?: unknown;
  };
  ensureReadySequence: () => Promise<void>;
  clearChat: () => void;
  sendPrompt: (prompt: string, attachments?: WebviewAttachment[]) => Promise<void>;
  runQuickAction: (action: string) => Promise<void>;
  resolvePendingApproval: (approved: boolean) => void;
  requestEditorSelection: () => void;
}): Promise<boolean> {
  const type = typeof options.message.type === "string" ? options.message.type : "";

  switch (type) {
    case "ready":
      await options.ensureReadySequence();
      return true;
    case "clearChat":
      options.clearChat();
      return true;
    case "sendPrompt": {
      const attachments = parseWebviewAttachments(options.message.attachments);
      await options.sendPrompt(String(options.message.prompt || ""), attachments);
      return true;
    }
    case "runQuickAction":
      await options.runQuickAction(String(options.message.action || ""));
      return true;
    case "approvePendingAction":
      options.resolvePendingApproval(true);
      return true;
    case "rejectPendingAction":
      options.resolvePendingApproval(false);
      return true;
    case "requestEditorSelection":
      options.requestEditorSelection();
      return true;
    default:
      return false;
  }
}

function parseWebviewAttachments(raw: unknown): WebviewAttachment[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const result: WebviewAttachment[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).dataUrl === "string" &&
      typeof (item as Record<string, unknown>).mimeType === "string" &&
      typeof (item as Record<string, unknown>).name === "string"
    ) {
      const att = item as Record<string, string>;
      result.push({ dataUrl: att.dataUrl, mimeType: att.mimeType, name: att.name });
    }
  }
  return result.length > 0 ? result : undefined;
}
