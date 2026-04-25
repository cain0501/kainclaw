import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  parseDetachedBackgroundTaskMetadata,
  parseDetachedBackgroundTaskState,
} from "../detachedBackgroundTask";
import { VERIFICATION_AGENT_TYPE } from "../agent/constants";
import type {
  BackgroundTaskStatus,
  BackgroundTaskRecord,
  BackgroundTaskType,
  ConversationTaskRuntime,
  CreateTaskInput,
  TaskRecord,
  TaskStatus,
  UpdateTaskInput,
} from "./types";

type PersistedConversationTaskState = {
  version: 1;
  nextTaskId: number;
  tasks: TaskRecord[];
  backgroundTasks: BackgroundTaskRecord[];
};

type ConversationScope = {
  workspaceRoot: string;
  conversationKey: string;
};

const BACKGROUND_OUTPUT_CHAR_LIMIT = 200_000;
const BACKGROUND_OUTPUT_TRUNCATION_NOTICE =
  "\n[output truncated: exceeded 200000 characters]\n";
const WAIT_POLL_INTERVAL_MS = 100;
export const BACKGROUND_TASK_RUNTIME_RESTART_ERROR =
  "Task runtime restarted before the background task completed.";

export function isBackgroundTaskLostAfterRestart(task: BackgroundTaskRecord): boolean {
  return (
    task.status === "lost" ||
    (task.status === "failed" && task.error === BACKGROUND_TASK_RUNTIME_RESTART_ERROR)
  );
}

function buildWorkspaceScopeId(workspaceRoot: string): string {
  return createHash("sha1").update(workspaceRoot).digest("hex").slice(0, 16);
}

function sanitizeConversationKey(conversationKey: string): string {
  return conversationKey.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function cloneTask(task: TaskRecord): TaskRecord {
  return {
    ...task,
    blocks: [...task.blocks],
    blockedBy: [...task.blockedBy],
    ...(task.metadata ? { metadata: { ...task.metadata } } : {}),
  };
}

function cloneBackgroundTask(task: BackgroundTaskRecord): BackgroundTaskRecord {
  return {
    ...task,
    ...(task.metadata ? { metadata: { ...task.metadata } } : {}),
  };
}

type TaskDependencyMutation = {
  blockerTaskId: string;
  blockedTaskId: string;
};

function buildTaskDependencyGraph(
  tasks: readonly TaskRecord[],
): Map<string, Set<string>> {
  return new Map(
    tasks.map(task => [task.id, new Set(task.blocks)]),
  );
}

function hasDependencyPath(
  graph: Map<string, Set<string>>,
  sourceTaskId: string,
  targetTaskId: string,
): boolean {
  const pending = [sourceTaskId];
  const visited = new Set<string>();

  while (pending.length > 0) {
    const currentTaskId = pending.pop();
    if (!currentTaskId || visited.has(currentTaskId)) {
      continue;
    }
    if (currentTaskId === targetTaskId) {
      return true;
    }
    visited.add(currentTaskId);
    for (const nextTaskId of graph.get(currentTaskId) ?? []) {
      if (!visited.has(nextTaskId)) {
        pending.push(nextTaskId);
      }
    }
  }

  return false;
}

export function assertTaskDependencyMutationsAreValid(
  tasks: readonly TaskRecord[],
  mutations: readonly TaskDependencyMutation[],
): void {
  if (mutations.length === 0) {
    return;
  }

  const knownTaskIds = new Set(tasks.map(task => task.id));
  const dependencyGraph = buildTaskDependencyGraph(tasks);

  for (const { blockerTaskId, blockedTaskId } of mutations) {
    if (!knownTaskIds.has(blockerTaskId) || !knownTaskIds.has(blockedTaskId)) {
      throw new Error("Task dependency references a missing task.");
    }

    if (blockerTaskId === blockedTaskId) {
      throw new Error("Task dependency cannot reference the same task on both sides.");
    }

    const blockedTasks = dependencyGraph.get(blockerTaskId);
    if (!blockedTasks) {
      throw new Error("Task dependency references a missing task.");
    }

    if (blockedTasks.has(blockedTaskId)) {
      continue;
    }

    if (hasDependencyPath(dependencyGraph, blockedTaskId, blockerTaskId)) {
      throw new Error("Task dependency would create a cycle.");
    }

    blockedTasks.add(blockedTaskId);
  }
}

function normalizeBackgroundTaskType(taskType: unknown): BackgroundTaskType {
  if (taskType === "local_bash") {
    return "local_bash";
  }

  if (taskType === "built_in_agent" || taskType === "verification_agent") {
    return "built_in_agent";
  }

  if (taskType === "remote_agent") {
    return "remote_agent";
  }

  return "local_agent";
}

function normalizeOutput(output: string): string {
  if (output.length <= BACKGROUND_OUTPUT_CHAR_LIMIT) {
    return output;
  }

  return (
    output.slice(0, BACKGROUND_OUTPUT_CHAR_LIMIT - BACKGROUND_OUTPUT_TRUNCATION_NOTICE.length) +
    BACKGROUND_OUTPUT_TRUNCATION_NOTICE
  );
}

function appendOutput(current: string, chunk: string): string {
  return normalizeOutput(current + chunk);
}

async function readDetachedBackgroundTaskOutput(
  task: BackgroundTaskRecord,
): Promise<string | undefined> {
  const detached = task.metadata
    ? parseDetachedBackgroundTaskMetadata(task.metadata)
    : null;
  if (!detached) {
    return undefined;
  }

  try {
    return normalizeOutput(await fs.readFile(detached.outputPath, "utf8"));
  } catch {
    return undefined;
  }
}

async function readDetachedBackgroundTaskState(
  task: BackgroundTaskRecord,
): Promise<ReturnType<typeof parseDetachedBackgroundTaskState>> {
  const detached = task.metadata
    ? parseDetachedBackgroundTaskMetadata(task.metadata)
    : null;
  if (!detached) {
    return null;
  }

  try {
    return parseDetachedBackgroundTaskState(
      JSON.parse(await fs.readFile(detached.statePath, "utf8")),
    );
  } catch {
    return null;
  }
}

function readOptionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalExitCode(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }

  return readOptionalFiniteNumber(value);
}

function getDetachedArtifactFields(
  metadata: Record<string, unknown> | undefined,
): Pick<BackgroundTaskRecord, "outputPath" | "statePath" | "cancelPath" | "configPath"> {
  const detached = parseDetachedBackgroundTaskMetadata(metadata);
  if (!detached) {
    return {};
  }

  return {
    outputPath: detached.outputPath,
    statePath: detached.statePath,
    cancelPath: detached.cancelPath,
    ...(detached.configPath ? { configPath: detached.configPath } : {}),
  };
}

function applyDetachedArtifactFields(task: BackgroundTaskRecord): void {
  const fields = getDetachedArtifactFields(task.metadata);

  if (fields.outputPath) {
    task.outputPath = fields.outputPath;
  } else {
    delete task.outputPath;
  }

  if (fields.statePath) {
    task.statePath = fields.statePath;
  } else {
    delete task.statePath;
  }

  if (fields.cancelPath) {
    task.cancelPath = fields.cancelPath;
  } else {
    delete task.cancelPath;
  }

  if (fields.configPath) {
    task.configPath = fields.configPath;
  } else {
    delete task.configPath;
  }
}

function applyDetachedBackgroundTaskSnapshot(
  task: BackgroundTaskRecord,
  snapshot: {
    status?: BackgroundTaskStatus;
    output?: string;
    result?: string;
    error?: string;
    runnerPid?: number;
    childPid?: number;
    exitCode?: number | null;
    updatedAt?: number;
  },
): void {
  if (snapshot.status !== undefined) {
    task.status = snapshot.status;
  }
  if (snapshot.output !== undefined) {
    task.output = normalizeOutput(snapshot.output);
  }
  if (snapshot.result !== undefined) {
    task.result = snapshot.result;
  }
  if (snapshot.error !== undefined) {
    task.error = snapshot.error;
  } else if (snapshot.status === "completed") {
    delete task.error;
  }
  if (snapshot.runnerPid !== undefined) {
    task.runnerPid = snapshot.runnerPid;
  }
  if (snapshot.childPid !== undefined) {
    task.childPid = snapshot.childPid;
  }
  if (snapshot.exitCode !== undefined) {
    task.exitCode = snapshot.exitCode;
  }
  if (snapshot.updatedAt !== undefined) {
    task.updatedAt = snapshot.updatedAt;
  }
}

function detachedBackgroundTaskSnapshotDiffers(
  task: BackgroundTaskRecord,
  snapshot: {
    status?: BackgroundTaskStatus;
    output?: string;
    result?: string;
    error?: string;
    runnerPid?: number;
    childPid?: number;
    exitCode?: number | null;
    updatedAt?: number;
  },
): boolean {
  if (snapshot.status !== undefined && snapshot.status !== task.status) {
    return true;
  }
  if (snapshot.output !== undefined && snapshot.output !== task.output) {
    return true;
  }
  if (snapshot.result !== undefined && snapshot.result !== task.result) {
    return true;
  }
  if (snapshot.error !== undefined && snapshot.error !== task.error) {
    return true;
  }
  if (
    snapshot.error === undefined &&
    snapshot.status === "completed" &&
    task.error !== undefined
  ) {
    return true;
  }
  if (snapshot.updatedAt !== undefined && snapshot.updatedAt !== task.updatedAt) {
    return true;
  }
  if (snapshot.runnerPid !== undefined && snapshot.runnerPid !== task.runnerPid) {
    return true;
  }
  if (snapshot.childPid !== undefined && snapshot.childPid !== task.childPid) {
    return true;
  }
  if (snapshot.exitCode !== undefined && snapshot.exitCode !== task.exitCode) {
    return true;
  }
  return false;
}

function normalizeState(
  value: Partial<PersistedConversationTaskState> | undefined,
): PersistedConversationTaskState {
  const normalizedTasks = Array.isArray(value?.tasks)
    ? value.tasks.map(task => ({
        createdAt:
          typeof task.createdAt === "number" && Number.isFinite(task.createdAt)
            ? task.createdAt
            : Date.now(),
        updatedAt:
          typeof task.updatedAt === "number" && Number.isFinite(task.updatedAt)
            ? task.updatedAt
            : Date.now(),
        status:
          (task.status === "in_progress" || task.status === "completed"
            ? task.status
            : "pending") as TaskStatus,
        id: String(task.id),
        subject: String(task.subject ?? ""),
        description: String(task.description ?? ""),
        ...(task.activeForm ? { activeForm: String(task.activeForm) } : {}),
        ...(task.owner ? { owner: String(task.owner) } : {}),
        blocks: Array.isArray(task.blocks) ? task.blocks.map(id => String(id)) : [],
        blockedBy: Array.isArray(task.blockedBy) ? task.blockedBy.map(id => String(id)) : [],
        ...(task.metadata ? { metadata: { ...task.metadata } } : {}),
      }))
    : [];

  const now = Date.now();
  let dirtyBackgroundTasks = false;
  const normalizedBackgroundTasks = Array.isArray(value?.backgroundTasks)
    ? value.backgroundTasks.map(task => {
        const rawTaskType = String((task as { taskType?: unknown }).taskType ?? "");
        const normalizedTaskType = normalizeBackgroundTaskType(rawTaskType);
        const isLegacyVerificationTask = rawTaskType === "verification_agent";
        const detachedMetadata =
          task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
            ? parseDetachedBackgroundTaskMetadata(task.metadata as Record<string, unknown>)
            : null;
        const preservesRunningStateAfterRestart =
          normalizedTaskType === "remote_agent" || Boolean(detachedMetadata);
        const status: BackgroundTaskStatus =
          task.status === "running" || task.status === "pending"
            ? preservesRunningStateAfterRestart
              ? task.status
              : "lost"
            : task.status === "completed" ||
                task.status === "cancelled" ||
                task.status === "killed" ||
                task.status === "lost"
              ? task.status
              : "failed";

        if (status !== task.status) {
          dirtyBackgroundTasks = true;
        }

        return {
          id: String(task.id),
          taskType: normalizedTaskType,
          ...(typeof task.agentType === "string" && task.agentType.trim()
            ? { agentType: task.agentType.trim() }
            : isLegacyVerificationTask
              ? { agentType: VERIFICATION_AGENT_TYPE }
              : {}),
          ...(task.agentSource === "built-in" || isLegacyVerificationTask
            ? { agentSource: "built-in" as const }
            : {}),
          ...(typeof task.agentColor === "string" && task.agentColor.trim()
            ? { agentColor: task.agentColor.trim() }
            : isLegacyVerificationTask
              ? { agentColor: "red" }
              : {}),
          ...(task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
            ? { metadata: { ...task.metadata } }
            : {}),
          ...getDetachedArtifactFields(
            task.metadata && typeof task.metadata === "object" && !Array.isArray(task.metadata)
              ? (task.metadata as Record<string, unknown>)
              : undefined,
          ),
          ...(readOptionalFiniteNumber(task.runnerPid) !== undefined
            ? { runnerPid: readOptionalFiniteNumber(task.runnerPid)! }
            : {}),
          ...(readOptionalFiniteNumber(task.childPid) !== undefined
            ? { childPid: readOptionalFiniteNumber(task.childPid)! }
            : {}),
          ...(readOptionalExitCode(task.exitCode) !== undefined
            ? { exitCode: readOptionalExitCode(task.exitCode)! }
            : {}),
          status,
          description: String(task.description ?? ""),
          ...(task.workspaceRoot ? { workspaceRoot: String(task.workspaceRoot) } : {}),
          ...(task.command ? { command: String(task.command) } : {}),
          ...(task.prompt ? { prompt: String(task.prompt) } : {}),
          ...(task.result ? { result: String(task.result) } : {}),
          output: normalizeOutput(String(task.output ?? "")),
          ...(task.error || status === "failed" || status === "lost"
            ? {
                error: String(
                  task.error ??
                    BACKGROUND_TASK_RUNTIME_RESTART_ERROR,
                ),
              }
            : {}),
          createdAt:
            typeof task.createdAt === "number" && Number.isFinite(task.createdAt)
              ? task.createdAt
              : now,
          updatedAt:
            typeof task.updatedAt === "number" && Number.isFinite(task.updatedAt)
              ? task.updatedAt
              : now,
        };
      })
    : [];

  return {
    version: 1,
    nextTaskId:
      typeof value?.nextTaskId === "number" && Number.isFinite(value.nextTaskId)
        ? Math.max(value.nextTaskId, normalizedTasks.length + 1)
        : normalizedTasks.length + 1,
    tasks: normalizedTasks,
    backgroundTasks: normalizedBackgroundTasks.map(task => {
      if (dirtyBackgroundTasks && task.status === "lost" && !task.error) {
        return {
          ...task,
          error: BACKGROUND_TASK_RUNTIME_RESTART_ERROR,
        };
      }
      return task;
    }),
  };
}

function getScopeCacheKey(scope: ConversationScope): string {
  return `${buildWorkspaceScopeId(scope.workspaceRoot)}:${scope.conversationKey}`;
}

export class PersistentTaskRuntimeStore {
  private readonly scopeCache = new Map<string, PersistedConversationTaskState>();
  private readonly scopeLocks = new Map<string, Promise<unknown>>();

  constructor(private readonly storageRoot: string) {}

  getConversationRuntime(
    workspaceRoot: string,
    conversationKey: string,
  ): ConversationTaskRuntime {
    const scope: ConversationScope = { workspaceRoot, conversationKey };

    return {
      createTask: input => this.createTask(scope, input),
      getTask: taskId => this.getTask(scope, taskId),
      listTasks: () => this.listTasks(scope),
      listBackgroundTasks: () => this.listBackgroundTasks(scope),
      updateTask: (taskId, updates) => this.updateTask(scope, taskId, updates),
      deleteTask: taskId => this.deleteTask(scope, taskId),
      blockTask: (blockerTaskId, blockedTaskId) =>
        this.blockTask(scope, blockerTaskId, blockedTaskId),
      registerBackgroundTask: task => this.registerBackgroundTask(scope, task),
      getBackgroundTask: taskId => this.getBackgroundTask(scope, taskId),
      updateBackgroundTask: (taskId, updates) =>
        this.updateBackgroundTask(scope, taskId, updates),
      appendBackgroundOutput: (taskId, content) =>
        this.appendBackgroundOutput(scope, taskId, content),
      waitForBackgroundTask: (taskId, timeoutMs, abortSignal) =>
        this.waitForBackgroundTask(scope, taskId, timeoutMs, abortSignal),
    };
  }

  private async createTask(
    scope: ConversationScope,
    input: CreateTaskInput,
  ): Promise<TaskRecord> {
    return this.withScopedMutation(scope, state => {
      const now = Date.now();
      const task: TaskRecord = {
        id: String(state.nextTaskId),
        subject: input.subject,
        description: input.description,
        ...(input.activeForm ? { activeForm: input.activeForm } : {}),
        status: "pending",
        blocks: [],
        blockedBy: [],
        ...(input.metadata ? { metadata: { ...input.metadata } } : {}),
        createdAt: now,
        updatedAt: now,
      };

      state.nextTaskId += 1;
      state.tasks.push(task);
      return cloneTask(task);
    });
  }

  private async getTask(
    scope: ConversationScope,
    taskId: string,
  ): Promise<TaskRecord | null> {
    const state = await this.readState(scope);
    const task = state.tasks.find(entry => entry.id === taskId);
    return task ? cloneTask(task) : null;
  }

  private async listTasks(scope: ConversationScope): Promise<TaskRecord[]> {
    const state = await this.readState(scope);
    return state.tasks.map(task => cloneTask(task));
  }

  private async listBackgroundTasks(
    scope: ConversationScope,
  ): Promise<BackgroundTaskRecord[]> {
    const state = await this.readState(scope);
    for (const task of state.backgroundTasks) {
      if (
        (task.status === "running" || task.status === "pending") &&
        task.metadata &&
        parseDetachedBackgroundTaskMetadata(task.metadata)
      ) {
        await this.refreshDetachedBackgroundTask(scope, task.id, task);
      }
    }

    const refreshedState = await this.readState(scope);
    return refreshedState.backgroundTasks
      .slice()
      .sort((left, right) => {
        const leftRunning = left.status === "running" || left.status === "pending";
        const rightRunning = right.status === "running" || right.status === "pending";
        if (leftRunning !== rightRunning) {
          return leftRunning ? -1 : 1;
        }
        return right.updatedAt - left.updatedAt;
      })
      .map(task => cloneBackgroundTask(task));
  }

  private async updateTask(
    scope: ConversationScope,
    taskId: string,
    updates: UpdateTaskInput,
  ): Promise<TaskRecord | null> {
    return this.withScopedMutation(scope, state => {
      const task = state.tasks.find(entry => entry.id === taskId);
      if (!task) {
        return null;
      }

      if (updates.subject !== undefined) {
        task.subject = updates.subject;
      }
      if (updates.description !== undefined) {
        task.description = updates.description;
      }
      if (updates.activeForm !== undefined) {
        if (updates.activeForm) {
          task.activeForm = updates.activeForm;
        } else {
          delete task.activeForm;
        }
      }
      if (updates.status !== undefined) {
        task.status = updates.status;
      }
      if (updates.owner !== undefined) {
        if (updates.owner) {
          task.owner = updates.owner;
        } else {
          delete task.owner;
        }
      }
      if (updates.metadata !== undefined) {
        task.metadata = { ...updates.metadata };
      }
      task.updatedAt = Date.now();

      return cloneTask(task);
    });
  }

  private async deleteTask(
    scope: ConversationScope,
    taskId: string,
  ): Promise<boolean> {
    return this.withScopedMutation(scope, state => {
      const originalLength = state.tasks.length;
      state.tasks = state.tasks.filter(task => task.id !== taskId);

      if (state.tasks.length === originalLength) {
        return false;
      }

      for (const task of state.tasks) {
        task.blocks = task.blocks.filter(id => id !== taskId);
        task.blockedBy = task.blockedBy.filter(id => id !== taskId);
      }

      return true;
    });
  }

  private async blockTask(
    scope: ConversationScope,
    blockerTaskId: string,
    blockedTaskId: string,
  ): Promise<void> {
    await this.withScopedMutation(scope, state => {
      assertTaskDependencyMutationsAreValid(state.tasks, [
        {
          blockerTaskId,
          blockedTaskId,
        },
      ]);

      const blocker = state.tasks.find(task => task.id === blockerTaskId)!;
      const blocked = state.tasks.find(task => task.id === blockedTaskId)!;

      if (!blocker.blocks.includes(blockedTaskId)) {
        blocker.blocks.push(blockedTaskId);
        blocker.updatedAt = Date.now();
      }

      if (!blocked.blockedBy.includes(blockerTaskId)) {
        blocked.blockedBy.push(blockerTaskId);
        blocked.updatedAt = Date.now();
      }
    });
  }

  private async registerBackgroundTask(
    scope: ConversationScope,
    task: Omit<BackgroundTaskRecord, "createdAt" | "updatedAt">,
  ): Promise<BackgroundTaskRecord> {
    return this.withScopedMutation(scope, state => {
      const now = Date.now();
      const existing = state.backgroundTasks.find(entry => entry.id === task.id);

      if (existing) {
        existing.taskType = task.taskType;
        if (task.agentType !== undefined) {
          existing.agentType = task.agentType;
        }
        if (task.agentSource !== undefined) {
          existing.agentSource = task.agentSource;
        }
        if (task.agentColor !== undefined) {
          existing.agentColor = task.agentColor;
        }
        if (task.metadata !== undefined) {
          existing.metadata = { ...task.metadata };
        }
        if (task.runnerPid !== undefined) {
          existing.runnerPid = task.runnerPid;
        }
        if (task.childPid !== undefined) {
          existing.childPid = task.childPid;
        }
        if (task.exitCode !== undefined) {
          existing.exitCode = task.exitCode;
        }
        existing.status = task.status;
        existing.description = task.description;
        existing.workspaceRoot = task.workspaceRoot;
        existing.command = task.command;
        existing.prompt = task.prompt;
        existing.result = task.result;
        existing.outputPath = task.outputPath;
        existing.statePath = task.statePath;
        existing.cancelPath = task.cancelPath;
        existing.configPath = task.configPath;
        existing.output = normalizeOutput(task.output);
        existing.error = task.error;
        existing.updatedAt = now;
        applyDetachedArtifactFields(existing);
        return cloneBackgroundTask(existing);
      }

      const created: BackgroundTaskRecord = {
        ...task,
        output: normalizeOutput(task.output),
        createdAt: now,
        updatedAt: now,
      };
      applyDetachedArtifactFields(created);

      state.backgroundTasks.push(created);
      return cloneBackgroundTask(created);
    });
  }

  private async getBackgroundTask(
    scope: ConversationScope,
    taskId: string,
  ): Promise<BackgroundTaskRecord | null> {
    const state = await this.readState(scope);
    const task = state.backgroundTasks.find(entry => entry.id === taskId);
    if (!task) {
      return null;
    }

    return this.refreshDetachedBackgroundTask(scope, task.id, task);
  }

  private async updateBackgroundTask(
    scope: ConversationScope,
    taskId: string,
    updates: Partial<Omit<BackgroundTaskRecord, "id" | "createdAt" | "updatedAt">>,
  ): Promise<BackgroundTaskRecord | null> {
    return this.withScopedMutation(scope, state => {
      const task = state.backgroundTasks.find(entry => entry.id === taskId);
      if (!task) {
        return null;
      }

      if (updates.taskType !== undefined) {
        task.taskType = updates.taskType;
      }
      if (updates.agentType !== undefined) {
        task.agentType = updates.agentType;
      }
      if (updates.agentSource !== undefined) {
        task.agentSource = updates.agentSource;
      }
      if (updates.agentColor !== undefined) {
        task.agentColor = updates.agentColor;
      }
      if (updates.metadata !== undefined) {
        task.metadata = { ...updates.metadata };
      }
      if (updates.runnerPid !== undefined) {
        task.runnerPid = updates.runnerPid;
      }
      if (updates.childPid !== undefined) {
        task.childPid = updates.childPid;
      }
      if (updates.exitCode !== undefined) {
        task.exitCode = updates.exitCode;
      }
      if (updates.status !== undefined) {
        task.status = updates.status;
      }
      if (updates.description !== undefined) {
        task.description = updates.description;
      }
      if (updates.workspaceRoot !== undefined) {
        task.workspaceRoot = updates.workspaceRoot;
      }
      if (updates.command !== undefined) {
        task.command = updates.command;
      }
      if (updates.prompt !== undefined) {
        task.prompt = updates.prompt;
      }
      if (updates.result !== undefined) {
        task.result = updates.result;
      }
      if (updates.outputPath !== undefined) {
        task.outputPath = updates.outputPath;
      }
      if (updates.statePath !== undefined) {
        task.statePath = updates.statePath;
      }
      if (updates.cancelPath !== undefined) {
        task.cancelPath = updates.cancelPath;
      }
      if (updates.configPath !== undefined) {
        task.configPath = updates.configPath;
      }
      if (updates.output !== undefined) {
        task.output = normalizeOutput(updates.output);
      }
      if (updates.error !== undefined) {
        task.error = updates.error;
      }

      applyDetachedArtifactFields(task);
      task.updatedAt = Date.now();
      return cloneBackgroundTask(task);
    });
  }

  private async appendBackgroundOutput(
    scope: ConversationScope,
    taskId: string,
    content: string,
  ): Promise<BackgroundTaskRecord | null> {
    return this.withScopedMutation(scope, state => {
      const task = state.backgroundTasks.find(entry => entry.id === taskId);
      if (!task) {
        return null;
      }

      task.output = appendOutput(task.output, content);
      task.updatedAt = Date.now();
      return cloneBackgroundTask(task);
    });
  }

  private async waitForBackgroundTask(
    scope: ConversationScope,
    taskId: string,
    timeoutMs: number,
    abortSignal?: AbortSignal,
  ): Promise<BackgroundTaskRecord | null> {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      if (abortSignal?.aborted) {
        throw new Error("Background task wait aborted.");
      }

      const task = await this.getBackgroundTask(scope, taskId);
      if (!task) {
        return null;
      }

      if (task.status !== "pending" && task.status !== "running") {
        return task;
      }

      await new Promise(resolve => setTimeout(resolve, WAIT_POLL_INTERVAL_MS));
    }

    return this.getBackgroundTask(scope, taskId);
  }

  private async refreshDetachedBackgroundTask(
    scope: ConversationScope,
    taskId: string,
    initialTask?: BackgroundTaskRecord,
  ): Promise<BackgroundTaskRecord | null> {
    const baseTask =
      initialTask ??
      (await this.readState(scope)).backgroundTasks.find(entry => entry.id === taskId);
    if (!baseTask || !baseTask.metadata || !parseDetachedBackgroundTaskMetadata(baseTask.metadata)) {
      return baseTask ? cloneBackgroundTask(baseTask) : null;
    }

    const [detachedState, detachedOutput] = await Promise.all([
      readDetachedBackgroundTaskState(baseTask),
      readDetachedBackgroundTaskOutput(baseTask),
    ]);

    const snapshot: {
      status?: BackgroundTaskStatus;
      output?: string;
      result?: string;
      error?: string;
      runnerPid?: number;
      childPid?: number;
      exitCode?: number | null;
      updatedAt?: number;
    } = {
      ...(detachedOutput !== undefined ? { output: detachedOutput } : {}),
    };

    if (detachedState) {
      const allowStatusRefresh =
        baseTask.status === "running" ||
        baseTask.status === "pending" ||
        detachedState.status !== "running";
      if (allowStatusRefresh) {
        snapshot.status = detachedState.status;
        snapshot.updatedAt = detachedState.updatedAt;
        if (detachedState.runnerPid !== undefined) {
          snapshot.runnerPid = detachedState.runnerPid;
        }
        if (detachedState.childPid !== undefined) {
          snapshot.childPid = detachedState.childPid;
        }
        if (detachedState.exitCode !== undefined) {
          snapshot.exitCode = detachedState.exitCode;
        }
        if (detachedState.result !== undefined) {
          snapshot.result = detachedState.result;
        }
        if (detachedState.error !== undefined) {
          snapshot.error = detachedState.error;
        }
      }
    }

    if (!detachedBackgroundTaskSnapshotDiffers(baseTask, snapshot)) {
      return cloneBackgroundTask(baseTask);
    }

    return this.withScopedMutation(scope, state => {
      const task = state.backgroundTasks.find(entry => entry.id === taskId);
      if (!task) {
        return null;
      }

      applyDetachedBackgroundTaskSnapshot(task, snapshot);
      return cloneBackgroundTask(task);
    });
  }

  private async withScopedMutation<T>(
    scope: ConversationScope,
    mutator: (state: PersistedConversationTaskState) => T | Promise<T>,
  ): Promise<T> {
    const scopeKey = getScopeCacheKey(scope);
    const previous = this.scopeLocks.get(scopeKey) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(async () => {
        const state = await this.loadState(scope);
        const result = await mutator(state);
        await this.saveState(scope, state);
        return result;
      });

    this.scopeLocks.set(scopeKey, run.catch(() => undefined));
    return run;
  }

  private async readState(
    scope: ConversationScope,
  ): Promise<PersistedConversationTaskState> {
    const scopeKey = getScopeCacheKey(scope);
    const pending = this.scopeLocks.get(scopeKey);
    if (pending) {
      await pending.catch(() => undefined);
    }
    return this.loadState(scope);
  }

  private async loadState(
    scope: ConversationScope,
  ): Promise<PersistedConversationTaskState> {
    const scopeKey = getScopeCacheKey(scope);
    const cached = this.scopeCache.get(scopeKey);
    if (cached) {
      return cached;
    }

    const filePath = this.getScopeFilePath(scope);

    try {
      const raw = await fs.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<PersistedConversationTaskState>;
      const normalized = normalizeState(parsed);
      this.scopeCache.set(scopeKey, normalized);
      if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
        await this.saveState(scope, normalized);
      }
      return normalized;
    } catch {
      const emptyState = normalizeState(undefined);
      this.scopeCache.set(scopeKey, emptyState);
      return emptyState;
    }
  }

  private async saveState(
    scope: ConversationScope,
    state: PersistedConversationTaskState,
  ): Promise<void> {
    const filePath = this.getScopeFilePath(scope);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(state, null, 2), "utf8");
  }

  private getScopeFilePath(scope: ConversationScope): string {
    return path.join(
      this.storageRoot,
      "task-runtime",
      buildWorkspaceScopeId(scope.workspaceRoot),
      `${sanitizeConversationKey(scope.conversationKey)}.json`,
    );
  }
}
