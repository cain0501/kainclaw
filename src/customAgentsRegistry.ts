import { promises as fs } from "node:fs";
import path from "node:path";

export type CustomAgentDefinition = {
  id: string;
  name: string;
  description: string;
  tools: string[];
  model?: string;
  color?: string;
  memory?: string[];
};

type CustomAgentsFile = {
  agents?: unknown;
};

export function getCustomAgentsConfigPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".cain", "agents.json");
}

function normalizeCustomAgentDefinition(value: unknown): CustomAgentDefinition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim().toLowerCase() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const description =
    typeof record.description === "string" ? record.description.trim() : "";

  if (!id || !name || !description) {
    return null;
  }

  const tools = Array.isArray(record.tools)
    ? record.tools
        .filter((tool): tool is string => typeof tool === "string" && tool.trim() !== "")
        .map(tool => tool.trim())
    : [];
  const memory = Array.isArray(record.memory)
    ? record.memory
        .filter((item): item is string => typeof item === "string" && item.trim() !== "")
        .map(item => item.trim())
    : undefined;

  return {
    id,
    name,
    description,
    tools,
    ...(typeof record.model === "string" && record.model.trim()
      ? { model: record.model.trim() }
      : {}),
    ...(typeof record.color === "string" && record.color.trim()
      ? { color: record.color.trim() }
      : {}),
    ...(memory && memory.length > 0 ? { memory } : {}),
  };
}

export async function loadCustomAgents(
  workspaceRoot: string,
): Promise<CustomAgentDefinition[]> {
  const configPath = getCustomAgentsConfigPath(workspaceRoot);
  let rawContent = "";

  try {
    rawContent = await fs.readFile(configPath, "utf8");
  } catch {
    return [];
  }

  let parsed: CustomAgentsFile;
  try {
    parsed = JSON.parse(rawContent) as CustomAgentsFile;
  } catch {
    return [];
  }

  const agents = Array.isArray(parsed.agents) ? parsed.agents : [];
  const normalizedAgents = agents
    .map(normalizeCustomAgentDefinition)
    .filter((agent): agent is CustomAgentDefinition => !!agent);

  return normalizedAgents.sort((left, right) => left.id.localeCompare(right.id));
}

export function getCustomAgent(
  agents: CustomAgentDefinition[],
  id: string,
): CustomAgentDefinition | undefined {
  const normalized = id.trim().toLowerCase();
  return agents.find(agent => agent.id === normalized);
}
