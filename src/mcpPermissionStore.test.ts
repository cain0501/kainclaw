import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMcpPermissionKey,
  McpPermissionStore,
  normalizeMcpPermissionPattern,
} from "./mcpPermissionStore";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

describe("McpPermissionStore", () => {
  it("persists server, wildcard, and tool rules using canonical MCP keys", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-permissions-"));
    tempDirs.push(storageRoot);
    const store = new McpPermissionStore(storageRoot);

    await store.setRule("mcp__GitHub.Com", "allow");
    await store.setRule("mcp__github_com__*", "allow");
    await store.setRule("mcp__github_com__create issue", "deny");

    expect(await store.listRules()).toEqual([
      expect.objectContaining({ pattern: "mcp__github_com__*", effect: "allow" }),
      expect.objectContaining({ pattern: "mcp__github_com__create_issue", effect: "deny" }),
    ]);
    expect(await new McpPermissionStore(storageRoot).getDecision("mcp__github_com__list_issues")).toBe("allow");
  });

  it("lets deny win over matching allow rules", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-permissions-"));
    tempDirs.push(storageRoot);
    const store = new McpPermissionStore(storageRoot);

    await store.setRule("mcp__github__*", "allow");
    await store.setRule("mcp__github__delete_issue", "deny");

    expect(await store.getDecision("mcp__github__list_issues")).toBe("allow");
    expect(await store.getDecision("mcp__github__delete_issue")).toBe("deny");
    expect(await store.getDecision("mcp__other__delete_issue")).toBe("none");
  });

  it("removes rules and rejects partial wildcard patterns", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-permissions-"));
    tempDirs.push(storageRoot);
    const store = new McpPermissionStore(storageRoot);

    await store.setRule("mcp__demo__read", "deny");
    await store.removeRule("mcp__demo__read", "deny");

    expect(await store.getDecision("mcp__demo__read")).toBe("none");
    expect(() => normalizeMcpPermissionPattern("mcp__demo__read*")).toThrow(/complete tool segment/);
    expect(buildMcpPermissionKey("GitHub.Com", "Create Issue")).toBe("mcp__github_com__create_issue");
  });
});
