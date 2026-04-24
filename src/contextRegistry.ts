import { promises as fs } from "node:fs";
import path from "node:path";

type ContextConfig = {
  extraDirectories: string[];
  pinnedFiles: string[];
};

const DIRECTORY_SKIP_SET = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".next",
  ".turbo",
  ".cain",
]);

const FILE_SCAN_LIMIT = 2_000;

export function getContextConfigPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".cain", "context.json");
}

export function buildContextSystemPrompt(
  baseSystemPrompt: string,
  options: {
    workspaceRoot: string;
    extraDirectories: string[];
    pinnedFiles?: string[];
  },
): string {
  const pinnedFiles = options.pinnedFiles ?? [];
  if (options.extraDirectories.length === 0 && pinnedFiles.length === 0) {
    return baseSystemPrompt;
  }

  const contextInstructions = [
    "# Context Directories",
    "The user has explicitly added extra workspace directories to keep in active context.",
    `Context config: \`${getContextConfigPath(options.workspaceRoot)}\``,
    "Treat these directories as higher-priority context when you explore, search, and decide which files to inspect first.",
    "Tracked directories:",
    ...options.extraDirectories.map(directory => `- ${directory}`),
    ...(pinnedFiles.length > 0
      ? ["", "Pinned files:", ...pinnedFiles.map(file => `- ${file}`)]
      : []),
  ].join("\n");

  return `${baseSystemPrompt}\n\n${contextInstructions}`;
}

function normalizeRelativeDirectory(workspaceRoot: string, targetPath: string): string {
  const absolutePath = path.resolve(workspaceRoot, targetPath);
  const relativePath = path.relative(workspaceRoot, absolutePath);

  if (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Context directory must stay inside the workspace: ${targetPath}`);
  }

  return relativePath.replace(/\\/g, "/");
}

function normalizeContextConfig(value: unknown): ContextConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { extraDirectories: [], pinnedFiles: [] };
  }

  const record = value as Record<string, unknown>;
  const extraDirectories = Array.isArray(record.extraDirectories)
    ? record.extraDirectories
        .filter((item): item is string => typeof item === "string" && item.trim() !== "")
        .map(item => item.trim().replace(/\\/g, "/"))
        .filter((item, index, items) => items.indexOf(item) === index)
        .sort((left, right) => left.localeCompare(right))
    : [];
  const pinnedFiles = Array.isArray(record.pinnedFiles)
    ? record.pinnedFiles
        .filter((item): item is string => typeof item === "string" && item.trim() !== "")
        .map(item => item.trim().replace(/\\/g, "/"))
        .filter((item, index, items) => items.indexOf(item) === index)
        .sort((left, right) => left.localeCompare(right))
    : [];

  return { extraDirectories, pinnedFiles };
}

export async function loadContextConfig(workspaceRoot: string): Promise<ContextConfig> {
  const configPath = getContextConfigPath(workspaceRoot);
  try {
    const raw = await fs.readFile(configPath, "utf8");
    return normalizeContextConfig(JSON.parse(raw));
  } catch {
    return { extraDirectories: [], pinnedFiles: [] };
  }
}

async function saveContextConfig(
  workspaceRoot: string,
  config: ContextConfig,
): Promise<void> {
  const configPath = getContextConfigPath(workspaceRoot);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
}

export async function addContextDirectory(
  workspaceRoot: string,
  targetPath: string,
): Promise<{ added: boolean; relativePath: string; extraDirectories: string[] }> {
  const relativePath = normalizeRelativeDirectory(workspaceRoot, targetPath);
  const absolutePath = path.join(workspaceRoot, relativePath);
  const stat = await fs.stat(absolutePath).catch(() => undefined);

  if (!stat?.isDirectory()) {
    throw new Error(`Context directory does not exist: ${targetPath}`);
  }

  const currentConfig = await loadContextConfig(workspaceRoot);
  const alreadyPresent = currentConfig.extraDirectories.includes(relativePath);
  const nextConfig = alreadyPresent
    ? currentConfig
    : {
        ...currentConfig,
        extraDirectories: [...currentConfig.extraDirectories, relativePath].sort((left, right) =>
          left.localeCompare(right),
        ),
      };

  if (!alreadyPresent) {
    await saveContextConfig(workspaceRoot, nextConfig);
  }

  return {
    added: !alreadyPresent,
    relativePath,
    extraDirectories: nextConfig.extraDirectories,
  };
}

function normalizeRelativeFile(workspaceRoot: string, targetPath: string): string {
  const absolutePath = path.resolve(workspaceRoot, targetPath);
  const relativePath = path.relative(workspaceRoot, absolutePath);

  if (
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`Context file must stay inside the workspace: ${targetPath}`);
  }

  return relativePath.replace(/\\/g, "/");
}

export async function addContextFile(
  workspaceRoot: string,
  targetPath: string,
): Promise<{ added: boolean; relativePath: string; pinnedFiles: string[] }> {
  const relativePath = normalizeRelativeFile(workspaceRoot, targetPath);
  const absolutePath = path.join(workspaceRoot, relativePath);
  const stat = await fs.stat(absolutePath).catch(() => undefined);

  if (!stat?.isFile()) {
    throw new Error(`Context file does not exist: ${targetPath}`);
  }

  const currentConfig = await loadContextConfig(workspaceRoot);
  const alreadyPresent = currentConfig.pinnedFiles.includes(relativePath);
  const nextConfig = alreadyPresent
    ? currentConfig
    : {
        ...currentConfig,
        pinnedFiles: [...currentConfig.pinnedFiles, relativePath].sort((left, right) =>
          left.localeCompare(right),
        ),
      };

  if (!alreadyPresent) {
    await saveContextConfig(workspaceRoot, nextConfig);
  }

  return {
    added: !alreadyPresent,
    relativePath,
    pinnedFiles: nextConfig.pinnedFiles,
  };
}

export async function removeContextFile(
  workspaceRoot: string,
  targetPath: string,
): Promise<{ removed: boolean; relativePath: string; pinnedFiles: string[] }> {
  const relativePath = normalizeRelativeFile(workspaceRoot, targetPath);
  const currentConfig = await loadContextConfig(workspaceRoot);
  const nextPinnedFiles = currentConfig.pinnedFiles.filter(file => file !== relativePath);
  const removed = nextPinnedFiles.length !== currentConfig.pinnedFiles.length;

  if (removed) {
    await saveContextConfig(workspaceRoot, {
      ...currentConfig,
      pinnedFiles: nextPinnedFiles,
    });
  }

  return {
    removed,
    relativePath,
    pinnedFiles: removed ? nextPinnedFiles : currentConfig.pinnedFiles,
  };
}

async function walkFiles(
  rootPath: string,
  currentPath = rootPath,
  state: { count: number } = { count: 0 },
): Promise<string[]> {
  const entries = (await fs.readdir(currentPath, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const filePaths: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory() && DIRECTORY_SKIP_SET.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      filePaths.push(...(await walkFiles(rootPath, fullPath, state)));
      if (state.count >= FILE_SCAN_LIMIT) {
        break;
      }
      continue;
    }

    filePaths.push(fullPath);
    state.count += 1;
    if (state.count >= FILE_SCAN_LIMIT) {
      break;
    }
  }

  return filePaths;
}

export async function listContextFiles(options: {
  workspaceRoot: string;
  query?: string;
  maxResults?: number;
}): Promise<{
  files: string[];
  truncated: boolean;
  scannedDirectories: string[];
  pinnedFiles: string[];
}> {
  const contextConfig = await loadContextConfig(options.workspaceRoot);
  const scannedDirectories = ["."].concat(contextConfig.extraDirectories);
  const allFiles = await walkFiles(options.workspaceRoot);
  const normalizedQuery = options.query?.trim().toLowerCase() ?? "";
  const maxResults =
    typeof options.maxResults === "number" && Number.isFinite(options.maxResults)
      ? Math.max(1, Math.floor(options.maxResults))
      : 50;

  const matchingFiles = allFiles
    .map(filePath => path.relative(options.workspaceRoot, filePath).replace(/\\/g, "/"))
    .filter(relativePath =>
      !normalizedQuery || relativePath.toLowerCase().includes(normalizedQuery),
    )
    .sort((left, right) => left.localeCompare(right));

  return {
    files: matchingFiles.slice(0, maxResults),
    truncated: matchingFiles.length > maxResults,
    scannedDirectories,
    pinnedFiles: contextConfig.pinnedFiles,
  };
}
