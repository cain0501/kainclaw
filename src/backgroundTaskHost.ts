import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

import { parseDetachedBackgroundTaskMetadata } from "./detachedBackgroundTask";
import {
  describeToolInput as formatToolInputPreview,
  describeToolName as formatToolDisplayName,
} from "./hostRuntimeHelpers";
import type {
  BackgroundTaskRecord,
  BackgroundTaskType,
  ConversationTaskRuntime,
} from "./tasks/types";
import { generateBackgroundTaskId } from "./tasks/taskIds";
import type { SkillStore } from "./skills/skillStore";
import type { IProviderAdapter } from "./agent/providers/IProviderAdapter";
import { distillAndSaveSkill, meetsDistillationThreshold } from "./skills/skillDistiller";

export const BACKGROUND_COMMAND_TIMEOUT_MS = 15 * 60 * 1000;

export type BuiltInAgentSessionOptions<TResult> = {
  workspaceRoot: string;
  commandText: string;
  agentType: string;
  taskId: string;
  taskDescription: string;
  taskMetadata: Pick<
    BackgroundTaskRecord,
    "taskType" | "agentType" | "agentSource" | "agentColor" | "metadata"
  >;
  promptForTask?: string;
  taskStartOutput: string;
  run: (hooks: {
    onToolStart: (toolName: string, input: Record<string, unknown>, execId: string) => void;
    onToolEnd: (execId: string, summary: string, isError: boolean) => void;
  }, abortSignal: AbortSignal) => Promise<TResult>;
  onToolStart?: (toolName: string, input: Record<string, unknown>, execId: string) => void;
  onToolEnd?: (execId: string, summary: string, isError: boolean) => void;
  formatToolEvent: (
    phase: "start" | "end",
    toolName: string,
    detail?: string,
  ) => string;
  finalizeSuccess: (
    result: TResult,
  ) => Partial<Omit<BackgroundTaskRecord, "id" | "createdAt" | "updatedAt">>;
  finalizeFailure?: (
    message: string,
  ) => Partial<Omit<BackgroundTaskRecord, "id" | "createdAt" | "updatedAt">>;
  onBeforeRun?: () => void;
  onSuccess?: (result: TResult) => void;
  onFailure?: (message: string) => void;
  skillStore?: SkillStore;
  skillDistillProvider?: IProviderAdapter;
};

export type ReusableBackgroundCommand = {
  taskId: string;
  command: string;
  workspaceRoot: string;
};

export type StoppedActiveBackgroundTask = {
  taskId: string;
  taskType: Extract<BackgroundTaskType, "local_bash" | "local_agent" | "built_in_agent">;
  command: string;
};

type DetachedBackgroundCommandLaunchRequest = {
  configPath: string;
};

type DetachedBackgroundCommandLaunchResult = {
  runnerPid?: number;
};

type ActiveBuiltInAgentRun = {
  abortController: AbortController;
  agentType: string;
};

type BackgroundTaskHostOptions = {
  storageRoot: string;
  getTaskRuntime: (workspaceRoot: string) => ConversationTaskRuntime;
  createAbortController?: () => AbortController;
  createBackgroundCommandTaskId?: () => string;
  backgroundCommandTimeoutMs?: number;
  launchDetachedBackgroundCommand?: (
    request: DetachedBackgroundCommandLaunchRequest,
  ) => Promise<DetachedBackgroundCommandLaunchResult>;
  stopDetachedProcess?: (pid: number) => Promise<void>;
};

export class BackgroundTaskHost {
  private readonly activeBuiltInAgentRuns = new Map<string, ActiveBuiltInAgentRun>();
  private readonly cancelledBuiltInAgentTaskIds = new Set<string>();

  constructor(private readonly options: BackgroundTaskHostOptions) {}

  buildFollowUpMessage(label: string, taskId: string): string {
    return `${label} task saved as \`${taskId}\`. Use \`TaskOutput\` with \`task_id: "${taskId}"\` to read the stored result later.`;
  }

  dispose(): void {
    for (const activeBuiltInAgent of this.activeBuiltInAgentRuns.values()) {
      activeBuiltInAgent.abortController.abort();
    }
    this.activeBuiltInAgentRuns.clear();

    this.cancelledBuiltInAgentTaskIds.clear();
  }

  async stopTask(
    taskId: string,
    workspaceRoot?: string,
  ): Promise<StoppedActiveBackgroundTask | undefined> {
    const activeBuiltInAgent = this.activeBuiltInAgentRuns.get(taskId);
    if (activeBuiltInAgent) {
      this.cancelledBuiltInAgentTaskIds.add(taskId);
      activeBuiltInAgent.abortController.abort();
      this.activeBuiltInAgentRuns.delete(taskId);
      return {
        taskId,
        taskType: "built_in_agent",
        command: `${activeBuiltInAgent.agentType} agent`,
      };
    }

    if (!workspaceRoot) {
      return undefined;
    }

    const task = await this.options.getTaskRuntime(workspaceRoot).getBackgroundTask(taskId);
    const detached = task
      ? parseDetachedBackgroundTaskMetadata(task.metadata)
      : null;

    if (!task || !detached) {
      return undefined;
    }

    await fs.mkdir(path.dirname(detached.cancelPath), { recursive: true });
    await fs.writeFile(detached.cancelPath, "cancelled", "utf8");

    const statePid = await readDetachedTaskProcessId(detached.statePath);
    const pid = statePid ?? detached.runnerPid;
    if (pid !== undefined) {
      await (this.options.stopDetachedProcess ?? stopDetachedProcessTree)(pid);
    }

    return {
      taskId,
      taskType: task.taskType === "local_bash" ? "local_bash" : "local_agent",
      command: task.command ?? task.description,
    };
  }

  async findReusableBackgroundCommand(
    workspaceRoot: string,
    command: string,
  ): Promise<ReusableBackgroundCommand | undefined> {
    const trimmedCommand = command.trim();
    const taskRuntime = this.options.getTaskRuntime(workspaceRoot);
    const existingCommandTask = (await taskRuntime.listBackgroundTasks()).find(task =>
      (task.taskType === "local_bash" || task.taskType === "local_agent") &&
      task.workspaceRoot === workspaceRoot &&
      task.command === trimmedCommand &&
      (task.status === "running" || task.status === "pending"),
    );

    if (existingCommandTask) {
      return {
        taskId: existingCommandTask.id,
        command: existingCommandTask.command ?? trimmedCommand,
        workspaceRoot: existingCommandTask.workspaceRoot ?? workspaceRoot,
      };
    }

    return undefined;
  }

  async runBuiltInAgentSession<TResult>(
    options: BuiltInAgentSessionOptions<TResult>,
  ): Promise<TResult> {
    const taskRuntime = this.options.getTaskRuntime(options.workspaceRoot);
    const toolLabels = new Map<string, string>();
    const abortController = this.options.createAbortController?.() ?? new AbortController();

    await taskRuntime.registerBackgroundTask({
      id: options.taskId,
      ...options.taskMetadata,
      status: "running",
      description: options.taskDescription,
      workspaceRoot: options.workspaceRoot,
      command: options.commandText.trim() || undefined,
      prompt: options.promptForTask,
      output: options.taskStartOutput,
    });
    this.activeBuiltInAgentRuns.set(options.taskId, {
      abortController,
      agentType: options.agentType,
    });

    options.onBeforeRun?.();

    try {
      const result = await options.run({
        onToolStart: (toolName, input, execId) => {
          const toolLabel = formatToolDisplayName(toolName);
          const toolDetail = formatToolInputPreview(input);
          toolLabels.set(execId, toolLabel);
          void taskRuntime.appendBackgroundOutput(
            options.taskId,
            `\n${options.formatToolEvent("start", toolLabel, toolDetail)}`,
          );
          options.onToolStart?.(toolName, input, execId);
        },
        onToolEnd: (execId, summary, isError) => {
          const toolLabel = toolLabels.get(execId) ?? options.agentType;
          toolLabels.delete(execId);
          void taskRuntime.appendBackgroundOutput(
            options.taskId,
            `\n${options.formatToolEvent(
              "end",
              toolLabel,
              isError ? `ERROR: ${summary}` : summary,
            )}`,
          );
          options.onToolEnd?.(execId, summary, isError);
        },
      }, abortController.signal);

      const finalizedSuccess = {
        ...options.finalizeSuccess(result),
      };
      const finalStatus = finalizedSuccess.status ?? "completed";
      const mergedMetadata =
        options.taskMetadata.metadata || finalizedSuccess.metadata
          ? {
              ...(options.taskMetadata.metadata ?? {}),
              ...(finalizedSuccess.metadata ?? {}),
            }
          : undefined;
      const finalOutput =
        typeof finalizedSuccess.output === "string"
          ? finalizedSuccess.output
          : undefined;
      if (finalOutput?.trim()) {
        delete finalizedSuccess.output;
        void taskRuntime.appendBackgroundOutput(
          options.taskId,
          `\n${finalOutput.trimEnd()}`,
        );
      }

      await taskRuntime.updateBackgroundTask(options.taskId, {
        ...options.taskMetadata,
        description: options.taskDescription,
        workspaceRoot: options.workspaceRoot,
        command: options.commandText.trim() || undefined,
        prompt: options.promptForTask,
        ...finalizedSuccess,
        ...(mergedMetadata ? { metadata: mergedMetadata } : {}),
      });
      void taskRuntime.appendBackgroundOutput(
        options.taskId,
        `\n${buildBuiltInAgentTerminalOutputMarker(
          finalStatus,
          finalizedSuccess.error,
          typeof finalizedSuccess.result === "string"
            ? finalizedSuccess.result
            : undefined,
        )}`,
      );
      options.onSuccess?.(result);

      if (options.skillStore && options.skillDistillProvider) {
        const completedTask = await taskRuntime.getBackgroundTask(options.taskId).catch(() => null);
        if (
          completedTask &&
          completedTask.taskType === "built_in_agent" &&
          completedTask.status === "completed" &&
          meetsDistillationThreshold(completedTask)
        ) {
          void distillAndSaveSkill(completedTask, options.skillStore, options.skillDistillProvider);
        }
      }

      this.activeBuiltInAgentRuns.delete(options.taskId);
      this.cancelledBuiltInAgentTaskIds.delete(options.taskId);
      return result;
    } catch (error) {
      const message = toErrorMessage(error);
      const wasCancelled =
        abortController.signal.aborted || this.cancelledBuiltInAgentTaskIds.has(options.taskId);
      void taskRuntime.appendBackgroundOutput(
        options.taskId,
        wasCancelled
          ? "\n[cancelled] Cancelled by TaskStop."
          : `\n[error] ${message}`,
      );
      await taskRuntime.updateBackgroundTask(options.taskId, {
        ...options.taskMetadata,
        ...(wasCancelled
          ? {
              status: "cancelled" as const,
              description: options.taskDescription,
              workspaceRoot: options.workspaceRoot,
              command: options.commandText.trim() || undefined,
              prompt: options.promptForTask,
              result: "Cancelled by TaskStop.",
              error: "Cancelled by TaskStop.",
            }
          : {
              status: "failed" as const,
              description: options.taskDescription,
              workspaceRoot: options.workspaceRoot,
              command: options.commandText.trim() || undefined,
              prompt: options.promptForTask,
              ...(options.finalizeFailure
                ? options.finalizeFailure(message)
                : {
                    result: message,
                    error: message,
                  }),
            }),
      });
      options.onFailure?.(message);
      this.activeBuiltInAgentRuns.delete(options.taskId);
      this.cancelledBuiltInAgentTaskIds.delete(options.taskId);
      throw error;
    }
  }

  async runBackgroundCommand(options: {
    workspaceRoot: string;
    command: string;
  }): Promise<{ taskId: string; command: string; workspaceRoot: string }> {
    const taskRuntime = this.options.getTaskRuntime(options.workspaceRoot);
    const trimmedCommand = options.command.trim();
    const taskDescription = buildBackgroundCommandTaskDescription(trimmedCommand);
    const taskId = this.options.createBackgroundCommandTaskId?.()
      ?? generateBackgroundTaskId("local_bash");
    const timeoutMs = this.options.backgroundCommandTimeoutMs ?? BACKGROUND_COMMAND_TIMEOUT_MS;
    const artifactPaths = this.getDetachedCommandArtifactPaths(taskId);
    const initialOutput = `Started background command:\n${trimmedCommand}\n`;

    await fs.mkdir(artifactPaths.directory, { recursive: true });
    await fs.writeFile(artifactPaths.outputPath, initialOutput, "utf8");
    await fs.writeFile(
      artifactPaths.configPath,
      JSON.stringify(
        {
          command: trimmedCommand,
          workspaceRoot: options.workspaceRoot,
          outputPath: artifactPaths.outputPath,
          statePath: artifactPaths.statePath,
          cancelPath: artifactPaths.cancelPath,
          timeoutMs,
        },
        null,
        2,
      ),
      "utf8",
    );

    const launched = await (
      this.options.launchDetachedBackgroundCommand ?? launchDetachedBackgroundCommand
    )({
      configPath: artifactPaths.configPath,
    });

    await fs.writeFile(
      artifactPaths.statePath,
      JSON.stringify(
        {
          status: "running",
          updatedAt: Date.now(),
          ...(launched.runnerPid !== undefined ? { runnerPid: launched.runnerPid } : {}),
        },
        null,
        2,
      ),
      "utf8",
    );

    await taskRuntime.registerBackgroundTask({
      id: taskId,
      taskType: "local_bash",
      status: "running",
      description: taskDescription,
      workspaceRoot: options.workspaceRoot,
      command: trimmedCommand,
      output: initialOutput,
      metadata: {
        detached: {
          mode: "detached",
          statePath: artifactPaths.statePath,
          outputPath: artifactPaths.outputPath,
          cancelPath: artifactPaths.cancelPath,
          configPath: artifactPaths.configPath,
          ...(launched.runnerPid !== undefined ? { runnerPid: launched.runnerPid } : {}),
        },
      },
    });

    return { taskId, command: trimmedCommand, workspaceRoot: options.workspaceRoot };
  }

  private getDetachedCommandArtifactPaths(taskId: string): {
    directory: string;
    configPath: string;
    statePath: string;
    outputPath: string;
    cancelPath: string;
  } {
    const directory = path.join(this.options.storageRoot, "background-commands", taskId);
    return {
      directory,
      configPath: path.join(directory, "config.json"),
      statePath: path.join(directory, "state.json"),
      outputPath: path.join(directory, "output.log"),
      cancelPath: path.join(directory, "cancelled.flag"),
    };
  }
}

export function buildBackgroundCommandTaskDescription(command: string): string {
  const compactCommand = command.trim().replace(/\s+/g, " ");
  if (compactCommand.length <= 80) {
    return `Background command: ${compactCommand}`;
  }
  return `Background command: ${compactCommand.slice(0, 77)}...`;
}

function buildBuiltInAgentTerminalOutputMarker(
  status: BackgroundTaskRecord["status"],
  error?: string,
  result?: string,
): string {
  const detail = error?.trim() || result?.trim();
  switch (status) {
    case "failed":
      return detail ? `[failed] ${detail}` : "[failed] Task failed.";
    case "cancelled":
      return detail ? `[cancelled] ${detail}` : "[cancelled] Task cancelled.";
    case "pending":
    case "running":
    case "completed":
    default:
      return "[completed] Task completed successfully.";
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function launchDetachedBackgroundCommand(
  request: DetachedBackgroundCommandLaunchRequest,
): Promise<DetachedBackgroundCommandLaunchResult> {
  const workerPath = path.join(__dirname, "backgroundCommandWorker.js");
  const child = spawn(process.execPath, [workerPath, request.configPath], {
    detached: true,
    windowsHide: true,
    stdio: "ignore",
  });
  child.unref();

  return {
    ...(typeof child.pid === "number" ? { runnerPid: child.pid } : {}),
  };
}

async function readDetachedTaskProcessId(statePath: string): Promise<number | undefined> {
  try {
    const raw = JSON.parse(await fs.readFile(statePath, "utf8")) as Record<string, unknown>;
    const childPid =
      typeof raw.childPid === "number" && Number.isFinite(raw.childPid)
        ? raw.childPid
        : undefined;
    const runnerPid =
      typeof raw.runnerPid === "number" && Number.isFinite(raw.runnerPid)
        ? raw.runnerPid
        : undefined;

    return childPid ?? runnerPid;
  } catch {
    return undefined;
  }
}

async function stopDetachedProcessTree(pid: number): Promise<void> {
  if (process.platform === "win32") {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      child.on("error", reject);
      child.on("close", code => {
        if (code === 0 || code === 128 || code === 255) {
          resolve();
          return;
        }
        reject(new Error(`taskkill exited with code ${code ?? "unknown"}`));
      });
    });
    return;
  }

  process.kill(pid, "SIGTERM");
}
