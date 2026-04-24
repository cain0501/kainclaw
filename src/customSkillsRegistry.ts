import { promises as fs } from "node:fs";
import path from "node:path";

export type CustomSkillDefinition = {
  id: string;
  title: string;
  summary: string;
  whenToUse: string;
  entrypoint: string;
};

type SkillsFile = {
  skills?: unknown;
};

export function getCustomSkillsConfigPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".cain", "skills.json");
}

function normalizeCustomSkillDefinition(value: unknown): CustomSkillDefinition | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id.trim().toLowerCase() : "";
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  const whenToUse =
    typeof record.whenToUse === "string" ? record.whenToUse.trim() : "";
  const entrypoint =
    typeof record.entrypoint === "string" ? record.entrypoint.trim() : "";

  if (!id || !title || !summary || !whenToUse || !entrypoint) {
    return null;
  }

  return {
    id,
    title,
    summary,
    whenToUse,
    entrypoint,
  };
}

export async function loadCustomSkills(
  workspaceRoot: string,
): Promise<CustomSkillDefinition[]> {
  const configPath = getCustomSkillsConfigPath(workspaceRoot);
  let rawContent = "";

  try {
    rawContent = await fs.readFile(configPath, "utf8");
  } catch {
    return [];
  }

  let parsed: SkillsFile;
  try {
    parsed = JSON.parse(rawContent) as SkillsFile;
  } catch {
    return [];
  }

  const skills = Array.isArray(parsed.skills) ? parsed.skills : [];
  return skills
    .map(normalizeCustomSkillDefinition)
    .filter((skill): skill is CustomSkillDefinition => !!skill)
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function getCustomSkill(
  skills: CustomSkillDefinition[],
  id: string,
): CustomSkillDefinition | undefined {
  const normalized = id.trim().toLowerCase();
  return skills.find(skill => skill.id === normalized);
}
