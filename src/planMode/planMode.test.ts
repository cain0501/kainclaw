import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ensurePlanFile,
  getPlanRelativePath,
  isPlanWritablePath,
  normalizeWorkspaceRelativePath,
  readPlanFile,
} from "./planMode";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("planMode helpers", () => {
  it("normalizes workspace-relative paths", () => {
    expect(normalizeWorkspaceRelativePath(".\\foo\\bar.md")).toBe("foo/bar.md");
    expect(normalizeWorkspaceRelativePath("plans/test.md")).toBe("plans/test.md");
  });

  it("builds the expected plan relative path", () => {
    expect(getPlanRelativePath("conversation-1")).toBe(".cain-artifacts/plans/conversation-1.md");
  });

  it("creates and then reuses a plan file", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-plan-mode-"));
    tempDirs.push(workspaceRoot);

    const first = await ensurePlanFile(workspaceRoot, "conversation-1");
    const second = await ensurePlanFile(workspaceRoot, "conversation-1");

    expect(first.created).toBe(true);
    expect(first.relativePath).toBe(".cain-artifacts/plans/conversation-1.md");
    expect(first.content).toContain("# Implementation Plan");

    expect(second.created).toBe(false);
    expect(second.relativePath).toBe(first.relativePath);
    expect(second.content).toBe(first.content);
  });

  it("reads plan files and compares writable paths case-insensitively", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-plan-mode-"));
    tempDirs.push(workspaceRoot);

    const plan = await ensurePlanFile(workspaceRoot, "conversation-2");
    const content = await readPlanFile(workspaceRoot, plan.relativePath);

    expect(content).toContain("# Implementation Plan");
    expect(isPlanWritablePath(".cain-artifacts\\plans\\conversation-2.md", plan.relativePath)).toBe(true);
    expect(isPlanWritablePath("other/file.md", plan.relativePath)).toBe(false);
  });
});
