import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { formatBuiltInAgentToolEvent } from "./agent/built-in/backgroundTask";
import {
  BackgroundTaskHost,
  buildBackgroundCommandTaskDescription,
} from "./backgroundTaskHost";
import { PersistentTaskRuntimeStore } from "./tasks/taskRuntime";

const tempDirs: string[] = [];

async function createStorageRoot(prefix: string): Promise<string> {
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(storageRoot);
  return storageRoot;
}

async function createTaskRuntime(
  storageRoot: string,
  workspaceRoot = "E:\\claudecodejingiang\\vscode-extension",
) {
  return new PersistentTaskRuntimeStore(storageRoot).getConversationRuntime(
    workspaceRoot,
    "background-host-test",
  );
}

async function flushAsyncWork() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("backgroundTaskHost helpers", () => {
  it("builds compact background command descriptions and follow-up messages", async () => {
    const storageRoot = await createStorageRoot("cain-background-host-");
    const runtime = await createTaskRuntime(storageRoot);
    const host = new BackgroundTaskHost({
      storageRoot,
      getTaskRuntime: () => runtime,
    });

    expect(buildBackgroundCommandTaskDescription("npm run build")).toBe(
      "Background command: npm run build",
    );
    expect(
      buildBackgroundCommandTaskDescription(
        "npm run build -- --long --long --long --long --long --long --long --long --long --long",
      ).endsWith("..."),
    ).toBe(true);
    expect(host.buildFollowUpMessage("Verification", "verify-1")).toContain(
      "TaskOutput",
    );
  });

  it("runs built-in agent sessions and persists tool event output", async () => {
    const storageRoot = await createStorageRoot("cain-background-host-");
    const runtime = await createTaskRuntime(storageRoot);
    const host = new BackgroundTaskHost({
      storageRoot,
      getTaskRuntime: () => runtime,
    });

    const result = await host.runBuiltInAgentSession({
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      commandText: "/review current diff",
      agentType: "review",
      taskId: "review-1",
      taskDescription: "Review agent",
      taskMetadata: {
        taskType: "built_in_agent",
        agentType: "review",
        agentSource: "built-in",
        agentColor: "blue",
        metadata: {
          originalTask: "Review current diff",
        },
      },
      taskStartOutput: "Started review",
      formatToolEvent: formatBuiltInAgentToolEvent,
      run: async (hooks) => {
        hooks.onToolStart("read_file", { path: "src/extension.ts" }, "exec-1");
        hooks.onToolEnd("exec-1", "done", false);
        return "Final review report";
      },
      finalizeSuccess: report => ({
        status: "completed",
        result: report,
        output: report,
      }),
    });

    await flushAsyncWork();
    const storedTask = await runtime.getBackgroundTask("review-1");

    expect(result).toBe("Final review report");
    expect(storedTask).toMatchObject({
      id: "review-1",
      status: "completed",
      result: "Final review report",
      metadata: {
        originalTask: "Review current diff",
      },
    });
    expect(storedTask?.output).toContain("[tool:start] read file");
    expect(storedTask?.output).toContain("[tool:end] read file done");
  });

  it("stops built-in agent sessions through the host controller", async () => {
    const storageRoot = await createStorageRoot("cain-background-host-");
    const runtime = await createTaskRuntime(storageRoot);
    const host = new BackgroundTaskHost({
      storageRoot,
      getTaskRuntime: () => runtime,
    });

    const runPromise = host.runBuiltInAgentSession({
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      commandText: "/verify",
      agentType: "verification",
      taskId: "verify-1",
      taskDescription: "Verification agent",
      taskMetadata: {
        taskType: "built_in_agent",
        agentType: "verification",
        agentSource: "built-in",
        agentColor: "red",
      },
      taskStartOutput: "Started verification",
      formatToolEvent: formatBuiltInAgentToolEvent,
      run: async (_hooks, abortSignal) =>
        await new Promise<string>((_resolve, reject) => {
          abortSignal.addEventListener("abort", () => reject(new Error("aborted")));
        }),
      finalizeSuccess: report => ({
        status: "completed",
        result: report,
        output: report,
      }),
    });

    let stopped;
    for (let attempt = 0; attempt < 10 && !stopped; attempt += 1) {
      await flushAsyncWork();
      stopped = await host.stopTask("verify-1");
    }

    expect(stopped).toEqual({
      taskId: "verify-1",
      taskType: "built_in_agent",
      command: "verification agent",
    });

    await expect(runPromise).rejects.toThrow("aborted");
    await flushAsyncWork();

    const storedTask = await runtime.getBackgroundTask("verify-1");
    expect(storedTask).toMatchObject({
      id: "verify-1",
      status: "cancelled",
      result: "Cancelled by TaskStop.",
      error: "Cancelled by TaskStop.",
    });
  });

  it("records failed verification terminal output and merges finalize metadata", async () => {
    const storageRoot = await createStorageRoot("cain-background-host-");
    const runtime = await createTaskRuntime(storageRoot);
    const host = new BackgroundTaskHost({
      storageRoot,
      getTaskRuntime: () => runtime,
    });

    const result = await host.runBuiltInAgentSession({
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      commandText: "/verify",
      agentType: "verification",
      taskId: "verify-fail-1",
      taskDescription: "Verification agent",
      taskMetadata: {
        taskType: "built_in_agent",
        agentType: "verification",
        agentSource: "built-in",
        agentColor: "red",
        metadata: {
          originalTask: "Implement detached task recovery",
        },
      },
      taskStartOutput: "Started verification",
      formatToolEvent: formatBuiltInAgentToolEvent,
      run: async () => "verification failed report",
      finalizeSuccess: report => ({
        status: "failed",
        result: report,
        output: report,
        error: "Verification finished with VERDICT: FAIL",
        metadata: {
          verificationVerdict: "FAIL",
        },
      }),
    });

    await flushAsyncWork();
    const storedTask = await runtime.getBackgroundTask("verify-fail-1");

    expect(result).toBe("verification failed report");
    expect(storedTask).toMatchObject({
      id: "verify-fail-1",
      status: "failed",
      result: "verification failed report",
      error: "Verification finished with VERDICT: FAIL",
      metadata: {
        originalTask: "Implement detached task recovery",
        verificationVerdict: "FAIL",
      },
    });
    expect(storedTask?.output).toContain(
      "[failed] Verification finished with VERDICT: FAIL",
    );
    expect(storedTask?.output).not.toContain(
      "[completed] Task completed successfully.",
    );
  });

  it("launches detached background commands, exposes reuse, and refreshes terminal state", async () => {
    const storageRoot = await createStorageRoot("cain-background-host-");
    const runtime = await createTaskRuntime(storageRoot);
    const host = new BackgroundTaskHost({
      storageRoot,
      getTaskRuntime: () => runtime,
      createBackgroundCommandTaskId: () => "cmd-1",
      launchDetachedBackgroundCommand: async () => ({ runnerPid: 4242 }),
    });

    const started = await host.runBackgroundCommand({
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      command: "npm run build",
    });

    const reusable = await host.findReusableBackgroundCommand(
      "E:\\claudecodejingiang\\vscode-extension",
      "npm run build",
    );

    expect(started).toEqual({
      taskId: "cmd-1",
      command: "npm run build",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
    });
    expect(reusable).toEqual(started);

    const initialTask = await runtime.getBackgroundTask("cmd-1");
    const detached = initialTask?.metadata?.detached as
      | { statePath?: string; outputPath?: string }
      | undefined;

    expect(detached?.statePath).toBeTruthy();
    expect(detached?.outputPath).toBeTruthy();

    await fs.writeFile(
      detached!.outputPath!,
      "Started background command:\nnpm run build\nstdout line\nstderr line\n[completed] Background command completed successfully.\n",
      "utf8",
    );
    await fs.writeFile(
      detached!.statePath!,
      JSON.stringify(
        {
          status: "completed",
          updatedAt: Date.now(),
          childPid: 4343,
          result: "Background command completed successfully.",
        },
        null,
        2,
      ),
      "utf8",
    );

    const refreshedTask = await runtime.getBackgroundTask("cmd-1");

    expect(refreshedTask).toMatchObject({
      id: "cmd-1",
      status: "completed",
      result: "Background command completed successfully.",
    });
    expect(refreshedTask?.output).toContain("stdout line");
    expect(refreshedTask?.output).toContain("stderr line");
  });

  it("stops detached background commands through the host controller", async () => {
    const storageRoot = await createStorageRoot("cain-background-host-");
    const runtime = await createTaskRuntime(storageRoot);
    const stopDetachedProcess = vi.fn(async () => undefined);
    const host = new BackgroundTaskHost({
      storageRoot,
      getTaskRuntime: () => runtime,
      createBackgroundCommandTaskId: () => "cmd-stop",
      launchDetachedBackgroundCommand: async () => ({ runnerPid: 999 }),
      stopDetachedProcess,
    });

    await host.runBackgroundCommand({
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      command: "npm run build",
    });

    const storedTask = await runtime.getBackgroundTask("cmd-stop");
    const detached = storedTask?.metadata?.detached as
      | { statePath?: string; cancelPath?: string }
      | undefined;
    await fs.writeFile(
      detached!.statePath!,
      JSON.stringify(
        {
          status: "running",
          updatedAt: Date.now(),
          childPid: 12345,
          runnerPid: 999,
        },
        null,
        2,
      ),
      "utf8",
    );

    const stopped = await host.stopTask(
      "cmd-stop",
      "E:\\claudecodejingiang\\vscode-extension",
    );

    expect(stopped).toEqual({
      taskId: "cmd-stop",
      taskType: "local_agent",
      command: "npm run build",
    });
    expect(stopDetachedProcess).toHaveBeenCalledWith(12345);
    await expect(fs.readFile(detached!.cancelPath!, "utf8")).resolves.toBe("cancelled");
  });
});
