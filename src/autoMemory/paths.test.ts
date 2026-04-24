import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensureAutoMemoryDir,
  findMemoryManifestEntry,
  formatMemoryManifest,
  getAutoMemoryDir,
  getAutoMemoryEntrypoint,
  readAutoMemoryEntry,
  readAutoMemoryEntrypoint,
  saveAutoMemorySuggestions,
  scanAutoMemoryManifest,
} from "./paths";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("autoMemory paths helpers", () => {
  it("derives the memory directory and entrypoint path from the workspace root", () => {
    const workspaceRoot = "E:\\claudecodejingiang\\vscode-extension";
    const memoryDir = getAutoMemoryDir(workspaceRoot);
    const entrypoint = getAutoMemoryEntrypoint(workspaceRoot);

    expect(memoryDir).toContain(path.join(".cain", "projects"));
    expect(entrypoint.endsWith(path.join("memory", "MEMORY.md"))).toBe(true);
  });

  it("creates the memory directory and default MEMORY.md entrypoint", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-memory-"));
    tempDirs.push(workspaceRoot);

    const result = await ensureAutoMemoryDir(workspaceRoot);
    const content = await fs.readFile(result.entrypointPath, "utf8");

    expect(result.memoryDir).toContain(path.join(".cain", "projects"));
    expect(content).toContain("# Memory Index");
  });

  it("saves memory suggestions and scans them back into a manifest", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-memory-"));
    tempDirs.push(workspaceRoot);

    await saveAutoMemorySuggestions(workspaceRoot, [
      {
        slug: "team-style.md",
        name: "Team Style",
        description: "How to work with this team",
        type: "feedback",
        hook: "Use short progress updates",
        body: "Why: The team prefers concise updates.\nHow to apply: Keep status messages short.",
      },
    ]);

    const manifest = await scanAutoMemoryManifest(workspaceRoot);

    expect(manifest).toEqual([
      {
        relativePath: "team-style.md",
        name: "Team Style",
        description: "How to work with this team",
        type: "feedback",
      },
    ]);
    expect(formatMemoryManifest(manifest)).toContain("team-style.md | feedback | Team Style");
  });

  it("reads the auto-memory entrypoint content", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-memory-"));
    tempDirs.push(workspaceRoot);
    const { entrypointPath } = await ensureAutoMemoryDir(workspaceRoot);
    await fs.writeFile(entrypointPath, "# Memory Index\n\n- [Team Style](team-style.md): use short updates\n", "utf8");

    const content = await readAutoMemoryEntrypoint(workspaceRoot);

    expect(content).toContain("Team Style");
  });

  it("finds and reads a specific memory entry by slug or name", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-memory-"));
    tempDirs.push(workspaceRoot);

    await saveAutoMemorySuggestions(workspaceRoot, [
      {
        slug: "team-style.md",
        name: "Team Style",
        description: "How to work with this team",
        type: "feedback",
        hook: "Use short progress updates",
        body: "Why: The team prefers concise updates.\nHow to apply: Keep status messages short.",
      },
    ]);

    const manifest = await scanAutoMemoryManifest(workspaceRoot);
    expect(findMemoryManifestEntry(manifest, "team-style")?.relativePath).toBe("team-style.md");
    expect(findMemoryManifestEntry(manifest, "Team Style")?.relativePath).toBe("team-style.md");

    const entry = await readAutoMemoryEntry(workspaceRoot, "team-style");

    expect(entry).toMatchObject({
      relativePath: "team-style.md",
      name: "Team Style",
      type: "feedback",
    });
    expect(entry?.body).toContain("Why: The team prefers concise updates.");
  });
});
