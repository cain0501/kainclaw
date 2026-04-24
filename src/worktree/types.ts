export type ConversationWorktreeSession = {
  originalWorkspaceRoot: string;
  gitRoot: string;
  worktreePath: string;
  worktreeName: string;
  worktreeBranch?: string;
  originalBranch?: string;
  originalHeadCommit?: string;
  createdAt: number;
};

export type WorktreeAction = "keep" | "remove";

export type WorktreeChangeSummary = {
  changedFiles: number;
  commits: number;
};

export type EnterWorktreeInput = {
  name?: string;
};

export type ExitWorktreeInput = {
  action: WorktreeAction;
  discardChanges?: boolean;
};

export type ExitWorktreeResult = {
  action: WorktreeAction;
  originalWorkspaceRoot: string;
  worktreePath: string;
  worktreeBranch?: string;
  discardedFiles?: number;
  discardedCommits?: number;
  message: string;
};

export type ConversationWorktreeRuntime = {
  ensureHydrated(): Promise<void>;
  getSession(): ConversationWorktreeSession | null;
  getEffectiveWorkspaceRoot(): string;
  enterWorktree(input: EnterWorktreeInput): Promise<ConversationWorktreeSession>;
  exitWorktree(input: ExitWorktreeInput): Promise<ExitWorktreeResult>;
};
