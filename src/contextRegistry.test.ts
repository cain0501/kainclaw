import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addContextDirectory,
  addContextFile,
  buildContextSystemPrompt,
  getContextConfigPath,
  listContextFiles,
  loadContextConfig,
  removeContextFile,
} from "./contextRegistry";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("contextRegistry", () => {
  it("adds workspace-relative context directories and persists them", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-context-"));
    tempDirs.push(workspaceRoot);
    await fs.mkdir(path.join(workspaceRoot, "docs", "guides"), { recursive: true });

    const result = await addContextDirectory(workspaceRoot, "docs/guides");
    const loaded = await loadContextConfig(workspaceRoot);

    expect(result).toEqual({
      added: true,
      relativePath: "docs/guides",
      extraDirectories: ["docs/guides"],
    });
    expect(loaded.extraDirectories).toEqual(["docs/guides"]);
    expect(getContextConfigPath(workspaceRoot)).toContain(path.join(".cain", "context.json"));
  });

  it("rejects missing or escaping context directories", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-context-"));
    tempDirs.push(workspaceRoot);

    await expect(addContextDirectory(workspaceRoot, "missing")).rejects.toThrow(
      /Context directory does not exist/,
    );
    await expect(addContextDirectory(workspaceRoot, "..\\outside")).rejects.toThrow(
      /Context directory must stay inside the workspace/,
    );
  });

  it("lists context files with optional filtering", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-context-"));
    tempDirs.push(workspaceRoot);
    await fs.mkdir(path.join(workspaceRoot, "docs"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "README.md"), "# Root\n", "utf8");
    await fs.writeFile(path.join(workspaceRoot, "docs", "guide.md"), "# Guide\n", "utf8");

    await addContextDirectory(workspaceRoot, "docs");

    const result = await listContextFiles({
      workspaceRoot,
      query: "guide",
      maxResults: 10,
    });

    expect(result.scannedDirectories).toEqual([".", "docs"]);
    expect(result.files).toEqual(["docs/guide.md"]);
    expect(result.truncated).toBe(false);
  });

  it("adds and removes pinned context files", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-context-"));
    tempDirs.push(workspaceRoot);
    await fs.mkdir(path.join(workspaceRoot, "docs"), { recursive: true });
    await fs.writeFile(path.join(workspaceRoot, "docs", "guide.md"), "# Guide\n", "utf8");

    const addResult = await addContextFile(workspaceRoot, "docs/guide.md");
    expect(addResult).toEqual({
      added: true,
      relativePath: "docs/guide.md",
      pinnedFiles: ["docs/guide.md"],
    });

    const listed = await listContextFiles({
      workspaceRoot,
      maxResults: 10,
    });
    expect(listed.pinnedFiles).toEqual(["docs/guide.md"]);

    const removeResult = await removeContextFile(workspaceRoot, "docs/guide.md");
    expect(removeResult).toEqual({
      removed: true,
      relativePath: "docs/guide.md",
      pinnedFiles: [],
    });
  });

  it("builds a context-aware system prompt when extra directories are configured", () => {
    const prompt = buildContextSystemPrompt("BASE PROMPT", {
      workspaceRoot: "E:\\repo",
      extraDirectories: ["docs", "specs/api"],
      pinnedFiles: ["docs/guide.md"],
    });

    expect(prompt).toContain("BASE PROMPT");
    expect(prompt).toContain("# Context Directories");
    expect(prompt).toContain(".cain");
    expect(prompt).toContain("- docs");
    expect(prompt).toContain("- specs/api");
    expect(prompt).toContain("Pinned files:");
    expect(prompt).toContain("- docs/guide.md");
  });
});
