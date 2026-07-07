import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { ImageLabResultItem } from "./imageLabRuntime";

export type ImageLabResultSummary = Omit<ImageLabResultItem, "src"> & {
  src?: string;
};

export type ImageLabResultSummaryPage = {
  items: ImageLabResultSummary[];
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
  nextOffset?: number;
};

type StoredImageLabResult = Omit<ImageLabResultItem, "src" | "thumbnail"> & {
  src?: string;
  srcAssetPath?: string;
  thumbnail?: string;
  thumbnailAssetPath?: string;
};

type StoredImageLabGallery = {
  updatedAt?: number;
  results?: StoredImageLabResult[];
};

const DATA_URL_PATTERN = /^data:([^;,]+)?(?:;[^,]*)?,/i;

export class ImageLabGalleryStore {
  private readonly storageDir: string;
  private readonly galleryPath: string;
  private readonly assetsDir: string;
  private readonly thumbsDir: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(storagePath: string) {
    this.storageDir = path.join(storagePath, "image-lab");
    this.galleryPath = path.join(this.storageDir, "gallery.json");
    this.assetsDir = path.join(this.storageDir, "assets");
    this.thumbsDir = path.join(this.storageDir, "thumbs");
  }

  async loadResults(): Promise<ImageLabResultItem[]> {
    const parsed = await this.readGallery();
    return Array.isArray(parsed.results)
      ? (await Promise.all(parsed.results.map(result => this.normalizeResult(result))))
        .filter((result): result is ImageLabResultItem => !!result)
      : [];
  }

  async loadResultSummaries(): Promise<ImageLabResultSummary[]> {
    const parsed = await this.readGallery();
    return Array.isArray(parsed.results)
      ? (await Promise.all(parsed.results.map(result => this.normalizeResultSummary(result))))
        .filter((result): result is ImageLabResultSummary => !!result)
      : [];
  }

  async loadResultSummaryPage(options: {
    offset?: number;
    limit?: number;
  } = {}): Promise<ImageLabResultSummaryPage> {
    const offset = normalizePageOffset(options.offset);
    const limit = normalizePageLimit(options.limit);
    const parsed = await this.readGallery();
    const results = Array.isArray(parsed.results) ? parsed.results : [];
    const sortedResults = [...results].sort((left, right) =>
      getStoredResultCreatedAt(right) - getStoredResultCreatedAt(left));
    const rawPage = sortedResults.slice(offset, offset + limit);
    const items = (await Promise.all(rawPage.map(result => this.normalizeResultSummary(result))))
      .filter((result): result is ImageLabResultSummary => !!result);
    const nextOffset = offset + rawPage.length;

    return {
      items,
      offset,
      limit,
      total: results.length,
      hasMore: nextOffset < results.length,
      ...(nextOffset < results.length ? { nextOffset } : {}),
    };
  }

  async loadResultById(id: string): Promise<ImageLabResultItem | undefined> {
    const trimmedId = id.trim();
    if (!trimmedId) {
      return undefined;
    }

    const parsed = await this.readGallery();
    if (!Array.isArray(parsed.results)) {
      return undefined;
    }

    for (const rawResult of parsed.results) {
      const normalized = await this.normalizeResult(rawResult);
      if (normalized?.id === trimmedId) {
        return normalized;
      }
    }

    return undefined;
  }

  async saveResults(results: ImageLabResultItem[]): Promise<void> {
    await this.enqueueWrite(async () => {
      await this.writeGallery(results);
    });
  }

  async clear(): Promise<void> {
    await this.enqueueWrite(async () => {
      await Promise.all([
        fs.rm(this.galleryPath, { force: true }),
        fs.rm(this.assetsDir, { recursive: true, force: true }),
        fs.rm(this.thumbsDir, { recursive: true, force: true }),
      ]);
    });
  }

  async saveThumbnail(id: string, dataUrl: string): Promise<void> {
    await this.enqueueWrite(async () => {
      const results = await this.loadResults();
      const index = results.findIndex(result => result.id === id);
      if (index === -1) {
        return;
      }

      results[index] = { ...results[index], thumbnail: dataUrl };
      await this.writeGallery(results);
    });
  }

  private async readGallery(): Promise<StoredImageLabGallery> {
    try {
      const raw = await fs.readFile(this.galleryPath, "utf8");
      return JSON.parse(raw) as StoredImageLabGallery;
    } catch {
      return {};
    }
  }

  private async writeGallery(results: ImageLabResultItem[]): Promise<void> {
    await this.ensureStorageDirs();

    const storedResults = await Promise.all(results.map(result => this.toStoredResult(result)));
    await fs.writeFile(
      this.galleryPath,
      JSON.stringify({
        updatedAt: Date.now(),
        results: storedResults,
      }, null, 2),
      "utf8",
    );
  }

  private async ensureStorageDirs(): Promise<void> {
    await Promise.all([
      fs.mkdir(this.storageDir, { recursive: true }),
      fs.mkdir(this.assetsDir, { recursive: true }),
      fs.mkdir(this.thumbsDir, { recursive: true }),
    ]);
  }

  private async toStoredResult(result: ImageLabResultItem): Promise<StoredImageLabResult> {
    const {
      src,
      thumbnail,
      ...metadata
    } = result;

    const stored: StoredImageLabResult = {
      ...metadata,
      src,
      ...(thumbnail ? { thumbnail } : {}),
    };

    if (isDataUrl(src)) {
      stored.srcAssetPath = await this.writeAssetFile(this.assetsDir, result.id, "source", src);
      delete stored.src;
    }

    if (thumbnail && isDataUrl(thumbnail)) {
      stored.thumbnailAssetPath = await this.writeAssetFile(this.thumbsDir, result.id, "thumb", thumbnail);
      delete stored.thumbnail;
    }

    return stored;
  }

  private async normalizeResult(raw: unknown): Promise<ImageLabResultItem | undefined> {
    if (!raw || typeof raw !== "object") {
      return undefined;
    }

    const result = raw as Partial<StoredImageLabResult>;
    const src = await this.resolveImagePayload(result.src, result.srcAssetPath);
    if (
      typeof result.id !== "string" ||
      !result.id.trim() ||
      typeof result.batchId !== "string" ||
      !result.batchId.trim() ||
      typeof src !== "string" ||
      !src.trim() ||
      typeof result.prompt !== "string" ||
      typeof result.createdAt !== "number" ||
      !Number.isFinite(result.createdAt)
    ) {
      return undefined;
    }

    const source = result.source === "edit" || result.source === "variant"
      ? result.source
      : "generate";
    const thumbnail = await this.resolveImagePayload(result.thumbnail, result.thumbnailAssetPath);

    return {
      id: result.id,
      batchId: result.batchId,
      src,
      prompt: result.prompt,
      ...(typeof result.revisedPrompt === "string" ? { revisedPrompt: result.revisedPrompt } : {}),
      createdAt: result.createdAt,
      source,
      ...(typeof thumbnail === "string" && thumbnail ? { thumbnail } : {}),
      ...(typeof result.lastUsedByProjectId === "string" && result.lastUsedByProjectId.trim()
        ? { lastUsedByProjectId: result.lastUsedByProjectId.trim() }
        : {}),
      ...(result.originSurface === "main-chat" ||
        result.originSurface === "design-chat" ||
        result.originSurface === "image-chat"
        ? { originSurface: result.originSurface }
        : {}),
      ...(typeof result.originSessionId === "string" && result.originSessionId.trim()
        ? { originSessionId: result.originSessionId.trim() }
        : {}),
      ...(typeof result.originThreadId === "string" && result.originThreadId.trim()
        ? { originThreadId: result.originThreadId.trim() }
        : {}),
      ...(typeof result.originProjectId === "string" && result.originProjectId.trim()
        ? { originProjectId: result.originProjectId.trim() }
        : {}),
      ...(Array.isArray(result.usedByProjectIds)
        ? {
            usedByProjectIds: Array.from(new Set(
              result.usedByProjectIds
                .filter((projectId): projectId is string => typeof projectId === "string")
                .map(projectId => projectId.trim())
                .filter(Boolean),
            )),
          }
        : {}),
    };
  }

  private async normalizeResultSummary(raw: unknown): Promise<ImageLabResultSummary | undefined> {
    if (!raw || typeof raw !== "object") {
      return undefined;
    }

    const result = raw as Partial<StoredImageLabResult>;
    if (
      typeof result.id !== "string" ||
      !result.id.trim() ||
      typeof result.batchId !== "string" ||
      !result.batchId.trim() ||
      typeof result.prompt !== "string" ||
      typeof result.createdAt !== "number" ||
      !Number.isFinite(result.createdAt)
    ) {
      return undefined;
    }

    const source = result.source === "edit" || result.source === "variant"
      ? result.source
      : "generate";
    const thumbnail = await this.resolveImagePayload(result.thumbnail, result.thumbnailAssetPath);

    return {
      id: result.id,
      batchId: result.batchId,
      prompt: result.prompt,
      ...(typeof result.revisedPrompt === "string" ? { revisedPrompt: result.revisedPrompt } : {}),
      createdAt: result.createdAt,
      source,
      ...(typeof thumbnail === "string" && thumbnail ? { thumbnail } : {}),
      ...(typeof result.lastUsedByProjectId === "string" && result.lastUsedByProjectId.trim()
        ? { lastUsedByProjectId: result.lastUsedByProjectId.trim() }
        : {}),
      ...(result.originSurface === "main-chat" ||
        result.originSurface === "design-chat" ||
        result.originSurface === "image-chat"
        ? { originSurface: result.originSurface }
        : {}),
      ...(typeof result.originSessionId === "string" && result.originSessionId.trim()
        ? { originSessionId: result.originSessionId.trim() }
        : {}),
      ...(typeof result.originThreadId === "string" && result.originThreadId.trim()
        ? { originThreadId: result.originThreadId.trim() }
        : {}),
      ...(typeof result.originProjectId === "string" && result.originProjectId.trim()
        ? { originProjectId: result.originProjectId.trim() }
        : {}),
      ...(Array.isArray(result.usedByProjectIds)
        ? {
            usedByProjectIds: Array.from(new Set(
              result.usedByProjectIds
                .filter((projectId): projectId is string => typeof projectId === "string")
                .map(projectId => projectId.trim())
                .filter(Boolean),
            )),
          }
        : {}),
    };
  }

  private async resolveImagePayload(
    inlineValue: unknown,
    assetPath: unknown,
  ): Promise<string | undefined> {
    if (typeof inlineValue === "string" && inlineValue.trim()) {
      return inlineValue;
    }

    if (typeof assetPath !== "string" || !assetPath.trim()) {
      return undefined;
    }

    try {
      const resolvedPath = path.resolve(this.storageDir, assetPath);
      const storageRoot = path.resolve(this.storageDir);
      const relativePath = path.relative(storageRoot, resolvedPath);
      if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        return undefined;
      }
      return await fs.readFile(resolvedPath, "utf8");
    } catch {
      return undefined;
    }
  }

  private async writeAssetFile(
    targetDir: string,
    id: string,
    role: "source" | "thumb",
    dataUrl: string,
  ): Promise<string> {
    const extension = inferAssetExtension(dataUrl);
    const fileName = `${sanitizeFileSegment(id)}-${role}-${createHash("sha1").update(dataUrl).digest("hex").slice(0, 12)}.${extension}`;
    const absolutePath = path.join(targetDir, fileName);
    await fs.writeFile(absolutePath, dataUrl, "utf8");
    return path.relative(this.storageDir, absolutePath).replace(/\\/g, "/");
  }

  private async enqueueWrite(operation: () => Promise<void>): Promise<void> {
    const next = this.writeQueue.catch(() => undefined).then(operation);
    this.writeQueue = next;
    await next;
  }
}

function isDataUrl(value: string): boolean {
  return DATA_URL_PATTERN.test(value.trim());
}

function inferAssetExtension(dataUrl: string): string {
  const match = DATA_URL_PATTERN.exec(dataUrl.trim());
  const mimeType = match?.[1]?.toLowerCase() || "application/octet-stream";

  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default: {
      const [, subtype = "txt"] = mimeType.split("/");
      return sanitizeFileSegment(subtype) || "txt";
    }
  }
}

function sanitizeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "image";
}

function normalizePageOffset(value: unknown): number {
  const offset = Number(value);
  return Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
}

function normalizePageLimit(value: unknown): number {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) {
    return 36;
  }
  return Math.max(1, Math.min(96, Math.floor(limit)));
}

function getStoredResultCreatedAt(result: StoredImageLabResult): number {
  return Number.isFinite(result.createdAt) ? result.createdAt : 0;
}
