import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PersistentWorktreeRuntimeStore,
  flattenSlug,
  generateWorktreeSlug,
  validateWorktreeSlug,
  worktreeBranchName,
  worktreePathFor,
  worktreesDir,
} from "./runtime";

const tempDirs: string[] = [];

function sanitizeConversationKey(conversationKey: string): string {
  return conversationKey.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getWorktreeStateFilePath(
  storageRoot: string,
  workspaceRoot: string,
  conversationKey: string,
): string {
  const workspaceId = createHash("sha1").update(workspaceRoot).digest("hex").slice(0, 16);
  const sanitizedConversationKey = sanitizeConversationKey(conversationKey);
  const fileStem =
    sanitizedConversationKey.length > 0 && sanitizedConversationKey === conversationKey
      ? sanitizedConversationKey
      : `${sanitizedConversationKey || "conversation"}-${createHash("sha1")
          .update(conversationKey)
          .digest("hex")
          .slice(0, 8)}`;
  return path.join(
    storageRoot,
    "worktree-runtime",
    workspaceId,
    `${fileStem}.json`,
  );
}

function getLegacyWorktreeStateFilePath(
  storageRoot: string,
  workspaceRoot: string,
  conversationKey: string,
): string {
  const workspaceId = createHash("sha1").update(workspaceRoot).digest("hex").slice(0, 16);
  return path.join(
    storageRoot,
    "worktree-runtime",
    workspaceId,
    `${sanitizeConversationKey(conversationKey)}.json`,
  );
}

async function createWorktreeStoreHarness(conversationKey = "worktree-runtime-test") {
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-worktree-runtime-"));
  tempDirs.push(storageRoot);
  const workspaceRoot = "E:\\claudecodejingiang\\vscode-extension";
  const store = new PersistentWorktreeRuntimeStore(storageRoot);
  const runtime = store.getConversationRuntime(workspaceRoot, conversationKey);

  return {
    storageRoot,
    workspaceRoot,
    conversationKey,
    store,
    runtime,
    stateFilePath: getWorktreeStateFilePath(storageRoot, workspaceRoot, conversationKey),
  };
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("worktree runtime helpers", () => {
  it("accepts valid worktree slugs", () => {
    expect(() => validateWorktreeSlug("feature-1")).not.toThrow();
    expect(() => validateWorktreeSlug("team/feature.alpha_1")).not.toThrow();
  });

  it("rejects invalid worktree slugs", () => {
    expect(() => validateWorktreeSlug("..")).toThrow(/reserved path segment/);
    expect(() => validateWorktreeSlug("bad name")).toThrow(/invalid segment/);
    expect(() => validateWorktreeSlug("a".repeat(64))).toThrow(/too long/);
  });

  it("builds worktree branch names from slugs", () => {
    expect(worktreeBranchName("feature/test")).toBe("worktree-feature+test");
    expect(worktreeBranchName("demo")).toBe("worktree-demo");
  });

  it("derives worktree directories and flattened slug paths", () => {
    const repoRoot = "E:\\claudecodejingiang\\repo";

    expect(flattenSlug("feature/test")).toBe("feature+test");
    expect(worktreesDir(repoRoot)).toBe("E:\\claudecodejingiang\\repo\\.claude\\worktrees");
    expect(worktreePathFor(repoRoot, "feature/test")).toBe(
      "E:\\claudecodejingiang\\repo\\.claude\\worktrees\\feature+test",
    );
  });

  it("generates short random worktree slugs with the expected prefix", () => {
    const slug = generateWorktreeSlug();

    expect(slug).toMatch(/^wt-[0-9a-f]{6}$/);
  });

  it("uses collision-resistant persisted state paths for sanitized conversation keys", () => {
    const storageRoot = "E:\\claudecodejingiang\\state";
    const workspaceRoot = "E:\\claudecodejingiang\\vscode-extension";

    expect(
      getWorktreeStateFilePath(storageRoot, workspaceRoot, "topic/a"),
    ).not.toBe(
      getWorktreeStateFilePath(storageRoot, workspaceRoot, "topic:a"),
    );
    expect(
      path.basename(getWorktreeStateFilePath(storageRoot, workspaceRoot, "topic-a")),
    ).toBe("topic-a.json");
  });

  it("clears malformed persisted sessions during hydration", async () => {
    const harness = await createWorktreeStoreHarness();
    await fs.mkdir(path.dirname(harness.stateFilePath), { recursive: true });
    await fs.writeFile(
      harness.stateFilePath,
      JSON.stringify(
        {
          version: 1,
          session: {
            originalWorkspaceRoot: harness.workspaceRoot,
            gitRoot: harness.workspaceRoot,
            worktreePath: "",
            worktreeName: "broken-session",
            createdAt: Date.now(),
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    await harness.store.hydrateConversation(harness.workspaceRoot, harness.conversationKey);

    expect(harness.runtime.getSession()).toBeNull();
    expect(harness.runtime.getEffectiveWorkspaceRoot()).toBe(harness.workspaceRoot);
  });

  it("self-heals corrupt persisted state files during hydration", async () => {
    const harness = await createWorktreeStoreHarness();
    await fs.mkdir(path.dirname(harness.stateFilePath), { recursive: true });
    await fs.writeFile(harness.stateFilePath, "{not valid json", "utf8");

    await harness.store.hydrateConversation(harness.workspaceRoot, harness.conversationKey);

    expect(harness.runtime.getSession()).toBeNull();
    expect(harness.runtime.getEffectiveWorkspaceRoot()).toBe(harness.workspaceRoot);
    expect(
      JSON.parse(await fs.readFile(harness.stateFilePath, "utf8")),
    ).toEqual({
      version: 1,
      session: null,
    });
  });

  it("clears persisted sessions whose worktree path no longer exists", async () => {
    const harness = await createWorktreeStoreHarness();
    const missingWorktreePath = path.join(harness.storageRoot, "missing-worktree");
    await fs.mkdir(path.dirname(harness.stateFilePath), { recursive: true });
    await fs.writeFile(
      harness.stateFilePath,
      JSON.stringify(
        {
          version: 1,
          session: {
            originalWorkspaceRoot: harness.workspaceRoot,
            gitRoot: harness.workspaceRoot,
            worktreePath: missingWorktreePath,
            worktreeName: "stale-session",
            worktreeBranch: "worktree-stale-session",
            createdAt: Date.now(),
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    await harness.store.hydrateConversation(harness.workspaceRoot, harness.conversationKey);

    expect(harness.runtime.getSession()).toBeNull();
    expect(harness.runtime.getEffectiveWorkspaceRoot()).toBe(harness.workspaceRoot);
  });

  it("clears persisted sessions whose worktree name is invalid", async () => {
    const harness = await createWorktreeStoreHarness();
    const existingWorktreePath = path.join(harness.storageRoot, "existing-worktree");
    await fs.mkdir(existingWorktreePath, { recursive: true });
    await fs.mkdir(path.dirname(harness.stateFilePath), { recursive: true });
    await fs.writeFile(
      harness.stateFilePath,
      JSON.stringify(
        {
          version: 1,
          session: {
            originalWorkspaceRoot: harness.workspaceRoot,
            gitRoot: harness.workspaceRoot,
            worktreePath: existingWorktreePath,
            worktreeName: "bad name",
            worktreeBranch: "worktree-bad-name",
            createdAt: Date.now(),
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    await harness.store.hydrateConversation(harness.workspaceRoot, harness.conversationKey);

    expect(harness.runtime.getSession()).toBeNull();
    expect(harness.runtime.getEffectiveWorkspaceRoot()).toBe(harness.workspaceRoot);
  });

  it("trims recoverable persisted session fields during hydration", async () => {
    const harness = await createWorktreeStoreHarness();
    const existingWorktreePath = path.join(harness.storageRoot, "existing-worktree");
    await fs.mkdir(existingWorktreePath, { recursive: true });
    await fs.mkdir(path.dirname(harness.stateFilePath), { recursive: true });
    await fs.writeFile(
      harness.stateFilePath,
      JSON.stringify(
        {
          version: 1,
          session: {
            originalWorkspaceRoot: `  ${harness.workspaceRoot}  `,
            gitRoot: `\n${harness.workspaceRoot}\n`,
            worktreePath: `  ${existingWorktreePath}  `,
            worktreeName: " feature/test ",
            worktreeBranch: " worktree-feature+test ",
            originalBranch: " main ",
            originalHeadCommit: " abc123 ",
            createdAt: 123456789,
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    await harness.store.hydrateConversation(harness.workspaceRoot, harness.conversationKey);

    expect(harness.runtime.getSession()).toEqual({
      originalWorkspaceRoot: harness.workspaceRoot,
      gitRoot: harness.workspaceRoot,
      worktreePath: existingWorktreePath,
      worktreeName: "feature/test",
      worktreeBranch: "worktree-feature+test",
      originalBranch: "main",
      originalHeadCommit: "abc123",
      createdAt: 123456789,
    });
    expect(harness.runtime.getEffectiveWorkspaceRoot()).toBe(existingWorktreePath);

    const persisted = JSON.parse(await fs.readFile(harness.stateFilePath, "utf8")) as {
      session: Record<string, unknown> | null;
    };
    expect(persisted.session).toEqual({
      originalWorkspaceRoot: harness.workspaceRoot,
      gitRoot: harness.workspaceRoot,
      worktreePath: existingWorktreePath,
      worktreeName: "feature/test",
      worktreeBranch: "worktree-feature+test",
      originalBranch: "main",
      originalHeadCommit: "abc123",
      createdAt: 123456789,
    });
  });

  it("rebuilds persisted worktree branches from the canonical worktree name", async () => {
    const harness = await createWorktreeStoreHarness();
    const existingWorktreePath = path.join(harness.storageRoot, "existing-worktree");
    await fs.mkdir(existingWorktreePath, { recursive: true });
    await fs.mkdir(path.dirname(harness.stateFilePath), { recursive: true });
    await fs.writeFile(
      harness.stateFilePath,
      JSON.stringify(
        {
          version: 1,
          session: {
            originalWorkspaceRoot: harness.workspaceRoot,
            gitRoot: harness.workspaceRoot,
            worktreePath: existingWorktreePath,
            worktreeName: "feature/test",
            worktreeBranch: "main",
            createdAt: 123456789,
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    await harness.store.hydrateConversation(harness.workspaceRoot, harness.conversationKey);

    expect(harness.runtime.getSession()).toEqual({
      originalWorkspaceRoot: harness.workspaceRoot,
      gitRoot: harness.workspaceRoot,
      worktreePath: existingWorktreePath,
      worktreeName: "feature/test",
      worktreeBranch: "worktree-feature+test",
      createdAt: 123456789,
    });

    const persisted = JSON.parse(await fs.readFile(harness.stateFilePath, "utf8")) as {
      session: Record<string, unknown> | null;
    };
    expect(persisted.session).toEqual({
      originalWorkspaceRoot: harness.workspaceRoot,
      gitRoot: harness.workspaceRoot,
      worktreePath: existingWorktreePath,
      worktreeName: "feature/test",
      worktreeBranch: "worktree-feature+test",
      createdAt: 123456789,
    });
  });

  it("hydrates legacy state files and rewrites them to the collision-resistant path", async () => {
    const harness = await createWorktreeStoreHarness("topic/a");
    const existingWorktreePath = path.join(harness.storageRoot, "existing-worktree");
    const legacyStateFilePath = getLegacyWorktreeStateFilePath(
      harness.storageRoot,
      harness.workspaceRoot,
      harness.conversationKey,
    );
    const session = {
      originalWorkspaceRoot: harness.workspaceRoot,
      gitRoot: harness.workspaceRoot,
      worktreePath: existingWorktreePath,
      worktreeName: "topic-a",
      worktreeBranch: "worktree-topic-a",
      createdAt: 123456789,
    };

    await fs.mkdir(existingWorktreePath, { recursive: true });
    await fs.mkdir(path.dirname(legacyStateFilePath), { recursive: true });
    await fs.writeFile(
      legacyStateFilePath,
      JSON.stringify({ version: 1, session }, null, 2),
      "utf8",
    );

    await harness.store.hydrateConversation(harness.workspaceRoot, harness.conversationKey);

    expect(harness.stateFilePath).not.toBe(legacyStateFilePath);
    expect(harness.runtime.getSession()).toEqual(session);
    expect(harness.runtime.getEffectiveWorkspaceRoot()).toBe(existingWorktreePath);
    expect(
      JSON.parse(await fs.readFile(harness.stateFilePath, "utf8")) as { session: unknown },
    ).toEqual({ session, version: 1 });
  });
});
