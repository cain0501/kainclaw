import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Session storage layout
 *
 *   globalStorageUri/sessions/
 *     index.json             -> { sessions: SessionMeta[] }
 *     <sessionId>.jsonl      -> appended ChatMessage records
 *     <sessionId>.state.json -> persisted runtime/session sidecar state
 *
 * globalState stores the activeSessionId separately.
 */

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  kind?: "chat" | "error" | "thinking" | "tool_use" | "tool_result";
  timestamp?: number;
  excludeFromConversation?: boolean;
  toolName?: string;
  toolInputPreview?: string;
  toolSummary?: string;
  toolIsError?: boolean;
  /** Optional image attachments (base64 data), used for conversation history sent to provider */
  attachments?: Array<{ data: string; mimeType: string }>;
  /** Optional generated image results rendered in the chat UI */
  generatedImages?: Array<{
    id: string;
    src: string;
    source?: "generate" | "edit" | "variant";
    prompt?: string;
    revisedPrompt?: string;
  }>;
};

export type PendingPlanVerificationSessionState = {
  planFilePath: string;
  planContent: string;
  approvedAtUserTurnCount: number;
  verificationStarted: boolean;
  verificationCompleted: boolean;
};

export type PersistedConversationMessage = {
  role: "user" | "assistant" | "tool_result";
  content: string;
  /** DeepSeek thinking mode: stored to pass back on subsequent turns. */
  reasoningContent?: string;
  toolCallId?: string;
  isError?: boolean;
  toolCalls?: Array<{
    id: string;
    name: string;
    input: Record<string, unknown>;
  }>;
  attachments?: Array<{ data: string; mimeType: string }>;
  generatedImages?: Array<{
    id: string;
    src: string;
    source?: "generate" | "edit" | "variant";
    prompt?: string;
    revisedPrompt?: string;
  }>;
};

export type CompactBoundarySessionState = {
  trigger: "manual" | "auto";
  compactedAt: number;
  preTokens: number;
  postTokens: number;
  messagesSummarized: number;
  messagesKept: number;
  preservedRecentMessages: boolean;
  transcriptPath?: string;
};

export type ArtifactPanelSessionState = {
  activeArtifactId: string | null;
  collapsed?: boolean;
};

export type DesignFlowState = {
  flowId: string;
  projectId: string;
  conversationId?: string;
  createdAt: number;
  conversationHistory?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
};

export type SessionRuntimeState = {
  pendingPlanVerification?: PendingPlanVerificationSessionState;
  modelConversation?: PersistedConversationMessage[];
  compactBoundary?: CompactBoundarySessionState;
  artifactPanel?: ArtifactPanelSessionState;
  designFlowState?: DesignFlowState;
  workspaceRoot?: string;
  sessionType?: "design" | "default";
};

export type SessionMeta = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  workspaceHash: string;
  preview: string;
  messageCount: number;
};

export type SessionIndex = {
  sessions: SessionMeta[];
};

const DEFAULT_SESSION_TITLE = "新对话";

export class SessionRepository {
  private readonly sessionsDir: string;
  private readonly indexPath: string;
  private indexCache: SessionIndex | undefined;
  private indexDirty = false;
  private indexFlushTimer: ReturnType<typeof setTimeout> | undefined;
  private indexFlushPromise: Promise<void> = Promise.resolve();

  constructor(storagePath: string) {
    this.sessionsDir = path.join(storagePath, "sessions");
    this.indexPath = path.join(this.sessionsDir, "index.json");
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.sessionsDir, { recursive: true });
  }

  private getTranscriptPath(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.jsonl`);
  }

  private getStateFilePath(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.state.json`);
  }

  private normalizeIndex(index: SessionIndex | undefined): SessionIndex {
    const rawSessions = Array.isArray(index?.sessions) ? index.sessions : [];
    const sessions = rawSessions
      .filter(session => session && typeof session.id === "string")
      .map(session => ({
        id: session.id,
        title: typeof session.title === "string" ? session.title : DEFAULT_SESSION_TITLE,
        createdAt: typeof session.createdAt === "number" ? session.createdAt : Date.now(),
        updatedAt:
          typeof session.updatedAt === "number"
            ? session.updatedAt
            : typeof session.createdAt === "number"
              ? session.createdAt
              : Date.now(),
        workspaceHash: typeof session.workspaceHash === "string" ? session.workspaceHash : "",
        preview: typeof session.preview === "string" ? session.preview : "",
        messageCount:
          typeof session.messageCount === "number" && Number.isFinite(session.messageCount)
            ? Math.max(0, Math.floor(session.messageCount))
            : 0,
      }))
      .sort((left, right) => {
        if (right.updatedAt !== left.updatedAt) {
          return right.updatedAt - left.updatedAt;
        }
        return right.createdAt - left.createdAt;
      });

    return { sessions };
  }

  private cloneIndex(index: SessionIndex): SessionIndex {
    return {
      sessions: index.sessions.map(session => ({ ...session })),
    };
  }

  private setIndexCache(index: SessionIndex, dirty = false): SessionIndex {
    const normalized = this.normalizeIndex(index);
    this.indexCache = normalized;
    if (dirty) {
      this.indexDirty = true;
    }
    return normalized;
  }

  async readIndex(): Promise<SessionIndex> {
    if (this.indexCache) {
      return this.cloneIndex(this.indexCache);
    }

    try {
      const raw = await fs.readFile(this.indexPath, "utf8");
      const normalized = this.setIndexCache(JSON.parse(raw) as SessionIndex);
      return this.cloneIndex(normalized);
    } catch {
      const emptyIndex = this.setIndexCache({ sessions: [] });
      return this.cloneIndex(emptyIndex);
    }
  }

  private async writeIndex(index: SessionIndex): Promise<void> {
    this.setIndexCache(index, true);
    await this.flush();
  }

  private scheduleIndexWrite(index: SessionIndex): void {
    this.setIndexCache(index, true);
    if (this.indexFlushTimer) {
      return;
    }

    this.indexFlushTimer = setTimeout(() => {
      this.indexFlushTimer = undefined;
      void this.flush();
    }, 1000);
  }

  async flush(): Promise<void> {
    if (this.indexFlushTimer) {
      clearTimeout(this.indexFlushTimer);
      this.indexFlushTimer = undefined;
    }

    const runFlush = this.indexFlushPromise
      .catch(() => undefined)
      .then(async () => {
        while (this.indexDirty && this.indexCache) {
          this.indexDirty = false;
          const snapshot = this.cloneIndex(this.indexCache);
          await this.ensureDir();
          await fs.writeFile(
            this.indexPath,
            JSON.stringify(snapshot, null, 2),
            "utf8",
          );
          this.indexCache = snapshot;
        }
      });

    this.indexFlushPromise = runFlush;
    await runFlush;
  }

  async createSession(
    id: string,
    workspaceHash: string,
    title = DEFAULT_SESSION_TITLE,
  ): Promise<SessionMeta> {
    const now = Date.now();
    const meta: SessionMeta = {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      workspaceHash,
      preview: "",
      messageCount: 0,
    };
    const index = await this.readIndex();
    index.sessions.unshift(meta);
    await this.writeIndex(index);
    return meta;
  }

  async ensureSession(
    id: string,
    workspaceHash: string,
    title = DEFAULT_SESSION_TITLE,
  ): Promise<SessionMeta> {
    const index = await this.readIndex();
    const now = Date.now();
    const existing = index.sessions.find(session => session.id === id);

    if (existing) {
      if (!existing.workspaceHash && workspaceHash) {
        existing.workspaceHash = workspaceHash;
      }
      if ((!existing.title || existing.title === DEFAULT_SESSION_TITLE) && title) {
        existing.title = title;
      }
      if (!existing.createdAt) {
        existing.createdAt = now;
      }
      if (!existing.updatedAt) {
        existing.updatedAt = now;
      }
      await this.writeIndex(index);
      return existing;
    }

    const meta: SessionMeta = {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      workspaceHash,
      preview: "",
      messageCount: 0,
    };
    index.sessions.unshift(meta);
    await this.writeIndex(index);
    return meta;
  }

  async getSessionMeta(id: string): Promise<SessionMeta | undefined> {
    const index = await this.readIndex();
    return index.sessions.find(session => session.id === id);
  }

  async updateMeta(
    id: string,
    patch: Partial<Pick<SessionMeta, "title" | "updatedAt" | "preview">>,
  ): Promise<void> {
    const index = await this.readIndex();
    const meta = index.sessions.find(session => session.id === id);
    if (!meta) {
      return;
    }

    const nextMeta = {
      ...meta,
      ...patch,
    };
    if (
      nextMeta.title === meta.title &&
      nextMeta.updatedAt === meta.updatedAt &&
      nextMeta.preview === meta.preview
    ) {
      return;
    }

    Object.assign(meta, patch);
    await this.writeIndex(index);
  }

  async deleteSession(id: string): Promise<void> {
    const index = await this.readIndex();
    index.sessions = index.sessions.filter(session => session.id !== id);
    await this.writeIndex(index);

    await Promise.allSettled([
      fs.unlink(this.getTranscriptPath(id)),
      fs.unlink(this.getStateFilePath(id)),
    ]);
  }

  async appendMessages(
    sessionId: string,
    messages: ChatMessage[],
    metaPatch?: Partial<Pick<SessionMeta, "title" | "updatedAt" | "preview">>,
  ): Promise<void> {
    if (messages.length === 0) {
      return;
    }

    await this.ensureDir();
    const normalizedMessages = messages.map(message => ({
      ...message,
      timestamp: message.timestamp ?? Date.now(),
    }));
    const lines = normalizedMessages
      .map(message => JSON.stringify(message) + "\n")
      .join("");
    await fs.appendFile(this.getTranscriptPath(sessionId), lines, "utf8");

    const index = await this.readIndex();
    const meta = index.sessions.find(session => session.id === sessionId);
    const lastMessage = normalizedMessages[normalizedMessages.length - 1]!;
    const firstTimestamp = normalizedMessages[0]!.timestamp!;
    const lastTimestamp = lastMessage.timestamp!;
    if (!meta) {
      index.sessions.unshift({
        id: sessionId,
        title:
          metaPatch?.title ??
          (lastMessage.role === "user" && lastMessage.content.trim()
            ? lastMessage.content.trim().slice(0, 40)
            : DEFAULT_SESSION_TITLE),
        createdAt: firstTimestamp,
        updatedAt: metaPatch?.updatedAt ?? lastTimestamp,
        workspaceHash: "",
        preview: metaPatch?.preview ?? lastMessage.content.slice(0, 80),
        messageCount: normalizedMessages.length,
      });
      this.scheduleIndexWrite(index);
      return;
    }

    meta.updatedAt = metaPatch?.updatedAt ?? lastTimestamp;
    if (metaPatch?.title !== undefined) {
      meta.title = metaPatch.title;
    }
    if (metaPatch?.preview !== undefined) {
      meta.preview = metaPatch.preview;
    }
    meta.messageCount += normalizedMessages.length;
    this.scheduleIndexWrite(index);
  }

  async loadMessages(sessionId: string): Promise<ChatMessage[]> {
    try {
      const raw = await fs.readFile(this.getTranscriptPath(sessionId), "utf8");
      return raw
        .split("\n")
        .filter(line => line.trim())
        .map(line => JSON.parse(line) as ChatMessage);
    } catch {
      return [];
    }
  }

  async loadRuntimeState(sessionId: string): Promise<SessionRuntimeState> {
    try {
      const raw = await fs.readFile(this.getStateFilePath(sessionId), "utf8");
      const parsed = JSON.parse(raw) as SessionRuntimeState;
      const modelConversation = Array.isArray(parsed.modelConversation)
        ? parsed.modelConversation
            .filter(
              (
                message,
              ): message is PersistedConversationMessage =>
                !!message &&
                (message.role === "user" || message.role === "assistant") &&
                typeof message.content === "string",
            )
            .map(message => ({
              role: message.role,
              content: message.content,
              ...(Array.isArray(message.attachments) &&
              message.attachments.every(
                attachment =>
                  !!attachment &&
                  typeof attachment.data === "string" &&
                  typeof attachment.mimeType === "string",
              )
                ? {
                    attachments: message.attachments.map(attachment => ({
                      data: attachment.data,
                      mimeType: attachment.mimeType,
                    })),
                  }
                : {}),
              ...(Array.isArray(message.generatedImages) &&
              message.generatedImages.every(
                image =>
                  !!image &&
                  typeof image.id === "string" &&
                  typeof image.src === "string" &&
                  (
                    image.source === undefined ||
                    image.source === "generate" ||
                    image.source === "edit" ||
                    image.source === "variant"
                  ) &&
                  (image.prompt === undefined || typeof image.prompt === "string") &&
                  (image.revisedPrompt === undefined || typeof image.revisedPrompt === "string"),
              )
                ? {
                    generatedImages: message.generatedImages.map(image => ({
                      id: image.id,
                      src: image.src,
                      ...(image.source ? { source: image.source } : {}),
                      ...(typeof image.prompt === "string" ? { prompt: image.prompt } : {}),
                      ...(typeof image.revisedPrompt === "string"
                        ? { revisedPrompt: image.revisedPrompt }
                        : {}),
                    })),
                  }
                : {}),
            }))
        : undefined;
      const compactBoundary =
        parsed.compactBoundary &&
        (parsed.compactBoundary.trigger === "manual" ||
          parsed.compactBoundary.trigger === "auto") &&
        typeof parsed.compactBoundary.compactedAt === "number" &&
        typeof parsed.compactBoundary.preTokens === "number" &&
        typeof parsed.compactBoundary.postTokens === "number" &&
        typeof parsed.compactBoundary.messagesSummarized === "number" &&
        typeof parsed.compactBoundary.messagesKept === "number" &&
        typeof parsed.compactBoundary.preservedRecentMessages === "boolean"
          ? {
              trigger: parsed.compactBoundary.trigger,
              compactedAt: parsed.compactBoundary.compactedAt,
              preTokens: parsed.compactBoundary.preTokens,
              postTokens: parsed.compactBoundary.postTokens,
              messagesSummarized: parsed.compactBoundary.messagesSummarized,
              messagesKept: parsed.compactBoundary.messagesKept,
              preservedRecentMessages:
                parsed.compactBoundary.preservedRecentMessages,
              ...(typeof parsed.compactBoundary.transcriptPath === "string"
                ? { transcriptPath: parsed.compactBoundary.transcriptPath }
                : {}),
            }
          : undefined;

      return {
        pendingPlanVerification: parsed.pendingPlanVerification,
        ...(typeof parsed.workspaceRoot === "string"
          ? { workspaceRoot: parsed.workspaceRoot }
          : {}),
        ...(parsed.sessionType === "design" || parsed.sessionType === "default"
          ? { sessionType: parsed.sessionType }
          : {}),
        ...(parsed.designFlowState &&
        typeof parsed.designFlowState.flowId === "string" &&
        typeof parsed.designFlowState.projectId === "string" &&
        typeof parsed.designFlowState.createdAt === "number"
          ? {
              designFlowState: {
                flowId: parsed.designFlowState.flowId,
                projectId: parsed.designFlowState.projectId,
                createdAt: parsed.designFlowState.createdAt,
                ...(typeof parsed.designFlowState.conversationId === "string"
                  ? { conversationId: parsed.designFlowState.conversationId }
                  : {}),
                ...(Array.isArray(parsed.designFlowState.conversationHistory)
                  ? {
                      conversationHistory: parsed.designFlowState.conversationHistory
                        .filter(
                          (
                            message,
                          ): message is { role: "user" | "assistant"; content: string } =>
                            !!message &&
                            (message.role === "user" || message.role === "assistant") &&
                            typeof message.content === "string",
                        )
                        .map(message => ({
                          role: message.role,
                          content: message.content,
                        })),
                    }
                  : {}),
              },
            }
          : {}),
        ...(parsed.artifactPanel &&
        (parsed.artifactPanel.activeArtifactId === null ||
          typeof parsed.artifactPanel.activeArtifactId === "string")
          ? {
              artifactPanel: {
                activeArtifactId: parsed.artifactPanel.activeArtifactId,
                ...(typeof parsed.artifactPanel.collapsed === "boolean"
                  ? { collapsed: parsed.artifactPanel.collapsed }
                  : {}),
              },
            }
          : {}),
        ...(modelConversation && modelConversation.length > 0
          ? { modelConversation }
          : {}),
        ...(compactBoundary ? { compactBoundary } : {}),
      };
    } catch {
      return {};
    }
  }

  async saveRuntimeState(
    sessionId: string,
    state: SessionRuntimeState,
  ): Promise<void> {
    await this.ensureDir();

    const normalizedState: SessionRuntimeState = {
      ...(state.pendingPlanVerification
        ? { pendingPlanVerification: state.pendingPlanVerification }
        : {}),
      ...(typeof state.workspaceRoot === "string"
        ? { workspaceRoot: state.workspaceRoot }
        : {}),
      ...(state.sessionType === "design" || state.sessionType === "default"
        ? { sessionType: state.sessionType }
        : {}),
      ...(state.designFlowState &&
      typeof state.designFlowState.flowId === "string" &&
      typeof state.designFlowState.projectId === "string" &&
      typeof state.designFlowState.createdAt === "number"
        ? {
            designFlowState: {
              flowId: state.designFlowState.flowId,
              projectId: state.designFlowState.projectId,
              createdAt: state.designFlowState.createdAt,
              ...(typeof state.designFlowState.conversationId === "string"
                ? { conversationId: state.designFlowState.conversationId }
                : {}),
              ...(Array.isArray(state.designFlowState.conversationHistory)
                ? {
                    conversationHistory: state.designFlowState.conversationHistory
                      .filter(
                        (
                          message,
                        ): message is { role: "user" | "assistant"; content: string } =>
                          !!message &&
                          (message.role === "user" || message.role === "assistant") &&
                          typeof message.content === "string",
                      )
                      .map(message => ({
                        role: message.role,
                        content: message.content,
                      })),
                  }
                : {}),
            },
          }
        : {}),
      ...(state.compactBoundary
        ? {
            compactBoundary: {
              trigger: state.compactBoundary.trigger,
              compactedAt: state.compactBoundary.compactedAt,
              preTokens: state.compactBoundary.preTokens,
              postTokens: state.compactBoundary.postTokens,
              messagesSummarized: state.compactBoundary.messagesSummarized,
              messagesKept: state.compactBoundary.messagesKept,
              preservedRecentMessages:
                state.compactBoundary.preservedRecentMessages,
              ...(typeof state.compactBoundary.transcriptPath === "string"
                ? { transcriptPath: state.compactBoundary.transcriptPath }
                : {}),
            },
          }
        : {}),
      ...(state.artifactPanel &&
      (state.artifactPanel.activeArtifactId === null ||
        typeof state.artifactPanel.activeArtifactId === "string")
        ? {
            artifactPanel: {
              activeArtifactId: state.artifactPanel.activeArtifactId,
              ...(typeof state.artifactPanel.collapsed === "boolean"
                ? { collapsed: state.artifactPanel.collapsed }
                : {}),
            },
          }
        : {}),
      ...(Array.isArray(state.modelConversation) && state.modelConversation.length > 0
        ? {
            modelConversation: state.modelConversation.map(message => ({
              role: message.role,
              content: message.content,
              ...(Array.isArray(message.attachments) &&
              message.attachments.length > 0
                ? {
                    attachments: message.attachments.map(attachment => ({
                      data: attachment.data,
                      mimeType: attachment.mimeType,
                    })),
                  }
                : {}),
              ...(Array.isArray(message.generatedImages) &&
              message.generatedImages.length > 0
                ? {
                    generatedImages: message.generatedImages.map(image => ({
                      id: image.id,
                      src: image.src,
                      ...(image.source ? { source: image.source } : {}),
                      ...(typeof image.prompt === "string" ? { prompt: image.prompt } : {}),
                      ...(typeof image.revisedPrompt === "string"
                        ? { revisedPrompt: image.revisedPrompt }
                        : {}),
                    })),
                  }
                : {}),
            })),
          }
        : {}),
    };

    if (
      !normalizedState.pendingPlanVerification &&
      !normalizedState.modelConversation &&
      !normalizedState.compactBoundary &&
      !normalizedState.artifactPanel &&
      !normalizedState.designFlowState &&
      !normalizedState.sessionType &&
      typeof normalizedState.workspaceRoot !== "string"
    ) {
      try {
        await fs.unlink(this.getStateFilePath(sessionId));
      } catch {
        // Ignore missing state files.
      }
      return;
    }

    await fs.writeFile(
      this.getStateFilePath(sessionId),
      JSON.stringify(normalizedState, null, 2),
      "utf8",
    );
  }

  async exportMarkdown(sessionId: string, title: string): Promise<string> {
    const messages = await this.loadMessages(sessionId);
    const lines = [`# ${title}\n`];
    for (const message of messages) {
      const role = message.role === "user" ? "**用户**" : "**助手**";
      lines.push(`${role}\n\n${message.content}\n`);
    }
    return lines.join("\n---\n\n");
  }

  getTranscriptFilePath(sessionId: string): string {
    return this.getTranscriptPath(sessionId);
  }
}
