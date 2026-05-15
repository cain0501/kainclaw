import { promises as fs } from "node:fs";
import path from "node:path";

import type { ImageLabResultItem } from "./imageLabRuntime";

type StoredImageLabGallery = {
  updatedAt?: number;
  results?: ImageLabResultItem[];
};

export class ImageLabGalleryStore {
  private readonly storageDir: string;
  private readonly galleryPath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(storagePath: string) {
    this.storageDir = path.join(storagePath, "image-lab");
    this.galleryPath = path.join(this.storageDir, "gallery.json");
  }

  async loadResults(): Promise<ImageLabResultItem[]> {
    try {
      const raw = await fs.readFile(this.galleryPath, "utf8");
      const parsed = JSON.parse(raw) as StoredImageLabGallery;
      return Array.isArray(parsed.results)
        ? parsed.results
          .map(result => this.normalizeResult(result))
          .filter((result): result is ImageLabResultItem => !!result)
        : [];
    } catch {
      return [];
    }
  }

  async saveResults(results: ImageLabResultItem[]): Promise<void> {
    await this.enqueueWrite(async () => {
      await this.ensureStorageDir();
      await fs.writeFile(
        this.galleryPath,
        JSON.stringify({
          updatedAt: Date.now(),
          results,
        }, null, 2),
        "utf8",
      );
    });
  }

  async clear(): Promise<void> {
    await this.enqueueWrite(async () => {
      try {
        await fs.unlink(this.galleryPath);
      } catch {
        // No-op when the gallery file does not exist yet.
      }
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
      await this.ensureStorageDir();
      await fs.writeFile(
        this.galleryPath,
        JSON.stringify({
          updatedAt: Date.now(),
          results,
        }, null, 2),
        "utf8",
      );
    });
  }

  private async ensureStorageDir(): Promise<void> {
    await fs.mkdir(this.storageDir, { recursive: true });
  }

  private normalizeResult(raw: unknown): ImageLabResultItem | undefined {
    if (!raw || typeof raw !== "object") {
      return undefined;
    }

    const result = raw as Partial<ImageLabResultItem>;
    if (
      typeof result.id !== "string" ||
      !result.id.trim() ||
      typeof result.batchId !== "string" ||
      !result.batchId.trim() ||
      typeof result.src !== "string" ||
      !result.src.trim() ||
      typeof result.prompt !== "string" ||
      typeof result.createdAt !== "number" ||
      !Number.isFinite(result.createdAt)
    ) {
      return undefined;
    }

    const source = result.source === "edit" || result.source === "variant"
      ? result.source
      : "generate";

    return {
      id: result.id,
      batchId: result.batchId,
      src: result.src,
      prompt: result.prompt,
      ...(typeof result.revisedPrompt === "string" ? { revisedPrompt: result.revisedPrompt } : {}),
      createdAt: result.createdAt,
      source,
      ...(typeof result.thumbnail === "string" && result.thumbnail ? { thumbnail: result.thumbnail } : {}),
      ...(typeof result.lastUsedByProjectId === "string" && result.lastUsedByProjectId.trim()
        ? { lastUsedByProjectId: result.lastUsedByProjectId.trim() }
        : {}),
    };
  }

  private async enqueueWrite(operation: () => Promise<void>): Promise<void> {
    const next = this.writeQueue.catch(() => undefined).then(operation);
    this.writeQueue = next;
    await next;
  }
}
