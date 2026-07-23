import { promises as fs } from "node:fs";
import path from "node:path";

export type McpPermissionEffect = "allow" | "deny";
export type McpPermissionDecision = McpPermissionEffect | "none";

export type McpPermissionRule = {
  pattern: string;
  effect: McpPermissionEffect;
  updatedAt: number;
};

type PermissionDocument = {
  version: 1;
  rules: McpPermissionRule[];
};

const PERMISSION_FILENAME = "mcp-permissions.json";

export class McpPermissionStore {
  private readonly filePath: string;

  constructor(storageRoot: string) {
    this.filePath = path.join(storageRoot, PERMISSION_FILENAME);
  }

  async listRules(): Promise<McpPermissionRule[]> {
    return [...(await this.load()).rules];
  }

  async setRule(pattern: string, effect: McpPermissionEffect): Promise<McpPermissionRule> {
    const normalizedPattern = normalizeMcpPermissionPattern(pattern);
    const document = await this.load();
    const rule: McpPermissionRule = {
      pattern: normalizedPattern,
      effect,
      updatedAt: Date.now(),
    };
    document.rules = document.rules.filter(existing => existing.pattern !== normalizedPattern || existing.effect !== effect);
    document.rules.push(rule);
    await this.save(document);
    return rule;
  }

  async removeRule(pattern: string, effect?: McpPermissionEffect): Promise<void> {
    const normalizedPattern = normalizeMcpPermissionPattern(pattern);
    const document = await this.load();
    const nextRules = document.rules.filter(rule => rule.pattern !== normalizedPattern || (effect && rule.effect !== effect));
    if (nextRules.length === document.rules.length) {
      return;
    }
    document.rules = nextRules;
    await this.save(document);
  }

  async getDecision(key: string): Promise<McpPermissionDecision> {
    const normalizedKey = normalizeMcpPermissionKey(key);
    const matchingRules = (await this.load()).rules.filter(rule => ruleMatches(rule.pattern, normalizedKey));
    if (matchingRules.some(rule => rule.effect === "deny")) {
      return "deny";
    }
    return matchingRules.some(rule => rule.effect === "allow") ? "allow" : "none";
  }

  private async load(): Promise<PermissionDocument> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<PermissionDocument>;
      if (parsed.version === 1 && Array.isArray(parsed.rules)) {
        return {
          version: 1,
          rules: parsed.rules.filter(isStoredRule),
        };
      }
    } catch {
      // Missing or malformed local rules must not change existing permissive behavior.
    }
    return { version: 1, rules: [] };
  }

  private async save(document: PermissionDocument): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  }
}

export function buildMcpPermissionKey(serverName: string, toolName: string): string {
  return `mcp__${normalizeMcpPermissionPart(serverName)}__${normalizeMcpPermissionPart(toolName)}`;
}

export function normalizeMcpPermissionPattern(pattern: string): string {
  const parts = pattern.trim().toLowerCase().split("__");
  if (parts[0] !== "mcp" || !parts[1]) {
    throw new Error("MCP permission rules must begin with mcp__server");
  }

  const serverName = normalizeMcpPermissionPart(parts[1]);
  const toolName = parts.slice(2).join("__");
  if (!toolName) {
    return `mcp__${serverName}__*`;
  }
  if (toolName === "*") {
    return `mcp__${serverName}__*`;
  }
  if (toolName.includes("*")) {
    throw new Error("MCP permission wildcards must be the complete tool segment");
  }
  return buildMcpPermissionKey(serverName, toolName);
}

export function normalizeMcpPermissionKey(key: string): string {
  const parts = key.trim().toLowerCase().split("__");
  if (parts[0] !== "mcp" || !parts[1] || !parts.slice(2).join("__")) {
    throw new Error("MCP permission keys must identify a server and tool");
  }
  return buildMcpPermissionKey(parts[1], parts.slice(2).join("__"));
}

function normalizeMcpPermissionPart(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  if (!normalized) {
    throw new Error("MCP permission server and tool names cannot be empty");
  }
  return normalized;
}

function ruleMatches(pattern: string, key: string): boolean {
  return pattern.endsWith("__*")
    ? key.startsWith(pattern.slice(0, -1))
    : pattern === key;
}

function isStoredRule(value: unknown): value is McpPermissionRule {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const rule = value as Partial<McpPermissionRule>;
  return typeof rule.pattern === "string" && (rule.effect === "allow" || rule.effect === "deny") && typeof rule.updatedAt === "number";
}
