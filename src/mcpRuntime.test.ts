import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("resolves Claude MCP remote transport types without routing SSE as streamable HTTP", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-runtime-transport-"));
    tempDirs.push(workspaceRoot);
    const configPath = path.join(workspaceRoot, ".mcp.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          legacyUrl: {
            url: "https://legacy.example.com/mcp",
          },
          httpServer: {
            type: "http",
            url: "https://${HOST}/mcp",
            headers: {
              Authorization: "Bearer ${TOKEN}",
            },
          },
          sseServer: {
            type: "sse",
            url: "https://events.example.com/sse/",
          },
          unsupportedWs: {
            type: "ws",
            url: "wss://events.example.com/mcp",
          },
          explicitStdio: {
            type: "stdio",
            command: "node",
            args: ["server.js"],
          },
        },
      }),
      "utf8",
    );

    const runtime = new McpRuntime(() => workspaceRoot, {
      HOST: "api.example.com",
      TOKEN: "secret",
    });

    await (runtime as any).refreshConfig();

    const configs = (runtime as any).serverConfigs as Map<
      string,
      { kind: string; url?: string; headers?: Record<string, string> }
    >;
    expect(configs.get("legacyUrl")?.kind).toBe("streamable-http");
    expect(configs.get("httpServer")?.kind).toBe("streamable-http");
    expect(configs.get("httpServer")?.url).toBe("https://api.example.com/mcp");
    expect(configs.get("httpServer")?.headers?.Authorization).toBe("Bearer secret");
    expect(configs.get("sseServer")?.kind).toBe("sse");
    expect(configs.get("sseServer")?.url).toBe("https://events.example.com/sse");
    expect(configs.get("explicitStdio")?.kind).toBe("stdio");
    expect(configs.has("unsupportedWs")).toBe(false);
  });

  it("classifies auth failures on Claude SSE and HTTP MCP servers as needs-auth", async () => {
    const runtime = new McpRuntime(() => "E:\\claudecodejingiang\\vscode-extension", {});
    const error = new UnauthorizedError("OAuth required");

    expect(
      (runtime as any).classifyServerFailure(
        "sseServer",
        { kind: "sse", name: "sseServer", url: "https://events.example.com/sse" },
        error,
      ).state,
    ).toBe("needs-auth");
    expect(
      (runtime as any).classifyServerFailure(
        "httpServer",
        { kind: "streamable-http", name: "httpServer", url: "https://api.example.com/mcp" },
        error,
      ).state,
    ).toBe("needs-auth");
  });

  it("exposes a Claude-style MCP authenticate placeholder when a remote server needs auth", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-runtime-auth-"));
    tempDirs.push(workspaceRoot);
    await fs.writeFile(
      path.join(workspaceRoot, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          secure: {
            type: "http",
            url: "https://secure.example.com/mcp",
          },
        },
      }),
      "utf8",
    );

    const runtime = new McpRuntime(() => workspaceRoot, {});
    (runtime as any).ensureConnection = async () => {
      throw new UnauthorizedError("OAuth required");
    };

    const tools = await runtime.getToolDefinitions();

    expect(tools.map(tool => tool.name)).toContain("mcp__secure__authenticate");
    expect(tools.map(tool => tool.name)).not.toContain("mcp__secure__status");

    const result = await runtime.executeTool(
      "mcp__secure__authenticate",
      {},
      { workspaceRoot },
    );

    expect(result.summary).toContain("requires authentication");
    expect(result.content).toContain("Configure the server token/headers");
  });

  it("accepts single-underscore MCP auth tool names that models may emit by mistake", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-runtime-auth-alias-"));
    tempDirs.push(workspaceRoot);
    await fs.writeFile(
      path.join(workspaceRoot, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          notion: {
            type: "http",
            url: "https://mcp.notion.com/mcp",
          },
        },
      }),
      "utf8",
    );

    const runtime = new McpRuntime(() => workspaceRoot, {});
    (runtime as any).ensureConnection = async () => {
      throw new UnauthorizedError("OAuth required");
    };

    await runtime.getToolDefinitions();

    const result = await runtime.executeTool(
      "mcp_notion_authenticate",
      {},
      { workspaceRoot } as any,
    );

    expect(result.summary).toContain("requires authentication");
    expect(result.content).toContain("Configure the server token/headers");
  });

  it("keeps the auth placeholder executable even if the live server map is refreshed away", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-runtime-auth-sticky-"));
    tempDirs.push(workspaceRoot);
    await fs.writeFile(
      path.join(workspaceRoot, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          notion: {
            type: "http",
            url: "https://mcp.notion.com/mcp",
            oauth: {
              callbackPort: 3118,
            },
          },
        },
      }),
      "utf8",
    );

    const runtime = new McpRuntime(() => workspaceRoot, {});

    (runtime as any).ensureConnection = async () => {
      throw new UnauthorizedError("OAuth required");
    };

    const tools = await runtime.getToolDefinitions();
    expect(tools.map((tool: { name: string }) => tool.name)).toContain(
      "mcp__notion__authenticate",
    );

    (runtime as any).serverConfigs.clear();

    const result = await runtime.executeTool(
      "mcp__notion__authenticate",
      {},
      {
        workspaceRoot,
      } as any,
    );

    expect(result.summary).toContain("requires authentication");
  });

  it("does not mark a connected server as failed when ReadMcpResourceTool targets a server without resources", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-runtime-no-resources-"));
    tempDirs.push(workspaceRoot);
    await fs.writeFile(
      path.join(workspaceRoot, ".mcp.json"),
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

    const runtime = new McpRuntime(() => workspaceRoot, {});
    (runtime as any).ensureConnection = async () => ({
      client: {
        getServerCapabilities: () => ({}),
      },
      transport: {
        close: async () => undefined,
      },
    });

    await expect(runtime.readResource("demo", "memory://demo")).rejects.toThrow(
      'Server "demo" does not support resources',
    );
    expect((runtime as any).serverStatuses.get("demo")).toBeUndefined();
  });

  it("does not mark a connected server as failed when an MCP tool returns isError", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-runtime-tool-error-"));
    tempDirs.push(workspaceRoot);
    await fs.writeFile(
      path.join(workspaceRoot, ".mcp.json"),
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

    const runtime = new McpRuntime(() => workspaceRoot, {});
    let closeCount = 0;
    (runtime as any).ensureConnection = async () => ({
      client: {
        callTool: async () => ({
          isError: true,
          content: [{ type: "text", text: "tool rejected the request" }],
        }),
      },
      transport: {
        close: async () => {
          closeCount++;
        },
      },
    });

    await expect(
      runtime.executeTool("mcp__demo__reject", {}, { workspaceRoot }),
    ).rejects.toThrow("tool rejected the request");
    expect(closeCount).toBe(0);
    expect((runtime as any).serverStatuses.get("demo")).toBeUndefined();
  });

  it("passes structuredContent and toolResult MCP responses through using Claude result priority", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-runtime-tool-result-"));
    tempDirs.push(workspaceRoot);
    await fs.writeFile(
      path.join(workspaceRoot, ".mcp.json"),
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

    const runtime = new McpRuntime(() => workspaceRoot, {});
    const results = [
      { structuredContent: { title: "Report", count: 3 }, content: [{ type: "text", text: "ignored" }] },
      { toolResult: "legacy result", content: [{ type: "text", text: "ignored" }] },
    ];
    (runtime as any).ensureConnection = async () => ({
      client: {
        callTool: async () => results.shift(),
      },
      transport: {
        close: async () => undefined,
      },
    });

    const structured = await runtime.executeTool("mcp__demo__structured", {}, { workspaceRoot });
    const legacy = await runtime.executeTool("mcp__demo__legacy", {}, { workspaceRoot });

    expect(structured.content).toContain('"title": "Report"');
    expect(structured.content).not.toContain("ignored");
    expect(legacy.content).toBe("legacy result");
  });

  it("exposes normalized Claude MCP tool names while calling the original server and tool names", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-runtime-normalized-tool-"));
    tempDirs.push(workspaceRoot);
    await fs.writeFile(
      path.join(workspaceRoot, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          "github.com": {
            command: "node",
            args: ["server.js"],
          },
        },
      }),
      "utf8",
    );

    const runtime = new McpRuntime(() => workspaceRoot, {});
    const callRecords: Array<{ serverName: string; toolName: string }> = [];
    (runtime as any).ensureConnection = async (serverName: string) => ({
      client: {
        getServerCapabilities: () => ({ tools: {} }),
        listTools: async () => ({
          tools: [
            {
              name: "create issue",
              description: "Create an issue",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        }),
        callTool: async ({ name }: { name: string }) => {
          callRecords.push({ serverName, toolName: name });
          return { content: [{ type: "text", text: "created" }] };
        },
      },
      transport: {
        close: async () => undefined,
      },
    });

    const tools = await runtime.getToolDefinitions();
    expect(tools.map(tool => tool.name)).toContain("mcp__github_com__create_issue");

    const result = await runtime.executeTool(
      "mcp__github_com__create_issue",
      {},
      { workspaceRoot },
    );

    expect(result.content).toBe("created");
    expect(callRecords).toEqual([{ serverName: "github.com", toolName: "create issue" }]);
  });

  it("deduplicates duplicate MCP tool names before exposing them to the model", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-runtime-dedupe-"));
    tempDirs.push(workspaceRoot);
    await fs.writeFile(
      path.join(workspaceRoot, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          notion: {
            command: "node",
            args: ["server.js"],
          },
        },
      }),
      "utf8",
    );

    const runtime = new McpRuntime(() => workspaceRoot, {});
    (runtime as any).ensureConnection = async () => ({
      client: {
        getServerCapabilities: () => ({ tools: {} }),
        listTools: async () => ({
          tools: [
            {
              name: "notion-get-users",
              description: "Get users",
              inputSchema: { type: "object", properties: {} },
            },
            {
              name: "notion-get-users",
              description: "Duplicate get users",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        }),
      },
      transport: {
        close: async () => undefined,
      },
    });

    const tools = await runtime.getToolDefinitions();

    expect(tools).toEqual([
      expect.objectContaining({
        name: "mcp__notion__notion-get-users",
      }),
    ]);
  });

  it("accepts model-normalized MCP tool names that replace separators with single underscores", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-runtime-normalized-alias-"));
    tempDirs.push(workspaceRoot);
    await fs.writeFile(
      path.join(workspaceRoot, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          notion: {
            command: "node",
            args: ["server.js"],
          },
        },
      }),
      "utf8",
    );

    const runtime = new McpRuntime(() => workspaceRoot, {});
    const callRecords: Array<{ serverName: string; toolName: string }> = [];
    (runtime as any).ensureConnection = async (serverName: string) => ({
      client: {
        getServerCapabilities: () => ({ tools: {} }),
        listTools: async () => ({
          tools: [
            {
              name: "notion-get-users",
              description: "Get users",
              inputSchema: { type: "object", properties: {} },
            },
          ],
        }),
        callTool: async ({ name }: { name: string }) => {
          callRecords.push({ serverName, toolName: name });
          return { content: [{ type: "text", text: "ok" }] };
        },
      },
      transport: {
        close: async () => undefined,
      },
    });

    await runtime.getToolDefinitions();
    const result = await runtime.executeTool(
      "mcp_notion_notion_get_users",
      { page_size: 5 },
      { workspaceRoot } as any,
    );

    expect(result.content).toBe("ok");
    expect(callRecords).toEqual([
      { serverName: "notion", toolName: "notion-get-users" },
    ]);
  });

  it("accepts normalized server names for MCP resource reads but uses the original server connection", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-runtime-normalized-resource-"));
    tempDirs.push(workspaceRoot);
    await fs.writeFile(
      path.join(workspaceRoot, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          "my server": {
            command: "node",
            args: ["server.js"],
          },
        },
      }),
      "utf8",
    );

    const runtime = new McpRuntime(() => workspaceRoot, {});
    const connectedServerNames: string[] = [];
    (runtime as any).ensureConnection = async (serverName: string) => {
      connectedServerNames.push(serverName);
      return {
        client: {
          getServerCapabilities: () => ({ resources: {} }),
          readResource: async () => ({
            contents: [{ uri: "memory://demo", text: "resource text" }],
          }),
        },
        transport: {
          close: async () => undefined,
        },
      };
    };

    const result = await runtime.readResource("my_server", "memory://demo");

    expect(result.content).toContain("resource text");
    expect(connectedServerNames).toEqual(["my server"]);
  });

  it("exposes Claude-style MCP prompt commands for servers with prompt capability", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-runtime-prompts-"));
    tempDirs.push(workspaceRoot);
    await fs.writeFile(
      path.join(workspaceRoot, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          github: {
            command: "node",
            args: ["server.js"],
          },
        },
      }),
      "utf8",
    );

    const runtime = new McpRuntime(() => workspaceRoot, {});
    (runtime as any).ensureConnection = async () => ({
      client: {
        getServerCapabilities: () => ({ prompts: {} }),
        request: async () => ({
          prompts: [
            {
              name: "summarize_issue",
              description: "Summarize an issue with comments.",
              arguments: [{ name: "issue" }],
            },
          ],
        }),
      },
      transport: {
        close: async () => undefined,
      },
    });

    const commands = await runtime.getPromptCommands();

    expect(commands).toEqual([
      {
        name: "/mcp__github__summarize_issue",
        description: "Summarize an issue with comments.",
        argNames: ["issue"],
        serverName: "github",
        promptName: "summarize_issue",
        userFacingName: "github:summarize_issue (MCP)",
      },
    ]);
  });

  it("executes MCP prompt commands and maps image prompt blocks into attachments", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-mcp-runtime-prompt-run-"));
    tempDirs.push(workspaceRoot);
    await fs.writeFile(
      path.join(workspaceRoot, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          github: {
            command: "node",
            args: ["server.js"],
          },
        },
      }),
      "utf8",
    );

    const runtime = new McpRuntime(() => workspaceRoot, {});
    (runtime as any).ensureConnection = async () => ({
      client: {
        getServerCapabilities: () => ({ prompts: {} }),
        request: async () => ({
          prompts: [
            {
              name: "summarize_issue",
              description: "Summarize an issue with comments.",
              arguments: [{ name: "issue" }],
            },
          ],
        }),
        getPrompt: async ({ name, arguments: args }: { name: string; arguments: Record<string, string> }) => ({
          messages: [
            {
              content: {
                type: "text",
                text: `Summarize issue ${args.issue} from prompt ${name}.`,
              },
            },
            {
              content: {
                type: "image",
                data: "QUJDRA==",
                mimeType: "image/png",
              },
            },
          ],
        }),
      },
      transport: {
        close: async () => undefined,
      },
    });

    const result = await runtime.executePromptCommand(
      "/mcp__github__summarize_issue",
      "123",
    );

    expect(result).toEqual({
      content: "Summarize issue 123 from prompt summarize_issue.",
      attachments: [{ data: "QUJDRA==", mimeType: "image/png" }],
    });
  });
});
