import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

export const kainClawServerInfo = {
  name: "kainclaw",
  version: "0.0.1",
  transport: "stdio",
  capabilities: ["kainclaw_server_info"],
} as const;

export const kainClawToolDefinitions: Array<{
  name: "kainclaw_server_info";
  annotations: ToolAnnotations;
}> = [
  {
    name: "kainclaw_server_info",
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
];

export function createKainClawServerInfoHandler(): () => Promise<CallToolResult> {
  return async () => ({
    content: [{ type: "text", text: JSON.stringify(kainClawServerInfo, null, 2) }],
  });
}

export function createKainClawMcpServer(): McpServer {
  const server = new McpServer({
    name: kainClawServerInfo.name,
    version: kainClawServerInfo.version,
  });
  const tool = kainClawToolDefinitions[0];
  server.registerTool(tool.name, {
    title: "KainClaw server information",
    description: "Return the KainClaw MCP server transport and currently safe capabilities. This tool does not access user data.",
    annotations: tool.annotations,
  }, createKainClawServerInfoHandler());
  return server;
}

export async function runKainClawStdioServer(): Promise<void> {
  const server = createKainClawMcpServer();
  await server.connect(new StdioServerTransport());
}

if (require.main === module) {
  runKainClawStdioServer().catch(error => {
    console.error(error instanceof Error ? error.message : "Unable to start KainClaw MCP server.");
    process.exitCode = 1;
  });
}
