import { promises as fs } from "node:fs";
import path from "node:path";

import type { ImageLabReferenceImage } from "./imageLabRuntime";

export type ImageThreadOwnerSurface = "main-chat" | "design-chat" | "image-chat";

export type ImageThreadMessage = {
  role: "user" | "assistant";
  content: string;
  resultIds?: string[];
  createdAt: number;
};

export type ImageThreadSettings = {
  size: string;
  batchCount: number;
};

export type ImageThreadRecord = {
  threadId: string;
  title: string;
  ownerSurface: ImageThreadOwnerSurface;
  originSessionId?: string;
  projectId?: string;
  createdAt: number;
  updatedAt: number;
  activeResultId?: string;
  activeBatchId?: string;
  promptDraft?: string;
  referenceImages: ImageLabReferenceImage[];
  settings: ImageThreadSettings;
  messages: ImageThreadMessage[];
  resultIds: string[];
};

type StoredImageThreads = {
  updatedAt?: number;
  threads?: unknown[];
};

const DEFAULT_IMAGE_THREAD_SIZE = "1024x1024";
const DEFAULT_IMAGE_THREAD_BATCH_COUNT = 1;
const MAX_IMAGE_THREAD_BATCH_COUNT = 8;

export class ImageThreadStore {
  private readonly storageDir: string;
  private readonly threadsPath: string;
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(storagePath: string) {
    this.storageDir = path.join(storagePath, "image-threads");
    this.threadsPath = path.join(this.storageDir, "threads.json");
  }

  async loadThreads(): Promise<ImageThreadRecord[]> {
    try {
      const raw = await fs.readFile(this.threadsPath, "utf8");
      const parsed = JSON.parse(raw) as StoredImageThreads;
      return Array.isArray(parsed.threads)
        ? parsed.threads
          .map(thread => this.normalizeThread(thread))
          .filter((thread): thread is ImageThreadRecord => !!thread)
        : [];
    } catch {
      return [];
    }
  }

  async saveThreads(threads: ImageThreadRecord[]): Promise<void> {
    await this.enqueueWrite(async () => {
      await this.writeThreads(threads);
    });
  }

  async getThread(threadId: string): Promise<ImageThreadRecord | undefined> {
    const normalizedThreadId = normalizeNonEmptyString(threadId);
    if (!normalizedThreadId) {
      return undefined;
    }

    const threads = await this.loadThreads();
    return threads.find(thread => thread.threadId === normalizedThreadId);
  }

  async upsertThread(thread: ImageThreadRecord): Promise<ImageThreadRecord | undefined> {
    return this.enqueueWrite(async () => {
      const normalized = this.normalizeThread(thread);
      if (!normalized) {
        return undefined;
      }

      const threads = await this.loadThreads();
      const index = threads.findIndex(existing => existing.threadId === normalized.threadId);
      const nextThreads = index === -1
        ? [...threads, normalized]
        : threads.map((existing, currentIndex) => currentIndex === index ? normalized : existing);
      await this.writeThreads(nextThreads);
      return normalized;
    });
  }

  async deleteThread(threadId: string): Promise<void> {
    const normalizedThreadId = normalizeNonEmptyString(threadId);
    if (!normalizedThreadId) {
      return;
    }

    await this.enqueueWrite(async () => {
      const threads = await this.loadThreads();
      await this.writeThreads(threads.filter(thread => thread.threadId !== normalizedThreadId));
    });
  }

  async clear(): Promise<void> {
    await this.enqueueWrite(async () => {
      try {
        await fs.unlink(this.threadsPath);
      } catch {
        // No-op when the threads file does not exist yet.
      }
    });
  }

  private async writeThreads(threads: ImageThreadRecord[]): Promise<void> {
    const normalizedThreads = threads
      .map(thread => this.normalizeThread(thread))
      .filter((thread): thread is ImageThreadRecord => !!thread);
    await this.ensureStorageDir();
    await fs.writeFile(
      this.threadsPath,
      JSON.stringify({
        updatedAt: Date.now(),
        threads: normalizedThreads,
      }, null, 2),
      "utf8",
    );
  }

  private async ensureStorageDir(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
  }

  private normalizeThread(raw: unknown): ImageThreadRecord | undefined {
    if (!raw || typeof raw !== "object") {
      return undefined;
    }

    const thread = raw as Partial<ImageThreadRecord>;
    const threadId = normalizeNonEmptyString(thread.threadId);
    if (!threadId) {
      return undefined;
    }

    const createdAt = normalizeTimestamp(thread.createdAt) ?? Date.now();
    const updatedAt = normalizeTimestamp(thread.updatedAt) ?? createdAt;
    const activeResultId = normalizeNonEmptyString(thread.activeResultId);
    const resultIds = uniqueStrings([
      ...(activeResultId ? [activeResultId] : []),
      ...(Array.isArray(thread.resultIds) ? thread.resultIds : []),
    ]);

    return {
      threadId,
      title: normalizeNonEmptyString(thread.title) ?? "Untitled image thread",
      ownerSurface: normalizeOwnerSurface(thread.ownerSurface),
      ...optionalStringField("originSessionId", thread.originSessionId),
      ...optionalStringField("projectId", thread.projectId),
      createdAt,
      updatedAt,
      ...optionalStringField("activeResultId", activeResultId),
      ...optionalStringField("activeBatchId", thread.activeBatchId),
      ...optionalPromptDraft(thread.promptDraft),
      referenceImages: normalizeReferenceImages(thread.referenceImages),
      settings: normalizeSettings(thread.settings),
      messages: normalizeMessages(thread.messages, updatedAt),
      resultIds,
    };
  }

  private async enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.writeQueue.catch(() => undefined).then(operation);
    this.writeQueue = next;
    return next;
  }
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalStringField<K extends string>(
  key: K,
  value: unknown,
): { [P in K]?: string } {
  const normalized = normalizeNonEmptyString(value);
  return normalized ? { [key]: normalized } as { [P in K]?: string } : {};
}

function optionalPromptDraft(value: unknown): { promptDraft?: string } {
  return typeof value === "string" ? { promptDraft: value } : {};
}

function normalizeTimestamp(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeOwnerSurface(value: unknown): ImageThreadOwnerSurface {
  if (value === "main-chat" || value === "design-chat" || value === "image-chat") {
    return value;
  }
  return "image-chat";
}

function normalizeReferenceImages(value: unknown): ImageLabReferenceImage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(referenceImage => {
      if (!referenceImage || typeof referenceImage !== "object") {
        return undefined;
      }
      const candidate = referenceImage as Partial<ImageLabReferenceImage>;
      const dataUrl = normalizeNonEmptyString(candidate.dataUrl);
      const mimeType = normalizeNonEmptyString(candidate.mimeType);
      if (!dataUrl || !mimeType) {
        return undefined;
      }
      return {
        dataUrl,
        mimeType,
        name: normalizeNonEmptyString(candidate.name) ?? "reference.png",
      };
    })
    .filter((referenceImage): referenceImage is ImageLabReferenceImage => !!referenceImage);
}

function normalizeSettings(value: unknown): ImageThreadSettings {
  const settings = value && typeof value === "object"
    ? value as Partial<ImageThreadSettings>
    : {};
  return {
    size: normalizeNonEmptyString(settings.size) ?? DEFAULT_IMAGE_THREAD_SIZE,
    batchCount: clampBatchCount(settings.batchCount),
  };
}

function clampBatchCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_IMAGE_THREAD_BATCH_COUNT;
  }
  return Math.max(
    1,
    Math.min(MAX_IMAGE_THREAD_BATCH_COUNT, Math.floor(value)),
  );
}

function normalizeMessages(value: unknown, fallbackTimestamp: number): ImageThreadMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(message => {
      if (!message || typeof message !== "object") {
        return undefined;
      }
      const candidate = message as Partial<ImageThreadMessage>;
      if (candidate.role !== "user" && candidate.role !== "assistant") {
        return undefined;
      }
      if (typeof candidate.content !== "string") {
        return undefined;
      }
      const resultIds = uniqueStrings(Array.isArray(candidate.resultIds) ? candidate.resultIds : []);
      return {
        role: candidate.role,
        content: candidate.content,
        ...(resultIds.length ? { resultIds } : {}),
        createdAt: normalizeTimestamp(candidate.createdAt) ?? fallbackTimestamp,
      };
    })
    .filter((message): message is ImageThreadMessage => !!message);
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeNonEmptyString(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}
