import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { HookDefinition } from "./hooksRegistry";
import {
  parseInstalledSkillArgumentNames,
  substituteInstalledSkillArguments,
} from "./installedSkillArguments";
import {
  mapInstalledSkillHooksToDefinitions,
  parseInstalledSkillHooksBlock,
} from "./installedSkillHooks";
import { EFFORT_LEVELS, type EffortLevel } from "./thinkingEffort/types";
import type { ToolContext } from "./toolRuntime";

export type InstalledSkillShell = "bash" | "powershell";

export type InstalledSkillSource = "user" | "project";

export type InstalledSkillDefinition = {
  id: string;
  title: string;
  summary: string;
  whenToUse?: string;
  argumentHint?: string;
  argumentNames: string[];
  disableModelInvocation: boolean;
  executionContext?: "fork";
  modelOverride?: string;
  effort?: EffortLevel;
  shell?: InstalledSkillShell;
  hooks: HookDefinition[];
  entrypoint: string;
  source: InstalledSkillSource;
  skillPath: string;
  allowedTools: string[];
};

export type InstalledSkillExecutionPlan = {
  skill: InstalledSkillDefinition;
  prompt: string;
  allowedTools: string[];
  modelOverride?: string;
  effortOverride?: EffortLevel;
  disableModelInvocation: boolean;
  executionContext?: "fork";
  hooks: HookDefinition[];
};

type ParsedInstalledSkillMetadata = {
  title?: string;
  summary?: string;
  whenToUse?: string;
  argumentHint?: string;
  argumentNames: string[];
  disableModelInvocation: boolean;
  executionContext?: "fork";
  modelOverride?: string;
  effort?: EffortLevel;
  shell?: InstalledSkillShell;
  hooks: HookDefinition[];
  allowedTools: string[];
  contentBody: string;
};

function stripUtf8Bom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function parseBooleanFrontmatter(value: string): boolean {
  return value.trim().toLowerCase() === "true";
}

export function getClaudeConfigHomeDir(): string {
  const configured = process.env.CLAUDE_CONFIG_HOME?.trim();
  if (configured) {
    return configured;
  }

  return path.join(os.homedir(), ".claude");
}

export function getKainClawConfigHomeDir(): string {
  const configured = process.env.KAINCLAW_CONFIG_HOME?.trim();
  if (configured) {
    return configured;
  }

  return path.join(os.homedir(), ".kainclaw");
}

function getSkillsRootsForSource(
  source: InstalledSkillSource,
  workspaceRoot?: string,
): string[] {
  if (source === "user") {
    return [
      path.join(getKainClawConfigHomeDir(), "skills"),
      path.join(getClaudeConfigHomeDir(), "skills"),
    ];
  }

  if (!workspaceRoot) {
    return [];
  }

  return [
    path.join(workspaceRoot, ".kainclaw", "skills"),
    path.join(workspaceRoot, ".claude", "skills"),
  ];
}

export function getPrimaryInstalledSkillsRoot(
  source: InstalledSkillSource,
  workspaceRoot?: string,
): string | null {
  if (source === "user") {
    return path.join(getKainClawConfigHomeDir(), "skills");
  }

  if (!workspaceRoot) {
    return null;
  }

  return path.join(workspaceRoot, ".kainclaw", "skills");
}

function parseInlineList(value: string): string[] {
  const trimmed = value.trim();
  const listMatch = /^\[(.*)\]$/.exec(trimmed);
  if (!listMatch) {
    return trimmed ? [trimmed.replace(/^["']|["']$/g, "")] : [];
  }

  return listMatch[1]!
    .split(",")
    .map(item => item.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function extractDescriptionFromBody(contentBody: string): string | undefined {
  const lines = contentBody
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (line.startsWith("#")) {
      continue;
    }
    return line;
  }

  return undefined;
}

function parseInstalledSkillMetadata(
  content: string,
  resolvedSkillId = "installed-skill",
): ParsedInstalledSkillMetadata {
  const normalizedContent = stripUtf8Bom(content);
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(normalizedContent);
  const frontmatterBody = match?.[1] ?? "";
  const contentBody = match?.[2] ?? normalizedContent;
  const metadata: ParsedInstalledSkillMetadata = {
    allowedTools: [],
    argumentNames: [],
    disableModelInvocation: false,
    hooks: [],
    contentBody,
  };

  const hooksBlockMatch = /(?:^|\r?\n)hooks:\s*\r?\n((?:[ \t]+.*(?:\r?\n|$))*)/m.exec(
    frontmatterBody,
  );
  if (hooksBlockMatch?.[1]) {
    metadata.hooks = mapInstalledSkillHooksToDefinitions({
      skillId: resolvedSkillId,
      hooks: parseInstalledSkillHooksBlock(hooksBlockMatch[1]),
    });
  }

  if (!frontmatterBody) {
    metadata.summary = extractDescriptionFromBody(contentBody);
    return metadata;
  }

  const lines = frontmatterBody.split(/\r?\n/);
  let activeBlockKey: "description" | "when_to_use" | null = null;
  let activeBlockLines: string[] = [];
  let activeListKey: "allowed-tools" | "arguments" | null = null;

  function flushActiveBlock(): void {
    if (!activeBlockKey) {
      return;
    }
    const blockValue = activeBlockLines.join("\n").trim();
    if (activeBlockKey === "description" && blockValue) {
      metadata.summary = blockValue;
    }
    if (activeBlockKey === "when_to_use" && blockValue) {
      metadata.whenToUse = blockValue;
    }
    activeBlockKey = null;
    activeBlockLines = [];
  }

  function flushActiveList(): void {
    activeListKey = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "  ");

    if (activeBlockKey) {
      if (/^\s+/.test(line)) {
        activeBlockLines.push(line.trim());
        continue;
      }
      flushActiveBlock();
    }

    if (activeListKey) {
      const listMatch = /^\s*-\s*(.+?)\s*$/.exec(line);
      if (listMatch) {
        const value = listMatch[1]!.trim().replace(/^["']|["']$/g, "");
        if (activeListKey === "allowed-tools") {
          metadata.allowedTools.push(value);
        } else {
          metadata.argumentNames.push(
            ...parseInstalledSkillArgumentNames([value]),
          );
        }
        continue;
      }
      flushActiveList();
    }

    const pairMatch = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!pairMatch) {
      continue;
    }

    const key = pairMatch[1]!;
    const rawValue = pairMatch[2]!.trim();
    const unquotedValue = rawValue.replace(/^["']|["']$/g, "");

    if (key === "name" && unquotedValue) {
      metadata.title = unquotedValue;
      continue;
    }

    if (key === "description") {
      if (rawValue === "|" || rawValue === ">") {
        activeBlockKey = "description";
        activeBlockLines = [];
      } else if (unquotedValue) {
        metadata.summary = unquotedValue;
      }
      continue;
    }

    if (key === "when_to_use") {
      if (rawValue === "|" || rawValue === ">") {
        activeBlockKey = "when_to_use";
        activeBlockLines = [];
      } else if (unquotedValue) {
        metadata.whenToUse = unquotedValue;
      }
      continue;
    }

    if (key === "argument-hint" && unquotedValue) {
      metadata.argumentHint = unquotedValue;
      continue;
    }

    if (key === "arguments") {
      if (!rawValue) {
        activeListKey = "arguments";
      } else {
        metadata.argumentNames.push(
          ...parseInstalledSkillArgumentNames(unquotedValue),
        );
      }
      continue;
    }

    if (key === "model" && unquotedValue) {
      metadata.modelOverride = unquotedValue;
      continue;
    }

    if (key === "disable-model-invocation") {
      metadata.disableModelInvocation = parseBooleanFrontmatter(unquotedValue);
      continue;
    }

    if (key === "context" && unquotedValue.toLowerCase() === "fork") {
      metadata.executionContext = "fork";
      continue;
    }

    if (key === "effort" && unquotedValue) {
      const normalizedEffort = unquotedValue.toLowerCase();
      if (
        (EFFORT_LEVELS as readonly string[]).includes(normalizedEffort)
      ) {
        metadata.effort = normalizedEffort as EffortLevel;
      }
      continue;
    }

    if (key === "shell" && unquotedValue) {
      const normalizedShell = unquotedValue.toLowerCase();
      if (normalizedShell === "bash" || normalizedShell === "powershell") {
        metadata.shell = normalizedShell;
      }
      continue;
    }

    if (key === "allowed-tools") {
      if (!rawValue) {
        activeListKey = "allowed-tools";
      } else {
        metadata.allowedTools.push(...parseInlineList(rawValue));
      }
    }
  }

  flushActiveBlock();
  metadata.allowedTools = [...new Set(metadata.allowedTools)];
  metadata.argumentNames = [...new Set(metadata.argumentNames)];

  if (!metadata.summary) {
    metadata.summary = extractDescriptionFromBody(contentBody);
  }

  return metadata;
}

async function readInstalledSkillFile(
  skillId: string,
  skillPath: string,
  source: InstalledSkillSource,
): Promise<InstalledSkillDefinition | null> {
  try {
    const content = await fs.readFile(skillPath, "utf8");
    const metadata = parseInstalledSkillMetadata(content, skillId);

    return {
      id: skillId,
      title: metadata.title?.trim() || skillId,
      summary: metadata.summary?.trim() || "(no description)",
      whenToUse: metadata.whenToUse?.trim() || undefined,
      argumentHint: metadata.argumentHint?.trim() || undefined,
      argumentNames: metadata.argumentNames,
      disableModelInvocation: metadata.disableModelInvocation,
      executionContext: metadata.executionContext,
      modelOverride: metadata.modelOverride?.trim() || undefined,
      effort: metadata.effort,
      shell: metadata.shell,
      hooks: metadata.hooks.map(hook => ({
        ...hook,
        skillRoot: path.dirname(skillPath),
      })),
      entrypoint: `/${skillId}`,
      source,
      skillPath,
      allowedTools: metadata.allowedTools,
    };
  } catch {
    return null;
  }
}

async function discoverInstalledSkillsFromRoot(
  rootPath: string | null,
  source: InstalledSkillSource,
): Promise<InstalledSkillDefinition[]> {
  if (!rootPath) {
    return [];
  }

  let rootEntries: import("node:fs").Dirent[];
  try {
    rootEntries = await fs.readdir(rootPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const discovered: InstalledSkillDefinition[] = [];
  const rootSkillNames = new Set<string>();

  for (const entry of rootEntries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }

    const skillPath = path.join(rootPath, entry.name, "SKILL.md");
    const skill = await readInstalledSkillFile(entry.name, skillPath, source);
    if (!skill) {
      continue;
    }

    rootSkillNames.add(entry.name.toLowerCase());
    discovered.push(skill);
  }

  for (const entry of rootEntries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) {
      continue;
    }

    const categoryPath = path.join(rootPath, entry.name);
    let nestedEntries: import("node:fs").Dirent[];
    try {
      nestedEntries = await fs.readdir(categoryPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const nestedEntry of nestedEntries) {
      if (!nestedEntry.isDirectory() || nestedEntry.name.startsWith(".")) {
        continue;
      }

      if (rootSkillNames.has(nestedEntry.name.toLowerCase())) {
        continue;
      }

      const skillId = `${entry.name.toLowerCase()}:${nestedEntry.name.toLowerCase()}`;
      const skillPath = path.join(categoryPath, nestedEntry.name, "SKILL.md");
      const skill = await readInstalledSkillFile(skillId, skillPath, source);
      if (!skill) {
        continue;
      }

      discovered.push(skill);
    }
  }

  return discovered.sort((left, right) => left.id.localeCompare(right.id));
}

function dedupeInstalledSkills(
  lists: readonly InstalledSkillDefinition[][],
): InstalledSkillDefinition[] {
  const merged: InstalledSkillDefinition[] = [];
  const seen = new Set<string>();

  for (const list of lists) {
    for (const skill of list) {
      if (seen.has(skill.id)) {
        continue;
      }
      seen.add(skill.id);
      merged.push(skill);
    }
  }

  return merged;
}

export async function loadInstalledSkills(
  workspaceRoot?: string,
): Promise<InstalledSkillDefinition[]> {
  const [projectSkills, userSkills] = await Promise.all([
    Promise.all(
      getSkillsRootsForSource("project", workspaceRoot).map(rootPath =>
        discoverInstalledSkillsFromRoot(rootPath, "project"),
      ),
    ),
    Promise.all(
      getSkillsRootsForSource("user").map(rootPath =>
        discoverInstalledSkillsFromRoot(rootPath, "user"),
      ),
    ),
  ]);

  return dedupeInstalledSkills([...projectSkills, ...userSkills]);
}

export function getInstalledSkill(
  skills: InstalledSkillDefinition[],
  id: string,
): InstalledSkillDefinition | undefined {
  const normalized = id.trim().toLowerCase();
  return skills.find(skill => skill.id === normalized);
}

export function getInstalledSkillByEntrypoint(
  skills: InstalledSkillDefinition[],
  entrypoint: string,
): InstalledSkillDefinition | undefined {
  const normalized = entrypoint.trim().toLowerCase();
  return skills.find(skill => skill.entrypoint.trim().toLowerCase() === normalized);
}

export function formatInstalledSkillCommandDetail(
  skill: InstalledSkillDefinition,
  kind: "command" | "skill" = "command",
): string {
  const heading = kind === "command"
    ? `Command: ${skill.entrypoint}`
    : `Skill: ${skill.title}`;
  const secondary = kind === "command"
    ? `Skill: ${skill.title}`
    : `Entrypoint: ${skill.entrypoint}`;

  return [
    heading,
    ...(kind === "command" ? [secondary] : [`Id: ${skill.id}`]),
    `Source: installed-${skill.source}`,
    `Summary: ${skill.summary}`,
    `When to use: ${skill.whenToUse ?? "(none)"}`,
    `Path: ${skill.skillPath}`,
    `Arguments: ${skill.argumentNames.join(", ") || "(none)"}`,
    `Disable model invocation: ${skill.disableModelInvocation ? "yes" : "no"}`,
    `Context: ${skill.executionContext ?? "inline"}`,
    `Shell: ${skill.shell ?? "(default)"}`,
    `Hooks: ${skill.hooks.length}`,
    `Allowed tools: ${skill.allowedTools.join(", ") || "(none)"}`,
    `Model: ${skill.modelOverride ?? "(inherit)"}`,
    `Effort: ${skill.effort ?? "(inherit)"}`,
  ].join("\n");
}

export async function buildInstalledSkillPrompt(options: {
  skill: InstalledSkillDefinition;
  args?: string;
}): Promise<string> {
  const content = await fs.readFile(options.skill.skillPath, "utf8");
  const metadata = parseInstalledSkillMetadata(content, options.skill.id);
  const skillDir = path.dirname(options.skill.skillPath);
  const normalizedSkillDir =
    process.platform === "win32"
      ? skillDir.replace(/\\/g, "/")
      : skillDir;

  let prompt = `Base directory for this skill: ${normalizedSkillDir}\n\n${metadata.contentBody}`;
  prompt = prompt.replace(/\$\{CLAUDE_SKILL_DIR\}/g, normalizedSkillDir);
  prompt = substituteInstalledSkillArguments(
    prompt,
    options.args,
    true,
    metadata.argumentNames,
  );

  return prompt;
}

export async function buildInstalledSkillExecutionPlan(options: {
  skill: InstalledSkillDefinition;
  args?: string;
  toolContext?: ToolContext;
}): Promise<InstalledSkillExecutionPlan> {
  let prompt = await buildInstalledSkillPrompt({
    skill: options.skill,
    args: options.args,
  });

  if (options.toolContext) {
    const { expandInstalledSkillShellCommands } = await import("./installedSkillPromptShell.js");
    prompt = await expandInstalledSkillShellCommands({
      prompt,
      slashCommandName: options.skill.entrypoint,
      toolContext: options.toolContext,
      shell: options.skill.shell,
    });
  }

  return {
    skill: options.skill,
    prompt,
    allowedTools: mapInstalledSkillAllowedToolsToKainClawTools(
      options.skill.allowedTools,
    ),
    ...(options.skill.modelOverride
      ? { modelOverride: options.skill.modelOverride }
      : {}),
    ...(options.skill.effort
      ? { effortOverride: options.skill.effort }
      : {}),
    disableModelInvocation: options.skill.disableModelInvocation,
    ...(options.skill.executionContext
      ? { executionContext: options.skill.executionContext }
      : {}),
    hooks: options.skill.hooks,
  };
}

export function mapInstalledSkillAllowedToolsToKainClawTools(
  allowedTools: string[],
): string[] {
  const toolAliasMap = new Map<string, string[]>([
    ["bash", ["run_command"]],
    ["read", ["read_file"]],
    ["edit", ["replace_in_file"]],
    ["write", ["write_file"]],
    ["grep", ["search_files"]],
    ["glob", ["glob_files"]],
    ["webfetch", ["WebFetch"]],
    ["websearch", ["WebSearch"]],
    ["browser", [
      "browser_navigate",
      "browser_snapshot",
      "browser_click",
      "browser_type",
      "browser_wait_for",
      "browser_screenshot",
      "browser_close",
    ]],
  ]);

  const resolved = new Set<string>();
  for (const allowedTool of allowedTools) {
    const normalized = allowedTool.trim().toLowerCase();
    const mapped = toolAliasMap.get(normalized);
    if (!mapped) {
      continue;
    }
    for (const toolName of mapped) {
      resolved.add(toolName);
    }
  }

  return [...resolved];
}
