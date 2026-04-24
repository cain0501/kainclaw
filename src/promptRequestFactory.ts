import type { SwarmCoordinator } from "./agent/swarm/SwarmCoordinator";
import type {
  PromptExecutionResult,
  PromptRuntimeLike,
} from "./promptExecutionHost";
import {
  assemblePromptHostBindings,
  type PromptHostAssemblyOptions,
} from "./promptHostFactory";
import { runPromptRequestWithHost } from "./promptRequestHost";
import type { ChatMessage } from "./storage/sessionRepository";

export async function runPromptRequestWithAssembly<
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
  hostAssembly: PromptHostAssemblyOptions<TRuntime>;
  assemblePromptHostBindingsImpl?: typeof assemblePromptHostBindings<TRuntime>;
  runPromptRequestWithHostImpl?: typeof runPromptRequestWithHost<
    SwarmCoordinator,
    TRuntime
  >;
}): Promise<PromptExecutionResult<TRuntime>> {
  const assemblePromptHostBindingsImpl =
    options.assemblePromptHostBindingsImpl ?? assemblePromptHostBindings;
  const bindings = assemblePromptHostBindingsImpl(options.hostAssembly);

  const runPromptRequestWithHostImpl =
    options.runPromptRequestWithHostImpl ?? runPromptRequestWithHost;

  return runPromptRequestWithHostImpl({
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
    assignCurrentSessionId: options.assignCurrentSessionId,
    bindings,
  });
}
