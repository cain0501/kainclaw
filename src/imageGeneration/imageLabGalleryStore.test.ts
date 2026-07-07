import { readFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ImageLabGalleryStore, type ImageLabResultSummary } from "./imageLabGalleryStore";
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

async function readGalleryJson(storagePath: string): Promise<string> {
  return readFile(path.join(storagePath, "image-lab", "gallery.json"), "utf8");
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

  it("writes data-url results as asset-backed metadata without storing the full original payload in gallery.json", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "image-lab-gallery-"));
    tempDirs.push(storagePath);

    const fullSrc = "data:image/png;base64,full-image-payload";
    const fullThumb = "data:image/png;base64,thumb-image-payload";
    const store = new ImageLabGalleryStore(storagePath);

    await store.saveResults([
      createResult({
        id: "result-1",
        batchId: "batch-1",
        src: fullSrc,
        thumbnail: fullThumb,
      }),
    ]);

    const galleryJson = await readGalleryJson(storagePath);
    expect(galleryJson).not.toContain(fullSrc);
    expect(galleryJson).not.toContain(fullThumb);
    expect(galleryJson).toContain("\"srcAssetPath\": \"assets/");
    expect(galleryJson).toContain("\"thumbnailAssetPath\": \"thumbs/");
  });

  it("loadResultById returns the original data url from the stored asset file", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "image-lab-gallery-"));
    tempDirs.push(storagePath);

    const fullSrc = "data:image/png;base64,full-image-payload";
    const fullThumb = "data:image/png;base64,thumb-image-payload";
    const store = new ImageLabGalleryStore(storagePath);

    await store.saveResults([
      createResult({
        id: "result-1",
        batchId: "batch-1",
        src: fullSrc,
        thumbnail: fullThumb,
      }),
    ]);

    await expect(store.loadResultById("result-1")).resolves.toEqual(
      createResult({
        id: "result-1",
        batchId: "batch-1",
        src: fullSrc,
        thumbnail: fullThumb,
      }),
    );
    await expect(store.loadResultById("missing")).resolves.toBeUndefined();
  });

  it("loadResultSummaries omits original src while still exposing thumbnail safely", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "image-lab-gallery-"));
    tempDirs.push(storagePath);

    const store = new ImageLabGalleryStore(storagePath);
    await store.saveResults([
      createResult({
        id: "result-1",
        batchId: "batch-1",
        src: "data:image/png;base64,full-image-payload",
        thumbnail: "data:image/png;base64,thumb-image-payload",
      }),
    ]);

    await expect(store.loadResultSummaries()).resolves.toEqual([
      {
        id: "result-1",
        batchId: "batch-1",
        prompt: "draw a cat",
        createdAt: 1,
        source: "generate",
        thumbnail: "data:image/png;base64,thumb-image-payload",
      } satisfies ImageLabResultSummary,
    ]);
  });

  it("loads summary pages newest-first without hydrating original src values", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "image-lab-gallery-"));
    tempDirs.push(storagePath);

    const store = new ImageLabGalleryStore(storagePath);
    await store.saveResults([
      createResult({
        id: "oldest",
        batchId: "batch-oldest",
        createdAt: 1,
        src: "data:image/png;base64,oldest-full",
        thumbnail: "data:image/png;base64,oldest-thumb",
      }),
      createResult({
        id: "newest",
        batchId: "batch-newest",
        createdAt: 3,
        src: "data:image/png;base64,newest-full",
        thumbnail: "data:image/png;base64,newest-thumb",
      }),
      createResult({
        id: "middle",
        batchId: "batch-middle",
        createdAt: 2,
        src: "data:image/png;base64,middle-full",
        thumbnail: "data:image/png;base64,middle-thumb",
      }),
    ]);

    await expect(store.loadResultSummaryPage({ offset: 0, limit: 2 })).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: "newest",
          thumbnail: "data:image/png;base64,newest-thumb",
        }),
        expect.objectContaining({
          id: "middle",
          thumbnail: "data:image/png;base64,middle-thumb",
        }),
      ],
      offset: 0,
      limit: 2,
      total: 3,
      hasMore: true,
      nextOffset: 2,
    });

    const nextPage = await store.loadResultSummaryPage({ offset: 2, limit: 2 });
    expect(nextPage).toEqual({
      items: [
        expect.objectContaining({
          id: "oldest",
          thumbnail: "data:image/png;base64,oldest-thumb",
        }),
      ],
      offset: 2,
      limit: 2,
      total: 3,
      hasMore: false,
    });
    expect(nextPage.items[0]?.src).toBeUndefined();
  });

  it("saveThumbnail keeps the thumbnail payload out of gallery.json", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "image-lab-gallery-"));
    tempDirs.push(storagePath);

    const store = new ImageLabGalleryStore(storagePath);
    await store.saveResults([
      createResult({
        id: "result-1",
        batchId: "batch-1",
        src: "data:image/png;base64,full-image-payload",
      }),
    ]);

    const thumbnail = "data:image/jpeg;base64,thumb-payload";
    await store.saveThumbnail("result-1", thumbnail);

    const galleryJson = await readGalleryJson(storagePath);
    expect(galleryJson).not.toContain(thumbnail);
    expect(galleryJson).toContain("\"thumbnailAssetPath\": \"thumbs/");
    await expect(store.loadResultById("result-1")).resolves.toEqual(
      createResult({
        id: "result-1",
        batchId: "batch-1",
        src: "data:image/png;base64,full-image-payload",
        thumbnail,
      }),
    );
  });

  it("loads legacy inline data-url entries without losing original data", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "image-lab-gallery-"));
    tempDirs.push(storagePath);

    const fullSrc = "data:image/png;base64,legacy-full-image";
    const fullThumb = "data:image/png;base64,legacy-thumb-image";
    await rm(path.join(storagePath, "image-lab"), { recursive: true, force: true });
    await new ImageLabGalleryStore(storagePath).saveResults([]);

    const legacyJson = JSON.stringify({
      updatedAt: 1,
      results: [
        {
          id: "legacy-1",
          batchId: "legacy-batch-1",
          src: fullSrc,
          thumbnail: fullThumb,
          prompt: "legacy prompt",
          createdAt: 1,
          source: "generate",
        },
      ],
    }, null, 2);

    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(path.join(storagePath, "image-lab", "gallery.json"), legacyJson, "utf8"));

    const store = new ImageLabGalleryStore(storagePath);
    await expect(store.loadResultById("legacy-1")).resolves.toEqual({
      id: "legacy-1",
      batchId: "legacy-batch-1",
      src: fullSrc,
      thumbnail: fullThumb,
      prompt: "legacy prompt",
      createdAt: 1,
      source: "generate",
    });
    await expect(store.loadResultSummaries()).resolves.toEqual([
      {
        id: "legacy-1",
        batchId: "legacy-batch-1",
        prompt: "legacy prompt",
        createdAt: 1,
        source: "generate",
        thumbnail: fullThumb,
      },
    ]);
  });

  it("does not resolve asset paths outside the image-lab storage directory", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "image-lab-gallery-"));
    tempDirs.push(storagePath);

    await new ImageLabGalleryStore(storagePath).saveResults([]);
    const traversalJson = JSON.stringify({
      updatedAt: 1,
      results: [
        {
          id: "escape-1",
          batchId: "batch-escape-1",
          srcAssetPath: "../outside.txt",
          prompt: "escape",
          createdAt: 1,
          source: "generate",
        },
      ],
    }, null, 2);

    await import("node:fs/promises").then(({ writeFile }) =>
      writeFile(path.join(storagePath, "image-lab", "gallery.json"), traversalJson, "utf8"));

    const store = new ImageLabGalleryStore(storagePath);
    await expect(store.loadResultById("escape-1")).resolves.toBeUndefined();
    await expect(store.loadResultSummaries()).resolves.toEqual([
      {
        id: "escape-1",
        batchId: "batch-escape-1",
        prompt: "escape",
        createdAt: 1,
        source: "generate",
      },
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

  it("normalizes optional provenance fields without breaking older records", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "image-lab-gallery-"));
    tempDirs.push(storagePath);

    const store = new ImageLabGalleryStore(storagePath);
    await store.saveResults([
      createResult({
        id: "result-1",
        batchId: "batch-1",
        originSurface: "design-chat",
        originSessionId: " session-1 ",
        originThreadId: " thread-1 ",
        originProjectId: " project-1 ",
        usedByProjectIds: [" project-1 ", "project-1", "", "project-2"],
      }),
      createResult({
        id: "result-2",
        batchId: "batch-2",
      }),
    ]);

    const reloadedStore = new ImageLabGalleryStore(storagePath);
    await expect(reloadedStore.loadResults()).resolves.toEqual([
      createResult({
        id: "result-1",
        batchId: "batch-1",
        originSurface: "design-chat",
        originSessionId: "session-1",
        originThreadId: "thread-1",
        originProjectId: "project-1",
        usedByProjectIds: ["project-1", "project-2"],
      }),
      createResult({
        id: "result-2",
        batchId: "batch-2",
      }),
    ]);
  });
});
