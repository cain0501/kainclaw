import { type Dirent, promises as fs } from "node:fs";
import path from "node:path";

const PROJECT_EVIDENCE_FILE_NAMES = new Set([
  "readme",
  "readme.md",
  "claude.md",
  "package.json",
  "pyproject.toml",
  "makefile",
  "cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "tsconfig.json",
  "electron-builder.yml",
  "electron-builder.yaml",
]);

const PROJECT_EVIDENCE_DIRECTORY_NAMES = new Set([
  "src",
  "electron",
  "app",
  "apps",
  "packages",
  "vscode-extension",
]);

const IGNORED_CHILD_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "out",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".yarn",
]);

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function hasProjectEvidenceEntry(entry: Dirent): boolean {
  const normalizedName = normalizeName(entry.name);

  if (entry.isFile()) {
    return (
      PROJECT_EVIDENCE_FILE_NAMES.has(normalizedName) ||
      /\.(sln|csproj|fsproj|vbproj)$/i.test(entry.name)
    );
  }

  if (entry.isDirectory()) {
    return PROJECT_EVIDENCE_DIRECTORY_NAMES.has(normalizedName);
  }

  return false;
}

export async function hasWorkspaceProjectEvidence(workspaceRoot: string): Promise<boolean> {
  const trimmedRoot = workspaceRoot.trim();
  if (!trimmedRoot) {
    return false;
  }

  let rootEntries: Dirent[];
  try {
    rootEntries = await fs.readdir(trimmedRoot, { withFileTypes: true });
  } catch {
    return false;
  }

  if (rootEntries.some(entry => hasProjectEvidenceEntry(entry))) {
    return true;
  }

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) {
      continue;
    }

    if (IGNORED_CHILD_DIRECTORIES.has(normalizeName(entry.name))) {
      continue;
    }

    const childPath = path.join(trimmedRoot, entry.name);
    let childEntries: Dirent[];
    try {
      childEntries = await fs.readdir(childPath, { withFileTypes: true });
    } catch {
      continue;
    }

    if (childEntries.some(childEntry => hasProjectEvidenceEntry(childEntry))) {
      return true;
    }
  }

  return false;
}
