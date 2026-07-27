import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { normalizeNameForMCP, resolveWorkspacePath } from "./mcpRuntime";
import type { McpOAuthConfig } from "./mcpOAuth";

export type McpRegistryServerTransport = "stdio" | "streamable-http" | "sse";
export type McpRegistryScope = "workspace";

export type McpRegistryServerConfig = {
  type?: "stdio" | "http" | "sse" | "streamable-http";
  transport?: string;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  oauth?: McpOAuthConfig;
  disabled?: boolean;
  [key: string]: unknown;
};

export type McpRegistryServerEntry = {
  name: string;
  config: McpRegistryServerConfig;
  enabled: boolean;
  sourcePath: string;
  scope: McpRegistryScope;
  transport: McpRegistryServerTransport;
};

export type McpRegistryImportResult = {
  imported: McpRegistryServerEntry[];
  skipped: string[];
};

export type McpRegistryImportSource = "codex" | "claude-desktop" | "claude-code";

export type McpRegistryImportPreview = {
  source: McpRegistryImportSource;
  sourcePath: string;
  candidates: McpRegistryServerEntry[];
  skipped: string[];
};

export type McpRegistryTemplate = {
  id: string;
  label: string;
  description: string;
  config: McpRegistryServerConfig;
};

type WorkspaceMcpDocument = Record<string, unknown> & {
  mcpServers?: Record<string, McpRegistryServerConfig>;
  servers?: Record<string, McpRegistryServerConfig>;
};

const CONFIG_CANDIDATES = [".mcp.json", ".cain-mcp.json"];
const DEFAULT_CODEX_CONFIG_PATH = path.join(os.homedir(), ".codex", "config.toml");
const DEFAULT_CLAUDE_DESKTOP_CONFIG_PATH = process.env.APPDATA
  ? path.join(process.env.APPDATA, "Claude", "claude_desktop_config.json")
  : path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
const DEFAULT_CLAUDE_CODE_CONFIG_PATH = process.env.CLAUDE_CONFIG_HOME
  ? path.join(process.env.CLAUDE_CONFIG_HOME, ".claude.json")
  : path.join(os.homedir(), ".claude.json");

export const MCP_REGISTRY_TEMPLATES: readonly McpRegistryTemplate[] = [
  {
    id: "fetch",
    label: "Fetch",
    description: "Read web pages through the official fetch MCP server.",
    config: { command: "npx", args: ["-y", "@modelcontextprotocol/server-fetch"] },
  },
  {
    id: "browser",
    label: "Browser / Playwright",
    description: "Use the Playwright MCP browser bridge.",
    config: { command: "npx", args: ["-y", "@playwright/mcp@latest"] },
  },
  {
    id: "readonly-filesystem",
    label: "Read-only filesystem example",
    description: "Filesystem example requiring MCP_READ_ROOT; kept disabled until its root is configured.",
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "${MCP_READ_ROOT}"],
      disabled: true,
    },
  },
  {
    id: "hotel",
    label: "RollingGo hotel",
    description: "Use the local RollingGo hotel MCP server built by KainClaw.",
    config: {
      command: "node",
      args: ["${KAINCLAW_ROOT}/dist/mcp/rollinggoHotelServer.js"],
    },
  },
];

export class McpRegistry {
  constructor(
    private readonly workspaceRoot: string | (() => string),
    private readonly codexConfigPath: string = DEFAULT_CODEX_CONFIG_PATH,
  ) {}

  async listServers(): Promise<McpRegistryServerEntry[]> {
    const workspaceRoot = this.resolveWorkspaceRoot();
    if (!workspaceRoot) {
      return [];
    }
    const { configPath, servers } = await readWorkspaceServers(workspaceRoot);

    return Object.entries(servers)
      .map(([name, config]) => toServerEntry(name, config, configPath))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  async addServer(name: string, config: McpRegistryServerConfig): Promise<void> {
    validateServerName(name);
    validateServerConfig(config);

    const workspaceRoot = this.requireWorkspaceRoot();
    const { document, configPath, servers, topLevelKey } = await readWorkspaceServers(workspaceRoot);
    if (servers[name]) {
      throw new Error(`MCP server ${name} already exists in ${path.basename(configPath)}`);
    }

    servers[name] = normalizeConfigForWrite(config, workspaceRoot);
    await writeWorkspaceServers(configPath, document, topLevelKey, servers);
  }

  async updateServer(name: string, config: McpRegistryServerConfig): Promise<void> {
    validateServerName(name);
    validateServerConfig(config);

    const workspaceRoot = this.requireWorkspaceRoot();
    const { document, configPath, servers, topLevelKey } = await readWorkspaceServers(workspaceRoot);
    if (!servers[name]) {
      throw new Error(`No MCP server found with name: ${name}`);
    }

    servers[name] = normalizeConfigForWrite(config, workspaceRoot);
    await writeWorkspaceServers(configPath, document, topLevelKey, servers);
  }

  async removeServer(name: string): Promise<void> {
    const workspaceRoot = this.requireWorkspaceRoot();
    const { document, configPath, servers, topLevelKey } = await readWorkspaceServers(workspaceRoot);
    if (!servers[name]) {
      throw new Error(`No MCP server found with name: ${name}`);
    }

    delete servers[name];
    await writeWorkspaceServers(configPath, document, topLevelKey, servers);
  }

  async setServerEnabled(name: string, enabled: boolean): Promise<void> {
    const workspaceRoot = this.requireWorkspaceRoot();
    const { document, configPath, servers, topLevelKey } = await readWorkspaceServers(workspaceRoot);
    const existing = servers[name];
    if (!existing) {
      throw new Error(`No MCP server found with name: ${name}`);
    }

    const next = { ...existing };
    if (enabled) {
      delete next.disabled;
    } else {
      next.disabled = true;
    }
    servers[name] = next;

    await writeWorkspaceServers(configPath, document, topLevelKey, servers);
  }

  async importCodexServers(): Promise<McpRegistryImportResult> {
    return this.importServers("codex");
  }

  async previewImport(
    source: McpRegistryImportSource,
    sourcePath?: string,
  ): Promise<McpRegistryImportPreview> {
    const resolvedSourcePath = resolveImportSourcePath(source, sourcePath, this.codexConfigPath);
    const servers = await readImportServers(source, resolvedSourcePath);
    const candidates: McpRegistryServerEntry[] = [];
    const skipped: string[] = [];
    for (const [name, config] of Object.entries(servers)) {
      try {
        validateServerName(name);
        candidates.push(toServerEntry(name, config, resolvedSourcePath));
      } catch {
        skipped.push(name);
      }
    }
    return { source, sourcePath: resolvedSourcePath, candidates, skipped };
  }

  async importServers(
    source: McpRegistryImportSource,
    sourcePath?: string,
  ): Promise<McpRegistryImportResult> {
    const preview = await this.previewImport(source, sourcePath);
    const workspaceRoot = this.requireWorkspaceRoot();
    const { document, configPath, servers, topLevelKey } = await readWorkspaceServers(workspaceRoot);
    const imported: McpRegistryServerEntry[] = [];
    const skipped = [...preview.skipped];

    for (const candidate of preview.candidates) {
      const { name } = candidate;
      if (servers[name]) {
        skipped.push(name);
        continue;
      }

      servers[name] = normalizeConfigForWrite(candidate.config, workspaceRoot);
      imported.push(toServerEntry(name, servers[name], configPath));
    }

    if (imported.length > 0) {
      await writeWorkspaceServers(configPath, document, topLevelKey, servers);
    }

    return { imported, skipped };
  }

  async importClaudeServers(
    source: "claude-desktop" | "claude-code" = "claude-desktop",
    sourcePath?: string,
  ): Promise<McpRegistryImportResult> {
    return this.importServers(source, sourcePath);
  }

  listTemplates(): McpRegistryTemplate[] {
    return MCP_REGISTRY_TEMPLATES.map(template => ({
      ...template,
      config: cloneConfig(template.config),
    }));
  }

  async installTemplate(templateId: string, name = templateId): Promise<McpRegistryServerEntry> {
    const template = MCP_REGISTRY_TEMPLATES.find(candidate => candidate.id === templateId);
    if (!template) {
      throw new Error(`Unknown MCP template: ${templateId}`);
    }
    await this.addServer(name, cloneConfig(template.config));
    const server = (await this.listServers()).find(entry => entry.name === name);
    if (!server) {
      throw new Error(`MCP template ${templateId} was not written`);
    }
    return server;
  }

  async exportWorkspaceConfig(): Promise<string> {
    const workspaceRoot = this.requireWorkspaceRoot();
    const { document, configPath, servers, topLevelKey } = await readWorkspaceServers(workspaceRoot);
    const exportDocument = {
      ...document,
      [topLevelKey]: Object.fromEntries(
        Object.entries(servers).map(([name, config]) => [name, sanitizeConfigForExport(config)]),
      ),
    };
    return `${JSON.stringify(exportDocument, null, 2)}\n`;
  }

  private resolveWorkspaceRoot(): string {
    return (typeof this.workspaceRoot === "function" ? this.workspaceRoot() : this.workspaceRoot).trim();
  }

  private requireWorkspaceRoot(): string {
    const workspaceRoot = this.resolveWorkspaceRoot();
    if (!workspaceRoot) {
      throw new Error("Choose a workspace before changing MCP configuration");
    }
    return workspaceRoot;
  }
}

async function readWorkspaceServers(workspaceRoot: string): Promise<{
  document: WorkspaceMcpDocument;
  configPath: string;
  topLevelKey: "mcpServers" | "servers";
  servers: Record<string, McpRegistryServerConfig>;
}> {
  const configPath = await findWorkspaceConfigPath(workspaceRoot);
  if (!configPath) {
    return {
      document: {},
      configPath: path.join(workspaceRoot, ".mcp.json"),
      topLevelKey: "mcpServers",
      servers: {},
    };
  }

  const raw = await fs.readFile(configPath, "utf8");
  const parsed = safeParseJsonDocument(raw);
  const topLevelKey = "mcpServers" in parsed ? "mcpServers" : "servers" in parsed ? "servers" : "mcpServers";
  const rawServers = parsed[topLevelKey];
  if (rawServers !== undefined && (!rawServers || typeof rawServers !== "object" || Array.isArray(rawServers))) {
    throw new Error(`Invalid MCP config file: ${topLevelKey} must be an object`);
  }
  const servers = cloneServers(
    (rawServers as Record<string, McpRegistryServerConfig> | undefined) ?? {},
    workspaceRoot,
  );

  return {
    document: parsed,
    configPath,
    topLevelKey,
    servers,
  };
}

async function writeWorkspaceServers(
  configPath: string,
  document: WorkspaceMcpDocument,
  topLevelKey: "mcpServers" | "servers",
  servers: Record<string, McpRegistryServerConfig>,
): Promise<void> {
  const nextDocument: WorkspaceMcpDocument = {
    ...document,
    [topLevelKey]: servers,
  };
  await fs.writeFile(configPath, `${JSON.stringify(nextDocument, null, 2)}\n`, "utf8");
}

async function findWorkspaceConfigPath(workspaceRoot: string): Promise<string | undefined> {
  let currentPath = workspaceRoot;

  while (true) {
    for (const candidate of CONFIG_CANDIDATES) {
      const candidatePath = path.join(currentPath, candidate);
      try {
        await fs.access(candidatePath);
        return candidatePath;
      } catch {
        // continue searching upward
      }
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return undefined;
    }
    currentPath = parentPath;
  }
}

async function readCodexMcpServers(codexConfigPath: string): Promise<Record<string, McpRegistryServerConfig>> {
  const raw = await fs.readFile(codexConfigPath, "utf8");
  return parseCodexMcpToml(raw);
}

async function readImportServers(
  source: McpRegistryImportSource,
  sourcePath: string,
): Promise<Record<string, McpRegistryServerConfig>> {
  if (source === "codex") {
    return readCodexMcpServers(sourcePath);
  }

  const raw = await fs.readFile(sourcePath, "utf8");
  const document = safeParseJsonDocument(raw);
  return parseJsonMcpServers(document);
}

export function parseMcpServerDocument(
  document: Record<string, unknown>,
  options: { allowTopLevelServers?: boolean } = {},
): Record<string, McpRegistryServerConfig> {
  const rawServers = document.mcpServers ?? document.servers ?? (
    options.allowTopLevelServers ? document : undefined
  );
  if (!rawServers || typeof rawServers !== "object" || Array.isArray(rawServers)) {
    return {};
  }

  const result: Record<string, McpRegistryServerConfig> = {};
  for (const [name, rawValue] of Object.entries(rawServers)) {
    if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
      continue;
    }
    const rawConfig = rawValue as Record<string, unknown>;
    const command = typeof rawConfig.command === "string" && rawConfig.command.trim()
      ? rawConfig.command
      : undefined;
    const url = typeof rawConfig.url === "string" && rawConfig.url.trim()
      ? rawConfig.url
      : undefined;
    if ((command && url) || (!command && !url)) {
      continue;
    }

    if (command) {
      result[name] = normalizeConfigForWrite({
        type: "stdio",
        command,
        args: Array.isArray(rawConfig.args) ? rawConfig.args.map(String) : [],
        cwd: typeof rawConfig.cwd === "string" ? rawConfig.cwd : undefined,
        env: sanitizeImportedEnv(rawConfig.env),
        disabled: rawConfig.disabled === true,
      });
      continue;
    }

    result[name] = normalizeConfigForWrite({
      type: normalizeRemoteType(rawConfig.type ?? rawConfig.transport),
      url,
      headers: importCodexHeaders(rawConfig),
      oauth: rawConfig.oauth && typeof rawConfig.oauth === "object" && !Array.isArray(rawConfig.oauth)
        ? toMcpOAuthConfig(rawConfig.oauth as Record<string, unknown>)
        : undefined,
      disabled: rawConfig.disabled === true,
    });
  }
  return result;
}

function parseJsonMcpServers(document: WorkspaceMcpDocument): Record<string, McpRegistryServerConfig> {
  return parseMcpServerDocument(document);
}

function parseCodexMcpToml(text: string): Record<string, McpRegistryServerConfig> {
  const document = parseTomlSubset(text);
  const root = document.mcp_servers;
  if (!root || typeof root !== "object") {
    return {};
  }

  const result: Record<string, McpRegistryServerConfig> = {};
  for (const [name, value] of Object.entries(root as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      continue;
    }

    const rawConfig = value as Record<string, unknown>;
    if (typeof rawConfig.command === "string" && rawConfig.command.trim()) {
      const env = rawConfig.env && typeof rawConfig.env === "object" && !Array.isArray(rawConfig.env)
        ? sanitizeImportedEnv(rawConfig.env)
        : undefined;
      const args = Array.isArray(rawConfig.args)
        ? rawConfig.args.map(item => String(item))
        : [];
      result[name] = normalizeConfigForWrite({
        type: "stdio",
        command: rawConfig.command,
        args,
        cwd: typeof rawConfig.cwd === "string" ? rawConfig.cwd : undefined,
        env,
        disabled: rawConfig.disabled === true,
      });
      continue;
    }

    if (typeof rawConfig.url === "string" && rawConfig.url.trim()) {
      const headers = importCodexHeaders(rawConfig);
      const oauth = rawConfig.oauth && typeof rawConfig.oauth === "object" && !Array.isArray(rawConfig.oauth)
        ? toMcpOAuthConfig(rawConfig.oauth as Record<string, unknown>)
        : undefined;
      result[name] = normalizeConfigForWrite({
        type: normalizeRemoteType(rawConfig.type ?? rawConfig.transport),
        url: rawConfig.url,
        headers,
        oauth,
        disabled: rawConfig.disabled === true,
      });
    }
  }

  return result;
}

function normalizeConfigForWrite(
  config: McpRegistryServerConfig,
  workspaceRoot?: string,
): McpRegistryServerConfig {
  validateServerConfig(config);
  const normalized: McpRegistryServerConfig = { ...config };

  if (workspaceRoot && typeof normalized.cwd === "string" && normalized.cwd && !path.isAbsolute(normalized.cwd)) {
    resolveWorkspacePath(workspaceRoot, normalized.cwd);
  }
  if (normalized.args) {
    normalized.args = [...normalized.args];
  }
  if (normalized.env) {
    normalized.env = { ...normalized.env };
  }
  if (normalized.headers) {
    normalized.headers = { ...normalized.headers };
  }

  return normalized;
}

function validateServerName(name: string): void {
  if (!name || /[^a-zA-Z0-9_-]/.test(name)) {
    throw new Error(
      `Invalid name ${name}. Names can only contain letters, numbers, hyphens, and underscores. Suggested: ${normalizeNameForMCP(name)}`,
    );
  }
}

function validateServerConfig(config: McpRegistryServerConfig): void {
  const hasCommand = typeof config.command === "string" && config.command.trim().length > 0;
  const hasUrl = typeof config.url === "string" && config.url.trim().length > 0;

  if (hasCommand === hasUrl) {
    throw new Error("Invalid configuration: provide either command or url");
  }

  if (hasCommand) {
    validateStringArray(config.args, "args");
    validateStringRecord(config.env, "env");
  }

  if (hasUrl) {
    const transport = normalizeRemoteType(config.type ?? config.transport);
    if (transport !== "streamable-http" && transport !== "sse") {
      throw new Error("Invalid configuration: remote transport must be http/streamable-http or sse");
    }
    validateRemoteUrl(config.url!);
    validateStringRecord(config.headers, "headers");
  }
}

function resolveTransport(config: McpRegistryServerConfig): McpRegistryServerTransport {
  if (typeof config.command === "string" && config.command.trim()) {
    return "stdio";
  }

  const normalized = normalizeRemoteType(config.type ?? config.transport);
  return normalized === "sse" ? "sse" : "streamable-http";
}

function normalizeRemoteType(rawType: unknown): "streamable-http" | "sse" {
  const normalized = typeof rawType === "string" ? rawType.trim().toLowerCase() : "";
  if (normalized === "sse") {
    return "sse";
  }
  return "streamable-http";
}

function cloneServers(
  servers: Record<string, McpRegistryServerConfig>,
  workspaceRoot?: string,
): Record<string, McpRegistryServerConfig> {
  const clone: Record<string, McpRegistryServerConfig> = {};
  for (const [name, config] of Object.entries(servers)) {
    if (!config || typeof config !== "object" || Array.isArray(config)) {
      throw new Error(`Invalid MCP configuration for server: ${name}`);
    }
    clone[name] = normalizeConfigForWrite(config, workspaceRoot);
  }
  return clone;
}

function safeParseJsonDocument(raw: string): WorkspaceMcpDocument {
  const parsed = JSON.parse(raw) as WorkspaceMcpDocument;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid MCP config file: expected a JSON object");
  }
  return parsed;
}

function toStringRecord(value: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      result[key] = entry;
    } else if (entry !== undefined && entry !== null) {
      result[key] = String(entry);
    }
  }
  return result;
}

function importCodexHeaders(rawConfig: Record<string, unknown>): Record<string, string> | undefined {
  const source = rawConfig.headers && typeof rawConfig.headers === "object" && !Array.isArray(rawConfig.headers)
    ? toStringRecord(rawConfig.headers as Record<string, unknown>)
    : {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!isSensitiveHeader(key) || containsEnvironmentPlaceholder(value)) {
      result[key] = value;
    }
  }

  const bearerTokenEnvVar = rawConfig.bearer_token_env_var;
  if (typeof bearerTokenEnvVar === "string" && /^[A-Z_][A-Z0-9_]*$/i.test(bearerTokenEnvVar)) {
    result.Authorization = `Bearer \${${bearerTokenEnvVar}}`;
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function sanitizeImportedEnv(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(toStringRecord(value as Record<string, unknown>))) {
    if (!isSensitiveHeader(key) || containsEnvironmentPlaceholder(entry)) {
      result[key] = entry;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function sanitizeConfigForExport(config: McpRegistryServerConfig): McpRegistryServerConfig {
  const result = cloneConfig(config);
  if (result.env) {
    result.env = redactStringRecord(result.env);
  }
  if (result.headers) {
    result.headers = redactStringRecord(result.headers);
  }
  return result;
}

function redactStringRecord(value: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    isSensitiveHeader(key) && !containsEnvironmentPlaceholder(entry) ? "[REDACTED]" : entry,
  ]));
}

function cloneConfig(config: McpRegistryServerConfig): McpRegistryServerConfig {
  return {
    ...config,
    ...(config.args ? { args: [...config.args] } : {}),
    ...(config.env ? { env: { ...config.env } } : {}),
    ...(config.headers ? { headers: { ...config.headers } } : {}),
    ...(config.oauth ? { oauth: { ...config.oauth } } : {}),
  };
}

function resolveImportSourcePath(
  source: McpRegistryImportSource,
  sourcePath: string | undefined,
  codexConfigPath: string,
): string {
  if (sourcePath?.trim()) {
    return sourcePath.trim();
  }
  if (source === "codex") {
    return codexConfigPath;
  }
  return source === "claude-code"
    ? DEFAULT_CLAUDE_CODE_CONFIG_PATH
    : DEFAULT_CLAUDE_DESKTOP_CONFIG_PATH;
}

function toMcpOAuthConfig(value: Record<string, unknown>): McpOAuthConfig {
  const oauth: McpOAuthConfig = {};
  if (typeof value.clientId === "string") oauth.clientId = value.clientId;
  if (typeof value.callbackPort === "number" && Number.isInteger(value.callbackPort)) {
    oauth.callbackPort = value.callbackPort;
  }
  if (typeof value.authServerMetadataUrl === "string") {
    oauth.authServerMetadataUrl = value.authServerMetadataUrl;
  }
  if (typeof value.xaa === "boolean") {
    oauth.xaa = value.xaa;
  }
  return oauth;
}

function toServerEntry(
  name: string,
  config: McpRegistryServerConfig,
  sourcePath: string,
): McpRegistryServerEntry {
  return {
    name,
    config,
    enabled: !config.disabled,
    sourcePath,
    scope: "workspace",
    transport: resolveTransport(config),
  };
}

function validateStringArray(value: unknown, fieldName: string): void {
  if (value !== undefined && (!Array.isArray(value) || value.some(item => typeof item !== "string"))) {
    throw new Error(`Invalid configuration: ${fieldName} must be an array of strings`);
  }
}

function validateStringRecord(value: unknown, fieldName: string): void {
  if (
    value !== undefined &&
    (!value || typeof value !== "object" || Array.isArray(value) || Object.values(value).some(item => typeof item !== "string"))
  ) {
    throw new Error(`Invalid configuration: ${fieldName} must be an object of strings`);
  }
}

function validateRemoteUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new Error("Invalid configuration: url must be an HTTP or HTTPS URL");
  }
}

function isSensitiveHeader(name: string): boolean {
  return /authorization|cookie|token|secret|api[-_]?key/i.test(name);
}

function containsEnvironmentPlaceholder(value: string): boolean {
  return /\$\{[A-Z_][A-Z0-9_]*\}/i.test(value);
}

interface TomlArray extends Array<TomlValue> {}
interface TomlTable {
  [key: string]: TomlValue;
}
type TomlValue = string | number | boolean | TomlArray | TomlTable;

function parseTomlSubset(text: string): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let currentPath: string[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) {
      continue;
    }

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      currentPath = sectionMatch[1]!
        .split(".")
        .map(part => part.trim())
        .filter(Boolean);
      ensureTomlPath(root, currentPath);
      continue;
    }

    const assignmentMatch = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!assignmentMatch) {
      continue;
    }

    const key = assignmentMatch[1]!;
    const value = parseTomlValue(assignmentMatch[2]!);
    setTomlValue(root, currentPath, key, value);
  }

  return root;
}

function stripTomlComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
    } else if (char === "\"" && !inSingle) {
      const escaped = index > 0 && line[index - 1] === "\\";
      if (!escaped) {
        inDouble = !inDouble;
      }
    } else if (char === "#" && !inSingle && !inDouble) {
      return line.slice(0, index);
    }
  }
  return line;
}

function ensureTomlPath(root: Record<string, unknown>, pathParts: string[]): Record<string, unknown> {
  let current = root;
  for (const part of pathParts) {
    const existing = current[part];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  return current;
}

function setTomlValue(
  root: Record<string, unknown>,
  pathParts: string[],
  key: string,
  value: TomlValue,
): void {
  const target = ensureTomlPath(root, pathParts);
  target[key] = value;
}

function parseTomlValue(source: string): TomlValue {
  const trimmed = source.trim();
  if (!trimmed) {
    return "";
  }

  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return unquoteTomlString(trimmed);
  }

  if (trimmed === "true") return true;
  if (trimmed === "false") return false;

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return parseTomlArray(trimmed.slice(1, -1));
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return parseTomlInlineTable(trimmed.slice(1, -1));
  }

  if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  return trimmed;
}

function parseTomlArray(source: string): TomlValue[] {
  const values: TomlValue[] = [];
  let token = "";
  let depth = 0;
  let inSingle = false;
  let inDouble = false;

  const pushToken = () => {
    const cleaned = token.trim();
    if (cleaned) {
      values.push(parseTomlValue(cleaned));
    }
    token = "";
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      token += char;
      continue;
    }
    if (char === "\"" && !inSingle) {
      const escaped = index > 0 && source[index - 1] === "\\";
      if (!escaped) {
        inDouble = !inDouble;
      }
      token += char;
      continue;
    }
    if (!inSingle && !inDouble) {
      if (char === "[" || char === "{") {
        depth += 1;
      } else if (char === "]" || char === "}") {
        depth -= 1;
      } else if (char === "," && depth === 0) {
        pushToken();
        continue;
      }
    }
    token += char;
  }

  pushToken();
  return values;
}

function parseTomlInlineTable(source: string): Record<string, TomlValue> {
  const result: Record<string, TomlValue> = {};
  for (const part of parseTomlArray(source)) {
    if (typeof part !== "string") {
      continue;
    }
    const match = part.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!match) {
      continue;
    }
    result[match[1]!] = parseTomlValue(match[2]!);
  }
  return result;
}

function unquoteTomlString(value: string): string {
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }
  return value
    .slice(1, -1)
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
}
