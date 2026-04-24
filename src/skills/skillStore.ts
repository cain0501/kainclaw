import { promises as fs } from "node:fs";
import path from "node:path";

const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const SKILL_NAME_MAX_LENGTH = 64;

export type SkillRecord = {
  name: string;
  category?: string;
  description: string;
  tags: string[];
  source: "auto" | "user";
  createdAt: string;
  content: string;
  skillDir: string;
};

export type SkillFrontmatter = {
  name?: string;
  description?: string;
  tags?: string[];
  source?: string;
  createdAt?: string;
};

export function parseSkillFrontmatter(content: string): SkillFrontmatter {
  const match = /^---\n([\s\S]*?)\n---/.exec(content);
  if (!match) {
    return {};
  }

  const body = match[1];
  const result: SkillFrontmatter = {};

  for (const line of body.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx < 0) {
      continue;
    }

    const rawKey = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();

    if (!rawKey) {
      continue;
    }

    if (rawKey === "tags") {
      const tagsMatch = /\[([^\]]*)\]/.exec(rawValue);
      if (tagsMatch) {
        result.tags = tagsMatch[1]
          .split(",")
          .map(tag => tag.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
      } else {
        result.tags = [];
      }
      continue;
    }

    const unquoted = rawValue.replace(/^["']|["']$/g, "");

    if (rawKey === "name") {
      result.name = unquoted;
    } else if (rawKey === "description") {
      result.description = unquoted;
    } else if (rawKey === "source") {
      result.source = unquoted;
    } else if (rawKey === "created_at") {
      result.createdAt = unquoted;
    }
  }

  return result;
}

function validateSkillName(name: string): void {
  if (!name || !SKILL_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid skill name "${name}". Must match /^[a-z0-9][a-z0-9._-]*$/.`,
    );
  }

  if (name.length > SKILL_NAME_MAX_LENGTH) {
    throw new Error(
      `Skill name "${name}" exceeds maximum length of ${SKILL_NAME_MAX_LENGTH} characters.`,
    );
  }
}

function buildSkillRecord(
  skillDir: string,
  content: string,
  name: string,
  category?: string,
): SkillRecord {
  const fm = parseSkillFrontmatter(content);
  return {
    name,
    category,
    description: fm.description ?? "",
    tags: fm.tags ?? [],
    source: (fm.source === "user" ? "user" : "auto") as "auto" | "user",
    createdAt: fm.createdAt ?? new Date().toISOString(),
    content,
    skillDir,
  };
}

export class SkillStore {
  constructor(private readonly userSkillsRoot: string) {}

  async init(): Promise<void> {
    await fs.mkdir(this.userSkillsRoot, { recursive: true });
  }

  async create(options: {
    name: string;
    category?: string;
    content: string;
  }): Promise<SkillRecord> {
    validateSkillName(options.name);

    if (options.category) {
      validateSkillName(options.category);
    }

    const existing = await this.find(options.name);
    if (existing) {
      throw new Error(`Skill already exists: ${options.name}`);
    }

    const skillDir = options.category
      ? path.join(this.userSkillsRoot, options.category, options.name)
      : path.join(this.userSkillsRoot, options.name);

    await fs.mkdir(skillDir, { recursive: true });
    const skillPath = path.join(skillDir, "SKILL.md");
    await fs.writeFile(skillPath, options.content, "utf8");

    return buildSkillRecord(skillDir, options.content, options.name, options.category);
  }

  async edit(name: string, content: string): Promise<SkillRecord> {
    const existing = await this.find(name);
    if (!existing) {
      throw new Error(`Skill not found: ${name}`);
    }

    const skillPath = path.join(existing.skillDir, "SKILL.md");
    await fs.writeFile(skillPath, content, "utf8");

    return buildSkillRecord(existing.skillDir, content, name, existing.category);
  }

  async patch(name: string, oldString: string, newString: string): Promise<SkillRecord> {
    const existing = await this.find(name);
    if (!existing) {
      throw new Error(`Skill not found: ${name}`);
    }

    if (!existing.content.includes(oldString)) {
      throw new Error(
        `old_string not found in skill "${name}". No changes made.`,
      );
    }

    const newContent = existing.content.replace(oldString, newString);
    const skillPath = path.join(existing.skillDir, "SKILL.md");
    await fs.writeFile(skillPath, newContent, "utf8");

    return buildSkillRecord(existing.skillDir, newContent, name, existing.category);
  }

  async delete(name: string): Promise<void> {
    const existing = await this.find(name);
    if (!existing) {
      return;
    }

    await fs.rm(existing.skillDir, { recursive: true, force: true });
  }

  async list(): Promise<SkillRecord[]> {
    const records: SkillRecord[] = [];

    let rootEntries: import("node:fs").Dirent[];
    try {
      rootEntries = await fs.readdir(this.userSkillsRoot, { withFileTypes: true });
    } catch {
      return records;
    }

    for (const entry of rootEntries) {
      if (!entry.isDirectory()) {
        continue;
      }

      const entryPath = path.join(this.userSkillsRoot, entry.name);
      const skillMdPath = path.join(entryPath, "SKILL.md");

      try {
        await fs.access(skillMdPath);
        const content = await fs.readFile(skillMdPath, "utf8");
        records.push(buildSkillRecord(entryPath, content, entry.name, undefined));
        continue;
      } catch {
        // Not a skill at root level — check one level deeper (category)
      }

      let subEntries: import("node:fs").Dirent[];
      try {
        subEntries = await fs.readdir(entryPath, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const subEntry of subEntries) {
        if (!subEntry.isDirectory()) {
          continue;
        }

        const subPath = path.join(entryPath, subEntry.name);
        const subSkillMdPath = path.join(subPath, "SKILL.md");

        try {
          await fs.access(subSkillMdPath);
          const content = await fs.readFile(subSkillMdPath, "utf8");
          records.push(buildSkillRecord(subPath, content, subEntry.name, entry.name));
        } catch {
          // Not a skill, skip
        }
      }
    }

    return records;
  }

  async find(name: string): Promise<SkillRecord | undefined> {
    const all = await this.list();
    return all.find(record => record.name === name);
  }
}
