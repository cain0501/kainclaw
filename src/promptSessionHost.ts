import { randomUUID } from "node:crypto";

type AppendMessageInput = {
  role: "user" | "assistant";
  content: string;
};

export type PromptSessionPersistenceResult = {
  currentSessionId?: string;
  createdSessionId?: string;
  persistedSessionId?: string;
  promptTitle: string;
  promptPreview: string;
};

export async function persistUserPromptSession(options: {
  enabled: boolean;
  currentSessionId?: string;
  workspaceHash: string;
  prompt: string;
  sessionMessagesLength: number;
  createSession: (id: string, workspaceHash: string, title: string) => Promise<unknown>;
  setActiveSessionId: (id: string) => Promise<unknown>;
  ensureSession: (id: string, workspaceHash: string, title: string) => Promise<unknown>;
  appendMessages: (
    sessionId: string,
    messages: AppendMessageInput[],
    metaPatch?: { title?: string; updatedAt?: number; preview?: string },
  ) => Promise<unknown>;
  createSessionId?: () => string;
}): Promise<PromptSessionPersistenceResult> {
  const promptTitle = options.prompt.slice(0, 40);
  const promptPreview = options.prompt.slice(0, 80);

  if (!options.enabled) {
    return {
      currentSessionId: options.currentSessionId,
      promptTitle,
      promptPreview,
    };
  }

  let currentSessionId = options.currentSessionId;
  let createdSessionId: string | undefined;

  if (!currentSessionId) {
    currentSessionId = options.createSessionId?.() ?? randomUUID();
    await options.createSession(currentSessionId, options.workspaceHash, promptTitle);
    await options.setActiveSessionId(currentSessionId);
    createdSessionId = currentSessionId;
  }

  await options.ensureSession(currentSessionId, options.workspaceHash, promptTitle);
  await options.appendMessages(
    currentSessionId,
    [{ role: "user", content: options.prompt }],
    options.sessionMessagesLength === 1
      ? {
          title: promptTitle,
          updatedAt: Date.now(),
          preview: promptPreview,
        }
      : {
          updatedAt: Date.now(),
        },
  );

  return {
    currentSessionId,
    createdSessionId,
    persistedSessionId: currentSessionId,
    promptTitle,
    promptPreview,
  };
}
