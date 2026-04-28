import {
  loadInstalledSkills,
  type InstalledSkillDefinition,
} from "./installedSkillsRegistry";

const MODEL_SKILL_LISTING_CHAR_BUDGET = 4000;

export function isModelInvocableInstalledSkill(
  skill: InstalledSkillDefinition,
): boolean {
  return (
    !skill.disableModelInvocation &&
    !skill.modelOverride &&
    !skill.effort &&
    skill.hooks.length === 0
  );
}

export async function loadModelInvocableInstalledSkills(
  workspaceRoot?: string,
): Promise<InstalledSkillDefinition[]> {
  const installedSkills = await loadInstalledSkills(workspaceRoot);
  return installedSkills.filter(isModelInvocableInstalledSkill);
}

function formatInstalledSkillListEntry(
  skill: InstalledSkillDefinition,
): string {
  const whenToUse = skill.whenToUse?.trim()
    ? ` | When to use: ${skill.whenToUse.trim()}`
    : "";
  return `- ${skill.id}: ${skill.summary}${whenToUse}`;
}

export function buildInstalledSkillsSystemPrompt(
  basePrompt: string,
  skills: readonly InstalledSkillDefinition[],
): string {
  if (skills.length === 0) {
    return basePrompt;
  }

  const lines = [
    "# Installed Skills",
    "The workspace defines installed skills that you can load with the SkillTool.",
    "Use SkillTool only for the exact installed skills listed below. Do not guess skill names.",
    "Only the installed skills listed here are safe for direct model invocation in the current KainClaw runtime.",
    "Some installed skills run inline, while others run in an isolated forked agent context. Skills that require model overrides, effort overrides, or hook registration still remain slash-only and are intentionally excluded.",
    "",
    "Available model-invocable installed skills:",
  ];

  let usedChars = lines.join("\n").length;
  let listedCount = 0;

  for (const skill of skills) {
    const entry = formatInstalledSkillListEntry(skill);
    if (usedChars + entry.length + 1 > MODEL_SKILL_LISTING_CHAR_BUDGET) {
      break;
    }
    lines.push(entry);
    usedChars += entry.length + 1;
    listedCount += 1;
  }

  if (listedCount < skills.length) {
    lines.push(
      `- [${skills.length - listedCount} additional installed skill(s) omitted to stay within the prompt budget]`,
    );
  }

  return `${basePrompt.trimEnd()}\n\n${lines.join("\n")}`;
}
