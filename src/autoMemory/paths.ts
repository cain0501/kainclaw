import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import path from "node:path";

export const MEMORY_ENTRYPOINT_NAME = "MEMORY.md";

const MEMORY_ROOT_SEGMENTS = [".cain", "projects"] as const;
const MEMORY_INDEX_HEADER = "# Memory Index";
const MAX_ENTRYPOINT_LINES = 200;
const MAX_ENTRYPOINT_BYTES = 25_000;

export type MemoryType = "user" | "feedback" | "project" | "reference";

export type MemorySuggestion = {
  slug: string;
  name: string;
  description: string;
  type: MemoryType;
  hook: string;
  body: string;
};

export type MemoryManifestEntry = {
  relativePath: string;
  name: string;
  description: string;
  type: string;
};

export type MemoryEntryDetail = MemoryManifestEntry & {
  absolutePath: string;
  body: string;
};

function sanitizeProjectSlug(workspaceRoot: string): string {
  const normalized = workspaceRoot.replace(/\\/g, "/").toLowerCase();
  const slug = normalized
    .replace(/^[a-z]:\//, "")
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/[/-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "workspace";
}

function buildProjectKey(workspaceRoot: string): string {
  const hash = createHash("sha1").update(workspaceRoot).digest("hex").slice(0, 12);
  return `${sanitizeProjectSlug(workspaceRoot)}-${hash}`;
}

function quoteFrontmatterValue(value: string): string {
  return JSON.stringify(value.trim());
}

function sanitizeMemorySlug(rawSlug: string, fallbackName: string): string {
  const candidate = (rawSlug || fallbackName || "memory")
    .replace(/\\/g, "/")
    .split("/")
    .pop() ?? "memory";
  const bareName = candidate.replace(/\.md$/i, "");
  const safeName = bareName
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${safeName || "memory"}.md`;
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return {};
  }

  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    fields[key] = value;
  }

  return fields;
}

async function walkMarkdownFiles(rootPath: string, currentPath = rootPath): Promise<string[]> {
  const entries = await fs.readdir(currentPath, { withFileTypes: true });
  const filePaths: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      filePaths.push(...(await walkMarkdownFiles(rootPath, fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      filePaths.push(fullPath);
    }
  }

  return filePaths;
}

function normalizeEntrypointContent(rawContent: string): string {
  const trimmed = rawContent.trim();
  if (!trimmed) {
    return `${MEMORY_INDEX_HEADER}\n`;
  }
  if (trimmed.startsWith("#")) {
    return `${trimmed}\n`;
  }
  return `${MEMORY_INDEX_HEADER}\n\n${trimmed}\n`;
}

function buildEntrypointLine(item: MemorySuggestion, relativePath: string): string {
  return `- [${item.name.trim()}](${relativePath}): ${item.hook.trim()}`;
}

function truncateEntrypointContent(rawContent: string): string {
  const trimmed = rawContent.trim();
  if (!trimmed) {
    return "";
  }

  const lines = trimmed.split(/\r?\n/);
  let content = lines.slice(0, MAX_ENTRYPOINT_LINES).join("\n");

  if (content.length > MAX_ENTRYPOINT_BYTES) {
    const cutIndex = content.lastIndexOf("\n", MAX_ENTRYPOINT_BYTES);
    content = content.slice(0, cutIndex > 0 ? cutIndex : MAX_ENTRYPOINT_BYTES);
  }

  const wasTruncated =
    lines.length > MAX_ENTRYPOINT_LINES || trimmed.length > MAX_ENTRYPOINT_BYTES;

  if (!wasTruncated) {
    return content;
  }

  return `${content}\n\n> WARNING: MEMORY.md was truncated before loading into the prompt.`;
}

export function getAutoMemoryDir(workspaceRoot: string): string {
  return path.join(
    os.homedir(),
    ...MEMORY_ROOT_SEGMENTS,
    buildProjectKey(workspaceRoot),
    "memory",
  );
}

export function getAutoMemoryEntrypoint(workspaceRoot: string): string {
  return path.join(getAutoMemoryDir(workspaceRoot), MEMORY_ENTRYPOINT_NAME);
}

export async function ensureAutoMemoryDir(
  workspaceRoot: string,
): Promise<{ memoryDir: string; entrypointPath: string }> {
  const memoryDir = getAutoMemoryDir(workspaceRoot);
  const entrypointPath = getAutoMemoryEntrypoint(workspaceRoot);
  await fs.mkdir(memoryDir, { recursive: true });

  try {
    await fs.access(entrypointPath);
  } catch {
    await fs.writeFile(entrypointPath, `${MEMORY_INDEX_HEADER}\n`, "utf8");
  }

  return { memoryDir, entrypointPath };
}

export async function readAutoMemoryEntrypoint(workspaceRoot: string): Promise<string> {
  const { entrypointPath } = await ensureAutoMemoryDir(workspaceRoot);
  try {
    const rawContent = await fs.readFile(entrypointPath, "utf8");
    return truncateEntrypointContent(rawContent);
  } catch {
    return "";
  }
}

export async function scanAutoMemoryManifest(
  workspaceRoot: string,
): Promise<MemoryManifestEntry[]> {
  const { memoryDir } = await ensureAutoMemoryDir(workspaceRoot);
  const filePaths = await walkMarkdownFiles(memoryDir);
  const entries: MemoryManifestEntry[] = [];

  for (const filePath of filePaths) {
    const relativePath = path.relative(memoryDir, filePath).replace(/\\/g, "/");
    if (relativePath.toLowerCase() === MEMORY_ENTRYPOINT_NAME.toLowerCase()) {
      continue;
    }

    let content = "";
    try {
      content = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }

    const frontmatter = parseFrontmatter(content);
    entries.push({
      relativePath,
      name: frontmatter.name || path.basename(relativePath, path.extname(relativePath)),
      description: frontmatter.description || "",
      type: frontmatter.type || "unknown",
    });
  }

  return entries.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

export function findMemoryManifestEntry(
  entries: MemoryManifestEntry[],
  query: string,
): MemoryManifestEntry | undefined {
  const normalized = query.trim().toLowerCase();
  return entries.find(entry => {
    const relativePath = entry.relativePath.toLowerCase();
    const fileSlug = path.basename(relativePath, path.extname(relativePath));
    return (
      relativePath === normalized ||
      fileSlug === normalized ||
      entry.name.trim().toLowerCase() === normalized
    );
  });
}

export async function readAutoMemoryEntry(
  workspaceRoot: string,
  query: string,
): Promise<MemoryEntryDetail | null> {
  const entries = await scanAutoMemoryManifest(workspaceRoot);
  const entry = findMemoryManifestEntry(entries, query);
  if (!entry) {
    return null;
  }

  const absolutePath = path.join(getAutoMemoryDir(workspaceRoot), entry.relativePath);
  const rawContent = await fs.readFile(absolutePath, "utf8");
  const body = rawContent.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();

  return {
    ...entry,
    absolutePath,
    body,
  };
}

export function formatMemoryManifest(entries: MemoryManifestEntry[]): string {
  if (entries.length === 0) {
    return "";
  }

  return entries
    .map(entry => {
      const parts = [entry.relativePath, entry.type, entry.name].filter(Boolean);
      if (entry.description) {
        parts.push(entry.description);
      }
      return `- ${parts.join(" | ")}`;
    })
    .join("\n");
}

export async function saveAutoMemorySuggestions(
  workspaceRoot: string,
  suggestions: MemorySuggestion[],
): Promise<string[]> {
  const { memoryDir, entrypointPath } = await ensureAutoMemoryDir(workspaceRoot);
  const uniqueSuggestions = new Map<string, MemorySuggestion>();

  for (const suggestion of suggestions) {
    const relativePath = sanitizeMemorySlug(suggestion.slug, suggestion.name);
    if (relativePath.toLowerCase() === MEMORY_ENTRYPOINT_NAME.toLowerCase()) {
      continue;
    }
    uniqueSuggestions.set(relativePath, suggestion);
  }

  const currentEntrypoint = await fs.readFile(entrypointPath, "utf8").catch(() => `${MEMORY_INDEX_HEADER}\n`);
  const entrypointLines = normalizeEntrypointContent(currentEntrypoint).split(/\r?\n/);
  const bulletIndexByPath = new Map<string, number>();

  entrypointLines.forEach((line, index) => {
    const match = line.match(/^\s*-\s+\[[^\]]+\]\(([^)]+)\):\s+(.+)$/);
    if (!match) {
      return;
    }
    bulletIndexByPath.set(match[1].trim().toLowerCase(), index);
  });

  const savedPaths: string[] = [];

  for (const [relativePath, suggestion] of uniqueSuggestions) {
    const absolutePath = path.join(memoryDir, relativePath);
    const fileContent = [
      "---",
      `name: ${quoteFrontmatterValue(suggestion.name)}`,
      `description: ${quoteFrontmatterValue(suggestion.description)}`,
      `type: ${quoteFrontmatterValue(suggestion.type)}`,
      "---",
      "",
      suggestion.body.trim(),
      "",
    ].join("\n");

    await fs.writeFile(absolutePath, fileContent, "utf8");

    const entrypointLine = buildEntrypointLine(suggestion, relativePath);
    const existingIndex = bulletIndexByPath.get(relativePath.toLowerCase());
    if (existingIndex !== undefined) {
      entrypointLines[existingIndex] = entrypointLine;
    } else {
      if (entrypointLines.at(-1)?.trim()) {
        entrypointLines.push("");
      }
      entrypointLines.push(entrypointLine);
      bulletIndexByPath.set(relativePath.toLowerCase(), entrypointLines.length - 1);
    }

    savedPaths.push(absolutePath);
  }

  const finalEntrypoint = entrypointLines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
  await fs.writeFile(entrypointPath, `${finalEntrypoint}\n`, "utf8");

  return savedPaths;
}
