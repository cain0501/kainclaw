import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { McpProjectApprovalStore } from "./mcpProjectApprovalStore";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

describe("McpProjectApprovalStore", () => {
  it("persists approval decisions outside the workspace configuration", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-approval-"));
    tempDirs.push(storageRoot);
    const target = {
      workspaceRoot: "E:\\work\\demo",
      configPath: "E:\\work\\demo\\.mcp.json",
      serverName: "filesystem",
      config: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"] },
    };
    const store = new McpProjectApprovalStore(storageRoot);

    expect(await store.getDecision(target)).toBe("unapproved");
    await store.approve(target);

    const reloadedStore = new McpProjectApprovalStore(storageRoot);
    expect(await reloadedStore.getDecision(target)).toBe("approved");
    expect(await fs.readFile(path.join(storageRoot, "mcp-project-approvals.json"), "utf8"))
      .toContain('"decision": "approved"');
  });

  it("does not inherit an approval after the server configuration changes", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-approval-"));
    tempDirs.push(storageRoot);
    const store = new McpProjectApprovalStore(storageRoot);
    const target = {
      workspaceRoot: "E:\\work\\demo",
      configPath: "E:\\work\\demo\\.mcp.json",
      serverName: "filesystem",
      config: { command: "npx", args: ["-y", "safe-server"] },
    };

    await store.approve(target);
    expect(await store.getDecision({ ...target, config: { command: "npx", args: ["-y", "different-server"] } }))
      .toBe("unapproved");
  });

  it("keeps approval when only the enabled state changes", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-approval-"));
    tempDirs.push(storageRoot);
    const store = new McpProjectApprovalStore(storageRoot);
    const target = {
      workspaceRoot: "E:\\work\\demo",
      configPath: "E:\\work\\demo\\.mcp.json",
      serverName: "filesystem",
      config: { command: "npx", args: ["-y", "safe-server"] },
    };

    await store.approve(target);
    expect(await store.getDecision({ ...target, config: { ...target.config, disabled: true } }))
      .toBe("approved");
  });

  it("keeps rejection until it is reset", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-approval-"));
    tempDirs.push(storageRoot);
    const store = new McpProjectApprovalStore(storageRoot);
    const target = {
      workspaceRoot: "E:\\work\\demo",
      configPath: "E:\\work\\demo\\.cain-mcp.json",
      serverName: "remote",
      config: { type: "streamable-http", url: "https://example.com/mcp" },
    };

    await store.reject(target);
    expect(await store.getDecision(target)).toBe("rejected");
    await store.reset(target);
    expect(await store.getDecision(target)).toBe("unapproved");
  });
});
