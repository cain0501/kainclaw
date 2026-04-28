import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

function normalizeFsPath(value: string): string {
  const normalized = path.resolve(value);
  return process.platform === "win32"
    ? normalized.replace(/\//g, "\\").toLowerCase()
    : normalized.replace(/\\/g, "/");
}

export function getInstalledSkillCompatStateDir(): string {
  const configured = process.env.CLAUDE_PLUGIN_DATA?.trim();
  if (configured) {
    return path.resolve(configured);
  }

  return path.join(os.homedir(), ".gstack");
}

export function getFreezeStateFilePath(): string {
  return path.join(getInstalledSkillCompatStateDir(), "freeze-dir.txt");
}

export async function readFreezeBoundary(): Promise<string | null> {
  try {
    const content = await fs.readFile(getFreezeStateFilePath(), "utf8");
    const trimmed = content.trim();
    return trimmed ? trimmed : null;
  } catch {
    return null;
  }
}

export async function writeFreezeBoundary(boundaryPath: string): Promise<string> {
  const normalized = ensureTrailingSeparator(normalizeFsPath(boundaryPath));
  await fs.mkdir(getInstalledSkillCompatStateDir(), { recursive: true });
  await fs.writeFile(getFreezeStateFilePath(), normalized, "utf8");
  return normalized;
}

export async function clearFreezeBoundary(): Promise<void> {
  await fs.rm(getFreezeStateFilePath(), { force: true });
}

export function resolveFreezeBoundaryPath(
  workspaceRoot: string,
  rawPath: string,
): string {
  const trimmed = rawPath.trim().replace(/^"(.*)"$|^'(.*)'$/u, "$1$2");
  if (!trimmed) {
    throw new Error("Freeze directory path is required.");
  }

  const resolved = path.isAbsolute(trimmed)
    ? path.resolve(trimmed)
    : path.resolve(workspaceRoot, trimmed);
  return ensureTrailingSeparator(normalizeFsPath(resolved));
}

export function ensureTrailingSeparator(value: string): string {
  const separator = process.platform === "win32" ? "\\" : "/";
  return value.endsWith(separator) ? value : `${value}${separator}`;
}

export function isPathWithinFreezeBoundary(
  filePath: string,
  boundaryPath: string,
): boolean {
  const normalizedFilePath = normalizeFsPath(filePath);
  const normalizedBoundary = ensureTrailingSeparator(normalizeFsPath(boundaryPath));
  return normalizedFilePath === normalizedBoundary.slice(0, -1) ||
    normalizedFilePath.startsWith(normalizedBoundary);
}

export async function validateFreezeBoundaryPath(boundaryPath: string): Promise<void> {
  const stats = await fs.stat(boundaryPath);
  if (!stats.isDirectory()) {
    throw new Error(`Freeze boundary must be a directory: ${boundaryPath}`);
  }
}
