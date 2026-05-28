import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ImageThreadStore,
  type ImageThreadRecord,
} from "./imageThreadStore";

const tempDirs: string[] = [];

function createThread(overrides: Partial<ImageThreadRecord>): ImageThreadRecord {
  return {
    threadId: "thread-1",
    title: "Hero images",
    ownerSurface: "image-chat",
    createdAt: 100,
    updatedAt: 200,
    referenceImages: [],
    settings: {
      size: "1024x1024",
      batchCount: 1,
    },
    messages: [],
    resultIds: [],
    ...overrides,
  };
}

describe("ImageThreadStore", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })));
  });

  it("persists image threads across store instances", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "image-thread-store-"));
    tempDirs.push(storagePath);

    const store = new ImageThreadStore(storagePath);
    await store.saveThreads([
      createThread({
        threadId: "thread-a",
        ownerSurface: "main-chat",
        originSessionId: "session-main",
        activeResultId: "result-a",
        resultIds: ["result-a"],
      }),
      createThread({
        threadId: "thread-b",
        title: "Design project image edits",
        ownerSurface: "design-chat",
        projectId: "project-1",
        activeBatchId: "batch-b",
        promptDraft: "make the hero warmer",
        referenceImages: [
          {
            dataUrl: "data:image/png;base64,ref",
            mimeType: "image/png",
            name: "reference.png",
          },
        ],
        settings: {
          size: "1536x1024",
          batchCount: 4,
        },
        messages: [
          {
            role: "user",
            content: "Generate a warm hero",
            resultIds: ["result-b"],
            createdAt: 201,
          },
          {
            role: "assistant",
            content: "Generated one image.",
            resultIds: ["result-b"],
            createdAt: 202,
          },
        ],
        resultIds: ["result-b"],
      }),
    ]);

    const reloadedStore = new ImageThreadStore(storagePath);

    await expect(reloadedStore.loadThreads()).resolves.toEqual([
      createThread({
        threadId: "thread-a",
        ownerSurface: "main-chat",
        originSessionId: "session-main",
        activeResultId: "result-a",
        resultIds: ["result-a"],
      }),
      createThread({
        threadId: "thread-b",
        title: "Design project image edits",
        ownerSurface: "design-chat",
        projectId: "project-1",
        activeBatchId: "batch-b",
        promptDraft: "make the hero warmer",
        referenceImages: [
          {
            dataUrl: "data:image/png;base64,ref",
            mimeType: "image/png",
            name: "reference.png",
          },
        ],
        settings: {
          size: "1536x1024",
          batchCount: 4,
        },
        messages: [
          {
            role: "user",
            content: "Generate a warm hero",
            resultIds: ["result-b"],
            createdAt: 201,
          },
          {
            role: "assistant",
            content: "Generated one image.",
            resultIds: ["result-b"],
            createdAt: 202,
          },
        ],
        resultIds: ["result-b"],
      }),
    ]);
  });

  it("normalizes missing optional fields without deriving active state from gallery order", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "image-thread-store-"));
    tempDirs.push(storagePath);

    const store = new ImageThreadStore(storagePath);
    await store.saveThreads([
      {
        threadId: " dirty-thread ",
        title: "",
        ownerSurface: "unknown",
        createdAt: Number.NaN,
        updatedAt: 300,
        activeResultId: " result-1 ",
        referenceImages: [
          {
            dataUrl: " data:image/jpeg;base64,abc ",
            mimeType: " image/jpeg ",
            name: "",
          },
          {
            dataUrl: "",
            mimeType: "image/png",
            name: "broken.png",
          },
        ],
        settings: {
          size: "",
          batchCount: 42,
        },
        messages: [
          {
            role: "assistant",
            content: "Done",
            resultIds: [" result-1 ", "result-1", ""],
            createdAt: Number.NaN,
          },
          {
            role: "system",
            content: "ignore me",
            createdAt: 1,
          },
        ],
        resultIds: ["result-1", "result-2", "result-2"],
      } as unknown as ImageThreadRecord,
    ]);

    await expect(store.loadThreads()).resolves.toEqual([
      {
        threadId: "dirty-thread",
        title: "Untitled image thread",
        ownerSurface: "image-chat",
        createdAt: expect.any(Number),
        updatedAt: 300,
        activeResultId: "result-1",
        referenceImages: [
          {
            dataUrl: "data:image/jpeg;base64,abc",
            mimeType: "image/jpeg",
            name: "reference.png",
          },
        ],
        settings: {
          size: "1024x1024",
          batchCount: 8,
        },
        messages: [
          {
            role: "assistant",
            content: "Done",
            resultIds: ["result-1"],
            createdAt: 300,
          },
        ],
        resultIds: ["result-1", "result-2"],
      },
    ]);
  });

  it("upserts and deletes by threadId without changing other threads", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "image-thread-store-"));
    tempDirs.push(storagePath);

    const store = new ImageThreadStore(storagePath);
    await store.saveThreads([
      createThread({ threadId: "thread-a", activeResultId: "a1", resultIds: ["a1"] }),
      createThread({ threadId: "thread-b", activeResultId: "b1", resultIds: ["b1"] }),
    ]);

    await store.upsertThread(createThread({
      threadId: "thread-a",
      activeResultId: "a2",
      resultIds: ["a1", "a2"],
      updatedAt: 500,
    }));
    await store.upsertThread(createThread({
      threadId: "thread-c",
      activeResultId: "c1",
      resultIds: ["c1"],
    }));
    await store.deleteThread("thread-b");

    await expect(store.loadThreads()).resolves.toEqual([
      createThread({
        threadId: "thread-a",
        activeResultId: "a2",
        updatedAt: 500,
        resultIds: ["a2", "a1"],
      }),
      createThread({
        threadId: "thread-c",
        activeResultId: "c1",
        resultIds: ["c1"],
      }),
    ]);
  });

  it("returns undefined for invalid thread ids and missing records", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "image-thread-store-"));
    tempDirs.push(storagePath);

    const store = new ImageThreadStore(storagePath);
    await store.saveThreads([
      createThread({ threadId: "thread-a" }),
    ]);

    await expect(store.getThread("")).resolves.toBeUndefined();
    await expect(store.getThread("missing")).resolves.toBeUndefined();
    await expect(store.getThread(" thread-a ")).resolves.toEqual(createThread({ threadId: "thread-a" }));
  });
});
