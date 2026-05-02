import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { NormalizedImageAttachment } from "./agent/providers/IProviderAdapter";
import {
  createMcpOAuthClientProvider,
  hasMcpDiscoveryButNoToken,
  type McpOAuthConfig,
  type McpOAuthHost,
  performMcpOAuthFlow,
} from "./mcpOAuth";
import {
  dedupeToolDefinitionsByName,
  type McpToolAdapter,
  type ToolContext,
  type ToolDefinition,
  type ToolExecutionResult,
  type ToolInput,
} from "./toolRuntime";

type JsonRecord = Record<string, unknown>;

type RawServerConfig = {
  type?: string;
  transport?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  oauth?: McpOAuthConfig;
  disabled?: boolean;
};

type ResolvedServerConfig =
  | {
      kind: "stdio";
      name: string;
      command: string;
      args: string[];
      cwd?: string;
      env?: Record<string, string>;
    }
  | {
      kind: "streamable-http";
      name: string;
      url: string;
      headers?: Record<string, string>;
      oauth?: McpOAuthConfig;
    }
  | {
      kind: "sse";
      name: string;
      url: string;
      headers?: Record<string, string>;
      oauth?: McpOAuthConfig;
    };

type ToolMetadata = {
  serverName: string;
  toolName: string;
  annotations?: ToolDefinition["annotations"];
  kind?: "server-tool" | "auth-placeholder" | "status-placeholder";
  config?: ResolvedServerConfig;
};

export type McpPromptCommandDefinition = {
  name: string;
  description: string;
  argNames: string[];
  serverName: string;
  promptName: string;
  userFacingName: string;
};

type PromptMetadata = {
  serverName: string;
  promptName: string;
  argNames: string[];
  description: string;
  userFacingName: string;
};

type McpResource = {
  uri: string;
  name: string;
  mimeType?: string;
  description?: string;
  server: string;
};

type McpResourceContent = {
  uri: string;
  mimeType?: string;
  text?: string;
  blobSavedTo?: string;
};

type RawMcpToolResult = {
  content?: unknown;
  structuredContent?: unknown;
  toolResult?: unknown;
  isError?: boolean;
  error?: unknown;
  _meta?: unknown;
};

type RawPromptMessageContent =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image";
      data: string;
      mimeType?: string;
    }
  | {
      type: "audio";
      data: string;
      mimeType?: string;
    }
  | {
      type: "resource";
      resource: {
        uri: string;
        mimeType?: string;
        text?: string;
        blob?: string;
      };
    };

type RawPromptMessage = {
  content: RawPromptMessageContent;
};

type ConnectionRecord = {
  client: Client;
  transport: StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport;
};

export type McpServerStatusSummary = {
  name: string;
  state: "connected" | "needs-auth" | "error";
  toolCount: number;
  transport: "stdio" | "streamable-http" | "sse";
  error?: string;
};

export type McpPromptCommandResult = {
  content: string;
  attachments?: NormalizedImageAttachment[];
};

const CONFIG_CANDIDATES = [".mcp.json", ".cain-mcp.json"];
const LIST_MCP_RESOURCES_TOOL_NAME = "ListMcpResourcesTool";
const READ_MCP_RESOURCE_TOOL_NAME = "ReadMcpResourceTool";
const MCP_AUTHENTICATE_TOOL_NAME = "authenticate";
const CLAUDEAI_SERVER_PREFIX = "claude.ai ";

const LIST_MCP_RESOURCES_TOOL_DEFINITION: ToolDefinition = {
  name: LIST_MCP_RESOURCES_TOOL_NAME,
  description:
    "Lists available resources from configured MCP servers. Each resource object includes a server field indicating which server it belongs to.",
  input_schema: {
    type: "object",
    properties: {
      server: {
        type: "string",
        description: "Optional server name to filter resources by.",
      },
    },
  },
  annotations: {
    readOnlyHint: true,
    title: "List MCP resources",
  },
};

const READ_MCP_RESOURCE_TOOL_DEFINITION: ToolDefinition = {
  name: READ_MCP_RESOURCE_TOOL_NAME,
  description:
    "Reads a specific resource from an MCP server by server name and resource URI.",
  input_schema: {
    type: "object",
    properties: {
      server: {
        type: "string",
        description: "The MCP server name.",
      },
      uri: {
        type: "string",
        description: "The resource URI to read.",
      },
    },
    required: ["server", "uri"],
  },
  annotations: {
    readOnlyHint: true,
    title: "Read MCP resource",
  },
};

export function normalizeNameForMCP(name: string): string {
  let normalized = name.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (name.startsWith(CLAUDEAI_SERVER_PREFIX)) {
    normalized = normalized.replace(/_+/g, "_").replace(/^_|_$/g, "");
  }
  return normalized;
}

function normalizeMcpInvocationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildMcpToolName(serverName: string, toolName: string): string {
  return `mcp__${normalizeNameForMCP(serverName)}__${normalizeNameForMCP(toolName)}`;
}

function buildMcpAuthToolDefinition(
  serverName: string,
  config: ResolvedServerConfig,
): ToolDefinition {
  const location =
    config.kind === "stdio" ? "stdio" : `${config.kind === "sse" ? "sse" : "http"} at ${config.url}`;

  return {
    name: buildMcpToolName(serverName, MCP_AUTHENTICATE_TOOL_NAME),
    description:
      `The \`${serverName}\` MCP server (${location}) is installed but requires authentication. ` +
      "Call this tool to start or receive instructions for the MCP authentication flow.",
    input_schema: {
      type: "object",
      properties: {},
    },
    annotations: {
      title: `${serverName} authenticate`,
    },
  };
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeRemoteTransport(rawType: string | undefined): "streamable-http" | "sse" | undefined {
  const normalized = rawType?.trim().toLowerCase();

  if (!normalized || normalized === "http" || normalized === "streamable-http") {
    return "streamable-http";
  }

  if (normalized === "sse") {
    return "sse";
  }

  return undefined;
}

export function resolveWorkspacePath(workspaceRoot: string, targetPath: string): string {
  const absolutePath = path.resolve(workspaceRoot, targetPath);
  const relativePath = path.relative(workspaceRoot, absolutePath);

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Path escapes the workspace: ${targetPath}`);
  }

  return absolutePath;
}

export function substituteEnv(value: string, envMap: Record<string, string>): string {
  return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_match, name: string) => envMap[name] ?? process.env[name] ?? "");
}

function substituteRecord(
  record: Record<string, string> | undefined,
  envMap: Record<string, string>,
): Record<string, string> | undefined {
  if (!record) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, substituteEnv(String(value), envMap)]),
  );
}

export function formatToolResultContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return typeof content === "string" ? content : JSON.stringify(content, null, 2);
  }

  return content
    .map(item => {
      if (!item || typeof item !== "object") {
        return String(item);
      }

      const block = item as Record<string, unknown>;

      if (block.type === "text") {
        return typeof block.text === "string" ? block.text : JSON.stringify(block, null, 2);
      }

      if (block.type === "image") {
        return `[image ${(block.mimeType as string) || "unknown"} omitted from text output]`;
      }

      if (block.type === "audio") {
        return `[audio ${(block.mimeType as string) || "unknown"} omitted from text output]`;
      }

      if (block.type === "resource" || block.type === "resource_link") {
        return JSON.stringify(block, null, 2);
      }

      return JSON.stringify(block, null, 2);
    })
    .join("\n\n");
}

export function getBinaryFileExtension(mimeType: string | undefined): string {
  const normalized = mimeType?.toLowerCase().split(";")[0]?.trim();

  if (!normalized) {
    return "bin";
  }

  const extensionMap: Record<string, string> = {
    "application/json": "json",
    "application/pdf": "pdf",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "text/html": "html",
    "text/markdown": "md",
    "text/plain": "txt",
  };

  if (extensionMap[normalized]) {
    return extensionMap[normalized];
  }

  const subtype = normalized.split("/")[1]?.split("+")[0]?.replace(/[^a-z0-9.-]/gi, "");
  return subtype || "bin";
}

function isAuthError(error: unknown): boolean {
  if (error instanceof UnauthorizedError) {
    return true;
  }

  const message = toErrorMessage(error);
  return /\b(401|unauthorized|authentication|authorization|auth provider)\b/i.test(message);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class McpToolCallError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpToolCallError";
  }
}

export function formatMcpToolResult(result: RawMcpToolResult): string {
  if (result.isError) {
    let errorDetails = "Unknown error";
    if (Array.isArray(result.content) && result.content.length > 0) {
      const firstContent = result.content[0];
      if (
        firstContent &&
        typeof firstContent === "object" &&
        "text" in firstContent &&
        typeof firstContent.text === "string"
      ) {
        errorDetails = firstContent.text;
      }
    } else if ("error" in result) {
      errorDetails = String(result.error);
    }

    throw new McpToolCallError(errorDetails);
  }

  if ("toolResult" in result) {
    return String(result.toolResult);
  }

  if ("structuredContent" in result && result.structuredContent !== undefined) {
    return JSON.stringify(result.structuredContent, null, 2);
  }

  if ("content" in result && Array.isArray(result.content)) {
    return formatToolResultContent(result.content);
  }

  throw new McpToolCallError("Unexpected MCP tool response format");
}

export class McpRuntime implements McpToolAdapter {
  private lastWorkspaceRoot = "";
  private configSignature = "";
  private configFilePath: string | undefined;
  private configFileMtimeMs: number | undefined;
  private discoveredConfigFilePath: string | undefined;
  private configDirty = true;
  private refreshConfigPromise: Promise<boolean> | undefined;
  private readonly serverConfigs = new Map<string, ResolvedServerConfig>();
  private readonly connections = new Map<string, ConnectionRecord>();
  private readonly toolMetadata = new Map<string, ToolMetadata>();
  private readonly promptMetadata = new Map<string, PromptMetadata>();
  private readonly serverStatuses = new Map<string, McpServerStatusSummary>();
  private cachedToolDefinitions: ToolDefinition[] | undefined;
  private cachedPromptCommands: McpPromptCommandDefinition[] | undefined;

  constructor(
    private readonly getWorkspaceRoot: () => string,
    private envMap: Record<string, string>,
    private readonly oauthHost?: McpOAuthHost,
  ) {}

  setEnvMap(envMap: Record<string, string>): void {
    if (JSON.stringify(this.envMap) !== JSON.stringify(envMap)) {
      this.markConfigDirty();
    }
    this.envMap = envMap;
  }

  markConfigDirty(): void {
    this.configDirty = true;
  }

  async getToolDefinitions(): Promise<ToolDefinition[]> {
    const configChanged = await this.refreshConfig();
    if (!configChanged && this.cachedToolDefinitions) {
      return [...this.cachedToolDefinitions];
    }
    const toolDefinitions: ToolDefinition[] = [];
    let shouldAddResourceTools = false;
    this.toolMetadata.clear();
    this.serverStatuses.clear();

    for (const [serverName, config] of this.serverConfigs) {
      if (
        this.oauthHost &&
        (config.kind === "streamable-http" || config.kind === "sse") &&
        await hasMcpDiscoveryButNoToken({
          host: this.oauthHost,
          serverName,
          config,
        })
      ) {
        const authTool = buildMcpAuthToolDefinition(serverName, config);
        toolDefinitions.push(authTool);
        this.toolMetadata.set(authTool.name, {
          serverName,
          toolName: MCP_AUTHENTICATE_TOOL_NAME,
          annotations: authTool.annotations,
          kind: "auth-placeholder",
          config,
        });
        this.serverStatuses.set(serverName, {
          name: serverName,
          state: "needs-auth",
          toolCount: 0,
          transport: config.kind,
          error: "Authentication required",
        });
        continue;
      }

      try {
        const connection = await this.ensureConnection(serverName, config);
        const capabilities = connection.client.getServerCapabilities();
        const supportsTools = !!capabilities?.tools;
        const supportsResources = !!capabilities?.resources;
        const tools = supportsTools ? (await connection.client.listTools()).tools ?? [] : [];
        shouldAddResourceTools ||= supportsResources;

        this.serverStatuses.set(serverName, {
          name: serverName,
          state: "connected",
          toolCount: tools.length,
          transport: config.kind,
        });

        for (const tool of tools) {
          const fullName = buildMcpToolName(serverName, tool.name);
          const annotations = tool.annotations
            ? {
                title: tool.annotations.title,
                readOnlyHint: tool.annotations.readOnlyHint,
                destructiveHint: tool.annotations.destructiveHint,
                idempotentHint: tool.annotations.idempotentHint,
                openWorldHint: tool.annotations.openWorldHint,
              }
            : undefined;

          this.toolMetadata.set(fullName, {
            serverName,
            toolName: tool.name,
            annotations,
            kind: "server-tool",
            config,
          });

          toolDefinitions.push({
            name: fullName,
            description: tool.description || `MCP tool ${tool.name} from ${serverName}`,
            input_schema: {
              type: "object",
              properties: (tool.inputSchema?.properties as Record<string, { type: string; description: string }>) || {},
              required: tool.inputSchema?.required || [],
            },
            annotations,
          });
        }
      } catch (error) {
        const status = this.classifyServerFailure(serverName, config, error);
        this.serverStatuses.set(serverName, status);

        if (status.state === "needs-auth") {
          const authTool = buildMcpAuthToolDefinition(serverName, config);
          toolDefinitions.push(authTool);
          this.toolMetadata.set(authTool.name, {
            serverName,
            toolName: MCP_AUTHENTICATE_TOOL_NAME,
            annotations: authTool.annotations,
            kind: "auth-placeholder",
            config,
          });
          console.warn(`[KainClaw MCP] Failed to list tools for ${serverName}: ${status.error ?? "unknown error"}`);
          continue;
        }

        toolDefinitions.push({
          name: buildMcpToolName(serverName, "status"),
          description:
            `Connection status placeholder for unavailable MCP server ${serverName}`,
          input_schema: {
            type: "object",
            properties: {},
          },
          annotations: {
            readOnlyHint: true,
            title: `${serverName} unavailable`,
          },
        });
        this.toolMetadata.set(buildMcpToolName(serverName, "status"), {
          serverName,
          toolName: "status",
          annotations: {
            readOnlyHint: true,
          },
          kind: "status-placeholder",
          config,
        });
        console.warn(`[KainClaw MCP] Failed to list tools for ${serverName}: ${status.error ?? "unknown error"}`);
      }
    }

    if (shouldAddResourceTools) {
      toolDefinitions.push(LIST_MCP_RESOURCES_TOOL_DEFINITION, READ_MCP_RESOURCE_TOOL_DEFINITION);
    }

    this.cachedToolDefinitions = dedupeToolDefinitionsByName(
      toolDefinitions.filter(tool => !tool.name.endsWith("__status")),
    );
    return [...this.cachedToolDefinitions];
  }

  async getPromptCommands(): Promise<McpPromptCommandDefinition[]> {
    const configChanged = await this.refreshConfig();
    if (!configChanged && this.cachedPromptCommands) {
      return [...this.cachedPromptCommands];
    }

    const commands: McpPromptCommandDefinition[] = [];
    this.promptMetadata.clear();

    for (const [serverName, config] of this.serverConfigs) {
      if (
        this.oauthHost &&
        (config.kind === "streamable-http" || config.kind === "sse") &&
        await hasMcpDiscoveryButNoToken({
          host: this.oauthHost,
          serverName,
          config,
        })
      ) {
        continue;
      }

      try {
        const connection = await this.ensureConnection(serverName, config);
        const capabilities = connection.client.getServerCapabilities();
        if (!capabilities?.prompts) {
          continue;
        }

        const result = await connection.client.request(
          { method: "prompts/list" },
          undefined as any,
        ) as {
          prompts?: Array<{
            name: string;
            description?: string;
            arguments?: Array<{ name: string }> | Record<string, { name: string }>;
          }>;
        };

        for (const prompt of result.prompts ?? []) {
          if (!prompt?.name || typeof prompt.name !== "string") {
            continue;
          }

          const argNames = Array.isArray(prompt.arguments)
            ? prompt.arguments
                .map(argument => argument?.name)
                .filter((name): name is string => typeof name === "string" && name.trim().length > 0)
            : Object.values(prompt.arguments ?? {})
                .map(argument => argument?.name)
                .filter((name): name is string => typeof name === "string" && name.trim().length > 0);

          const name = `/mcp__${normalizeNameForMCP(serverName)}__${prompt.name}`;
          const command: McpPromptCommandDefinition = {
            name,
            description: prompt.description ?? "",
            argNames,
            serverName,
            promptName: prompt.name,
            userFacingName: `${serverName}:${prompt.name} (MCP)`,
          };

          this.promptMetadata.set(name.toLowerCase(), {
            serverName,
            promptName: prompt.name,
            argNames,
            description: command.description,
            userFacingName: command.userFacingName,
          });
          commands.push(command);
        }
      } catch (error) {
        await this.handleServerOperationFailure(serverName, config, error, {
          throwError: false,
        });
      }
    }

    this.cachedPromptCommands = commands;
    return [...commands];
  }

  async getStatusSummary(): Promise<McpServerStatusSummary[]> {
    await this.refreshConfig();

    if (this.serverConfigs.size > 0 && this.serverStatuses.size === 0) {
      await this.getToolDefinitions();
    }

    return Array.from(this.serverStatuses.values()).sort((left, right) => left.name.localeCompare(right.name));
  }

  async executeTool(name: string, input: ToolInput, context: ToolContext): Promise<ToolExecutionResult> {
    await this.refreshConfig();

    const metadata = this.resolveToolMetadata(name) ?? this.parseToolName(name);
    const config = this.serverConfigs.get(metadata.serverName) ?? metadata.config;

    if (!config) {
      throw new Error(`MCP server "${metadata.serverName}" is not configured`);
    }

    if (context.planMode?.active) {
      const isReadOnly = metadata.annotations?.readOnlyHint === true;
      const isOpenWorld = metadata.annotations?.openWorldHint === true;
      const isDestructive = metadata.annotations?.destructiveHint === true;

      if (!isReadOnly || isOpenWorld || isDestructive) {
        throw new Error(
          "Plan mode is active. Only read-only MCP tools are allowed until the plan is approved.",
        );
      }
    }

    if (context.verificationMode?.active) {
      const isReadOnly = metadata.annotations?.readOnlyHint === true;
      if (!isReadOnly) {
        throw new Error(
          "Verification mode is active. Only read-only MCP tools are allowed during verification.",
        );
      }
    }

    if (metadata.annotations?.destructiveHint && context.requestToolApproval) {
      const approved = await context.requestToolApproval({
        kind: "tool_action",
        toolName: name,
        title: "Confirm MCP action",
        summary: `Allow MCP tool ${metadata.toolName} on server ${metadata.serverName}`,
        inputPreview: JSON.stringify(input, null, 2),
      });

      if (!approved) {
        throw new Error(`MCP tool rejected by user: ${name}`);
      }
    }

    if (metadata.kind === "auth-placeholder") {
      if (!this.oauthHost) {
        return this.describeMcpAuthentication(metadata.serverName, config);
      }
      if (config.kind === "stdio") {
        return this.describeMcpAuthentication(metadata.serverName, config);
      }
      if (config.oauth?.xaa) {
        return this.describeMcpAuthentication(metadata.serverName, config);
      }

      await performMcpOAuthFlow({
        serverName: metadata.serverName,
        config,
        host: this.oauthHost,
        onAuthorizationUrl: () => undefined,
        abortSignal: context.abortSignal,
      });
      await this.closeConnection(metadata.serverName);
      this.serverStatuses.delete(metadata.serverName);
      this.cachedToolDefinitions = undefined;
      this.cachedPromptCommands = undefined;

      return {
        summary: `Authenticated MCP server ${metadata.serverName}`,
        content:
          `Authentication completed for "${metadata.serverName}". ` +
          "The MCP server can now be reconnected. Ask the user to rerun their request if they need the newly available tools immediately.",
      };
    }

    try {
      const connection = await this.ensureConnection(metadata.serverName, config);
      const result = await connection.client.callTool({
        name: metadata.toolName,
        arguments: input,
      });

      return {
        summary: `Ran MCP tool ${metadata.toolName} on ${metadata.serverName}`,
        content: formatMcpToolResult(result as RawMcpToolResult) || "[no MCP output]",
      };
    } catch (error) {
      if (error instanceof McpToolCallError) {
        throw error;
      }

      await this.handleServerOperationFailure(metadata.serverName, config, error);
      throw new Error("MCP tool execution failed.");
    }
  }

  async listResources(serverName?: string): Promise<ToolExecutionResult> {
    await this.refreshConfig();

    const targetServer = typeof serverName === "string" && serverName.trim() !== "" ? serverName.trim() : undefined;
    const serverEntries = this.getServerEntries(targetServer);
    const resources: McpResource[] = [];

    for (const [name, config] of serverEntries) {
      try {
        const connection = await this.ensureConnection(name, config);
        if (!connection.client.getServerCapabilities()?.resources) {
          continue;
        }

        const result = await connection.client.listResources();
        const serverResources = (result.resources ?? []).map(resource => ({
          uri: resource.uri,
          name: resource.name,
          mimeType: resource.mimeType,
          description: resource.description,
          server: name,
        }));
        resources.push(...serverResources);
      } catch (error) {
        await this.handleServerOperationFailure(name, config, error, { throwError: false });
      }
    }

    return {
      summary: `Listed ${resources.length} MCP resource${resources.length === 1 ? "" : "s"}`,
      content:
        resources.length > 0
          ? JSON.stringify(resources, null, 2)
          : "No resources found. MCP servers may still provide tools even if they have no resources.",
    };
  }

  async readResource(serverName: string, uri: string): Promise<ToolExecutionResult> {
    await this.refreshConfig();

    const normalizedServerName = this.resolveConfiguredServerName(serverName.trim());
    const normalizedUri = uri.trim();

    if (!normalizedServerName) {
      throw new Error("server is required");
    }

    if (!normalizedUri) {
      throw new Error("uri is required");
    }

    const config = this.serverConfigs.get(normalizedServerName);
    if (!config) {
      throw new Error(this.buildUnknownServerMessage(normalizedServerName));
    }

    let connection: ConnectionRecord;
    try {
      connection = await this.ensureConnection(normalizedServerName, config);
    } catch (error) {
      await this.handleServerOperationFailure(normalizedServerName, config, error);
      throw new Error("MCP resource read failed.");
    }

    if (!connection.client.getServerCapabilities()?.resources) {
      throw new Error(`Server "${normalizedServerName}" does not support resources`);
    }

    try {
      const result = await connection.client.readResource({ uri: normalizedUri });
      const contents = await Promise.all(
        (result.contents ?? []).map(content => this.formatResourceContent(content, normalizedServerName)),
      );

      return {
        summary: `Read MCP resource ${normalizedUri} from ${normalizedServerName}`,
        content: JSON.stringify({ contents }, null, 2),
      };
    } catch (error) {
      await this.handleServerOperationFailure(normalizedServerName, config, error);
      throw new Error("MCP resource read failed.");
    }
  }

  async executePromptCommand(
    commandName: string,
    args: string,
  ): Promise<McpPromptCommandResult> {
    await this.getPromptCommands();

    const metadata = this.promptMetadata.get(commandName.trim().toLowerCase());
    if (!metadata) {
      throw new Error(`Unknown MCP prompt command: ${commandName}`);
    }

    const config = this.serverConfigs.get(metadata.serverName);
    if (!config) {
      throw new Error(`MCP server "${metadata.serverName}" is not configured`);
    }

    const connection = await this.ensureConnection(metadata.serverName, config);
    const result = await connection.client.getPrompt({
      name: metadata.promptName,
      arguments: Object.fromEntries(
        metadata.argNames.map((name, index) => [name, args.split(" ")[index] ?? ""]),
      ),
    }) as { messages?: RawPromptMessage[] };

    const textParts: string[] = [];
    const attachments: NormalizedImageAttachment[] = [];

    for (const message of result.messages ?? []) {
      const transformed = await this.transformPromptMessageContent(
        message.content,
        metadata.serverName,
      );
      if (transformed.content) {
        textParts.push(transformed.content);
      }
      if (transformed.attachments?.length) {
        attachments.push(...transformed.attachments);
      }
    }

    return {
      content: textParts.join("\n\n"),
      ...(attachments.length > 0 ? { attachments } : {}),
    };
  }

  private describeMcpAuthentication(
    serverName: string,
    config: ResolvedServerConfig,
  ): ToolExecutionResult {
    if (config.kind !== "sse" && config.kind !== "streamable-http") {
      return {
        summary: `MCP server ${serverName} authentication is unsupported`,
        content:
          `Server "${serverName}" uses ${config.kind} transport which does not support OAuth from this tool. ` +
          "Configure authentication manually and reconnect the MCP server.",
      };
    }

    if (config.oauth?.xaa) {
      return {
        summary: `MCP server ${serverName} requires XAA authentication`,
        content:
          `Server "${serverName}" uses XAA OAuth which is not wired in this host yet. ` +
          "This authenticate tool cannot complete that flow today. Wait for XAA support instead of retrying the normal browser OAuth path.",
      };
    }

    return {
      summary: `MCP server ${serverName} requires authentication`,
      content:
        `Server "${serverName}" requires authentication before its tools can be used. ` +
        (this.oauthHost
          ? "Call the authenticate tool to start the browser-based OAuth flow. Once the browser callback completes, the server's real tools can be reloaded immediately."
          : "This host cannot launch the OAuth browser flow, so configure the server token/headers manually and reconnect the MCP server."),
    };
  }

  async dispose(): Promise<void> {
    for (const connection of this.connections.values()) {
      await connection.transport.close().catch(() => undefined);
    }

    this.connections.clear();
    this.serverConfigs.clear();
    this.toolMetadata.clear();
    this.promptMetadata.clear();
    this.serverStatuses.clear();
    this.cachedToolDefinitions = undefined;
    this.cachedPromptCommands = undefined;
  }

  private async refreshConfig(): Promise<boolean> {
    if (this.refreshConfigPromise) {
      return this.refreshConfigPromise;
    }

    const refresh = this.runRefreshConfig();
    this.refreshConfigPromise = refresh;
    try {
      return await refresh;
    } finally {
      if (this.refreshConfigPromise === refresh) {
        this.refreshConfigPromise = undefined;
      }
    }
  }

  private async runRefreshConfig(): Promise<boolean> {
    const workspaceRoot = this.getWorkspaceRoot();
    if (workspaceRoot !== this.lastWorkspaceRoot) {
      this.lastWorkspaceRoot = workspaceRoot;
      this.configSignature = "";
      this.configFilePath = undefined;
      this.configFileMtimeMs = undefined;
      this.discoveredConfigFilePath = undefined;
      this.configDirty = true;
      await this.dispose();
    }

    if (!this.configDirty) {
      return false;
    }

    const configFile = await this.findConfigFile();

    if (!configFile) {
      if (this.configSignature !== "") {
        this.configSignature = "";
        this.configFilePath = undefined;
        this.configFileMtimeMs = undefined;
        this.discoveredConfigFilePath = undefined;
        this.configDirty = false;
        await this.dispose();
        return true;
      }
      this.serverStatuses.clear();
      this.configDirty = false;
      return false;
    }

    const stats = await fs.stat(configFile);
    const content = await fs.readFile(configFile, "utf8");
    const rawJson = JSON.parse(content) as JsonRecord;
    const resolvedServers = this.resolveServers(rawJson);
    const nextSignature = JSON.stringify(resolvedServers);

    this.configFilePath = configFile;
    this.configFileMtimeMs = stats.mtimeMs;

    if (nextSignature === this.configSignature) {
      this.configDirty = false;
      return false;
    }

    this.configSignature = nextSignature;
    this.configDirty = false;
    await this.dispose();

    for (const server of resolvedServers) {
      this.serverConfigs.set(server.name, server);
    }
    return true;
  }

  private async findConfigFile(): Promise<string | undefined> {
    if (this.discoveredConfigFilePath) {
      try {
        await fs.access(this.discoveredConfigFilePath);
        return this.discoveredConfigFilePath;
      } catch {
        this.discoveredConfigFilePath = undefined;
      }
    }

    let currentPath = this.getWorkspaceRoot();

    while (true) {
      for (const candidate of CONFIG_CANDIDATES) {
        const candidatePath = path.join(currentPath, candidate);

        try {
          await fs.access(candidatePath);
          this.discoveredConfigFilePath = candidatePath;
          return candidatePath;
        } catch {
          // Keep searching upwards.
        }
      }

      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) {
        this.discoveredConfigFilePath = undefined;
        return undefined;
      }
      currentPath = parentPath;
    }
  }

  private resolveServers(rawJson: JsonRecord): ResolvedServerConfig[] {
    const rawServers = (rawJson.mcpServers || rawJson.servers || {}) as Record<string, RawServerConfig>;
    const resolved: ResolvedServerConfig[] = [];

    for (const [name, rawConfig] of Object.entries(rawServers)) {
      if (!rawConfig || rawConfig.disabled) {
        continue;
      }

      if (rawConfig.url) {
        const remoteTransport = normalizeRemoteTransport(rawConfig.type ?? rawConfig.transport);
        if (!remoteTransport) {
          continue;
        }

        resolved.push({
          kind: remoteTransport,
          name,
          url: substituteEnv(trimTrailingSlashes(rawConfig.url), this.envMap),
          headers: substituteRecord(rawConfig.headers, this.envMap),
          ...(rawConfig.oauth ? { oauth: rawConfig.oauth } : {}),
        });
        continue;
      }

      if (!rawConfig.command) {
        continue;
      }

      resolved.push({
        kind: "stdio",
        name,
        command: substituteEnv(rawConfig.command, this.envMap),
        args: (rawConfig.args || []).map(value => substituteEnv(String(value), this.envMap)),
        cwd: rawConfig.cwd
          ? resolveWorkspacePath(this.getWorkspaceRoot(), substituteEnv(rawConfig.cwd, this.envMap))
          : undefined,
        env: substituteRecord(rawConfig.env, this.envMap),
      });
    }

    return resolved;
  }

  private async ensureConnection(
    serverName: string,
    config: ResolvedServerConfig,
  ): Promise<ConnectionRecord> {
    const existing = this.connections.get(serverName);

    if (existing) {
      return existing;
    }

    const client = new Client(
      {
        name: "cain-claude-vscode",
        version: "0.1.0",
      },
      {
        capabilities: {},
      },
    );

    let transport: StdioClientTransport | StreamableHTTPClientTransport | SSEClientTransport;

    if (config.kind === "stdio") {
      const env = Object.fromEntries(
        Object.entries({
          ...process.env,
          ...config.env,
        }).filter(([, value]) => typeof value === "string"),
      ) as Record<string, string>;

      transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        cwd: config.cwd,
        env,
        stderr: "pipe",
      });
    } else if (config.kind === "streamable-http") {
      transport = new StreamableHTTPClientTransport(new URL(config.url), {
        ...(this.oauthHost
          ? {
              authProvider: createMcpOAuthClientProvider({
                serverName,
                config,
                host: this.oauthHost,
                skipBrowserOpen: true,
              }),
            }
          : {}),
        requestInit: {
          headers: config.headers,
        },
      });
    } else {
      transport = new SSEClientTransport(new URL(config.url), {
        ...(this.oauthHost
          ? {
              authProvider: createMcpOAuthClientProvider({
                serverName,
                config,
                host: this.oauthHost,
                skipBrowserOpen: true,
              }),
            }
          : {}),
        eventSourceInit: {
          fetch: config.headers
            ? (input, init) => fetch(input, {
                ...init,
                headers: {
                  ...Object.fromEntries(new Headers(init?.headers)),
                  ...config.headers,
                },
              })
            : undefined,
        },
        requestInit: {
          headers: config.headers,
        },
      });
    }

    await client.connect(transport);

    const connection = {
      client,
      transport,
    };
    this.connections.set(serverName, connection);
    return connection;
  }

  private getServerEntries(targetServer?: string): Array<[string, ResolvedServerConfig]> {
    if (!targetServer) {
      return Array.from(this.serverConfigs.entries());
    }

    const resolvedServerName = this.resolveConfiguredServerName(targetServer);
    const config = this.serverConfigs.get(resolvedServerName);
    if (!config) {
      throw new Error(this.buildUnknownServerMessage(targetServer));
    }

    return [[resolvedServerName, config]];
  }

  private resolveConfiguredServerName(serverName: string): string {
    if (this.serverConfigs.has(serverName)) {
      return serverName;
    }

    const normalizedInput = normalizeNameForMCP(serverName);
    for (const configuredServerName of this.serverConfigs.keys()) {
      if (normalizeNameForMCP(configuredServerName) === normalizedInput) {
        return configuredServerName;
      }
    }

    return serverName;
  }

  private buildUnknownServerMessage(serverName: string): string {
    const availableServers = Array.from(this.serverConfigs.keys()).sort((left, right) => left.localeCompare(right));
    return availableServers.length > 0
      ? `Server "${serverName}" not found. Available servers: ${availableServers.join(", ")}`
      : `Server "${serverName}" not found. No MCP servers are currently configured.`;
  }

  private classifyServerFailure(
    serverName: string,
    config: ResolvedServerConfig,
    error: unknown,
    toolCount = 0,
  ): McpServerStatusSummary {
    const message = toErrorMessage(error);
    const needsAuth = (config.kind === "streamable-http" || config.kind === "sse") && isAuthError(error);

    return {
      name: serverName,
      state: needsAuth ? "needs-auth" : "error",
      toolCount,
      transport: config.kind,
      error: message,
    };
  }

  private async handleServerOperationFailure(
    serverName: string,
    config: ResolvedServerConfig,
    error: unknown,
    options: { throwError?: boolean } = {},
  ): Promise<void> {
    await this.closeConnection(serverName);
    const existingStatus = this.serverStatuses.get(serverName);
    const status = this.classifyServerFailure(serverName, config, error, existingStatus?.toolCount ?? 0);
    this.serverStatuses.set(serverName, status);

    if (options.throwError === false) {
      return;
    }

    if (status.state === "needs-auth") {
      throw new Error(`MCP server "${serverName}" needs authentication before it can be used.`);
    }

    throw error instanceof Error ? error : new Error(toErrorMessage(error));
  }

  private async closeConnection(serverName: string): Promise<void> {
    const existing = this.connections.get(serverName);
    if (!existing) {
      return;
    }

    this.connections.delete(serverName);
    await existing.transport.close().catch(() => undefined);
  }

  private async formatResourceContent(
    content: {
      uri: string;
      mimeType?: string;
      text?: string;
      blob?: string;
    },
    serverName: string,
  ): Promise<McpResourceContent> {
    if (typeof content.text === "string") {
      return {
        uri: content.uri,
        mimeType: content.mimeType,
        text: content.text,
      };
    }

    if (typeof content.blob !== "string") {
      return {
        uri: content.uri,
        mimeType: content.mimeType,
      };
    }

    const savedPath = await this.persistBinaryResource(content.blob, content.mimeType);
    const stats = await fs.stat(savedPath);

    return {
      uri: content.uri,
      mimeType: content.mimeType,
      blobSavedTo: savedPath,
      text:
        `Binary content from ${serverName} was saved to ${savedPath}` +
        ` (${content.mimeType ?? "application/octet-stream"}, ${stats.size} bytes).`,
    };
  }

  private async transformPromptMessageContent(
    content: RawPromptMessageContent,
    serverName: string,
  ): Promise<McpPromptCommandResult> {
    switch (content.type) {
      case "text":
        return { content: content.text };
      case "image":
        return {
          content: "",
          attachments: [
            {
              data: content.data,
              mimeType: content.mimeType || "image/png",
            },
          ],
        };
      case "audio": {
        const savedPath = await this.persistBinaryBuffer(
          Buffer.from(content.data, "base64"),
          content.mimeType,
          "mcp-prompt-audio",
        );
        const stats = await fs.stat(savedPath);
        return {
          content:
            `Audio content from ${serverName} was saved to ${savedPath}` +
            ` (${content.mimeType ?? "application/octet-stream"}, ${stats.size} bytes).`,
        };
      }
      case "resource": {
        const resource = content.resource;
        if (typeof resource.text === "string") {
          return { content: resource.text };
        }

        if (typeof resource.blob === "string") {
          const savedPath = await this.persistBinaryBuffer(
            Buffer.from(resource.blob, "base64"),
            resource.mimeType,
            "mcp-prompt-resource",
          );
          const stats = await fs.stat(savedPath);
          return {
            content:
              `Resource from ${serverName} at ${resource.uri} was saved to ${savedPath}` +
              ` (${resource.mimeType ?? "application/octet-stream"}, ${stats.size} bytes).`,
          };
        }

        return {
          content: JSON.stringify(resource, null, 2),
        };
      }
      default:
        return {
          content: JSON.stringify(content, null, 2),
        };
    }
  }

  private async persistBinaryResource(blob: string, mimeType?: string): Promise<string> {
    return this.persistBinaryBuffer(Buffer.from(blob, "base64"), mimeType, "mcp-resource");
  }

  private async persistBinaryBuffer(
    buffer: Buffer,
    mimeType: string | undefined,
    prefix: string,
  ): Promise<string> {
    const outputDir = path.join(os.tmpdir(), "cain-claude-mcp");
    await fs.mkdir(outputDir, { recursive: true });

    const filename = `${prefix}-${Date.now()}-${randomUUID().slice(0, 8)}.${getBinaryFileExtension(mimeType)}`;
    const outputPath = path.join(outputDir, filename);
    await fs.writeFile(outputPath, buffer);
    return outputPath;
  }

  private parseToolName(name: string): ToolMetadata {
    const parts = name.split("__");

    if (parts.length < 3 || parts[0] !== "mcp") {
      throw new Error(`Invalid MCP tool name: ${name}`);
    }

    return {
      serverName: this.resolveConfiguredServerName(parts[1] || ""),
      toolName: parts.slice(2).join("__"),
    };
  }

  private resolveToolMetadata(name: string): ToolMetadata | undefined {
    const exact = this.toolMetadata.get(name);
    if (exact) {
      return exact;
    }

    if (!/^mcp[_]/i.test(name)) {
      return undefined;
    }

    const normalizedRequestedName = normalizeMcpInvocationName(name);
    for (const [toolName, metadata] of this.toolMetadata.entries()) {
      if (normalizeMcpInvocationName(toolName) === normalizedRequestedName) {
        return metadata;
      }
    }

    return undefined;
  }
}
