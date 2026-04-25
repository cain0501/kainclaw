export type TaskStatus = "pending" | "in_progress" | "completed";

export type BackgroundTaskType =
  | "local_bash"
  | "local_agent"
  | "built_in_agent"
  | "remote_agent";

export type BackgroundTaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "lost"
  | "killed"
  | "cancelled";

export type TaskRecord = {
  id: string;
  subject: string;
  description: string;
  activeForm?: string;
  status: TaskStatus;
  owner?: string;
  blocks: string[];
  blockedBy: string[];
  metadata?: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
};

export type BackgroundTaskRecord = {
  id: string;
  taskType: BackgroundTaskType;
  agentType?: string;
  agentSource?: "built-in";
  agentColor?: string;
  metadata?: Record<string, unknown>;
  runnerPid?: number;
  childPid?: number;
  exitCode?: number | null;
  outputPath?: string;
  statePath?: string;
  cancelPath?: string;
  configPath?: string;
  status: BackgroundTaskStatus;
  description: string;
  workspaceRoot?: string;
  command?: string;
  prompt?: string;
  result?: string;
  output: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
};

export type CreateTaskInput = {
  subject: string;
  description: string;
  activeForm?: string;
  metadata?: Record<string, unknown>;
};

export type UpdateTaskInput = {
  subject?: string;
  description?: string;
  activeForm?: string;
  status?: TaskStatus;
  owner?: string;
  metadata?: Record<string, unknown>;
};

export type ConversationTaskRuntime = {
  createTask(input: CreateTaskInput): Promise<TaskRecord>;
  getTask(taskId: string): Promise<TaskRecord | null>;
  listTasks(): Promise<TaskRecord[]>;
  listBackgroundTasks(): Promise<BackgroundTaskRecord[]>;
  updateTask(taskId: string, updates: UpdateTaskInput): Promise<TaskRecord | null>;
  deleteTask(taskId: string): Promise<boolean>;
  blockTask(blockerTaskId: string, blockedTaskId: string): Promise<void>;
  registerBackgroundTask(task: Omit<BackgroundTaskRecord, "createdAt" | "updatedAt">): Promise<BackgroundTaskRecord>;
  getBackgroundTask(taskId: string): Promise<BackgroundTaskRecord | null>;
  updateBackgroundTask(
    taskId: string,
    updates: Partial<Omit<BackgroundTaskRecord, "id" | "createdAt" | "updatedAt">>,
  ): Promise<BackgroundTaskRecord | null>;
  appendBackgroundOutput(taskId: string, content: string): Promise<BackgroundTaskRecord | null>;
  waitForBackgroundTask(
    taskId: string,
    timeoutMs: number,
    abortSignal?: AbortSignal,
  ): Promise<BackgroundTaskRecord | null>;
};
