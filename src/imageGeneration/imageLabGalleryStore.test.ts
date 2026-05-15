import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ImageLabGalleryStore } from "./imageLabGalleryStore";
import type { ImageLabResultItem } from "./imageLabRuntime";

const tempDirs: string[] = [];

function createResult(overrides: Partial<ImageLabResultItem>): ImageLabResultItem {
  return {
    id: "result-1",
    batchId: "batch-1",
    src: "https://example.com/1.png",
    prompt: "draw a cat",
    createdAt: 1,
    source: "generate",
    ...overrides,
  };
}

describe("ImageLabGalleryStore", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
  });

  it("persists image lab results across store instances", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "image-lab-gallery-"));
    tempDirs.push(storagePath);

    const store = new ImageLabGalleryStore(storagePath);
    await store.saveResults([
      createResult({ id: "result-1", batchId: "batch-1" }),
      createResult({ id: "result-2", batchId: "batch-2", source: "variant" }),
    ]);

    const reloadedStore = new ImageLabGalleryStore(storagePath);
    await expect(reloadedStore.loadResults()).resolves.toEqual([
      createResult({ id: "result-1", batchId: "batch-1" }),
      createResult({ id: "result-2", batchId: "batch-2", source: "variant" }),
    ]);
  });

  it("clears persisted image lab results", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "image-lab-gallery-"));
    tempDirs.push(storagePath);

    const store = new ImageLabGalleryStore(storagePath);
    await store.saveResults([
      createResult({ id: "result-1", batchId: "batch-1" }),
    ]);

    await store.clear();

    await expect(store.loadResults()).resolves.toEqual([]);
  });

  it("persists saved thumbnails for existing results", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "image-lab-gallery-"));
    tempDirs.push(storagePath);

    const store = new ImageLabGalleryStore(storagePath);
    await store.saveResults([
      createResult({ id: "result-1", batchId: "batch-1" }),
    ]);

    await store.saveThumbnail("result-1", "data:image/jpeg;base64,thumb");

    const reloadedStore = new ImageLabGalleryStore(storagePath);
    await expect(reloadedStore.loadResults()).resolves.toEqual([
      createResult({
        id: "result-1",
        batchId: "batch-1",
        thumbnail: "data:image/jpeg;base64,thumb",
      }),
    ]);
  });

  it("persists lastUsedByProjectId when present", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "image-lab-gallery-"));
    tempDirs.push(storagePath);

    const store = new ImageLabGalleryStore(storagePath);
    await store.saveResults([
      createResult({
        id: "result-1",
        batchId: "batch-1",
        lastUsedByProjectId: "project-123",
      }),
    ]);

    const reloadedStore = new ImageLabGalleryStore(storagePath);
    await expect(reloadedStore.loadResults()).resolves.toEqual([
      createResult({
        id: "result-1",
        batchId: "batch-1",
        lastUsedByProjectId: "project-123",
      }),
    ]);
  });
});
