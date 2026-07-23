import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { McpRegistry } from "./mcpRegistry";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("McpRegistry", () => {
  it("adds, lists, disables, and removes workspace MCP servers", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-registry-"));
    tempDirs.push(workspaceRoot);

    const registry = new McpRegistry(workspaceRoot);

    await registry.addServer("fetch", {
      command: "uvx",
      args: ["mcp-server-fetch"],
    });

    let servers = await registry.listServers();
    expect(servers).toHaveLength(1);
    expect(servers[0]).toMatchObject({
      name: "fetch",
      enabled: true,
      transport: "stdio",
    });
    expect(servers[0]?.sourcePath).toBe(path.join(workspaceRoot, ".mcp.json"));

    const configPath = path.join(workspaceRoot, ".mcp.json");
    const json = JSON.parse(await fs.readFile(configPath, "utf8")) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(json.mcpServers.fetch.command).toBe("uvx");
    expect(json.mcpServers.fetch.args).toEqual(["mcp-server-fetch"]);

    await registry.updateServer("fetch", {
      url: "https://fetch.example.com/mcp",
      type: "streamable-http",
    });
    servers = await registry.listServers();
    expect(servers[0]).toMatchObject({
      enabled: true,
      scope: "workspace",
      transport: "streamable-http",
    });

    await registry.setServerEnabled("fetch", false);
    servers = await registry.listServers();
    expect(servers[0]?.enabled).toBe(false);

    await registry.removeServer("fetch");
    expect(await registry.listServers()).toEqual([]);
  });

  it("rejects duplicate, invalid, and escaping configs", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-registry-invalid-"));
    tempDirs.push(workspaceRoot);

    const registry = new McpRegistry(workspaceRoot);

    await registry.addServer("fetch", {
      command: "uvx",
      args: ["mcp-server-fetch"],
    });

    await expect(
      registry.addServer("fetch", {
        command: "uvx",
        args: ["mcp-server-fetch"],
      }),
    ).rejects.toThrow(/already exists/);

    await expect(
      registry.addServer("bad name", {
        command: "uvx",
      }),
    ).rejects.toThrow(/Suggested:/);

    await expect(
      registry.addServer("escape", {
        command: "node",
        cwd: "..\\outside",
      }),
    ).rejects.toThrow(/Path escapes the workspace/);

    await expect(
      registry.addServer("broken", {
        env: { BAD: "1" },
      }),
    ).rejects.toThrow(/provide either command or url/);

    await expect(
      registry.addServer("bad-url", {
        url: "file:///not-an-mcp-server",
      }),
    ).rejects.toThrow(/HTTP or HTTPS URL/);

    await expect(
      registry.addServer("bad-headers", {
        url: "https://example.com/mcp",
        headers: [] as unknown as Record<string, string>,
      }),
    ).rejects.toThrow(/object of strings/);
  });

  it("imports Codex MCP servers from a TOML config subset", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-registry-import-"));
    const codexRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-codex-config-"));
    tempDirs.push(workspaceRoot, codexRoot);

    const codexConfigPath = path.join(codexRoot, "config.toml");
    await fs.writeFile(
      codexConfigPath,
      [
        '[mcp_servers.fetch]',
        'command = "${DEMO_MCP_COMMAND}"',
        'args = ["mcp-server-fetch"]',
        '',
        '[mcp_servers.node_repl]',
        'command = "node_repl.exe"',
        'args = []',
        '',
        '[mcp_servers.node_repl.env]',
        'CODEX_HOME = "C:\\\\Users\\\\Administrator\\\\.codex"',
        'BROWSER_USE_AVAILABLE_BACKENDS = "chrome,iab"',
        '',
        '[mcp_servers.pencil]',
        'type = "http"',
        'url = "https://pencil.example.com/mcp"',
        'bearer_token_env_var = "PENCIL_TOKEN"',
        'headers = { Authorization = "Bearer secret", Accept = "application/json" }',
        '',
      ].join("\n"),
      "utf8",
    );

    const registry = new McpRegistry(workspaceRoot, codexConfigPath);
    const result = await registry.importCodexServers();

    expect(result.skipped).toEqual([]);
    expect(result.imported.map(entry => entry.name).sort()).toEqual([
      "fetch",
      "node_repl",
      "pencil",
    ]);

    const listed = await registry.listServers();
    expect(listed.map(entry => entry.name).sort()).toEqual([
      "fetch",
      "node_repl",
      "pencil",
    ]);
    expect(listed.find(entry => entry.name === "fetch")?.config.command).toBe(
      "${DEMO_MCP_COMMAND}",
    );
    expect(listed.find(entry => entry.name === "node_repl")?.config.env?.CODEX_HOME).toContain(
      ".codex",
    );
    expect(listed.find(entry => entry.name === "pencil")?.transport).toBe("streamable-http");
    expect(listed.find(entry => entry.name === "pencil")?.config.headers).toEqual({
      Accept: "application/json",
      Authorization: "Bearer ${PENCIL_TOKEN}",
    });
  });

  it("resolves an existing MCP config from a parent workspace directory", async () => {
    const parentRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-registry-parent-"));
    const childRoot = path.join(parentRoot, "nested", "child");
    await fs.mkdir(childRoot, { recursive: true });
    tempDirs.push(parentRoot);

    await fs.writeFile(
      path.join(parentRoot, ".cain-mcp.json"),
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

    const registry = new McpRegistry(childRoot);
    const servers = await registry.listServers();

    expect(servers).toHaveLength(1);
    expect(servers[0]?.name).toBe("demo");
    expect(servers[0]?.sourcePath).toBe(path.join(parentRoot, ".cain-mcp.json"));
  });
});
