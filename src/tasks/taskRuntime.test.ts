import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  BACKGROUND_TASK_RUNTIME_RESTART_ERROR,
  PersistentTaskRuntimeStore,
  isBackgroundTaskLostAfterRestart,
} from "./taskRuntime";

const tempDirs: string[] = [];

async function createRuntime() {
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-task-runtime-"));
  tempDirs.push(storageRoot);
  const store = new PersistentTaskRuntimeStore(storageRoot);
  return store.getConversationRuntime("E:\\claudecodejingiang\\vscode-extension", "test-conversation");
}

async function findStateFile(storageRoot: string, fileName: string): Promise<string> {
  const taskRuntimeRoot = path.join(storageRoot, "task-runtime");
  const scopeDirs = await fs.readdir(taskRuntimeRoot);
  for (const scopeDir of scopeDirs) {
    const candidate = path.join(taskRuntimeRoot, scopeDir, fileName);
    try {
      await fs.stat(candidate);
      return candidate;
    } catch {
      // keep searching
    }
  }
  throw new Error(`State file not found: ${fileName}`);
}

async function pause(ms = 5) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("PersistentTaskRuntimeStore background tasks", () => {
  it("lists running tasks before completed ones and sorts by updatedAt descending", async () => {
    const runtime = await createRuntime();

    await runtime.registerBackgroundTask({
      id: "completed-older",
      taskType: "local_agent",
      status: "completed",
      description: "older completed",
      output: "",
    });
    await pause();
    await runtime.registerBackgroundTask({
      id: "running-newer",
      taskType: "local_agent",
      status: "running",
      description: "newer running",
      output: "",
    });
    await pause();
    await runtime.registerBackgroundTask({
      id: "running-latest",
      taskType: "local_agent",
      status: "running",
      description: "latest running",
      output: "",
    });
    await pause();
    await runtime.updateBackgroundTask("completed-older", {
      description: "completed but recently updated",
    });

    const tasks = await runtime.listBackgroundTasks();

    expect(tasks.map(task => task.id)).toEqual([
      "running-latest",
      "running-newer",
      "completed-older",
    ]);
  });

  it("appends output and truncates at the configured limit", async () => {
    const runtime = await createRuntime();

    await runtime.registerBackgroundTask({
      id: "output-task",
      taskType: "local_agent",
      status: "running",
      description: "output test",
      output: "prefix",
    });

    await runtime.appendBackgroundOutput("output-task", "\nline-1");
    const initial = await runtime.getBackgroundTask("output-task");
    expect(initial?.output).toContain("prefix");
    expect(initial?.output).toContain("line-1");

    const veryLargeChunk = "x".repeat(210_000);
    await runtime.appendBackgroundOutput("output-task", veryLargeChunk);
    const truncated = await runtime.getBackgroundTask("output-task");

    expect(truncated).not.toBeNull();
    expect(truncated!.output.length).toBeLessThanOrEqual(200_000);
    expect(truncated!.output).toContain("[output truncated: exceeded 200000 characters]");
  });

  it("migrates legacy verification_agent records to built_in_agent metadata", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-task-runtime-legacy-"));
    tempDirs.push(storageRoot);
    const store = new PersistentTaskRuntimeStore(storageRoot);
    const runtime = store.getConversationRuntime(
      "E:\\claudecodejingiang\\vscode-extension",
      "legacy",
    );
    await runtime.createTask({
      subject: "seed",
      description: "seed",
    });
    const stateFile = await findStateFile(storageRoot, "legacy.json");
    await fs.writeFile(
      stateFile,
      JSON.stringify({
        version: 1,
        nextTaskId: 1,
        tasks: [],
        backgroundTasks: [
          {
            id: "verify-legacy",
            taskType: "verification_agent",
            status: "completed",
            description: "legacy verifier",
            output: "done",
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      }),
      "utf8",
    );
    const reloadedRuntime = new PersistentTaskRuntimeStore(storageRoot).getConversationRuntime(
      "E:\\claudecodejingiang\\vscode-extension",
      "legacy",
    );
    const tasks = await reloadedRuntime.listBackgroundTasks();

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      id: "verify-legacy",
      taskType: "built_in_agent",
      agentType: "verification",
      agentSource: "built-in",
      agentColor: "red",
      status: "completed",
    });
  });

  it("marks persisted running background tasks as failed after runtime restart", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-task-runtime-restart-"));
    tempDirs.push(storageRoot);
    const store = new PersistentTaskRuntimeStore(storageRoot);
    const runtime = store.getConversationRuntime(
      "E:\\claudecodejingiang\\vscode-extension",
      "restart",
    );
    await runtime.createTask({
      subject: "seed",
      description: "seed",
    });
    const stateFile = await findStateFile(storageRoot, "restart.json");
    await fs.writeFile(
      stateFile,
      JSON.stringify({
        version: 1,
        nextTaskId: 1,
        tasks: [],
        backgroundTasks: [
          {
            id: "cmd-running",
            taskType: "local_agent",
            status: "running",
            description: "stale running task",
            output: "partial output",
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      }),
      "utf8",
    );
    const reloadedRuntime = new PersistentTaskRuntimeStore(storageRoot).getConversationRuntime(
      "E:\\claudecodejingiang\\vscode-extension",
      "restart",
    );
    const task = await reloadedRuntime.getBackgroundTask("cmd-running");

    expect(task).toMatchObject({
      id: "cmd-running",
      status: "lost",
      error: BACKGROUND_TASK_RUNTIME_RESTART_ERROR,
    });
    expect(task && isBackgroundTaskLostAfterRestart(task)).toBe(true);
  });

  it("preserves detached background tasks across reload and refreshes their state files", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-task-runtime-detached-"));
    tempDirs.push(storageRoot);
    const store = new PersistentTaskRuntimeStore(storageRoot);
    const runtime = store.getConversationRuntime(
      "E:\\claudecodejingiang\\vscode-extension",
      "detached",
    );
    await runtime.createTask({
      subject: "seed",
      description: "seed",
    });

    const detachedDir = path.join(storageRoot, "background-commands", "cmd-detached");
    const statePath = path.join(detachedDir, "state.json");
    const outputPath = path.join(detachedDir, "output.log");
    const cancelPath = path.join(detachedDir, "cancelled.flag");
    const configPath = path.join(detachedDir, "config.json");
    await fs.mkdir(detachedDir, { recursive: true });
    await fs.writeFile(
      outputPath,
      "Started background command:\nnpm run build\npartial output\n",
      "utf8",
    );
    await fs.writeFile(
      statePath,
      JSON.stringify(
        {
          status: "running",
          updatedAt: 10,
          runnerPid: 5678,
          childPid: 1234,
        },
        null,
        2,
      ),
      "utf8",
    );

    const stateFile = await findStateFile(storageRoot, "detached.json");
    await fs.writeFile(
      stateFile,
      JSON.stringify({
        version: 1,
        nextTaskId: 1,
        tasks: [],
        backgroundTasks: [
          {
            id: "cmd-detached",
            taskType: "local_agent",
            status: "running",
            description: "detached running task",
            output: "",
            metadata: {
              detached: {
                mode: "detached",
                statePath,
                outputPath,
                cancelPath,
                configPath,
                runnerPid: 5678,
              },
            },
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      }),
      "utf8",
    );

    const reloadedRuntime = new PersistentTaskRuntimeStore(storageRoot).getConversationRuntime(
      "E:\\claudecodejingiang\\vscode-extension",
      "detached",
    );
    const runningTask = await reloadedRuntime.getBackgroundTask("cmd-detached");

    expect(runningTask).toMatchObject({
      id: "cmd-detached",
      status: "running",
      runnerPid: 5678,
      childPid: 1234,
      outputPath,
      statePath,
      cancelPath,
      configPath,
    });
    expect(runningTask && isBackgroundTaskLostAfterRestart(runningTask)).toBe(false);
    expect(runningTask?.output).toContain("partial output");

    await fs.writeFile(
      outputPath,
      "Started background command:\nnpm run build\npartial output\n[completed] Background command completed successfully.\n",
      "utf8",
    );
    await fs.writeFile(
      statePath,
      JSON.stringify(
        {
          status: "completed",
          updatedAt: 20,
          runnerPid: 5678,
          childPid: 1234,
          exitCode: 0,
          result: "Background command completed successfully.",
        },
        null,
        2,
      ),
      "utf8",
    );

    const completedTask = await reloadedRuntime.getBackgroundTask("cmd-detached");

    expect(completedTask).toMatchObject({
      id: "cmd-detached",
      status: "completed",
      runnerPid: 5678,
      childPid: 1234,
      exitCode: 0,
      result: "Background command completed successfully.",
      outputPath,
      statePath,
      cancelPath,
      configPath,
    });
    expect(completedTask?.output).toContain("[completed] Background command completed successfully.");
  });

  it("persists workspaceRoot on background task records", async () => {
    const runtime = await createRuntime();

    await runtime.registerBackgroundTask({
      id: "cmd-workspace",
      taskType: "local_agent",
      status: "running",
      description: "workspace aware task",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      output: "",
    });

    const task = await runtime.getBackgroundTask("cmd-workspace");

    expect(task).toMatchObject({
      id: "cmd-workspace",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
    });
  });

  it("persists background task metadata across reloads", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-task-runtime-meta-"));
    tempDirs.push(storageRoot);
    const store = new PersistentTaskRuntimeStore(storageRoot);
    const runtime = store.getConversationRuntime(
      "E:\\claudecodejingiang\\vscode-extension",
      "metadata",
    );

    await runtime.registerBackgroundTask({
      id: "review-meta",
      taskType: "built_in_agent",
      agentType: "review",
      agentSource: "built-in",
      agentColor: "blue",
      metadata: {
        originalTask: "Review metadata flow",
        extraGuidance: "focus on regressions",
      },
      status: "running",
      description: "review metadata",
      output: "",
    });

    const reloadedRuntime = new PersistentTaskRuntimeStore(storageRoot).getConversationRuntime(
      "E:\\claudecodejingiang\\vscode-extension",
      "metadata",
    );
    const task = await reloadedRuntime.getBackgroundTask("review-meta");

    expect(task).toMatchObject({
      id: "review-meta",
      metadata: {
        originalTask: "Review metadata flow",
        extraGuidance: "focus on regressions",
      },
    });
  });

  it("preserves remote background tasks across reload without degrading their type", async () => {
    const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-task-runtime-remote-"));
    tempDirs.push(storageRoot);
    const store = new PersistentTaskRuntimeStore(storageRoot);
    const runtime = store.getConversationRuntime(
      "E:\\claudecodejingiang\\vscode-extension",
      "remote",
    );

    await runtime.registerBackgroundTask({
      id: "remote-review",
      taskType: "remote_agent",
      status: "running",
      description: "remote review task",
      command: "Review PR #42 remotely",
      metadata: {
        remoteTaskType: "ultrareview",
        sessionId: "sess-123",
        sessionUrl: "https://claude.ai/code/sessions/sess-123",
      },
      output: "remote task started",
    });

    const reloadedRuntime = new PersistentTaskRuntimeStore(storageRoot).getConversationRuntime(
      "E:\\claudecodejingiang\\vscode-extension",
      "remote",
    );
    const task = await reloadedRuntime.getBackgroundTask("remote-review");

    expect(task).toMatchObject({
      id: "remote-review",
      taskType: "remote_agent",
      status: "running",
      metadata: {
        remoteTaskType: "ultrareview",
        sessionId: "sess-123",
        sessionUrl: "https://claude.ai/code/sessions/sess-123",
      },
    });
    expect(task && isBackgroundTaskLostAfterRestart(task)).toBe(false);
  });

  it("persists structured task timestamps and updates updatedAt on mutation", async () => {
    const runtime = await createRuntime();

    const created = await runtime.createTask({
      subject: "design task flow",
      description: "design details",
      activeForm: "designing",
      metadata: { scope: "tasks" },
    });
    await pause();
    const updated = await runtime.updateTask(created.id, {
      description: "design details v2",
    });

    expect(created.createdAt).toBeGreaterThan(0);
    expect(created.updatedAt).toBeGreaterThan(0);
    expect(updated).not.toBeNull();
    expect(updated!.createdAt).toBe(created.createdAt);
    expect(updated!.updatedAt).toBeGreaterThan(created.updatedAt);

    const reloaded = await runtime.getTask(created.id);
    expect(reloaded).toMatchObject({
      id: created.id,
      createdAt: created.createdAt,
      activeForm: "designing",
      metadata: { scope: "tasks" },
    });
    expect(reloaded!.updatedAt).toBe(updated!.updatedAt);
  });

  it("rejects self-referential and cyclic structured task dependencies", async () => {
    const runtime = await createRuntime();
    const first = await runtime.createTask({
      subject: "first",
      description: "first",
    });
    const second = await runtime.createTask({
      subject: "second",
      description: "second",
    });
    const third = await runtime.createTask({
      subject: "third",
      description: "third",
    });

    await expect(runtime.blockTask(first.id, first.id)).rejects.toThrow(
      /same task on both sides/,
    );

    await runtime.blockTask(first.id, second.id);
    await runtime.blockTask(second.id, third.id);

    await expect(runtime.blockTask(third.id, first.id)).rejects.toThrow(/create a cycle/);
  });
});
