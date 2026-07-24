import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  KainClawInboundSessionStore,
  type KainClawInboundSession,
} from "./kainclawInboundSessionStore";
import { InboundMcpNamedPipeClient } from "../platform/inboundMcpNamedPipeBridge";

export const kainClawServerInfo = {
  name: "kainclaw",
  version: "0.0.1",
  transport: "stdio",
  capabilities: [
    "kainclaw_server_info",
    "kainclaw_open_session",
    "kainclaw_list_sessions",
    "kainclaw_close_session",
    "kainclaw_chat",
  ],
} as const;

export const kainClawToolDefinitions: Array<{
  name: typeof kainClawServerInfo.capabilities[number];
  annotations: ToolAnnotations;
}> = [
  {
    name: "kainclaw_server_info",
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
  {
    name: "kainclaw_open_session",
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "kainclaw_list_sessions",
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "kainclaw_close_session",
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
  {
    name: "kainclaw_chat",
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
];

const openSessionInputSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
});

const closeSessionInputSchema = z.object({
  sessionId: z.string().uuid(),
});

const chatInputSchema = z.object({
  sessionId: z.string().uuid(),
  prompt: z.string().trim().min(1).max(16_000),
});

export function createKainClawServerInfoHandler(): () => Promise<CallToolResult> {
  return async () => ({
    content: [{ type: "text", text: JSON.stringify(kainClawServerInfo, null, 2) }],
  });
}

export function createKainClawInboundSessionHandlers(
  sessionStore: KainClawInboundSessionStore,
  bridgeClient?: InboundMcpNamedPipeClient,
): {
  openSession: (input: unknown) => Promise<CallToolResult>;
  listSessions: () => Promise<CallToolResult>;
  closeSession: (input: unknown) => Promise<CallToolResult>;
} {
  return {
    openSession: async input => ({
      content: [{
        type: "text",
        text: JSON.stringify({ session: sessionStore.openSession(openSessionInputSchema.parse(input).label) }, null, 2),
      }],
    }),
    listSessions: async () => ({
      content: [{ type: "text", text: JSON.stringify({ sessions: sessionStore.listSessions() }, null, 2) }],
    }),
    closeSession: async input => {
      const { sessionId } = closeSessionInputSchema.parse(input);
      if (!sessionStore.closeSession(sessionId)) {
        return {
          isError: true,
          content: [{ type: "text", text: JSON.stringify({ error: "Unknown inbound MCP session." }) }],
        };
      }
      await bridgeClient?.closeSession(sessionId);
      return {
        content: [{ type: "text", text: JSON.stringify({ closedSessionId: sessionId }) }],
      };
    },
  };
}

export function createKainClawChatHandler(
  sessionStore: KainClawInboundSessionStore,
  bridgeClient: InboundMcpNamedPipeClient,
): (input: unknown) => Promise<CallToolResult> {
  return async input => {
    const { sessionId, prompt } = chatInputSchema.parse(input);
    const session = sessionStore.listSessions().find(candidate => candidate.sessionId === sessionId);
    if (!session) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "Unknown inbound MCP session." }) }] };
    }
    const grant = await bridgeClient.requestGrant({
      toolName: "kainclaw_chat",
      sessionId,
      sessionLabel: session.label,
      promptSummary: prompt.slice(0, 1_000),
    });
    if (!grant.ok) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "KainClaw chat permission was not granted." }) }] };
    }
    const result = await bridgeClient.executeChat(grant.grant.grantId, sessionId, prompt);
    if (!result.ok) {
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "KainClaw chat is unavailable." }) }] };
    }
    return { content: [{ type: "text", text: JSON.stringify({ turnId: result.turnId, text: result.text }) }] };
  };
}

export function createKainClawMcpServer(
  sessionStore = new KainClawInboundSessionStore(),
  bridgeClient?: InboundMcpNamedPipeClient,
): McpServer {
  const server = new McpServer({
    name: kainClawServerInfo.name,
    version: kainClawServerInfo.version,
  });
  const infoTool = kainClawToolDefinitions[0]!;
  const openSessionTool = kainClawToolDefinitions[1]!;
  const listSessionsTool = kainClawToolDefinitions[2]!;
  const closeSessionTool = kainClawToolDefinitions[3]!;
  const chatTool = kainClawToolDefinitions[4]!;
  const sessionHandlers = createKainClawInboundSessionHandlers(sessionStore, bridgeClient);
  server.registerTool(infoTool.name, {
    title: "KainClaw server information",
    description: "Return the KainClaw MCP server transport and currently safe capabilities. This tool does not access user data.",
    annotations: infoTool.annotations,
  }, createKainClawServerInfoHandler());
  server.registerTool(openSessionTool.name, {
    title: "Open isolated inbound session",
    description: "Create a process-local MCP session. It cannot access KainClaw desktop sessions or persisted user data.",
    inputSchema: openSessionInputSchema,
    annotations: openSessionTool.annotations,
  }, sessionHandlers.openSession);
  server.registerTool(listSessionsTool.name, {
    title: "List isolated inbound sessions",
    description: "List sessions created by this MCP server process only. Desktop KainClaw sessions are excluded.",
    annotations: listSessionsTool.annotations,
  }, sessionHandlers.listSessions);
  server.registerTool(closeSessionTool.name, {
    title: "Close isolated inbound session",
    description: "Permanently remove a session created by this MCP server process.",
    inputSchema: closeSessionInputSchema,
    annotations: closeSessionTool.annotations,
  }, sessionHandlers.closeSession);
  if (bridgeClient) {
    server.registerTool(chatTool.name, {
      title: "Chat through KainClaw desktop",
      description: "Request an approved text-only chat turn in an isolated inbound session.",
      inputSchema: chatInputSchema,
      annotations: chatTool.annotations,
    }, createKainClawChatHandler(sessionStore, bridgeClient));
  }
  return server;
}

export async function runKainClawStdioServer(): Promise<void> {
  // A server process cannot execute stateful work until it has registered with
  // the Electron-owned bridge. The safe read-only tool declarations remain
  // unchanged; future provider-backed tools will use this same connection.
  const bridgeClient = new InboundMcpNamedPipeClient();
  await bridgeClient.connect();
  const server = createKainClawMcpServer(new KainClawInboundSessionStore(), bridgeClient);
  await server.connect(new StdioServerTransport());
}

if (require.main === module) {
  runKainClawStdioServer().catch(error => {
    console.error(error instanceof Error ? error.message : "Unable to start KainClaw MCP server.");
    process.exitCode = 1;
  });
}
