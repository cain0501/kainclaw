import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { McpRuntime } from "./mcpRuntime";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("McpRuntime config discovery cache", () => {
  it("reuses the discovered config file path after the first lookup", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-runtime-"));
    tempDirs.push(workspaceRoot);
    const configPath = path.join(workspaceRoot, ".mcp.json");
    await fs.writeFile(configPath, JSON.stringify({ mcpServers: {} }), "utf8");

    const runtime = new McpRuntime(() => workspaceRoot, {});

    const first = await (runtime as any).findConfigFile();
    expect(first).toBe(configPath);
    expect((runtime as any).discoveredConfigFilePath).toBe(configPath);

    const second = await (runtime as any).findConfigFile();
    expect(second).toBe(configPath);
    expect((runtime as any).discoveredConfigFilePath).toBe(configPath);
  });

  it("reloads config after the host marks MCP config dirty", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-runtime-"));
    tempDirs.push(workspaceRoot);
    const configPath = path.join(workspaceRoot, ".mcp.json");
    await fs.writeFile(configPath, JSON.stringify({ mcpServers: {} }), "utf8");

    const runtime = new McpRuntime(() => workspaceRoot, {});

    const firstChanged = await (runtime as any).refreshConfig();
    expect(firstChanged).toBe(true);

    const secondChanged = await (runtime as any).refreshConfig();
    expect(secondChanged).toBe(false);

    await new Promise(resolve => setTimeout(resolve, 10));
    await fs.writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          demo: {
            command: "node",
            args: ["server.js"],
          },
        },
      }),
      "utf8",
    );
    runtime.markConfigDirty();

    const thirdChanged = await (runtime as any).refreshConfig();
    expect(thirdChanged).toBe(true);
  });

  it("invalidates cached config path when the file is removed", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-runtime-"));
    tempDirs.push(workspaceRoot);
    const configPath = path.join(workspaceRoot, ".mcp.json");
    await fs.writeFile(configPath, JSON.stringify({ mcpServers: {} }), "utf8");

    const runtime = new McpRuntime(() => workspaceRoot, {});

    const first = await (runtime as any).findConfigFile();
    expect(first).toBe(configPath);
    expect((runtime as any).discoveredConfigFilePath).toBe(configPath);

    await fs.unlink(configPath);

    const second = await (runtime as any).findConfigFile();
    expect(second).toBeUndefined();
    expect((runtime as any).discoveredConfigFilePath).toBeUndefined();
  });

  it("invalidates discovered config cache when workspace root changes", async () => {
    const firstRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-runtime-a-"));
    const secondRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-runtime-b-"));
    tempDirs.push(firstRoot, secondRoot);
    const firstConfigPath = path.join(firstRoot, ".mcp.json");
    const secondConfigPath = path.join(secondRoot, ".mcp.json");
    await fs.writeFile(firstConfigPath, JSON.stringify({ mcpServers: {} }), "utf8");
    await fs.writeFile(secondConfigPath, JSON.stringify({ mcpServers: {} }), "utf8");

    let currentRoot = firstRoot;
    const runtime = new McpRuntime(() => currentRoot, {});

    const first = await (runtime as any).refreshConfig();
    expect(first).toBe(true);
    expect((runtime as any).discoveredConfigFilePath).toBe(firstConfigPath);

    currentRoot = secondRoot;
    const second = await (runtime as any).refreshConfig();
    expect(second).toBe(true);
    expect((runtime as any).discoveredConfigFilePath).toBe(secondConfigPath);
  });

  it("re-resolves MCP servers when envMap changes without touching the config file", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-runtime-env-"));
    tempDirs.push(workspaceRoot);
    const configPath = path.join(workspaceRoot, ".mcp.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          demo: {
            url: "https://${HOST}/mcp",
          },
        },
      }),
      "utf8",
    );

    const runtime = new McpRuntime(() => workspaceRoot, { HOST: "first.example.com" });

    const firstChanged = await (runtime as any).refreshConfig();
    expect(firstChanged).toBe(true);
    expect((runtime as any).serverConfigs.get("demo")?.url).toBe("https://first.example.com/mcp");

    runtime.setEnvMap({ HOST: "second.example.com" });

    const secondChanged = await (runtime as any).refreshConfig();
    expect(secondChanged).toBe(true);
    expect((runtime as any).serverConfigs.get("demo")?.url).toBe("https://second.example.com/mcp");
  });
});
