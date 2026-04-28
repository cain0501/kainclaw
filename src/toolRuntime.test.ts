import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildUtf8PowerShellEncodedCommand,
  executeTool,
  type ToolContext,
} from "./toolRuntime";
import {
  BACKGROUND_TASK_RUNTIME_RESTART_ERROR,
  PersistentTaskRuntimeStore,
} from "./tasks/taskRuntime";

const tempDirs: string[] = [];

async function createTaskContext(): Promise<ToolContext> {
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-tool-runtime-"));
  tempDirs.push(storageRoot);
  const runtime = new PersistentTaskRuntimeStore(storageRoot).getConversationRuntime(
    "E:\\claudecodejingiang\\vscode-extension",
    "tool-runtime-test",
  );

  return {
    workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
    tasks: runtime,
  };
}

async function createWorkspaceContext(): Promise<{ context: ToolContext; root: string }> {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-tool-workspace-"));
  tempDirs.push(workspaceRoot);
  return {
    root: workspaceRoot,
    context: {
      workspaceRoot,
    },
  };
}

async function createTaskContextWithStorageRoot(): Promise<{
  context: ToolContext;
  storageRoot: string;
}> {
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-tool-runtime-"));
  tempDirs.push(storageRoot);
  const runtime = new PersistentTaskRuntimeStore(storageRoot).getConversationRuntime(
    "E:\\claudecodejingiang\\vscode-extension",
    "tool-runtime-test",
  );

  return {
    storageRoot,
    context: {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      tasks: runtime,
    },
  };
}

async function writeManyFiles(directory: string, count: number, batchSize = 250) {
  for (let start = 0; start < count; start += batchSize) {
    const writes: Promise<unknown>[] = [];
    const end = Math.min(count, start + batchSize);
    for (let index = start; index < end; index += 1) {
      writes.push(fs.writeFile(path.join(directory, `file-${index}.txt`), "", "utf8"));
    }
    await Promise.all(writes);
  }
}

async function pause(ms = 5) {
  await new Promise(resolve => setTimeout(resolve, ms));
}

function parseJsonToolContent<T>(content: string): T {
  return JSON.parse(content) as T;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })),
  );
});

describe("toolRuntime PowerShell helpers", () => {
  it("wraps commands with UTF-8 console setup before encoding them", () => {
    const encoded = buildUtf8PowerShellEncodedCommand(
      "Get-ChildItem -Force | Select-Object Name",
    );
    const decoded = Buffer.from(encoded, "base64").toString("utf16le");

    expect(decoded).toContain("[Console]::InputEncoding = $utf8");
    expect(decoded).toContain("[Console]::OutputEncoding = $utf8");
    expect(decoded).toContain("$OutputEncoding = $utf8");
    expect(decoded).toContain("$ProgressPreference = 'SilentlyContinue'");
    expect(decoded).toContain("Get-ChildItem -Force | Select-Object Name");
  });
});

describe("toolRuntime installed skill model execution", () => {
  it("SkillTool loads a model-invocable installed skill and expands its prompt", async () => {
    const kainclawHome = await fs.mkdtemp(path.join(os.tmpdir(), "cain-kainclaw-home-"));
    const claudeHome = await fs.mkdtemp(path.join(os.tmpdir(), "cain-claude-home-"));
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-skill-workspace-"));
    tempDirs.push(kainclawHome, claudeHome, workspaceRoot);
    process.env.KAINCLAW_CONFIG_HOME = kainclawHome;
    process.env.CLAUDE_CONFIG_HOME = claudeHome;

    const skillDir = path.join(kainclawHome, "skills", "simple-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: simple-skill
description: Simple helper
when_to_use: Use for lightweight helper tasks.
arguments: query
---

Use the helper for: $query
`,
      "utf8",
    );

    const result = await executeTool(
      "SkillTool",
      {
        skill: "simple-skill",
        args: `"latest react docs"`,
      },
      { workspaceRoot },
    );

    expect(result.summary).toBe("Loaded installed skill simple-skill");
    expect(result.content).toContain('Loaded installed skill "/simple-skill".');
    expect(result.content).toContain("<installed_skill>");
    expect(result.content).toContain("Base directory for this skill:");
    expect(result.content).toContain("Use the helper for: latest react docs");
  });

  it("SkillTool rejects installed skills that are not model-invocable", async () => {
    const kainclawHome = await fs.mkdtemp(path.join(os.tmpdir(), "cain-kainclaw-home-"));
    const claudeHome = await fs.mkdtemp(path.join(os.tmpdir(), "cain-claude-home-"));
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cain-skill-workspace-"));
    tempDirs.push(kainclawHome, claudeHome, workspaceRoot);
    process.env.KAINCLAW_CONFIG_HOME = kainclawHome;
    process.env.CLAUDE_CONFIG_HOME = claudeHome;

    const skillDir = path.join(kainclawHome, "skills", "blocked-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: blocked-skill
description: Blocked helper
disable-model-invocation: true
---
`,
      "utf8",
    );

    await expect(
      executeTool(
        "SkillTool",
        {
          skill: "blocked-skill",
        },
        { workspaceRoot },
      ),
    ).rejects.toThrow(
      'Installed skill "blocked-skill" is not available for model invocation in this workspace.',
    );
  });
});

describe("toolRuntime background task semantics", () => {
  it("TaskStop rejects already completed background tasks like Claude stopTask", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "done-task",
      taskType: "local_agent",
      status: "completed",
      description: "finished task",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      output: "done",
    });

    await expect(
      executeTool("TaskStop", { task_id: "done-task" }, context),
    ).rejects.toThrow("Task done-task is not running (status: completed)");
  });

  it("TaskStop rejects unknown task ids like Claude stopTask", async () => {
    const context = await createTaskContext();

    await expect(
      executeTool("TaskStop", { task_id: "missing-stop-task" }, context),
    ).rejects.toThrow("No task found with ID: missing-stop-task");
  });

  it("TaskGet reports not_ready semantics for running background tasks", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "running-task",
      taskType: "local_agent",
      status: "running",
      description: "still running",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      output: "partial",
    });

    const result = await executeTool("TaskGet", { taskId: "running-task" }, context);

    expect(result.summary).toContain("not ready yet");
    expect(result.content).toContain("<retrieval_status>not_ready</retrieval_status>");
    expect(result.content).toContain(
      "<workspace_root>E:\\claudecodejingiang\\vscode-extension</workspace_root>",
    );
  });

  it("TaskGet follows Claude input contract and requires taskId", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "running-task-alias",
      taskType: "local_agent",
      status: "running",
      description: "still running",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      output: "partial",
    });

    await expect(
      executeTool("TaskGet", { task_id: "running-task-alias" }, context),
    ).rejects.toThrow("taskId is required");
  });

  it("TaskGet includes follow-up guidance for running remote background tasks", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "remote-running-task",
      taskType: "remote_agent",
      status: "running",
      description: "remote verification task",
      command: "Verify PR remotely",
      metadata: {
        remoteTaskType: "verification",
        sessionId: "sess-remote-123",
        sessionUrl: "https://claude.ai/code/sessions/sess-remote-123",
      },
      output: "remote task started",
    });

    const result = await executeTool("TaskGet", { taskId: "remote-running-task" }, context);

    expect(result.summary).toContain("not ready yet");
    expect(result.content).toContain("<retrieval_status>not_ready</retrieval_status>");
    expect(result.content).toContain(
      "<follow_up_hint>Remote task is still running. Check the remote session at https://claude.ai/code/sessions/sess-remote-123 for live progress.</follow_up_hint>",
    );
  });

  it("TaskGet returns structured not_found output for unknown task ids", async () => {
    const context = await createTaskContext();

    const result = await executeTool("TaskGet", { taskId: "missing-task" }, context);

    expect(result.summary).toContain("Task missing-task not found");
    expect(result.content).toContain("<retrieval_status>not_found</retrieval_status>");
    expect(result.content).toContain("<task_id>missing-task</task_id>");
  });

  it("TaskList supports kind, status, query, and limit filters", async () => {
    const context = await createTaskContext();
    const planTask = await context.tasks!.createTask({
      subject: "plan release",
      description: "prepare release plan",
    });
    const buildTask = await context.tasks!.createTask({
      subject: "build worker",
      description: "ship worker pipeline",
    });
    await context.tasks!.updateTask(buildTask.id, { status: "in_progress" });
    await context.tasks!.registerBackgroundTask({
      id: "build-bg-running",
      taskType: "local_agent",
      status: "running",
      description: "background build",
      command: "npm run build",
      output: "partial",
    });
    await context.tasks!.registerBackgroundTask({
      id: "review-bg-done",
      taskType: "built_in_agent",
      agentType: "review",
      agentSource: "built-in",
      status: "completed",
      description: "background review",
      output: "done",
    });

    const structuredResult = await executeTool(
      "TaskList",
      { kind: "structured", status: "in_progress", query: "worker" },
      context,
    );

    expect(structuredResult.summary).toContain("Listed 1 structured task");
    expect(structuredResult.content).toContain(
      "TaskList filters: kind=structured, status=in_progress, query=worker",
    );
    expect(structuredResult.content).toContain("Structured task counts (filtered): pending=0, in_progress=1, completed=0");
    expect(structuredResult.content).toContain("build worker");
    expect(structuredResult.content).not.toContain("plan release");
    expect(structuredResult.content).not.toContain("Background task counts");

    const backgroundResult = await executeTool(
      "TaskList",
      { kind: "background", status: "running", query: "build", limit: 1 },
      context,
    );

    expect(backgroundResult.summary).toContain("Listed 1 background task");
    expect(backgroundResult.content).toContain(
      "TaskList filters: kind=background, status=running, query=build, limit=1",
    );
    expect(backgroundResult.content).toContain(
      "Background task counts (filtered): pending=0, running=1, completed=0, failed=0, lost=0, killed=0, cancelled=0",
    );
    expect(backgroundResult.content).toContain("@build-bg-running [running]");
    expect(backgroundResult.content).not.toContain("@review-bg-done");
    expect(backgroundResult.content).not.toContain("Structured task counts");
    expect(planTask.id).toBe("1");
  });

  it("TodoWriteTool creates, updates, and deletes structured todos", async () => {
    const context = await createTaskContext();

    const createResult = await executeTool(
      "TodoWriteTool",
      {
        todos: [
          { content: "plan the release" },
          { content: "verify the release", status: "in_progress", activeForm: "verifying" },
        ],
      },
      context,
    );

    expect(createResult.summary).toContain("Applied 2 todo update(s)");
    expect(createResult.content).toContain("created #1: plan the release [pending]");
    expect(createResult.content).toContain("created #2: verify the release [in_progress]");

    const createdTasks = await context.tasks!.listTasks();
    expect(createdTasks[0]?.metadata?._todo).toBe(true);
    expect(createdTasks[1]?.metadata?._todo).toBe(true);

    const updateResult = await executeTool(
      "TodoWriteTool",
      {
        todos: [
          { id: "1", content: "plan the release checklist", status: "completed" },
          { id: "2", content: "verify the release", status: "deleted" },
        ],
      },
      context,
    );

    expect(updateResult.content).toContain("updated #1: plan the release checklist [completed]");
    expect(updateResult.content).toContain("deleted #2: verify the release");

    const taskOne = await context.tasks!.getTask("1");
    const taskTwo = await context.tasks!.getTask("2");
    expect(taskOne).toMatchObject({
      id: "1",
      subject: "plan the release checklist",
      status: "completed",
    });
    expect(taskTwo).toBeNull();
  });

  it("TaskGet includes structured task metadata and timestamps, and TaskList prefers newer updates within a status", async () => {
    const context = await createTaskContext();
    const older = await context.tasks!.createTask({
      subject: "older pending task",
      description: "older description",
    });
    await pause();
    const newer = await context.tasks!.createTask({
      subject: "newer pending task",
      description: "newer description",
      activeForm: "tracking",
      metadata: { scope: "tasks" },
    });

    const taskGet = await executeTool("TaskGet", { taskId: newer.id }, context);
    const taskList = await executeTool("TaskList", { kind: "structured" }, context);

    expect(taskGet.content).toContain(`Task #${newer.id}: newer pending task`);
    expect(taskGet.content).toContain("Active form: tracking");
    expect(taskGet.content).toContain("Metadata: {");
    expect(taskGet.content).toContain('"scope": "tasks"');
    expect(taskGet.content).toContain("Created:");
    expect(taskGet.content).toContain("Updated:");

    const olderIndex = taskList.content.indexOf(`#${older.id} [pending] older pending task`);
    const newerIndex = taskList.content.indexOf(`#${newer.id} [pending] newer pending task`);
    expect(newerIndex).toBeGreaterThanOrEqual(0);
    expect(olderIndex).toBeGreaterThanOrEqual(0);
    expect(newerIndex).toBeLessThan(olderIndex);
  });

  it("TaskGet reports lost semantics for restart-failed background tasks", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "lost-task",
      taskType: "local_agent",
      status: "lost",
      description: "lost task",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      output: "partial output",
      error: BACKGROUND_TASK_RUNTIME_RESTART_ERROR,
    });

    const result = await executeTool("TaskGet", { taskId: "lost-task" }, context);

    expect(result.summary).toContain("was lost when the task runtime restarted");
    expect(result.content).toContain("<retrieval_status>lost</retrieval_status>");
    expect(result.content).toContain("<runtime_state>lost_after_restart</runtime_state>");
  });

  it("TaskGet reports completed terminal semantics for background tasks", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "completed-task",
      taskType: "built_in_agent",
      agentType: "review",
      agentSource: "built-in",
      status: "completed",
      description: "completed review task",
      output: "done",
    });

    const result = await executeTool("TaskGet", { taskId: "completed-task" }, context);

    expect(result.summary).toContain("Loaded completed background task completed-task");
    expect(result.content).toContain("<status>completed</status>");
  });

  it("TaskGet reports cancelled terminal semantics for background tasks", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "cancelled-task-get",
      taskType: "local_agent",
      status: "cancelled",
      description: "cancelled task",
      output: "stopped",
    });

    const result = await executeTool("TaskGet", { taskId: "cancelled-task-get" }, context);

    expect(result.summary).toContain("Loaded cancelled background task cancelled-task-get");
    expect(result.content).toContain("<status>cancelled</status>");
  });

  it("TaskGet reports failed terminal semantics for background tasks", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "failed-task-get",
      taskType: "built_in_agent",
      agentType: "verification",
      agentSource: "built-in",
      status: "failed",
      description: "failed verification task",
      output: "VERDICT: FAIL",
      error: "Verification finished with VERDICT: FAIL",
    });

    const result = await executeTool("TaskGet", { taskId: "failed-task-get" }, context);

    expect(result.summary).toContain("Loaded failed background task failed-task-get");
    expect(result.content).toContain("<status>failed</status>");
  });

  it("TaskGet keeps detached background tasks in not_ready state after refresh", async () => {
    const { context, storageRoot } = await createTaskContextWithStorageRoot();
    const detachedDir = path.join(storageRoot, "background-commands", "detached-running");
    const statePath = path.join(detachedDir, "state.json");
    const outputPath = path.join(detachedDir, "output.log");
    const cancelPath = path.join(detachedDir, "cancelled.flag");

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
          updatedAt: Date.now(),
          childPid: 4567,
        },
        null,
        2,
      ),
      "utf8",
    );
    await context.tasks!.registerBackgroundTask({
      id: "detached-running",
      taskType: "local_agent",
      status: "running",
      description: "detached running task",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      output: "",
      metadata: {
        detached: {
          mode: "detached",
          statePath,
          outputPath,
          cancelPath,
        },
      },
    });

    const result = await executeTool("TaskGet", { taskId: "detached-running" }, context);

    expect(result.summary).toContain("not ready yet");
    expect(result.content).toContain("<retrieval_status>not_ready</retrieval_status>");
    expect(result.content).not.toContain("<runtime_state>lost_after_restart</runtime_state>");
    expect(result.content).toContain("partial output");
  });

  it("TaskGet and TaskOutput surface detached runtime fields from state snapshots", async () => {
    const { context, storageRoot } = await createTaskContextWithStorageRoot();
    const detachedDir = path.join(storageRoot, "background-commands", "cmd-observable");
    const statePath = path.join(detachedDir, "state.json");
    const outputPath = path.join(detachedDir, "output.log");
    const cancelPath = path.join(detachedDir, "cancelled.flag");
    const configPath = path.join(detachedDir, "config.json");

    await fs.mkdir(detachedDir, { recursive: true });
    await fs.writeFile(outputPath, "Started background command:\nnpm run build\npartial output\n", "utf8");
    await fs.writeFile(
      statePath,
      JSON.stringify(
        {
          status: "running",
          updatedAt: 10,
          runnerPid: 456,
          childPid: 789,
        },
        null,
        2,
      ),
      "utf8",
    );

    await context.tasks!.registerBackgroundTask({
      id: "cmd-observable",
      taskType: "local_agent",
      status: "running",
      description: "detached observable task",
      output: "",
      metadata: {
        detached: {
          mode: "detached",
          statePath,
          outputPath,
          cancelPath,
          configPath,
          runnerPid: 456,
        },
      },
    });

    const runningResult = await executeTool("TaskGet", { taskId: "cmd-observable" }, context);

    expect(runningResult.summary).toContain("not ready yet");
    expect(runningResult.content).toContain("<runner_pid>456</runner_pid>");
    expect(runningResult.content).toContain("<child_pid>789</child_pid>");
    expect(runningResult.content).not.toContain("<exit_code>");
    expect(runningResult.content).toContain(`<output_file>${outputPath}</output_file>`);
    expect(runningResult.content).toContain(`<state_file>${statePath}</state_file>`);
    expect(runningResult.content).toContain(`<cancel_file>${cancelPath}</cancel_file>`);
    expect(runningResult.content).toContain(`<config_file>${configPath}</config_file>`);

    await fs.writeFile(
      outputPath,
      "Started background command:\nnpm run build\npartial output\n[completed] ok\n",
      "utf8",
    );
    await fs.writeFile(
      statePath,
      JSON.stringify(
        {
          status: "completed",
          updatedAt: 20,
          runnerPid: 456,
          childPid: 789,
          exitCode: 0,
          result: "ok",
        },
        null,
        2,
      ),
      "utf8",
    );

    const completedResult = await executeTool("TaskOutput", { task_id: "cmd-observable" }, context);

    expect(completedResult.summary).toContain("Retrieved completed output");
    expect(completedResult.content).toContain("<runner_pid>456</runner_pid>");
    expect(completedResult.content).toContain("<child_pid>789</child_pid>");
    expect(completedResult.content).toContain("<exit_code>0</exit_code>");
    expect(completedResult.content).toContain(`<output_file>${outputPath}</output_file>`);
    expect(completedResult.content).toContain("<result>\nok\n</result>");
  });

  it("TaskGet includes metadata for background inspection tasks", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "review-meta-task",
      taskType: "built_in_agent",
      agentType: "review",
      agentSource: "built-in",
      agentColor: "blue",
      metadata: {
        originalTask: "Review the session flush flow",
        commandText: "/review HEAD~2..HEAD focus on regressions",
        extraGuidance: "focus on regressions",
        planFilePath: ".omx/plans/review.md",
        approvedAtUserTurnCount: 4,
        hasPlanContent: true,
      },
      status: "completed",
      description: "review metadata task",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      output: "done",
    });

    const result = await executeTool("TaskGet", { taskId: "review-meta-task" }, context);
    const outputResult = await executeTool(
      "TaskOutput",
      { task_id: "review-meta-task" },
      context,
    );

    expect(result.summary).toContain("Loaded completed background task review-meta-task");
    expect(result.content).toContain("<description>review metadata task</description>");
    expect(result.content).toContain(
      "<command_text>/review HEAD~2..HEAD focus on regressions</command_text>",
    );
    expect(result.content).toContain("<prompt>Review the session flush flow</prompt>");
    expect(result.content).toContain("<extra_guidance>focus on regressions</extra_guidance>");
    expect(result.content).toContain("<plan_file_path>.omx/plans/review.md</plan_file_path>");
    expect(result.content).toContain(
      "<approved_at_user_turn_count>4</approved_at_user_turn_count>",
    );
    expect(result.content).toContain("<has_plan_content>true</has_plan_content>");
    expect(result.content).toContain("<metadata>");
    expect(result.content).toContain("Review the session flush flow");
    expect(result.content).toContain("/review HEAD~2..HEAD focus on regressions");
    expect(result.content).toContain("focus on regressions");
    expect(outputResult.content).toContain(
      "<command_text>/review HEAD~2..HEAD focus on regressions</command_text>",
    );
    expect(outputResult.content).toContain(
      "<plan_file_path>.omx/plans/review.md</plan_file_path>",
    );
  });

  it("TaskGet and TaskOutput surface verification verdict as a first-class field", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "verify-verdict-task",
      taskType: "built_in_agent",
      agentType: "verification",
      agentSource: "built-in",
      agentColor: "red",
      metadata: {
        originalTask: "Verify detached task recovery",
        extraGuidance: "focus on restart behavior",
        verificationVerdict: "FAIL",
      },
      status: "failed",
      description: "verification metadata task",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      output: "VERDICT: FAIL",
      error: "Verification finished with VERDICT: FAIL",
    });

    const getResult = await executeTool("TaskGet", { taskId: "verify-verdict-task" }, context);
    const outputResult = await executeTool(
      "TaskOutput",
      { task_id: "verify-verdict-task" },
      context,
    );

    expect(getResult.content).toContain(
      "<verification_verdict>FAIL</verification_verdict>",
    );
    expect(getResult.content).toContain(
      "<extra_guidance>focus on restart behavior</extra_guidance>",
    );
    expect(outputResult.content).toContain(
      "<verification_verdict>FAIL</verification_verdict>",
    );
    expect(outputResult.content).toContain(
      "<extra_guidance>focus on restart behavior</extra_guidance>",
    );
    expect(outputResult.content).toContain("<metadata>");
  });

  it("ToolSearchTool searches built-in and MCP tools", async () => {
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      mcp: {
        getToolDefinitions: async () => [
          {
            name: "mcp__github__create_issue",
            description: "Create a GitHub issue",
            input_schema: { type: "object", properties: {} },
          },
        ],
        executeTool: async () => {
          throw new Error("not used");
        },
        listResources: async () => {
          throw new Error("not used");
        },
        readResource: async () => {
          throw new Error("not used");
        },
      },
    };

    const result = await executeTool(
      "ToolSearchTool",
      { query: "review", maxResults: 10 },
      context,
    );

    expect(result.summary).toContain('Found 1 tool match(es) for "review"');
    expect(result.content).toContain("RunReview");

    const mcpResult = await executeTool(
      "ToolSearchTool",
      { query: "issue", maxResults: 10 },
      context,
    );

    expect(mcpResult.content).toContain("mcp__github__create_issue");
  });

  it("ToolSearchTool supports Claude select, MCP prefix, required terms, and max_results", async () => {
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      mcp: {
        getToolDefinitions: async () => [
          {
            name: "mcp__github__create_issue",
            description: "Create a GitHub issue",
            input_schema: { type: "object", properties: {} },
          },
          {
            name: "mcp__github__list_pull_requests",
            description: "List GitHub pull requests",
            input_schema: { type: "object", properties: {} },
          },
          {
            name: "mcp__slack__send_message",
            description: "Send a Slack message",
            input_schema: { type: "object", properties: {} },
          },
        ],
        executeTool: async () => {
          throw new Error("not used");
        },
        listResources: async () => {
          throw new Error("not used");
        },
        readResource: async () => {
          throw new Error("not used");
        },
      },
    };

    const selected = await executeTool(
      "ToolSearchTool",
      { query: "select:RunReview,mcp__github__create_issue,missing" },
      context,
    );

    expect(selected.content).toContain("RunReview");
    expect(selected.content).toContain("mcp__github__create_issue");
    expect(selected.content).not.toContain("- missing");

    const prefixed = await executeTool(
      "ToolSearchTool",
      { query: "mcp__github", max_results: 1 },
      context,
    );

    expect(prefixed.content).toContain("mcp__github__create_issue");
    expect(prefixed.content).not.toContain("mcp__github__list_pull_requests");
    expect(prefixed.content).not.toContain("mcp__slack__send_message");

    const required = await executeTool(
      "ToolSearchTool",
      { query: "+github issue", maxResults: 10 },
      context,
    );

    expect(required.content).toContain("mcp__github__create_issue");
    expect(required.content).not.toContain("mcp__slack__send_message");
  });

  it("ToolSearchTool resolves deprecated Claude task aliases to canonical tools", async () => {
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
    };

    const exact = await executeTool(
      "ToolSearchTool",
      { query: "KillShell", maxResults: 10 },
      context,
    );
    const selected = await executeTool(
      "ToolSearchTool",
      { query: "select:AgentOutputTool,BashOutputTool", maxResults: 10 },
      context,
    );

    expect(exact.content).toContain("- `TaskStop`");
    expect(exact.content).not.toContain("- `KillShell`");
    expect(selected.content).toContain("- `TaskOutput`");
    expect(selected.content.match(/- `TaskOutput`/g)).toHaveLength(1);
    expect(selected.content).not.toContain("- `AgentOutputTool`");
    expect(selected.content).not.toContain("- `BashOutputTool`");
  });

  it("ToolSearchTool does not advertise LSP when the runtime is unavailable", async () => {
    const unavailableContext: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
    };

    const unavailableResult = await executeTool(
      "ToolSearchTool",
      { query: "LSP", maxResults: 10 },
      unavailableContext,
    );

    expect(unavailableResult.content).not.toContain("- `LSP`");

    const availableContext: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      lsp: {
        isAvailable: () => true,
        query: async () => ({ summary: "ok", content: "ok" }),
      },
    };

    const availableResult = await executeTool(
      "ToolSearchTool",
      { query: "LSP", maxResults: 10 },
      availableContext,
    );

    expect(availableResult.content).toContain("- `LSP`");
  });

  it("LSP accepts Claude documentSymbol and forwards the internal operation", async () => {
    const query = vi.fn(async () => ({ summary: "ok", content: "ok" }));
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      lsp: {
        query,
      },
    };

    const result = await executeTool(
      "LSP",
      { operation: "documentSymbol", filePath: "src/lsp/types.ts" },
      context,
    );

    expect(result.summary).toBe("ok");
    expect(query).toHaveBeenCalledWith({
      operation: "documentSymbols",
      filePath: "src/lsp/types.ts",
      line: undefined,
      character: undefined,
      query: undefined,
      severity: undefined,
      maxResults: undefined,
      itemIndex: undefined,
    });
  });

  it("LSP accepts Claude workspaceSymbol and forwards an empty query", async () => {
    const query = vi.fn(async () => ({ summary: "ok", content: "ok" }));
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      lsp: {
        query,
      },
    };

    await executeTool("LSP", { operation: "workspaceSymbol" }, context);

    expect(query).toHaveBeenCalledWith({
      operation: "workspaceSymbols",
      filePath: undefined,
      line: undefined,
      character: undefined,
      query: "",
      severity: undefined,
      maxResults: undefined,
      itemIndex: undefined,
    });
  });

  it("TaskList orders structured tasks by status priority", async () => {
    const context = await createTaskContext();
    const first = await context.tasks!.createTask({
      subject: "first pending",
      description: "first pending",
    });
    const second = await context.tasks!.createTask({
      subject: "second in progress",
      description: "second in progress",
    });
    const third = await context.tasks!.createTask({
      subject: "third completed",
      description: "third completed",
    });

    await context.tasks!.updateTask(second.id, { status: "in_progress" });
    await context.tasks!.updateTask(third.id, { status: "completed" });

    const result = await executeTool("TaskList", {}, context);

    const inProgressIndex = result.content.indexOf("second in progress");
    const pendingIndex = result.content.indexOf("first pending");
    const completedIndex = result.content.indexOf("third completed");

    expect(inProgressIndex).toBeGreaterThanOrEqual(0);
    expect(pendingIndex).toBeGreaterThan(inProgressIndex);
    expect(completedIndex).toBeGreaterThan(pendingIndex);
    expect(result.content).toContain(
      "Structured task counts: pending=1, in_progress=1, completed=1",
    );
  });

  it("RunCommandInBackground reuses an existing command task before approval", async () => {
    let approvalRequested = false;
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      findReusableBackgroundCommand: async () => ({
        taskId: "cmd-existing",
        command: "npm run build",
        workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      }),
      runCommandInBackground: async () => {
        throw new Error("should not launch a new background command");
      },
      requestToolApproval: async () => {
        approvalRequested = true;
        return true;
      },
    };

    const result = await executeTool(
      "RunCommandInBackground",
      { command: "npm run build" },
      context,
    );

    expect(approvalRequested).toBe(false);
    expect(result.summary).toContain("already running");
    expect(result.content).toContain("<task_id>cmd-existing</task_id>");
    expect(result.content).toContain("<status>already_running</status>");
  });

  it("VerifyPlanExecution returns reusable status when a verification task is already running", async () => {
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      planVerification: {
        pending: true,
        planFilePath: ".omx/plans/test.md",
        verificationStarted: false,
        verificationCompleted: false,
      },
      runVerification: async () => {
        throw new Error(
          'A verification agent is already running for this conversation (verify-123). You\'ll be notified when it completes. Use TaskOutput with task_id "verify-123" only if you need to inspect partial output before that.',
        );
      },
    };

    const result = await executeTool("VerifyPlanExecution", {}, context);

    expect(result.summary).toContain("already running");
    expect(result.content).toContain("<task_id>verify-123</task_id>");
    expect(result.content).toContain("<status>already_running</status>");
    expect(result.content).toContain("<plan_file_path>.omx/plans/test.md</plan_file_path>");
  });

  it("VerifyPlanExecution includes the plan file path in success output", async () => {
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      planVerification: {
        pending: true,
        planFilePath: ".omx/plans/ship.md",
        verificationStarted: false,
        verificationCompleted: false,
      },
      runVerification: async () => ({
        taskId: "verify-plan-1",
        verdict: "PASS",
        report: "VERDICT: PASS",
      }),
    };

    const result = await executeTool("VerifyPlanExecution", {}, context);

    expect(result.summary).toBe("Plan verification PASS (verify-plan-1)");
    expect(result.content).toContain("<task_id>verify-plan-1</task_id>");
    expect(result.content).toContain("<plan_file_path>.omx/plans/ship.md</plan_file_path>");
    expect(result.content).toContain("<verdict>PASS</verdict>");
  });

  it("RunVerification includes the plan file path when a plan verification is pending", async () => {
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      planVerification: {
        pending: true,
        planFilePath: ".omx/plans/verify.md",
        verificationStarted: false,
        verificationCompleted: false,
      },
      runVerification: async () => ({
        taskId: "verify-standalone-1",
        verdict: "PASS",
        report: "VERDICT: PASS",
      }),
    };

    const result = await executeTool("RunVerification", {}, context);

    expect(result.summary).toBe("Verification PASS (verify-standalone-1)");
    expect(result.content).toContain("<task_id>verify-standalone-1</task_id>");
    expect(result.content).toContain("<plan_file_path>.omx/plans/verify.md</plan_file_path>");
    expect(result.content).toContain("<verdict>PASS</verdict>");
  });

  it("RunVerification forwards diffRef and surfaces it in success output", async () => {
    const runVerification = vi.fn(async () => ({
      taskId: "verify-diff-tool",
      verdict: "PASS" as const,
      report: "VERDICT: PASS",
    }));
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      runVerification,
    };

    const result = await executeTool(
      "RunVerification",
      { diffRef: "HEAD~3..HEAD", guidance: "focus on tests" },
      context,
    );

    expect(runVerification).toHaveBeenCalledWith({
      diffRef: "HEAD~3..HEAD",
      extraGuidance: "focus on tests",
    });
    expect(result.content).toContain("<diff_ref>HEAD~3..HEAD</diff_ref>");
  });

  it("RunVerification returns plan file path in already-running output when plan verification is pending", async () => {
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      planVerification: {
        pending: true,
        planFilePath: ".omx/plans/verify.md",
        verificationStarted: false,
        verificationCompleted: false,
      },
      runVerification: async () => {
        throw new Error(
          'A verification agent is already running for this conversation (verify-standalone-2). You\'ll be notified when it completes. Use TaskOutput with task_id "verify-standalone-2" only if you need to inspect partial output before that.',
        );
      },
    };

    const result = await executeTool("RunVerification", {}, context);

    expect(result.summary).toContain("already running");
    expect(result.content).toContain("<task_id>verify-standalone-2</task_id>");
    expect(result.content).toContain("<status>already_running</status>");
    expect(result.content).toContain("<plan_file_path>.omx/plans/verify.md</plan_file_path>");
  });

  it("RunReview includes the plan file path when a plan verification is pending", async () => {
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      planVerification: {
        pending: true,
        planFilePath: ".omx/plans/review.md",
        verificationStarted: false,
        verificationCompleted: false,
      },
      runReview: async () => ({
        taskId: "review-standalone-1",
        report: "review report",
      }),
    };

    const result = await executeTool("RunReview", {}, context);

    expect(result.summary).toBe("Review completed (review-standalone-1)");
    expect(result.content).toContain("<task_id>review-standalone-1</task_id>");
    expect(result.content).toContain("<plan_file_path>.omx/plans/review.md</plan_file_path>");
    expect(result.content).toContain("<report>");
  });

  it("RunReview returns plan file path in already-running output when plan verification is pending", async () => {
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      planVerification: {
        pending: true,
        planFilePath: ".omx/plans/review.md",
        verificationStarted: false,
        verificationCompleted: false,
      },
      runReview: async () => {
        throw new Error(
          'A review agent is already running for this conversation (review-standalone-2). You\'ll be notified when it completes. Use TaskOutput with task_id "review-standalone-2" only if you need to inspect partial output before that.',
        );
      },
    };

    const result = await executeTool("RunReview", {}, context);

    expect(result.summary).toContain("already running");
    expect(result.content).toContain("<task_id>review-standalone-2</task_id>");
    expect(result.content).toContain("<status>already_running</status>");
    expect(result.content).toContain("<plan_file_path>.omx/plans/review.md</plan_file_path>");
  });

  it("RunReview forwards diffRef and surfaces it in already-running output", async () => {
    const runReview = vi.fn(async () => {
      throw new Error(
        'A review agent is already running for this conversation (review-diff-tool). You\'ll be notified when it completes. Use TaskOutput with task_id "review-diff-tool" only if you need to inspect partial output before that.',
      );
    });
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      runReview,
    };

    const result = await executeTool(
      "RunReview",
      { diffRef: "main...HEAD", guidance: "focus on regressions" },
      context,
    );

    expect(runReview).toHaveBeenCalledWith({
      diffRef: "main...HEAD",
      extraGuidance: "focus on regressions",
    });
    expect(result.content).toContain("<status>already_running</status>");
    expect(result.content).toContain("<diff_ref>main...HEAD</diff_ref>");
  });

  it("TaskStop returns Claude-compatible JSON output for running background tasks", async () => {
    const context = await createTaskContext();
    context.stopBackgroundTask = async taskId => ({
      taskId,
      taskType: "local_bash",
      command: "npm run build",
    });
    await context.tasks!.registerBackgroundTask({
      id: "running-stop",
      taskType: "local_bash",
      status: "running",
      description: "running task",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      command: "npm run build",
      output: "partial",
    });

    const result = await executeTool("TaskStop", { task_id: "running-stop" }, context);

    expect(result.summary).toContain("Stopped background task");
    expect(parseJsonToolContent(result.content)).toEqual({
      message: "Successfully stopped task: running-stop (npm run build)",
      task_id: "running-stop",
      task_type: "local_bash",
      command: "npm run build",
    });
  });

  it("TaskStop returns only the Claude stop payload for diff-aware built-in tasks", async () => {
    const context = await createTaskContext();
    context.stopBackgroundTask = async taskId => ({
      taskId,
      taskType: "built_in_agent",
      command: "Run review task",
    });
    await context.tasks!.registerBackgroundTask({
      id: "review-stop-provenance",
      taskType: "built_in_agent",
      agentType: "review",
      agentSource: "built-in",
      status: "running",
      description: "review task",
      command: "Run review task",
      metadata: {
        commandText: "/review main...HEAD -- focus on regressions",
        originalTask: "Review the recent diff",
        extraGuidance: "focus on regressions",
        planFilePath: ".omx/plans/review.md",
        diffRef: "main...HEAD",
      },
      output: "review started",
    });

    const result = await executeTool(
      "TaskStop",
      { task_id: "review-stop-provenance" },
      context,
    );

    expect(result.summary).toContain("Stopped background task");
    expect(parseJsonToolContent(result.content)).toEqual({
      message: "Successfully stopped task: review-stop-provenance (Run review task)",
      task_id: "review-stop-provenance",
      task_type: "built_in_agent",
      command: "Run review task",
    });
  });

  it("TaskStop accepts shell_id for deprecated KillShell compatibility", async () => {
    const context = await createTaskContext();
    context.stopBackgroundTask = async taskId => ({
      taskId,
      taskType: "local_bash",
      command: "npm run build",
    });
    await context.tasks!.registerBackgroundTask({
      id: "running-stop-alias",
      taskType: "local_bash",
      status: "running",
      description: "running alias task",
      command: "npm run build",
      output: "partial",
    });

    const result = await executeTool("TaskStop", { shell_id: "running-stop-alias" }, context);

    expect(result.summary).toContain("Stopped background task");
    expect(parseJsonToolContent(result.content)).toEqual({
      message: "Successfully stopped task: running-stop-alias (npm run build)",
      task_id: "running-stop-alias",
      task_type: "local_bash",
      command: "npm run build",
    });
  });

  it("TaskStop accepts the deprecated KillShell tool alias like Claude", async () => {
    const context = await createTaskContext();
    context.stopBackgroundTask = async taskId => ({
      taskId,
      taskType: "local_bash",
      command: "npm run build",
    });
    await context.tasks!.registerBackgroundTask({
      id: "running-killshell-alias",
      taskType: "local_bash",
      status: "running",
      description: "running KillShell alias task",
      command: "npm run build",
      output: "partial",
    });

    const result = await executeTool(
      "KillShell",
      { shell_id: "running-killshell-alias" },
      context,
    );

    expect(result.summary).toContain("Stopped background task");
    expect(parseJsonToolContent(result.content)).toEqual({
      message: "Successfully stopped task: running-killshell-alias (npm run build)",
      task_id: "running-killshell-alias",
      task_type: "local_bash",
      command: "npm run build",
    });
  });

  it("TaskStop rejects completed built-in tasks instead of returning provenance", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "verify-completed-stop",
      taskType: "built_in_agent",
      agentType: "verification",
      agentSource: "built-in",
      status: "completed",
      description: "verification task",
      command: "Run verification task",
      metadata: {
        commandText: "/verify HEAD~2..HEAD -- focus on tests",
        originalTask: "Verify the recent change set",
        verificationVerdict: "PASS",
        planFilePath: ".omx/plans/verify.md",
        diffRef: "HEAD~2..HEAD",
      },
      output: "verification complete",
      result: "PASS",
    });

    await expect(
      executeTool("TaskStop", { task_id: "verify-completed-stop" }, context),
    ).rejects.toThrow("Task verify-completed-stop is not running (status: completed)");
  });

  it("TaskStop rejects running remote tasks without a stop pathway", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "remote-running-stop",
      taskType: "remote_agent",
      status: "running",
      description: "remote running task",
      command: "Review PR #42 remotely",
      metadata: {
        remoteTaskType: "ultrareview",
        sessionId: "sess-123",
      },
      output: "remote task started",
    });

    await expect(
      executeTool("TaskStop", { task_id: "remote-running-stop" }, context),
    ).rejects.toThrow("Unsupported task type: remote_agent");
    const storedTask = await context.tasks!.getBackgroundTask("remote-running-stop");

    expect(storedTask?.status).toBe("running");
  });

  it("TaskStop records Claude-style killed status for adapter-backed remote tasks", async () => {
    const context = await createTaskContext();
    context.stopBackgroundTask = async taskId => ({
      taskId,
      taskType: "remote_agent",
      command: "Review PR #42 remotely",
    });
    await context.tasks!.registerBackgroundTask({
      id: "remote-running-kill",
      taskType: "remote_agent",
      status: "running",
      description: "remote running task",
      command: "Review PR #42 remotely",
      metadata: {
        remoteTaskType: "ultrareview",
        sessionId: "sess-456",
      },
      output: "remote task started",
    });

    const result = await executeTool("TaskStop", { task_id: "remote-running-kill" }, context);
    const storedTask = await context.tasks!.getBackgroundTask("remote-running-kill");

    expect(parseJsonToolContent(result.content)).toEqual({
      message: "Successfully stopped task: remote-running-kill (Review PR #42 remotely)",
      task_id: "remote-running-kill",
      task_type: "remote_agent",
      command: "Review PR #42 remotely",
    });
    expect(storedTask).toMatchObject({
      status: "killed",
      result: "Stopped by TaskStop.",
    });
    expect(storedTask?.error).toBeUndefined();
  });

  it("TaskStop rejects completed remote tasks", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "remote-completed-stop",
      taskType: "remote_agent",
      status: "completed",
      description: "remote completed task",
      command: "Verify remotely",
      metadata: {
        remoteTaskType: "verification",
        sessionId: "sess-completed-123",
        sessionUrl: "https://claude.ai/code/sessions/sess-completed-123",
      },
      output: "remote task completed",
    });

    await expect(
      executeTool("TaskStop", { task_id: "remote-completed-stop" }, context),
    ).rejects.toThrow("Task remote-completed-stop is not running (status: completed)");
  });

  it("TaskStop rejects lost runtime-restart tasks", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "lost-stop",
      taskType: "local_agent",
      status: "lost",
      description: "lost stop task",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      command: "npm run build",
      output: "partial",
      error: BACKGROUND_TASK_RUNTIME_RESTART_ERROR,
    });

    await expect(
      executeTool("TaskStop", { task_id: "lost-stop" }, context),
    ).rejects.toThrow("Task lost-stop is not running (status: lost)");
  });

  it("TaskOutput distinguishes cancelled terminal state in summary", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "cancelled-task",
      taskType: "local_agent",
      status: "cancelled",
      description: "cancelled task",
      command: "npm run build",
      output: "stopped",
    });

    const result = await executeTool("TaskOutput", { task_id: "cancelled-task" }, context);

    expect(result.summary).toContain("cancelled output");
    expect(result.content).toContain("<description>cancelled task</description>");
    expect(result.content).toContain("<command>npm run build</command>");
    expect(result.content).toContain("<status>cancelled</status>");
  });

  it("TaskOutput distinguishes killed remote terminal state in summary", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "killed-remote-task",
      taskType: "remote_agent",
      status: "killed",
      description: "killed remote task",
      command: "Review PR #42 remotely",
      metadata: {
        remoteTaskType: "ultrareview",
        sessionId: "sess-killed",
      },
      output: "remote stopped",
      result: "Stopped by TaskStop.",
    });

    const result = await executeTool("TaskOutput", { task_id: "killed-remote-task" }, context);

    expect(result.summary).toContain("killed output");
    expect(result.content).toContain("<task_type>remote_agent</task_type>");
    expect(result.content).toContain("<status>killed</status>");
    expect(result.content).toContain("<result>\nStopped by TaskStop.\n</result>");
  });

  it("TaskOutput reports lost retrieval status for restart-failed tasks", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "lost-output",
      taskType: "local_agent",
      status: "lost",
      description: "lost output task",
      output: "partial output",
      error: BACKGROUND_TASK_RUNTIME_RESTART_ERROR,
    });

    const result = await executeTool("TaskOutput", { task_id: "lost-output" }, context);

    expect(result.summary).toContain("was lost when the task runtime restarted");
    expect(result.content).toContain("<retrieval_status>lost</retrieval_status>");
    expect(result.content).toContain("<status>lost</status>");
    expect(result.content).toContain(
      "<recovery_hint>Runtime restart interrupted this task before completion. Re-run it if you still need fresh output.</recovery_hint>",
    );
  });

  it("TaskOutput block=false reports not_ready status for running tasks", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "running-output",
      taskType: "local_agent",
      status: "running",
      description: "running output task",
      output: "partial output",
    });

    const result = await executeTool(
      "TaskOutput",
      { task_id: "running-output", block: false },
      context,
    );

    expect(result.summary).toContain("not ready yet");
    expect(result.content).toContain("<retrieval_status>not_ready</retrieval_status>");
  });

  it("TaskOutput accepts deprecated AgentOutputTool and BashOutputTool aliases like Claude", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "completed-output-alias",
      taskType: "local_bash",
      status: "completed",
      description: "completed output alias task",
      command: "npm run build",
      output: "build ok",
      result: "build ok",
    });

    const agentAliasResult = await executeTool(
      "AgentOutputTool",
      { task_id: "completed-output-alias", block: false },
      context,
    );
    const bashAliasResult = await executeTool(
      "BashOutputTool",
      { task_id: "completed-output-alias", block: false },
      context,
    );

    for (const result of [agentAliasResult, bashAliasResult]) {
      expect(result.summary).toContain("Retrieved output");
      expect(result.content).toContain("<task_id>completed-output-alias</task_id>");
      expect(result.content).toContain("<output>\nbuild ok\n</output>");
    }
  });

  it("TaskOutput follows Claude input contract and rejects shell_id aliases", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "running-output-alias",
      taskType: "local_agent",
      status: "running",
      description: "running output alias task",
      output: "partial output",
    });

    await expect(
      executeTool(
        "TaskOutput",
        { shell_id: "running-output-alias", block: false },
        context,
      ),
    ).rejects.toThrow("task_id is required");
  });

  it("TaskOutput returns structured not_found output for unknown task ids", async () => {
    const context = await createTaskContext();

    const result = await executeTool(
      "TaskOutput",
      { task_id: "missing-output-task", block: false },
      context,
    );

    expect(result.summary).toContain("Task missing-output-task not found");
    expect(result.content).toContain("<retrieval_status>not_found</retrieval_status>");
    expect(result.content).toContain("<task_id>missing-output-task</task_id>");
  });

  it("TaskOutput block=true reports timeout summary when task is still running", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "running-timeout",
      taskType: "local_agent",
      status: "running",
      description: "running timeout task",
      output: "partial output",
    });

    const result = await executeTool(
      "TaskOutput",
      { task_id: "running-timeout", timeout: 0 },
      context,
    );

    expect(result.summary).toContain("Timed out waiting for task");
    expect(result.content).toContain("<retrieval_status>timeout</retrieval_status>");
  });

  it("TaskOutput block=true propagates abort signals while waiting like Claude TaskOutput", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "running-abort",
      taskType: "local_agent",
      status: "running",
      description: "abortable task",
      output: "partial output",
    });

    const abortController = new AbortController();
    abortController.abort();

    await expect(
      executeTool(
        "TaskOutput",
        { task_id: "running-abort", timeout: 1000 },
        {
          ...context,
          abortSignal: abortController.signal,
        },
      ),
    ).rejects.toThrow("Background task wait aborted.");
  });

  it("TaskOutput block=true includes follow-up guidance for remote tasks that are still running", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "remote-timeout",
      taskType: "remote_agent",
      status: "running",
      description: "remote review task",
      command: "Review PR #42 remotely",
      metadata: {
        remoteTaskType: "ultrareview",
        sessionId: "sess-remote-timeout",
        sessionUrl: "https://claude.ai/code/sessions/sess-remote-timeout",
      },
      output: "remote review started",
    });

    const result = await executeTool(
      "TaskOutput",
      { task_id: "remote-timeout", timeout: 0 },
      context,
    );

    expect(result.summary).toContain("Timed out waiting for task");
    expect(result.content).toContain("<retrieval_status>timeout</retrieval_status>");
    expect(result.content).toContain(
      "<follow_up_hint>Remote task is still running. Check the remote session at https://claude.ai/code/sessions/sess-remote-timeout for live progress.</follow_up_hint>",
    );
  });

  it("TaskOutput reports not_found when a task disappears while waiting", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "vanished-task",
      taskType: "local_agent",
      status: "running",
      description: "vanished task",
      output: "partial output",
    });

    context.tasks!.waitForBackgroundTask = async () => null;

    const result = await executeTool(
      "TaskOutput",
      { task_id: "vanished-task", timeout: 1 },
      context,
    );

    expect(result.summary).toContain("was not found while waiting for output");
    expect(result.content).toContain("<retrieval_status>not_found</retrieval_status>");
    expect(result.content).toContain("<task_id>vanished-task</task_id>");
  });

  it("TaskList includes workspace_root context in background task summaries", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "bg-workspace",
      taskType: "local_agent",
      status: "running",
      description: "workspace summary task",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      output: "",
    });

    const result = await executeTool("TaskList", {}, context);

    expect(result.content).toContain("root E:\\claudecodejingiang\\vscode-extension");
  });

  it("TaskList surfaces built-in inspection invocation text for provenance", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "review-invocation",
      taskType: "built_in_agent",
      agentType: "review",
      agentSource: "built-in",
      status: "running",
      description: "review task",
      output: "",
      metadata: {
        commandText: "/review HEAD~1..HEAD -- focus on regressions",
        originalTask: "Review task lifecycle parity",
        planFilePath: ".omx/plans/review.md",
      },
    });

    const result = await executeTool("TaskList", { kind: "background" }, context);

    expect(result.content).toContain(
      "invocation /review HEAD~1..HEAD -- focus on regressions",
    );
    expect(result.content).toContain("prompt Review task lifecycle parity");
    expect(result.content).toContain("plan .omx/plans/review.md");
  });

  it("TaskList surfaces verification verdict for built-in verification tasks", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "verification-verdict-list",
      taskType: "built_in_agent",
      agentType: "verification",
      agentSource: "built-in",
      status: "failed",
      description: "verification task",
      output: "VERDICT: FAIL",
      metadata: {
        verificationVerdict: "FAIL",
        diffRef: "HEAD~2..HEAD",
      },
    });

    const result = await executeTool("TaskList", { kind: "background" }, context);

    expect(result.content).toContain(
      "@verification-verdict-list [failed] verification agent | diffRef HEAD~2..HEAD | verdict FAIL",
    );
  });

  it("TaskList does not add a verdict label when verification verdict is absent", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "verification-no-verdict-list",
      taskType: "built_in_agent",
      agentType: "verification",
      agentSource: "built-in",
      status: "completed",
      description: "verification task",
      output: "done",
      metadata: {
        diffRef: "HEAD~1..HEAD",
      },
    });

    const result = await executeTool("TaskList", { kind: "background" }, context);

    expect(result.content).toContain(
      "@verification-no-verdict-list [completed] verification agent | diffRef HEAD~1..HEAD",
    );
    expect(result.content).not.toContain("verdict ");
  });

  it("TaskUpdate validates dependency changes before applying field updates", async () => {
    const context = await createTaskContext();
    const task = await context.tasks!.createTask({
      subject: "prepare release",
      description: "prepare release",
    });

    await expect(
      executeTool(
        "TaskUpdate",
        {
          taskId: task.id,
          subject: "mutated subject",
          addBlocks: ["missing-task"],
        },
        context,
      ),
    ).rejects.toThrow(/missing task/);

    const unchangedTask = await context.tasks!.getTask(task.id);
    expect(unchangedTask?.subject).toBe("prepare release");
  });

  it("TaskUpdate rejects dependency cycles", async () => {
    const context = await createTaskContext();
    const first = await context.tasks!.createTask({
      subject: "first",
      description: "first",
    });
    const second = await context.tasks!.createTask({
      subject: "second",
      description: "second",
    });
    const third = await context.tasks!.createTask({
      subject: "third",
      description: "third",
    });

    await executeTool("TaskUpdate", { taskId: first.id, addBlocks: [second.id] }, context);
    await executeTool("TaskUpdate", { taskId: second.id, addBlocks: [third.id] }, context);

    await expect(
      executeTool("TaskUpdate", { taskId: third.id, addBlocks: [first.id] }, context),
    ).rejects.toThrow(/create a cycle/);
  });

  it("TaskUpdate adds a verification nudge when closing out 3+ tasks without any verification lane", async () => {
    const context = await createTaskContext();
    const first = await context.tasks!.createTask({ subject: "first", description: "first" });
    const second = await context.tasks!.createTask({ subject: "second", description: "second" });
    const third = await context.tasks!.createTask({ subject: "third", description: "third" });

    await executeTool("TaskUpdate", { taskId: first.id, status: "completed" }, context);
    await executeTool("TaskUpdate", { taskId: second.id, status: "completed" }, context);
    const result = await executeTool("TaskUpdate", { taskId: third.id, status: "completed" }, context);

    expect(result.content).toContain("NOTE: You just closed out 3+ tasks");
    expect(result.content).toContain("RunVerification");
  });

  it("TaskUpdate does not add a verification nudge when a remote verification task is already present", async () => {
    const context = await createTaskContext();
    const first = await context.tasks!.createTask({ subject: "first", description: "first" });
    const second = await context.tasks!.createTask({ subject: "second", description: "second" });
    const third = await context.tasks!.createTask({ subject: "third", description: "third" });

    await context.tasks!.registerBackgroundTask({
      id: "remote-verify-running",
      taskType: "remote_agent",
      status: "running",
      description: "remote guard task",
      command: "Run checks remotely",
      metadata: {
        remoteTaskType: "verification",
        sessionId: "sess-verify-123",
      },
      output: "remote verifier started",
    });

    await executeTool("TaskUpdate", { taskId: first.id, status: "completed" }, context);
    await executeTool("TaskUpdate", { taskId: second.id, status: "completed" }, context);
    const result = await executeTool("TaskUpdate", { taskId: third.id, status: "completed" }, context);

    expect(result.content).not.toContain("NOTE: You just closed out 3+ tasks");
    expect(result.content).not.toContain("RunVerification");
  });

  it("TaskUpdate still adds a verification nudge when the only remote verification task already failed", async () => {
    const context = await createTaskContext();
    const first = await context.tasks!.createTask({ subject: "first", description: "first" });
    const second = await context.tasks!.createTask({ subject: "second", description: "second" });
    const third = await context.tasks!.createTask({ subject: "third", description: "third" });

    await context.tasks!.registerBackgroundTask({
      id: "remote-verify-failed",
      taskType: "remote_agent",
      status: "failed",
      description: "remote verification task",
      command: "Run checks remotely",
      metadata: {
        remoteTaskType: "verification",
        sessionId: "sess-verify-failed",
      },
      output: "remote verifier failed",
      error: "verification failed",
    });

    await executeTool("TaskUpdate", { taskId: first.id, status: "completed" }, context);
    await executeTool("TaskUpdate", { taskId: second.id, status: "completed" }, context);
    const result = await executeTool("TaskUpdate", { taskId: third.id, status: "completed" }, context);

    expect(result.content).toContain("NOTE: You just closed out 3+ tasks");
    expect(result.content).toContain("RunVerification");
  });

  it("TaskList marks runtime-restart-lost background tasks in summaries", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "bg-lost",
      taskType: "local_agent",
      status: "lost",
      description: "lost background task",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      output: "partial",
      error: BACKGROUND_TASK_RUNTIME_RESTART_ERROR,
    });

    const result = await executeTool("TaskList", {}, context);

    expect(result.content).toContain("lost after runtime restart");
  });

  it("TaskList background summaries include created and updated timestamps", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "bg-time",
      taskType: "local_agent",
      status: "running",
      description: "timed background task",
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      output: "",
    });

    const result = await executeTool("TaskList", {}, context);

    expect(result.content).toContain("created ");
    expect(result.content).toContain("updated ");
    expect(result.content).toContain("root E:\\claudecodejingiang\\vscode-extension");
    expect(result.content).toContain(
      "Background task counts: pending=0, running=1, completed=0, failed=0, lost=0, killed=0, cancelled=0",
    );
  });

  it("search_files uses ripgrep-backed matching and returns matching lines", async () => {
    const { context, root } = await createWorkspaceContext();
    await fs.writeFile(
      path.join(root, "example.txt"),
      "alpha\nbeta target line\ngamma\n",
      "utf8",
    );

    const result = await executeTool(
      "search_files",
      { query: "target line", path: "." },
      context,
    );

    expect(result.summary).toContain('Found 1 matches for "target line"');
    expect(result.content).toContain("example.txt:2: beta target line");
  });

  it("search_files returns no matches cleanly when ripgrep finds nothing", async () => {
    const { context, root } = await createWorkspaceContext();
    await fs.writeFile(
      path.join(root, "example.txt"),
      "alpha\nbeta\ngamma\n",
      "utf8",
    );

    const result = await executeTool(
      "search_files",
      { query: "missing token", path: "." },
      context,
    );

    expect(result.summary).toContain('Found 0 matches for "missing token"');
    expect(result.content).toContain("[no matches found]");
  });

  it("search_files truncates very large match sets", async () => {
    const { context, root } = await createWorkspaceContext();
    const lines = Array.from({ length: 2100 }, (_, index) => `match line ${index + 1}`).join("\n");
    await fs.writeFile(path.join(root, "many-matches.txt"), lines, "utf8");

    const result = await executeTool(
      "search_files",
      { query: "match line", path: "." },
      context,
    );

    expect(result.summary).toContain('Found at least 2000 matches for "match line"');
    expect(result.content).toContain("[truncated after 2000 matches]");
  });

  it("list_files refuses to scan more than the walk limit", async () => {
    const { context, root } = await createWorkspaceContext();
    const largeDir = path.join(root, "many-files");
    await fs.mkdir(largeDir, { recursive: true });

    await writeManyFiles(largeDir, 10001);

    await expect(
      executeTool("list_files", { path: "many-files" }, context),
    ).rejects.toThrow(/Refusing to scan more than 10000 files/);
  });

  it("list_files enforces the walk limit across nested directories", async () => {
    const { context, root } = await createWorkspaceContext();
    const parentDir = path.join(root, "nested-many-files");
    const dirA = path.join(parentDir, "a");
    const dirB = path.join(parentDir, "b");
    await fs.mkdir(dirA, { recursive: true });
    await fs.mkdir(dirB, { recursive: true });

    await writeManyFiles(dirA, 6000);
    await writeManyFiles(dirB, 4001);

    await expect(
      executeTool("list_files", { path: "nested-many-files" }, context),
    ).rejects.toThrow(/Refusing to scan more than 10000 files/);
  });

  it("list_files returns files in stable sorted order", async () => {
    const { context, root } = await createWorkspaceContext();
    await fs.writeFile(path.join(root, "b.txt"), "", "utf8");
    await fs.writeFile(path.join(root, "a.txt"), "", "utf8");

    const result = await executeTool("list_files", { path: "." }, context);
    const aIndex = result.content.indexOf("a.txt");
    const bIndex = result.content.indexOf("b.txt");

    expect(aIndex).toBeGreaterThanOrEqual(0);
    expect(bIndex).toBeGreaterThan(aIndex);
  });

  it("browser_screenshot forwards path and fullPage options to the browser adapter", async () => {
    const calls: Array<{ path?: string; fullPage?: boolean }> = [];
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      browser: {
        navigate: async () => ({ summary: "", content: "" }),
        snapshot: async () => ({ summary: "", content: "" }),
        click: async () => ({ summary: "", content: "" }),
        type: async () => ({ summary: "", content: "" }),
        waitFor: async () => ({ summary: "", content: "" }),
        screenshot: async input => {
          calls.push(input);
          return { summary: "Saved browser screenshot", content: "ok" };
        },
        close: async () => ({ summary: "", content: "" }),
      },
    };

    const result = await executeTool(
      "browser_screenshot",
      { path: ".cain-artifacts/browser/test.png", fullPage: true },
      context,
    );

    expect(calls).toEqual([{ path: ".cain-artifacts/browser/test.png", fullPage: true }]);
    expect(result.summary).toContain("Saved browser screenshot");
  });

  it("browser_type forwards textTarget, value, and submit options to the browser adapter", async () => {
    const calls: Array<{
      ref?: string;
      selector?: string;
      textTarget?: string;
      value: string;
      submit?: boolean;
    }> = [];
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      browser: {
        navigate: async () => ({ summary: "", content: "" }),
        snapshot: async () => ({ summary: "", content: "" }),
        click: async () => ({ summary: "", content: "" }),
        type: async input => {
          calls.push(input);
          return { summary: "Typed into browser field", content: "ok" };
        },
        waitFor: async () => ({ summary: "", content: "" }),
        screenshot: async () => ({ summary: "", content: "" }),
        close: async () => ({ summary: "", content: "" }),
      },
    };

    const result = await executeTool(
      "browser_type",
      { textTarget: "Search", value: "hello", submit: true },
      context,
    );

    expect(calls).toEqual([{ textTarget: "Search", value: "hello", submit: true }]);
    expect(result.summary).toContain("Typed into browser field");
  });

  it("LSP rejects unsupported operations and missing file-backed inputs", async () => {
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      lsp: {
        query: async () => ({ summary: "", content: "" }),
      },
    };

    await expect(
      executeTool("LSP", { operation: "unknownOperation" }, context),
    ).rejects.toThrow(/Unsupported LSP operation/);

    await expect(
      executeTool("LSP", { operation: "goToDefinition" }, context),
    ).rejects.toThrow(/filePath is required/);

    await expect(
      executeTool("LSP", { operation: "workspaceSymbols" }, context),
    ).resolves.toEqual({ summary: "", content: "" });
  });

  it("LSP forwards normalized query input to the lsp adapter", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      lsp: {
        query: async input => {
          calls.push(input as Record<string, unknown>);
          return { summary: "ok", content: "done" };
        },
      },
    };

    const result = await executeTool(
      "LSP",
      {
        operation: "goToDefinition",
        filePath: "src/agent/agentRunner.ts",
        line: 10,
        character: 5,
      },
      context,
    );

    expect(calls).toEqual([
      {
        operation: "goToDefinition",
        filePath: "src/agent/agentRunner.ts",
        line: 10,
        character: 5,
        query: undefined,
      },
    ]);
    expect(result.summary).toBe("ok");
    expect(result.content).toBe("done");
  });

  it("LSP forwards an empty workspaceSymbols query when omitted", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      lsp: {
        query: async input => {
          calls.push(input as Record<string, unknown>);
          return { summary: "workspace symbols", content: "all symbols" };
        },
      },
    };

    const result = await executeTool(
      "LSP",
      {
        operation: "workspaceSymbols",
      },
      context,
    );

    expect(calls).toEqual([
      {
        operation: "workspaceSymbols",
        filePath: undefined,
        line: undefined,
        character: undefined,
        query: "",
      },
    ]);
    expect(result.summary).toBe("workspace symbols");
    expect(result.content).toBe("all symbols");
  });

  it("fetch_url rejects invalid and unsupported URLs", async () => {
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
    };

    await expect(executeTool("fetch_url", { url: "not-a-url" }, context)).rejects.toThrow(
      /Invalid URL/,
    );

    await expect(executeTool("fetch_url", { url: "file:///tmp/demo.txt" }, context)).rejects.toThrow(
      /Unsupported URL protocol/,
    );
  });

  it("fetch_url normalizes HTML responses before returning content", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      ({
        ok: true,
        headers: {
          get: (name: string) => (name === "content-type" ? "text/html; charset=utf-8" : null),
        },
        text: async () => "<html><body><h1>Hello</h1><p>world</p></body></html>",
      }) as any) as typeof fetch;

    try {
      const result = await executeTool(
        "fetch_url",
        { url: "https://example.com" },
        { workspaceRoot: "E:\\claudecodejingiang\\vscode-extension" },
      );

      expect(result.summary).toContain("Fetched https://example.com/");
      expect(result.content).toContain("Hello world");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("WebFetch returns a follow-up redirect instruction when the host changes", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      ({
        ok: false,
        status: 302,
        headers: {
          get: (name: string) =>
            name.toLowerCase() === "location" ? "https://docs.example.org/guide" : null,
        },
        text: async () => "",
      }) as any) as typeof fetch;

    try {
      const result = await executeTool(
        "WebFetch",
        { url: "https://example.com/guide", prompt: "Summarize the page." },
        { workspaceRoot: "E:\\claudecodejingiang\\vscode-extension" },
      );

      expect(result.summary).toContain("WebFetch redirect");
      expect(result.content).toContain("REDIRECT DETECTED");
      expect(result.content).toContain('url: "https://docs.example.org/guide"');
      expect(result.content).toContain('prompt: "Summarize the page."');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("WebFetch follows same-host redirects and upgrades http urls before returning content", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    const userAgents: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(url);
      if (typeof input !== "string" && !(input instanceof URL)) {
        userAgents.push(input.headers.get("User-Agent") || "");
      }

      if (calls.length === 1) {
        return {
          ok: false,
          status: 301,
          headers: {
            get: (name: string) =>
              name.toLowerCase() === "location" ? "https://example.com/docs" : null,
          },
          text: async () => "",
        } as any;
      }

      return {
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name === "content-type" ? "text/html; charset=utf-8" : null),
        },
        text: async () => "<html><body><h1>Hello</h1><p>world</p></body></html>",
      } as any;
    }) as typeof fetch;

    try {
      const result = await executeTool(
        "WebFetch",
        { url: "http://example.com/docs", prompt: "Summarize the page." },
        { workspaceRoot: "E:\\claudecodejingiang\\vscode-extension" },
      );

      expect(calls).toEqual([
        "https://example.com/docs",
        "https://example.com/docs",
      ]);
      expect(userAgents.every(value => value.includes("Mozilla/5.0"))).toBe(true);
      expect(result.summary).toContain("Fetched https://example.com/docs");
      expect(result.content).toContain("Use only the fetched content below to answer this extraction request");
      expect(result.content).toContain("Headings:");
      expect(result.content).toContain("- Hello");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("WebFetch uses runtime extraction when available for html content", async () => {
    const originalFetch = globalThis.fetch;
    const extractWebContent = vi.fn(async () => "Main sections: logo, search box, nav, login.");
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name === "content-type" ? "text/html; charset=utf-8" : null),
        },
        text: async () => "<html><body><h1>Site</h1><style>.a{color:red}</style><p>Search here</p></body></html>",
      }) as any) as typeof fetch;

    try {
      const result = await executeTool(
        "WebFetch",
        { url: "https://example.com", prompt: "Summarize the main sections." },
        {
          workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
          extractWebContent,
        },
      );

      expect(extractWebContent).toHaveBeenCalledTimes(1);
      expect(result.content).toContain("Main sections: logo, search box, nav, login.");
      expect(result.content).not.toContain("Fetched content:");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("WebSearch rejects conflicting domain filters", async () => {
    await expect(
      executeTool(
        "WebSearch",
        {
          query: "latest react docs",
          allowed_domains: ["react.dev"],
          blocked_domains: ["example.com"],
        },
        { workspaceRoot: "E:\\claudecodejingiang\\vscode-extension" },
      ),
    ).rejects.toThrow(/Cannot specify both allowed_domains and blocked_domains/);
  });

  it("WebSearch returns parsed links and preserves source reminder semantics", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    const userAgents: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(url);
      if (typeof input !== "string" && !(input instanceof URL)) {
        userAgents.push(input.headers.get("User-Agent") || "");
      }

      return {
        ok: true,
        status: 200,
        headers: {
          get: () => "text/html; charset=utf-8",
        },
        text: async () => `
          <html>
            <body>
              <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Freact.dev%2Flearn">React Learn</a>
              <a class="result__a" href="https://nextjs.org/docs">Next.js Docs</a>
            </body>
          </html>
        `,
      } as any;
    }) as typeof fetch;

    try {
      const result = await executeTool(
        "WebSearch",
        {
          query: "latest react docs",
          allowed_domains: ["react.dev"],
        },
        { workspaceRoot: "E:\\claudecodejingiang\\vscode-extension" },
      );

      expect(calls[0]).toContain("duckduckgo.com/html/");
      expect(calls[0]).toContain(encodeURIComponent("latest react docs site:react.dev"));
      expect(userAgents.every(value => value.includes("Mozilla/5.0"))).toBe(true);
      expect(result.summary).toContain('Searched the web for "latest react docs"');
      expect(result.content).toContain('Web search results for query: "latest react docs"');
      expect(result.content).toContain('"title":"React Learn"');
      expect(result.content).toContain('"url":"https://react.dev/learn"');
      expect(result.content).toContain("Search provider: duckduckgo");
      expect(result.content).toContain("REMINDER: You MUST include the sources above");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("WebSearch falls back to Bing when DuckDuckGo is unavailable", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    let invocation = 0;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(url);
      invocation += 1;

      if (invocation === 1) {
        throw new TypeError("fetch failed");
      }

      return {
        ok: true,
        status: 200,
        headers: {
          get: () => "text/html; charset=utf-8",
        },
        text: async () => `
          <html>
            <body>
              <li class="b_algo">
                <h2><a href="https://react.dev/reference/react">React Reference</a></h2>
              </li>
            </body>
          </html>
        `,
      } as any;
    }) as typeof fetch;

    try {
      const result = await executeTool(
        "WebSearch",
        {
          query: "latest react docs",
          allowed_domains: ["react.dev"],
        },
        { workspaceRoot: "E:\\claudecodejingiang\\vscode-extension" },
      );

      expect(calls[0]).toContain("duckduckgo.com/html/");
      expect(calls[1]).toContain("cn.bing.com/search?");
      expect(result.content).toContain('"title":"React Reference"');
      expect(result.content).toContain('"url":"https://react.dev/reference/react"');
      expect(result.content).toContain("Search provider: bing");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("WebSearch falls back to allowed domain homepage links when provider hits are empty", async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];
    let invocation = 0;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(url);
      invocation += 1;

      if (invocation === 1) {
        throw new TypeError("fetch failed");
      }

      if (invocation === 2) {
        return {
          ok: true,
          status: 200,
          headers: {
            get: () => "text/html; charset=utf-8",
          },
          text: async () => `
            <html>
              <body>
                <li class="b_algo">
                  <h2 class=""><a href="https://example.org/off-topic">Off Topic</a></h2>
                </li>
              </body>
            </html>
          `,
        } as any;
      }

      return {
        ok: true,
        status: 200,
        headers: {
          get: () => "text/html; charset=utf-8",
        },
        text: async () => `
          <html>
            <body>
              <a href="/learn">Learn React</a>
              <a href="/reference/react">API Reference</a>
            </body>
          </html>
        `,
      } as any;
    }) as typeof fetch;

    try {
      const result = await executeTool(
        "WebSearch",
        {
          query: "latest react docs",
          allowed_domains: ["react.dev"],
        },
        { workspaceRoot: "E:\\claudecodejingiang\\vscode-extension" },
      );

      expect(calls[0]).toContain("duckduckgo.com/html/");
      expect(calls[1]).toContain("cn.bing.com/search?");
      expect(calls[2]).toBe("https://react.dev/");
      expect(result.content).toContain('"title":"Learn React"');
      expect(result.content).toContain('"url":"https://react.dev/learn"');
      expect(result.content).toContain('"title":"API Reference"');
      expect(result.content).toContain('"url":"https://react.dev/reference/react"');
      expect(result.content).toContain("Search provider: bing");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("TaskList surfaces diffRef in review background task summary", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "review-diffref",
      taskType: "built_in_agent",
      agentType: "review",
      agentSource: "built-in",
      agentColor: "blue",
      status: "completed",
      description: "review diff task",
      metadata: { diffRef: "main...HEAD" },
      output: "done",
    });

    const result = await executeTool("TaskList", { kind: "background" }, context);

    expect(result.content).toContain("@review-diffref [completed] review agent | diffRef main...HEAD");
  });

  it("TaskList, TaskGet, and TaskOutput surface review PR number provenance", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "review-pr-number",
      taskType: "built_in_agent",
      agentType: "review",
      agentSource: "built-in",
      agentColor: "blue",
      status: "completed",
      description: "review PR task",
      metadata: { reviewPrNumber: "123" },
      output: "done",
    });

    const listResult = await executeTool("TaskList", { kind: "background" }, context);
    const getResult = await executeTool("TaskGet", { taskId: "review-pr-number" }, context);
    const outputResult = await executeTool("TaskOutput", { task_id: "review-pr-number" }, context);

    expect(listResult.content).toContain("@review-pr-number [completed] review agent | pr #123");
    expect(getResult.content).toContain("<review_pr_number>123</review_pr_number>");
    expect(outputResult.content).toContain("<review_pr_number>123</review_pr_number>");
  });

  it("TaskGet and TaskOutput surface diffRef for verification background tasks", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "verify-diffref",
      taskType: "built_in_agent",
      agentType: "verification",
      agentSource: "built-in",
      agentColor: "red",
      status: "completed",
      description: "verify diff task",
      metadata: { diffRef: "HEAD~3..HEAD", verificationVerdict: "PASS" },
      output: "VERDICT: PASS",
    });

    const getResult = await executeTool("TaskGet", { taskId: "verify-diffref" }, context);
    const outputResult = await executeTool("TaskOutput", { task_id: "verify-diffref" }, context);

    expect(getResult.content).toContain("<diff_ref>HEAD~3..HEAD</diff_ref>");
    expect(getResult.content).toContain("<metadata>");
    expect(outputResult.content).toContain("<diff_ref>HEAD~3..HEAD</diff_ref>");
    expect(outputResult.content).toContain("<metadata>");
  });

  it("diffRef is absent from TaskList and TaskOutput when not set", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "review-no-diffref",
      taskType: "built_in_agent",
      agentType: "review",
      agentSource: "built-in",
      agentColor: "blue",
      status: "completed",
      description: "review no diff task",
      metadata: { originalTask: "check the code" },
      output: "done",
    });

    const listResult = await executeTool("TaskList", { kind: "background" }, context);
    const outputResult = await executeTool("TaskOutput", { task_id: "review-no-diffref" }, context);

    expect(listResult.content).not.toContain("diffRef");
    expect(outputResult.content).not.toContain("<diff_ref>");
    expect(outputResult.content).toContain("<metadata>");
    expect(outputResult.content).toContain("check the code");
  });

  it("EnterWorktree returns a created-worktree summary", async () => {
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      worktree: {
        ensureHydrated: async () => undefined,
        getSession: () => null,
        getEffectiveWorkspaceRoot: () => "E:\\claudecodejingiang\\vscode-extension",
        enterWorktree: async () => ({
          originalWorkspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
          gitRoot: "E:\\claudecodejingiang\\vscode-extension",
          worktreePath: "E:\\claudecodejingiang\\vscode-extension\\.claude\\worktrees\\wt-demo",
          worktreeName: "wt-demo",
          worktreeBranch: "worktree-wt-demo",
          createdAt: Date.now(),
        }),
        exitWorktree: async () => {
          throw new Error("not used");
        },
      },
    };

    const result = await executeTool("EnterWorktree", { name: "wt-demo" }, context);

    expect(result.summary).toBe("Entered worktree wt-demo");
    expect(result.content).toContain("Created worktree at");
    expect(result.content).toContain("Use ExitWorktree to leave it later.");
  });

  it("EnterWorktree rejects worker invocations", async () => {
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      invokerKind: "worker",
      worktree: {
        ensureHydrated: async () => undefined,
        getSession: () => null,
        getEffectiveWorkspaceRoot: () => "E:\\claudecodejingiang\\vscode-extension",
        enterWorktree: async () => {
          throw new Error("should not be called");
        },
        exitWorktree: async () => {
          throw new Error("should not be called");
        },
      },
    };

    await expect(
      executeTool("EnterWorktree", { name: "wt-worker" }, context),
    ).rejects.toThrow("EnterWorktree is only available to the main session.");
  });

  it("ExitWorktree reports a no-op summary when no session is active", async () => {
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      worktree: {
        ensureHydrated: async () => undefined,
        getSession: () => null,
        getEffectiveWorkspaceRoot: () => "E:\\claudecodejingiang\\vscode-extension",
        enterWorktree: async () => {
          throw new Error("not used");
        },
        exitWorktree: async () => ({
          action: "remove",
          originalWorkspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
          worktreePath: "E:\\claudecodejingiang\\vscode-extension",
          message:
            "No-op: there is no active EnterWorktree session to exit. This tool only operates on worktrees created by EnterWorktree in the current conversation.",
        }),
      },
    };

    const result = await executeTool("ExitWorktree", { action: "remove" }, context);

    expect(result.summary).toBe("No active worktree session");
    expect(result.content).toContain("No-op: there is no active EnterWorktree session to exit.");
  });

  it("ExitWorktree rejects worker invocations", async () => {
    const context: ToolContext = {
      workspaceRoot: "E:\\claudecodejingiang\\vscode-extension",
      invokerKind: "worker",
      worktree: {
        ensureHydrated: async () => undefined,
        getSession: () => null,
        getEffectiveWorkspaceRoot: () => "E:\\claudecodejingiang\\vscode-extension",
        enterWorktree: async () => {
          throw new Error("should not be called");
        },
        exitWorktree: async () => {
          throw new Error("should not be called");
        },
      },
    };

    await expect(
      executeTool("ExitWorktree", { action: "keep" }, context),
    ).rejects.toThrow("ExitWorktree is only available to the main session.");
  });

  it("remote background tasks survive runtime reload and surface remote metadata", async () => {
    const { context, storageRoot } = await createTaskContextWithStorageRoot();
    await context.tasks!.registerBackgroundTask({
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

    context.tasks = new PersistentTaskRuntimeStore(storageRoot).getConversationRuntime(
      "E:\\claudecodejingiang\\vscode-extension",
      "tool-runtime-test",
    );

    const getResult = await executeTool("TaskGet", { taskId: "remote-review" }, context);
    const listResult = await executeTool("TaskList", { kind: "background" }, context);
    const outputResult = await executeTool(
      "TaskOutput",
      { task_id: "remote-review", block: false },
      context,
    );

    expect(getResult.summary).toContain("not ready yet");
    expect(getResult.content).toContain("<task_type>remote_agent</task_type>");
    expect(getResult.content).toContain("<prompt>Review PR #42 remotely</prompt>");
    expect(getResult.content).toContain("<remote_task_type>ultrareview</remote_task_type>");
    expect(getResult.content).toContain("<session_id>sess-123</session_id>");
    expect(getResult.content).toContain(
      "<session_url>https://claude.ai/code/sessions/sess-123</session_url>",
    );
    expect(getResult.content).not.toContain("<runtime_state>lost_after_restart</runtime_state>");

    expect(listResult.content).toContain(
      "@remote-review [running] remote review task | remote ultrareview | command Review PR #42 remotely | session sess-123",
    );
    expect(listResult.content).not.toContain("| prompt Review PR #42 remotely");

    expect(outputResult.summary).toContain("not ready yet");
    expect(outputResult.content).toContain("<task_type>remote_agent</task_type>");
    expect(outputResult.content).toContain("<remote_task_type>ultrareview</remote_task_type>");
    expect(outputResult.content).not.toContain("<runtime_state>lost_after_restart</runtime_state>");
  });

  it("TaskList falls back to sessionUrl when remote sessionId is unavailable", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "remote-session-url-only",
      taskType: "remote_agent",
      status: "running",
      description: "remote url only task",
      command: "Observe remote work",
      metadata: {
        remoteTaskType: "verification",
        sessionUrl: "https://claude.ai/code/sessions/url-only-456",
      },
      output: "remote task started",
    });

    const result = await executeTool("TaskList", { kind: "background" }, context);

    expect(result.content).toContain(
      "@remote-session-url-only [running] remote url only task | remote verification | command Observe remote work | session https://claude.ai/code/sessions/url-only-456",
    );
  });

  it("TaskList surfaces command provenance for local background tasks", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "build-command-task",
      taskType: "local_agent",
      status: "running",
      description: "background build",
      command: "npm run build -- --watch",
      output: "partial",
    });

    const result = await executeTool("TaskList", { kind: "background" }, context);

    expect(result.content).toContain(
      "@build-command-task [running] background build | command npm run build -- --watch",
    );
  });

  it("TaskList surfaces prompt provenance from originalTask fallback for built-in tasks", async () => {
    const context = await createTaskContext();
    await context.tasks!.registerBackgroundTask({
      id: "review-prompt-task",
      taskType: "built_in_agent",
      agentType: "review",
      agentSource: "built-in",
      status: "completed",
      description: "review task",
      metadata: { originalTask: "/review main...HEAD focus on auth regressions" },
      output: "done",
    });

    const result = await executeTool("TaskList", { kind: "background" }, context);

    expect(result.content).toContain(
      "@review-prompt-task [completed] review agent | prompt /review main...HEAD focus on auth regressions",
    );
  });

});
