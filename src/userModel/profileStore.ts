import { promises as fs } from "node:fs";
import path from "node:path";

const PROFILE_FILENAME = "user-profile.md";
const BACKUP_DIR = "user-profile-backups";
const MAX_BACKUPS = 5;

function buildBackupFilename(): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
  return `user-profile.${ts}.md`;
}

function addItemToSection(profile: string, section: string, item: string): string {
  const sectionHeader = `## ${section}`;
  const sectionIdx = profile.indexOf(sectionHeader);

  if (sectionIdx < 0) {
    const trimmed = profile.trimEnd();
    return `${trimmed}\n\n${sectionHeader}\n\n- ${item}`;
  }

  const afterHeader = profile.indexOf("\n", sectionIdx + sectionHeader.length);
  if (afterHeader < 0) {
    return `${profile}\n- ${item}`;
  }

  const nextSectionIdx = profile.indexOf("\n## ", afterHeader);
  const insertBefore = nextSectionIdx < 0 ? profile.length : nextSectionIdx;

  const before = profile.slice(0, insertBefore).trimEnd();
  const after = profile.slice(insertBefore);
  return `${before}\n- ${item}${after}`;
}

export function applyProfileDelta(profile: string, delta: string): string {
  const lines = delta.split("\n");
  let result = profile;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith("ADD: ")) {
      const rest = trimmed.slice(5).trim();
      const pipeIdx = rest.indexOf(" | ");
      if (pipeIdx < 0) {
        continue;
      }
      const section = rest.slice(0, pipeIdx).trim();
      const item = rest.slice(pipeIdx + 3).trim();
      result = addItemToSection(result, section, item);
    } else if (trimmed.startsWith("MODIFY: ")) {
      const rest = trimmed.slice(8).trim();
      const pipeIdx = rest.indexOf(" | ");
      if (pipeIdx < 0) {
        continue;
      }
      const itemPart = rest.slice(pipeIdx + 3).trim();
      const arrowIdx = itemPart.indexOf(" → ");
      if (arrowIdx < 0) {
        continue;
      }
      const oldText = itemPart.slice(0, arrowIdx).trim();
      const newText = itemPart.slice(arrowIdx + 3).trim();
      result = result.replace(oldText, newText);
    } else if (trimmed.startsWith("REMOVE: ")) {
      const rest = trimmed.slice(8).trim();
      const pipeIdx = rest.indexOf(" | ");
      if (pipeIdx < 0) {
        continue;
      }
      const item = rest.slice(pipeIdx + 3).trim();
      result = result
        .split("\n")
        .filter(l => !l.trim().includes(item))
        .join("\n");
    }
  }

  return result;
}

function looksLikeDelta(text: string): boolean {
  return /^(ADD|MODIFY|REMOVE): /m.test(text);
}

export class ProfileStore {
  private readonly filePath: string;
  private readonly backupDir: string;

  constructor(private readonly storageRoot: string) {
    this.filePath = path.join(storageRoot, PROFILE_FILENAME);
    this.backupDir = path.join(storageRoot, BACKUP_DIR);
  }

  async load(): Promise<string | null> {
    try {
      const content = await fs.readFile(this.filePath, "utf8");
      return content || null;
    } catch {
      return null;
    }
  }

  async save(content: string): Promise<void> {
    await fs.mkdir(this.storageRoot, { recursive: true });
    const existing = await this.load();
    if (existing) {
      await this._writeBackup(existing);
    }
    await fs.writeFile(this.filePath, content, "utf8");
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.filePath);
    } catch {
      // File doesn't exist, nothing to do
    }
  }

  async backup(): Promise<void> {
    const content = await this.load();
    if (!content) return;
    await this._writeBackup(content);
  }

  async listBackups(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.backupDir);
      return entries
        .filter(e => e.startsWith("user-profile.") && e.endsWith(".md"))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  async restore(backupName: string): Promise<void> {
    const backupPath = path.join(this.backupDir, backupName);
    const content = await fs.readFile(backupPath, "utf8");
    await fs.mkdir(this.storageRoot, { recursive: true });
    await fs.writeFile(this.filePath, content, "utf8");
  }

  async applyDelta(delta: string): Promise<void> {
    const trimmed = delta.trim();
    if (trimmed === "NO_CHANGES" || !trimmed) {
      return;
    }

    const existing = await this.load();

    if (!looksLikeDelta(trimmed)) {
      await this.save(trimmed);
      return;
    }

    const updated = applyProfileDelta(existing ?? "", trimmed);
    await this.save(updated);
  }

  private async _writeBackup(content: string): Promise<void> {
    await fs.mkdir(this.backupDir, { recursive: true });
    const filename = buildBackupFilename();
    await fs.writeFile(path.join(this.backupDir, filename), content, "utf8");
    await this._pruneBackups();
  }

  private async _pruneBackups(): Promise<void> {
    try {
      const entries = await fs.readdir(this.backupDir);
      const backups = entries
        .filter(e => e.startsWith("user-profile.") && e.endsWith(".md"))
        .sort();
      const excess = backups.slice(0, Math.max(0, backups.length - MAX_BACKUPS));
      for (const name of excess) {
        await fs.unlink(path.join(this.backupDir, name));
      }
    } catch {
      // Ignore pruning errors
    }
  }
}
