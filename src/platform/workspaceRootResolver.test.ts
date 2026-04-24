import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { resolveWorkspaceRoot } from "./workspaceRootResolver";

const execFileAsync = promisify(execFile);
const tempDirs: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

async function initGitRepo(repoRoot: string): Promise<void> {
  await fs.mkdir(repoRoot, { recursive: true });
  await execFileAsync("git", ["init"], {
    cwd: repoRoot,
    windowsHide: true,
  });
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("resolveWorkspaceRoot", () => {
  it("keeps a selected subdirectory inside a git repo as the effective workspace", async () => {
    const workspaceRoot = await createTempDir("workspace-root-resolver-");
    const repoRoot = path.join(workspaceRoot, "repo");
    const nestedFolder = path.join(repoRoot, "packages", "feature");

    await initGitRepo(repoRoot);
    await fs.mkdir(nestedFolder, { recursive: true });

    const resolution = await resolveWorkspaceRoot(nestedFolder);

    expect(resolution).toMatchObject({
      selectedRoot: nestedFolder,
      effectiveRoot: nestedFolder,
      gitRoot: repoRoot,
      kind: "inside_git_repo",
    });
  });

  it("auto-descends into a unique nested git repo when the selected folder is a parent workspace", async () => {
    const workspaceRoot = await createTempDir("workspace-root-resolver-");
    const repoRoot = path.join(workspaceRoot, "vscode-extension");

    await initGitRepo(repoRoot);

    const resolution = await resolveWorkspaceRoot(workspaceRoot);

    expect(resolution).toMatchObject({
      selectedRoot: workspaceRoot,
      effectiveRoot: repoRoot,
      gitRoot: repoRoot,
      kind: "nested_git_root",
    });
  });

  it("keeps non-git folders in degraded mode when no nested repo exists", async () => {
    const workspaceRoot = await createTempDir("workspace-root-resolver-");

    const resolution = await resolveWorkspaceRoot(workspaceRoot);

    expect(resolution).toMatchObject({
      selectedRoot: workspaceRoot,
      effectiveRoot: workspaceRoot,
      gitRoot: null,
      kind: "non_git_workspace",
    });
    expect(resolution.detail).toContain("degraded mode");
  });

  it("does not guess when multiple nested repos exist at the same depth", async () => {
    const workspaceRoot = await createTempDir("workspace-root-resolver-");
    const repoA = path.join(workspaceRoot, "repo-a");
    const repoB = path.join(workspaceRoot, "repo-b");

    await Promise.all([initGitRepo(repoA), initGitRepo(repoB)]);

    const resolution = await resolveWorkspaceRoot(workspaceRoot);

    expect(resolution).toMatchObject({
      selectedRoot: workspaceRoot,
      effectiveRoot: workspaceRoot,
      gitRoot: null,
      kind: "ambiguous_nested_git_roots",
      candidates: [repoA, repoB],
    });
  });
});
