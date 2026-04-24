import { execFile } from "node:child_process";
import { type Dirent, promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_NESTED_GIT_SEARCH_DEPTH = 4;
const IGNORED_DESCENT_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "out",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".yarn",
  ".pnpm-store",
  "vendor",
]);

export type ResolvedWorkspaceRootKind =
  | "unset"
  | "missing"
  | "direct_git_root"
  | "inside_git_repo"
  | "nested_git_root"
  | "non_git_workspace"
  | "ambiguous_nested_git_roots";

export type ResolvedWorkspaceRoot = {
  selectedRoot: string;
  effectiveRoot: string;
  gitRoot: string | null;
  kind: ResolvedWorkspaceRootKind;
  detail?: string;
  candidates?: string[];
};

function normalizeWorkspacePath(root: string): string {
  return path.resolve(root.trim());
}

function toPathIdentity(root: string): string {
  const normalized = path.normalize(root);
  return process.platform === "win32"
    ? normalized.toLowerCase()
    : normalized;
}

function pathsEqual(left: string, right: string): boolean {
  return toPathIdentity(left) === toPathIdentity(right);
}

async function directoryExists(targetPath: string): Promise<boolean> {
  try {
    return (await fs.stat(targetPath)).isDirectory();
  } catch {
    return false;
  }
}

async function hasGitMetadata(targetPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path.join(targetPath, ".git"));
    return stat.isDirectory() || stat.isFile();
  } catch {
    return false;
  }
}

async function getContainingGitRoot(targetPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--show-toplevel"],
      {
        cwd: targetPath,
        timeout: 10_000,
        windowsHide: true,
      },
    );
    const root = stdout.trim();
    return root ? normalizeWorkspacePath(root) : null;
  } catch {
    return null;
  }
}

async function findNearestNestedGitRoots(root: string): Promise<string[] | null> {
  let currentLevel = [root];
  const seen = new Set<string>([toPathIdentity(root)]);

  for (let depth = 1; depth <= MAX_NESTED_GIT_SEARCH_DEPTH; depth += 1) {
    const candidates = new Set<string>();
    const nextLevel: string[] = [];

    for (const currentRoot of currentLevel) {
      let entries: Dirent[];
      try {
        entries = await fs.readdir(currentRoot, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }
        if (IGNORED_DESCENT_DIRECTORIES.has(entry.name)) {
          continue;
        }

        const childRoot = normalizeWorkspacePath(path.join(currentRoot, entry.name));
        const childIdentity = toPathIdentity(childRoot);
        if (seen.has(childIdentity)) {
          continue;
        }
        seen.add(childIdentity);

        if (await hasGitMetadata(childRoot)) {
          const gitRoot = await getContainingGitRoot(childRoot);
          if (gitRoot) {
            candidates.add(childRoot);
          }
          continue;
        }

        if (depth < MAX_NESTED_GIT_SEARCH_DEPTH) {
          nextLevel.push(childRoot);
        }
      }
    }

    if (candidates.size > 0) {
      return [...candidates].sort((left, right) => left.localeCompare(right));
    }

    currentLevel = nextLevel;
    if (currentLevel.length === 0) {
      break;
    }
  }

  return null;
}

export async function resolveWorkspaceRoot(
  root: string | undefined,
): Promise<ResolvedWorkspaceRoot> {
  const trimmedRoot = root?.trim() ?? "";
  if (!trimmedRoot) {
    return {
      selectedRoot: "",
      effectiveRoot: "",
      gitRoot: null,
      kind: "unset",
      detail: "No workspace folder is currently selected.",
    };
  }

  const selectedRoot = normalizeWorkspacePath(trimmedRoot);
  if (!(await directoryExists(selectedRoot))) {
    return {
      selectedRoot,
      effectiveRoot: selectedRoot,
      gitRoot: null,
      kind: "missing",
      detail:
        "The selected workspace folder is missing or inaccessible. Review and verification will run without git diff until you choose a valid repository folder.",
    };
  }

  const containingGitRoot = await getContainingGitRoot(selectedRoot);
  if (containingGitRoot) {
    if (pathsEqual(selectedRoot, containingGitRoot)) {
      return {
        selectedRoot,
        effectiveRoot: selectedRoot,
        gitRoot: selectedRoot,
        kind: "direct_git_root",
      };
    }

    return {
      selectedRoot,
      effectiveRoot: selectedRoot,
      gitRoot: containingGitRoot,
      kind: "inside_git_repo",
      detail: `Selected folder is inside git repository ${containingGitRoot}.`,
    };
  }

  const nestedGitRoots = await findNearestNestedGitRoots(selectedRoot);
  if (!nestedGitRoots || nestedGitRoots.length === 0) {
    return {
      selectedRoot,
      effectiveRoot: selectedRoot,
      gitRoot: null,
      kind: "non_git_workspace",
      detail:
        "The selected folder is not a git repository. Review and verification will run in degraded mode without git diff until you choose a repository folder.",
    };
  }

  if (nestedGitRoots.length === 1) {
    const nestedGitRoot = nestedGitRoots[0];
    return {
      selectedRoot,
      effectiveRoot: nestedGitRoot,
      gitRoot: nestedGitRoot,
      kind: "nested_git_root",
      detail: `Auto-resolved nested git repository ${nestedGitRoot}.`,
    };
  }

  return {
    selectedRoot,
    effectiveRoot: selectedRoot,
    gitRoot: null,
    kind: "ambiguous_nested_git_roots",
    detail:
      "The selected folder is not a git repository and contains multiple nested repository candidates. Review and verification will run in degraded mode until you choose one repository folder directly.",
    candidates: nestedGitRoots,
  };
}
