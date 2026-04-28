import { promises as fs } from "node:fs";
import path from "node:path";
import {
  getInstalledSkill,
  getPrimaryInstalledSkillsRoot,
  loadInstalledSkills,
  type InstalledSkillSource,
} from "./installedSkillsRegistry";

export type InstalledSkillInstallScope = InstalledSkillSource;

export type InstalledSkillTargetInfo = {
  scope: InstalledSkillInstallScope;
  path: string;
};

export type InstalledSkillInstallResult = {
  installedId: string;
  scope: InstalledSkillInstallScope;
  sourcePath: string;
  targetPath: string;
};

export type InstalledSkillRemoveResult = {
  removedId: string;
  scope: InstalledSkillInstallScope;
  removedPath: string;
};

function slugifyInstalledSkillId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeInstalledSkillId(value: string): string {
  return value.trim().toLowerCase();
}

function resolveSkillSourcePath(
  source: string,
  workspaceRoot?: string,
): string {
  const trimmed = source.trim().replace(/^"(.*)"$|^'(.*)'$/u, "$1$2");
  if (!trimmed) {
    throw new Error("Usage: `/skills install <local-skill-directory>`");
  }

  const expanded = trimmed.startsWith("~/") || trimmed === "~"
    ? path.join(process.env.USERPROFILE || process.env.HOME || "~", trimmed.slice(2))
    : trimmed;

  if (path.isAbsolute(expanded)) {
    return path.resolve(expanded);
  }

  return path.resolve(workspaceRoot ?? process.cwd(), expanded);
}

async function statOrNull(targetPath: string): Promise<import("node:fs").Stats | null> {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}

async function resolveLocalSkillDirectory(
  source: string,
  workspaceRoot?: string,
): Promise<{ skillDir: string; skillPath: string; installedId: string }> {
  const resolvedPath = resolveSkillSourcePath(source, workspaceRoot);
  const sourceStats = await statOrNull(resolvedPath);
  if (!sourceStats) {
    throw new Error(`Skill source not found: ${resolvedPath}`);
  }

  const skillPath = sourceStats.isDirectory()
    ? path.join(resolvedPath, "SKILL.md")
    : resolvedPath;
  const skillDir = sourceStats.isDirectory()
    ? resolvedPath
    : path.dirname(resolvedPath);
  const skillStats = await statOrNull(skillPath);
  if (!skillStats?.isFile()) {
    throw new Error(
      `Skill source must be a directory (or SKILL.md path) containing SKILL.md: ${resolvedPath}`,
    );
  }

  const installedId = slugifyInstalledSkillId(path.basename(skillDir));
  if (!installedId) {
    throw new Error(`Could not derive a valid skill id from: ${skillDir}`);
  }

  return { skillDir, skillPath, installedId };
}

function getPrimaryTargetInfo(
  scope: InstalledSkillInstallScope,
  workspaceRoot?: string,
): InstalledSkillTargetInfo {
  const targetPath = getPrimaryInstalledSkillsRoot(scope, workspaceRoot);
  if (!targetPath) {
    throw new Error(
      "Workspace skill installation requires an active workspace root.",
    );
  }

  return {
    scope,
    path: targetPath,
  };
}

function buildInstalledSkillPath(
  rootPath: string,
  skillId: string,
): string {
  return path.join(rootPath, ...skillId.split(":"));
}

export function listInstalledSkillTargets(
  workspaceRoot?: string,
): InstalledSkillTargetInfo[] {
  const targets: InstalledSkillTargetInfo[] = [
    getPrimaryTargetInfo("user", workspaceRoot),
  ];

  if (workspaceRoot) {
    targets.push(getPrimaryTargetInfo("project", workspaceRoot));
  }

  return targets;
}

export async function installSkillFromLocalPath(options: {
  source: string;
  scope?: InstalledSkillInstallScope;
  workspaceRoot?: string;
}): Promise<InstalledSkillInstallResult> {
  const scope = options.scope ?? (options.workspaceRoot ? "project" : "user");
  const target = getPrimaryTargetInfo(scope, options.workspaceRoot);
  const resolvedSource = await resolveLocalSkillDirectory(
    options.source,
    options.workspaceRoot,
  );
  const targetPath = buildInstalledSkillPath(target.path, resolvedSource.installedId);

  await fs.mkdir(target.path, { recursive: true });

  const existing = await statOrNull(targetPath);
  if (existing) {
    throw new Error(
      `Installed skill "${resolvedSource.installedId}" already exists at ${targetPath}`,
    );
  }

  await fs.cp(resolvedSource.skillDir, targetPath, {
    recursive: true,
    errorOnExist: true,
    force: false,
  });

  return {
    installedId: resolvedSource.installedId,
    scope,
    sourcePath: resolvedSource.skillDir,
    targetPath,
  };
}

export async function removeInstalledSkill(options: {
  skillId: string;
  scope?: InstalledSkillInstallScope;
  workspaceRoot?: string;
}): Promise<InstalledSkillRemoveResult> {
  const normalizedSkillId = normalizeInstalledSkillId(options.skillId);
  if (!normalizedSkillId) {
    throw new Error("Usage: `/skills remove <skill-id>`");
  }

  const scopes = options.scope
    ? [options.scope]
    : (["project", "user"] as InstalledSkillInstallScope[]);
  const matches = scopes
    .map(scope => {
      const target = getPrimaryInstalledSkillsRoot(scope, options.workspaceRoot);
      if (!target) {
        return null;
      }
      const removedPath = buildInstalledSkillPath(target, normalizedSkillId);
      return {
        scope,
        removedPath,
      };
    })
    .filter((value): value is { scope: InstalledSkillInstallScope; removedPath: string } => Boolean(value));

  const existingMatches = [];
  for (const match of matches) {
    const stats = await statOrNull(match.removedPath);
    if (stats?.isDirectory()) {
      existingMatches.push(match);
    }
  }

  if (existingMatches.length === 0) {
    throw new Error(
      `Installed skill "${normalizedSkillId}" was not found in writable KainClaw skill roots.`,
    );
  }

  if (!options.scope && existingMatches.length > 1) {
    throw new Error(
      `Installed skill "${normalizedSkillId}" exists in both project and user roots. Re-run with \`/skills remove --scope project ${normalizedSkillId}\` or \`/skills remove --scope user ${normalizedSkillId}\`.`,
    );
  }

  const match = existingMatches[0]!;
  await fs.rm(match.removedPath, { recursive: true, force: true });

  return {
    removedId: normalizedSkillId,
    scope: match.scope,
    removedPath: match.removedPath,
  };
}

export async function formatInstalledSkillsList(
  workspaceRoot?: string,
): Promise<string> {
  const installedSkills = await loadInstalledSkills(workspaceRoot);
  const targets = listInstalledSkillTargets(workspaceRoot);

  const lines = [
    "Installed skill targets:",
    ...targets.map(target => `- ${target.scope}: ${target.path}`),
    "",
    "Installed skills:",
  ];

  if (installedSkills.length === 0) {
    lines.push("[none]");
  } else {
    lines.push(
      ...installedSkills.map(skill => {
        const sourcePath = skill.source;
        return `- ${skill.id}: ${skill.summary} | ${sourcePath} | ${skill.skillPath}`;
      }),
    );
  }

  lines.push("");
  lines.push("Install command:");
  lines.push("- `/skills install [--scope project|user] <local-skill-directory>`");
  lines.push("Remove command:");
  lines.push("- `/skills remove [--scope project|user] <skill-id>`");

  return lines.join("\n");
}

export async function verifyInstalledSkillVisible(options: {
  skillId: string;
  workspaceRoot?: string;
}): Promise<boolean> {
  const installedSkills = await loadInstalledSkills(options.workspaceRoot);
  return Boolean(getInstalledSkill(installedSkills, options.skillId));
}
