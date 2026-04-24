import { execFile } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type {
  ConversationWorktreeRuntime,
  ConversationWorktreeSession,
  EnterWorktreeInput,
  ExitWorktreeInput,
  ExitWorktreeResult,
  WorktreeChangeSummary,
} from "./types";

const execFileAsync = promisify(execFile);

const VALID_WORKTREE_SLUG_SEGMENT = /^[a-zA-Z0-9._-]+$/;
const MAX_WORKTREE_SLUG_LENGTH = 64;

type PersistedConversationWorktreeState = {
  version: 1;
  session: ConversationWorktreeSession | null;
};

type ConversationScope = {
  workspaceRoot: string;
  conversationKey: string;
};

type GitCommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type CreateOrResumeWorktreeResult = {
  worktreePath: string;
  worktreeBranch: string;
  headCommit: string;
  existed: boolean;
};

function buildWorkspaceScopeId(workspaceRoot: string): string {
  return createHash("sha1").update(workspaceRoot).digest("hex").slice(0, 16);
}

function sanitizeConversationKey(conversationKey: string): string {
  return conversationKey.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getConversationStateBasename(conversationKey: string): string {
  const sanitized = sanitizeConversationKey(conversationKey);

  if (sanitized.length > 0 && sanitized === conversationKey) {
    return sanitized;
  }

  const hash = createHash("sha1").update(conversationKey).digest("hex").slice(0, 8);
  return `${sanitized || "conversation"}-${hash}`;
}

function getScopeCacheKey(scope: ConversationScope): string {
  return `${buildWorkspaceScopeId(scope.workspaceRoot)}:${scope.conversationKey}`;
}

function cloneSession(
  session: ConversationWorktreeSession | null,
): ConversationWorktreeSession | null {
  if (!session) {
    return null;
  }

  return { ...session };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function trimPersistedString(value: string): string {
  return value.trim();
}

function normalizeOptionalPersistedString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = trimPersistedString(value);
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeState(
  value: Partial<PersistedConversationWorktreeState> | undefined,
): PersistedConversationWorktreeState {
  const rawSession = value?.session;

  if (!rawSession || typeof rawSession !== "object") {
    return {
      version: 1,
      session: null,
    };
  }

  if (
    !isNonEmptyString(rawSession.originalWorkspaceRoot) ||
    !isNonEmptyString(rawSession.gitRoot) ||
    !isNonEmptyString(rawSession.worktreePath) ||
    !isNonEmptyString(rawSession.worktreeName)
  ) {
    return {
      version: 1,
      session: null,
    };
  }

  const originalWorkspaceRoot = trimPersistedString(rawSession.originalWorkspaceRoot);
  const gitRoot = trimPersistedString(rawSession.gitRoot);
  const worktreePath = trimPersistedString(rawSession.worktreePath);
  const worktreeName = trimPersistedString(rawSession.worktreeName);
  const originalBranch = normalizeOptionalPersistedString(rawSession.originalBranch);
  const originalHeadCommit = normalizeOptionalPersistedString(rawSession.originalHeadCommit);

  try {
    validateWorktreeSlug(worktreeName);
  } catch {
    return {
      version: 1,
      session: null,
    };
  }

  const worktreeBranch = worktreeBranchName(worktreeName);

  return {
    version: 1,
    session: {
      originalWorkspaceRoot,
      gitRoot,
      worktreePath,
      worktreeName,
      ...(worktreeBranch ? { worktreeBranch } : {}),
      ...(originalBranch ? { originalBranch } : {}),
      ...(originalHeadCommit ? { originalHeadCommit } : {}),
      createdAt:
        typeof rawSession.createdAt === "number" && Number.isFinite(rawSession.createdAt)
          ? rawSession.createdAt
          : Date.now(),
    },
  };
}

function formatGitError(message: string, result: GitCommandResult): string {
  const details = result.stderr.trim() || result.stdout.trim();
  return details ? `${message}: ${details}` : message;
}

export function worktreesDir(repoRoot: string): string {
  return path.join(repoRoot, ".claude", "worktrees");
}

export function flattenSlug(slug: string): string {
  return slug.replaceAll("/", "+");
}

export function worktreePathFor(repoRoot: string, slug: string): string {
  return path.join(worktreesDir(repoRoot), flattenSlug(slug));
}

export function generateWorktreeSlug(): string {
  return `wt-${randomBytes(3).toString("hex")}`;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function runGit(
  cwd: string,
  args: string[],
): Promise<GitCommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(
      "git",
      ["-C", cwd, ...args],
      {
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    return {
      code: 0,
      stdout: String(stdout ?? ""),
      stderr: String(stderr ?? ""),
    };
  } catch (error) {
    const err = error as Partial<{
      code: number | string;
      stdout: string | Buffer;
      stderr: string | Buffer;
      message: string;
    }>;
    return {
      code: typeof err.code === "number" ? err.code : 1,
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? err.message ?? ""),
    };
  }
}

async function resolveGitOutput(
  cwd: string,
  args: string[],
  failureMessage: string,
): Promise<string> {
  const result = await runGit(cwd, args);
  if (result.code !== 0) {
    throw new Error(formatGitError(failureMessage, result));
  }
  return result.stdout.trim();
}

async function findCanonicalGitRoot(startPath: string): Promise<string | null> {
  const commonDirResult = await runGit(startPath, [
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);

  if (commonDirResult.code === 0) {
    const commonDir = commonDirResult.stdout.trim();
    if (commonDir) {
      return path.dirname(commonDir);
    }
  }

  const toplevelResult = await runGit(startPath, ["rev-parse", "--show-toplevel"]);
  if (toplevelResult.code === 0) {
    const root = toplevelResult.stdout.trim();
    return root || null;
  }

  return null;
}

async function getCurrentBranch(startPath: string): Promise<string | undefined> {
  const result = await runGit(startPath, ["branch", "--show-current"]);
  const branch = result.stdout.trim();
  return result.code === 0 && branch ? branch : undefined;
}

async function resolvePreferredBaseRef(repoRoot: string): Promise<string> {
  const remoteHead = await runGit(repoRoot, [
    "symbolic-ref",
    "refs/remotes/origin/HEAD",
    "--short",
  ]);

  const remoteRef = remoteHead.stdout.trim();
  if (remoteHead.code === 0 && remoteRef) {
    return remoteRef;
  }

  return "HEAD";
}

async function getExistingWorktreeHead(worktreePath: string): Promise<string | null> {
  if (!(await pathExists(worktreePath))) {
    return null;
  }

  const result = await runGit(worktreePath, ["rev-parse", "HEAD"]);
  if (result.code !== 0) {
    return null;
  }

  const head = result.stdout.trim();
  return head || null;
}

async function createOrResumeGitWorktree(
  repoRoot: string,
  slug: string,
): Promise<CreateOrResumeWorktreeResult> {
  const worktreePath = worktreePathFor(repoRoot, slug);
  const worktreeBranch = worktreeBranchName(slug);
  const existingHead = await getExistingWorktreeHead(worktreePath);

  if (existingHead) {
    return {
      worktreePath,
      worktreeBranch,
      headCommit: existingHead,
      existed: true,
    };
  }

  await fs.mkdir(worktreesDir(repoRoot), { recursive: true });

  const baseRef = await resolvePreferredBaseRef(repoRoot);
  const baseHeadCommit = await resolveGitOutput(
    repoRoot,
    ["rev-parse", baseRef],
    `Failed to resolve worktree base ref "${baseRef}"`,
  );

  const addResult = await runGit(repoRoot, [
    "worktree",
    "add",
    "-B",
    worktreeBranch,
    worktreePath,
    baseRef,
  ]);

  if (addResult.code !== 0) {
    throw new Error(formatGitError("Failed to create worktree", addResult));
  }

  return {
    worktreePath,
    worktreeBranch,
    headCommit: baseHeadCommit,
    existed: false,
  };
}

async function countWorktreeChanges(
  worktreePath: string,
  originalHeadCommit: string | undefined,
): Promise<WorktreeChangeSummary | null> {
  const statusResult = await runGit(worktreePath, ["status", "--porcelain"]);
  if (statusResult.code !== 0) {
    return null;
  }

  const changedFiles = statusResult.stdout
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0).length;

  if (!originalHeadCommit) {
    return null;
  }

  const commitResult = await runGit(worktreePath, [
    "rev-list",
    "--count",
    `${originalHeadCommit}..HEAD`,
  ]);
  if (commitResult.code !== 0) {
    return null;
  }

  return {
    changedFiles,
    commits: Number.parseInt(commitResult.stdout.trim(), 10) || 0,
  };
}

async function removeGitWorktree(
  session: ConversationWorktreeSession,
): Promise<void> {
  const removeResult = await runGit(session.gitRoot, [
    "worktree",
    "remove",
    "--force",
    session.worktreePath,
  ]);
  if (removeResult.code !== 0) {
    throw new Error(formatGitError("Failed to remove worktree", removeResult));
  }

  if (!session.worktreeBranch) {
    return;
  }

  const deleteBranchResult = await runGit(session.gitRoot, [
    "branch",
    "-D",
    session.worktreeBranch,
  ]);
  const deleteError = deleteBranchResult.stderr.trim().toLowerCase();

  if (
    deleteBranchResult.code !== 0 &&
    !deleteError.includes("not found") &&
    !deleteError.includes("unknown revision")
  ) {
    throw new Error(
      formatGitError("Worktree directory was removed but deleting the branch failed", deleteBranchResult),
    );
  }
}

function buildKeepMessage(session: ConversationWorktreeSession): string {
  const branchInfo = session.worktreeBranch
    ? ` on branch ${session.worktreeBranch}`
    : "";
  return `Exited worktree. Your work is preserved at ${session.worktreePath}${branchInfo}. Session is now back in ${session.originalWorkspaceRoot}.`;
}

function buildRemoveMessage(
  session: ConversationWorktreeSession,
  changes: WorktreeChangeSummary,
): string {
  const discarded: string[] = [];

  if (changes.commits > 0) {
    discarded.push(`${changes.commits} ${changes.commits === 1 ? "commit" : "commits"}`);
  }
  if (changes.changedFiles > 0) {
    discarded.push(
      `${changes.changedFiles} uncommitted ${changes.changedFiles === 1 ? "file" : "files"}`,
    );
  }

  const discardMessage =
    discarded.length > 0 ? ` Discarded ${discarded.join(" and ")}.` : "";

  return `Exited and removed worktree at ${session.worktreePath}.${discardMessage} Session is now back in ${session.originalWorkspaceRoot}.`;
}

export function validateWorktreeSlug(slug: string): void {
  if (slug.length > MAX_WORKTREE_SLUG_LENGTH) {
    throw new Error(
      `Invalid worktree name: must be ${MAX_WORKTREE_SLUG_LENGTH} characters or fewer (got ${slug.length})`,
    );
  }

  for (const segment of slug.split("/")) {
    if (segment === "." || segment === "..") {
      throw new Error(
        `Invalid worktree name "${slug}": must not contain "." or ".." path segments`,
      );
    }

    if (!VALID_WORKTREE_SLUG_SEGMENT.test(segment)) {
      throw new Error(
        `Invalid worktree name "${slug}": each "/"-separated segment must be non-empty and contain only letters, digits, dots, underscores, and dashes`,
      );
    }
  }
}

export function worktreeBranchName(slug: string): string {
  return `worktree-${flattenSlug(slug)}`;
}

export class PersistentWorktreeRuntimeStore {
  private readonly scopeCache = new Map<string, PersistedConversationWorktreeState>();
  private readonly scopeLocks = new Map<string, Promise<unknown>>();

  constructor(private readonly storageRoot: string) {}

  async hydrateConversation(
    workspaceRoot: string,
    conversationKey: string,
  ): Promise<void> {
    const scope: ConversationScope = { workspaceRoot, conversationKey };
    await this.readState(scope);
  }

  getConversationRuntime(
    workspaceRoot: string,
    conversationKey: string,
  ): ConversationWorktreeRuntime {
    const scope: ConversationScope = { workspaceRoot, conversationKey };

    return {
      ensureHydrated: () => this.hydrateConversation(workspaceRoot, conversationKey),
      getSession: () => cloneSession(this.getCachedSession(scope)),
      getEffectiveWorkspaceRoot: () =>
        this.getCachedSession(scope)?.worktreePath ?? workspaceRoot,
      enterWorktree: input => this.enterWorktree(scope, input),
      exitWorktree: input => this.exitWorktree(scope, input),
    };
  }

  private getCachedSession(scope: ConversationScope): ConversationWorktreeSession | null {
    return this.scopeCache.get(getScopeCacheKey(scope))?.session ?? null;
  }

  private async enterWorktree(
    scope: ConversationScope,
    input: EnterWorktreeInput,
  ): Promise<ConversationWorktreeSession> {
    return this.withScopeLock(scope, async () => {
      const state = await this.loadState(scope);
      if (state.session) {
        throw new Error("Already in a worktree session.");
      }

      const slug = input.name?.trim() || generateWorktreeSlug();
      validateWorktreeSlug(slug);

      const gitRoot = await findCanonicalGitRoot(scope.workspaceRoot);
      if (!gitRoot) {
        throw new Error("EnterWorktree requires a git repository.");
      }

      const originalBranch = await getCurrentBranch(scope.workspaceRoot);
      const created = await createOrResumeGitWorktree(gitRoot, slug);
      const session: ConversationWorktreeSession = {
        originalWorkspaceRoot: scope.workspaceRoot,
        gitRoot,
        worktreePath: created.worktreePath,
        worktreeName: slug,
        worktreeBranch: created.worktreeBranch,
        originalBranch,
        originalHeadCommit: created.headCommit,
        createdAt: Date.now(),
      };

      state.session = session;
      await this.saveState(scope, state);
      return { ...session };
    });
  }

  private async exitWorktree(
    scope: ConversationScope,
    input: ExitWorktreeInput,
  ): Promise<ExitWorktreeResult> {
    return this.withScopeLock(scope, async () => {
      const state = await this.loadState(scope);
      const session = state.session;

      if (!session) {
        return {
          action: input.action,
          originalWorkspaceRoot: scope.workspaceRoot,
          worktreePath: scope.workspaceRoot,
          message:
            "No-op: there is no active EnterWorktree session to exit. This tool only operates on worktrees created by EnterWorktree in the current conversation.",
        };
      }

      if (input.action === "keep") {
        state.session = null;
        await this.saveState(scope, state);

        return {
          action: "keep",
          originalWorkspaceRoot: session.originalWorkspaceRoot,
          worktreePath: session.worktreePath,
          worktreeBranch: session.worktreeBranch,
          message: buildKeepMessage(session),
        };
      }

      const changeSummary = await countWorktreeChanges(
        session.worktreePath,
        session.originalHeadCommit,
      );

      if (!input.discardChanges) {
        if (changeSummary === null) {
          throw new Error(
            `Could not verify worktree state at ${session.worktreePath}. Refusing to remove without explicit confirmation. Re-run ExitWorktree with discard_changes: true or use action: "keep".`,
          );
        }

        if (changeSummary.changedFiles > 0 || changeSummary.commits > 0) {
          const parts: string[] = [];

          if (changeSummary.changedFiles > 0) {
            parts.push(
              `${changeSummary.changedFiles} uncommitted ${changeSummary.changedFiles === 1 ? "file" : "files"}`,
            );
          }
          if (changeSummary.commits > 0) {
            parts.push(
              `${changeSummary.commits} ${changeSummary.commits === 1 ? "commit" : "commits"} on ${session.worktreeBranch ?? "the worktree branch"}`,
            );
          }

          throw new Error(
            `Worktree has ${parts.join(" and ")}. Removing it will discard this work permanently. Confirm with the user and re-run ExitWorktree with discard_changes: true, or use action: "keep".`,
          );
        }
      }

      const finalSummary = changeSummary ?? { changedFiles: 0, commits: 0 };
      await removeGitWorktree(session);

      state.session = null;
      await this.saveState(scope, state);

      return {
        action: "remove",
        originalWorkspaceRoot: session.originalWorkspaceRoot,
        worktreePath: session.worktreePath,
        worktreeBranch: session.worktreeBranch,
        discardedFiles: finalSummary.changedFiles,
        discardedCommits: finalSummary.commits,
        message: buildRemoveMessage(session, finalSummary),
      };
    });
  }

  private async withScopeLock<T>(
    scope: ConversationScope,
    operation: () => Promise<T>,
  ): Promise<T> {
    const scopeKey = getScopeCacheKey(scope);
    const previous = this.scopeLocks.get(scopeKey) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(operation);

    this.scopeLocks.set(scopeKey, run.catch(() => undefined));
    return run;
  }

  private async readState(
    scope: ConversationScope,
  ): Promise<PersistedConversationWorktreeState> {
    const scopeKey = getScopeCacheKey(scope);
    const pending = this.scopeLocks.get(scopeKey);
    if (pending) {
      await pending.catch(() => undefined);
    }
    return this.loadState(scope);
  }

  private async loadState(
    scope: ConversationScope,
  ): Promise<PersistedConversationWorktreeState> {
    const scopeKey = getScopeCacheKey(scope);
    const cached = this.scopeCache.get(scopeKey);
    if (cached) {
      return cached;
    }

    const filePath = this.getScopeFilePath(scope);
    const legacyFilePath = this.getLegacyScopeFilePath(scope);
    let sourceFilePath: string | undefined;

    try {
      let parsed: Partial<PersistedConversationWorktreeState> | undefined;
      let loadedLegacyState = false;

      try {
        const raw = await fs.readFile(filePath, "utf8");
        sourceFilePath = filePath;
        parsed = JSON.parse(raw) as Partial<PersistedConversationWorktreeState>;
      } catch (error) {
        const readError = error as NodeJS.ErrnoException;
        if (readError.code !== "ENOENT" || legacyFilePath === filePath) {
          throw error;
        }

        const raw = await fs.readFile(legacyFilePath, "utf8");
        sourceFilePath = legacyFilePath;
        parsed = JSON.parse(raw) as Partial<PersistedConversationWorktreeState>;
        loadedLegacyState = true;
      }

      const normalized = normalizeState(parsed);

      if (
        normalized.session &&
        !(await pathExists(normalized.session.worktreePath))
      ) {
        normalized.session = null;
      }

      this.scopeCache.set(scopeKey, normalized);

      if (loadedLegacyState || JSON.stringify(parsed) !== JSON.stringify(normalized)) {
        await this.saveState(scope, normalized);
      }

      return normalized;
    } catch (error) {
      const emptyState = normalizeState(undefined);
      this.scopeCache.set(scopeKey, emptyState);

      const readError = error as NodeJS.ErrnoException;
      if (sourceFilePath && readError.code !== "ENOENT") {
        try {
          await this.saveState(scope, emptyState);
        } catch {
          // Keep runtime recovery best-effort when the persisted state cannot be repaired.
        }
      }

      return emptyState;
    }
  }

  private async saveState(
    scope: ConversationScope,
    state: PersistedConversationWorktreeState,
  ): Promise<void> {
    const scopeKey = getScopeCacheKey(scope);
    const filePath = this.getScopeFilePath(scope);
    this.scopeCache.set(scopeKey, state);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
  }

  private getScopeFilePath(scope: ConversationScope): string {
    return path.join(
      this.storageRoot,
      "worktree-runtime",
      buildWorkspaceScopeId(scope.workspaceRoot),
      `${getConversationStateBasename(scope.conversationKey)}.json`,
    );
  }

  private getLegacyScopeFilePath(scope: ConversationScope): string {
    return path.join(
      this.storageRoot,
      "worktree-runtime",
      buildWorkspaceScopeId(scope.workspaceRoot),
      `${sanitizeConversationKey(scope.conversationKey)}.json`,
    );
  }
}
