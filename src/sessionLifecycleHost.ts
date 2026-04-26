import { randomUUID } from "node:crypto";

export type SessionViewMessage = {
  role: "user" | "assistant";
  content: string;
  kind?: "chat" | "error" | "thinking" | "tool_use" | "tool_result";
  toolName?: string;
  toolInputPreview?: string;
  toolSummary?: string;
  toolIsError?: boolean;
};

export function buildClearedConversationState(
  createConversationId: () => ReturnType<typeof randomUUID> = randomUUID,
): {
  currentSessionId: undefined;
  transientConversationId: ReturnType<typeof randomUUID>;
} {
  return {
    currentSessionId: undefined,
    transientConversationId: createConversationId(),
  };
}

export async function beginNewConversationSession(options: {
  persistenceEnabled: boolean;
  workspaceHash: string;
  defaultTitle: string;
  createSession: (
    id: string,
    workspaceHash: string,
    title: string,
  ) => Promise<unknown>;
  setActiveSessionId: (id: string) => Promise<unknown>;
  createConversationId?: () => ReturnType<typeof randomUUID>;
}): Promise<{
  currentSessionId?: string;
  transientConversationId?: ReturnType<typeof randomUUID>;
  createdSessionId?: string;
  transient: boolean;
}> {
  const createConversationId = options.createConversationId ?? randomUUID;

  if (options.persistenceEnabled) {
    const sessionId = createConversationId();
    await options.createSession(
      sessionId,
      options.workspaceHash,
      options.defaultTitle,
    );
    await options.setActiveSessionId(sessionId);
    return {
      currentSessionId: sessionId,
      createdSessionId: sessionId,
      transient: false,
    };
  }

  const transientConversationId = createConversationId();
  await options.setActiveSessionId("");
  return {
    currentSessionId: undefined,
    transientConversationId,
    transient: true,
  };
}

export function mapSessionViewMessages(
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    kind?: "chat" | "error" | "thinking" | "tool_use" | "tool_result";
    toolName?: string;
    toolInputPreview?: string;
    toolSummary?: string;
    toolIsError?: boolean;
  }>,
): SessionViewMessage[] {
  return messages.map(message => ({
    role: message.role,
    content: message.content,
    ...(message.kind ? { kind: message.kind } : {}),
    ...(message.toolName ? { toolName: message.toolName } : {}),
    ...(message.toolInputPreview
      ? { toolInputPreview: message.toolInputPreview }
      : {}),
    ...(message.toolSummary ? { toolSummary: message.toolSummary } : {}),
    ...(typeof message.toolIsError === "boolean"
      ? { toolIsError: message.toolIsError }
      : {}),
  }));
}

export function buildSavedSessionRestoreState(options: {
  sessionId: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    kind?: "chat" | "error" | "thinking" | "tool_use" | "tool_result";
    toolName?: string;
    toolInputPreview?: string;
    toolSummary?: string;
    toolIsError?: boolean;
  }>;
}): {
  currentSessionId: string;
  sessionMessages: SessionViewMessage[];
  baselineCount: number;
} {
  const sessionMessages = mapSessionViewMessages(options.messages);
  return {
    currentSessionId: options.sessionId,
    sessionMessages,
    baselineCount: sessionMessages.length,
  };
}

export function buildDeletedActiveSessionState(
  createConversationId: () => ReturnType<typeof randomUUID> = randomUUID,
): {
  currentSessionId: undefined;
  transientConversationId: ReturnType<typeof randomUUID>;
  baselineCount: 0;
} {
  const clearedState = buildClearedConversationState(createConversationId);
  return {
    currentSessionId: clearedState.currentSessionId,
    transientConversationId: clearedState.transientConversationId,
    baselineCount: 0,
  };
}

export async function finalizeSessionMutation(options: {
  workspaceRoot?: string;
  hydrateWorkspace?: boolean;
  ensureConversationWorktreeHydrated?: (workspaceRoot: string) => Promise<void>;
  postState: () => void;
  refreshWorkspaceStatus?: () => void;
  shouldRefreshSessionsList: () => boolean;
  handleSessionsLoad: () => Promise<void>;
}): Promise<void> {
  if (
    options.hydrateWorkspace &&
    options.workspaceRoot &&
    options.ensureConversationWorktreeHydrated
  ) {
    await options.ensureConversationWorktreeHydrated(options.workspaceRoot);
  }

  options.postState();
  options.refreshWorkspaceStatus?.();

  if (options.shouldRefreshSessionsList()) {
    await options.handleSessionsLoad();
  }
}

export function clearConversationHostState(options: {
  resetAutoMemoryConversation: () => void;
  resetActiveRuntimeControllers: () => void;
  clearConversationBuffers: () => void;
  setCurrentSessionId: (id: undefined) => void;
  setTransientConversationId: (id: ReturnType<typeof randomUUID>) => void;
  resetPlanMode: () => void;
  clearPendingPlanVerification: () => void;
  clearCompactBoundary?: () => void;
  clearPendingPromptAttachments: () => void;
  markConversationBaseline: (count: number) => void;
  clearStreamingState: () => void;
  clearStreamingText: () => void;
  resetActivities: () => void;
  clearCachedTools: () => void;
  disposeSwarm: () => void;
  postState: () => void;
  createConversationId?: () => ReturnType<typeof randomUUID>;
}): void {
  options.resetAutoMemoryConversation();
  options.resetActiveRuntimeControllers();
  options.clearConversationBuffers();

  const clearedState = buildClearedConversationState(options.createConversationId);
  options.setCurrentSessionId(clearedState.currentSessionId);
  options.setTransientConversationId(clearedState.transientConversationId);

  options.resetPlanMode();
  options.clearPendingPlanVerification();
  options.clearCompactBoundary?.();
  options.clearPendingPromptAttachments();
  options.markConversationBaseline(0);
  options.clearStreamingState();
  options.clearStreamingText();
  options.resetActivities();
  options.clearCachedTools();
  options.disposeSwarm();
  options.postState();
}
