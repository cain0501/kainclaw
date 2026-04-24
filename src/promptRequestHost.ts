import { preparePromptEntryWithHost } from "./promptEntryHost";
import { runPromptFlowWithHost } from "./promptFlowHost";
import type { PromptHostBindings } from "./promptHost";
import type { PromptExecutionResult, PromptRuntimeLike } from "./promptExecutionHost";
import type { ChatMessage } from "./storage/sessionRepository";

export async function runPromptRequestWithHost<
  TSwarm,
  TRuntime extends PromptRuntimeLike,
>(options: {
  prompt: string;
  workspaceFolderPath: string;
  currentSessionId?: string;
  sessionMessagesLength: number;
  isSessionPersistenceEnabled: boolean;
  getWorkspaceHash: (workspaceRoot?: string) => string;
  logSession: (
    event: "prompt-start" | "session-created" | "user-message-persisted",
    details: Record<string, unknown>,
  ) => void;
  createSession: (
    id: string,
    workspaceHash: string,
    title: string,
  ) => Promise<unknown>;
  setActiveSessionId: (id: string) => Promise<unknown>;
  ensureSession: (
    id: string,
    workspaceHash: string,
    title: string,
  ) => Promise<unknown>;
  appendMessages: (
    sessionId: string,
    messages: ChatMessage[],
    metaPatch?: { title?: string; updatedAt?: number; preview?: string },
  ) => Promise<unknown>;
  assignCurrentSessionId: (sessionId: string | undefined) => void;
  bindings: PromptHostBindings<TSwarm, TRuntime>;
}): Promise<PromptExecutionResult<TRuntime>> {
  const promptEntry = await preparePromptEntryWithHost<TRuntime>({
    prompt: options.prompt,
    workspaceFolderPath: options.workspaceFolderPath,
    currentSessionId: options.currentSessionId,
    sessionMessagesLength: options.sessionMessagesLength,
    isSessionPersistenceEnabled: options.isSessionPersistenceEnabled,
    getWorkspaceHash: options.getWorkspaceHash,
    logSession: options.logSession,
    createSession: options.createSession,
    setActiveSessionId: options.setActiveSessionId,
    ensureSession: options.ensureSession,
    appendMessages: options.appendMessages,
    bindings: options.bindings.entryBindings,
  });

  options.assignCurrentSessionId(promptEntry.currentSessionId);

  await runPromptFlowWithHost<TSwarm, TRuntime>({
    prompt: options.prompt,
    promptExecution: promptEntry.promptExecution,
    ...options.bindings.flowBindings,
  });

  return promptEntry.promptExecution;
}
