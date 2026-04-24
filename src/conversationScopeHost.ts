import type { BackgroundTaskRecord, ConversationTaskRuntime } from "./tasks/types";
import type { ConversationWorktreeRuntime } from "./worktree/types";

type TaskRuntimeStoreLike = {
  getConversationRuntime: (
    workspaceRoot: string,
    conversationKey: string,
  ) => ConversationTaskRuntime;
};

type WorktreeRuntimeStoreLike = {
  getConversationRuntime: (
    workspaceRoot: string,
    conversationKey: string,
  ) => ConversationWorktreeRuntime;
  hydrateConversation: (
    workspaceRoot: string,
    conversationKey: string,
  ) => Promise<void>;
};

export type ConversationScopeBindings = {
  getConversationTaskRuntime: (workspaceRoot: string) => ConversationTaskRuntime;
  getConversationWorktreeRuntime: (workspaceRoot: string) => ConversationWorktreeRuntime;
  ensureConversationWorktreeHydrated: (workspaceRoot: string) => Promise<void>;
  getEffectiveWorkspaceRoot: (workspaceRoot: string) => string;
  findActiveBuiltInAgentTask: (
    workspaceRoot: string,
    agentType: string,
    diffRef?: string,
  ) => Promise<BackgroundTaskRecord | undefined>;
};

export function getConversationTaskRuntime(options: {
  taskRuntimeStore: TaskRuntimeStoreLike;
  workspaceRoot: string;
  conversationKey: string;
}): ConversationTaskRuntime {
  return options.taskRuntimeStore.getConversationRuntime(
    options.workspaceRoot,
    options.conversationKey,
  );
}

export function getConversationWorktreeRuntime(options: {
  worktreeRuntimeStore: WorktreeRuntimeStoreLike;
  workspaceRoot: string;
  conversationKey: string;
}): ConversationWorktreeRuntime {
  return options.worktreeRuntimeStore.getConversationRuntime(
    options.workspaceRoot,
    options.conversationKey,
  );
}

export async function ensureConversationWorktreeHydrated(options: {
  worktreeRuntimeStore: WorktreeRuntimeStoreLike;
  workspaceRoot: string;
  conversationKey: string;
}): Promise<void> {
  await options.worktreeRuntimeStore.hydrateConversation(
    options.workspaceRoot,
    options.conversationKey,
  );
}

export function getEffectiveWorkspaceRoot(options: {
  worktreeRuntimeStore: WorktreeRuntimeStoreLike;
  workspaceRoot: string;
  conversationKey: string;
}): string {
  return getConversationWorktreeRuntime(options).getEffectiveWorkspaceRoot();
}

export async function findActiveBuiltInAgentTask(options: {
  taskRuntimeStore: TaskRuntimeStoreLike;
  workspaceRoot: string;
  conversationKey: string;
  agentType: string;
  diffRef?: string;
}): Promise<BackgroundTaskRecord | undefined> {
  const tasks = await getConversationTaskRuntime(options).listBackgroundTasks();
  return tasks.find(
    task =>
      task.taskType === "built_in_agent" &&
      task.agentType === options.agentType &&
      (task.status === "pending" || task.status === "running") &&
      (typeof task.metadata?.diffRef === "string" ? task.metadata.diffRef : undefined) ===
        options.diffRef,
  );
}

export function createConversationScopeBindings(options: {
  taskRuntimeStore: TaskRuntimeStoreLike;
  worktreeRuntimeStore: WorktreeRuntimeStoreLike;
  getConversationKey: () => string;
}): ConversationScopeBindings {
  return {
    getConversationTaskRuntime: workspaceRoot =>
      getConversationTaskRuntime({
        taskRuntimeStore: options.taskRuntimeStore,
        workspaceRoot,
        conversationKey: options.getConversationKey(),
      }),
    getConversationWorktreeRuntime: workspaceRoot =>
      getConversationWorktreeRuntime({
        worktreeRuntimeStore: options.worktreeRuntimeStore,
        workspaceRoot,
        conversationKey: options.getConversationKey(),
      }),
    ensureConversationWorktreeHydrated: workspaceRoot =>
      ensureConversationWorktreeHydrated({
        worktreeRuntimeStore: options.worktreeRuntimeStore,
        workspaceRoot,
        conversationKey: options.getConversationKey(),
      }),
    getEffectiveWorkspaceRoot: workspaceRoot =>
      getEffectiveWorkspaceRoot({
        worktreeRuntimeStore: options.worktreeRuntimeStore,
        workspaceRoot,
        conversationKey: options.getConversationKey(),
      }),
    findActiveBuiltInAgentTask: (workspaceRoot, agentType, diffRef) =>
      findActiveBuiltInAgentTask({
        taskRuntimeStore: options.taskRuntimeStore,
        workspaceRoot,
        conversationKey: options.getConversationKey(),
        agentType,
        diffRef,
      }),
  };
}
