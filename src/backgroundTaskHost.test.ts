import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { formatBuiltInAgentToolEvent } from "./agent/built-in/backgroundTask";
import {
  BackgroundTaskHost,
  buildBackgroundCommandTaskDescription,
  getDetachedWorkerSpawnEnvironment,
} from "./backgroundTaskHost";
import * as hooksTrigger from "./hooks/hooksTrigger";
import type { HookDefinition } from "./hooksRegistry";
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
  it("uses ELECTRON_RUN_AS_NODE when launching detached workers from Electron", () => {
    const env = getDetachedWorkerSpawnEnvironment({
      baseEnv: { PATH: "C:\\Windows\\System32" },
      isElectronHost: true,
    });
    expect(env.PATH).toBe("C:\\Windows\\System32");
    expect(env.ELECTRON_RUN_AS_NODE).toBe("1");

    const nodeEnv = getDetachedWorkerSpawnEnvironment({
      baseEnv: { PATH: "C:\\Windows\\System32" },
      isElectronHost: false,
    });
    expect(nodeEnv.ELECTRON_RUN_AS_NODE).toBeUndefined();
  });

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
      "You'll be notified when it completes",
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
      notified: true,
      metadata: {
        originalTask: "Review current diff",
      },
    });
    expect(storedTask?.output).toContain("[tool:start] read file");
    expect(storedTask?.output).toContain("[tool:end] read file done");
  });

  it("fires task and subagent hook events on successful built-in agent sessions", async () => {
    const storageRoot = await createStorageRoot("cain-background-host-");
    const runtime = await createTaskRuntime(storageRoot);
    const host = new BackgroundTaskHost({
      storageRoot,
      getTaskRuntime: () => runtime,
    });
    const triggerSpy = vi
      .spyOn(hooksTrigger, "triggerHooks")
      .mockResolvedValue({});
    const hooks: HookDefinition[] = [
      {
        id: "hooks-success",
        name: "Hooks Success",
        type: "prompt",
        description: "records event order",
        events: [
          "TaskCreated",
          "SubagentStart",
          "SubagentStop",
          "TaskCompleted",
        ],
        prompt: "noop",
      },
    ];

    await host.runBuiltInAgentSession({
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      commandText: "/review current diff",
      agentType: "review",
      taskId: "review-hooks-1",
      taskDescription: "Review agent",
      taskMetadata: {
        taskType: "built_in_agent",
        agentType: "review",
        agentSource: "built-in",
        agentColor: "blue",
      },
      taskStartOutput: "Started review",
      formatToolEvent: formatBuiltInAgentToolEvent,
      run: async () => "Final review report",
      finalizeSuccess: report => ({
        status: "completed",
        result: report,
        output: report,
      }),
      hooks,
      sessionId: "session-hooks-success",
    });

    expect(triggerSpy).toHaveBeenNthCalledWith(
      1,
      "TaskCreated",
      hooks,
      expect.objectContaining({
        workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
        sessionId: "session-hooks-success",
        toolName: "review-hooks-1",
        toolInput: {
          agentType: "review",
          description: "Review agent",
        },
      }),
    );
    expect(triggerSpy).toHaveBeenNthCalledWith(
      2,
      "SubagentStart",
      hooks,
      expect.objectContaining({
        sessionId: "session-hooks-success",
        toolName: "review",
        toolInput: { taskId: "review-hooks-1" },
      }),
    );
    expect(triggerSpy).toHaveBeenNthCalledWith(
      3,
      "SubagentStop",
      hooks,
      expect.objectContaining({
        sessionId: "session-hooks-success",
        toolName: "review",
        toolOutput: { taskId: "review-hooks-1", status: "success" },
      }),
    );
    expect(triggerSpy).toHaveBeenNthCalledWith(
      4,
      "TaskCompleted",
      hooks,
      expect.objectContaining({
        sessionId: "session-hooks-success",
        toolName: "review-hooks-1",
        toolOutput: {
          agentType: "review",
          status: "completed",
        },
      }),
    );
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
      notified: true,
    });
  });

  it("fires SubagentStop on failed built-in agent sessions", async () => {
    const storageRoot = await createStorageRoot("cain-background-host-");
    const runtime = await createTaskRuntime(storageRoot);
    const host = new BackgroundTaskHost({
      storageRoot,
      getTaskRuntime: () => runtime,
    });
    const triggerSpy = vi
      .spyOn(hooksTrigger, "triggerHooks")
      .mockResolvedValue({});
    const hooks: HookDefinition[] = [
      {
        id: "hooks-failure",
        name: "Hooks Failure",
        type: "prompt",
        description: "records failure event order",
        events: ["TaskCreated", "SubagentStart", "SubagentStop"],
        prompt: "noop",
      },
    ];

    await expect(
      host.runBuiltInAgentSession({
        workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
        commandText: "/verify",
        agentType: "verification",
        taskId: "verify-hooks-1",
        taskDescription: "Verification agent",
        taskMetadata: {
          taskType: "built_in_agent",
          agentType: "verification",
          agentSource: "built-in",
          agentColor: "red",
        },
        taskStartOutput: "Started verification",
        formatToolEvent: formatBuiltInAgentToolEvent,
        run: async () => {
          throw new Error("verification crashed");
        },
        finalizeSuccess: report => ({
          status: "completed",
          result: report,
          output: report,
        }),
        hooks,
        sessionId: "session-hooks-failure",
      }),
    ).rejects.toThrow("verification crashed");

    expect(triggerSpy).toHaveBeenNthCalledWith(
      1,
      "TaskCreated",
      hooks,
      expect.objectContaining({
        sessionId: "session-hooks-failure",
        toolName: "verify-hooks-1",
      }),
    );
    expect(triggerSpy).toHaveBeenNthCalledWith(
      2,
      "SubagentStart",
      hooks,
      expect.objectContaining({
        sessionId: "session-hooks-failure",
        toolName: "verification",
      }),
    );
    expect(triggerSpy).toHaveBeenNthCalledWith(
      3,
      "SubagentStop",
      hooks,
      expect.objectContaining({
        sessionId: "session-hooks-failure",
        toolName: "verification",
        toolOutput: { taskId: "verify-hooks-1", status: "error" },
      }),
    );
    expect(triggerSpy).toHaveBeenCalledTimes(3);
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
      notified: true,
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

    const initialTask = await runtime.getBackgroundTask("cmd-1");
    expect(initialTask?.taskType).toBe("local_bash");
    const detached = initialTask?.metadata?.detached as
      | { statePath?: string; outputPath?: string }
      | undefined;

    expect(started).toEqual({
      taskId: "cmd-1",
      command: "npm run build",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      outputPath: detached!.outputPath,
    });
    expect(reusable).toEqual(started);

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
      taskType: "local_bash",
      command: "npm run build",
    });
    expect(stopDetachedProcess).toHaveBeenCalledWith(12345);
    await expect(fs.readFile(detached!.cancelPath!, "utf8")).resolves.toBe("cancelled");
  });

  it("launches detached hosted reviews and refreshes the final report from worker state", async () => {
    const storageRoot = await createStorageRoot("cain-background-host-");
    const runtime = await createTaskRuntime(storageRoot);
    const host = new BackgroundTaskHost({
      storageRoot,
      getTaskRuntime: () => runtime,
      launchDetachedReview: async () => ({ runnerPid: 2024 }),
    });

    const started = await host.runDetachedRemoteReview({
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      commandText: "/ultrareview HEAD~2..HEAD",
      taskDescription: "Hosted review: HEAD~2..HEAD",
      reviewRequest: "Review the diff.",
      provider: {
        model: "claude-3-7-sonnet",
      },
      systemPrompt: "review prompt",
      sessionId: "session-hosted-review",
      remoteTaskType: "claude_cli_review",
      metadata: {
        diffRef: "HEAD~2..HEAD",
      },
    });

    const initialTask = await runtime.getBackgroundTask(started.taskId);
    const detached = initialTask?.metadata?.detached as
      | { statePath?: string; outputPath?: string }
      | undefined;

    expect(initialTask).toMatchObject({
      taskType: "remote_agent",
      status: "running",
    });
    expect(started.outputPath).toBe(detached?.outputPath);

    await fs.writeFile(
      detached!.outputPath!,
      "Started remote review:\n/ultrareview HEAD~2..HEAD\n### Findings\n- race condition\n",
      "utf8",
    );
    await fs.writeFile(
      detached!.statePath!,
      JSON.stringify(
        {
          status: "completed",
          updatedAt: Date.now(),
          childPid: 3030,
          result: "### Findings\n- race condition",
        },
        null,
        2,
      ),
      "utf8",
    );

    const refreshedTask = await runtime.getBackgroundTask(started.taskId);

    expect(refreshedTask).toMatchObject({
      status: "completed",
      result: "### Findings\n- race condition",
      metadata: {
        remoteTaskType: "claude_cli_review",
        diffRef: "HEAD~2..HEAD",
      },
    });
    expect(refreshedTask?.output).toContain("### Findings");
  });

  it("launches detached hosted verifications and refreshes the final report from worker state", async () => {
    const storageRoot = await createStorageRoot("cain-background-host-");
    const runtime = await createTaskRuntime(storageRoot);
    const host = new BackgroundTaskHost({
      storageRoot,
      getTaskRuntime: () => runtime,
      launchDetachedVerification: async () => ({ runnerPid: 2121 }),
    });

    const started = await host.runDetachedRemoteVerification({
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      commandText: "/ultraverify HEAD~2..HEAD",
      taskDescription: "Hosted verification: HEAD~2..HEAD",
      verificationRequest: "Verify the diff.",
      provider: {
        model: "claude-3-7-sonnet",
      },
      systemPrompt: "verification prompt",
      sessionId: "session-hosted-verify",
      remoteTaskType: "claude_cli_verification",
      metadata: {
        diffRef: "HEAD~2..HEAD",
      },
    });

    const initialTask = await runtime.getBackgroundTask(started.taskId);
    const detached = initialTask?.metadata?.detached as
      | { statePath?: string; outputPath?: string }
      | undefined;

    expect(initialTask).toMatchObject({
      taskType: "remote_agent",
      status: "running",
    });

    await fs.writeFile(
      detached!.outputPath!,
      "Started remote verification:\n/ultraverify HEAD~2..HEAD\nVERDICT: PASS\n",
      "utf8",
    );
    await fs.writeFile(
      detached!.statePath!,
      JSON.stringify(
        {
          status: "completed",
          updatedAt: Date.now(),
          childPid: 3131,
          result: "### Check: build\nVERDICT: PASS",
        },
        null,
        2,
      ),
      "utf8",
    );

    const refreshedTask = await runtime.getBackgroundTask(started.taskId);

    expect(refreshedTask).toMatchObject({
      status: "completed",
      result: "### Check: build\nVERDICT: PASS",
      metadata: {
        remoteTaskType: "claude_cli_verification",
        diffRef: "HEAD~2..HEAD",
      },
    });
    expect(refreshedTask?.output).toContain("VERDICT: PASS");
  });

  it("stops detached hosted reviews through the detached process controller", async () => {
    const storageRoot = await createStorageRoot("cain-background-host-");
    const runtime = await createTaskRuntime(storageRoot);
    const stopDetachedProcess = vi.fn(async () => undefined);
    const host = new BackgroundTaskHost({
      storageRoot,
      getTaskRuntime: () => runtime,
      launchDetachedReview: async () => ({ runnerPid: 4040 }),
      stopDetachedProcess,
    });

    const started = await host.runDetachedRemoteReview({
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      commandText: "/ultrareview HEAD~2..HEAD",
      taskDescription: "Hosted review: HEAD~2..HEAD",
      reviewRequest: "Review the diff.",
      provider: {},
      systemPrompt: "review prompt",
      sessionId: "session-hosted-review-stop",
      remoteTaskType: "claude_cli_review",
    });

    const storedTask = await runtime.getBackgroundTask(started.taskId);
    const detached = storedTask?.metadata?.detached as
      | { statePath?: string; cancelPath?: string }
      | undefined;
    await fs.writeFile(
      detached!.statePath!,
      JSON.stringify(
        {
          status: "running",
          updatedAt: Date.now(),
          childPid: 5050,
          runnerPid: 4040,
        },
        null,
        2,
      ),
      "utf8",
    );

    const stopped = await host.stopTask(
      started.taskId,
      "E:\\claudecodejingiang\\vscode-extension",
    );

    expect(stopped).toEqual({
      taskId: started.taskId,
      taskType: "remote_agent",
      command: "/ultrareview HEAD~2..HEAD",
    });
    expect(stopDetachedProcess).toHaveBeenCalledWith(5050);
    await expect(fs.readFile(detached!.cancelPath!, "utf8")).resolves.toBe("cancelled");
  });

  it("stops detached hosted verifications through the detached process controller", async () => {
    const storageRoot = await createStorageRoot("cain-background-host-");
    const runtime = await createTaskRuntime(storageRoot);
    const stopDetachedProcess = vi.fn(async () => undefined);
    const host = new BackgroundTaskHost({
      storageRoot,
      getTaskRuntime: () => runtime,
      launchDetachedVerification: async () => ({ runnerPid: 4141 }),
      stopDetachedProcess,
    });

    const started = await host.runDetachedRemoteVerification({
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      commandText: "/ultraverify HEAD~2..HEAD",
      taskDescription: "Hosted verification: HEAD~2..HEAD",
      verificationRequest: "Verify the diff.",
      provider: {},
      systemPrompt: "verification prompt",
      sessionId: "session-hosted-verify-stop",
      remoteTaskType: "claude_cli_verification",
    });

    const storedTask = await runtime.getBackgroundTask(started.taskId);
    const detached = storedTask?.metadata?.detached as
      | { statePath?: string; cancelPath?: string }
      | undefined;
    await fs.writeFile(
      detached!.statePath!,
      JSON.stringify(
        {
          status: "running",
          updatedAt: Date.now(),
          childPid: 5151,
          runnerPid: 4141,
        },
        null,
        2,
      ),
      "utf8",
    );

    const stopped = await host.stopTask(
      started.taskId,
      "E:\\claudecodejingiang\\vscode-extension",
    );

    expect(stopped).toEqual({
      taskId: started.taskId,
      taskType: "remote_agent",
      command: "/ultraverify HEAD~2..HEAD",
    });
    expect(stopDetachedProcess).toHaveBeenCalledWith(5151);
    await expect(fs.readFile(detached!.cancelPath!, "utf8")).resolves.toBe("cancelled");
  });

  it("stops remote agent tasks only through a configured archive adapter", async () => {
    const storageRoot = await createStorageRoot("cain-background-host-");
    const runtime = await createTaskRuntime(storageRoot);
    const archiveRemoteSession = vi.fn(async () => undefined);
    const host = new BackgroundTaskHost({
      storageRoot,
      getTaskRuntime: () => runtime,
      archiveRemoteSession,
    });

    await runtime.registerBackgroundTask({
      id: "remote-stop",
      taskType: "remote_agent",
      status: "running",
      description: "remote review task",
      command: "Review PR #42 remotely",
      metadata: {
        remoteTaskType: "ultrareview",
        sessionId: "sess-remote-stop",
      },
      output: "remote review started",
    });

    const stopped = await host.stopTask(
      "remote-stop",
      "E:\\claudecodejingiang\\vscode-extension",
    );
    const storedTask = await runtime.getBackgroundTask("remote-stop");

    expect(stopped).toEqual({
      taskId: "remote-stop",
      taskType: "remote_agent",
      command: "Review PR #42 remotely",
    });
    expect(archiveRemoteSession).toHaveBeenCalledWith("sess-remote-stop");
    expect(storedTask).toMatchObject({
      status: "killed",
      result: "Stopped by TaskStop.",
    });
  });

  it("uses Claude-style local_bash task IDs for background commands by default", async () => {
    const storageRoot = await createStorageRoot("cain-background-host-");
    const runtime = await createTaskRuntime(storageRoot);
    const host = new BackgroundTaskHost({
      storageRoot,
      getTaskRuntime: () => runtime,
      launchDetachedBackgroundCommand: async () => ({ runnerPid: 4242 }),
    });

    const started = await host.runBackgroundCommand({
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      command: "npm run build",
    });
    const task = await runtime.getBackgroundTask(started.taskId);

    expect(started.taskId).toMatch(/^b[0-9a-z]{8}$/);
    expect(task?.taskType).toBe("local_bash");
  });
});
