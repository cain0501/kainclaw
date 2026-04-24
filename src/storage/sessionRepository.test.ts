import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SessionRepository } from "./sessionRepository";

const tempDirs: string[] = [];

function createRepository(storageRoot: string): SessionRepository {
  return new SessionRepository(storageRoot);
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("SessionRepository appendMessages", () => {
  it("uses 新对话 as the default session title", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-session-repo-"));
    tempDirs.push(storageRoot);
    const repository = createRepository(storageRoot);

    const meta = await repository.createSession("session-default", "workspace-hash");

    expect(meta.title).toBe("新对话");
  });

  it("updates messageCount, preview, and updatedAt in one batched write", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-session-repo-"));
    tempDirs.push(storageRoot);
    const repository = createRepository(storageRoot);

    await repository.createSession("session-1", "workspace-hash", "Initial");
    await repository.appendMessages(
      "session-1",
      [
        { role: "assistant", content: "thinking summary", kind: "thinking", timestamp: 1000 },
        { role: "assistant", content: "final reply", timestamp: 2000 },
      ],
      {
        updatedAt: 3000,
        preview: "final reply",
      },
    );

    const meta = await repository.getSessionMeta("session-1");

    expect(meta).toMatchObject({
      id: "session-1",
      messageCount: 2,
      preview: "final reply",
      updatedAt: 3000,
    });
  });

  it("uses meta patch title for recovered sessions created by appendMessages", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-session-repo-"));
    tempDirs.push(storageRoot);
    const repository = createRepository(storageRoot);

    await repository.appendMessages(
      "session-2",
      [{ role: "user", content: "first user message", timestamp: 1000 }],
      {
        title: "Custom Title",
        updatedAt: 1500,
        preview: "custom preview",
      },
    );

    const meta = await repository.getSessionMeta("session-2");

    expect(meta).toMatchObject({
      id: "session-2",
      title: "Custom Title",
      preview: "custom preview",
      updatedAt: 1500,
      messageCount: 1,
    });
  });

  it("skips rewriting index when updateMeta patch produces no change", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-session-repo-"));
    tempDirs.push(storageRoot);
    const repository = createRepository(storageRoot);

    await repository.createSession("session-3", "workspace-hash", "Stable");
    await repository.updateMeta("session-3", {
      preview: "same preview",
      updatedAt: 1000,
    });

    const indexPath = path.join(storageRoot, "sessions", "index.json");
    const before = await fs.stat(indexPath);
    await repository.updateMeta("session-3", {
      preview: "same preview",
      updatedAt: 1000,
    });
    const after = await fs.stat(indexPath);

    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  it("exports markdown with 用户 and 助手 labels", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-session-repo-"));
    tempDirs.push(storageRoot);
    const repository = createRepository(storageRoot);

    await repository.appendMessages("session-4", [
      { role: "user", content: "你好", timestamp: 1000 },
      { role: "assistant", content: "我在。", timestamp: 2000 },
    ]);

    const markdown = await repository.exportMarkdown("session-4", "测试会话");

    expect(markdown).toContain("# 测试会话");
    expect(markdown).toContain("**用户**");
    expect(markdown).toContain("**助手**");
  });

  it("defers index.json rewrites for appendMessages until flush", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-session-repo-"));
    tempDirs.push(storageRoot);
    const repository = createRepository(storageRoot);

    await repository.createSession("session-flush", "workspace-hash", "Flush");
    const indexPath = path.join(storageRoot, "sessions", "index.json");
    const before = await fs.stat(indexPath);

    await new Promise(resolve => setTimeout(resolve, 10));
    await repository.appendMessages("session-flush", [
      { role: "assistant", content: "deferred write", timestamp: 1000 },
    ]);

    const mid = await fs.stat(indexPath);
    const metaBeforeFlush = await repository.getSessionMeta("session-flush");
    expect(mid.mtimeMs).toBe(before.mtimeMs);
    expect(metaBeforeFlush).toMatchObject({
      id: "session-flush",
      messageCount: 1,
    });

    await repository.flush();

    const after = await fs.stat(indexPath);
    expect(after.mtimeMs).toBeGreaterThan(mid.mtimeMs);
  });

  it("round-trips modelConversation attachments through runtime state files", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-session-repo-"));
    tempDirs.push(storageRoot);
    const repository = createRepository(storageRoot);

    await repository.saveRuntimeState("session-attachments", {
      modelConversation: [
        {
          role: "user",
          content: "look",
          attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
        },
      ],
    });

    await expect(
      repository.loadRuntimeState("session-attachments"),
    ).resolves.toEqual({
      modelConversation: [
        {
          role: "user",
          content: "look",
          attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
        },
      ],
    });
  });
});
