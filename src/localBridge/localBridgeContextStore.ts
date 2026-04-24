import { randomUUID, createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  LocalBridgeSessionContext,
  LocalBridgeSessionMessage,
  LocalBridgeSessionMessageInput,
} from "../platform/localBridgeRuntime";

type StoredLocalBridgeSessionContext = {
  sessionId: string;
  updatedAt?: number;
  messages: LocalBridgeSessionMessage[];
};

function toSessionFileName(sessionId: string): string {
  const hash = createHash("sha1").update(sessionId).digest("hex");
  return `${hash}.json`;
}

export class LocalBridgeContextStore {
  private readonly storageDir: string;
  private readonly sessionQueues = new Map<string, Promise<unknown>>();

  constructor(storagePath: string) {
    this.storageDir = path.join(storagePath, "local-bridge-sessions");
  }

  async getContext(sessionId: string): Promise<LocalBridgeSessionContext> {
    const normalizedSessionId = this.normalizeSessionId(sessionId);
    return await this.readContextFile(normalizedSessionId);
  }

  async appendMessage(request: {
    sessionId: string;
    message: LocalBridgeSessionMessageInput;
  }): Promise<LocalBridgeSessionMessage> {
    const normalizedSessionId = this.normalizeSessionId(request.sessionId);

    return await this.enqueueSessionOperation(normalizedSessionId, async () => {
      const context = await this.readContextFile(normalizedSessionId);
      const timestamp = request.message.timestamp ?? Date.now();
      const nextMessage: LocalBridgeSessionMessage = {
        id: randomUUID(),
        role: request.message.role,
        content: request.message.content,
        source: request.message.source,
        timestamp,
      };

      const nextContext: StoredLocalBridgeSessionContext = {
        sessionId: normalizedSessionId,
        updatedAt: timestamp,
        messages: [...context.messages, nextMessage],
      };

      await this.writeContextFile(nextContext);
      return nextMessage;
    });
  }

  private async ensureStorageDir(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
  }

  private getSessionFilePath(sessionId: string): string {
    return path.join(this.storageDir, toSessionFileName(sessionId));
  }

  private normalizeSessionId(sessionId: string): string {
    const normalized = sessionId.trim();
    if (!normalized) {
      throw new Error("sessionId must not be empty");
    }
    return normalized;
  }

  private normalizeMessage(
    message: LocalBridgeSessionMessage,
  ): LocalBridgeSessionMessage {
    return {
      id: typeof message.id === "string" && message.id.trim()
        ? message.id
        : randomUUID(),
      role: message.role === "assistant" ? "assistant" : "user",
      content: typeof message.content === "string" ? message.content : "",
      source: typeof message.source === "string" ? message.source : "",
      timestamp: typeof message.timestamp === "number"
        ? message.timestamp
        : Date.now(),
    };
  }

  private normalizeContext(
    sessionId: string,
    raw: StoredLocalBridgeSessionContext | undefined,
  ): LocalBridgeSessionContext {
    const messages = Array.isArray(raw?.messages)
      ? raw.messages.map(message => this.normalizeMessage(message))
      : [];

    return {
      sessionId,
      updatedAt: typeof raw?.updatedAt === "number"
        ? raw.updatedAt
        : messages.at(-1)?.timestamp,
      messages,
    };
  }

  private async readContextFile(
    sessionId: string,
  ): Promise<LocalBridgeSessionContext> {
    try {
      const raw = await fs.readFile(this.getSessionFilePath(sessionId), "utf8");
      return this.normalizeContext(
        sessionId,
        JSON.parse(raw) as StoredLocalBridgeSessionContext,
      );
    } catch {
      return {
        sessionId,
        messages: [],
      };
    }
  }

  private async writeContextFile(
    context: StoredLocalBridgeSessionContext,
  ): Promise<void> {
    await this.ensureStorageDir();
    await fs.writeFile(
      this.getSessionFilePath(context.sessionId),
      JSON.stringify(context, null, 2),
      "utf8",
    );
  }

  private async enqueueSessionOperation<T>(
    sessionId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.sessionQueues.get(sessionId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(operation);

    this.sessionQueues.set(sessionId, next);

    try {
      return await next;
    } finally {
      if (this.sessionQueues.get(sessionId) === next) {
        this.sessionQueues.delete(sessionId);
      }
    }
  }
}
