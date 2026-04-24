import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalBridgeContextStore } from "./localBridgeContextStore";

describe("LocalBridgeContextStore", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tempDirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })),
    );
  });

  it("returns an empty context for a new session", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "local-bridge-store-"));
    tempDirs.push(storagePath);
    const store = new LocalBridgeContextStore(storagePath);

    await expect(store.getContext("shared-session-1")).resolves.toEqual({
      sessionId: "shared-session-1",
      messages: [],
    });
  });

  it("persists appended messages and returns them in context order", async () => {
    const storagePath = await mkdtemp(path.join(os.tmpdir(), "local-bridge-store-"));
    tempDirs.push(storagePath);
    const store = new LocalBridgeContextStore(storagePath);

    const first = await store.appendMessage({
      sessionId: "shared-session-2",
      message: {
        role: "user",
        content: "hello from word",
        source: "word",
        timestamp: 100,
      },
    });

    const second = await store.appendMessage({
      sessionId: "shared-session-2",
      message: {
        role: "assistant",
        content: "hello from bridge",
        source: "desktop",
        timestamp: 200,
      },
    });

    const context = await store.getContext("shared-session-2");

    expect(first).toMatchObject({
      role: "user",
      content: "hello from word",
      source: "word",
      timestamp: 100,
    });
    expect(second).toMatchObject({
      role: "assistant",
      content: "hello from bridge",
      source: "desktop",
      timestamp: 200,
    });
    expect(context).toEqual({
      sessionId: "shared-session-2",
      updatedAt: 200,
      messages: [first, second],
    });
  });
});
